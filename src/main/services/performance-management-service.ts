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
  EmployeeRecord,
  EmployeeSiteAssignment,
  MonthlyScheduleItem
} from "../../shared/domain/model";
import type {
  PerformanceComparisonQuery,
  PerformanceOverviewQuery
} from "../../shared/bridge/contracts";
import {
  acknowledgeReparseMarker,
  isReparseMonthCovered,
  peekReparseMarker,
  recordReparseMonth,
  type ReparseMarkerKind
} from "./app-settings-storage-service";
import { getLatestAllowanceCalculationByApprovalId } from "./approved-allowance-calculation-service";
import { listStoredEmployeeAssignments } from "./employee-history-service";
import { listStoredEmployees } from "./employee-storage-service";
import { listStoredMonthlySchedules } from "./monthly-schedule-storage-service";
import { listHiddenApprovedPerformanceRows } from "./performance-approved-row-visibility-service";
import { resolvePerformanceEntryApprovalState } from "./performance-approval-resolution-service";
import {
  getLatestPerformanceApprovalByLogicalKey,
  listPerformanceApprovalHistory,
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

const changeLockedReason = "품의승인 완료 수당은 재승인으로 변경할 수 없습니다.";

const manualHourlyRatePattern = /시급 임의지정\s+([\d,]+)원/;

const unassignedTeamLabel = "미지정 조";

const getRowTeamLabel = (row: PerformanceOverviewRow) =>
  row.entry.teamLabel?.trim() || unassignedTeamLabel;

const normalizeLookupKey = (value?: string | null) =>
  value?.trim().replace(/\s+/g, "").toLowerCase() || "";

const normalizeTeamLabelValue = (value?: string | null) => value?.trim() || undefined;

const buildScheduleTeamLookupKey = (input: {
  scheduleMonth?: string | null;
  siteName?: string | null;
  workDate?: string | null;
  employeeKey?: string | null;
}) =>
  [
    input.scheduleMonth?.trim() ?? "",
    normalizeLookupKey(input.siteName),
    input.workDate?.trim() ?? "",
    normalizeLookupKey(input.employeeKey)
  ].join("|");

const extractOriginalWorkerName = (note?: string) =>
  note?.match(/원\s*근무자[:\s]+([^/]+)/)?.[1]?.trim() || "";

const isAssignmentEffectiveOnDate = (
  assignment: EmployeeSiteAssignment,
  workDate: string,
  siteName: string
) => {
  if (normalizeLookupKey(assignment.siteName) !== normalizeLookupKey(siteName)) {
    return false;
  }

  if (workDate < assignment.startDate) {
    return false;
  }

  return !assignment.endDate || workDate <= assignment.endDate;
};

const createOverviewTeamLabelResolver = () => {
  const monthlyTeamByCode = new Map<string, string>();
  const monthlyTeamByName = new Map<string, string>();

  listStoredMonthlySchedules().forEach((schedule) => {
    schedule.items.forEach((item: MonthlyScheduleItem) => {
      const teamLabel = normalizeTeamLabelValue(item.teamLabel);

      if (!teamLabel) {
        return;
      }

      const lookupBase = {
        scheduleMonth: schedule.scheduleMonth,
        siteName: schedule.siteName,
        workDate: item.workDate
      };

      if (item.employeeCode) {
        monthlyTeamByCode.set(
          buildScheduleTeamLookupKey({
            ...lookupBase,
            employeeKey: item.employeeCode
          }),
          teamLabel
        );
      }

      monthlyTeamByName.set(
        buildScheduleTeamLookupKey({
          ...lookupBase,
          employeeKey: item.employeeName
        }),
        teamLabel
      );
    });
  });

  const employees = listStoredEmployees({
    includeDeleted: true,
    includeHistoricalAssignments: true
  });
  const employeeByCode = new Map<string, EmployeeRecord>();
  const employeesByName = new Map<string, EmployeeRecord[]>();
  const assignmentsByEmployeeId = new Map<string, EmployeeSiteAssignment[]>();

  employees.forEach((employee) => {
    if (employee.employeeCode) {
      employeeByCode.set(normalizeLookupKey(employee.employeeCode), employee);
    }

    const nameKey = normalizeLookupKey(employee.name);
    const nameMatches = employeesByName.get(nameKey) ?? [];

    nameMatches.push(employee);
    employeesByName.set(nameKey, nameMatches);
    assignmentsByEmployeeId.set(employee.id, listStoredEmployeeAssignments(employee.id));
  });

  const resolveFromMonthlySchedule = (
    entry: PerformanceFileDetail["entries"][number],
    employeeName?: string,
    employeeCode?: string
  ) => {
    if (employeeCode) {
      const byCode = monthlyTeamByCode.get(
        buildScheduleTeamLookupKey({
          scheduleMonth: entry.scheduleMonth,
          siteName: entry.siteName,
          workDate: entry.workDate,
          employeeKey: employeeCode
        })
      );

      if (byCode) {
        return byCode;
      }
    }

    if (!employeeName) {
      return undefined;
    }

    return monthlyTeamByName.get(
      buildScheduleTeamLookupKey({
        scheduleMonth: entry.scheduleMonth,
        siteName: entry.siteName,
        workDate: entry.workDate,
        employeeKey: employeeName
      })
    );
  };

  const resolveFromEmployeeAssignment = (
    entry: PerformanceFileDetail["entries"][number],
    employeeName?: string,
    employeeCode?: string
  ) => {
    const employee =
      (employeeCode ? employeeByCode.get(normalizeLookupKey(employeeCode)) : undefined) ??
      employeesByName.get(normalizeLookupKey(employeeName))?.find((candidate) =>
        (assignmentsByEmployeeId.get(candidate.id) ?? []).some((assignment) =>
          isAssignmentEffectiveOnDate(assignment, entry.workDate, entry.siteName)
        )
      ) ??
      employeesByName.get(normalizeLookupKey(employeeName))?.[0];

    if (!employee) {
      return undefined;
    }

    const assignmentTeamLabel = (assignmentsByEmployeeId.get(employee.id) ?? [])
      .find((assignment) => isAssignmentEffectiveOnDate(assignment, entry.workDate, entry.siteName))
      ?.shiftGroup;

    return normalizeTeamLabelValue(assignmentTeamLabel) ?? normalizeTeamLabelValue(employee.currentShiftGroup);
  };

  return (entry: PerformanceFileDetail["entries"][number]) => {
    const persistedTeamLabel = normalizeTeamLabelValue(entry.teamLabel);

    if (persistedTeamLabel) {
      return persistedTeamLabel;
    }

    const originalWorkerName =
      entry.section === "substitute" ? extractOriginalWorkerName(entry.note) : "";

    return (
      (originalWorkerName
        ? resolveFromMonthlySchedule(entry, originalWorkerName) ??
          resolveFromEmployeeAssignment(entry, originalWorkerName)
        : undefined) ??
      resolveFromMonthlySchedule(entry, entry.employeeName, entry.employeeCode) ??
      resolveFromEmployeeAssignment(entry, entry.employeeName, entry.employeeCode)
    );
  };
};

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
  left.entry.workDate.localeCompare(right.entry.workDate) ||
  getRowTeamLabel(left).localeCompare(getRowTeamLabel(right), "ko", { numeric: true }) ||
  sectionPriority[left.entry.section] - sectionPriority[right.entry.section] ||
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

const getPayrollRelevantPerformanceEntries = (detail: Pick<PerformanceFileDetail, "entries">) =>
  detail.entries.filter((entry) => !isPoolSubstitutePerformanceEntry(entry));

const hasPriorApprovedHistoryFromAnotherFile = (
  detail: Pick<PerformanceFileDetail, "id" | "entries">
) => {
  const payrollLogicalKeys = new Set(
    getPayrollRelevantPerformanceEntries(detail).map((entry) => toLogicalKey(entry.logicalKey))
  );

  if (payrollLogicalKeys.size === 0) {
    return false;
  }

  return listPerformanceApprovalHistory().some(
    (approval) =>
      approval.decision === "approved" &&
      approval.fileId !== detail.id &&
      payrollLogicalKeys.has(toLogicalKey(approval.logicalKey))
  );
};

const hasCurrentCycleApproval = (
  detail: Pick<PerformanceFileDetail, "id" | "entries" | "receivedAt">,
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>
) =>
  getPayrollRelevantPerformanceEntries(detail).some((entry) =>
    isCompletedInCurrentReapprovalCycle(
      detail,
      latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null
    )
  );

const hasPriorApprovedContentForPendingFile = (
  detail: Pick<PerformanceFileDetail, "id" | "entries" | "directoryType" | "status" | "receivedAt">,
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>
) =>
  detail.directoryType === "pending" &&
  (
    detail.status === "rejected" ||
    (hasPriorApprovedHistoryFromAnotherFile(detail) &&
      hasCurrentCycleApproval(detail, latestApprovals)) ||
    getPayrollRelevantPerformanceEntries(detail).some((entry) => {
      const latestApproval = latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null;
      return Boolean(
        latestApproval?.decision === "approved" &&
          latestApproval.fileId !== detail.id &&
          resolvePerformanceEntryApprovalState({
            entry,
            latestApproval
          }).needsReapproval
      );
    })
  );

const isPendingReapprovalFile = (
  detail: Pick<PerformanceFileDetail, "id" | "entries" | "directoryType" | "status" | "receivedAt">,
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>
) => hasPriorApprovedContentForPendingFile(detail, latestApprovals);

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
  const isNonPayablePoolSubstitute = isPoolSubstitutePerformanceEntry(entry);
  const resolvedApproval = resolvePerformanceEntryApprovalState({
    entry,
    latestApproval
  });
  const approvalStatus =
    isNonPayablePoolSubstitute
      ? "non-payable"
      : latestAllowanceCalculation?.status === "rejected"
      ? "rejected"
      : detail.directoryType === "approved"
      ? "approved"
      : resolvedApproval.approvalStatus;
  // A row whose approval still holds is shown as it was approved. The wage left the equivalence
  // check (T-2), so a refresh can re-read such a row at a new wage without touching its approval;
  // showing the re-read wage under a "승인" status would name a figure the approval never paid.
  const shouldDisplayApprovedEntry =
    Boolean(resolvedApproval.approvedEntry) &&
    (detail.directoryType === "approved" ||
      latestApprovalUsedManualRate ||
      (resolvedApproval.approvalStatus === "approved" && resolvedApproval.satisfied));
  const displayEntry =
    shouldDisplayApprovedEntry && resolvedApproval.approvedEntry
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
      !isNonPayablePoolSubstitute &&
      !isChangeLocked &&
      detail.directoryType === "pending" &&
      resolvedApproval.approvalStatus === "pending" &&
      !resolvedApproval.needsReapproval &&
      !hasBlockingApprovalIssue(entry),
    needsReapproval:
      !isNonPayablePoolSubstitute &&
      !isChangeLocked &&
      detail.directoryType === "pending" &&
      resolvedApproval.needsReapproval,
    reapprovalStatus:
      !isNonPayablePoolSubstitute && detail.directoryType === "pending" && options?.isReapprovalFile
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
  latestApprovals: Map<string, ReturnType<typeof listLatestPerformanceApprovalsByLogicalKey>[number]>
): PerformanceReapprovalFileSummary[] =>
  details
    .filter(
      (detail) =>
        getPayrollRelevantPerformanceEntries(detail).length > 0 &&
        isPendingReapprovalFile(detail, latestApprovals)
    )
    .map((detail) => {
      const visibleEntries = getPayrollRelevantPerformanceEntries(detail);
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

const REPARSE_MARKER_KINDS: ReparseMarkerKind[] = [
  "substitute-policy",
  "employee-master",
  "team-work-type",
  "monthly-schedule"
];

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
    // 대체수당 제외 정책 시작일, 인력 기본정보(신규·이름·사번·입퇴사일·배정·근무지 이름), 근무 설정의
    // 조 근무유형, 월간 근무표 저장본이 바뀐 뒤 첫 조회라면, 대기 파일을 다시 읽어 판정을 새 기준으로
    // 맞춘다. 승인 완료 보관본은 다시 읽지 않는다.
    // Each marker is only peeked here and settled AFTER the re-read, by the token that was read: a
    // marker spent before the re-read was lost whenever the scan threw, and a change made during
    // the re-read leaves a new token that survives (R10 #5). A month-scoped query re-reads one
    // month, so it records that month against the token instead of spending it - the other
    // months' pending files are still waiting for theirs (R11 self-check).
    const reparseDemands = REPARSE_MARKER_KINDS.map((kind) => {
      const token = peekReparseMarker(kind);
      const needed =
        token !== null &&
        (!query.scheduleMonth || !isReparseMonthCovered(kind, token, query.scheduleMonth));

      return { kind, token, needed };
    });

    syncIssues.push(
      ...(await syncPendingPerformanceFilesToStorage({
        settings,
        forceReparse: query.forceReparse || reparseDemands.some((demand) => demand.needed),
        scheduleMonth: query.scheduleMonth,
        showProgress: true,
        paceParsing: true
      }))
    );

    for (const demand of reparseDemands) {
      if (demand.token === null) {
        continue;
      }

      if (!query.scheduleMonth) {
        acknowledgeReparseMarker(demand.kind, demand.token);
      } else if (demand.needed) {
        recordReparseMonth(demand.kind, demand.token, query.scheduleMonth);
      }
    }
  }

  if (settings && approvalScope === "approved") {
    syncIssues.push(
      ...(await syncApprovedPerformanceFilesToStorage({
        settings,
        forceReparse: query.forceReparse,
        scheduleMonth: query.scheduleMonth,
        showProgress: true,
        paceParsing: true
      }))
    );
  }

  const latestApprovals = new Map(
    listLatestPerformanceApprovalsByLogicalKey().map((record) => [toLogicalKey(record.logicalKey), record] as const)
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
  const resolveTeamLabel = createOverviewTeamLabelResolver();

  visibleDetails.forEach((detail) => {
    if (approvalScope === "pending" && !isExistingPendingFile(detail, settings?.pendingDir)) {
      return;
    }

    const isReapprovalFile = isPendingReapprovalFile(detail, latestApprovals);
    const sourceFileExists =
      sourceFileExistsByPath.get(detail.filePath) ?? existsSync(detail.filePath);

    sourceFileExistsByPath.set(detail.filePath, sourceFileExists);

    detail.entries.forEach((entry) => {
      if (section !== "all" && entry.section !== section) {
        return;
      }

      const latestApproval = latestApprovals.get(toLogicalKey(entry.logicalKey)) ?? null;
      const resolvedTeamLabel = resolveTeamLabel(entry);
      const row = buildOverviewRow(
        detail,
        {
          ...entry,
          teamLabel: resolvedTeamLabel,
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
        row.approvalStatus !== "rejected" &&
        row.approvalStatus !== "non-payable"
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
    latestApprovals
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
