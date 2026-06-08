import { calculateDurationMinutes, parseTimeToMinutes } from "./calculation";
import type { MonthlyScheduleItem } from "./model";

export type ScheduleRuleWarningRule =
  | "weekly-max-minutes"
  | "consecutive-night"
  | "minimum-rest"
  | "weekly-holiday";

export interface ScheduleRuleWarningSettings {
  consecutiveNightLimit: number;
  minimumRestMinutes: number;
  requireWeeklyHoliday: boolean;
  weeklyMaxMinutes: number;
}

export interface ScheduleRuleWarningItem {
  dates: string[];
  employeeCode: string;
  employeeName: string;
  id: string;
  message: string;
  rule: ScheduleRuleWarningRule;
  severity: "warning" | "danger";
}

export interface ScheduleRuleWarningSummary {
  byRule: Record<ScheduleRuleWarningRule, number>;
  warningCount: number;
  warnings: ScheduleRuleWarningItem[];
}

export type ScheduleRuleWarningSourceItem = Pick<
  MonthlyScheduleItem,
  | "breakMinutes"
  | "dutyCode"
  | "employeeCode"
  | "employeeName"
  | "endTime"
  | "startTime"
  | "workDate"
>;

const MINUTES_PER_DAY = 24 * 60;

export const defaultScheduleRuleWarningSettings: ScheduleRuleWarningSettings = {
  consecutiveNightLimit: 3,
  minimumRestMinutes: 11 * 60,
  requireWeeklyHoliday: true,
  weeklyMaxMinutes: 52 * 60
};

const nonWorkingDutyCodes = new Set(["", "X", "O", "OFF", "휴", "휴무"]);

const normalizeDutyCode = (value: string) => value.trim().toUpperCase();

const isWorkingItem = (item: Pick<ScheduleRuleWarningSourceItem, "dutyCode" | "startTime" | "endTime">) =>
  !nonWorkingDutyCodes.has(normalizeDutyCode(item.dutyCode)) && Boolean(item.startTime && item.endTime);

const isNightItem = (item: Pick<ScheduleRuleWarningSourceItem, "dutyCode" | "startTime" | "endTime">) => {
  const dutyCode = normalizeDutyCode(item.dutyCode);

  if (dutyCode === "N" || dutyCode === "C" || dutyCode === "3" || dutyCode === "S3") {
    return true;
  }

  if (!item.startTime || !item.endTime) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(item.startTime);
  const endMinutes = parseTimeToMinutes(item.endTime);

  return startMinutes >= 18 * 60 || endMinutes <= 8 * 60;
};

const parseDateMs = (dateValue: string) => {
  const [yearText, monthText, dayText] = dateValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return new Date(year, month - 1, day).getTime();
};

const getShiftRangeMs = (item: ScheduleRuleWarningSourceItem) => {
  if (!item.startTime || !item.endTime) {
    return null;
  }

  const startMinutes = parseTimeToMinutes(item.startTime);
  const endMinutes = parseTimeToMinutes(item.endTime);
  const startMs = parseDateMs(item.workDate) + startMinutes * 60 * 1000;
  const normalizedEndMinutes = endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
  const endMs = parseDateMs(item.workDate) + normalizedEndMinutes * 60 * 1000;

  return {
    endMs,
    startMs
  };
};

const getMondayWeekKey = (dateValue: string) => {
  const date = new Date(parseDateMs(dateValue));
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const formatHours = (minutes: number) =>
  (minutes / 60).toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: minutes % 60 === 0 ? 0 : 1
  });

const createEmptyRuleCount = (): Record<ScheduleRuleWarningRule, number> => ({
  "consecutive-night": 0,
  "minimum-rest": 0,
  "weekly-holiday": 0,
  "weekly-max-minutes": 0
});

const createWarning = (
  input: Omit<ScheduleRuleWarningItem, "id">
): ScheduleRuleWarningItem => ({
  ...input,
  id: `${input.rule}:${input.employeeCode}:${input.dates.join(",")}`
});

