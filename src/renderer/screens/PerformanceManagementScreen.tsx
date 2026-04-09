import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import type {
  PerformanceAlert,
  PerformanceApprovalRecord,
  PerformanceApprovalScope,
  PerformanceComparisonDetail,
  PerformanceEntryRecord,
  PerformanceEntrySection,
  PerformanceOverviewRow,
  PerformanceReapprovalFileSummary,
  PerformanceOverviewSnapshot
} from "@shared/domain/performance-file";
import { formatCurrency } from "@shared/lib/formatCurrency";

import { FormSelect } from "../components/FormSelect";
import { useQuestionDialog } from "../components/QuestionDialog";

const approvalScopeLabel: Record<PerformanceApprovalScope, string> = {
  all: "전체",
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
  rejected: "반려"
};

const approvalStatusTone: Record<PerformanceOverviewRow["approvalStatus"], "warn" | "info"> = {
  pending: "warn",
  approved: "info",
  rejected: "warn"
};

const workTypePillClassName: Record<PerformanceEntrySection, string> = {
  substitute: "performance-section-pill substitute",
  overtime: "performance-section-pill overtime",
  "legal-holiday": "performance-section-pill legal-holiday"
};

const createCurrentYear = () => String(new Date().getFullYear());
const createCurrentMonth = () => String(new Date().getMonth() + 1).padStart(2, "0");

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

const toSection = (record: PerformanceApprovalRecord): PerformanceEntrySection =>
  record.workType === "holiday"
    ? "legal-holiday"
    : record.workType === "substitute"
      ? "substitute"
      : "overtime";

const getApprovalHistoryKey = (record: PerformanceApprovalRecord) => record.logicalKey || record.entryId;

const getAlertButtonLabel = (alerts: PerformanceAlert[]) =>
  alerts.length > 0 ? `알림 ${alerts.length}건` : "-";

const canOpenComparison = (
  row: PerformanceOverviewRow,
  approvalScope: PerformanceApprovalScope
) =>
  approvalScope === "pending" &&
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
    ? `${formatCurrency(hourlyRate)} (임의지정)`
    : formatCurrency(hourlyRate);
};

const getManualHourlyRateBadgeLabel = (hourlyRate?: number) =>
  hourlyRate && hourlyRate > 0 ? `임의 시급 ${formatCurrency(hourlyRate)}` : "임의 시급 적용";

const PerformanceExcelIcon = () => <span className="performance-action-icon-label">XLS</span>;

const getHolidayDisplay = (workDate: string, holidayNamesByDate: Record<string, string>) => {
  const holidayName = holidayNamesByDate[workDate];

  return holidayName
    ? {
        label: "법정휴일",
        title: holidayName,
        className: "performance-day-flag holiday"
      }
    : {
        label: "비휴일",
        title: "비휴일",
        className: "performance-day-flag"
      };
};

