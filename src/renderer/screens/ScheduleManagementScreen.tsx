import { startTransition, useEffect, useMemo, useState } from "react";

import type { AppSettingsSnapshot } from "@shared/bridge/contracts";
import { canPerformAction } from "@shared/domain/authorization";
import { getEmployeeScheduleStartDate } from "@shared/domain/employee-dates";
import {
  calculateWorkBreakdown,
  DEFAULT_WORK_BREAKDOWN,
} from "@shared/domain/calculation";
import { formatEmployeeDisplayName } from "@shared/domain/employment-type";
import {
  buildMonthlyScheduleDraft,
  getMonthlyScheduleDraftIssues,
} from "@shared/domain/monthly-schedule-draft";
import {
  buildScheduleRuleWarnings,
  defaultScheduleRuleWarningSettings,
  type ScheduleRuleWarningRule,
} from "@shared/domain/schedule-rule-warning";
import type {
  AuthSession,
  DocumentTemplateVersion,
  EmployeeRecord,
  MonthlyScheduleRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  SiteRecord,
} from "@shared/domain/model";
import type { SchedulePlanExportRecord } from "@shared/domain/schedule-plan";
import { compareTeamLabels } from "@shared/domain/team-label";
import { resolveShiftPatternForMonth } from "@shared/domain/shift-pattern-version";

import { FormSelect } from "../components/FormSelect";
import { useQuestionDialog } from "../components/QuestionDialog";
import { useAppWorkflow } from "../contexts/app-workflow-context";

type DutyCode = "D" | "E" | "N" | "O";
type DutyTone = "day" | "night" | "first" | "second" | "third" | "off";

interface CalendarDay {
  date: string;
  dayLabel: string;
  inCurrentMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
}

interface CalendarAssignment {
  dutyCode: DutyCode;
  dutyLabel: string;
  tone: DutyTone;
  displayLabel: string;
  employeeCode: string;
  employeeName: string;
  sortOrder?: number;
  teamLabel?: string;
}

interface ScheduleSummaryAccumulator {
  employeeCode: string;
  employeeName: string;
  totalMinutes: number;
  baseMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
}

interface ScheduleSummaryRow {
  employeeName: string;
  totalHours: string;
  baseHours: string;
  overtimeHours: string;
  nightHours: string;
  legalHolidayHours: string;
}

interface ScheduleViewItem {
  employeeCode: string;
  employeeName: string;
  teamLabel?: string;
  sortOrder?: number;
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

interface WeeklySummaryOption {
  weekNumber: number;
  dates: string[];
}

const POOL_ROSTER_CARD_KEY = "pool";

const dayNames = ["일", "월", "화", "수", "목", "금", "토"] as const;
const scheduleRuleWarningLabels: Record<ScheduleRuleWarningRule, string> = {
  "consecutive-night": "연속 야간",
  "minimum-rest": "휴식시간",
  "weekly-holiday": "주휴",
  "weekly-max-minutes": "주간 총시간",
};

const createCurrentMonthValue = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const splitMonthValue = (value: string) => {
  const [year = String(new Date().getFullYear()), month = "01"] =
    value.split("-");
  return {
    year,
    month,
  };
};

const createDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const getHolidayNameSizeClass = (name?: string) => {
  if (!name) {
    return "";
  }

  if (name.length >= 9) {
    return "is-xlong";
  }

  if (name.length >= 6) {
    return "is-long";
  }

  return "";
};

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

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return {
      startDate: `${monthValue}-01`,
      endDate: `${monthValue}-31`,
    };
  }

  const lastDate = new Date(year, month, 0).getDate();

  return {
    startDate: `${monthValue}-01`,
    endDate: `${monthValue}-${String(lastDate).padStart(2, "0")}`,
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
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
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

const getEmployeeDisplayName = (
  employee?: Pick<EmployeeRecord, "name" | "employmentType"> | null,
) => (employee ? formatEmployeeDisplayName(employee) : "");

const getManagedTemplateFileName = (
  template: Pick<DocumentTemplateVersion, "id" | "sourcePath">,
) => {
  const fileName =
    template.sourcePath.split(/[/\\]/).pop() ?? template.sourcePath;
  const legacyPrefix = `${template.id}_`;

  return fileName.startsWith(legacyPrefix)
    ? fileName.slice(legacyPrefix.length)
    : fileName;
};

const formatTemplateLabel = (template: DocumentTemplateVersion) => {
  return `${template.versionLabel} · ${getManagedTemplateFileName(template)}`;
};

const getScheduleTemplateVariant = (
  template?: DocumentTemplateVersion | null,
) => {
  const fileName = template ? getManagedTemplateFileName(template) : "";

  if (fileName.includes("근무표_템플릿2")) {
    return "sample2";
  }

  if (fileName.includes("근무표_템플릿1")) {
    return "sample1";
  }

  return "sample1";
};

const getTemplateSupportedDutyCodes = (
  template?: DocumentTemplateVersion | null,
): DutyCode[] => {
  const variant = getScheduleTemplateVariant(template);

  if (variant === "sample2") {
    return ["D", "N", "O"];
  }

  return ["D", "E", "N", "O"];
};

const createTeamLabels = (teamCount: number) =>
  Array.from(
    { length: teamCount },
    (_, index) => `${String.fromCharCode(65 + index)}조`,
  );

const isPoolShiftGroup = (value?: string) =>
  value?.trim().toUpperCase() === "POOL";

const createRosterCardKey = (teamLabel: string) => `team:${teamLabel}`;

const getResolvedAssignmentSortOrder = (value?: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER;

const compareEmployeeAssignmentOrder = (
  left: Pick<EmployeeRecord, "currentAssignmentOrder" | "employeeCode" | "name">,
  right: Pick<EmployeeRecord, "currentAssignmentOrder" | "employeeCode" | "name">,
) => {
  const assignmentOrderDifference =
    getResolvedAssignmentSortOrder(left.currentAssignmentOrder) -
    getResolvedAssignmentSortOrder(right.currentAssignmentOrder);

  if (assignmentOrderDifference !== 0) {
    return assignmentOrderDifference;
  }

  const employeeCodeDifference = left.employeeCode.localeCompare(
    right.employeeCode,
    "ko-KR",
    {
      numeric: true,
    },
  );

  if (employeeCodeDifference !== 0) {
    return employeeCodeDifference;
  }

  return left.name.localeCompare(right.name, "ko-KR", { numeric: true });
};

const getPatternCycles = (
  pattern: ShiftPatternRecord | null,
): ShiftPatternCycle[] => {
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
      teamIndexes: pattern.teamIndexes,
    },
  ];
};

const getPatternTeamLabels = (
  pattern: ShiftPatternRecord | null,
  assignedEmployees: EmployeeRecord[],
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

  return Array.from(labels).sort(compareTeamLabels);
};

const getAssignmentMonthOverlap = (
  employee: EmployeeRecord,
  scheduleMonth: string,
) => {
  const { startDate, endDate } = getMonthBoundaryValues(scheduleMonth);
  // Later of the hire date and the assignment start (T-23): a mid-month transfer shows up from
  // the day it takes effect, and the draft builder uses the same rule.
  const assignmentStartDate = getEmployeeScheduleStartDate(employee);
  const assignmentEndDate = employee.currentAssignmentEndDate;

  if (assignmentStartDate && assignmentStartDate > endDate) {
    return {
      overlaps: false,
      partial: false,
      note: `${assignmentStartDate}부터 배정`,
    };
  }

  if (assignmentEndDate && assignmentEndDate <= startDate) {
    return {
      overlaps: false,
      partial: false,
      note: `${assignmentEndDate} 배정 종료`,
    };
  }

  if (assignmentStartDate && assignmentStartDate > startDate) {
    return {
      overlaps: true,
      partial: true,
      note: `${assignmentStartDate}부터 반영`,
    };
  }

  if (assignmentEndDate && assignmentEndDate <= endDate) {
    return {
      overlaps: true,
      partial: true,
      note: `${assignmentEndDate} 전까지만 반영`,
    };
  }

  return {
    overlaps: true,
    partial: false,
  };
};

