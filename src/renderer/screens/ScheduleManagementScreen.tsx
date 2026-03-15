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
  ShiftPatternCycle,
  ShiftPatternRecord,
  SiteRecord
} from "@shared/domain/model";
import type { SchedulePlanExportRecord } from "@shared/domain/schedule-plan";

import { FormSelect } from "../components/FormSelect";
import { useAppWorkflow } from "../contexts/app-workflow-context";

type DutyCode = "D" | "E" | "N" | "O";
type DutyTone = "day" | "night" | "first" | "second" | "third" | "off";

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
  employeeName: string;
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

const dutyDisplayOrder: DutyCode[] = ["D", "E", "N"];

interface DutyDisplayConfig {
  visibleCodes: DutyCode[];
  labelByCode: Record<DutyCode, string>;
  toneByCode: Record<DutyCode, DutyTone>;
}

interface EmployeeScheduleVisibility {
  included: boolean;
  chipTone: "active" | "partial" | "warn" | "danger" | "muted";
  note?: string;
}

interface TeamRosterCard {
  teamLabel: string;
  cycleName: string;
  cycleOrder: number;
  shiftCount: number;
  teamIndex: number | null;
  maxHeadcount?: number;
  assignedCount: number;
  includedMembers: Array<{
    employee: EmployeeRecord;
    visibility: EmployeeScheduleVisibility;
  }>;
  excludedMembers: Array<{
    employee: EmployeeRecord;
    visibility: EmployeeScheduleVisibility;
  }>;
}

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

const getMonthBoundaryValues = (monthValue: string) => {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return {
      startDate: `${monthValue}-01`,
      endDate: `${monthValue}-31`
    };
  }

  const lastDate = new Date(year, month, 0).getDate();

  return {
    startDate: `${monthValue}-01`,
    endDate: `${monthValue}-${String(lastDate).padStart(2, "0")}`
  };
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

const compareTeamLabel = (left: string, right: string) => {
  const leftMatch = left.trim().toUpperCase().match(/[A-Z]+|\d+/);
  const rightMatch = right.trim().toUpperCase().match(/[A-Z]+|\d+/);

  if (leftMatch && rightMatch && leftMatch[0] !== rightMatch[0]) {
    return leftMatch[0].localeCompare(rightMatch[0], "ko-KR", { numeric: true });
  }

  return left.localeCompare(right, "ko-KR", { numeric: true });
};

const createTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const isPoolShiftGroup = (value?: string) => value?.trim().toUpperCase() === "POOL";

const getPatternCycles = (pattern: ShiftPatternRecord | null): ShiftPatternCycle[] => {
  if (!pattern) {
    return [];
  }

  if (pattern.cycles.length > 0) {
    return pattern.cycles;
  }

  return [
    {
      id: `${pattern.id}-legacy`,
      cycleKey: "cycle-1",
      name: "Cycle 1",
      order: 0,
      shiftCount: Math.max(getPatternWorkingShiftCount(pattern), 1),
      cycleLength: pattern.cycleLength,
      patternCode: pattern.patternCode,
      patternStartDate: pattern.patternStartDate,
      steps: pattern.steps,
      teamIndexes: pattern.teamIndexes
    }
  ];
};

const getPatternTeamLabels = (
  pattern: ShiftPatternRecord | null,
  assignedEmployees: EmployeeRecord[]
) => {
  if (!pattern) {
    return [];
  }

  const labels = new Set<string>();

  createTeamLabels(pattern.teamCount).forEach((teamLabel) => {
    labels.add(teamLabel);
  });
  pattern.teamIndexes.forEach((item) => {
    labels.add(item.teamLabel.trim());
  });
  pattern.cycles.forEach((cycle) => {
    cycle.teamIndexes.forEach((item) => {
      labels.add(item.teamLabel.trim());
    });
  });
  pattern.teamCycleAssignments.forEach((item) => {
    labels.add(item.teamLabel.trim());
  });
  assignedEmployees.forEach((employee) => {
    const teamLabel = employee.currentShiftGroup?.trim();

    if (teamLabel) {
      labels.add(teamLabel);
    }
  });

  return Array.from(labels).sort(compareTeamLabel);
};

