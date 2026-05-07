import { existsSync } from "node:fs";
import path from "node:path";

import type {
  PerformanceComparisonDetail,
  PerformanceFileDetail,
  PerformanceFileSyncIssue,
  PerformanceReapprovalFileSummary,
  PerformanceOverviewRow,
  PerformanceOverviewSiteGroup,
  PerformanceOverviewSnapshot
} from "../../shared/domain/performance-file";
import { isPoolSubstitutePerformanceEntry } from "../../shared/domain/performance-file";
import type {
  PerformanceComparisonQuery,
  PerformanceOverviewQuery
} from "../../shared/bridge/contracts";
import { getLatestAllowanceCalculationByApprovalId } from "./approved-allowance-calculation-service";
import { listHiddenApprovedPerformanceRows } from "./performance-approved-row-visibility-service";
import { resolvePerformanceEntryApprovalState } from "./performance-approval-resolution-service";
import {
  getLatestPerformanceApprovalByLogicalKey,
  listLatestPerformanceApprovalsByLogicalKey
} from "./performance-approval-service";
import {
  syncApprovedPerformanceFilesToStorage,
  syncPendingPerformanceFilesToStorage
} from "./performance-file-intake-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  listStoredPerformanceFileReferences,
  type StoredPerformanceFileReference
} from "./performance-file-storage-service";

const directoryPriority: Record<PerformanceOverviewRow["sourceDirectoryType"], number> = {
  pending: 0,
  approved: 1,
  unknown: 2
};

const sectionPriority: Record<PerformanceOverviewRow["entry"]["section"], number> = {
  substitute: 0,
  overtime: 1,
  "legal-holiday": 2
};

const toLogicalKey = (value?: string | null) => value?.trim() || "";

const changeLockedReason = "품의승인 완료 수당은 재승인으로 변경할 수 없습니다.";

const manualHourlyRatePattern = /시급 임의지정\s+([\d,]+)원/;