// 이 조가 근무표 생성 대상인지. Pool 성격 조는 Cycle이 배정돼 있으면 다른 조와 동일하게 생성되고,
// 배정이 없으면 기존처럼 달력에서 빠진다. 관리자가 끈 조도 빠진다.
const getTeamScheduleExclusion = (
  pattern: ShiftPatternRecord | null | undefined,
  teamLabel: string,
): "inactive-team" | "pool-without-cycle" | null => {
  const setting = pattern?.teamSettings?.find((item) => item.teamLabel.trim() === teamLabel);

  if (setting && !setting.isActive) {
    return "inactive-team";
  }

  const hasCycle = pattern?.teamCycleAssignments?.some(
    (item) => item.teamLabel.trim() === teamLabel,
  );

  if (hasCycle) {
    return null;
  }

  const isPoolTeam = setting ? setting.workType === "POOL" : isPoolShiftGroup(teamLabel);

  return isPoolTeam ? "pool-without-cycle" : null;
};

const getEmployeeScheduleVisibility = (
  employee: EmployeeRecord,
  siteId: string,
  scheduleMonth: string,
  pattern?: ShiftPatternRecord | null,
): EmployeeScheduleVisibility => {
  if (employee.currentSiteId !== siteId) {
    return {
      included: false,
      chipTone: "muted",
      note: "다른 근무지",
    };
  }

  const assignmentVisibility = getAssignmentMonthOverlap(
    employee,
    scheduleMonth,
  );

  if (!assignmentVisibility.overlaps) {
    return {
      included: false,
      chipTone: "muted",
      note: assignmentVisibility.note ?? "배정 기간 외",
    };
  }

  const teamExclusion = getTeamScheduleExclusion(
    pattern,
    employee.currentShiftGroup?.trim() ?? "",
  );

  if (teamExclusion === "inactive-team") {
    return {
      included: false,
      chipTone: "muted",
      note: "사용하지 않는 조",
    };
  }

  if (teamExclusion === "pool-without-cycle") {
    return {
      included: false,
      chipTone: "muted",
      note: "Pool 운영으로 달력 제외",
    };
  }

  if (!employee.currentShiftGroup?.trim()) {
    return {
      included: false,
      chipTone: "warn",
      note: "근무조 미지정",
    };
  }

  if (employee.status === "leave") {
    return {
      included: false,
      chipTone: "warn",
      note: "휴직 상태",
    };
  }

  if (employee.status === "retired") {
    if (!employee.retireDate) {
      return {
        included: false,
        chipTone: "danger",
        note: "퇴사 상태",
      };
    }

    if (employee.retireDate <= `${scheduleMonth}-01`) {
      return {
        included: false,
        chipTone: "danger",
        note: `${employee.retireDate} 퇴사`,
      };
    }

    return {
      included: true,
      chipTone: "partial",
      note: assignmentVisibility.partial
        ? `${assignmentVisibility.note} / ${employee.retireDate} 전까지만 반영`
        : `${employee.retireDate} 전까지만 반영`,
    };
  }

  return {
    included: true,
    chipTone: assignmentVisibility.partial ? "partial" : "active",
    note: assignmentVisibility.partial ? assignmentVisibility.note : undefined,
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

      if (
        dutyCode &&
        dutyCode !== "X" &&
        dutyCode !== "OFF" &&
        dutyCode !== "O"
      ) {
        seen.add(dutyCode);
      }
    });
  });

  return Math.min(seen.size, 3);
};

const getDutyDisplayConfig = (
  pattern: ShiftPatternRecord | null,
): DutyDisplayConfig => {
  const workingShiftCount = getPatternWorkingShiftCount(pattern);

  if (workingShiftCount <= 1) {
    return {
      visibleCodes: ["D"] as DutyCode[],
      labelByCode: {
        D: "주간",
        E: "중간",
        N: "야간",
        O: "휴무",
      } satisfies Record<DutyCode, string>,
      toneByCode: {
        D: "day",
        E: "second",
        N: "night",
        O: "off",
      } satisfies Record<DutyCode, DutyTone>,
    };
  }

  if (workingShiftCount === 2) {
    return {
      visibleCodes: ["D", "N"] as DutyCode[],
      labelByCode: {
        D: "주간",
        E: "중간",
        N: "야간",
        O: "휴무",
      } satisfies Record<DutyCode, string>,
      toneByCode: {
        D: "day",
        E: "second",
        N: "night",
        O: "off",
      } satisfies Record<DutyCode, DutyTone>,
    };
  }

  return {
    visibleCodes: ["D", "E", "N"] as DutyCode[],
    labelByCode: {
      D: "1근",
      E: "2근",
      N: "3근",
      O: "휴무",
    } satisfies Record<DutyCode, string>,
    toneByCode: {
      D: "first",
      E: "second",
      N: "third",
      O: "off",
    } satisfies Record<DutyCode, DutyTone>,
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

const buildCalendarDays = (
  scheduleMonth: string,
  holidayNameByDate: Map<string, string>,
): CalendarDay[][] => {
  const [yearText, monthText] = scheduleMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
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
    const dateValue = createDateValue(cursor);
    const holidayName = holidayNameByDate.get(dateValue);

    days.push({
      date: dateValue,
      dayLabel: String(cursor.getDate()),
      inCurrentMonth: cursor.getMonth() === month - 1,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      isHoliday: Boolean(holidayName),
      holidayName,
    });
  }

  return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );
};

const buildCalendarAssignmentsByDate = (
  items: ScheduleViewItem[],
  dutyDisplayConfig: DutyDisplayConfig,
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
      employeeCode: item.employeeCode,
      employeeName: item.employeeName,
      sortOrder: item.sortOrder,
      teamLabel: item.teamLabel,
      displayLabel: `${dutyDisplayConfig.labelByCode[dutyCode]} · ${item.employeeName}`,
    });
    grouped.set(item.workDate, current);
  });

  return new Map(
    Array.from(grouped.entries()).map(([workDate, assignments]) => [
      workDate,
      assignments.slice().sort((left, right) => {
        const dutyOrderDifference =
          dutyDisplayOrder.indexOf(left.dutyCode) -
          dutyDisplayOrder.indexOf(right.dutyCode);

        if (dutyOrderDifference !== 0) {
          return dutyOrderDifference;
        }

        const teamLabelDifference = compareTeamLabels(
          left.teamLabel ?? "",
          right.teamLabel ?? "",
        );

        if (teamLabelDifference !== 0) {
          return teamLabelDifference;
        }

        const assignmentOrderDifference =
          getResolvedAssignmentSortOrder(left.sortOrder) -
          getResolvedAssignmentSortOrder(right.sortOrder);

        if (assignmentOrderDifference !== 0) {
          return assignmentOrderDifference;
        }

        const employeeCodeDifference = left.employeeCode.localeCompare(
          right.employeeCode,
          "ko-KR",
          {
            numeric: true,
          },
        );

        if (employeeCodeDifference !== 0) {
          return employeeCodeDifference;
        }

        return left.employeeName.localeCompare(right.employeeName, "ko-KR", {
          numeric: true,
        });
      }),
    ]),
  );
};

