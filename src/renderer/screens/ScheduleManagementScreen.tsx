import { startTransition, useEffect, useMemo, useState } from "react";

import type { AppSettingsSnapshot } from "@shared/bridge/contracts";
import {
  calculateWorkBreakdown,
  DEFAULT_WORK_BREAKDOWN
} from "@shared/domain/calculation";
import {
  buildMonthlyScheduleDraft,
  getMonthlyScheduleDraftIssues
} from "@shared/domain/monthly-schedule-draft";
import type {
  EmployeeRecord,
  MonthlyScheduleRecord,
  ShiftPatternRecord,
  SiteRecord
} from "@shared/domain/model";
import type {
  SchedulePlanExportRecord,
  SchedulePlanPreviewRecord
} from "@shared/domain/schedule-plan";

import { FormSelect } from "../components/FormSelect";
import { useAppWorkflow } from "../contexts/app-workflow-context";

type DutyCode = "D" | "E" | "N" | "O";
type DutyTone = "day" | "first" | "night" | "off";

interface CalendarDay {
  date: string;
  dayLabel: string;
  inCurrentMonth: boolean;
  isWeekend: boolean;
}

interface CalendarAssignment {
  dutyCode: DutyCode;
  dutyLabel: string;
  tone: DutyTone;
  displayLabel: string;
  count: number;
}

interface ScheduleSummaryAccumulator {
  employeeCode: string;
  employeeName: string;
  baseMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
}

interface ScheduleSummaryRow {
  employeeName: string;
  baseHours: string;
  overtimeHours: string;
  nightHours: string;
  legalHolidayHours: string;
}

interface ScheduleViewItem {
  employeeCode: string;
  employeeName: string;
  workDate: string;
  dutyCode: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
}

const dutyLabelByCode: Record<DutyCode, string> = {
  D: "주간",
  E: "중간",
  N: "야간",
  O: "휴무"
};

const dutyToneByCode: Record<DutyCode, DutyTone> = {
  D: "day",
  E: "first",
  N: "night",
  O: "off"
};

const exportStatusLabel: Record<NonNullable<SchedulePlanExportRecord["publishStatus"]>, string> = {
  draft: "내보내기 완료",
  published: "배포 승인"
};

const exportStatusTone: Record<
  NonNullable<SchedulePlanExportRecord["publishStatus"]>,
  "info" | "neutral"
> = {
  draft: "info",
  published: "neutral"
};

const dayNames = ["일", "월", "화", "수", "목", "금", "토"] as const;

const createCurrentMonthValue = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const createDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const parseDateValue = (value: string) => {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return new Date(year, month - 1, day);
};

const addMonths = (monthValue: string, delta: number) => {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return monthValue;
  }

  const target = new Date(year, month - 1 + delta, 1);

  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

const formatMonthLabel = (value: string) => {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return value;
  }

  return `${year}년 ${month}월`;
};

const formatHours = (minutes: number) => (minutes / 60).toFixed(1);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const normalizeDutyCode = (value: string): DutyCode => {
  const normalized = value.trim().toUpperCase();

  if (normalized === "D" || normalized === "E" || normalized === "N") {
    return normalized;
  }

  return "O";
};

const isWeekendDate = (value: string) => {
  const date = parseDateValue(value);
  const day = date.getDay();

  return day === 0 || day === 6;
};

const buildCalendarDays = (scheduleMonth: string): CalendarDay[][] => {
  const [yearText, monthText] = scheduleMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return [];
  }

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstDay.getDay());
  const calendarEnd = new Date(lastDay);
  calendarEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
  const days: CalendarDay[] = [];

  for (
    let cursor = new Date(calendarStart);
    cursor <= calendarEnd;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    days.push({
      date: createDateValue(cursor),
      dayLabel: String(cursor.getDate()),
      inCurrentMonth: cursor.getMonth() === month - 1,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6
    });
  }

  return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7)
  );
};