const getAssignmentMonthOverlap = (employee: EmployeeRecord, scheduleMonth: string) => {
  const { startDate, endDate } = getMonthBoundaryValues(scheduleMonth);
  const assignmentStartDate = employee.currentAssignmentStartDate;
  const assignmentEndDate = employee.currentAssignmentEndDate;

  if (assignmentStartDate && assignmentStartDate > endDate) {
    return {
      overlaps: false,
      partial: false,
      note: `${assignmentStartDate}부터 배정`
    };
  }

  if (assignmentEndDate && assignmentEndDate <= startDate) {
    return {
      overlaps: false,
      partial: false,
      note: `${assignmentEndDate} 배정 종료`
    };
  }

  if (assignmentStartDate && assignmentStartDate > startDate) {
    return {
      overlaps: true,
      partial: true,
      note: `${assignmentStartDate}부터 반영`
    };
  }

  if (assignmentEndDate && assignmentEndDate <= endDate) {
    return {
      overlaps: true,
      partial: true,
      note: `${assignmentEndDate} 전까지만 반영`
    };
  }

  return {
    overlaps: true,
    partial: false
  };
};

const getEmployeeScheduleVisibility = (
  employee: EmployeeRecord,
  siteId: string,
  scheduleMonth: string
): EmployeeScheduleVisibility => {
  if (employee.currentSiteId !== siteId) {
    return {
      included: false,
      chipTone: "muted",
      note: "다른 근무지"
    };
  }

  const assignmentVisibility = getAssignmentMonthOverlap(employee, scheduleMonth);

  if (!assignmentVisibility.overlaps) {
    return {
      included: false,
      chipTone: "muted",
      note: assignmentVisibility.note ?? "배정 기간 외"
    };
  }

  if (isPoolShiftGroup(employee.currentShiftGroup)) {
    return {
      included: false,
      chipTone: "muted",
      note: "Pool 운영으로 달력 제외"
    };
  }

  if (!employee.currentShiftGroup?.trim()) {
    return {
      included: false,
      chipTone: "warn",
      note: "근무조 미지정"
    };
  }

  if (employee.status === "leave") {
    return {
      included: false,
      chipTone: "warn",
      note: "휴직 상태"
    };
  }

  if (employee.status === "retired") {
    if (!employee.retireDate) {
      return {
        included: false,
        chipTone: "danger",
        note: "퇴사 상태"
      };
    }

    if (employee.retireDate <= `${scheduleMonth}-01`) {
      return {
        included: false,
        chipTone: "danger",
        note: `${employee.retireDate} 퇴사`
      };
    }

    return {
      included: true,
      chipTone: "partial",
      note: assignmentVisibility.partial
        ? `${assignmentVisibility.note} / ${employee.retireDate} 전까지만 반영`
        : `${employee.retireDate} 전까지만 반영`
    };
  }

  return {
    included: true,
    chipTone: assignmentVisibility.partial ? "partial" : "active",
    note: assignmentVisibility.partial ? assignmentVisibility.note : undefined
  };
};

const getPatternWorkingShiftCount = (pattern: ShiftPatternRecord | null) => {
  if (!pattern) {
    return 0;
  }

  const cycles =
    pattern.cycles.length > 0 ? pattern.cycles : [{ steps: pattern.steps }];
  const seen = new Set<string>();

  cycles.forEach((cycle) => {
    cycle.steps.forEach((step) => {
      const dutyCode = step.dutyCode.trim().toUpperCase();

      if (dutyCode && dutyCode !== "X" && dutyCode !== "OFF" && dutyCode !== "O") {
        seen.add(dutyCode);
      }
    });
  });

  return Math.min(seen.size, 3);
};