const buildSummaryRows = (
  items: ScheduleViewItem[],
  holidayDates: Set<string>,
): ScheduleSummaryRow[] => {
  const grouped = new Map<string, ScheduleSummaryAccumulator>();

  items.forEach((item) => {
    const current =
      grouped.get(item.employeeCode) ??
      ({
        employeeCode: item.employeeCode,
        employeeName: item.employeeName,
        totalMinutes: 0,
        baseMinutes: 0,
        overtimeMinutes: 0,
        nightMinutes: 0,
        holidayMinutes: 0,
      } satisfies ScheduleSummaryAccumulator);
    const dutyCode = normalizeDutyCode(item.dutyCode);
    const breakdown =
      dutyCode === "O" || !item.startTime || !item.endTime
        ? DEFAULT_WORK_BREAKDOWN
        : calculateWorkBreakdown({
            isHoliday:
              holidayDates.has(item.workDate) || isWeekendDate(item.workDate),
            timeRange: {
              startTime: item.startTime,
              endTime: item.endTime,
              breakMinutes: item.breakMinutes,
            },
          });

    current.totalMinutes += breakdown.totalWorkMinutes;
    current.baseMinutes += breakdown.baseWorkMinutes;
    current.overtimeMinutes += breakdown.overtimeMinutes;
    current.nightMinutes += breakdown.nightMinutes;
    current.holidayMinutes += breakdown.holidayMinutes;
    grouped.set(item.employeeCode, current);
  });

  const rows = Array.from(grouped.values())
    .sort((left, right) =>
      left.employeeName.localeCompare(right.employeeName, "ko-KR"),
    )
    .map((row) => ({
      employeeName: row.employeeName,
      totalHours: formatHours(row.totalMinutes),
      baseHours: formatHours(row.baseMinutes),
      overtimeHours: formatHours(row.overtimeMinutes),
      nightHours: formatHours(row.nightMinutes),
      legalHolidayHours: formatHours(row.holidayMinutes),
    }));

  if (rows.length === 0) {
    return rows;
  }

  const totals = Array.from(grouped.values()).reduce(
    (accumulator, row) => ({
      totalMinutes: accumulator.totalMinutes + row.totalMinutes,
      baseMinutes: accumulator.baseMinutes + row.baseMinutes,
      overtimeMinutes: accumulator.overtimeMinutes + row.overtimeMinutes,
      nightMinutes: accumulator.nightMinutes + row.nightMinutes,
      holidayMinutes: accumulator.holidayMinutes + row.holidayMinutes,
    }),
    {
      totalMinutes: 0,
      baseMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      holidayMinutes: 0,
    },
  );

  rows.push({
    employeeName: "직원 합계",
    totalHours: formatHours(totals.totalMinutes),
    baseHours: formatHours(totals.baseMinutes),
    overtimeHours: formatHours(totals.overtimeMinutes),
    nightHours: formatHours(totals.nightMinutes),
    legalHolidayHours: formatHours(totals.holidayMinutes),
  });

  return rows;
};

// 근무표를 만들 달에 유효했던 설정 버전을 고른다.
// 설정을 바꿔도 지난 달 근무표는 그때 규칙 그대로 다시 만들어진다.
const getPrimaryPattern = (patterns: ShiftPatternRecord[], scheduleMonth: string) =>
  resolveShiftPatternForMonth(patterns, scheduleMonth) ?? patterns[0] ?? null;

const isEmployeeIncludedInSchedulePool = (
  employee: EmployeeRecord,
  siteId: string,
  scheduleMonth: string,
  pattern?: ShiftPatternRecord | null,
) => getEmployeeScheduleVisibility(employee, siteId, scheduleMonth, pattern).included;

interface ScheduleManagementScreenProps {
  session: AuthSession;
}