const buildCalendarAssignmentsByDate = (
  items: ScheduleViewItem[]
): Map<string, CalendarAssignment[]> => {
  const grouped = new Map<string, Map<DutyCode, string[]>>();

  items.forEach((item) => {
    const dutyCode = normalizeDutyCode(item.dutyCode);
    const byDutyCode = grouped.get(item.workDate) ?? new Map<DutyCode, string[]>();
    const current = byDutyCode.get(dutyCode) ?? [];

    current.push(item.employeeName);
    byDutyCode.set(dutyCode, current);
    grouped.set(item.workDate, byDutyCode);
  });

  return new Map(
    Array.from(grouped.entries()).map(([workDate, byDutyCode]) => [
      workDate,
      Array.from(byDutyCode.entries())
        .sort(([leftCode], [rightCode]) => {
          const order = ["D", "E", "N", "O"];
          return order.indexOf(leftCode) - order.indexOf(rightCode);
        })
        .map(([dutyCode, names]) => ({
          dutyCode,
          dutyLabel: dutyLabelByCode[dutyCode],
          tone: dutyToneByCode[dutyCode],
          count: names.length,
          displayLabel:
            names.length === 1
              ? `${dutyLabelByCode[dutyCode]} · ${names[0]}`
              : `${dutyLabelByCode[dutyCode]} · ${names[0]} 외 ${names.length - 1}명`
        }))
    ])
  );
};

const buildSummaryRows = (
  items: ScheduleViewItem[],
  holidayDates: Set<string>
): ScheduleSummaryRow[] => {
  const grouped = new Map<string, ScheduleSummaryAccumulator>();

  items.forEach((item) => {
    const current =
      grouped.get(item.employeeCode) ??
      ({
        employeeCode: item.employeeCode,
        employeeName: item.employeeName,
        baseMinutes: 0,
        overtimeMinutes: 0,
        nightMinutes: 0,
        holidayMinutes: 0
      } satisfies ScheduleSummaryAccumulator);
    const dutyCode = normalizeDutyCode(item.dutyCode);
    const breakdown =
      dutyCode === "O" || !item.startTime || !item.endTime
        ? DEFAULT_WORK_BREAKDOWN
        : calculateWorkBreakdown({
            isHoliday: holidayDates.has(item.workDate) || isWeekendDate(item.workDate),
            timeRange: {
              startTime: item.startTime,
              endTime: item.endTime,
              breakMinutes: item.breakMinutes
            }
          });

    current.baseMinutes += breakdown.baseWorkMinutes;
    current.overtimeMinutes += breakdown.overtimeMinutes;
    current.nightMinutes += breakdown.nightMinutes;
    current.holidayMinutes += breakdown.holidayMinutes;
    grouped.set(item.employeeCode, current);
  });

  const rows = Array.from(grouped.values())
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName, "ko-KR"))
    .map((row) => ({
      employeeName: row.employeeName,
      baseHours: formatHours(row.baseMinutes),
      overtimeHours: formatHours(row.overtimeMinutes),
      nightHours: formatHours(row.nightMinutes),
      legalHolidayHours: formatHours(row.holidayMinutes)
    }));

  if (rows.length === 0) {
    return rows;
  }

  const totals = Array.from(grouped.values()).reduce(
    (accumulator, row) => ({
      baseMinutes: accumulator.baseMinutes + row.baseMinutes,
      overtimeMinutes: accumulator.overtimeMinutes + row.overtimeMinutes,
      nightMinutes: accumulator.nightMinutes + row.nightMinutes,
      holidayMinutes: accumulator.holidayMinutes + row.holidayMinutes
    }),
    {
      baseMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      holidayMinutes: 0
    }
  );

  rows.push({
    employeeName: "직원 합계",
    baseHours: formatHours(totals.baseMinutes),
    overtimeHours: formatHours(totals.overtimeMinutes),
    nightHours: formatHours(totals.nightMinutes),
    legalHolidayHours: formatHours(totals.holidayMinutes)
  });

  return rows;
};

const getPrimaryPattern = (patterns: ShiftPatternRecord[]) =>
  patterns.find((pattern) => pattern.status === "active") ?? patterns[0] ?? null;

