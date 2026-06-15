import type { ApprovalStatus, WorkType } from "./model";
import type {
  AllowanceRateAxis,
  AllowanceRateCategoryCode
} from "./allowance-rate-matrix";

export interface TimeRange {
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface ApprovedPerformanceSnapshot {
  performanceFileId: string;
  performanceEntryId?: string;
  approvalStatus: ApprovalStatus;
  approvedAt: string;
  approvedBy: string;
  holidayCalendarId: string;
  allowanceRateVersionId: string;
  sourceFileChecksum: string;
}

export interface WorkCalculationBreakdown {
  totalWorkMinutes: number;
  baseWorkMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  substituteMinutes: number;
}

export interface AllowanceCalculationLine {
  allowanceCode: AllowanceRateAxis;
  workMinutes: number;
  multiplier: number;
  amount: number;
}

export interface AllowanceCalculationSnapshot {
  id: string;
  performanceApprovalId: string;
  calculationVersion: number;
  businessCategoryCode: AllowanceRateCategoryCode;
  businessCategoryLabel: string;
  breakdown: WorkCalculationBreakdown;
  lines: AllowanceCalculationLine[];
  totalAllowanceAmount: number;
  createdAt: string;
}

export interface CalculationCase {
  id: string;
  description: string;
  workDate: string;
  isHoliday?: boolean;
  workType?: WorkType;
  timeRange: TimeRange;
  expected: Partial<WorkCalculationBreakdown>;
}

export const DEFAULT_WORK_BREAKDOWN: WorkCalculationBreakdown = {
  totalWorkMinutes: 0,
  baseWorkMinutes: 0,
  overtimeMinutes: 0,
  nightMinutes: 0,
  holidayMinutes: 0,
  substituteMinutes: 0
};

const MINUTES_PER_DAY = 24 * 60;
const BASE_WORK_LIMIT_MINUTES = 8 * 60;
const NIGHT_WINDOW_START = 22 * 60;
const NIGHT_WINDOW_END = 6 * 60;
const BREAK_UNIT_MINUTES = 30;
const BREAK_INTERVAL_MINUTES = 4 * 60;

export const parseTimeToMinutes = (time: string) => {
  const [hoursText, minutesText] = time.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid time format: ${time}`);
  }

  return (hours * 60) + minutes;
};

const calculateRawDurationMinutes = ({
  startTime,
  endTime
}: Omit<TimeRange, "breakMinutes">) => {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const normalizedEndMinutes =
    endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;

  return Math.max(normalizedEndMinutes - startMinutes, 0);
};

export const calculateAutomaticBreakMinutes = ({
  startTime,
  endTime
}: Omit<TimeRange, "breakMinutes">) => {
  const rawDurationMinutes = calculateRawDurationMinutes({ startTime, endTime });

  if (rawDurationMinutes <= 0) {
    return 0;
  }

  return Math.floor(rawDurationMinutes / BREAK_INTERVAL_MINUTES) * BREAK_UNIT_MINUTES;
};

export const calculateDurationMinutes = ({
  startTime,
  endTime,
  breakMinutes
}: TimeRange) => {
  const rawMinutes = calculateRawDurationMinutes({ startTime, endTime });

  return Math.max(rawMinutes - breakMinutes, 0);
};

const calculateNightOverlapMinutes = ({ startTime, endTime }: Omit<TimeRange, "breakMinutes">) => {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const normalizedEndMinutes =
    endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
  const windows = [
    [0, NIGHT_WINDOW_END],
    [NIGHT_WINDOW_START, MINUTES_PER_DAY],
    [MINUTES_PER_DAY, MINUTES_PER_DAY + NIGHT_WINDOW_END]
  ] as const;

  return windows.reduce((total, [windowStart, windowEnd]) => {
    const overlapStart = Math.max(startMinutes, windowStart);
    const overlapEnd = Math.min(normalizedEndMinutes, windowEnd);

    if (overlapEnd <= overlapStart) {
      return total;
    }

    return total + (overlapEnd - overlapStart);
  }, 0);
};

export const calculateWorkBreakdown = (input: {
  isHoliday?: boolean;
  workType?: WorkType;
  timeRange: TimeRange;
}): WorkCalculationBreakdown => {
  const totalWorkMinutes = calculateDurationMinutes(input.timeRange);
  const rawNightMinutes = calculateNightOverlapMinutes(input.timeRange);
  const adjustedNightMinutes = Math.max(
    rawNightMinutes - Math.min(rawNightMinutes, input.timeRange.breakMinutes),
    0
  );
  const isHoliday = input.isHoliday === true;
  const isSubstitute = input.workType === "substitute";
  const isOvertime = input.workType === "overtime";
  // 법정휴일 직접근무(workType === "holiday")는 주간/야간/연장으로 쪼개지 않고 전체 근로시간을
  // 모두 기본근로시간으로 처리한다. 대체근무는 workType이 "substitute"라 해당하지 않으므로
  // 연장·야간 가산이 그대로 유지된다.
  const isLegalHolidayWork = input.workType === "holiday";
  const nightMinutes = isLegalHolidayWork
    ? 0
    : Math.min(totalWorkMinutes, adjustedNightMinutes);
  const nonNightWorkMinutes = Math.max(totalWorkMinutes - nightMinutes, 0);
  const baseCapacityMinutes = isOvertime
    ? 0
    : Math.max(BASE_WORK_LIMIT_MINUTES - nightMinutes, 0);
  const baseWorkMinutes = isLegalHolidayWork
    ? totalWorkMinutes
    : isOvertime
      ? 0
      : Math.min(nonNightWorkMinutes, baseCapacityMinutes);
  const overtimeMinutes = isLegalHolidayWork
    ? 0
    : isOvertime
      ? nonNightWorkMinutes
      : Math.max(nonNightWorkMinutes - baseWorkMinutes, 0);

  return {
    totalWorkMinutes,
    baseWorkMinutes,
    overtimeMinutes,
    nightMinutes,
    holidayMinutes: isHoliday ? totalWorkMinutes : 0,
    substituteMinutes: isSubstitute ? totalWorkMinutes : 0
  };
};