const parseManualHourlyRate = (comment?: string) => {
  const matched = comment?.match(manualHourlyRatePattern)?.[1];

  if (!matched) {
    return null;
  }

  const parsed = Number(matched.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const hasBlockingApprovalIssue = (entry: PerformanceFileDetail["entries"][number]) =>
  !entry.hourlyRate || entry.hourlyRate <= 0 || entry.alerts.some((alert) => alert.severity === "error");

const matchesApprovalScope = (
  detail: PerformanceFileDetail,
  approvalScope: NonNullable<PerformanceOverviewQuery["approvalScope"]>
) => {
  if (approvalScope === "approved") {
    return detail.directoryType === "approved";
  }

  return detail.directoryType === "pending";
};

const emptyOverviewSyncIssue = (input: {
  filePath: string;
  message: string;
  directoryType?: PerformanceFileSyncIssue["directoryType"];
}): PerformanceFileSyncIssue => ({
  filePath: input.filePath,
  fileName: path.basename(input.filePath) || input.filePath,
  directoryType: input.directoryType ?? "unknown",
  severity: "warning",
  message: input.message
});

const isPathInsideDirectory = (filePath: string, directoryPath: string) => {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(filePath));

  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
};

const isExistingPendingFile = (
  detail: Pick<PerformanceFileDetail, "filePath" | "directoryType">,
  pendingDir?: string
) =>
  detail.directoryType === "pending" &&
  existsSync(detail.filePath) &&
  (!pendingDir || isPathInsideDirectory(detail.filePath, pendingDir));

const compareRows = (left: PerformanceOverviewRow, right: PerformanceOverviewRow) =>
  sectionPriority[left.entry.section] - sectionPriority[right.entry.section] ||
  left.entry.workDate.localeCompare(right.entry.workDate) ||
  left.entry.employeeName.localeCompare(right.entry.employeeName, "ko") ||
  left.sourceReceivedAt.localeCompare(right.sourceReceivedAt);

const shouldReplaceRow = (current: PerformanceOverviewRow, candidate: PerformanceOverviewRow) => {
  const currentPriority = directoryPriority[current.sourceDirectoryType];
  const candidatePriority = directoryPriority[candidate.sourceDirectoryType];

  if (candidatePriority !== currentPriority) {
    return candidatePriority < currentPriority;
  }

  if (candidate.sourceReceivedAt !== current.sourceReceivedAt) {
    return candidate.sourceReceivedAt > current.sourceReceivedAt;
  }

  return compareRows(candidate, current) < 0;
};

const isCompletedInCurrentReapprovalCycle = (
  detail: Pick<PerformanceFileDetail, "id" | "receivedAt">,
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
) =>
  Boolean(
    latestApproval &&
      latestApproval.fileId === detail.id &&
      latestApproval.processedAt >= detail.receivedAt
  );

const getLatestAllowanceCalculationForApproval = (
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
) =>
  latestApproval?.decision === "approved"
    ? getLatestAllowanceCalculationByApprovalId(latestApproval.id)
    : null;

const isChangeLockedApproval = (
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
) => getLatestAllowanceCalculationForApproval(latestApproval)?.status === "proposal-approved";

const getVisiblePerformanceEntries = (detail: Pick<PerformanceFileDetail, "entries">) =>
  detail.entries.filter((entry) => !isPoolSubstitutePerformanceEntry(entry));

const hasPriorApprovedContentForPendingFile = (
  detail: Pick<PerformanceFileDetail, "id" | "entries" | "directoryType" | "status">,
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>
) =>
  detail.directoryType === "pending" &&
  (
    detail.status === "rejected" ||
    getVisiblePerformanceEntries(detail).some((entry) => {
      const latestApproval = latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null;
      return latestApproval?.decision === "approved" && latestApproval.fileId !== detail.id;
    })
  );

const hasApprovedArchiveForSchedule = (
  detail: Pick<PerformanceFileDetail, "id" | "scheduleKey" | "directoryType">,
  details: StoredPerformanceFileReference[]
) =>
  detail.directoryType === "pending" &&
  Boolean(
    detail.scheduleKey &&
      details.some(
        (item) =>
          item.id !== detail.id &&
          item.scheduleKey === detail.scheduleKey &&
          item.directoryType === "approved" &&
          item.status === "approved"
      )
  );

const isPendingReapprovalFile = (
  detail: Pick<PerformanceFileDetail, "id" | "entries" | "directoryType" | "status" | "scheduleKey">,
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>,
  details: StoredPerformanceFileReference[]
) =>
  hasPriorApprovedContentForPendingFile(detail, latestApprovals) ||
  hasApprovedArchiveForSchedule(detail, details);

const resolveApprovedRowHideState = (input: {
  detail: Pick<PerformanceFileDetail, "directoryType" | "id">;
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>;
  approvalStatus: PerformanceOverviewRow["approvalStatus"];
}) => {
  if (input.detail.directoryType !== "approved") {
    return {
      canHideApprovedRow: false,
      hideApprovedRowBlockedReason: "승인완료 보관본만 목록에서 숨길 수 있습니다."
    };
  }

  if (input.approvalStatus !== "approved") {
    return {
      canHideApprovedRow: false,
      hideApprovedRowBlockedReason: "승인완료 상태의 행만 목록에서 숨길 수 있습니다."
    };
  }

  if (!input.latestApproval || input.latestApproval.fileId !== input.detail.id) {
    return {
      canHideApprovedRow: false,
      hideApprovedRowBlockedReason: "최신 승인 이력을 찾을 수 없어 목록에서 숨길 수 없습니다."
    };
  }

  if (getLatestAllowanceCalculationByApprovalId(input.latestApproval.id)) {
    return {
      canHideApprovedRow: false,
      hideApprovedRowBlockedReason: "품의 이력이 연결된 승인 행은 목록에서 숨길 수 없습니다."
    };
  }

  return {
    canHideApprovedRow: true,
    hideApprovedRowBlockedReason: undefined
  };
};

const buildOverviewRow = (
  detail: PerformanceFileDetail,
  entry: PerformanceFileDetail["entries"][number],
  options?: {
    isReapprovalFile?: boolean;
    latestApproval?: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey> | null;
    sourceFileExists?: boolean;
  }
) => {
  const latestApproval =
    options && "latestApproval" in options
      ? options.latestApproval ?? null
      : getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
  const latestAllowanceCalculation = getLatestAllowanceCalculationForApproval(latestApproval);
  const isChangeLocked = latestAllowanceCalculation?.status === "proposal-approved";
  const latestApprovalManualHourlyRate = parseManualHourlyRate(latestApproval?.comment);
  const latestApprovalUsedManualRate = Boolean(latestApprovalManualHourlyRate);
  const resolvedApproval = resolvePerformanceEntryApprovalState({
    entry,
    latestApproval
  });
  const approvalStatus =
    latestAllowanceCalculation?.status === "rejected"
      ? "rejected"
      : detail.directoryType === "approved"
      ? "approved"
      : resolvedApproval.approvalStatus;
  const displayEntry =
    (detail.directoryType === "approved" || latestApprovalUsedManualRate) && resolvedApproval.approvedEntry
      ? {
          ...resolvedApproval.approvedEntry,
          status: "approved" as const,
          latestApprovalAt: resolvedApproval.latestApprovalAt,
          latestApprovalByName: resolvedApproval.latestApprovalByName
        }
      : {
          ...entry,
          status: resolvedApproval.approvalStatus,
          latestApprovalAt: resolvedApproval.latestApprovalAt,
          latestApprovalByName: resolvedApproval.latestApprovalByName
        };

  return {
    rowId: `${detail.id}:${entry.id}`,
    fileId: detail.id,
    entryId: entry.id,
    logicalKey: entry.logicalKey,
    sourceFileName: detail.fileName,
    sourceFileExists: options?.sourceFileExists ?? existsSync(detail.filePath),
    sourceDirectoryType: detail.directoryType,
    sourceReceivedAt: detail.receivedAt,
    entry: displayEntry,
    approvalStatus,
    canApprove:
      !isChangeLocked &&
      detail.directoryType === "pending" &&
      resolvedApproval.approvalStatus === "pending" &&
      !resolvedApproval.needsReapproval &&
      !hasBlockingApprovalIssue(entry),
    needsReapproval:
      !isChangeLocked && detail.directoryType === "pending" && resolvedApproval.needsReapproval,
    reapprovalStatus:
      detail.directoryType === "pending" && options?.isReapprovalFile
        ? isChangeLocked
          ? "locked"
          : isCompletedInCurrentReapprovalCycle(detail, latestApproval)
          ? "completed"
          : "pending"
        : "none",
    isChangeLocked,
    changeLockedReason: isChangeLocked ? changeLockedReason : undefined,
    latestApprovalId: latestApproval?.id,
    latestApprovalAt: resolvedApproval.latestApprovalAt,
    latestApprovalByName: resolvedApproval.latestApprovalByName,
    latestApprovalFileId: latestApproval?.fileId,
    latestApprovalComment: latestApproval?.comment,
    latestApprovalUsedManualRate,
    latestApprovalManualHourlyRate: latestApprovalManualHourlyRate ?? undefined,
    ...resolveApprovedRowHideState({
      detail,
      latestApproval,
      approvalStatus
    })
  } satisfies PerformanceOverviewRow;
};

const buildReapprovalFileSummaries = (
  details: PerformanceFileDetail[],
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>,
  referenceDetails: StoredPerformanceFileReference[]
): PerformanceReapprovalFileSummary[] =>
  details
    .filter(
      (detail) =>
        getVisiblePerformanceEntries(detail).length > 0 &&
        isPendingReapprovalFile(detail, latestApprovals, referenceDetails)
    )
    .map((detail) => {
      const visibleEntries = getVisiblePerformanceEntries(detail);
      const entryStates = visibleEntries.map((entry) => {
        const latestApproval = latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null;

        return {
          entry,
          latestApproval,
          isChangeLocked: isChangeLockedApproval(latestApproval),
          resolved: resolvePerformanceEntryApprovalState({
            entry,
            latestApproval
          })
        };
      });
      const lockedEntryCount = entryStates.filter((item) => item.isChangeLocked).length;
      const changeableEntryCount = Math.max(visibleEntries.length - lockedEntryCount, 0);
      const reapprovalCompletedCount = entryStates.filter(
        (item) =>
          !item.isChangeLocked &&
          isCompletedInCurrentReapprovalCycle(detail, item.latestApproval)
      ).length;
      const currentCycleApprovedEntryCount = lockedEntryCount + reapprovalCompletedCount;
      const needsReapprovalCount = entryStates.filter(
        (item) => !item.isChangeLocked && item.resolved.needsReapproval
      ).length;

      return {
        fileId: detail.id,
        fileName: detail.fileName,
        scheduleKey: detail.scheduleKey ?? "",
        scheduleMonth: detail.scheduleMonth ?? "",
        siteName: detail.siteName ?? "",
        receivedAt: detail.receivedAt,
        entryCount: visibleEntries.length,
        resolvedApprovedEntryCount: currentCycleApprovedEntryCount,
        remainingEntryCount: Math.max(visibleEntries.length - currentCycleApprovedEntryCount, 0),
        reapprovalCompletedCount,
        reapprovalPendingCount: Math.max(changeableEntryCount - reapprovalCompletedCount, 0),
        lockedEntryCount,
        needsReapprovalCount,
        canFinalize: currentCycleApprovedEntryCount === visibleEntries.length
      } satisfies PerformanceReapprovalFileSummary;
    })
    .sort(
      (left, right) =>
        left.siteName.localeCompare(right.siteName, "ko") ||
        right.receivedAt.localeCompare(left.receivedAt) ||
        left.fileName.localeCompare(right.fileName, "ko")
    );

const buildOverviewSnapshot = (
  rows: PerformanceOverviewRow[],
  reapprovalFiles: PerformanceReapprovalFileSummary[],
  syncIssues: PerformanceFileSyncIssue[]
): PerformanceOverviewSnapshot => {
  const groupMap = new Map<string, PerformanceOverviewRow[]>();

  rows.forEach((row) => {
    const siteName = row.entry.siteName || "미지정 근무지";
    const bucket = groupMap.get(siteName) ?? [];
    bucket.push(row);
    groupMap.set(siteName, bucket);
  });

  const groups: PerformanceOverviewSiteGroup[] = [...groupMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "ko"))
    .map(([siteName, siteRows]) => {
      const sortedRows = [...siteRows].sort(compareRows);

      return {
        siteName,
        rowCount: sortedRows.length,
        approvedCount: sortedRows.filter((row) => row.approvalStatus === "approved").length,
        pendingCount: sortedRows.filter((row) => row.approvalStatus === "pending").length,
        rejectedCount: sortedRows.filter((row) => row.approvalStatus === "rejected").length,
        approvableCount: sortedRows.filter((row) => row.canApprove).length,
        needsReapprovalCount: sortedRows.filter((row) => row.needsReapproval).length,
        changeLockedCount: sortedRows.filter((row) => row.isChangeLocked).length,
        alertCount: sortedRows.reduce((sum, row) => sum + row.entry.alerts.length, 0),
        rows: sortedRows
      };
    });

  return {
    groups,
    reapprovalFiles,
    syncIssues,
    siteCount: groups.length,
    rowCount: rows.length,
    approvedCount: rows.filter((row) => row.approvalStatus === "approved").length,
    pendingCount: rows.filter((row) => row.approvalStatus === "pending").length,
    rejectedCount: rows.filter((row) => row.approvalStatus === "rejected").length,
    approvableCount: rows.filter((row) => row.canApprove).length,
    needsReapprovalCount: rows.filter((row) => row.needsReapproval).length,
    changeLockedCount: rows.filter((row) => row.isChangeLocked).length
  };
};

