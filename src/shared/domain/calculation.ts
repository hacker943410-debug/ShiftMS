import type { ApprovalStatus, WorkType } from "./model";

export interface TimeRange {
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface ApprovedPerformanceSnapshot {
  performanceFileId: string;
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
  allowanceCode: WorkType | "base";
  workMinutes: number;
  multiplier: number;
  amount: number;
}

export interface AllowanceCalculationSnapshot {
  id: string;
  performanceApprovalId: string;
  calculationVersion: number;
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

export const calculateDurationMinutes = ({
  startTime,
  endTime,
  breakMinutes
}: TimeRange) => {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const normalizedEndMinutes =
    endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
  const rawMinutes = normalizedEndMinutes - startMinutes;

  return Math.max(rawMinutes - breakMinutes, 0);
};

const calculateNightOverlapMinutes = ({ startTime, endTime }: Omit<TimeRange, "breakMinutes">) => {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const normalizedEndMinutes =
    endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
  const windows = [
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
  // Temporary rule: night work cannot exceed net worked minutes after breaks.
  const nightMinutes = Math.min(totalWorkMinutes, rawNightMinutes);
  const isHoliday = input.isHoliday === true;
  const isSubstitute = input.workType === "substitute";

  if (isHoliday) {
    return {
      totalWorkMinutes,
      baseWorkMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes,
      holidayMinutes: totalWorkMinutes,
      substituteMinutes: isSubstitute ? totalWorkMinutes : 0
    };
  }

  const baseWorkMinutes = Math.min(totalWorkMinutes, BASE_WORK_LIMIT_MINUTES);
  const overtimeMinutes = Math.max(totalWorkMinutes - BASE_WORK_LIMIT_MINUTES, 0);

  return {
    totalWorkMinutes,
    baseWorkMinutes,
    overtimeMinutes,
    nightMinutes,
    holidayMinutes: 0,
    substituteMinutes: isSubstitute ? totalWorkMinutes : 0
  };
};