export const ScheduleManagementScreen = ({
  session,
}: ScheduleManagementScreenProps) => {
  const {
    selectedSiteId: workflowSiteId,
    selectedMonth: workflowMonth,
    setSelectedSiteId: setWorkflowSiteId,
    setSelectedMonth: setWorkflowMonth,
  } = useAppWorkflow();
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [schedules, setSchedules] = useState<MonthlyScheduleRecord[]>([]);
  const [scheduleTemplates, setScheduleTemplates] = useState<
    DocumentTemplateVersion[]
  >([]);
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [holidayNameByDate, setHolidayNameByDate] = useState<
    Map<string, string>
  >(new Map());
  const [selectedSiteId, setSelectedSiteId] = useState(workflowSiteId);
  const [selectedPatternId, setSelectedPatternId] = useState("");
  const [selectedTemplateVersionId, setSelectedTemplateVersionId] =
    useState("");
  const [selectedMonth, setSelectedMonth] = useState(
    workflowMonth || createCurrentMonthValue(),
  );
  const [generatedBy, setGeneratedBy] = useState("operator");
  const [defaultGeneratedBy, setDefaultGeneratedBy] = useState("operator");
  const [expandedRosterKeys, setExpandedRosterKeys] = useState<string[]>([]);
  const [selectedWeeklySummaryIndex, setSelectedWeeklySummaryIndex] =
    useState(0);
  const [expandedSummaryCards, setExpandedSummaryCards] = useState({
    weekly: false,
    monthly: false,
  });
  const [isExportHistoryExpanded, setIsExportHistoryExpanded] = useState(false);
  const [exports, setExports] = useState<SchedulePlanExportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0);
  const { askQuestion, questionDialog } = useQuestionDialog();

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

  const selectedMonthParts = splitMonthValue(selectedMonth);
  const scheduleFilterYears = useMemo(() => {
    const years = new Set<string>([
      selectedMonthParts.year,
      createCurrentMonthValue().slice(0, 4),
    ]);

    schedules.forEach((schedule) => {
      years.add(schedule.scheduleMonth.slice(0, 4));
    });

    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [schedules, selectedMonthParts.year]);

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
          templateResult,
          settingsResult,
          sessionResult,
        ] = await Promise.all([
          window.appBridge.listSites(),
          window.appBridge.listShiftPatterns(),
          window.appBridge.listEmployees(),
          window.appBridge.listMonthlySchedules(),
          window.appBridge.listDocumentTemplateVersions("schedule"),
          window.appBridge.getAppSettings(),
          window.appBridge.getSession(),
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

        if (!templateResult.ok) {
          setScreenError(templateResult.message);
        } else {
          setScheduleTemplates(
            templateResult.data
              .filter((template) => template.status === "approved")
              .sort((left, right) => {
                if (left.isDefault !== right.isDefault) {
                  return left.isDefault ? -1 : 1;
                }

                return right.createdAt.localeCompare(left.createdAt);
              }),
          );
        }

        if (!settingsResult.ok) {
          setScreenError(settingsResult.message);
        } else {
          setSettings(settingsResult.data);
        }

        if (sessionResult.ok && sessionResult.data) {
          const sessionLabel =
            sessionResult.data.displayName || sessionResult.data.loginId;
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
          setHolidayNameByDate(new Map());
          return;
        }

        const holidayItems = result.data.flatMap((calendar) => calendar.items);
        const nextHolidayNameByDate = new Map<string, string>();

        holidayItems.forEach((item) => {
          if (!nextHolidayNameByDate.has(item.holidayDate)) {
            nextHolidayNameByDate.set(item.holidayDate, item.name);
          }
        });

        setHolidayDates(new Set(holidayItems.map((item) => item.holidayDate)));
        setHolidayNameByDate(nextHolidayNameByDate);
      } catch {
        if (active) {
          setHolidayDates(new Set());
          setHolidayNameByDate(new Map());
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
    [selectedSiteId, sites],
  );
  const sitePatterns = useMemo(
    () => patterns.filter((pattern) => pattern.siteId === selectedSiteId),
    [patterns, selectedSiteId],
  );

  // 근무지나 달이 바뀌면 그 달에 유효한 설정 버전으로 맞춘다.
  // 이미 저장된 근무표가 있으면 그 근무표가 쓴 버전을 그대로 둔다.
  useEffect(() => {
    if (sitePatterns.length === 0) {
      setSelectedPatternId("");
      return;
    }

    const savedPatternId = schedules.find(
      (schedule) =>
        schedule.siteId === selectedSiteId && schedule.scheduleMonth === selectedMonth,
    )?.patternId;

    if (savedPatternId && sitePatterns.some((pattern) => pattern.id === savedPatternId)) {
      setSelectedPatternId(savedPatternId);
      return;
    }

    setSelectedPatternId(getPrimaryPattern(sitePatterns, selectedMonth)?.id ?? "");
  }, [schedules, selectedMonth, selectedSiteId, sitePatterns]);

  const selectedPattern = useMemo(
    () =>
      sitePatterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
    [selectedPatternId, sitePatterns],
  );
  const exactSavedSchedule = useMemo(
    () =>
      schedules.find(
        (schedule) =>
          schedule.siteId === selectedSiteId &&
          schedule.scheduleMonth === selectedMonth &&
          schedule.patternId === selectedPatternId,
      ) ?? null,
    [schedules, selectedMonth, selectedPatternId, selectedSiteId],
  );
  const scheduleContextKey = `${selectedSiteId}::${selectedPatternId}::${selectedMonth}`;
  const selectedScheduleTemplate = useMemo(
    () =>
      scheduleTemplates.find(
        (template) => template.id === selectedTemplateVersionId,
      ) ?? null,
    [scheduleTemplates, selectedTemplateVersionId],
  );

  useEffect(() => {
    if (scheduleTemplates.length === 0) {
      setSelectedTemplateVersionId("");
      return;
    }

    const savedTemplateVersionId = exactSavedSchedule?.templateVersionId;

    if (
      savedTemplateVersionId &&
      scheduleTemplates.some(
        (template) => template.id === savedTemplateVersionId,
      )
    ) {
      setSelectedTemplateVersionId(savedTemplateVersionId);
      return;
    }

    setSelectedTemplateVersionId(
      scheduleTemplates.find((template) => template.isDefault)?.id ??
        scheduleTemplates[0]!.id,
    );
  }, [
    exactSavedSchedule?.templateVersionId,
    scheduleContextKey,
    scheduleTemplates,
  ]);
  const assignedSiteEmployees = useMemo(
    () =>
      employees.filter((employee) => employee.currentSiteId === selectedSiteId),
    [employees, selectedSiteId],
  );
  const scheduledEmployees = useMemo(
    () =>
      assignedSiteEmployees.filter((employee) =>
        isEmployeeIncludedInSchedulePool(
          employee,
          selectedSiteId,
          selectedMonth,
          selectedPattern,
        ),
      ),
    [assignedSiteEmployees, selectedMonth, selectedPattern, selectedSiteId],
  );
  const employeeNameByCode = useMemo(
    () =>
      new Map(
        employees.map((employee) => [
          employee.employeeCode,
          getEmployeeDisplayName(employee),
        ]),
      ),
    [employees],
  );
  const draftIssues = useMemo(
    () =>
      selectedPattern
        ? getMonthlyScheduleDraftIssues({
            scheduleMonth: selectedMonth,
            pattern: selectedPattern,
            employees: scheduledEmployees,
          })
        : [],
    [scheduledEmployees, selectedMonth, selectedPattern],
  );
  const generatedItems = useMemo(
    () =>
      selectedPattern
        ? buildMonthlyScheduleDraft({
            scheduleMonth: selectedMonth,
            pattern: selectedPattern,
            employees: scheduledEmployees,
            publicHolidayDates: holidayDates,
          })
        : [],
    [scheduledEmployees, selectedMonth, selectedPattern, holidayDates],
  );

  useEffect(() => {
    setGeneratedBy(exactSavedSchedule?.generatedBy ?? defaultGeneratedBy);
    setActionError(null);
    setActionMessage(null);
  }, [
    defaultGeneratedBy,
    exactSavedSchedule?.id,
    selectedMonth,
    selectedPatternId,
    selectedSiteId,
  ]);

  useEffect(() => {
    let active = true;

    const loadExports = async () => {
      if (!exactSavedSchedule) {
        setExports([]);
        return;
      }

      try {
        const exportResult = await window.appBridge.listSchedulePlanExports(
          exactSavedSchedule.id,
        );

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
  const calendarWeeks = useMemo(
    () => buildCalendarDays(selectedMonth, holidayNameByDate),
    [holidayNameByDate, selectedMonth],
  );
  const currentMonthWeeks = useMemo<WeeklySummaryOption[]>(
    () =>
      calendarWeeks.reduce<WeeklySummaryOption[]>((result, week) => {
        const dates = week
          .filter((day) => day.inCurrentMonth)
          .map((day) => day.date);

        if (dates.length === 0) {
          return result;
        }

        result.push({
          weekNumber: result.length + 1,
          dates,
        });

        return result;
      }, []),
    [calendarWeeks],
  );
  const dutyDisplayConfig = useMemo(
    () => getDutyDisplayConfig(selectedPattern),
    [selectedPattern],
  );
  const displayItems = useMemo<ScheduleViewItem[]>(
    () =>
      generatedItems.map((item) => ({
        employeeCode: item.employeeCode ?? "",
        employeeName:
          item.employeeName ??
          employeeNameByCode.get(item.employeeCode ?? "") ??
          item.employeeCode ??
          "-",
        teamLabel: item.teamLabel,
        sortOrder: item.sortOrder,
        workDate: item.workDate,
        dutyCode: item.dutyCode,
        startTime: item.startTime,
        endTime: item.endTime,
        breakMinutes: item.breakMinutes,
      })),
    [employeeNameByCode, generatedItems],
  );
  const assignmentsByDate = useMemo(
    () => buildCalendarAssignmentsByDate(displayItems, dutyDisplayConfig),
    [displayItems, dutyDisplayConfig],
  );
  const scheduleWarningSettings = useMemo(
    () => ({
      consecutiveNightLimit:
        settings?.scheduleConsecutiveNightLimit ??
        defaultScheduleRuleWarningSettings.consecutiveNightLimit,
      minimumRestMinutes:
        settings?.scheduleMinimumRestMinutes ??
        defaultScheduleRuleWarningSettings.minimumRestMinutes,
      requireWeeklyHoliday:
        settings?.scheduleRequireWeeklyHoliday ??
        defaultScheduleRuleWarningSettings.requireWeeklyHoliday,
      weeklyMaxMinutes:
        settings?.scheduleWeeklyMaxMinutes ??
        defaultScheduleRuleWarningSettings.weeklyMaxMinutes,
    }),
    [
      settings?.scheduleConsecutiveNightLimit,
      settings?.scheduleMinimumRestMinutes,
      settings?.scheduleRequireWeeklyHoliday,
      settings?.scheduleWeeklyMaxMinutes,
    ],
  );
  const scheduleRuleWarningSummary = useMemo(
    () => buildScheduleRuleWarnings(displayItems, scheduleWarningSettings),
    [displayItems, scheduleWarningSettings],
  );
  const topScheduleRuleWarnings = useMemo(
    () => scheduleRuleWarningSummary.warnings.slice(0, 5),
    [scheduleRuleWarningSummary.warnings],
  );
  const patternCycles = useMemo(
    () => getPatternCycles(selectedPattern),
    [selectedPattern],
  );
  const teamRosters = useMemo<TeamRosterCard[]>(() => {
    if (!selectedPattern) {
      return [];
    }

    const cycleByKey = new Map(
      patternCycles.map((cycle) => [cycle.cycleKey, cycle]),
    );
    const teamCycleByLabel = new Map(
      (selectedPattern.teamCycleAssignments.length > 0
        ? selectedPattern.teamCycleAssignments
        : patternCycles.flatMap((cycle) =>
            cycle.teamIndexes.map((item) => ({
              teamLabel: item.teamLabel,
              cycleKey: cycle.cycleKey,
            })),
          )
      ).map((item) => [item.teamLabel.trim(), item.cycleKey]),
    );
    const capacityByLabel = new Map(
      selectedPattern.teamCapacities.map((item) => [
        item.teamLabel.trim(),
        item.maxHeadcount,
      ]),
    );

    return getPatternTeamLabels(selectedPattern, assignedSiteEmployees)
      .filter(
        (teamLabel) =>
          getTeamScheduleExclusion(selectedPattern, teamLabel) !== "pool-without-cycle",
      )
      .map((teamLabel) => {
        const cycle =
          cycleByKey.get(teamCycleByLabel.get(teamLabel) ?? "") ??
          patternCycles[0] ??
          null;
        const teamIndex =
          cycle?.teamIndexes.find((item) => item.teamLabel.trim() === teamLabel)
            ?.index ??
          selectedPattern.teamIndexes.find(
            (item) => item.teamLabel.trim() === teamLabel,
          )?.index ??
          null;
        const assignedMembers = assignedSiteEmployees
          .filter(
            (employee) => employee.currentShiftGroup?.trim() === teamLabel,
          )
          .slice()
          .sort(compareEmployeeAssignmentOrder);
        const includedMembers = assignedMembers
          .map((employee) => ({
            employee,
            visibility: getEmployeeScheduleVisibility(
              employee,
              selectedSiteId,
              selectedMonth,
              selectedPattern,
            ),
          }))
          .filter((item) => item.visibility.included);
        const excludedMembers = assignedMembers
          .map((employee) => ({
            employee,
            visibility: getEmployeeScheduleVisibility(
              employee,
              selectedSiteId,
              selectedMonth,
              selectedPattern,
            ),
          }))
          .filter((item) => !item.visibility.included);

        return {
          teamLabel,
          cycleName: cycle?.name ?? "Cycle 1",
          cycleOrder: cycle?.order ?? 0,
          shiftCount:
            cycle?.shiftCount ??
            Math.max(getPatternWorkingShiftCount(selectedPattern), 1),
          teamIndex,
          maxHeadcount: capacityByLabel.get(teamLabel),
          assignedCount: assignedMembers.length,
          includedMembers,
          excludedMembers,
        };
      })
      .sort((left, right) => {
        if (left.cycleOrder !== right.cycleOrder) {
          return left.cycleOrder - right.cycleOrder;
        }

        return compareTeamLabels(left.teamLabel, right.teamLabel);
      });
  }, [
    assignedSiteEmployees,
    patternCycles,
    selectedMonth,
    selectedPattern,
    selectedSiteId,
  ]);
  const poolMembers = useMemo(
    () =>
      assignedSiteEmployees
        .filter(
          (employee) =>
            getTeamScheduleExclusion(
              selectedPattern,
              employee.currentShiftGroup?.trim() ?? "",
            ) === "pool-without-cycle",
        )
        .slice()
        .sort(compareEmployeeAssignmentOrder)
        .map((employee) => ({
          employee,
          visibility: getEmployeeScheduleVisibility(
            employee,
            selectedSiteId,
            selectedMonth,
            selectedPattern,
          ),
        })),
    [assignedSiteEmployees, selectedMonth, selectedPattern, selectedSiteId],
  );
  // Pool 조가 근무 묶음에 배정되면 다른 조와 똑같이 조 카드로 나온다. 그때는 이 별도 카드가
  // 빈 카드(배정 0명)로 겹쳐 보이므로, 묶음 배정 없이 빠진 인원이 있을 때만 보여 준다.
  const showPoolRosterCard = Boolean(selectedPattern?.poolEnabled) && poolMembers.length > 0;
  const availableRosterKeys = useMemo(() => {
    const keys = teamRosters.map((team) => createRosterCardKey(team.teamLabel));

    if (showPoolRosterCard) {
      keys.push(POOL_ROSTER_CARD_KEY);
    }

    return keys;
  }, [showPoolRosterCard, teamRosters]);
  const assignedMemberCount = assignedSiteEmployees.length;
  const calendarParticipantCount = teamRosters.reduce(
    (accumulator, team) => accumulator + team.includedMembers.length,
    0,
  );
  const calendarExcludedCount =
    teamRosters.reduce(
      (accumulator, team) => accumulator + team.excludedMembers.length,
      0,
    ) + poolMembers.length;
  const rosterNotes = useMemo(
    () =>
      [
        ...teamRosters.flatMap((team) =>
          team.excludedMembers.map(
            ({ employee, visibility }) =>
              `${team.teamLabel} ${getEmployeeDisplayName(employee)}: ${visibility.note ?? "달력 제외"}`,
          ),
        ),
        ...poolMembers.map(
          ({ employee, visibility }) =>
            `Pool ${getEmployeeDisplayName(employee)}: ${visibility.note ?? "달력 제외"}`,
        ),
      ].slice(0, 4),
    [poolMembers, teamRosters],
  );
  const areAllRosterCardsExpanded =
    availableRosterKeys.length > 0 &&
    availableRosterKeys.every((key) => expandedRosterKeys.includes(key));
  const selectedWeeklySummary =
    currentMonthWeeks[selectedWeeklySummaryIndex] ??
    currentMonthWeeks[Math.max(currentMonthWeeks.length - 1, 0)] ??
    null;
  const selectedWeeklyDateSet = useMemo(
    () => new Set(selectedWeeklySummary?.dates ?? []),
    [selectedWeeklySummary],
  );
  const weeklyRows = useMemo(
    () =>
      buildSummaryRows(
        displayItems.filter((item) => selectedWeeklyDateSet.has(item.workDate)),
        holidayDates,
      ),
    [displayItems, holidayDates, selectedWeeklyDateSet],
  );
  const monthlyRows = useMemo(
    () => buildSummaryRows(displayItems, holidayDates),
    [displayItems, holidayDates],
  );
  const summaryTitle = useMemo(
    () => ({
      weekly: `${formatMonthLabel(selectedMonth)} ${selectedWeeklySummary?.weekNumber ?? 1}주차 요약`,
      monthly: `${formatMonthLabel(selectedMonth)} 월간 합계`,
    }),
    [selectedMonth, selectedWeeklySummary?.weekNumber],
  );
  const weeklySummaryEmployeeCount = Math.max(
    weeklyRows.length - (weeklyRows.length > 0 ? 1 : 0),
    0,
  );
  const monthlySummaryEmployeeCount = Math.max(
    monthlyRows.length - (monthlyRows.length > 0 ? 1 : 0),
    0,
  );
  const latestExport = useMemo(
    () =>
      exports
        .slice()
        .sort((left, right) =>
          right.exportedAt.localeCompare(left.exportedAt),
        )[0] ?? null,
    [exports],
  );
  const recentExports = useMemo(
    () =>
      exports
        .slice()
        .sort((left, right) => right.exportedAt.localeCompare(left.exportedAt))
        .slice(0, 5),
    [exports],
  );

  useEffect(() => {
    setExpandedRosterKeys((currentKeys) =>
      currentKeys.filter((key) => availableRosterKeys.includes(key)),
    );
  }, [availableRosterKeys]);

  useEffect(() => {
    setExpandedRosterKeys([]);
  }, [selectedMonth, selectedPatternId, selectedSiteId]);

  useEffect(() => {
    if (currentMonthWeeks.length === 0) {
      if (selectedWeeklySummaryIndex !== 0) {
        setSelectedWeeklySummaryIndex(0);
      }
      return;
    }

    if (selectedWeeklySummaryIndex >= currentMonthWeeks.length) {
      setSelectedWeeklySummaryIndex(0);
    }
  }, [currentMonthWeeks.length, selectedWeeklySummaryIndex]);

  useEffect(() => {
    setSelectedWeeklySummaryIndex(0);
    setExpandedSummaryCards({
      weekly: false,
      monthly: false,
    });
    setIsExportHistoryExpanded(false);
  }, [selectedMonth, selectedPatternId, selectedSiteId]);
  const unsupportedTemplateDutyCodes = useMemo(
    () =>
      Array.from(
        new Set(
          generatedItems
            .map((item) => normalizeDutyCode(item.dutyCode))
            .filter(
              (dutyCode) =>
                !getTemplateSupportedDutyCodes(
                  selectedScheduleTemplate,
                ).includes(dutyCode),
            ),
        ),
      ),
    [generatedItems, selectedScheduleTemplate],
  );
  const templateGuidanceMessage = useMemo(() => {
    const variant = getScheduleTemplateVariant(selectedScheduleTemplate);

    if (unsupportedTemplateDutyCodes.length > 0) {
      return `${selectedScheduleTemplate?.versionLabel ?? "선택한 양식"}은(는) ${unsupportedTemplateDutyCodes.join(
        ", ",
      )} 근무를 지원하지 않습니다. 다른 양식을 선택하세요.`;
    }

    if (variant === "sample2") {
      return "근무표 양식 2는 2교대(D/N) 전용입니다. 3교대 패턴에는 사용할 수 없습니다.";
    }

    return "근무표 양식 1은 Day/Evening/Night 일반형 배포 양식입니다.";
  }, [selectedScheduleTemplate, unsupportedTemplateDutyCodes]);
  const generationIssueMessage = draftIssues
    .map((issue) => issue.message)
    .join(" ");
  const canManageScheduleDeployments = canPerformAction(
    session.role,
    "schedule-deploy",
  );
  const canDeploy =
    canManageScheduleDeployments &&
    Boolean(selectedPattern) &&
    Boolean(selectedScheduleTemplate) &&
    unsupportedTemplateDutyCodes.length === 0 &&
    generatedItems.length > 0 &&
    draftIssues.length === 0;
  const deploymentStatusLabel = latestExport
    ? latestExport.publishStatus === "published"
      ? "배포완료"
      : "배포 파일 생성"
    : "미배포";
  const deploymentStatusTone = latestExport
    ? latestExport.publishStatus === "published"
      ? "info"
      : "warn"
    : "warn";

  const saveCurrentSchedule = async () => {
    setActionError(null);
    setActionMessage(null);
    if (!canManageScheduleDeployments) {
      setActionError("배포 권한이 필요합니다.");
      return null;
    }

    if (!selectedSite || !selectedPattern) {
      setActionError("근무지와 교대 패턴을 먼저 선택해야 합니다.");
      return;
    }

    if (!selectedScheduleTemplate) {
      setActionError("배포 양식을 먼저 선택해야 합니다.");
      return null;
    }

    const resolvedGeneratedBy =
      generatedBy.trim() || defaultGeneratedBy || "operator";

    const saveItems = generatedItems.map((item) => ({
      teamLabel: item.teamLabel,
      sortOrder: item.sortOrder,
      employeeCode: item.employeeCode ?? "",
      workDate: item.workDate,
      dutyCode: item.dutyCode,
      startTime: item.startTime,
      endTime: item.endTime,
      breakMinutes: item.breakMinutes,
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
        generatedBy: resolvedGeneratedBy,
        templateVersionId: selectedScheduleTemplate.id,
        items: saveItems,
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
    if (!canManageScheduleDeployments) {
      setActionError("배포 권한이 필요합니다.");
      setActionMessage(null);
      return;
    }

    if (!selectedSite) {
      setActionError("배포할 근무지를 먼저 선택해 주세요.");
      return;
    }

    const shouldDeploy = await askQuestion({
      title: "근무표 배포 확인",
      message: `${selectedSite.name} 근무지의 ${formatMonthLabel(selectedMonth)} 근무표를 ${
        selectedScheduleTemplate?.versionLabel ?? "선택한 양식"
      }으로 배포하시겠습니까?`,
      confirmLabel: "배포",
      confirmVariant: "primary",
    });

    if (!shouldDeploy.confirmed) {
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

      const result = await window.appBridge.exportMonthlySchedulePlan(
        savedSchedule.id,
      );

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
      setIsDeploying(false);

      await askQuestion({
        title: "근무표 배포 완료",
        message: `${result.data.siteName} ${formatMonthLabel(result.data.scheduleMonth)} 근무표를 배포했습니다.`,
        description: (
          <>
            생성 파일: {result.data.outputFileName}
            <br />
            저장 경로: {result.data.outputPath}
          </>
        ),
        confirmLabel: "확인",
        hideCancel: true,
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="screen-stack schedule-screen">
      {questionDialog}

      <section className="surface-card schedule-filter-shell">
        <div className="schedule-filter-topline">
          <div className="schedule-filter-copy">
            <strong>근무표 배포</strong>
            <span>
              기준 월과 근무지, 교대 패턴을 고르면 달력과 배포 상태가 즉시
              정리됩니다.
            </span>
          </div>
          <div className="schedule-filter-pills">
            <span className={`pill ${deploymentStatusTone}`}>
              {deploymentStatusLabel}
            </span>
            <span className="pill neutral">
              전체 배정 {assignedMemberCount}명
            </span>
            <span className="pill neutral">
              달력 반영 {calendarParticipantCount}명
            </span>
            <span className="pill warn">
              달력 제외 {calendarExcludedCount}명
            </span>
          </div>
        </div>
        <div className="schedule-filter-bar">
          <div className="filter-grid schedule-filter-grid">
            <div className="field filter-field filter-field-md schedule-filter-field">
              <span>근무 날짜</span>
              <div className="filter-inline-pair">
                <FormSelect
                  aria-label="근무 날짜 연도"
                  className="top-filter-select-shell"
                  onChange={(event) => {
                    setSelectedMonth(
                      `${event.target.value}-${selectedMonthParts.month}`,
                    );
                  }}
                  selectClassName="top-filter-select"
                  value={selectedMonthParts.year}
                >
                  {scheduleFilterYears.map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))}
                </FormSelect>
                <FormSelect
                  aria-label="근무 날짜 월"
                  className="top-filter-select-shell"
                  onChange={(event) => {
                    setSelectedMonth(
                      `${selectedMonthParts.year}-${event.target.value}`,
                    );
                  }}
                  selectClassName="top-filter-select"
                  value={selectedMonthParts.month}
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
              </div>
            </div>
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
              <span>배포 양식</span>
              <FormSelect
                className="top-filter-select-shell"
                onChange={(event) => {
                  setSelectedTemplateVersionId(event.target.value);
                }}
                selectClassName="top-filter-select"
                value={selectedTemplateVersionId}
              >
                {scheduleTemplates.length > 0 ? (
                  scheduleTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {formatTemplateLabel(template)}
                    </option>
                  ))
                ) : (
                  <option value="">승인된 양식 없음</option>
                )}
              </FormSelect>
            </label>
          </div>
          <div className="button-row schedule-filter-actions">
            {canManageScheduleDeployments ? (
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
            ) : (
              <span className="site-field-note">배포 권한 필요</span>
            )}
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
            <span>
              {selectedScheduleTemplate
                ? `${selectedScheduleTemplate.versionLabel} / ${displayItems.length}건 일정 생성`
                : `${displayItems.length}건 일정 생성`}
            </span>
          </div>
          <div className="schedule-selection-card">
            <span className="schedule-selection-label">주의 사항</span>
            <strong>
              {unsupportedTemplateDutyCodes.length > 0
                ? "양식 호환성 확인"
                : rosterNotes.length > 0
                  ? `${rosterNotes.length}건 확인`
                  : "제외 인원 없음"}
            </strong>
            <span>
              {rosterNotes[0] ??
                "현재 배정 정보 기준으로 달력에 반영되는 인원과 제외 인원을 함께 표시합니다."}
            </span>
          </div>
        </div>
        {selectedScheduleTemplate ? (
          <p
            className={
              unsupportedTemplateDutyCodes.length > 0
                ? "form-error-text"
                : "form-success-text"
            }
          >
            {templateGuidanceMessage}
          </p>
        ) : (
          <p className="field-hint">
            승인된 배포 양식이 없습니다. 운영 관리에서 양식을 먼저 승인한 뒤 다시
            시도해 주세요.
          </p>
        )}
      </section>

      {screenError ? <p className="form-error-text">{screenError}</p> : null}
      {generationIssueMessage ? (
        <p className="form-error-text">{generationIssueMessage}</p>
      ) : null}
      {actionError ? <p className="form-error-text">{actionError}</p> : null}
      {actionMessage ? (
        <p className="form-success-text">{actionMessage}</p>
      ) : null}

      <section className="surface-card schedule-status-card">
        <div className="section-heading compact-heading">
          <div>
            <p className="section-kicker">근무표 규칙 점검</p>
            <h3>자동 경고</h3>
            <p>
              운영 설정 기준으로 주간 총시간, 연속 야간, 휴식시간, 주휴 누락을 점검합니다.
            </p>
          </div>
          <span className={`pill ${scheduleRuleWarningSummary.warningCount > 0 ? "warn" : "info"}`}>
            경고 {scheduleRuleWarningSummary.warningCount}건
          </span>
        </div>
        <div className="operations-summary-strip">
          {(
            [
              "weekly-max-minutes",
              "consecutive-night",
              "minimum-rest",
              "weekly-holiday",
            ] as ScheduleRuleWarningRule[]
          ).map((rule) => (
            <article
              className="operations-summary-card"
              data-tone={scheduleRuleWarningSummary.byRule[rule] > 0 ? "warn" : "ok"}
              key={rule}
            >
              <span>{scheduleRuleWarningLabels[rule]}</span>
              <strong>{scheduleRuleWarningSummary.byRule[rule]}건</strong>
              <em>
                {scheduleRuleWarningSummary.byRule[rule] > 0
                  ? "상세 확인 필요"
                  : "기준 내"}
              </em>
            </article>
          ))}
        </div>
        {topScheduleRuleWarnings.length > 0 ? (
          <ul className="database-migration-warning-list">
            {topScheduleRuleWarnings.map((warning) => (
              <li key={warning.id}>{warning.message}</li>
            ))}
          </ul>
        ) : (
          <p className="form-success-text">현재 선택한 근무표에서 규칙 경고가 없습니다.</p>
        )}
      </section>

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
                  {selectedSite?.name ?? "근무지 미선택"} /{" "}
                  {selectedPattern?.name ?? "패턴 미선택"}
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
                <span
                  className={`legend-item ${dutyDisplayConfig.toneByCode[dutyCode]}`}
                  key={dutyCode}
                >
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
                  day.isHoliday ? "holiday" : "",
                  day.inCurrentMonth ? "" : "outside",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    className={cellClassName}
                    key={`${weekIndex}-${dayIndex}-${day.date}`}
                  >
                    <div className="desktop-calendar-top">
                      <strong
                        className={
                          day.isHoliday
                            ? "desktop-calendar-date holiday"
                            : "desktop-calendar-date"
                        }
                      >
                        {day.dayLabel}
                      </strong>
                    </div>
                    {day.holidayName ? (
                      <span
                        className={`desktop-calendar-holiday ${getHolidayNameSizeClass(day.holidayName)}`}
                        title={`${day.date} · ${day.holidayName}`}
                      >
                        {day.holidayName}
                      </span>
                    ) : null}
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
              }),
            )}
          </div>
        </article>

        <aside className="schedule-summary-side">
          <article className="surface-card schedule-team-overview-card">
            <div className="section-heading compact-heading">
              <div>
                <h3>근무조 편성 정보</h3>
                <p>
                  선택한 근무지의 조별 배정 인원과 달력 반영 여부를 함께
                  보여줍니다.
                </p>
              </div>
              <div className="schedule-team-overview-toolbar">
                <div className="schedule-team-overview-totals">
                  <span>전체 {assignedMemberCount}명</span>
                  <span>달력 반영 {calendarParticipantCount}명</span>
                  <span>달력 제외 {calendarExcludedCount}명</span>
                </div>
                <button
                  className="ghost-button compact-button schedule-team-overview-toggle"
                  disabled={availableRosterKeys.length === 0}
                  onClick={() => {
                    setExpandedRosterKeys(
                      areAllRosterCardsExpanded ? [] : availableRosterKeys,
                    );
                  }}
                  type="button"
                >
                  {areAllRosterCardsExpanded ? "전체 접기" : "전체 펼치기"}
                </button>
              </div>
            </div>
            <div className="schedule-team-overview-grid">
              {teamRosters.map((team) => {
                const rosterKey = createRosterCardKey(team.teamLabel);
                const isExpanded = expandedRosterKeys.includes(rosterKey);

                return (
                  <section
                    className={`schedule-team-roster-card ${isExpanded ? "is-expanded" : "is-collapsed"}`}
                    key={team.teamLabel}
                  >
                    <div className="schedule-team-roster-head">
                      <div className="schedule-team-roster-copy">
                        <div className="schedule-team-roster-title-row">
                          <strong>{team.teamLabel}</strong>
                          <span>
                            {team.cycleName} · Index {team.teamIndex ?? "-"} ·{" "}
                            {team.shiftCount}교대
                          </span>
                        </div>
                        <div className="schedule-team-roster-summary-row">
                          <span className="schedule-team-roster-pill neutral">
                            배정 {team.assignedCount}명
                          </span>
                          <span className="schedule-team-roster-pill active">
                            반영 {team.includedMembers.length}명
                          </span>
                          <span className="schedule-team-roster-pill warn">
                            제외 {team.excludedMembers.length}명
                          </span>
                          {team.maxHeadcount ? (
                            <span className="schedule-team-roster-pill neutral">
                              정원 {team.maxHeadcount}명
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        className="ghost-button compact-button schedule-team-roster-toggle"
                        onClick={() => {
                          setExpandedRosterKeys((currentKeys) =>
                            currentKeys.includes(rosterKey)
                              ? currentKeys.filter((key) => key !== rosterKey)
                              : [...currentKeys, rosterKey],
                          );
                        }}
                        type="button"
                      >
                        {isExpanded ? "접기" : "상세"}
                      </button>
                    </div>
                    {!isExpanded && team.excludedMembers.length > 0 ? (
                      <p className="schedule-team-roster-issue">
                        {team.excludedMembers[0]?.visibility.note
                          ? `${getEmployeeDisplayName(team.excludedMembers[0].employee)}: ${team.excludedMembers[0].visibility.note}`
                          : "달력 제외 인원이 있습니다."}
                      </p>
                    ) : null}
                    {isExpanded ? (
                      <div className="schedule-team-roster-detail">
                        <div className="schedule-team-roster-section">
                          <span className="schedule-team-roster-label">
                            달력 반영
                          </span>
                          <div className="schedule-person-chip-list">
                            {team.includedMembers.length > 0 ? (
                              team.includedMembers.map(
                                ({ employee, visibility }) => (
                                  <span
                                    className={`schedule-person-chip ${visibility.chipTone}`}
                                    key={`${team.teamLabel}-${employee.employeeCode}`}
                                    title={
                                      visibility.note ??
                                      `${team.teamLabel} 달력 반영`
                                    }
                                  >
                                    {getEmployeeDisplayName(employee)}
                                    {visibility.note ? (
                                      <small>{visibility.note}</small>
                                    ) : null}
                                  </span>
                                ),
                              )
                            ) : (
                              <span className="schedule-empty-note">
                                반영 인원 없음
                              </span>
                            )}
                          </div>
                        </div>
                        {team.excludedMembers.length > 0 ? (
                          <div className="schedule-team-roster-section">
                            <span className="schedule-team-roster-label">
                              달력 제외
                            </span>
                            <div className="schedule-person-chip-list">
                              {team.excludedMembers.map(
                                ({ employee, visibility }) => (
                                  <span
                                    className={`schedule-person-chip ${visibility.chipTone}`}
                                    key={`${team.teamLabel}-${employee.employeeCode}-excluded`}
                                    title={
                                      visibility.note ??
                                      `${team.teamLabel} 달력 제외`
                                    }
                                  >
                                    {getEmployeeDisplayName(employee)}
                                    {visibility.note ? (
                                      <small>{visibility.note}</small>
                                    ) : null}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
              {showPoolRosterCard ? (
                <section
                  className={`schedule-team-roster-card pool-card ${
                    expandedRosterKeys.includes(POOL_ROSTER_CARD_KEY)
                      ? "is-expanded"
                      : "is-collapsed"
                  }`}
                >
                  <div className="schedule-team-roster-head">
                    <div className="schedule-team-roster-copy">
                      <div className="schedule-team-roster-title-row">
                        <strong>Pool</strong>
                        <span>별도 운영 · 달력 제외</span>
                      </div>
                      <div className="schedule-team-roster-summary-row">
                        <span className="schedule-team-roster-pill neutral">
                          배정 {poolMembers.length}명
                        </span>
                        <span className="schedule-team-roster-pill warn">
                          달력 제외
                        </span>
                      </div>
                    </div>
                    <button
                      className="ghost-button compact-button schedule-team-roster-toggle"
                      onClick={() => {
                        setExpandedRosterKeys((currentKeys) =>
                          currentKeys.includes(POOL_ROSTER_CARD_KEY)
                            ? currentKeys.filter(
                                (key) => key !== POOL_ROSTER_CARD_KEY,
                              )
                            : [...currentKeys, POOL_ROSTER_CARD_KEY],
                        );
                      }}
                      type="button"
                    >
                      {expandedRosterKeys.includes(POOL_ROSTER_CARD_KEY)
                        ? "접기"
                        : "상세"}
                    </button>
                  </div>
                  {expandedRosterKeys.includes(POOL_ROSTER_CARD_KEY) ? (
                    <div className="schedule-team-roster-detail">
                      <div className="schedule-team-roster-section">
                        <span className="schedule-team-roster-label">
                          현재 인원
                        </span>
                        <div className="schedule-person-chip-list">
                          {poolMembers.length > 0 ? (
                            poolMembers.map(({ employee, visibility }) => (
                              <span
                                className={`schedule-person-chip ${visibility.chipTone}`}
                                key={`pool-${employee.employeeCode}`}
                                title={visibility.note ?? "Pool 운영"}
                              >
                                {getEmployeeDisplayName(employee)}
                                {visibility.note ? (
                                  <small>{visibility.note}</small>
                                ) : null}
                              </span>
                            ))
                          ) : (
                            <span className="schedule-empty-note">
                              배정 인원 없음
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </article>

          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading schedule-summary-card-head">
              <div>
                <h3>{summaryTitle.weekly}</h3>
                <p className="schedule-summary-card-copy">
                  {selectedWeeklySummary
                    ? `${selectedWeeklySummary.dates[0]} ~ ${selectedWeeklySummary.dates[selectedWeeklySummary.dates.length - 1]}`
                    : "현재 선택한 월에 표시할 주차가 없습니다. 다른 월을 선택해 보세요."}
                </p>
              </div>
              <div className="schedule-summary-card-tools">
                <div
                  className="schedule-week-filter"
                  role="tablist"
                  aria-label="주차별 요약 선택"
                >
                  {currentMonthWeeks.map((week) => (
                    <button
                      aria-pressed={
                        selectedWeeklySummary?.weekNumber === week.weekNumber
                      }
                      className={`schedule-week-filter-chip ${
                        selectedWeeklySummary?.weekNumber === week.weekNumber
                          ? "is-active"
                          : ""
                      }`}
                      key={`${selectedMonth}-week-${week.weekNumber}`}
                      onClick={() => {
                        setSelectedWeeklySummaryIndex(week.weekNumber - 1);
                      }}
                      type="button"
                    >
                      {week.weekNumber}주
                    </button>
                  ))}
                </div>
                <button
                  className="ghost-button compact-button schedule-summary-card-toggle"
                  onClick={() => {
                    setExpandedSummaryCards((current) => ({
                      ...current,
                      weekly: !current.weekly,
                    }));
                  }}
                  type="button"
                >
                  {expandedSummaryCards.weekly ? "접기" : "펼치기"}
                </button>
              </div>
            </div>
            {expandedSummaryCards.weekly ? (
              <div className="data-scroll">
                <table className="info-table compact-table">
                  <thead>
                    <tr>
                      <th>사원명</th>
                      <th>총근로시간</th>
                      <th>기본근로시간</th>
                      <th>연장근로시간</th>
                      <th>야간근로시간</th>
                      <th>법정휴일근로시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={6}>근무표 정보를 불러오는 중입니다.</td>
                      </tr>
                    ) : weeklyRows.length > 0 ? (
                      weeklyRows.map((row, index) => (
                        <tr key={`${row.employeeName}-${index}`}>
                          <td>{row.employeeName}</td>
                          <td>{row.totalHours}</td>
                          <td>{row.baseHours}</td>
                          <td>{row.overtimeHours}</td>
                          <td>{row.nightHours}</td>
                          <td>{row.legalHolidayHours}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>집계할 주간 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="schedule-summary-card-collapsed">
                <span>
                  {selectedWeeklySummary?.weekNumber ?? "-"}주차 선택됨
                </span>
                <strong>
                  {isLoading
                    ? "집계 중..."
                    : weeklySummaryEmployeeCount > 0
                      ? `${weeklySummaryEmployeeCount}명 집계`
                      : "집계 데이터 없음"}
                </strong>
              </div>
            )}
          </article>

          <article className="surface-card schedule-table-card">
            <div className="section-heading compact-heading schedule-summary-card-head">
              <div>
                <h3>{summaryTitle.monthly}</h3>
                <p className="schedule-summary-card-copy">
                  월 전체 기준 근로시간 합계입니다.
                </p>
              </div>
              <button
                className="ghost-button compact-button schedule-summary-card-toggle"
                onClick={() => {
                  setExpandedSummaryCards((current) => ({
                    ...current,
                    monthly: !current.monthly,
                  }));
                }}
                type="button"
              >
                {expandedSummaryCards.monthly ? "접기" : "펼치기"}
              </button>
            </div>
            {expandedSummaryCards.monthly ? (
              <div className="data-scroll">
                <table className="info-table compact-table">
                  <thead>
                    <tr>
                      <th>사원명</th>
                      <th>총근로시간</th>
                      <th>기본근로시간</th>
                      <th>연장근로시간</th>
                      <th>야간근로시간</th>
                      <th>법정휴일근로시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={6}>근무표 정보를 불러오는 중입니다.</td>
                      </tr>
                    ) : monthlyRows.length > 0 ? (
                      monthlyRows.map((row, index) => (
                        <tr key={`${row.employeeName}-${index}`}>
                          <td>{row.employeeName}</td>
                          <td>{row.totalHours}</td>
                          <td>{row.baseHours}</td>
                          <td>{row.overtimeHours}</td>
                          <td>{row.nightHours}</td>
                          <td>{row.legalHolidayHours}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>집계할 월간 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="schedule-summary-card-collapsed">
                <span>{formatMonthLabel(selectedMonth)} 기준</span>
                <strong>
                  {isLoading
                    ? "집계 중..."
                    : monthlySummaryEmployeeCount > 0
                      ? `${monthlySummaryEmployeeCount}명 집계`
                      : "집계 데이터 없음"}
                </strong>
              </div>
            )}
          </article>
        </aside>
      </section>

      <section className="schedule-bottom-grid">
        <article className="surface-card schedule-status-card">
          <div className="section-heading compact-heading schedule-history-card-head">
            <div>
              <h3>배포 이력</h3>
              <p className="schedule-history-card-copy">
                최근 배포 결과와 저장 위치를 확인합니다.
              </p>
            </div>
            <button
              className="ghost-button compact-button schedule-history-card-toggle"
              onClick={() => {
                setIsExportHistoryExpanded((current) => !current);
              }}
              type="button"
            >
              {isExportHistoryExpanded ? "접기" : "펼치기"}
            </button>
          </div>
          {isExportHistoryExpanded ? (
            <>
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
                  <span>배포 양식</span>
                  <strong>
                    {selectedScheduleTemplate
                      ? formatTemplateLabel(selectedScheduleTemplate)
                      : "-"}
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
                <div className="schedule-status-item">
                  <span>최근 배포 양식</span>
                  <strong>{latestExport?.templateVersionLabel ?? "-"}</strong>
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
              <div className="data-scroll">
                <table className="info-table compact-table">
                  <thead>
                    <tr>
                      <th>배포 시각</th>
                      <th>양식</th>
                      <th>상태</th>
                      <th>파일명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentExports.length > 0 ? (
                      recentExports.map((item) => (
                        <tr key={item.id}>
                          <td>{formatDateTime(item.exportedAt)}</td>
                          <td>{item.templateVersionLabel ?? "-"}</td>
                          <td>
                            <span
                              className={`pill ${item.publishStatus === "published" ? "success" : "neutral"}`}
                            >
                              {item.publishStatus === "published" ? "배포완료" : "초안"}
                            </span>
                          </td>
                          <td className="schedule-file-cell">{item.outputFileName}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4}>아직 배포 이력이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="schedule-history-card-collapsed">
              <span>
                {latestExport ? deploymentStatusLabel : "배포 이력 없음"}
              </span>
              <strong>
                {latestExport?.outputFileName ?? "최근 배포 파일 없음"}
              </strong>
              <em>
                {latestExport
                  ? formatDateTime(latestExport.exportedAt)
                  : "배포 후 이력이 표시됩니다."}
              </em>
            </div>
          )}
        </article>
      </section>
    </div>
  );
};