const getPendingRowActionCaption = (
  row: PerformanceOverviewRow
) => {
  if (row.isChangeLocked) {
    return row.changeLockedReason ?? "품의승인 완료 수당은 재승인으로 변경할 수 없습니다.";
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

export const PerformanceManagementScreen = () => {
  const [overview, setOverview] = useState<PerformanceOverviewSnapshot | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<PerformanceApprovalRecord[]>([]);
  const [approvalScope, setApprovalScope] = useState<PerformanceApprovalScope>("all");
  const [selectedSiteName, setSelectedSiteName] = useState("all");
  const [sectionFilter, setSectionFilter] = useState<PerformanceEntrySection | "all">("all");
  const [selectedYear, setSelectedYear] = useState(createCurrentYear());
  const [selectedMonth, setSelectedMonth] = useState(createCurrentMonth());
  const [expandedSites, setExpandedSites] = useState<string[]>([]);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{ title: string; alerts: PerformanceAlert[] } | null>(
    null
  );
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
  const { askQuestion, questionDialog } = useQuestionDialog();

  const scheduleMonth = `${selectedYear}-${selectedMonth}`;

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [overviewResult, historyResult] = await Promise.all([
          window.appBridge.listPerformanceOverview({
            approvalScope,
            section: sectionFilter,
            scheduleMonth
          }),
          window.appBridge.listApprovalHistory()
        ]);

        if (!active) {
          return;
        }

        setOverview(overviewResult.ok ? overviewResult.data : null);
        setApprovalHistory(historyResult.ok ? historyResult.data : []);

        const errors = [
          overviewResult.ok ? null : overviewResult.message,
          historyResult.ok ? null : historyResult.message
        ].filter((message): message is string => Boolean(message));

        setScreenError(errors.length > 0 ? errors.join(" / ") : null);
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

    if (!availableYears.includes(selectedYear)) {
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
        if (!record.workDate.startsWith(scheduleMonth)) {
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
    [approvalHistory, overview, scheduleMonth, sectionFilter, selectedSiteName]
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
      (overview?.groups ?? []).filter(
        (group) => selectedSiteName === "all" || group.siteName === selectedSiteName
      ),
    [overview, selectedSiteName]
  );

  const visibleRows = useMemo(
    () => filteredGroups.flatMap((group) => group.rows),
    [filteredGroups]
  );

  const approvableRows = useMemo(
    () => visibleRows.filter((row) => row.canApprove),
    [visibleRows]
  );

  const filteredReapprovalFiles = useMemo(
    () =>
      (overview?.reapprovalFiles ?? []).filter(
        (file) => selectedSiteName === "all" || file.siteName === selectedSiteName
      ),
    [overview, selectedSiteName]
  );

  const handleApproveRows = async (rows: PerformanceOverviewRow[], processingLabel: string) => {
    if (rows.length === 0) {
      setActionError("승인할 실적이 없습니다.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsProcessing(true);
    setProcessingKey(processingLabel);

    try {
      let successCount = 0;
      const failedMessages: string[] = [];

      for (const row of rows) {
        const result = await window.appBridge.approvePendingFile({
          fileId: row.fileId,
          entryId: row.entryId
        });

        if (!result.ok) {
          failedMessages.push(`${row.entry.employeeName}: ${result.message}`);
          continue;
        }

        successCount += 1;
      }

      if (successCount > 0) {
        setActionMessage(`${successCount}건의 실적을 승인하고 품의 이력에 반영했습니다.`);
      }

      if (failedMessages.length > 0) {
        setActionError(failedMessages.join(" / "));
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
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
      setProcessingKey(null);
    }
  };

  const handleFinalizeReapprovedFile = async (file: PerformanceReapprovalFileSummary) => {
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
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const handleHideApprovedRow = async (row: PerformanceOverviewRow) => {
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
  const reapprovalFiles = filteredReapprovalFiles;
  const reapprovalPendingFileCount = reapprovalFiles.filter(
    (file) => file.reapprovalPendingCount > 0
  ).length;
  const reapprovalLockedEntryCount = reapprovalFiles.reduce(
    (sum, file) => sum + file.lockedEntryCount,
    0
  );
  const changeLockedRowCount = visibleRows.filter((row) => row.isChangeLocked).length;

  return (
    <div className="screen-stack performance-screen">
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
            <label className="field filter-field filter-field-sm performance-scope-filter-field">
              <span>조회구분</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setApprovalScope(event.target.value as PerformanceApprovalScope);
                }}
                selectClassName="top-filter-select"
                value={approvalScope}
              >
                <option value="all">전체</option>
                <option value="pending">승인대기</option>
                <option value="approved">{approvalScopeLabel.approved}</option>
              </FormSelect>
            </label>

            <label className="field filter-field filter-field-md">
              <span>근무지</span>
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
                  setRefreshKey((current) => current + 1);
                }}
                title="새로고침"
                type="button"
              >
                ↻
              </button>
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
            </div>
          </div>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
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
            <p>근무지별 접기/펼치기로 대체근무, 연장근무, 법정휴일근무 실적을 검토합니다.</p>
          </div>
          <div className="performance-table-header-meta">
            <div className="button-row">
              <span className="pill neutral">{approvalScopeLabel[approvalScope]}</span>
              <span className="pill neutral">
                {selectedSiteName === "all" ? "전체 근무지" : selectedSiteName}
              </span>
              <span className="pill neutral">{sectionLabel[sectionFilter]}</span>
              <span className="pill neutral">{scheduleMonth}</span>
            </div>
          </div>
        </div>

        <div className="data-scroll">
          <table className="info-table compact-table performance-overview-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>대상</th>
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
                  <td colSpan={8}>실적 현황을 불러오는 중입니다.</td>
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

                  return (
                    <Fragment key={group.siteName}>
                      <tr className="performance-site-summary-row" key={`${group.siteName}-summary`}>
                        <td>
                          <span className="pill neutral">근무지</span>
                        </td>
                        <td className="table-strong">{group.siteName}</td>
                        <td colSpan={4}>
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
                            <span className="pill neutral">알림 {group.alertCount}건</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`pill ${
                              group.pendingCount > 0 ||
                              group.needsReapprovalCount > 0 ||
                              reapprovalPendingCount > 0
                                ? "warn"
                                : changeLockedCount > 0
                                  ? "neutral"
                                : "info"
                            }`}
                          >
                            {group.pendingCount > 0
                              ? `${group.pendingCount}건 대기`
                              : group.rejectedCount > 0
                                ? `${group.rejectedCount}건 반려`
                              : group.needsReapprovalCount > 0
                                ? `${group.needsReapprovalCount}건 재검토`
                                : reapprovalPendingCount > 0
                                  ? `${reapprovalPendingCount}건 재승인 대기`
                                  : reapprovalCompletedCount > 0
                                    ? `${reapprovalCompletedCount}건 재승인 완료`
                                    : changeLockedCount > 0
                                      ? `${changeLockedCount}건 변경불가`
                                    : "승인 반영"}
                          </span>
                        </td>
                        <td>
                          <div className="performance-site-actions">
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
                        ? group.rows.map((row) => {
                            const holidayDisplay =
                              row.entry.section !== "legal-holiday"
                                ? getHolidayDisplay(row.entry.workDate, holidayNamesByDate)
                                : null;

                            return (
                            <tr className="performance-entry-row" key={row.rowId}>
                              <td>
                                <span className="performance-entry-kind">직원</span>
                              </td>
                              <td>
                                <div className="performance-entry-primary">
                                  <strong>{row.entry.employeeName}</strong>
                                  <span>{row.sourceFileName}</span>
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
                                  {canOpenComparison(row, approvalScope) ? (
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
                                  {approvalScope === "approved" &&
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
                                  {row.canApprove ? (
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
                                  {!canOpenComparison(row, approvalScope) && !row.canApprove ? (
                                    <span className="performance-entry-caption">
                                      {getPendingRowActionCaption(row)}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                            );
                          })
                        : null}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>조건에 맞는 실적이 없습니다.</td>
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
            <span className="pill neutral">{filteredApprovalHistory.length}건</span>
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
                {filteredApprovalHistory.length > 0 ? (
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
                    <td colSpan={8}>조건에 맞는 승인 이력이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="performance-history-collapsed">
            <span>{scheduleMonth}</span>
            <strong>{filteredApprovalHistory.length}건</strong>
            <em>{sectionLabel[sectionFilter]}</em>
          </div>
        )}
      </section>

      {questionDialog}

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
              {comparisonModal.isLoading || !comparisonModal.detail ? (
                <button
                  className="icon-button"
                  onClick={() => {
                    setHourlyRateEditor(null);
                    setComparisonModal(null);
                  }}
                  type="button"
                >
                  닫기
                </button>
              ) : null}
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
                                재승인 계산에 {formatCurrency(comparisonModal.manualHourlyRate)} 적용
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
                      시급 적용일이 맞지 않으면 `임의지정`으로 재승인 계산용 시급을 입력하세요.
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
