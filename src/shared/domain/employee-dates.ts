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
