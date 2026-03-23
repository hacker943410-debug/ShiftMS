import type {
  PerformanceComparisonDetail,
  PerformanceFileDetail,
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
  listStoredPerformanceFileDetails
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
  if (approvalScope === "all") {
    return detail.directoryType === "pending" || detail.directoryType === "approved";
  }

  if (approvalScope === "approved") {
    return detail.directoryType === "pending" || detail.directoryType === "approved";
  }

  return detail.directoryType === "pending";
};

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

const getVisiblePerformanceEntries = (detail: Pick<PerformanceFileDetail, "entries">) =>
  detail.entries.filter((entry) => !isPoolSubstitutePerformanceEntry(entry));

const buildOverviewRow = (
  detail: PerformanceFileDetail,
  entry: PerformanceFileDetail["entries"][number],
  options?: {
    isReapprovalFile?: boolean;
  }
) => {
  const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
  const latestApprovalManualHourlyRate = parseManualHourlyRate(latestApproval?.comment);
  const latestApprovalUsedManualRate = Boolean(latestApprovalManualHourlyRate);
  const resolvedApproval = resolvePerformanceEntryApprovalState({
    entry,
    latestApproval
  });
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
    sourceDirectoryType: detail.directoryType,
    sourceReceivedAt: detail.receivedAt,
    entry: displayEntry,
    approvalStatus:
      detail.directoryType === "approved"
        ? "approved"
        : resolvedApproval.approvalStatus,
    canApprove:
      detail.directoryType === "pending" &&
      resolvedApproval.approvalStatus === "pending" &&
      !resolvedApproval.needsReapproval &&
      !hasBlockingApprovalIssue(entry),
    needsReapproval: detail.directoryType === "pending" && resolvedApproval.needsReapproval,
    reapprovalStatus:
      detail.directoryType === "pending" && options?.isReapprovalFile
        ? isCompletedInCurrentReapprovalCycle(detail, latestApproval)
          ? "completed"
          : "pending"
        : "none",
    latestApprovalAt: resolvedApproval.latestApprovalAt,
    latestApprovalByName: resolvedApproval.latestApprovalByName,
    latestApprovalFileId: latestApproval?.fileId,
    latestApprovalComment: latestApproval?.comment,
    latestApprovalUsedManualRate,
    latestApprovalManualHourlyRate: latestApprovalManualHourlyRate ?? undefined
  } satisfies PerformanceOverviewRow;
};

const hasApprovedArchiveForSchedule = (
  detail: Pick<PerformanceFileDetail, "id" | "scheduleKey">,
  details: PerformanceFileDetail[]
) =>
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

const buildReapprovalFileSummaries = (
  details: PerformanceFileDetail[],
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>
): PerformanceReapprovalFileSummary[] =>
  details
    .filter(
      (detail) =>
        detail.directoryType === "pending" &&
        getVisiblePerformanceEntries(detail).length > 0 &&
        hasApprovedArchiveForSchedule(detail, details)
    )
    .map((detail) => {
      const visibleEntries = getVisiblePerformanceEntries(detail);
      const resolvedEntries = visibleEntries.map((entry) =>
        resolvePerformanceEntryApprovalState({
          entry,
          latestApproval: latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null
        })
      );
      const resolvedApprovedEntryCount = resolvedEntries.filter((item) => item.satisfied).length;
      const needsReapprovalCount = resolvedEntries.filter((item) => item.needsReapproval).length;
      const reapprovalCompletedCount = visibleEntries.filter(
        (entry) =>
          isCompletedInCurrentReapprovalCycle(
            detail,
            latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null
          )
      ).length;

      return {
        fileId: detail.id,
        fileName: detail.fileName,
        scheduleKey: detail.scheduleKey ?? "",
        scheduleMonth: detail.scheduleMonth ?? "",
        siteName: detail.siteName ?? "",
        receivedAt: detail.receivedAt,
        entryCount: visibleEntries.length,
        resolvedApprovedEntryCount,
        remainingEntryCount: Math.max(visibleEntries.length - resolvedApprovedEntryCount, 0),
        reapprovalCompletedCount,
        reapprovalPendingCount: Math.max(visibleEntries.length - reapprovalCompletedCount, 0),
        needsReapprovalCount,
        canFinalize: true
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
  reapprovalFiles: PerformanceReapprovalFileSummary[]
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
        approvableCount: sortedRows.filter((row) => row.canApprove).length,
        needsReapprovalCount: sortedRows.filter((row) => row.needsReapproval).length,
        alertCount: sortedRows.reduce((sum, row) => sum + row.entry.alerts.length, 0),
        rows: sortedRows
      };
    });

  return {
    groups,
    reapprovalFiles,
    siteCount: groups.length,
    rowCount: rows.length,
    approvedCount: rows.filter((row) => row.approvalStatus === "approved").length,
    pendingCount: rows.filter((row) => row.approvalStatus === "pending").length,
    approvableCount: rows.filter((row) => row.canApprove).length,
    needsReapprovalCount: rows.filter((row) => row.needsReapproval).length
  };
};

export const listPerformanceOverview = async (
  query: PerformanceOverviewQuery = {},
  settings?: { pendingDir: string; approvedDir: string }
): Promise<PerformanceOverviewSnapshot> => {
  const approvalScope = query.approvalScope ?? "all";
  const section = query.section ?? "all";

  if (settings) {
    await syncPendingPerformanceFilesToStorage(settings);
  }

  if (settings && (approvalScope === "all" || approvalScope === "approved")) {
    await syncApprovedPerformanceFilesToStorage({
      settings,
      scheduleMonth: query.scheduleMonth
    });
  }

  const latestApprovals = new Map(
    listLatestPerformanceApprovalsByLogicalKey().map((record) => [toLogicalKey(record.logicalKey || record.entryId), record] as const)
  );
  const rowByLogicalKey = new Map<string, PerformanceOverviewRow>();
  const allDetails = listStoredPerformanceFileDetails()
    .filter((detail) => !query.scheduleMonth || detail.scheduleMonth === query.scheduleMonth);
  const visibleDetails = allDetails.filter((detail) => matchesApprovalScope(detail, approvalScope));

  visibleDetails.forEach((detail) => {
      getVisiblePerformanceEntries(detail).forEach((entry) => {
        if (section !== "all" && entry.section !== section) {
          return;
        }

        const latestApproval = latestApprovals.get(toLogicalKey(entry.logicalKey));
        const row = buildOverviewRow(detail, {
          ...entry,
          status: latestApproval?.decision === "approved" ? "approved" : entry.status
        }, {
          isReapprovalFile: hasApprovedArchiveForSchedule(detail, allDetails)
        });

        if (approvalScope === "approved" && row.approvalStatus !== "approved") {
          return;
        }

        const existing = rowByLogicalKey.get(entry.logicalKey);

        if (!existing || shouldReplaceRow(existing, row)) {
          rowByLogicalKey.set(entry.logicalKey, row);
        }
      });
    });

  const reapprovalFiles = buildReapprovalFileSummaries(allDetails, latestApprovals);

  return buildOverviewSnapshot([...rowByLogicalKey.values()], reapprovalFiles);
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
