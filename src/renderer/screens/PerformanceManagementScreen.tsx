import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import type {
  PerformanceAlert,
  PerformanceApprovalRecord,
  PerformanceApprovalScope,
  PerformanceComparisonDetail,
  PerformanceEntryRecord,
  PerformanceEntrySection,
  PerformanceFileSyncIssue,
  PerformanceFileSyncStateSnapshot,
  PerformanceOverviewSiteGroup,
  PerformanceOverviewRow,
  PerformanceReapprovalFileSummary,
  PerformanceOverviewSnapshot
} from "@shared/domain/performance-file";
import {
  isHourlyRateUnappliedPerformanceEntry,
  isNonPayablePoolSubstitutePerformanceEntry,
  parsePoolWorkerDisplayName
} from "@shared/domain/performance-file";
import { canPerformAction } from "@shared/domain/authorization";
import type { AuthSession, EmployeeRecord, WageRateRecord } from "@shared/domain/model";
import { formatCurrency, formatHourlyRateCurrency } from "@shared/lib/formatCurrency";

import { showActionResultDialog } from "../components/action-result-dialog";
import { FormSelect } from "../components/FormSelect";
import { useQuestionDialog } from "../components/QuestionDialog";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { buildHandMovedFileGuidance } from "./performance-management/hand-moved-file-guidance";
import {
  buildHolidayMissingGuidance,
  detectHolidayMarkingGap,
  type HolidayMarkingGap
} from "./performance-management/holiday-missing-guidance";

const approvalScopeLabel: Record<PerformanceApprovalScope, string> = {
  pending: "승인대기",
  approved: "승인완료 보관본"
};

const sectionLabel: Record<PerformanceEntrySection | "all", string> = {
  all: "전체유형",
  substitute: "대체근무",
  overtime: "연장근무",
  "legal-holiday": "법정휴일근무"
};

const approvalStatusLabel: Record<PerformanceOverviewRow["approvalStatus"], string> = {
  pending: "대기",
  approved: "승인",
  rejected: "반려",
  "non-payable": "수당 미지급"
};

const approvalStatusTone: Record<PerformanceOverviewRow["approvalStatus"], "warn" | "info" | "neutral"> = {
  pending: "warn",
  approved: "info",
  rejected: "warn",
  "non-payable": "neutral"
};

const employeeStatusLabel: Record<EmployeeRecord["status"], string> = {
  active: "재직",
  leave: "휴직",
  retired: "퇴사"
};

const workTypePillClassName: Record<PerformanceEntrySection, string> = {
  substitute: "performance-section-pill substitute",
  overtime: "performance-section-pill overtime",
  "legal-holiday": "performance-section-pill legal-holiday"
};

const createCurrentYear = () => String(new Date().getFullYear());
const createCurrentMonth = () => String(new Date().getMonth() + 1).padStart(2, "0");
const ALL_PERIOD_FILTER = "all";

const toLocalDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

const toHourText = (minutes: number) => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

const getWorkSummary = (
  entry: Pick<
    PerformanceEntryRecord,
    "totalWorkMinutes" | "baseWorkMinutes" | "overtimeMinutes" | "nightMinutes" | "breakMinutes"
  >
) =>
  `총 ${toHourText(entry.totalWorkMinutes)} / 기본 ${toHourText(
    entry.baseWorkMinutes
  )} / 연장 ${toHourText(entry.overtimeMinutes)} / 야간 ${toHourText(
    entry.nightMinutes
  )} / 휴게 ${toHourText(entry.breakMinutes)}`;

const getTimeRangeLabel = (entry: Pick<PerformanceEntryRecord, "startTime" | "endTime">) =>
  entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : "-";

const extractScheduledWorkerFromNote = (note?: string) => {
  const matched =
    note?.match(/근무예정자[:\s]+([^/]+)/) ?? note?.match(/원\s*근무자[:\s]+([^/]+)/);

  return matched?.[1]?.trim() || "";
};

const getScheduledWorkerName = (
  entry: Pick<PerformanceEntryRecord, "employeeName" | "note" | "section">
) => {
  const scheduledWorkerName = extractScheduledWorkerFromNote(entry.note);

  if (scheduledWorkerName) {
    return scheduledWorkerName;
  }

  return entry.section === "substitute" ? "-" : entry.employeeName;
};

const getSubstituteWorkerName = (
  entry: Pick<PerformanceEntryRecord, "employeeName" | "section">
) => (entry.section === "substitute" ? entry.employeeName : "-");

const toSection = (record: PerformanceApprovalRecord): PerformanceEntrySection =>
  record.workType === "holiday"
    ? "legal-holiday"
    : record.workType === "substitute"
      ? "substitute"
      : "overtime";

const getApprovalHistoryKey = (record: PerformanceApprovalRecord) => record.logicalKey || record.entryId;

const getAlertButtonLabel = (alerts: PerformanceAlert[]) =>
  alerts.length > 0 ? `알림 ${alerts.length}건` : "-";

const getSyncIssueModalTitle = (issues: PerformanceFileSyncIssue[]) =>
  issues.some((issue) => issue.severity === "error")
    ? "실적 파일 파싱 경고"
    : "실적 파일 동기화 안내";

const getSyncDirectoryLabel = (directoryType?: PerformanceFileSyncStateSnapshot["directoryType"]) =>
  directoryType === "approved"
    ? "승인완료 보관본"
    : directoryType === "pending"
      ? "승인대기"
      : "실적 파일";

const getSyncProgressPercent = (state: PerformanceFileSyncStateSnapshot) =>
  state.totalCount > 0
    ? Math.min(100, Math.round((state.processedCount / state.totalCount) * 100))
    : state.status === "scanning"
      ? 8
      : state.status === "completed"
        ? 100
        : 0;

const shouldShowSyncProgress = (state: PerformanceFileSyncStateSnapshot | null) =>
  Boolean(state && state.status !== "idle");

const canOpenComparison = (
  row: PerformanceOverviewRow,
  approvalScope: PerformanceApprovalScope
) =>
  approvalScope === "pending" &&
  !isNonPayablePoolSubstitutePerformanceEntry(row.entry) &&
  !row.isChangeLocked &&
  row.sourceDirectoryType === "pending" &&
  row.approvalStatus !== "pending";

const isReapprovalRow = (row: PerformanceOverviewRow) => row.reapprovalStatus !== "none";

const getApprovalStatusDisplay = (
  row: PerformanceOverviewRow,
  approvalScope: PerformanceApprovalScope
) => {
  if (row.isChangeLocked) {
    return {
      label: "변경불가",
      tone: "neutral" as const
    };
  }

  if (isNonPayablePoolSubstitutePerformanceEntry(row.entry)) {
    return {
      label: "수당 미지급",
      tone: "neutral" as const
    };
  }

  if (approvalScope === "approved" && row.approvalStatus === "rejected") {
    return {
      label: "반려",
      tone: "warn" as const
    };
  }

  if (row.reapprovalStatus === "pending") {
    return {
      label: "재승인 대기",
      tone: "warn" as const
    };
  }

  if (row.reapprovalStatus === "completed") {
    return {
      label: "재승인 완료",
      tone: "info" as const
    };
  }

  return {
    label: approvalStatusLabel[row.approvalStatus],
    tone: approvalStatusTone[row.approvalStatus]
  };
};

const isValidYearValue = (value?: string) => /^\d{4}$/.test(value ?? "");

const formatHourlyRateLabel = (hourlyRate?: number, options?: { manual?: boolean }) => {
  if (!hourlyRate || hourlyRate <= 0) {
    return "-";
  }

  return options?.manual
    ? `${formatHourlyRateCurrency(hourlyRate)} (임의지정)`
    : formatHourlyRateCurrency(hourlyRate);
};

const resolveWageRateForDate = (wageRates: WageRateRecord[], workDate: string) =>
  wageRates.find((wageRate) => {
    if (workDate < wageRate.effectiveFrom) {
      return false;
    }

    if (wageRate.effectiveTo && workDate > wageRate.effectiveTo) {
      return false;
    }

    return true;
  });

const selectEmployeeForPerformanceEntry = (
  employees: EmployeeRecord[],
  entry: Pick<PerformanceEntryRecord, "employeeCode" | "employeeName" | "siteName">
) => {
  const normalizedEmployeeCode = entry.employeeCode.trim();
  const normalizedEmployeeName = parsePoolWorkerDisplayName(entry.employeeName).employeeName;

  if (normalizedEmployeeCode) {
    const matchedByCode = employees.find(
      (employee) => employee.employeeCode === normalizedEmployeeCode
    );

    if (matchedByCode) {
      return matchedByCode;
    }
  }

  const exactNameMatches = employees.filter((employee) => employee.name === normalizedEmployeeName);

  return (
    exactNameMatches.find((employee) => employee.currentSiteName === entry.siteName) ??
    exactNameMatches[0] ??
    null
  );
};

const getManualHourlyRateBadgeLabel = (hourlyRate?: number) =>
  hourlyRate && hourlyRate > 0
    ? `임의 시급 ${formatHourlyRateCurrency(hourlyRate)}`
    : "임의 시급 적용";

const PerformanceExcelIcon = () => <span className="performance-action-icon-label">XLS</span>;

const getHolidayDisplay = (workDate: string, holidayNamesByDate: Record<string, string>) => {
  const holidayName = holidayNamesByDate[workDate];

  // 예외인 '법정휴일'만 표시한다. 정상 케이스(비휴일)는 매 줄 의미 없는 '비휴일' 칩으로
  // 화면을 어지럽히므로 아무 표식도 달지 않는다.
  return holidayName
    ? {
        label: "법정휴일",
        title: holidayName,
        className: "performance-day-flag holiday"
      }
    : null;
};

const getPendingRowActionCaption = (
  row: PerformanceOverviewRow
) => {
  if (row.isChangeLocked) {
    return row.changeLockedReason ?? "품의승인 완료 수당은 재승인으로 변경할 수 없습니다.";
  }

  if (isNonPayablePoolSubstitutePerformanceEntry(row.entry)) {
    return "Pool 대체근무 수당 미지급";
  }

  if (row.reapprovalStatus === "pending") {
    return "승인대기에서 재승인";
  }

  if (row.reapprovalStatus === "completed") {
    return "파일 확정 대기";
  }

  if (row.approvalStatus === "rejected") {
    return "수당 반려로 재승인 필요";
  }

  if (row.approvalStatus !== "pending") {
    if (row.sourceDirectoryType === "pending") {
      return "승인 반영";
    }

    return row.latestApprovalAt ? `최종 승인 ${formatDateTime(row.latestApprovalAt)}` : "승인 반영";
  }

  if (isHourlyRateUnappliedPerformanceEntry(row.entry)) {
    return "시급미반영항목";
  }

  if (!row.entry.hourlyRate || row.entry.hourlyRate <= 0) {
    return "시급 확인 필요";
  }

  if (row.entry.alerts.some((alert) => alert.severity === "error")) {
    return "오류 확인 필요";
  }

  return "승인 대기";
};