export const listPerformanceOverview = async (
  query: PerformanceOverviewQuery = {},
  settings?: { pendingDir: string; approvedDir: string }
): Promise<PerformanceOverviewSnapshot> => {
  const approvalScope = query.approvalScope === "approved" ? "approved" : "pending";
  const section = query.section ?? "all";
  const syncIssues: PerformanceFileSyncIssue[] = [];

  if (approvalScope === "approved" && !query.scheduleMonth) {
    return buildOverviewSnapshot(
      [],
      [],
      [
        emptyOverviewSyncIssue({
          filePath: settings?.approvedDir ?? "승인완료 보관본",
          directoryType: "approved",
          message: "승인완료 보관본은 연도와 월을 선택한 뒤 조회할 수 있습니다."
        })
      ]
    );
  }

  if (settings && (approvalScope === "pending" || Boolean(query.scheduleMonth))) {
    syncIssues.push(
      ...(await syncPendingPerformanceFilesToStorage({
        settings,
        scheduleMonth: query.scheduleMonth,
        showProgress: true,
        paceParsing: true
      }))
    );
  }

  if (settings && approvalScope === "approved") {
    syncIssues.push(
      ...(await syncApprovedPerformanceFilesToStorage({
        settings,
        scheduleMonth: query.scheduleMonth,
        showProgress: true,
        paceParsing: true
      }))
    );
  }

  const latestApprovals = new Map(
    listLatestPerformanceApprovalsByLogicalKey().map((record) => [toLogicalKey(record.logicalKey || record.entryId), record] as const)
  );
  const hiddenApprovedApprovalIds = new Set(
    listHiddenApprovedPerformanceRows().map((record) => record.approvalId)
  );
  const rowByLogicalKey = new Map<string, PerformanceOverviewRow>();
  const visibleDetails = listStoredPerformanceFileDetails(
    {
      directoryTypes: [approvalScope],
      scheduleMonth: query.scheduleMonth
    },
    {
      resolveApprovalFields: false,
      resolveEntryApprovalStatus: false
    }
  ).filter((detail) => matchesApprovalScope(detail, approvalScope));
  const referenceDetails = listStoredPerformanceFileReferences({
    directoryTypes: ["pending", "approved"],
    scheduleMonth: query.scheduleMonth
  });
  const reapprovalCandidateDetails =
    approvalScope === "approved"
      ? listStoredPerformanceFileDetails(
          {
            directoryTypes: ["pending"],
            scheduleMonth: query.scheduleMonth
          },
          {
            resolveApprovalFields: false,
            resolveEntryApprovalStatus: false
          }
        ).filter((detail) => isExistingPendingFile(detail, settings?.pendingDir))
      : visibleDetails.filter((detail) => isExistingPendingFile(detail, settings?.pendingDir));
  const sourceFileExistsByPath = new Map<string, boolean>();

  visibleDetails.forEach((detail) => {
    if (approvalScope === "pending" && !isExistingPendingFile(detail, settings?.pendingDir)) {
      return;
    }

    const isReapprovalFile = isPendingReapprovalFile(detail, latestApprovals, referenceDetails);
    const sourceFileExists =
      sourceFileExistsByPath.get(detail.filePath) ?? existsSync(detail.filePath);

    sourceFileExistsByPath.set(detail.filePath, sourceFileExists);

    getVisiblePerformanceEntries(detail).forEach((entry) => {
      if (section !== "all" && entry.section !== section) {
        return;
      }

      const latestApproval = latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null;
      const row = buildOverviewRow(
        detail,
        {
          ...entry,
          status: latestApproval?.decision === "approved" ? "approved" : entry.status
        },
        {
          isReapprovalFile,
          latestApproval,
          sourceFileExists
        }
      );

      if (
        approvalScope === "approved" &&
        row.approvalStatus !== "approved" &&
        row.approvalStatus !== "rejected"
      ) {
        return;
      }

      if (
        row.sourceDirectoryType === "approved" &&
        row.latestApprovalId &&
        hiddenApprovedApprovalIds.has(row.latestApprovalId)
      ) {
        return;
      }

      const existing = rowByLogicalKey.get(entry.logicalKey);

      if (!existing || shouldReplaceRow(existing, row)) {
        rowByLogicalKey.set(entry.logicalKey, row);
      }
    });
  });

  const reapprovalFiles = buildReapprovalFileSummaries(
    reapprovalCandidateDetails,
    latestApprovals,
    referenceDetails
  );

  return buildOverviewSnapshot([...rowByLogicalKey.values()], reapprovalFiles, syncIssues);
};