const getDutyDisplayConfig = (pattern: ShiftPatternRecord | null): DutyDisplayConfig => {
  const workingShiftCount = getPatternWorkingShiftCount(pattern);

  if (workingShiftCount <= 1) {
    return {
      visibleCodes: ["D"] as DutyCode[],
      labelByCode: {
        D: "주간",
        E: "중간",
        N: "야간",
        O: "휴무"
      } satisfies Record<DutyCode, string>,
      toneByCode: {
        D: "day",
        E: "second",
        N: "night",
        O: "off"
      } satisfies Record<DutyCode, DutyTone>
    };
  }

  if (workingShiftCount === 2) {
    return {
      visibleCodes: ["D", "N"] as DutyCode[],
      labelByCode: {
        D: "주간",
        E: "중간",
        N: "야간",
        O: "휴무"
      } satisfies Record<DutyCode, string>,
      toneByCode: {
        D: "day",
        E: "second",
        N: "night",
        O: "off"
      } satisfies Record<DutyCode, DutyTone>
    };
  }

  return {
    visibleCodes: ["D", "E", "N"] as DutyCode[],
    labelByCode: {
        D: "1근",
        E: "2근",
        N: "3근",
        O: "휴무"
      } satisfies Record<DutyCode, string>,
    toneByCode: {
      D: "first",
      E: "second",
      N: "third",
      O: "off"
    } satisfies Record<DutyCode, DutyTone>
  };
};

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
  items: ScheduleViewItem[],
  dutyDisplayConfig: DutyDisplayConfig
): Map<string, CalendarAssignment[]> => {
  const grouped = new Map<string, CalendarAssignment[]>();

  items.forEach((item) => {
    const dutyCode = normalizeDutyCode(item.dutyCode);

    if (dutyCode === "O") {
      return;
    }

    const current = grouped.get(item.workDate) ?? [];

    current.push({
      dutyCode,
      dutyLabel: dutyDisplayConfig.labelByCode[dutyCode],
      tone: dutyDisplayConfig.toneByCode[dutyCode],
      employeeName: item.employeeName,
      displayLabel: `${dutyDisplayConfig.labelByCode[dutyCode]} · ${item.employeeName}`
    });
    grouped.set(item.workDate, current);
  });

  return new Map(
    Array.from(grouped.entries()).map(([workDate, assignments]) => [
      workDate,
      assignments.slice().sort((left, right) => {
        const dutyOrderDifference =
          dutyDisplayOrder.indexOf(left.dutyCode) - dutyDisplayOrder.indexOf(right.dutyCode);

        if (dutyOrderDifference !== 0) {
          return dutyOrderDifference;
        }

        return left.employeeName.localeCompare(right.employeeName, "ko-KR", {
          numeric: true
        });
      })
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

const isEmployeeIncludedInSchedulePool = (
  employee: EmployeeRecord,
  siteId: string,
  scheduleMonth: string
) => getEmployeeScheduleVisibility(employee, siteId, scheduleMonth).included;

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
  const [exports, setExports] = useState<SchedulePlanExportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0);

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
  const assignedSiteEmployees = useMemo(
    () => employees.filter((employee) => employee.currentSiteId === selectedSiteId),
    [employees, selectedSiteId]
  );
  const scheduledEmployees = useMemo(
    () =>
      assignedSiteEmployees.filter((employee) =>
        isEmployeeIncludedInSchedulePool(employee, selectedSiteId, selectedMonth)
      ),
    [assignedSiteEmployees, selectedMonth, selectedSiteId]
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
            employees: scheduledEmployees
          })
        : [],
    [scheduledEmployees, selectedMonth, selectedPattern]
  );
  const generatedItems = useMemo(
    () =>
      selectedPattern
        ? buildMonthlyScheduleDraft({
            scheduleMonth: selectedMonth,
            pattern: selectedPattern,
            employees: scheduledEmployees
          })
        : [],
    [scheduledEmployees, selectedMonth, selectedPattern]
  );

  useEffect(() => {
    setGeneratedBy(exactSavedSchedule?.generatedBy ?? defaultGeneratedBy);
    setActionError(null);
    setActionMessage(null);
  }, [defaultGeneratedBy, exactSavedSchedule?.id, selectedMonth, selectedPatternId, selectedSiteId]);

  useEffect(() => {
    let active = true;

    const loadExports = async () => {
      if (!exactSavedSchedule) {
        setExports([]);
        return;
      }

      try {
        const exportResult = await window.appBridge.listSchedulePlanExports(exactSavedSchedule.id);

        if (!active) {
          return;
        }

        if (exportResult.ok) {
          setExports(exportResult.data);
        } else {
          setExports([]);
        }
      } catch {
        if (active) {
          setExports([]);
        }
      }
    };

    void loadExports();

    return () => {
      active = false;
    };
  }, [artifactRefreshKey, exactSavedSchedule]);
  const calendarWeeks = useMemo(() => buildCalendarDays(selectedMonth), [selectedMonth]);
  const firstWeekDateSet = useMemo(
    () =>
      new Set(
        (calendarWeeks[0] ?? []).filter((day) => day.inCurrentMonth).map((day) => day.date)
      ),
    [calendarWeeks]
  );
  const dutyDisplayConfig = useMemo(() => getDutyDisplayConfig(selectedPattern), [selectedPattern]);
  const displayItems = useMemo<ScheduleViewItem[]>(
    () =>
      generatedItems.map((item) => ({
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
    [employeeNameByCode, generatedItems]
  );
  const assignmentsByDate = useMemo(
    () => buildCalendarAssignmentsByDate(displayItems, dutyDisplayConfig),
    [displayItems, dutyDisplayConfig]
  );
  const patternCycles = useMemo(() => getPatternCycles(selectedPattern), [selectedPattern]);
  const teamRosters = useMemo<TeamRosterCard[]>(() => {
    if (!selectedPattern) {
      return [];
    }

    const cycleByKey = new Map(patternCycles.map((cycle) => [cycle.cycleKey, cycle]));
    const teamCycleByLabel = new Map(
      (
        selectedPattern.teamCycleAssignments.length > 0
          ? selectedPattern.teamCycleAssignments
          : patternCycles.flatMap((cycle) =>
              cycle.teamIndexes.map((item) => ({
                teamLabel: item.teamLabel,
                cycleKey: cycle.cycleKey
              }))
            )
      ).map((item) => [item.teamLabel.trim(), item.cycleKey])
    );
    const capacityByLabel = new Map(
      selectedPattern.teamCapacities.map((item) => [item.teamLabel.trim(), item.maxHeadcount])
    );

    return getPatternTeamLabels(selectedPattern, assignedSiteEmployees)
      .filter((teamLabel) => !isPoolShiftGroup(teamLabel))
      .map((teamLabel) => {
        const cycle =
          cycleByKey.get(teamCycleByLabel.get(teamLabel) ?? "") ?? patternCycles[0] ?? null;
        const teamIndex =
          cycle?.teamIndexes.find((item) => item.teamLabel.trim() === teamLabel)?.index ??
          selectedPattern.teamIndexes.find((item) => item.teamLabel.trim() === teamLabel)?.index ??
          null;
        const assignedMembers = assignedSiteEmployees
          .filter((employee) => employee.currentShiftGroup?.trim() === teamLabel)
          .slice()
          .sort((left, right) =>
            left.name.localeCompare(right.name, "ko-KR", { numeric: true })
          );
        const includedMembers = assignedMembers
          .map((employee) => ({
            employee,
            visibility: getEmployeeScheduleVisibility(employee, selectedSiteId, selectedMonth)
          }))
          .filter((item) => item.visibility.included);
        const excludedMembers = assignedMembers
          .map((employee) => ({
            employee,
            visibility: getEmployeeScheduleVisibility(employee, selectedSiteId, selectedMonth)
          }))
          .filter((item) => !item.visibility.included);

        return {
          teamLabel,
          cycleName: cycle?.name ?? "Cycle 1",
          cycleOrder: cycle?.order ?? 0,
          shiftCount: cycle?.shiftCount ?? Math.max(getPatternWorkingShiftCount(selectedPattern), 1),
          teamIndex,
          maxHeadcount: capacityByLabel.get(teamLabel),
          assignedCount: assignedMembers.length,
          includedMembers,
          excludedMembers
        };
      })
      .sort((left, right) => {
        if (left.cycleOrder !== right.cycleOrder) {
          return left.cycleOrder - right.cycleOrder;
        }

        return compareTeamLabel(left.teamLabel, right.teamLabel);
      });
  }, [assignedSiteEmployees, patternCycles, selectedMonth, selectedPattern, selectedSiteId]);
  const poolMembers = useMemo(
    () =>
      assignedSiteEmployees
        .filter((employee) => isPoolShiftGroup(employee.currentShiftGroup))
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, "ko-KR", { numeric: true }))
        .map((employee) => ({
          employee,
          visibility: getEmployeeScheduleVisibility(employee, selectedSiteId, selectedMonth)
        })),
    [assignedSiteEmployees, selectedMonth, selectedSiteId]
  );
  const assignedMemberCount = assignedSiteEmployees.length;
  const calendarParticipantCount = teamRosters.reduce(
    (accumulator, team) => accumulator + team.includedMembers.length,
    0
  );
  const calendarExcludedCount =
    teamRosters.reduce((accumulator, team) => accumulator + team.excludedMembers.length, 0) +
    poolMembers.length;
  const rosterNotes = useMemo(
    () =>
      [
        ...teamRosters.flatMap((team) =>
          team.excludedMembers.map(
            ({ employee, visibility }) => `${team.teamLabel} ${employee.name}: ${visibility.note ?? "달력 제외"}`
          )
        ),
        ...poolMembers.map(
          ({ employee, visibility }) => `Pool ${employee.name}: ${visibility.note ?? "달력 제외"}`
        )
      ].slice(0, 4),
    [poolMembers, teamRosters]
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
  const latestExport = useMemo(
    () =>
      exports
        .slice()
        .sort((left, right) => right.exportedAt.localeCompare(left.exportedAt))[0] ?? null,
    [exports]
  );
  const generationIssueMessage = draftIssues.map((issue) => issue.message).join(" ");
  const canDeploy =
    generatedBy.trim().length > 0 &&
    Boolean(selectedPattern) &&
    generatedItems.length > 0 &&
    draftIssues.length === 0;
  const deploymentStatusLabel = latestExport ? "배포완료" : "미배포";
  const deploymentStatusTone = latestExport ? "info" : "warn";

  const saveCurrentSchedule = async () => {
    setActionError(null);
    setActionMessage(null);

    if (!selectedSite || !selectedPattern) {
      setActionError("근무지와 교대 패턴을 먼저 선택해야 합니다.");
      return;
    }

    if (!generatedBy.trim()) {
      setActionError("생성자를 입력해야 합니다.");
      return null;
    }

    const saveItems = generatedItems.map((item) => ({
        employeeCode: item.employeeCode ?? "",
        workDate: item.workDate,
        dutyCode: item.dutyCode,
        startTime: item.startTime,
        endTime: item.endTime,
        breakMinutes: item.breakMinutes
      }));

    if (saveItems.length === 0) {
      setActionError("저장할 월간 근무표 데이터가 없습니다.");
      return null;
    }

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
        return null;
      }

      setRefreshKey((current) => current + 1);
      return result.data;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return null;
    }
  };

  const handleDeploySchedule = async () => {
    if (!selectedSite) {
      setActionError("배포할 근무지를 먼저 선택해 주세요.");
      return;
    }

    const shouldDeploy = window.confirm(
      `${selectedSite.name} 근무지의 ${formatMonthLabel(selectedMonth)} 근무표를 배포하시겠습니까?`
    );

    if (!shouldDeploy) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsDeploying(true);

    try {
      const savedSchedule = await saveCurrentSchedule();

      if (!savedSchedule) {
        return;
      }

      const result = await window.appBridge.exportMonthlySchedulePlan(savedSchedule.id);

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      if (!result.data) {
        setActionError("내보내기 대상 근무표를 찾을 수 없습니다.");
        return;
      }

      setActionMessage("근무표를 배포했습니다.");
      setArtifactRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="screen-stack schedule-screen">
      <section className="surface-card schedule-filter-shell">
        <div className="schedule-filter-topline">
          <div className="schedule-filter-copy">
            <strong>근무표 배포</strong>
            <span>기준 월과 근무지, 교대 패턴을 고르면 달력과 배포 상태가 즉시 정리됩니다.</span>
          </div>
          <div className="schedule-filter-pills">
            <span className={`pill ${deploymentStatusTone}`}>{deploymentStatusLabel}</span>
            <span className="pill neutral">전체 배정 {assignedMemberCount}명</span>
            <span className="pill neutral">달력 반영 {calendarParticipantCount}명</span>
            <span className="pill warn">달력 제외 {calendarExcludedCount}명</span>
          </div>
        </div>
        <div className="schedule-filter-bar">
          <div className="filter-grid schedule-filter-grid">
            <label className="field filter-field filter-field-md schedule-filter-field">
              <span>근무월</span>
              <input
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                }}
                type="month"
                value={selectedMonth}
              />
            </label>
            <label className="field filter-field filter-field-md schedule-filter-field">
              <span>근무지</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  startTransition(() => {
                    setSelectedSiteId(event.target.value);
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
            <label className="field filter-field filter-field-md schedule-filter-field">
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
            <label className="field filter-field filter-field-md schedule-filter-field">
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
            <button
              className="primary-button"
              disabled={!canDeploy || isDeploying}
              onClick={() => {
                void handleDeploySchedule();
              }}
              type="button"
            >
              {isDeploying ? "배포 중..." : "배포"}
            </button>
          </div>
        </div>
        <div className="schedule-filter-meta">
          <div className="schedule-selection-card">
            <span className="schedule-selection-label">선택 정보</span>
            <strong>{selectedSite?.name ?? "근무지 미선택"}</strong>
            <span>{selectedPattern?.name ?? "패턴 미선택"}</span>
          </div>
          <div className="schedule-selection-card">
            <span className="schedule-selection-label">배포 기준</span>
            <strong>{formatMonthLabel(selectedMonth)}</strong>
            <span>{displayItems.length}건 일정 생성</span>
          </div>
          <div className="schedule-selection-card">
            <span className="schedule-selection-label">주의 사항</span>
            <strong>{rosterNotes.length > 0 ? `${rosterNotes.length}건 확인` : "제외 인원 없음"}</strong>
            <span>
              {rosterNotes[0] ??
                "현재 배정 정보 기준으로 달력에 반영되는 인원과 제외 인원을 함께 표시합니다."}
            </span>
          </div>
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
                  });
                }}
                type="button"
              >
                →
              </button>
            </div>
            <div className="legend-row schedule-legend-row">
              {dutyDisplayConfig.visibleCodes.map((dutyCode) => (
                <span className={`legend-item ${dutyDisplayConfig.toneByCode[dutyCode]}`} key={dutyCode}>
                  {dutyDisplayConfig.labelByCode[dutyCode]}
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
                const isRestDay = day.isWeekend || assignments.length === 0;
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
                      {day.inCurrentMonth && assignments.length > 0
                        ? assignments.map((assignment, assignmentIndex) => (
                            <span
                              className={`desktop-member-chip ${assignment.tone}`}
                              key={`${day.date}-${assignment.dutyCode}-${assignment.employeeName}-${assignmentIndex}`}
                              title={assignment.displayLabel}
                            >
                              {assignment.displayLabel}
                            </span>
                          ))
                        : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>

        <aside className="schedule-summary-side">
          <article className="surface-card schedule-team-overview-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>근무조 편성 정보</h3>
                <p>
                  선택한 근무지의 조별 배정 인원과 달력 반영 여부를 함께 보여줍니다.
                </p>
              </div>
            </div>
            <div className="schedule-team-overview-grid">
              {teamRosters.map((team) => (
                <section className="schedule-team-roster-card" key={team.teamLabel}>
                  <div className="schedule-team-roster-head">
                    <div>
                      <strong>{team.teamLabel}</strong>
                      <span>
                        {team.cycleName} · Index {team.teamIndex ?? "-"} · {team.shiftCount}교대
                      </span>
                    </div>
                    <div className="schedule-team-roster-metrics">
                      <span>{team.assignedCount}명 배정</span>
                      {team.maxHeadcount ? <span>정원 {team.maxHeadcount}명</span> : null}
                    </div>
                  </div>
                  <div className="schedule-team-roster-section">
                    <span className="schedule-team-roster-label">달력 반영</span>
                    <div className="schedule-person-chip-list">
                      {team.includedMembers.length > 0 ? (
                        team.includedMembers.map(({ employee, visibility }) => (
                          <span
                            className={`schedule-person-chip ${visibility.chipTone}`}
                            key={`${team.teamLabel}-${employee.employeeCode}`}
                            title={visibility.note ?? `${team.teamLabel} 달력 반영`}
                          >
                            {employee.name}
                            {visibility.note ? <small>{visibility.note}</small> : null}
                          </span>
                        ))
                      ) : (
                        <span className="schedule-empty-note">반영 인원 없음</span>
                      )}
                    </div>
                  </div>
                  {team.excludedMembers.length > 0 ? (
                    <div className="schedule-team-roster-section">
                      <span className="schedule-team-roster-label">달력 제외</span>
                      <div className="schedule-person-chip-list">
                        {team.excludedMembers.map(({ employee, visibility }) => (
                          <span
                            className={`schedule-person-chip ${visibility.chipTone}`}
                            key={`${team.teamLabel}-${employee.employeeCode}-excluded`}
                            title={visibility.note ?? `${team.teamLabel} 달력 제외`}
                          >
                            {employee.name}
                            {visibility.note ? <small>{visibility.note}</small> : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
              {selectedPattern?.poolEnabled ? (
                <section className="schedule-team-roster-card pool-card">
                  <div className="schedule-team-roster-head">
                    <div>
                      <strong>Pool</strong>
                      <span>별도 운영 · 달력 제외</span>
                    </div>
                    <div className="schedule-team-roster-metrics">
                      <span>{poolMembers.length}명 배정</span>
                    </div>
                  </div>
                  <div className="schedule-team-roster-section">
                    <span className="schedule-team-roster-label">현재 인원</span>
                    <div className="schedule-person-chip-list">
                      {poolMembers.length > 0 ? (
                        poolMembers.map(({ employee, visibility }) => (
                          <span
                            className={`schedule-person-chip ${visibility.chipTone}`}
                            key={`pool-${employee.employeeCode}`}
                            title={visibility.note ?? "Pool 운영"}
                          >
                            {employee.name}
                            {visibility.note ? <small>{visibility.note}</small> : null}
                          </span>
                        ))
                      ) : (
                        <span className="schedule-empty-note">배정 인원 없음</span>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </article>

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
              <p>현재 근무현황을 검토한 뒤 바로 배포할 수 있도록 흐름을 단순화했습니다.</p>
            </div>
          </div>
          <div className="schedule-status-list">
            <div className="schedule-status-item">
              <span>현재 상태</span>
              <strong>{deploymentStatusLabel}</strong>
            </div>
            <div className="schedule-status-item">
              <span>생성자 / 기준월</span>
              <strong>
                {generatedBy || "-"} / {formatMonthLabel(selectedMonth)}
              </strong>
            </div>
            <div className="schedule-status-item">
              <span>배포 경로</span>
              <strong>{settings?.scheduleExportDir ?? "-"}</strong>
            </div>
            <div className="schedule-status-item">
              <span>최근 배포 파일</span>
              <strong>{latestExport?.outputFileName ?? "-"}</strong>
            </div>
            <div className="schedule-status-item multiline">
              <span>최근 배포 시각 / 파일 위치</span>
              <strong>
                {latestExport
                  ? `${formatDateTime(latestExport.exportedAt)} / ${latestExport.outputPath}`
                  : "아직 배포 이력이 없습니다."}
              </strong>
            </div>
          </div>
          <div className="button-row schedule-status-actions">
            <button
              className="primary-button"
              disabled={!canDeploy || isDeploying}
              onClick={() => {
                void handleDeploySchedule();
              }}
              type="button"
            >
              {isDeploying ? "배포 중..." : "배포"}
            </button>
          </div>
        </article>
      </section>
    </div>
  );
};