const buildComparisonRows = (
  detail: PerformanceComparisonDetail,
  manualHourlyRate?: number | null
) => {
  const approvedEntry = detail.approvedEntry;
  const approvedCalculation = detail.approvedCalculation;
  const currentEntry = detail.currentEntry;
  const currentHourlyRate = manualHourlyRate && manualHourlyRate > 0
    ? manualHourlyRate
    : currentEntry.hourlyRate;

  return [
    {
      key: "section",
      label: "근로유형",
      approved: approvedEntry ? sectionLabel[approvedEntry.section] : "-",
      current: sectionLabel[currentEntry.section]
    },
    {
      key: "workDate",
      label: "근무일자",
      approved: approvedEntry?.workDate ?? "-",
      current: currentEntry.workDate
    },
    {
      key: "timeRange",
      label: "시작/종료",
      approved: approvedEntry ? getTimeRangeLabel(approvedEntry) : "-",
      current: getTimeRangeLabel(currentEntry)
    },
    {
      key: "summary",
      label: "근무 요약",
      approved: approvedEntry ? getWorkSummary(approvedEntry) : "-",
      current: getWorkSummary(currentEntry)
    },
    {
      key: "hourlyRate",
      label: "시급",
      approved: formatHourlyRateLabel(approvedEntry?.hourlyRate),
      current: formatHourlyRateLabel(currentHourlyRate, {
        manual: Boolean(manualHourlyRate && manualHourlyRate > 0)
      })
    },
    {
      key: "reason",
      label: "사유",
      approved: approvedEntry?.reason ?? "-",
      current: currentEntry.reason ?? "-"
    },
    {
      key: "evidence",
      label: "증적자료",
      approved: approvedEntry?.evidence ?? "-",
      current: currentEntry.evidence ?? "-"
    },
    {
      key: "approvalInfo",
      label: "승인정보",
      approved: detail.approvedRecord
        ? `${detail.approvedRecord.processedByName} / ${formatDateTime(detail.approvedRecord.processedAt)}`
        : "-",
      current: `${detail.currentFile.fileName} / ${formatDateTime(detail.currentFile.receivedAt)}`
    },
    {
      key: "allowance",
      label: "저장된 수당",
      approved: approvedCalculation
        ? `${formatCurrency(approvedCalculation.snapshot.totalAllowanceAmount)} / ${approvedCalculation.rateVersionLabel}`
        : "-",
      current: "재승인 시 재산정"
    }
  ].map((row) => ({
    ...row,
    changed: row.approved !== row.current
  }));
};

const buildAvailableYears = (
  overview: PerformanceOverviewSnapshot | null,
  history: PerformanceApprovalRecord[],
  selectedYear: string
) => {
  const years = new Set<string>([createCurrentYear()]);

  if (isValidYearValue(selectedYear)) {
    years.add(selectedYear);
  }

  overview?.groups.forEach((group) => {
    group.rows.forEach((row) => {
      const year = row.entry.workDate.slice(0, 4);

      if (isValidYearValue(year)) {
        years.add(year);
      }
    });
  });
  history.forEach((record) => {
    const year = record.workDate.slice(0, 4);

    if (isValidYearValue(year)) {
      years.add(year);
    }
  });

  return [...years].sort((left, right) => Number(right) - Number(left));
};

const matchesPeriodFilter = (dateValue: string, selectedYear: string, selectedMonth: string) => {
  if (selectedYear !== ALL_PERIOD_FILTER && !dateValue.startsWith(`${selectedYear}-`)) {
    return false;
  }

  if (selectedMonth !== ALL_PERIOD_FILTER && dateValue.slice(5, 7) !== selectedMonth) {
    return false;
  }

  return true;
};

const formatPeriodFilterLabel = (selectedYear: string, selectedMonth: string) => {
  if (selectedYear === ALL_PERIOD_FILTER && selectedMonth === ALL_PERIOD_FILTER) {
    return "전체 기간";
  }

  if (selectedYear === ALL_PERIOD_FILTER) {
    return `전체 연도 ${Number(selectedMonth)}월`;
  }

  if (selectedMonth === ALL_PERIOD_FILTER) {
    return `${selectedYear}년 전체`;
  }

  return `${selectedYear}-${selectedMonth}`;
};

const rebuildPerformanceGroup = (
  group: PerformanceOverviewSiteGroup,
  rows: PerformanceOverviewRow[]
): PerformanceOverviewSiteGroup => ({
  ...group,
  rows,
  rowCount: rows.length,
  approvedCount: rows.filter((row) => row.approvalStatus === "approved").length,
  pendingCount: rows.filter((row) => row.approvalStatus === "pending").length,
  rejectedCount: rows.filter((row) => row.approvalStatus === "rejected").length,
  approvableCount: rows.filter((row) => row.canApprove).length,
  needsReapprovalCount: rows.filter((row) => row.needsReapproval).length,
  changeLockedCount: rows.filter((row) => row.isChangeLocked).length,
  alertCount: rows.reduce((sum, row) => sum + row.entry.alerts.length, 0)
});

interface PerformanceTeamRowGroup {
  groupKey: string;
  workDate: string;
  teamLabel: string;
  rows: PerformanceOverviewRow[];
  rowCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  approvableCount: number;
  needsReapprovalCount: number;
  alertCount: number;
}

const getPerformanceTeamLabel = (row: PerformanceOverviewRow) =>
  row.entry.teamLabel?.trim() || "미지정 조";

const buildPerformanceTeamRowGroup = (
  groupKey: string,
  workDate: string,
  teamLabel: string,
  teamRows: PerformanceOverviewRow[]
): PerformanceTeamRowGroup => ({
  groupKey,
  workDate,
  teamLabel,
  rows: teamRows,
  rowCount: teamRows.length,
  approvedCount: teamRows.filter((row) => row.approvalStatus === "approved").length,
  pendingCount: teamRows.filter((row) => row.approvalStatus === "pending").length,
  rejectedCount: teamRows.filter((row) => row.approvalStatus === "rejected").length,
  approvableCount: teamRows.filter((row) => row.canApprove).length,
  needsReapprovalCount: teamRows.filter((row) => row.needsReapproval).length,
  alertCount: teamRows.reduce((sum, row) => sum + row.entry.alerts.length, 0)
});

const groupPerformanceRowsByDateAndTeam = (
  rows: PerformanceOverviewRow[]
): PerformanceTeamRowGroup[] => {
  const groups: PerformanceTeamRowGroup[] = [];
  let currentRows: PerformanceOverviewRow[] = [];
  let currentWorkDate = "";
  let currentTeamLabel = "";

  const flushCurrentGroup = () => {
    if (currentRows.length === 0) {
      return;
    }

    groups.push(
      buildPerformanceTeamRowGroup(
        `${currentWorkDate}:${currentTeamLabel}:${groups.length}`,
        currentWorkDate,
        currentTeamLabel,
        currentRows
      )
    );
  };

  rows.forEach((row) => {
    const workDate = row.entry.workDate;
    const teamLabel = getPerformanceTeamLabel(row);

    if (currentRows.length > 0 && (workDate !== currentWorkDate || teamLabel !== currentTeamLabel)) {
      flushCurrentGroup();
      currentRows = [];
    }

    currentWorkDate = workDate;
    currentTeamLabel = teamLabel;
    currentRows.push(row);
  });

  flushCurrentGroup();

  return groups;
};

const formatNullableDate = (value?: string) => (value ? formatDate(value) : "-");

const formatAssignmentPeriod = (employee: EmployeeRecord) => {
  const startDate = formatNullableDate(employee.currentAssignmentStartDate);
  const endDate = employee.currentAssignmentEndDate
    ? formatNullableDate(employee.currentAssignmentEndDate)
    : "현재";

  return startDate === "-" && endDate === "현재" ? "-" : `${startDate} ~ ${endDate}`;
};

const getWageRatePeriod = (wageRate: WageRateRecord) =>
  `${formatNullableDate(wageRate.effectiveFrom)} ~ ${
    wageRate.effectiveTo ? formatNullableDate(wageRate.effectiveTo) : "현재"
  }`;

const PerformanceInfoIcon = () => <span className="performance-action-icon-label">INFO</span>;

interface PerformanceManagementScreenProps {
  session: AuthSession;
}

type PerformanceEmployeeInfoModalState = {
  row: PerformanceOverviewRow;
  employee: EmployeeRecord | null;
  wageRates: WageRateRecord[];
  isLoading: boolean;
  error: string | null;
};