export const buildScheduleRuleWarnings = (
  items: ScheduleRuleWarningSourceItem[],
  partialSettings?: Partial<ScheduleRuleWarningSettings>
): ScheduleRuleWarningSummary => {
  const settings = {
    ...defaultScheduleRuleWarningSettings,
    ...partialSettings
  };
  const warnings: ScheduleRuleWarningItem[] = [];
  const workingItems = items.filter(isWorkingItem);
  const employeeItems = new Map<string, ScheduleRuleWarningSourceItem[]>();

  workingItems.forEach((item) => {
    const employeeCode = item.employeeCode ?? item.employeeName ?? "unknown";
    const current = employeeItems.get(employeeCode) ?? [];
    current.push(item);
    employeeItems.set(employeeCode, current);
  });

  employeeItems.forEach((employeeScheduleItems, employeeCode) => {
    const sortedItems = employeeScheduleItems
      .slice()
      .sort((left, right) => {
        const leftRange = getShiftRangeMs(left);
        const rightRange = getShiftRangeMs(right);

        return (leftRange?.startMs ?? 0) - (rightRange?.startMs ?? 0);
      });
    const employeeName = sortedItems[0]?.employeeName ?? employeeCode;
    const weeklyMinutes = new Map<string, number>();
    const weeklyDates = new Map<string, Set<string>>();
    const weeklyWorkDates = new Map<string, Set<string>>();

    sortedItems.forEach((item) => {
      const weekKey = getMondayWeekKey(item.workDate);
      weeklyMinutes.set(
        weekKey,
        (weeklyMinutes.get(weekKey) ?? 0) +
          calculateDurationMinutes({
            startTime: item.startTime!,
            endTime: item.endTime!,
            breakMinutes: item.breakMinutes
          })
      );

      const dates = weeklyDates.get(weekKey) ?? new Set<string>();
      dates.add(item.workDate);
      weeklyDates.set(weekKey, dates);

      const workDates = weeklyWorkDates.get(weekKey) ?? new Set<string>();
      workDates.add(item.workDate);
      weeklyWorkDates.set(weekKey, workDates);
    });

    weeklyMinutes.forEach((totalMinutes, weekKey) => {
      if (totalMinutes <= settings.weeklyMaxMinutes) {
        return;
      }

      warnings.push(
        createWarning({
          dates: [weekKey],
          employeeCode,
          employeeName,
          message: `${employeeName} 주간 총 근무시간이 ${formatHours(totalMinutes)}시간으로 기준 ${formatHours(
            settings.weeklyMaxMinutes
          )}시간을 초과했습니다.`,
          rule: "weekly-max-minutes",
          severity: "danger"
        })
      );
    });

    if (settings.requireWeeklyHoliday) {
      weeklyDates.forEach((dates, weekKey) => {
        const workDates = weeklyWorkDates.get(weekKey) ?? new Set<string>();

        if (dates.size < 7 || workDates.size < 7) {
          return;
        }

        warnings.push(
          createWarning({
            dates: Array.from(workDates).sort(),
            employeeCode,
            employeeName,
            message: `${employeeName} ${weekKey} 주차에 휴무일이 없습니다.`,
            rule: "weekly-holiday",
            severity: "warning"
          })
        );
      });
    }

    let consecutiveNightDates: string[] = [];

    sortedItems.forEach((item) => {
      if (isNightItem(item)) {
        consecutiveNightDates.push(item.workDate);
        return;
      }

      if (consecutiveNightDates.length > settings.consecutiveNightLimit) {
        warnings.push(
          createWarning({
            dates: consecutiveNightDates,
            employeeCode,
            employeeName,
            message: `${employeeName} 연속 야간 근무가 ${consecutiveNightDates.length}일입니다.`,
            rule: "consecutive-night",
            severity: "warning"
          })
        );
      }

      consecutiveNightDates = [];
    });

    if (consecutiveNightDates.length > settings.consecutiveNightLimit) {
      warnings.push(
        createWarning({
          dates: consecutiveNightDates,
          employeeCode,
          employeeName,
          message: `${employeeName} 연속 야간 근무가 ${consecutiveNightDates.length}일입니다.`,
          rule: "consecutive-night",
          severity: "warning"
        })
      );
    }

    sortedItems.forEach((item, index) => {
      const previousItem = sortedItems[index - 1];

      if (!previousItem) {
        return;
      }

      const previousRange = getShiftRangeMs(previousItem);
      const currentRange = getShiftRangeMs(item);

      if (!previousRange || !currentRange) {
        return;
      }

      const restMinutes = Math.round((currentRange.startMs - previousRange.endMs) / 60000);

      if (restMinutes < 0 || restMinutes >= settings.minimumRestMinutes) {
        return;
      }

      warnings.push(
        createWarning({
          dates: [previousItem.workDate, item.workDate],
          employeeCode,
          employeeName,
          message: `${employeeName} ${previousItem.workDate} 근무 후 ${item.workDate} 근무까지 휴식이 ${formatHours(
            restMinutes
          )}시간입니다.`,
          rule: "minimum-rest",
          severity: "danger"
        })
      );
    });
  });

  const byRule = warnings.reduce((counts, warning) => {
    counts[warning.rule] += 1;
    return counts;
  }, createEmptyRuleCount());

  return {
    byRule,
    warningCount: warnings.length,
    warnings
  };
};
