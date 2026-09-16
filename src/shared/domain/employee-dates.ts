// The two dates that decide whether a person counts in a schedule or a performance file. They
// are typed by hand, and a typo used to go in as typed - a four-digit year, a 30th of February -
// and silently drop the person from everything (T-12). The calendar on screen is bounded, but the
// bridge can be called without the calendar, so the same rule is enforced where the row is saved.

export const EARLIEST_HIRE_DATE = "1990-01-01";

// A real calendar date in YYYY-MM-DD form. The shape alone let 2026-02-30 and 2026-99-99 through.
export const isCalendarDateValue = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export interface EmployeeDatesInput {
  hireDate?: string;
  retireDate?: string;
  // The local calendar date, so a hire date entered before 09:00 KST is not "in the future".
  today: string;
}

export interface EmploymentPeriodDateRange {
  startDate: string;
  endDate?: string;
}

export type EmploymentPeriodDateMismatch =
  | { kind: "before-first"; boundaryDate: string }
  | { kind: "gap"; previousEndDate: string; nextStartDate: string }
  | { kind: "after-last"; boundaryDate: string };

// The first problem found, as the sentence the operator sees, or null when the dates are fine.
export const validateEmployeeDates = (input: EmployeeDatesInput): string | null => {
  if (input.hireDate !== undefined) {
    if (!isCalendarDateValue(input.hireDate)) {
      return "입사일 형식이 올바르지 않습니다.";
    }

    if (input.hireDate < EARLIEST_HIRE_DATE) {
      return `입사일은 ${EARLIEST_HIRE_DATE} 이후여야 합니다.`;
    }

    if (input.hireDate > input.today) {
      return "입사일은 오늘 이후 날짜로 넣을 수 없습니다.";
    }
  }

  if (input.retireDate !== undefined) {
    if (!isCalendarDateValue(input.retireDate)) {
      return "퇴사 처리일 형식이 올바르지 않습니다.";
    }

    if (input.hireDate && input.retireDate < input.hireDate) {
      return "퇴사 처리일은 입사일보다 빠를 수 없습니다.";
    }
  }

  return null;
};

// The hire date is the floor under everything dated for a person (T-23). An assignment cannot start
// before it, and a wage line cannot apply before it - both are refused where the row is saved, and
// the calendars on screen grey those days out. Nothing here touches rows that already exist.
export const describeAssignmentStartAgainstHireDate = (
  startDate: string,
  hireDate?: string
): string | null =>
  hireDate && startDate < hireDate
    ? `배정 시작일은 입사일(${hireDate})보다 빠를 수 없습니다.`
    : null;

export const describeWageEffectiveFromAgainstHireDate = (
  effectiveFrom: string,
  hireDate?: string
): string | null =>
  hireDate && effectiveFrom < hireDate
    ? `시급 적용일은 입사일(${hireDate})보다 빠를 수 없습니다.`
    : null;

const sortEmploymentPeriods = <T extends EmploymentPeriodDateRange>(periods: readonly T[]) =>
  [...periods].sort((left, right) => left.startDate.localeCompare(right.startDate));

export const findEmploymentPeriodForDate = <T extends EmploymentPeriodDateRange>(
  workDate: string,
  periods?: readonly T[]
): T | undefined =>
  periods?.find(
    (period) => period.startDate <= workDate && (!period.endDate || workDate < period.endDate)
  );

export const isDateWithinEmploymentPeriods = (
  workDate: string,
  periods?: readonly EmploymentPeriodDateRange[],
  fallbackHireDate?: string,
  fallbackRetireDate?: string
) => {
  if (periods && periods.length > 0) {
    return Boolean(findEmploymentPeriodForDate(workDate, periods));
  }

  if (fallbackHireDate && workDate < fallbackHireDate) {
    return false;
  }

  if (fallbackRetireDate && workDate >= fallbackRetireDate) {
    return false;
  }

  return true;
};

export const describeDateAgainstEmploymentPeriods = (
  workDate: string,
  periods: readonly EmploymentPeriodDateRange[]
): EmploymentPeriodDateMismatch | null => {
  const orderedPeriods = sortEmploymentPeriods(periods);

  if (orderedPeriods.length === 0 || findEmploymentPeriodForDate(workDate, orderedPeriods)) {
    return null;
  }

  const firstPeriod = orderedPeriods[0]!;

  if (workDate < firstPeriod.startDate) {
    return { kind: "before-first", boundaryDate: firstPeriod.startDate };
  }

  for (let index = 0; index < orderedPeriods.length - 1; index += 1) {
    const previousPeriod = orderedPeriods[index]!;
    const nextPeriod = orderedPeriods[index + 1]!;

    if (
      previousPeriod.endDate &&
      previousPeriod.endDate <= workDate &&
      workDate < nextPeriod.startDate
    ) {
      return {
        kind: "gap",
        previousEndDate: previousPeriod.endDate,
        nextStartDate: nextPeriod.startDate
      };
    }
  }

  const lastPeriod = orderedPeriods[orderedPeriods.length - 1]!;

  return lastPeriod.endDate && workDate >= lastPeriod.endDate
    ? { kind: "after-last", boundaryDate: lastPeriod.endDate }
    : null;
};

// The day a person's schedule at their current site begins: the LATER of the hire date and the
// current assignment's start. New assignments never start before the hire date, so for them this is
// the assignment start - someone moved to a site mid-month is drafted there from the day the move
// takes effect, not from the 1st. Rows older than that rule can still carry an assignment that
// starts before the hire date; the hire date wins there, since nobody works before being hired.
// Legacy people with no hire date keep the assignment start as their only floor (R-19).
export const getEmployeeScheduleStartDate = (employee: {
  hireDate?: string;
  currentAssignmentStartDate?: string;
}): string | undefined => {
  const { hireDate, currentAssignmentStartDate } = employee;

  if (hireDate && currentAssignmentStartDate) {
    return hireDate > currentAssignmentStartDate ? hireDate : currentAssignmentStartDate;
  }

  return hireDate ?? currentAssignmentStartDate;
};