export const PerformanceManagementScreen = ({
  session
}: PerformanceManagementScreenProps) => {
  const [overview, setOverview] = useState<PerformanceOverviewSnapshot | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<PerformanceApprovalRecord[]>([]);
  const [approvalScope, setApprovalScope] = useState<PerformanceApprovalScope>("pending");
  const [selectedSiteName, setSelectedSiteName] = useState("all");
  const [sectionFilter, setSectionFilter] = useState<PerformanceEntrySection | "all">("all");
  const [selectedYear, setSelectedYear] = useState(ALL_PERIOD_FILTER);
  const [selectedMonth, setSelectedMonth] = useState(ALL_PERIOD_FILTER);
  const [expandedSites, setExpandedSites] = useState<string[]>([]);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [screenNotice, setScreenNotice] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{ title: string; alerts: PerformanceAlert[] } | null>(
    null
  );
  const [syncIssueModal, setSyncIssueModal] = useState<{
    title: string;
    issues: PerformanceFileSyncIssue[];
  } | null>(null);
  const [employeeInfoModal, setEmployeeInfoModal] =
    useState<PerformanceEmployeeInfoModalState | null>(null);
  const [syncProgress, setSyncProgress] = useState<PerformanceFileSyncStateSnapshot | null>(null);
  const [comparisonModal, setComparisonModal] = useState<{
    row: PerformanceOverviewRow;
    detail: PerformanceComparisonDetail | null;
    isLoading: boolean;
    manualHourlyRate: number | null;
  } | null>(null);
  const [hourlyRateEditor, setHourlyRateEditor] = useState<{
    draft: string;
    error: string | null;
  } | null>(null);
  const hourlyRateInputRef = useRef<HTMLInputElement | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [holidayNamesByDate, setHolidayNamesByDate] = useState<Record<string, string>>({});
  const [holidayGap, setHolidayGap] = useState<HolidayMarkingGap | null>(null);
  const [dismissedHolidayHintMonth, setDismissedHolidayHintMonth] = useState<string | null>(null);
  const { askQuestion, questionDialog } = useQuestionDialog();
  const { showGuidance } = useAppWorkflow();
  const syncIssueSignatureRef = useRef("");
  const forceReparseOnNextLoadRef = useRef(false);
  const canManagePerformanceApprovals = canPerformAction(
    session.role,
    "performance-approval"
  );

  const scheduleMonth =
    selectedYear !== ALL_PERIOD_FILTER && selectedMonth !== ALL_PERIOD_FILTER
      ? `${selectedYear}-${selectedMonth}`
      : undefined;
  const periodFilterLabel = formatPeriodFilterLabel(selectedYear, selectedMonth);

  useEffect(() => {
    if (approvalScope !== "approved") {
      return;
    }

    if (selectedYear === ALL_PERIOD_FILTER) {
      setSelectedYear(createCurrentYear());
    }

    if (selectedMonth === ALL_PERIOD_FILTER) {
      setSelectedMonth(createCurrentMonth());
    }
  }, [approvalScope, selectedMonth, selectedYear]);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      const shouldForceReparse = forceReparseOnNextLoadRef.current;
      forceReparseOnNextLoadRef.current = false;

      setIsLoading(true);
      setScreenError(null);
      setScreenNotice(null);

      try {
        if (approvalScope === "approved" && !scheduleMonth) {
          if (active) {
            setOverview(null);
            setScreenNotice("승인완료 보관본은 연도와 월을 선택한 뒤 조회할 수 있습니다.");
          }
          return;
        }

        const overviewResult = await window.appBridge.listPerformanceOverview({
          approvalScope,
          ...(shouldForceReparse ? { forceReparse: true } : {}),
          section: sectionFilter,
          scheduleMonth
        });

        if (!active) {
          return;
        }

        setOverview(overviewResult.ok ? overviewResult.data : null);

        if (overviewResult.ok) {
          const syncIssues = overviewResult.data.syncIssues ?? [];
          const issueSignature = syncIssues
            .map((issue) => `${issue.filePath}:${issue.severity}:${issue.message}`)
            .sort()
            .join("|");

          if (issueSignature && issueSignature !== syncIssueSignatureRef.current) {
            syncIssueSignatureRef.current = issueSignature;
            setSyncIssueModal({
              title: getSyncIssueModalTitle(syncIssues),
              issues: syncIssues
            });
          }

          if (!issueSignature) {
            syncIssueSignatureRef.current = "";
          }
        }

        setScreenError(overviewResult.ok ? null : overviewResult.message);
      } catch (error) {
        if (active) {
          setScreenError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadOverview();

    return () => {
      active = false;
    };
  }, [approvalScope, refreshKey, scheduleMonth, sectionFilter]);

  // Advisory hint: when a specific month is open and its registered public holidays produced no
  // 법정휴일 근무 rows at all, the returned schedule likely lost its holiday markings.
  useEffect(() => {
    let cancelled = false;

    if (!scheduleMonth || !overview) {
      setHolidayGap(null);
      return;
    }

    const year = Number(scheduleMonth.slice(0, 4));

    if (!Number.isInteger(year)) {
      setHolidayGap(null);
      return;
    }

    void window.appBridge
      .listHolidayCalendars(year)
      .then((result) => {
        if (cancelled) {
          return;
        }

        const holidayItems = result.ok
          ? result.data.flatMap((calendar) => calendar.items)
          : [];

        setHolidayGap(detectHolidayMarkingGap({ scheduleMonth, holidayItems, overview }));
      })
      .catch(() => {
        if (!cancelled) {
          setHolidayGap(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [overview, scheduleMonth]);

  useEffect(() => {
    if (historyCollapsed) {
      return;
    }

    let active = true;

    const loadApprovalHistory = async () => {
      setIsHistoryLoading(true);
      setHistoryError(null);

      try {
        const result = await window.appBridge.listApprovalHistory();

        if (!active) {
          return;
        }

        if (!result.ok) {
          setApprovalHistory([]);
          setHistoryError(result.message);
          return;
        }

        setApprovalHistory(result.data);
      } catch (error) {
        if (active) {
          setApprovalHistory([]);
          setHistoryError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsHistoryLoading(false);
        }
      }
    };

    void loadApprovalHistory();

    return () => {
      active = false;
    };
  }, [historyCollapsed, refreshKey]);

  useEffect(() => {
    if (!isLoading) {
      const timeout = window.setTimeout(() => {
        setSyncProgress(null);
      }, 700);

      return () => {
        window.clearTimeout(timeout);
      };
    }

    let active = true;

    const pollSyncState = async () => {
      try {
        const result = await window.appBridge.getPerformanceSyncState();

        if (!active || !result.ok) {
          return;
        }

        setSyncProgress(shouldShowSyncProgress(result.data) ? result.data : null);
      } catch {
        if (active) {
          setSyncProgress(null);
        }
      }
    };

    void pollSyncState();
    const interval = window.setInterval(() => {
      void pollSyncState();
    }, 220);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isLoading]);

  useEffect(() => {
    const siteNames = overview?.groups.map((group) => group.siteName) ?? [];

    setExpandedSites((current) => {
      const filtered = current.filter((siteName) => siteNames.includes(siteName));
      return filtered.length > 0 ? filtered : siteNames;
    });
  }, [overview]);

  const availableSiteNames = useMemo(
    () =>
      [...new Set((overview?.groups ?? []).map((group) => group.siteName))]
        .filter((siteName) => siteName.length > 0)
        .sort((left, right) => left.localeCompare(right, "ko")),
    [overview]
  );

  useEffect(() => {
    if (selectedSiteName === "all") {
      return;
    }

    if (!availableSiteNames.includes(selectedSiteName)) {
      setSelectedSiteName("all");
    }
  }, [availableSiteNames, selectedSiteName]);

  useEffect(() => {
    if (!hourlyRateEditor) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      hourlyRateInputRef.current?.focus();
      hourlyRateInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [Boolean(hourlyRateEditor)]);

  const availableYears = useMemo(
    () => buildAvailableYears(overview, approvalHistory, selectedYear),
    [approvalHistory, overview, selectedYear]
  );

  useEffect(() => {
    const nextYear = availableYears[0];

    if (!nextYear) {
      return;
    }

    if (selectedYear !== ALL_PERIOD_FILTER && !availableYears.includes(selectedYear)) {
      setSelectedYear(nextYear);
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    let active = true;

    const loadHolidayNames = async () => {
      if (!isValidYearValue(selectedYear)) {
        if (active) {
          setHolidayNamesByDate({});
        }
        return;
      }

      try {
        const result = await window.appBridge.listHolidayCalendars(Number(selectedYear));

        if (!active) {
          return;
        }

        if (!result.ok) {
          setHolidayNamesByDate({});
          return;
        }

        setHolidayNamesByDate(
          Object.fromEntries(
            result.data.flatMap((calendar) =>
              calendar.items.map((item) => [item.holidayDate, item.name] as const)
            )
          )
        );
      } catch {
        if (active) {
          setHolidayNamesByDate({});
        }
      }
    };

    void loadHolidayNames();

    return () => {
      active = false;
    };
  }, [refreshKey, selectedYear]);

  const filteredApprovalHistory = useMemo(
    () =>
      approvalHistory.filter((record) => {
        if (!matchesPeriodFilter(record.workDate, selectedYear, selectedMonth)) {
          return false;
        }

        if (selectedSiteName !== "all") {
          const siteScheduleKeys = new Set(
            (overview?.groups ?? [])
              .filter((group) => group.siteName === selectedSiteName)
              .flatMap((group) => group.rows.map((row) => row.logicalKey.split(":").slice(0, -1).join(":")))
          );

          if (siteScheduleKeys.size > 0 && !siteScheduleKeys.has(record.scheduleKey)) {
            return false;
          }
        }

        if (sectionFilter === "all") {
          return true;
        }

        return toSection(record) === sectionFilter;
      }),
    [approvalHistory, overview, sectionFilter, selectedMonth, selectedSiteName, selectedYear]
  );
  const approvalActionLabelById = useMemo(() => {
    const labels = new Map<string, "승인" | "재승인">();
    const seenCountByKey = new Map<string, number>();

    [...approvalHistory]
      .sort(
        (left, right) =>
          left.processedAt.localeCompare(right.processedAt) || left.id.localeCompare(right.id)
      )
      .forEach((record) => {
        const key = getApprovalHistoryKey(record);
        const seenCount = seenCountByKey.get(key) ?? 0;

        labels.set(record.id, seenCount > 0 ? "재승인" : "승인");
        seenCountByKey.set(key, seenCount + 1);
      });

    return labels;
  }, [approvalHistory]);

  const filteredGroups = useMemo(
    () =>
      (overview?.groups ?? [])
        .filter((group) => selectedSiteName === "all" || group.siteName === selectedSiteName)
        .map((group) =>
          rebuildPerformanceGroup(
            group,
            group.rows.filter((row) =>
              matchesPeriodFilter(row.entry.workDate, selectedYear, selectedMonth)
            )
          )
        )
        .filter((group) => group.rows.length > 0),
    [overview, selectedMonth, selectedSiteName, selectedYear]
  );

  const visibleRows = useMemo(
    () => filteredGroups.flatMap((group) => group.rows),
    [filteredGroups]
  );

  const approvableRows = useMemo(
    () => visibleRows.filter((row) => row.canApprove),
    [visibleRows]
  );

  const nonPayablePoolSubstituteCount = useMemo(
    () => visibleRows.filter((row) => isNonPayablePoolSubstitutePerformanceEntry(row.entry)).length,
    [visibleRows]
  );

  const filteredReapprovalFiles = useMemo(
    () =>
      (overview?.reapprovalFiles ?? []).filter(
        (file) =>
          (selectedSiteName === "all" || file.siteName === selectedSiteName) &&
          matchesPeriodFilter(`${file.scheduleMonth}-01`, selectedYear, selectedMonth)
      ),
    [overview, selectedMonth, selectedSiteName, selectedYear]
  );

  // The "승인대기로 되돌리기" action is file-level, so render its button once per approved file
  // (on the file's first visible row) instead of repeating it on every row.
  const firstReturnRowIdByFile = useMemo(() => {
    const map = new Map<string, string>();

    visibleRows.forEach((row) => {
      if (row.sourceDirectoryType !== "approved") {
        return;
      }

      if (!map.has(row.fileId)) {
        map.set(row.fileId, row.rowId);
      }
    });

    return map;
  }, [visibleRows]);

  // Files whose auto-archive was held back by the holiday-gap guard: still in 승인대기, every payable
  // row already approved, and not part of the reapproval cycle. These are the files the "이대로
  // 승인완료" escape hatch finalizes when the operator confirms there really was no holiday work.
  const holidayHeldFiles = useMemo(() => {
    const byFile = new Map<
      string,
      { fileId: string; fileName: string; rows: PerformanceOverviewRow[] }
    >();

    visibleRows.forEach((row) => {
      if (row.sourceDirectoryType !== "pending") {
        return;
      }

      if (isNonPayablePoolSubstitutePerformanceEntry(row.entry)) {
        return;
      }

      const bucket = byFile.get(row.fileId) ?? {
        fileId: row.fileId,
        fileName: row.sourceFileName,
        rows: []
      };
      bucket.rows.push(row);
      byFile.set(row.fileId, bucket);
    });

    return [...byFile.values()].filter(
      (file) =>
        file.rows.length > 0 &&
        file.rows.every(
          (row) => row.approvalStatus === "approved" && row.reapprovalStatus === "none"
        )
    );
  }, [visibleRows]);

  const handleApproveRows = async (rows: PerformanceOverviewRow[], processingLabel: string) => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    if (rows.length === 0) {
      setActionError("승인할 실적이 없습니다. 표에서 승인할 실적을 먼저 선택해 주세요.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(processingLabel);

    try {
      let successCount = 0;
      const failedMessages: string[] = [];
      let sawAlreadyApprovedBlock = false;

      for (const row of rows) {
        const result = await window.appBridge.approvePendingFile({
          fileId: row.fileId,
          entryId: row.entryId
        });

        if (!result.ok) {
          if (result.errorCode === "PERFORMANCE_ALREADY_APPROVED") {
            sawAlreadyApprovedBlock = true;
          }

          failedMessages.push(`${row.entry.employeeName}: ${result.message}`);
          continue;
        }

        successCount += 1;
      }

      if (successCount > 0) {
        setActionMessage(`${successCount}건의 실적을 승인하고 품의 이력에 반영했습니다.`);
        await showActionResultDialog(askQuestion, {
          title: "실적 승인 완료",
          message: `${successCount}건의 실적을 승인하고 품의 이력에 반영했습니다.`,
          description:
            failedMessages.length > 0
              ? `실패 ${failedMessages.length}건은 화면 오류 안내에서 확인할 수 있습니다.`
              : undefined
        });
      }

      if (failedMessages.length > 0) {
        setActionError(failedMessages.join(" / "));
      }

      // Every (or the only) row came back "이미 승인 처리됨" — the tell-tale of a hand-moved file that
      // left a phantom 승인완료 record. Don't leave the operator staring at a bare error: walk them
      // through why it is stuck and how to undo it.
      if (sawAlreadyApprovedBlock && successCount === 0) {
        showGuidance(buildHandMovedFileGuidance());
      }

      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleOpenComparison = async (row: PerformanceOverviewRow) => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    setActionError(null);
    setHourlyRateEditor(null);
    setComparisonModal({
      row,
      detail: null,
      isLoading: true,
      manualHourlyRate: null
    });

    try {
      const result = await window.appBridge.getPerformanceComparison({
        fileId: row.fileId,
        entryId: row.entryId
      });

      if (!result.ok) {
        setActionError(result.message);
        setComparisonModal(null);
        return;
      }

      if (!result.data) {
        setActionError("비교할 승인 이력을 찾지 못했습니다.");
        setComparisonModal(null);
        return;
      }

      setComparisonModal({
        row,
        detail: result.data,
        isLoading: false,
        manualHourlyRate: null
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
      setComparisonModal(null);
    }
  };

  const handleOpenHourlyRateEditor = () => {
    if (!comparisonModal?.detail) {
      return;
    }

    const defaultValue = comparisonModal.manualHourlyRate
      ? String(comparisonModal.manualHourlyRate)
      : comparisonModal.detail.currentEntry.hourlyRate
        ? String(comparisonModal.detail.currentEntry.hourlyRate)
        : "";

    setHourlyRateEditor({
      draft: defaultValue,
      error: null
    });
  };

  const updateCurrentEmployeeWageRate = async (input: {
    hourlyRate: number;
    clickedAt: Date;
  }) => {
    if (!comparisonModal?.detail) {
      throw new Error("시급을 갱신할 재승인 정보를 찾을 수 없습니다.");
    }

    const currentEntry = comparisonModal.detail.currentEntry;
    const normalizedEmployeeCode = currentEntry.employeeCode.trim();
    const normalizedEmployeeName = currentEntry.employeeName.trim();
    const employeeQuery = normalizedEmployeeCode || normalizedEmployeeName;

    if (!employeeQuery) {
      throw new Error("시급을 갱신할 직원 정보를 찾을 수 없습니다.");
    }

    const employeeResult = await window.appBridge.listEmployees({
      keyword: employeeQuery
    });

    if (!employeeResult.ok) {
      throw new Error(employeeResult.message);
    }

    const matchedByCode = normalizedEmployeeCode
      ? employeeResult.data.find((employee) => employee.employeeCode === normalizedEmployeeCode)
      : undefined;
    const matchedByName = normalizedEmployeeName
      ? employeeResult.data.filter((employee) => employee.name === normalizedEmployeeName)
      : [];
    const matchedEmployee = matchedByCode ?? (matchedByName.length === 1 ? matchedByName[0] : null);

    if (!matchedEmployee) {
      throw new Error(
        matchedByName.length > 1
          ? `${normalizedEmployeeName} 동명이인이 있어 시급정보를 자동 갱신할 수 없습니다.`
          : `${normalizedEmployeeName || normalizedEmployeeCode} 직원을 찾을 수 없습니다.`
      );
    }

    const effectiveFrom = toLocalDateValue(input.clickedAt);
    const wageResult = await window.appBridge.saveEmployeeWageRate({
      employeeId: matchedEmployee.id,
      hourlyRate: input.hourlyRate,
      effectiveFrom,
      reason: `실적 재승인 임의 시급 적용 (${comparisonModal.detail.currentFile.fileName})`
    });

    if (!wageResult.ok) {
      throw new Error(wageResult.message);
    }

    return wageResult.data;
  };

  const handleConfirmManualHourlyRate = async () => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    if (!hourlyRateEditor || !comparisonModal) {
      return;
    }

    const normalized = hourlyRateEditor.draft.replaceAll(",", "").trim();
    const parsed = Number(normalized);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      setHourlyRateEditor((current) =>
        current
          ? {
              ...current,
              error: "시급은 0보다 큰 정수로 입력해야 합니다."
            }
          : current
      );
      return;
    }

    let wageUpdated = false;
    const shouldUpdateCurrentWage = await askQuestion({
      title: "시급정보 업데이트 확인",
      message: "현재 시급정보를 업데이트 하시겠습니까?",
      confirmLabel: "업데이트",
      confirmVariant: "primary"
    });

    if (shouldUpdateCurrentWage.confirmed) {
      const clickedAt = new Date();
      const shouldProceedWageUpdate = await askQuestion({
        title: "시급 이력 기준일 확인",
        message: [
          `시급 정의 날짜를 ${formatDateTime(clickedAt.toISOString())} 기준으로 진행하겠습니다.`,
          `시급 이력에는 ${toLocalDateValue(clickedAt)} 기준일로 저장됩니다.`,
          "동의하십니까?"
        ].join("\n"),
        confirmLabel: "동의",
        confirmVariant: "primary"
      });

      if (shouldProceedWageUpdate.confirmed) {
        try {
          await updateCurrentEmployeeWageRate({
            hourlyRate: parsed,
            clickedAt
          });
          wageUpdated = true;
        } catch (error) {
          setHourlyRateEditor((current) =>
            current
              ? {
                  ...current,
                  error: getErrorMessage(error)
                }
              : current
          );
          return;
        }
      }
    }

    setComparisonModal((current) =>
      current
        ? {
            ...current,
            manualHourlyRate: parsed
          }
        : current
    );
    setHourlyRateEditor(null);
    setActionError(null);
    setActionMessage(
      wageUpdated
        ? "현재 시급정보를 갱신하고 재승인 계산에 임의 시급을 적용했습니다."
        : "재승인 계산에 임의 시급을 적용했습니다."
    );
  };

  const handleReapprove = async () => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    if (!comparisonModal?.detail) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(`reapprove:${comparisonModal.row.entryId}`);

    try {
      const result = await window.appBridge.approvePendingFile({
        fileId: comparisonModal.detail.currentFile.id,
        entryId: comparisonModal.detail.currentEntry.id,
        manualHourlyRate: comparisonModal.manualHourlyRate ?? undefined
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setHourlyRateEditor(null);
      setComparisonModal(null);
      setActionMessage(
        `${comparisonModal.detail.currentEntry.employeeName} 실적을 재승인하고 품의 이력을 갱신했습니다.`
      );
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "실적 재승인 완료",
        message: `${comparisonModal.detail.currentEntry.employeeName} 실적을 재승인했습니다.`
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleFinalizeReapprovedFile = async (file: PerformanceReapprovalFileSummary) => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    if (!file.canFinalize) {
      setActionError("변경 가능한 모든 실적을 현재 파일 기준으로 재승인한 뒤 확정할 수 있습니다.");
      return;
    }

    const confirmed = await askQuestion({
      title: "재승인본 확정 확인",
      message: [
        `${file.fileName} 재승인본을 승인완료로 확정하시겠습니까?`,
        "",
        "변경 가능한 모든 행은 현재 파일 기준으로 재승인되어야 하며,",
        "품의승인으로 잠긴 행은 기존 승인 내용을 유지합니다.",
        "확정 후 파일은 승인완료 폴더로 이동합니다."
      ].join("\n"),
      confirmLabel: "확정",
      confirmVariant: "primary"
    });

    if (!confirmed.confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(`finalize:${file.fileId}`);

    try {
      const result = await window.appBridge.finalizeReapprovedFile({
        fileId: file.fileId
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(
        `${file.fileName} 재승인본을 승인완료 폴더로 이동하고 최신본으로 확정했습니다.`
      );
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "재승인본 확정 완료",
        message: `${file.fileName} 재승인본을 승인완료로 확정했습니다.`
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleReturnApprovedToPending = async (file: { fileId: string; fileName: string }) => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    const confirmed = await askQuestion({
      title: "승인대기로 되돌리기 확인",
      message: [
        `${file.fileName} 파일을 승인대기로 되돌리시겠습니까?`,
        "",
        "되돌리면 이 파일의 기존 승인 내용은 지워지고,",
        "승인대기에서 처음부터 다시 승인할 수 있습니다.",
        "수당 품의가 승인된 파일은 되돌릴 수 없습니다."
      ].join("\n"),
      confirmLabel: "되돌리기",
      confirmVariant: "primary"
    });

    if (!confirmed.confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(`return:${file.fileId}`);

    try {
      const result = await window.appBridge.returnApprovedFileToPending({
        fileId: file.fileId
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(`${file.fileName} 파일을 승인대기로 되돌렸습니다.`);
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "되돌리기 완료",
        message: `${file.fileName} 파일을 승인대기로 되돌렸습니다. 승인대기 목록에서 다시 승인할 수 있습니다.`
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleArchiveHolidayHeldFiles = async () => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    if (holidayHeldFiles.length === 0) {
      return;
    }

    const confirmed = await askQuestion({
      title: "공휴일 없이 승인완료",
      message: [
        "이 달은 공휴일 근무가 표시되지 않았지만, 실제로 공휴일에 일한 사람이 없다면",
        "지금까지 승인한 내용 그대로 승인완료로 옮길 수 있습니다.",
        "",
        `대상 파일 ${holidayHeldFiles.length}개를 승인완료로 옮기시겠습니까?`
      ].join("\n"),
      confirmLabel: "승인완료로 이동",
      confirmVariant: "primary"
    });

    if (!confirmed.confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey("archive-held");

    try {
      let archivedCount = 0;
      const failedMessages: string[] = [];

      for (const file of holidayHeldFiles) {
        const result = await window.appBridge.finalizeReapprovedFile({
          fileId: file.fileId
        });

        if (result.ok) {
          archivedCount += 1;
        } else {
          failedMessages.push(`${file.fileName}: ${result.message}`);
        }
      }

      if (archivedCount > 0) {
        setActionMessage(`${archivedCount}개 파일을 승인완료로 옮겼습니다.`);
        setRefreshKey((current) => current + 1);
      }

      if (failedMessages.length > 0) {
        setActionError(failedMessages.join("\n"));
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleOpenSourceFile = async (fileId: string) => {
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await window.appBridge.openPerformanceSourceFile(fileId);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage("원본 Excel 파일을 열었습니다.");
      await showActionResultDialog(askQuestion, {
        title: "원본 파일 열기 완료",
        message: "원본 Excel 파일을 열었습니다."
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const handleOpenEmployeeInfo = async (row: PerformanceOverviewRow) => {
    const normalizedEmployeeName = parsePoolWorkerDisplayName(row.entry.employeeName).employeeName;
    const employeeKeyword = row.entry.employeeCode.trim() || normalizedEmployeeName;

    setActionError(null);
    setEmployeeInfoModal({
      row,
      employee: null,
      wageRates: [],
      isLoading: true,
      error: null
    });

    try {
      const employeeResult = await window.appBridge.listEmployees({
        keyword: employeeKeyword
      });

      if (!employeeResult.ok) {
        throw new Error(employeeResult.message);
      }

      const employee = selectEmployeeForPerformanceEntry(employeeResult.data, row.entry);
      const wageRateResult = employee
        ? await window.appBridge.listEmployeeWageRates(employee.id)
        : null;

      if (wageRateResult && !wageRateResult.ok) {
        throw new Error(wageRateResult.message);
      }

      setEmployeeInfoModal({
        row,
        employee,
        wageRates: wageRateResult?.data ?? [],
        isLoading: false,
        error: employee ? null : `${normalizedEmployeeName} 인력 기본정보를 찾지 못했습니다.`
      });
    } catch (error) {
      setEmployeeInfoModal((current) =>
        current
          ? {
              ...current,
              isLoading: false,
              error: getErrorMessage(error)
            }
          : current
      );
    }
  };

  const handleHideApprovedRow = async (row: PerformanceOverviewRow) => {
    if (!canManagePerformanceApprovals) {
      setActionError("실적 승인 권한이 필요합니다.");
      return;
    }

    if (!row.latestApprovalId) {
      setActionError("최신 승인 이력을 찾을 수 없습니다.");
      return;
    }

    const confirmed = await askQuestion({
      title: "승인완료 행 숨김 확인",
      message: [
        `${row.entry.employeeName} ${row.entry.workDate} 승인완료 행을 목록에서 숨길까요?`,
        "",
        "원본 파일, 승인 이력, 품의 이력은 유지됩니다.",
        "이 작업은 승인완료 목록 표시만 정리합니다."
      ].join("\n"),
      confirmLabel: "숨김",
      confirmVariant: "danger"
    });

    if (!confirmed.confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(`hide:${row.latestApprovalId}`);

    try {
      const result = await window.appBridge.hideApprovedRow({
        approvalId: row.latestApprovalId
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setActionMessage(`${row.entry.employeeName} ${row.entry.workDate} 행을 승인완료 목록에서 숨겼습니다.`);
      setRefreshKey((current) => current + 1);
      await showActionResultDialog(askQuestion, {
        title: "목록 정리 완료",
        message: `${row.entry.employeeName} ${row.entry.workDate} 행을 승인완료 목록에서 숨겼습니다.`
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const comparisonRows = comparisonModal?.detail
    ? buildComparisonRows(comparisonModal.detail, comparisonModal.manualHourlyRate)
    : [];
  const employeeInfoActiveWageRate = employeeInfoModal
    ? resolveWageRateForDate(employeeInfoModal.wageRates, employeeInfoModal.row.entry.workDate)
    : undefined;
  const employeeInfoIsNonPayable = employeeInfoModal
    ? isNonPayablePoolSubstitutePerformanceEntry(employeeInfoModal.row.entry)
    : false;
  const reapprovalFiles = filteredReapprovalFiles;
  const reapprovalPendingFileCount = reapprovalFiles.filter(
    (file) => file.reapprovalPendingCount > 0
  ).length;
  const reapprovalLockedEntryCount = reapprovalFiles.reduce(
    (sum, file) => sum + file.lockedEntryCount,
    0
  );
  const changeLockedRowCount = visibleRows.filter((row) => row.isChangeLocked).length;
  const syncProgressPercent = syncProgress ? getSyncProgressPercent(syncProgress) : 0;

  return (
    <div className="screen-stack performance-screen">
      {holidayGap && dismissedHolidayHintMonth !== holidayGap.scheduleMonth ? (
        <section className="surface-card performance-page-card performance-recovery-notice">
          <div className="section-heading compact-heading">
            <div>
              <h3>이 달 공휴일 근무가 표시되지 않았을 수 있습니다</h3>
              <p>
                {holidayGap.scheduleMonth}에 공휴일({holidayGap.holidayLabels.join(", ")})이 등록돼
                있는데 휴일 근무로 잡힌 줄이 하나도 없습니다. 휴일에 일한 사람이 있었다면 근무표에
                공휴일 표시가 빠진 것일 수 있습니다.
              </p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  showGuidance(buildHolidayMissingGuidance(holidayGap));
                }}
              >
                왜 그런지 · 해결 방법
              </button>
              {canManagePerformanceApprovals && holidayHeldFiles.length > 0 ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={isProcessing}
                  onClick={() => {
                    void handleArchiveHolidayHeldFiles();
                  }}
                  title="공휴일 근무가 정말 없다면 이대로 승인완료로 옮깁니다."
                >
                  {processingKey === "archive-held" ? "이동 중..." : "이대로 승인완료"}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDismissedHolidayHintMonth(holidayGap.scheduleMonth)}
              >
                닫기
              </button>
            </div>
          </div>
        </section>
      ) : null}
      <section className="surface-card performance-page-card performance-summary-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>실적 관리</h3>
            <p>근무지 기준으로 실적을 묶어 검토하고, 승인 즉시 수당실적으로 반영합니다.</p>
          </div>
          <div className="button-row">
            <span className="pill neutral">근무지 {filteredGroups.length}곳</span>
            <span className="pill info">
              승인 {visibleRows.filter((row) => row.approvalStatus === "approved").length}건
            </span>
            <span className="pill warn">
              반려 {visibleRows.filter((row) => row.approvalStatus === "rejected").length}건
            </span>
            {nonPayablePoolSubstituteCount > 0 ? (
              <span className="pill neutral">수당 미지급 {nonPayablePoolSubstituteCount}건</span>
            ) : null}
            <span className="pill warn">
              재검토 {visibleRows.filter((row) => row.needsReapproval).length}건
            </span>
            {changeLockedRowCount > 0 ? (
              <span className="pill neutral">변경불가 {changeLockedRowCount}건</span>
            ) : null}
            {reapprovalFiles.length > 0 ? (
              <span className="pill neutral">재승인 파일 {reapprovalFiles.length}건</span>
            ) : null}
            {reapprovalFiles.length > 0 ? (
              <span className="pill info">재승인 완료 {reapprovalFiles.length - reapprovalPendingFileCount}건</span>
            ) : null}
            {reapprovalPendingFileCount > 0 ? (
              <span className="pill warn">재승인 대기 {reapprovalPendingFileCount}건</span>
            ) : null}
          </div>
        </div>

        <div className="performance-section">
          <strong>상세 필터</strong>
          <div className="filter-grid performance-dashboard-filter-grid">
            <label className="field filter-field filter-field-xs">
              <span>연도</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setSelectedYear(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={selectedYear}
              >
                {approvalScope !== "approved" ? (
                  <option value={ALL_PERIOD_FILTER}>전체</option>
                ) : null}
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </FormSelect>
            </label>

            <label className="field filter-field filter-field-xs">
              <span>월</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={selectedMonth}
              >
                {approvalScope !== "approved" ? (
                  <option value={ALL_PERIOD_FILTER}>전체</option>
                ) : null}
                {Array.from({ length: 12 }, (_, index) => {
                  const month = String(index + 1).padStart(2, "0");

                  return (
                    <option key={month} value={month}>
                      {Number(month)}월
                    </option>
                  );
                })}
              </FormSelect>
            </label>

            <label className="field filter-field filter-field-md">
              <span>근무지명</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setSelectedSiteName(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={selectedSiteName}
              >
                <option value="all">전체</option>
                {availableSiteNames.map((siteName) => (
                  <option key={siteName} value={siteName}>
                    {siteName}
                  </option>
                ))}
              </FormSelect>
            </label>

            <label className="field filter-field filter-field-sm performance-scope-filter-field">
              <span>조회구분</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  const nextScope = event.target.value as PerformanceApprovalScope;

                  setApprovalScope(nextScope);

                  if (nextScope === "approved") {
                    if (selectedYear === ALL_PERIOD_FILTER) {
                      setSelectedYear(createCurrentYear());
                    }

                    if (selectedMonth === ALL_PERIOD_FILTER) {
                      setSelectedMonth(createCurrentMonth());
                    }
                  }
                }}
                selectClassName="top-filter-select"
                value={approvalScope}
              >
                <option value="pending">승인대기</option>
                <option value="approved">{approvalScopeLabel.approved}</option>
              </FormSelect>
            </label>

            <label className="field filter-field filter-field-sm">
              <span>근로유형</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setSectionFilter(event.target.value as PerformanceEntrySection | "all");
                }}
                selectClassName="top-filter-select"
                value={sectionFilter}
              >
                <option value="all">전체유형</option>
                <option value="substitute">대체근무</option>
                <option value="overtime">연장근무</option>
                <option value="legal-holiday">법정휴일근무</option>
              </FormSelect>
            </label>

            <div className="button-row align-end performance-filter-actions">
              <button
                aria-label="전체 펼치기"
                className="performance-filter-icon-button"
                onClick={() => {
                  setExpandedSites(filteredGroups.map((group) => group.siteName));
                }}
                title="전체 펼치기"
                type="button"
              >
                ▾▾
              </button>
              <button
                aria-label="전체 접기"
                className="performance-filter-icon-button"
                onClick={() => {
                  setExpandedSites([]);
                }}
                title="전체 접기"
                type="button"
              >
                ▴▴
              </button>
              <button
                aria-label="새로고침"
                className="performance-filter-icon-button"
                onClick={() => {
                  forceReparseOnNextLoadRef.current = true;
                  setRefreshKey((current) => current + 1);
                }}
                title="새로고침"
                type="button"
              >
                ↻
              </button>
              {canManagePerformanceApprovals ? (
                <button
                  aria-label={processingKey === "__approve-all__" ? "일괄 승인 중" : "일괄 승인"}
                  className="performance-filter-icon-button primary"
                  disabled={approvableRows.length === 0 || isProcessing}
                  onClick={() => {
                    void handleApproveRows(approvableRows, "__approve-all__");
                  }}
                  title={processingKey === "__approve-all__" ? "일괄 승인 중" : "일괄 승인"}
                  type="button"
                >
                  {processingKey === "__approve-all__" ? "…" : "✓"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
        {screenNotice ? <p className="field-hint">{screenNotice}</p> : null}
        {actionError ? <p className="form-error-text">{actionError}</p> : null}
        {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}
      </section>

      {reapprovalFiles.length > 0 ? (
        <section className="surface-card performance-reapproval-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>재승인 확정</h3>
              <p>승인완료 보관본이 다시 승인대기로 들어오면, 변경 가능한 모든 행을 현재 파일 기준으로 다시 승인한 뒤 파일 단위로 확정합니다.</p>
            </div>
            <div className="button-row">
              <span className="pill neutral">대상 {reapprovalFiles.length}건</span>
              <span className="pill warn">재승인 대기 {reapprovalPendingFileCount}건</span>
              {reapprovalLockedEntryCount > 0 ? (
                <span className="pill neutral">변경불가 {reapprovalLockedEntryCount}행</span>
              ) : null}
            </div>
          </div>
          <div className="performance-reapproval-list">
            {reapprovalFiles.map((file) => (
              <article
                className={`performance-reapproval-item ${file.reapprovalPendingCount === 0 ? "is-ready" : ""}`}
                key={file.fileId}
              >
                <div className="performance-reapproval-copy">
                  <strong>{file.fileName}</strong>
                  <p>
                    {file.siteName || "근무지 미확인"} / {formatDateTime(file.receivedAt)}
                  </p>
                  <p className="field-hint">
                    파일 단위 집계입니다. 상세 필터의 근로유형과 무관하게 전체 행 상태로 계산합니다.
                  </p>
                </div>
                <div className="performance-reapproval-meta">
                  <div className="button-row">
                    <span className="pill neutral">
                      현재 파일 승인 {file.resolvedApprovedEntryCount}/{file.entryCount}행
                    </span>
                    {file.reapprovalCompletedCount > 0 ? (
                      <span className="pill info">재승인 완료 {file.reapprovalCompletedCount}행</span>
                    ) : null}
                    {file.reapprovalPendingCount > 0 ? (
                      <span className="pill warn">재승인 대기 {file.reapprovalPendingCount}행</span>
                    ) : null}
                    {file.lockedEntryCount > 0 ? (
                      <span className="pill neutral">변경불가 {file.lockedEntryCount}행</span>
                    ) : null}
                    {file.needsReapprovalCount > 0 ? (
                      <span className="pill warn">재검토 {file.needsReapprovalCount}행</span>
                    ) : null}
                  </div>
                  {!file.canFinalize ? (
                    <p className="field-hint">변경 가능한 모든 행을 현재 파일 기준으로 재승인해야 확정할 수 있습니다.</p>
                  ) : null}
                  {canManagePerformanceApprovals ? (
                    <button
                      className="primary-button compact-button"
                      disabled={isProcessing || !file.canFinalize}
                      onClick={() => {
                        void handleFinalizeReapprovedFile(file);
                      }}
                      title={
                        file.canFinalize
                          ? "재승인본을 승인완료 보관본으로 확정"
                          : "변경 가능한 모든 행을 현재 파일 기준으로 재승인해야 합니다."
                      }
                      type="button"
                    >
                      {processingKey === `finalize:${file.fileId}` ? "확정 중..." : "재승인 확정"}
                    </button>
                  ) : (
                    <span className="field-hint">실적 승인 권한 필요</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface-card performance-table-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>실적 현황</h3>
            <p>근무지별 접기/펼치기와 조별 묶음으로 대체근무, 연장근무, 법정휴일근무 실적을 검토합니다.</p>
          </div>
          <div className="performance-table-header-meta">
            <div className="button-row">
              <span className="pill neutral">{approvalScopeLabel[approvalScope]}</span>
              <span className="pill neutral">
                {selectedSiteName === "all" ? "전체 근무지" : selectedSiteName}
              </span>
              <span className="pill neutral">{sectionLabel[sectionFilter]}</span>
              <span className="pill neutral">{periodFilterLabel}</span>
            </div>
          </div>
        </div>

        <div className="data-scroll performance-table-scroll">
          <table className="info-table compact-table performance-overview-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>근무예정자</th>
                <th>근무대체자</th>
                <th>근로유형</th>
                <th>일자</th>
                <th>시작/종료</th>
                <th>근무 요약</th>
                <th>승인상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9}>실적 현황을 불러오는 중입니다.</td>
                </tr>
              ) : filteredGroups.length > 0 ? (
                filteredGroups.map((group) => {
                  const isExpanded = expandedSites.includes(group.siteName);
                  const siteApprovableRows = group.rows.filter((row) => row.canApprove);
                  const reapprovalPendingCount = group.rows.filter(
                    (row) => row.reapprovalStatus === "pending"
                  ).length;
                  const reapprovalCompletedCount = group.rows.filter(
                    (row) => row.reapprovalStatus === "completed"
                  ).length;
                  const changeLockedCount = group.rows.filter((row) => row.isChangeLocked).length;
                  const hourlyRateUnappliedCount = group.rows.filter((row) =>
                    isHourlyRateUnappliedPerformanceEntry(row.entry)
                  ).length;
                  const siteNonPayablePoolSubstituteCount = group.rows.filter((row) =>
                    isNonPayablePoolSubstitutePerformanceEntry(row.entry)
                  ).length;
                  const siteStatus = (() => {
                    if (group.pendingCount > 0) {
                      return { label: `${group.pendingCount}건 대기`, tone: "warn" };
                    }

                    if (group.rejectedCount > 0) {
                      return { label: `${group.rejectedCount}건 반려`, tone: "warn" };
                    }

                    if (group.needsReapprovalCount > 0) {
                      return { label: `${group.needsReapprovalCount}건 재검토`, tone: "warn" };
                    }

                    if (reapprovalPendingCount > 0) {
                      return { label: `${reapprovalPendingCount}건 재승인 대기`, tone: "warn" };
                    }

                    if (reapprovalCompletedCount > 0) {
                      return { label: `${reapprovalCompletedCount}건 재승인 완료`, tone: "info" };
                    }

                    if (changeLockedCount > 0) {
                      return { label: `${changeLockedCount}건 변경불가`, tone: "neutral" };
                    }

                    if (siteNonPayablePoolSubstituteCount > 0) {
                      return {
                        label: `${siteNonPayablePoolSubstituteCount}건 수당 미지급`,
                        tone: "neutral"
                      };
                    }

                    return { label: "승인 반영", tone: "info" };
                  })();

                  return (
                    <Fragment key={group.siteName}>
                      <tr className="performance-site-summary-row" key={`${group.siteName}-summary`}>
                        <td>
                          <span className="pill neutral">근무지</span>
                        </td>
                        <td className="table-strong performance-worker-cell performance-site-name-cell">
                          {group.siteName}
                        </td>
                        <td colSpan={5}>
                          <div className="performance-site-summary-pills">
                            <span className="pill neutral">실적 {group.rowCount}건</span>
                            <span className="pill info">승인 {group.approvedCount}건</span>
                            {group.rejectedCount > 0 ? (
                              <span className="pill warn">반려 {group.rejectedCount}건</span>
                            ) : null}
                            <span className="pill warn">재검토 {group.needsReapprovalCount}건</span>
                            {reapprovalPendingCount > 0 ? (
                              <span className="pill neutral">재승인 대기 {reapprovalPendingCount}건</span>
                            ) : null}
                            {reapprovalCompletedCount > 0 ? (
                              <span className="pill info">재승인 완료 {reapprovalCompletedCount}건</span>
                            ) : null}
                            {changeLockedCount > 0 ? (
                              <span className="pill neutral">변경불가 {changeLockedCount}건</span>
                            ) : null}
                            {hourlyRateUnappliedCount > 0 ? (
                              <span className="pill warn">시급미반영 {hourlyRateUnappliedCount}건</span>
                            ) : null}
                            {siteNonPayablePoolSubstituteCount > 0 ? (
                              <span className="pill neutral">
                                수당 미지급 {siteNonPayablePoolSubstituteCount}건
                              </span>
                            ) : null}
                            <span className="pill neutral">알림 {group.alertCount}건</span>
                          </div>
                        </td>
                        <td>
                          <span className={`pill ${siteStatus.tone}`}>{siteStatus.label}</span>
                        </td>
                        <td>
                          <div className="performance-site-actions">
                            {canManagePerformanceApprovals ? (
                              <button
                                className="primary-button compact-button"
                                disabled={siteApprovableRows.length === 0 || isProcessing}
                                onClick={() => {
                                  void handleApproveRows(siteApprovableRows, `site:${group.siteName}`);
                                }}
                                type="button"
                              >
                                {processingKey === `site:${group.siteName}` ? "승인 중..." : "승인"}
                              </button>
                            ) : null}
                            <button
                              className={isExpanded ? "icon-button active" : "icon-button"}
                              onClick={() => {
                                setExpandedSites((current) =>
                                  current.includes(group.siteName)
                                    ? current.filter((siteName) => siteName !== group.siteName)
                                    : [...current, group.siteName]
                                );
                              }}
                              type="button"
                            >
                              {isExpanded ? "접기" : "펼치기"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded
                        ? groupPerformanceRowsByDateAndTeam(group.rows).map((teamGroup) => (
                            <Fragment key={`${group.siteName}:${teamGroup.groupKey}`}>
                              <tr className="performance-team-summary-row">
                                <td>
                                  <span className="performance-entry-kind">{teamGroup.teamLabel}</span>
                                </td>
                                <td className="table-strong performance-worker-cell">
                                  {formatDate(teamGroup.workDate)} 조별 소계
                                </td>
                                <td colSpan={6}>
                                  <div className="performance-site-summary-pills">
                                    <span className="pill neutral">실적 {teamGroup.rowCount}건</span>
                                    <span className="pill info">승인 {teamGroup.approvedCount}건</span>
                                    {teamGroup.pendingCount > 0 ? (
                                      <span className="pill warn">대기 {teamGroup.pendingCount}건</span>
                                    ) : null}
                                    {teamGroup.rejectedCount > 0 ? (
                                      <span className="pill warn">반려 {teamGroup.rejectedCount}건</span>
                                    ) : null}
                                    {teamGroup.needsReapprovalCount > 0 ? (
                                      <span className="pill warn">
                                        재검토 {teamGroup.needsReapprovalCount}건
                                      </span>
                                    ) : null}
                                    {teamGroup.alertCount > 0 ? (
                                      <span className="pill neutral">알림 {teamGroup.alertCount}건</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td />
                              </tr>

                              {teamGroup.rows.map((row) => {
                                const holidayDisplay =
                                  row.entry.section !== "legal-holiday"
                                    ? getHolidayDisplay(row.entry.workDate, holidayNamesByDate)
                                    : null;
                                const isNonPayablePoolSubstitute =
                                  isNonPayablePoolSubstitutePerformanceEntry(row.entry);

                                return (
                                <tr
                                  className={`performance-entry-row ${
                                    isNonPayablePoolSubstitute ? "is-non-payable" : ""
                                  }`}
                                  key={row.rowId}
                                >
                                  <td>
                                    <span className="performance-entry-kind">직원</span>
                                  </td>
                                  <td className="performance-worker-cell">
                                    <div className="performance-entry-primary performance-worker-value">
                                      <strong>{getScheduledWorkerName(row.entry)}</strong>
                                      <span>{row.sourceFileName}</span>
                                    </div>
                                  </td>
                                  <td className="performance-worker-cell">
                                    <div className="performance-entry-primary performance-worker-value">
                                      <strong>{getSubstituteWorkerName(row.entry)}</strong>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="performance-type-cell">
                                      <span className={workTypePillClassName[row.entry.section]}>
                                        {sectionLabel[row.entry.section]}
                                      </span>
                                      {holidayDisplay ? (
                                        <span className={holidayDisplay.className} title={holidayDisplay.title}>
                                          {holidayDisplay.label}
                                        </span>
                                      ) : null}
                                      {isNonPayablePoolSubstitute ? (
                                        <span className="performance-day-flag non-payable">
                                          수당 미지급
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td>{row.entry.workDate}</td>
                                  <td>{getTimeRangeLabel(row.entry)}</td>
                                  <td>{getWorkSummary(row.entry)}</td>
                                  <td>
                                    <div className="performance-status-inline">
                                      <span
                                        className={`pill ${getApprovalStatusDisplay(row, approvalScope).tone}`}
                                      >
                                        {getApprovalStatusDisplay(row, approvalScope).label}
                                      </span>
                                      {row.latestApprovalUsedManualRate ? (
                                        <span className="performance-status-note">
                                          {getManualHourlyRateBadgeLabel(row.latestApprovalManualHourlyRate)}
                                        </span>
                                      ) : null}
                                      {isHourlyRateUnappliedPerformanceEntry(row.entry) ? (
                                        <span className="performance-status-note">시급미반영항목</span>
                                      ) : null}
                                      {isNonPayablePoolSubstitute ? (
                                        <span className="performance-status-note">Pool 대체근무</span>
                                      ) : null}
                                      {row.reapprovalStatus === "completed" ? (
                                        <span className="performance-status-note">현재 파일 기준 최신 승인</span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td>
                                    <div className="performance-entry-actions">
                                      {row.sourceFileExists ? (
                                        <button
                                          aria-label="Excel 파일 열기"
                                          className="performance-action-icon-button excel"
                                          onClick={() => {
                                            void handleOpenSourceFile(row.fileId);
                                          }}
                                          title="Excel 파일 열기"
                                          type="button"
                                        >
                                          <PerformanceExcelIcon />
                                        </button>
                                      ) : null}
                                      {row.entry.alerts.length > 0 ? (
                                        <button
                                          aria-label={getAlertButtonLabel(row.entry.alerts)}
                                          className="performance-action-icon-button alert"
                                          onClick={() => {
                                            setAlertModal({
                                              title: `${row.entry.employeeName} 알림`,
                                              alerts: row.entry.alerts
                                            });
                                          }}
                                          title={getAlertButtonLabel(row.entry.alerts)}
                                          type="button"
                                        >
                                          !
                                        </button>
                                      ) : null}
                                      <button
                                        aria-label="인력 및 시급 정보"
                                        className="performance-action-icon-button info"
                                        onClick={() => {
                                          void handleOpenEmployeeInfo(row);
                                        }}
                                        title="인력 및 시급 정보"
                                        type="button"
                                      >
                                        <PerformanceInfoIcon />
                                      </button>
                                      {canManagePerformanceApprovals &&
                                      canOpenComparison(row, approvalScope) ? (
                                        <button
                                          aria-label="승인본 비교"
                                          className="performance-action-icon-button"
                                          disabled={isProcessing}
                                          onClick={() => {
                                            void handleOpenComparison(row);
                                          }}
                                          title="승인본 비교"
                                          type="button"
                                        >
                                          i
                                        </button>
                                      ) : null}
                                      {canManagePerformanceApprovals &&
                                      approvalScope === "approved" &&
                                      row.sourceDirectoryType === "approved" &&
                                      row.canHideApprovedRow ? (
                                        <>
                                          <span className="performance-entry-caption performance-entry-caption-warn">
                                            품의 이력 미반영 행
                                          </span>
                                          <button
                                            className="danger-button compact-button"
                                            disabled={isProcessing}
                                            onClick={() => {
                                              void handleHideApprovedRow(row);
                                            }}
                                            title="품의 이력이 없는 승인완료 행을 목록에서 숨김"
                                            type="button"
                                          >
                                            {processingKey === `hide:${row.latestApprovalId}` ? "정리 중..." : "목록삭제"}
                                          </button>
                                        </>
                                      ) : null}
                                      {canManagePerformanceApprovals &&
                                      approvalScope === "approved" &&
                                      row.sourceDirectoryType === "approved" &&
                                      firstReturnRowIdByFile.get(row.fileId) === row.rowId ? (
                                        <button
                                          className="danger-button compact-button"
                                          disabled={isProcessing}
                                          onClick={() => {
                                            void handleReturnApprovedToPending({
                                              fileId: row.fileId,
                                              fileName: row.sourceFileName
                                            });
                                          }}
                                          title="이 파일을 승인대기로 되돌립니다(기존 승인이 취소됩니다)"
                                          type="button"
                                        >
                                          {processingKey === `return:${row.fileId}`
                                            ? "되돌리는 중..."
                                            : "승인대기로 되돌리기"}
                                        </button>
                                      ) : null}
                                      {canManagePerformanceApprovals && row.canApprove ? (
                                        <button
                                          className="primary-button compact-button"
                                          disabled={isProcessing}
                                          onClick={() => {
                                            void handleApproveRows([row], `row:${row.entryId}`);
                                          }}
                                          type="button"
                                        >
                                          {processingKey === `row:${row.entryId}` ? "승인 중..." : "승인"}
                                        </button>
                                      ) : null}
                                      {!canManagePerformanceApprovals ? (
                                          <span className="performance-entry-caption">
                                            실적 승인 권한 필요
                                          </span>
                                      ) : null}
                                      {canManagePerformanceApprovals &&
                                      !canOpenComparison(row, approvalScope) &&
                                      !row.canApprove ? (
                                        <span className="performance-entry-caption">
                                          {getPendingRowActionCaption(row)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </Fragment>
                          ))
                        : null}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9}>현재 필터 조건에 맞는 실적이 없습니다. 필터를 초기화하거나 검색 범위를 넓혀 보세요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className={`surface-card performance-history-card ${historyCollapsed ? "is-collapsed" : ""}`}
      >
        <div className="section-heading compact-heading performance-history-head">
          <div>
            <h3>승인 이력</h3>
            <p>선택한 연도/월 기준 승인 결과를 하단에서 확인합니다.</p>
          </div>
          <div className="button-row">
            <span className="pill neutral">
              {historyCollapsed && approvalHistory.length === 0
                ? "펼치면 조회"
                : `${filteredApprovalHistory.length}건`}
            </span>
            <button
              className="ghost-button compact-button"
              onClick={() => {
                setHistoryCollapsed((current) => !current);
              }}
              type="button"
            >
              {historyCollapsed ? "펼치기" : "접기"}
            </button>
          </div>
        </div>

        {historyError ? <p className="form-error-text">{historyError}</p> : null}

        {!historyCollapsed ? (
          <div className="data-scroll">
            <table className="info-table compact-table performance-history-table">
              <thead>
                <tr>
                  <th>처리시각</th>
                  <th>근무지</th>
                  <th>이름</th>
                  <th>근로유형</th>
                  <th>근무일자</th>
                  <th>처리자</th>
                  <th>비고</th>
                  <th>원본 파일</th>
                </tr>
              </thead>
              <tbody>
                {isHistoryLoading ? (
                  <tr>
                    <td colSpan={8}>승인 이력을 불러오는 중입니다.</td>
                  </tr>
                ) : filteredApprovalHistory.length > 0 ? (
                  filteredApprovalHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.processedAt)}</td>
                      <td>{item.scheduleKey.split(":")[1] || "-"}</td>
                      <td>{item.employeeName}</td>
                      <td>{sectionLabel[toSection(item)]}</td>
                      <td>{item.workDate}</td>
                      <td>{item.processedByName}</td>
                      <td>
                        <div className="performance-history-note">
                          <div className="performance-history-badges">
                            <span
                              className={`pill ${
                                approvalActionLabelById.get(item.id) === "재승인" ? "warn" : "info"
                              }`}
                            >
                              {approvalActionLabelById.get(item.id) ?? "승인"}
                            </span>
                            {item.comment?.includes("시급 임의지정") ? (
                              <span className="pill info">임의 시급 적용</span>
                            ) : null}
                          </div>
                          <span>{item.comment ?? "-"}</span>
                        </div>
                      </td>
                      <td>{item.fileName}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>현재 필터 조건에 맞는 승인 이력이 없습니다. 필터를 초기화하거나 검색 범위를 변경해 보세요.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="performance-history-collapsed">
            <span>{periodFilterLabel}</span>
            <strong>
              {approvalHistory.length > 0 ? `${filteredApprovalHistory.length}건` : "펼치면 조회"}
            </strong>
            <em>{sectionLabel[sectionFilter]}</em>
          </div>
        )}
      </section>

      {isLoading && syncProgress ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card performance-sync-progress-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{getSyncDirectoryLabel(syncProgress.directoryType)} 파싱 진행 중</strong>
                <p>
                  Excel 파일을 순서대로 천천히 확인하고 있습니다. 완료될 때까지 프로그램을
                  종료하지 마세요.
                </p>
              </div>
            </div>

            <div className="guide-flow-progress-card">
              <div className="guide-flow-progress-header">
                <div className="guide-flow-progress-copy">
                  <strong>{syncProgress.message || "실적 파일을 확인하는 중입니다."}</strong>
                  <span>
                    {syncProgress.totalCount > 0
                      ? `${syncProgress.processedCount}/${syncProgress.totalCount}개 처리`
                      : "대상 파일을 찾는 중"}
                  </span>
                </div>
                <span className="pill info">{syncProgressPercent}%</span>
              </div>
              <div className="guide-flow-progress-bar">
                <span style={{ width: `${syncProgressPercent}%` }} />
              </div>
              <p className="guide-flow-progress-caption">
                분석 {syncProgress.parsedCount}개 · 재사용/건너뜀 {syncProgress.skippedCount}개 ·
                확인 필요 {syncProgress.issueCount}건
              </p>
            </div>

            {syncProgress.currentFileName ? (
              <div className="performance-sync-current-file">
                <strong>현재 파일</strong>
                <span>{syncProgress.currentFileName}</span>
                {syncProgress.currentFilePath ? <em>{syncProgress.currentFilePath}</em> : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {questionDialog}

      {syncIssueModal ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card performance-alert-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{syncIssueModal.title}</strong>
                <p>
                  승인대기 폴더에서 읽지 못한 Excel 파일이 있습니다. 아래 내용을 확인한 뒤 파일
                  양식이나 조회 월을 조정하세요.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setSyncIssueModal(null);
                }}
                type="button"
              >
                닫기
              </button>
            </div>
            <div className="performance-alert-list">
              {syncIssueModal.issues.map((issue, index) => (
                <article
                  className="performance-reapproval-item"
                  key={`${issue.filePath}-${issue.message}-${index}`}
                >
                  <div className="performance-reapproval-copy">
                    <strong>{issue.fileName}</strong>
                    <p>{issue.filePath}</p>
                    <p className={issue.severity === "error" ? "form-error-text" : "field-hint"}>
                      {issue.message}
                    </p>
                  </div>
                  <span className={`pill ${issue.severity === "error" ? "warn" : "neutral"}`}>
                    {issue.severity === "error" ? "확인 필요" : "안내"}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {alertModal ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card performance-alert-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>{alertModal.title}</strong>
                <p>상세 알림을 확인합니다.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setAlertModal(null);
                }}
                type="button"
              >
                닫기
              </button>
            </div>
            <div className="performance-alert-list">
              {alertModal.alerts.map((alert) => (
                <p
                  className={alert.severity === "error" ? "form-error-text" : "field-hint"}
                  key={`${alertModal.title}-${alert.message}`}
                >
                  {alert.message}
                </p>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {employeeInfoModal ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card performance-employee-info-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>
                  {employeeInfoModal.row.entry.employeeName} /{" "}
                  {sectionLabel[employeeInfoModal.row.entry.section]} 정보
                </strong>
                <p>실적 행에 연결된 인력 기본정보와 근무일 기준 시급을 확인합니다.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setEmployeeInfoModal(null);
                }}
                type="button"
              >
                닫기
              </button>
            </div>

            {employeeInfoModal.isLoading ? (
              <div className="performance-empty-state compact">
                <strong>인력 및 시급 정보를 불러오는 중입니다.</strong>
              </div>
            ) : (
              <>
                <div className="performance-employee-info-summary">
                  <span className="pill neutral">{employeeInfoModal.row.entry.workDate}</span>
                  <span className={workTypePillClassName[employeeInfoModal.row.entry.section]}>
                    {sectionLabel[employeeInfoModal.row.entry.section]}
                  </span>
                  {employeeInfoIsNonPayable ? (
                    <span className="pill neutral">Pool 대체근무 수당 미지급</span>
                  ) : null}
                </div>

                {employeeInfoModal.error ? (
                  <p className="form-error-text">{employeeInfoModal.error}</p>
                ) : null}

                <div className="performance-employee-info-grid">
                  <article className="performance-employee-info-panel">
                    <strong>실적 파일 기준</strong>
                    <dl>
                      <div>
                        <dt>근무지</dt>
                        <dd>{employeeInfoModal.row.entry.siteName || "-"}</dd>
                      </div>
                      <div>
                        <dt>근무예정자</dt>
                        <dd>{getScheduledWorkerName(employeeInfoModal.row.entry)}</dd>
                      </div>
                      <div>
                        <dt>근무대체자</dt>
                        <dd>{getSubstituteWorkerName(employeeInfoModal.row.entry)}</dd>
                      </div>
                      <div>
                        <dt>실적 산정 시급</dt>
                        <dd>
                          {employeeInfoIsNonPayable
                            ? "수당 미지급"
                            : formatHourlyRateLabel(employeeInfoModal.row.entry.hourlyRate)}
                        </dd>
                      </div>
                    </dl>
                  </article>

                  <article className="performance-employee-info-panel">
                    <strong>등록 인력 기준</strong>
                    {employeeInfoModal.employee ? (
                      <dl>
                        <div>
                          <dt>사원번호</dt>
                          <dd>{employeeInfoModal.employee.employeeCode || "-"}</dd>
                        </div>
                        <div>
                          <dt>고용형태</dt>
                          <dd>{employeeInfoModal.employee.employmentType || "-"}</dd>
                        </div>
                        <div>
                          <dt>상태</dt>
                          <dd>{employeeStatusLabel[employeeInfoModal.employee.status]}</dd>
                        </div>
                        <div>
                          <dt>근무지</dt>
                          <dd>{employeeInfoModal.employee.currentSiteName || "-"}</dd>
                        </div>
                        <div>
                          <dt>조이름</dt>
                          <dd>{employeeInfoModal.employee.currentShiftGroup || "-"}</dd>
                        </div>
                        <div>
                          <dt>배정기간</dt>
                          <dd>{formatAssignmentPeriod(employeeInfoModal.employee)}</dd>
                        </div>
                        <div>
                          <dt>현재시급</dt>
                          <dd>{formatHourlyRateLabel(employeeInfoModal.employee.currentHourlyRate)}</dd>
                        </div>
                        <div>
                          <dt>근무일 적용시급</dt>
                          <dd>
                            {employeeInfoIsNonPayable
                              ? "수당 미지급"
                              : formatHourlyRateLabel(employeeInfoActiveWageRate?.hourlyRate)}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="field-hint">등록 인력 정보가 연결되지 않았습니다.</p>
                    )}
                  </article>
                </div>

                {employeeInfoModal.wageRates.length > 0 ? (
                  <div className="performance-employee-info-table-shell">
                    <strong>시급 이력</strong>
                    <table className="info-table compact-table performance-employee-info-table">
                      <thead>
                        <tr>
                          <th>적용기간</th>
                          <th>시급</th>
                          <th>사유</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeInfoModal.wageRates.map((wageRate) => (
                          <tr
                            className={
                              employeeInfoActiveWageRate?.id === wageRate.id ? "is-active" : ""
                            }
                            key={wageRate.id}
                          >
                            <td>{getWageRatePeriod(wageRate)}</td>
                            <td>{formatHourlyRateLabel(wageRate.hourlyRate)}</td>
                            <td>{wageRate.reason || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="field-hint">등록된 시급 이력이 없습니다.</p>
                )}
              </>
            )}
          </section>
        </div>
      ) : null}

      {comparisonModal ? (
        <div className="modal-overlay">
          <section
            aria-modal="true"
            className="modal-card performance-compare-modal"
            role="dialog"
          >
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>
                  {comparisonModal.row.entry.employeeName} / {sectionLabel[comparisonModal.row.entry.section]}
                </strong>
                <p>승인본과 현재 파일 내용을 좌우 비교합니다.</p>
              </div>
              <button
                aria-label="비교 창 닫기"
                className="icon-button"
                onClick={() => {
                  setHourlyRateEditor(null);
                  setComparisonModal(null);
                }}
                type="button"
              >
                닫기
              </button>
            </div>

            {comparisonModal.isLoading || !comparisonModal.detail ? (
              <div className="performance-empty-state compact">
                <strong>비교 정보를 불러오는 중입니다.</strong>
              </div>
            ) : (
              <>
                <div className="performance-compare-grid">
                  <div className="performance-compare-panel">
                    <div className="performance-compare-title">
                      <strong>승인된 실적</strong>
                      <span>
                        {comparisonModal.detail.approvedRecord
                          ? `${comparisonModal.detail.approvedRecord.processedByName} / ${formatDateTime(
                              comparisonModal.detail.approvedRecord.processedAt
                            )}`
                          : "승인 정보 없음"}
                      </span>
                    </div>
                  </div>
                  <div className="performance-compare-panel current">
                    <div className="performance-compare-title">
                      <strong>파일에서 불러온 실적</strong>
                      <span>
                        {comparisonModal.detail.currentFile.fileName} /{" "}
                        {formatDateTime(comparisonModal.detail.currentFile.receivedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="performance-compare-table">
                  <div className="performance-compare-table-head">
                    <span>항목</span>
                    <span>승인본</span>
                    <span>현재 파일</span>
                  </div>
                  {comparisonRows.map((row) => (
                    <div
                      className={`performance-compare-table-row ${row.changed ? "is-changed" : ""}`}
                      key={row.key}
                    >
                      <strong>{row.label}</strong>
                      <div className="performance-compare-cell">
                        <span>{row.approved}</span>
                      </div>
                      <div className="performance-compare-cell performance-compare-current-cell">
                        <span>{row.current}</span>
                        {row.key === "hourlyRate" ? (
                          <div className="performance-compare-inline-actions">
                            <button
                              className="ghost-button compact-button"
                              disabled={isProcessing}
                              onClick={() => {
                                handleOpenHourlyRateEditor();
                              }}
                              type="button"
                            >
                              임의 시급 적용
                            </button>
                            {comparisonModal.manualHourlyRate ? (
                              <span className="performance-compare-value-note">
                                재승인 계산에 {formatHourlyRateCurrency(comparisonModal.manualHourlyRate)} 적용
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="performance-compare-alerts">
                  <div className="performance-compare-alert-column">
                    <strong>승인본 알림</strong>
                    {comparisonModal.detail.approvedEntry?.alerts.length ? (
                      comparisonModal.detail.approvedEntry.alerts.map((alert) => (
                        <p
                          className={alert.severity === "error" ? "form-error-text" : "field-hint"}
                          key={`approved-${alert.message}`}
                        >
                          {alert.message}
                        </p>
                      ))
                    ) : (
                      <p className="field-hint">알림 없음</p>
                    )}
                  </div>
                  <div className="performance-compare-alert-column">
                    <strong>현재 파일 알림</strong>
                    {comparisonModal.detail.currentEntry.alerts.length ? (
                      comparisonModal.detail.currentEntry.alerts.map((alert) => (
                        <p
                          className={alert.severity === "error" ? "form-error-text" : "field-hint"}
                          key={`current-${alert.message}`}
                        >
                          {alert.message}
                        </p>
                      ))
                    ) : (
                      <p className="field-hint">알림 없음</p>
                    )}
                  </div>
                </div>

                <div className="performance-compare-actions">
                  {comparisonModal.manualHourlyRate ? (
                    <span className="field-hint performance-compare-action-note">
                      임의지정 시급은 이번 재승인 계산과 승인 이력 비고에 함께 저장됩니다.
                    </span>
                  ) : (
                    <span className="field-hint performance-compare-action-note">
                      시급 적용일이 맞지 않으면 &apos;임의지정&apos;으로 재승인 계산용 시급을 입력하세요.
                    </span>
                  )}
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setHourlyRateEditor(null);
                      setComparisonModal(null);
                    }}
                    type="button"
                  >
                    취소
                  </button>
                  <button
                    className="primary-button"
                    disabled={isProcessing}
                    onClick={() => {
                      void handleReapprove();
                    }}
                    type="button"
                  >
                    {processingKey === `reapprove:${comparisonModal.row.entryId}`
                      ? "재승인 중..."
                      : "재승인"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {comparisonModal && hourlyRateEditor ? (
        <div className="modal-overlay performance-hourly-rate-overlay">
          <section aria-modal="true" className="modal-card performance-hourly-rate-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>시급 임의 지정</strong>
                <p>기본은 재승인 계산에만 적용하며, 선택 시 현재 직원 시급정보도 함께 갱신합니다.</p>
              </div>
            </div>

            <div className="performance-hourly-rate-editor">
              <label className="field">
                <span>시급</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  onChange={(event) => {
                    setHourlyRateEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: event.target.value,
                            error: null
                          }
                        : current
                    );
                  }}
                  placeholder="예: 15000"
                  ref={hourlyRateInputRef}
                  value={hourlyRateEditor.draft}
                />
              </label>
              {hourlyRateEditor.error ? (
                <p className="form-error-text">{hourlyRateEditor.error}</p>
              ) : null}
            </div>

            <div className="performance-compare-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  setHourlyRateEditor(null);
                }}
                type="button"
              >
                취소
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  void handleConfirmManualHourlyRate();
                }}
                type="button"
              >
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};