export const getPerformanceComparison = (
  query: PerformanceComparisonQuery
): PerformanceComparisonDetail | null => {
  const detail = getStoredPerformanceFileDetail(query.fileId);
  const currentEntry = detail?.entries.find((entry) => entry.id === query.entryId);

  if (!detail || !currentEntry || isPoolSubstitutePerformanceEntry(currentEntry)) {
    return null;
  }

  const approvedRecord = getLatestPerformanceApprovalByLogicalKey(currentEntry.logicalKey);
  const approvedCalculation =
    approvedRecord?.decision === "approved"
      ? getLatestAllowanceCalculationByApprovalId(approvedRecord.id)
      : null;
  const approvedEntry =
    approvedRecord && approvedRecord.snapshotJson
      ? resolvePerformanceEntryApprovalState({
          entry: currentEntry,
          latestApproval: approvedRecord
        }).approvedEntry
      : null;

  return {
    logicalKey: currentEntry.logicalKey,
    currentFile: {
      id: detail.id,
      fileName: detail.fileName,
      directoryType: detail.directoryType,
      receivedAt: detail.receivedAt,
      scheduleMonth: detail.scheduleMonth,
      siteName: detail.siteName
    },
    currentEntry,
    approvedRecord: approvedRecord?.decision === "approved" ? approvedRecord : null,
    approvedEntry,
    approvedCalculation
  };
};