export const ScheduleManagementScreen = () => {
  const {
    selectedSiteId: workflowSiteId,
    selectedMonth: workflowMonth,
    setSelectedSiteId: setWorkflowSiteId,
    setSelectedMonth: setWorkflowMonth,
    openRoute
  } = useAppWorkflow();
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [schedules, setSchedules] = useState<MonthlyScheduleRecord[]>([]);
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [selectedSiteId, setSelectedSiteId] = useState(workflowSiteId);
  const [selectedPatternId, setSelectedPatternId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(workflowMonth || createCurrentMonthValue());
  const [generatedBy, setGeneratedBy] = useState("operator");
  const [defaultGeneratedBy, setDefaultGeneratedBy] = useState("operator");
  const [useGeneratedDraft, setUseGeneratedDraft] = useState(true);
  const [preview, setPreview] = useState<SchedulePlanPreviewRecord | null>(null);
  const [exports, setExports] = useState<SchedulePlanExportRecord[]>([]);
  const [selectedExportId, setSelectedExportId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0);

  useEffect(() => {
    if (workflowSiteId && workflowSiteId !== selectedSiteId) {
      setSelectedSiteId(workflowSiteId);
    }
  }, [selectedSiteId, workflowSiteId]);

  useEffect(() => {
    if (workflowMonth && workflowMonth !== selectedMonth) {
      setSelectedMonth(workflowMonth);
    }
  }, [selectedMonth, workflowMonth]);

  useEffect(() => {
    if (selectedSiteId) {
      setWorkflowSiteId(selectedSiteId);
    }
  }, [selectedSiteId, setWorkflowSiteId]);

  useEffect(() => {
    if (selectedMonth) {
      setWorkflowMonth(selectedMonth);
    }
  }, [selectedMonth, setWorkflowMonth]);

  useEffect(() => {
    let active = true;

    const loadBaseData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [
          siteResult,
          patternResult,
          employeeResult,
          scheduleResult,
          settingsResult,
          sessionResult
        ] = await Promise.all([
          window.appBridge.listSites(),
          window.appBridge.listShiftPatterns(),
          window.appBridge.listEmployees(),
          window.appBridge.listMonthlySchedules(),
          window.appBridge.getAppSettings(),
          window.appBridge.getSession()
        ]);

        if (!active) {
          return;
        }

        if (!siteResult.ok) {
          setScreenError(siteResult.message);
        } else {
          setSites(siteResult.data);
        }

        if (!patternResult.ok) {
          setScreenError(patternResult.message);
        } else {
          setPatterns(patternResult.data);
        }

        if (!employeeResult.ok) {
          setScreenError(employeeResult.message);
        } else {
          setEmployees(employeeResult.data);
        }

        if (!scheduleResult.ok) {
          setScreenError(scheduleResult.message);
        } else {
          setSchedules(scheduleResult.data);
        }

        if (!settingsResult.ok) {
          setScreenError(settingsResult.message);
        } else {
          setSettings(settingsResult.data);
        }

        if (sessionResult.ok && sessionResult.data) {
          const sessionLabel = sessionResult.data.displayName || sessionResult.data.loginId;
          setDefaultGeneratedBy(sessionLabel);
        }
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

    void loadBaseData();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;

    const loadHolidayCalendar = async () => {
      const targetYear = Number(selectedMonth.slice(0, 4));

      if (!Number.isInteger(targetYear)) {
        setHolidayDates(new Set());
        return;
      }

      try {
        const result = await window.appBridge.listHolidayCalendars(targetYear);

        if (!active) {
          return;
        }

        if (!result.ok) {
          setHolidayDates(new Set());
          return;
        }

        const items = result.data.flatMap((calendar) => calendar.items.map((item) => item.holidayDate));
        setHolidayDates(new Set(items));
      } catch {
        if (active) {
          setHolidayDates(new Set());
        }
      }
    };

    void loadHolidayCalendar();

    return () => {
      active = false;
    };
  }, [refreshKey, selectedMonth]);

  useEffect(() => {
    if (sites.length === 0) {
      setSelectedSiteId("");
      return;
    }

    if (!sites.some((site) => site.id === selectedSiteId)) {
      setSelectedSiteId(sites[0]!.id);
    }
  }, [selectedSiteId, sites]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );
  const sitePatterns = useMemo(
    () => patterns.filter((pattern) => pattern.siteId === selectedSiteId),
    [patterns, selectedSiteId]
  );

  useEffect(() => {
    if (sitePatterns.length === 0) {
      setSelectedPatternId("");
      return;
    }

    if (!sitePatterns.some((pattern) => pattern.id === selectedPatternId)) {
      const defaultPattern = getPrimaryPattern(sitePatterns);
      setSelectedPatternId(defaultPattern?.id ?? "");
    }
  }, [selectedPatternId, sitePatterns]);

  const selectedPattern = useMemo(
    () => sitePatterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
    [selectedPatternId, sitePatterns]
  );
  const exactSavedSchedule = useMemo(
    () =>
      schedules.find(
        (schedule) =>
          schedule.siteId === selectedSiteId &&
          schedule.scheduleMonth === selectedMonth &&
          schedule.patternId === selectedPatternId
      ) ?? null,
    [schedules, selectedMonth, selectedPatternId, selectedSiteId]
  );
  const siteEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => employee.currentSiteId === selectedSiteId && employee.status === "active"
      ),
    [employees, selectedSiteId]
  );
  const employeeNameByCode = useMemo(
    () => new Map(employees.map((employee) => [employee.employeeCode, employee.name])),
    [employees]
  );
  const draftIssues = useMemo(
    () =>
      selectedPattern
        ? getMonthlyScheduleDraftIssues({
            scheduleMonth: selectedMonth,
            pattern: selectedPattern,
            employees: siteEmployees
          })
        : [],
    [selectedMonth, selectedPattern, siteEmployees]
  );
  const generatedItems = useMemo(
    () =>
      selectedPattern
        ? buildMonthlyScheduleDraft({
            scheduleMonth: selectedMonth,
            pattern: selectedPattern,
            employees: siteEmployees
          })
        : [],
    [selectedMonth, selectedPattern, siteEmployees]
  );

  useEffect(() => {
    setUseGeneratedDraft(!exactSavedSchedule);
    setGeneratedBy(exactSavedSchedule?.generatedBy ?? defaultGeneratedBy);
    setActionError(null);
    setActionMessage(null);
  }, [defaultGeneratedBy, exactSavedSchedule?.id, selectedMonth, selectedPatternId, selectedSiteId]);

  useEffect(() => {
    let active = true;

    const loadArtifacts = async () => {
      if (!exactSavedSchedule) {
        setPreview(null);
        setExports([]);
        return;
      }

      try {
        const [previewResult, exportResult] = await Promise.all([
          window.appBridge.previewMonthlySchedulePlan(exactSavedSchedule.id),
          window.appBridge.listSchedulePlanExports(exactSavedSchedule.id)
        ]);

        if (!active) {
          return;
        }

        if (previewResult.ok) {
          setPreview(previewResult.data);
        } else {
          setPreview(null);
        }

        if (exportResult.ok) {
          setExports(exportResult.data);
        } else {
          setExports([]);
        }
      } catch {
        if (active) {
          setPreview(null);
          setExports([]);
        }
      }
    };

    void loadArtifacts();

    return () => {
      active = false;
    };
  }, [artifactRefreshKey, exactSavedSchedule]);

  useEffect(() => {
    if (exports.length === 0) {
      setSelectedExportId("");
      return;
    }

    if (!exports.some((item) => item.id === selectedExportId)) {
      setSelectedExportId(exports[0]!.id);
    }
  }, [exports, selectedExportId]);

  const selectedExport = useMemo(
    () => exports.find((item) => item.id === selectedExportId) ?? null,
    [exports, selectedExportId]
  );
  const calendarWeeks = useMemo(() => buildCalendarDays(selectedMonth), [selectedMonth]);
  const firstWeekDateSet = useMemo(
    () =>
      new Set(
        (calendarWeeks[0] ?? []).filter((day) => day.inCurrentMonth).map((day) => day.date)
      ),
    [calendarWeeks]
  );
  const displayItems = useMemo<ScheduleViewItem[]>(
    () =>
      (useGeneratedDraft || !exactSavedSchedule ? generatedItems : exactSavedSchedule.items).map((item) => ({
        employeeCode: item.employeeCode ?? "",
        employeeName:
          item.employeeName ??
          employeeNameByCode.get(item.employeeCode ?? "") ??
          item.employeeCode ??
          "-",
        workDate: item.workDate,
        dutyCode: item.dutyCode,
        startTime: item.startTime,
        endTime: item.endTime,
        breakMinutes: item.breakMinutes
      })),
    [employeeNameByCode, exactSavedSchedule, generatedItems, useGeneratedDraft]
  );
  const assignmentsByDate = useMemo(
    () => buildCalendarAssignmentsByDate(displayItems),
    [displayItems]
  );
  const weeklyRows = useMemo(
    () => buildSummaryRows(displayItems.filter((item) => firstWeekDateSet.has(item.workDate)), holidayDates),
    [displayItems, firstWeekDateSet, holidayDates]
  );
  const monthlyRows = useMemo(
    () => buildSummaryRows(displayItems, holidayDates),
    [displayItems, holidayDates]
  );
  const summaryTitle = useMemo(
    () => ({
      weekly: `${formatMonthLabel(selectedMonth)} 1주차 요약`,
      monthly: `${formatMonthLabel(selectedMonth)} 월간 합계`
    }),
    [selectedMonth]
  );
  const currentSourceLabel = useMemo(
    () => (useGeneratedDraft || !exactSavedSchedule ? "미저장 초안" : "저장된 근무표"),
    [exactSavedSchedule, useGeneratedDraft]
  );
  const generationIssueMessage = draftIssues.map((issue) => issue.message).join(" ");
  const canGenerate = Boolean(selectedPattern) && generatedItems.length > 0 && draftIssues.length === 0;
  const canSave =
    generatedBy.trim().length > 0 &&
    (useGeneratedDraft || !exactSavedSchedule ? canGenerate : Boolean(exactSavedSchedule));

  const handleSaveSchedule = async () => {
    setActionError(null);
    setActionMessage(null);

    if (!selectedSite || !selectedPattern) {
      setActionError("근무지와 교대 패턴을 먼저 선택해야 합니다.");
      return;
    }

    if (!generatedBy.trim()) {
      setActionError("생성자를 입력해야 합니다.");
      return;
    }

    const saveItems = (useGeneratedDraft || !exactSavedSchedule ? generatedItems : exactSavedSchedule.items).map(
      (item) => ({
        employeeCode: item.employeeCode ?? "",
        workDate: item.workDate,
        dutyCode: item.dutyCode,
        startTime: item.startTime,
        endTime: item.endTime,
        breakMinutes: item.breakMinutes
      })
    );

    if (saveItems.length === 0) {
      setActionError("저장할 월간 근무표 데이터가 없습니다.");
      return;
    }

    setIsSaving(true);

    try {
      const result = await window.appBridge.saveMonthlySchedule({
        id: exactSavedSchedule?.id,
        siteId: selectedSite.id,
        scheduleMonth: selectedMonth,
        patternId: selectedPattern.id,
        generatedBy: generatedBy.trim(),
        items: saveItems
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setUseGeneratedDraft(false);
      setActionMessage("월간 근무표를 저장했습니다.");
      setRefreshKey((current) => current + 1);
      setArtifactRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportSchedule = async () => {
    setActionError(null);
    setActionMessage(null);

    if (!exactSavedSchedule) {
      setActionError("엑셀 내보내기는 근무표 저장 후 사용할 수 있습니다.");
      return;
    }

    setIsExporting(true);

    try {
      const result = await window.appBridge.exportMonthlySchedulePlan(exactSavedSchedule.id);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      if (!result.data) {
        setActionError("내보내기 대상 근무표를 찾을 수 없습니다.");
        return;
      }

      setActionMessage("근무표 엑셀 파일을 생성했습니다.");
      setArtifactRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePublishExport = async () => {
    setActionError(null);
    setActionMessage(null);

    if (!selectedExport) {
      setActionError("배포 승인할 내보내기 이력을 먼저 선택해야 합니다.");
      return;
    }

    setIsPublishing(true);

    try {
      const result = await window.appBridge.publishSchedulePlanExport(selectedExport.id);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      if (!result.data) {
        setActionError("배포 승인 대상 파일을 찾을 수 없습니다.");
        return;
      }

      setActionMessage("선택한 근무표 파일을 승인 배포 폴더로 복사했습니다.");
      setArtifactRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="screen-stack schedule-screen">
      <section className="surface-card schedule-filter-shell">
        <div className="filter-grid schedule-filter-grid">
          <label className="field filter-field filter-field-md">
            <span>근무월</span>
            <input
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setWorkflowMonth(event.target.value);
              }}
              type="month"
              value={selectedMonth}
            />
          </label>
          <label className="field filter-field filter-field-md">
            <span>근무지</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                startTransition(() => {
                  setSelectedSiteId(event.target.value);
                  setWorkflowSiteId(event.target.value);
                });
              }}
              selectClassName="top-filter-select"
              value={selectedSiteId}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field filter-field filter-field-md">
            <span>교대 패턴</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                startTransition(() => {
                  setSelectedPatternId(event.target.value);
                });
              }}
              selectClassName="top-filter-select"
              value={selectedPatternId}
            >
              {sitePatterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.name}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="field filter-field filter-field-md">
            <span>생성자</span>
            <input
              onChange={(event) => {
                setGeneratedBy(event.target.value);
              }}
              placeholder="생성자"
              value={generatedBy}
            />
          </label>
        </div>
        <div className="button-row schedule-filter-actions">
          <span className={useGeneratedDraft || !exactSavedSchedule ? "pill warn" : "pill info"}>
            {currentSourceLabel}
          </span>
          <span className="pill neutral">{siteEmployees.length}명 배정</span>
          <span className="pill neutral">{displayItems.length}건 일정</span>
          {selectedSite ? (
            <button
              className="ghost-button"
              onClick={() => {
                openRoute("sites", {
                  selectedSiteId: selectedSite.id,
                  selectedMonth
                });
              }}
              type="button"
            >
              근무지 관리 열기
            </button>
          ) : null}
          {exactSavedSchedule && useGeneratedDraft ? (
            <button
              className="ghost-button"
              onClick={() => {
                setUseGeneratedDraft(false);
              }}
              type="button"
            >
              저장본 보기
            </button>
          ) : null}
          <button
            className="ghost-button"
            disabled={!canGenerate}
            onClick={() => {
              setUseGeneratedDraft(true);
              setActionError(null);
              setActionMessage("현재 배정 기준으로 월간 초안을 다시 생성했습니다.");
            }}
            type="button"
          >
            다시 생성
          </button>
          <button
            className="primary-button"
            disabled={!canSave || isSaving}
            onClick={() => {
              void handleSaveSchedule();
            }}
            type="button"
          >
            {isSaving ? "저장 중..." : "월간 저장"}
          </button>
        </div>
      </section>

      {screenError ? <p className="form-error-text">{screenError}</p> : null}
      {generationIssueMessage ? <p className="form-error-text">{generationIssueMessage}</p> : null}
      {actionError ? <p className="form-error-text">{actionError}</p> : null}
      {actionMessage ? <p className="form-success-text">{actionMessage}</p> : null}

      <section className="schedule-layout">
        <article className="surface-card schedule-calendar-panel">
          <div className="schedule-calendar-toolbar">
            <div className="calendar-navigation">
              <button
                className="ghost-button compact-button"
                onClick={() => {
                  startTransition(() => {
                    const nextValue = addMonths(selectedMonth, -1);
                    setSelectedMonth(nextValue);
                    setWorkflowMonth(nextValue);
                  });
                }}
                type="button"
              >
                ←
              </button>
              <div className="schedule-calendar-copy">
                <strong>{formatMonthLabel(selectedMonth)}</strong>
                <span>
                  {selectedSite?.name ?? "근무지 미선택"} / {selectedPattern?.name ?? "패턴 미선택"}
                </span>
              </div>
              <button
                className="ghost-button compact-button"
                onClick={() => {
                  startTransition(() => {
                    const nextValue = addMonths(selectedMonth, 1);
                    setSelectedMonth(nextValue);
                    setWorkflowMonth(nextValue);
                  });
                }}
                type="button"
              >
                →
              </button>
            </div>
            <div className="legend-row schedule-legend-row">
              {(["D", "E", "N"] as DutyCode[]).map((dutyCode) => (
                <span className={`legend-item ${dutyToneByCode[dutyCode]}`} key={dutyCode}>
                  {dutyLabelByCode[dutyCode]}
                </span>
              ))}
            </div>
          </div>
          <div className="desktop-calendar-head">
            {dayNames.map((dayName) => (
              <span key={dayName}>{dayName}</span>
            ))}
          </div>
          <div className="desktop-calendar-grid">
            {calendarWeeks.flatMap((week, weekIndex) =>
              week.map((day, dayIndex) => {
                const assignments = assignmentsByDate.get(day.date) ?? [];
                const isRestDay =
                  day.isWeekend || assignments.every((assignment) => assignment.dutyCode === "O");
                const cellClassName = [
                  "desktop-calendar-cell",
                  isRestDay ? "rest" : "",
                  day.inCurrentMonth ? "" : "outside"
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div className={cellClassName} key={`${weekIndex}-${dayIndex}-${day.date}`}>
                    <div className="desktop-calendar-top">
                      <strong>{day.dayLabel}</strong>
                    </div>
                    <div
                      className={
                        assignments.length > 0
                          ? "desktop-calendar-members"
                          : "desktop-calendar-members empty"
                      }
                    >
                      {day.inCurrentMonth ? (
                        assignments.length > 0 ? (
                          assignments.map((assignment) => (
                            <span
                              className={`desktop-member-chip ${assignment.tone}`}
                              key={`${day.date}-${assignment.dutyCode}`}
                              title={`${assignment.dutyLabel} ${assignment.count}명`}
                            >
                              {assignment.displayLabel}
                            </span>
                          ))
                        ) : (
                          <span className="desktop-member-chip off">배정 없음</span>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>

        <aside className="schedule-summary-side">
          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading">
              <h3>{summaryTitle.weekly}</h3>
            </div>
            <div className="data-scroll">
              <table className="info-table compact-table">
                <thead>
                  <tr>
                    <th>사원명</th>
                    <th>기본근로시간</th>
                    <th>연장근로시간</th>
                    <th>야간근로시간</th>
                    <th>법정휴일근로시간</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5}>근무표 정보를 불러오는 중입니다.</td>
                    </tr>
                  ) : weeklyRows.length > 0 ? (
                    weeklyRows.map((row, index) => (
                      <tr key={`${row.employeeName}-${index}`}>
                        <td>{row.employeeName}</td>
                        <td>{row.baseHours}</td>
                        <td>{row.overtimeHours}</td>
                        <td>{row.nightHours}</td>
                        <td>{row.legalHolidayHours}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>집계할 주간 데이터가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading">
              <h3>{summaryTitle.monthly}</h3>
            </div>
            <div className="data-scroll">
              <table className="info-table compact-table">
                <thead>
                  <tr>
                    <th>사원명</th>
                    <th>기본근로시간</th>
                    <th>연장근로시간</th>
                    <th>야간근로시간</th>
                    <th>법정휴일근로시간</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5}>근무표 정보를 불러오는 중입니다.</td>
                    </tr>
                  ) : monthlyRows.length > 0 ? (
                    monthlyRows.map((row, index) => (
                      <tr key={`${row.employeeName}-${index}`}>
                        <td>{row.employeeName}</td>
                        <td>{row.baseHours}</td>
                        <td>{row.overtimeHours}</td>
                        <td>{row.nightHours}</td>
                        <td>{row.legalHolidayHours}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>집계할 월간 데이터가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </aside>
      </section>

      <section className="schedule-bottom-grid">
        <article className="surface-card schedule-status-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>배포 상태</h3>
              <p>저장, 내보내기, 승인 배포 흐름을 같은 화면에서 확인합니다.</p>
            </div>
          </div>
          <div className="schedule-status-list">
            <div className="schedule-status-item">
              <span>저장 상태</span>
              <strong>{currentSourceLabel}</strong>
            </div>
            <div className="schedule-status-item">
              <span>생성자 / 저장시각</span>
              <strong>
                {generatedBy || "-"} / {formatDateTime(exactSavedSchedule?.generatedAt)}
              </strong>
            </div>
            <div className="schedule-status-item">
              <span>내보내기 폴더</span>
              <strong>{settings?.scheduleExportDir ?? "-"}</strong>
            </div>
            <div className="schedule-status-item">
              <span>승인 배포 폴더</span>
              <strong>{settings?.approvedDir ?? "-"}</strong>
            </div>
            <div className="schedule-status-item">
              <span>최근 내보내기</span>
              <strong>{selectedExport?.outputFileName ?? "-"}</strong>
            </div>
            <div className="schedule-status-item multiline">
              <span>파일 경로</span>
              <strong>{selectedExport?.outputPath ?? "내보내기 이력이 없습니다."}</strong>
            </div>
          </div>
          <div className="button-row schedule-status-actions">
            <button
              className="ghost-button"
              disabled={!exactSavedSchedule || isExporting}
              onClick={() => {
                void handleExportSchedule();
              }}
              type="button"
            >
              {isExporting ? "내보내는 중..." : "엑셀 내보내기"}
            </button>
            <button
              className="primary-button"
              disabled={!selectedExport || selectedExport.publishStatus === "published" || isPublishing}
              onClick={() => {
                void handlePublishExport();
              }}
              type="button"
            >
              {isPublishing ? "배포 중..." : "배포 승인"}
            </button>
          </div>
        </article>

        <article className="surface-card schedule-preview-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>근무표 미리보기</h3>
              <p>저장된 월간 근무표 기준으로 Excel 셀 업데이트를 확인합니다.</p>
            </div>
          </div>
          {preview ? (
            <>
              <div className="schedule-preview-stats">
                <div className="schedule-preview-stat">
                  <span>시트명</span>
                  <strong>{preview.templateSheetName}</strong>
                </div>
                <div className="schedule-preview-stat">
                  <span>업데이트 셀 수</span>
                  <strong>{preview.updateCount}건</strong>
                </div>
              </div>
              <ul className="schedule-preview-list">
                {preview.updates.slice(0, 8).map((update) => (
                  <li key={`${update.address}-${update.value}`}>
                    <strong>{update.address}</strong>
                    <span>{update.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="schedule-empty-state">
              <strong>저장된 근무표가 있어야 미리보기를 생성할 수 있습니다.</strong>
            </div>
          )}
        </article>

        <article className="surface-card schedule-history-card">
          <div className="section-heading compact-heading">
            <div>
              <h3>내보내기 이력</h3>
              <p>선택한 월간 근무표의 파일 생성 및 승인 상태입니다.</p>
            </div>
          </div>
          <div className="data-scroll">
            <table className="info-table compact-table">
              <thead>
                <tr>
                  <th>생성시각</th>
                  <th>파일명</th>
                  <th>상태</th>
                  <th>선택</th>
                </tr>
              </thead>
              <tbody>
                {exports.length > 0 ? (
                  exports.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.exportedAt)}</td>
                      <td>{item.outputFileName}</td>
                      <td>
                        <span className={`pill ${exportStatusTone[item.publishStatus ?? "draft"]}`}>
                          {exportStatusLabel[item.publishStatus ?? "draft"]}
                        </span>
                      </td>
                      <td>
                        <button
                          className={selectedExportId === item.id ? "icon-button active" : "icon-button"}
                          onClick={() => {
                            setSelectedExportId(item.id);
                          }}
                          type="button"
                        >
                          {selectedExportId === item.id ? "선택됨" : "선택"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>아직 생성된 내보내기 이력이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
};
