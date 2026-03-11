import {
  calculateWorkBreakdown,
  type AllowanceCalculationLine,
  type AllowanceCalculationSnapshot,
  type ApprovedPerformanceSnapshot,
  type TimeRange
} from "./calculation";
import type { WorkType } from "./model";
import { roundMoney } from "./rounding";

export interface AllowanceRateTable {
  base: number;
  overtime: number;
  night: number;
  holiday: number;
  substitute: number;
}

export interface ApprovedPerformanceCalculationInput {
  calculationId: string;
  performanceApprovalId: string;
  calculationVersion: number;
  createdAt: string;
  approvedSnapshot: ApprovedPerformanceSnapshot;
  workDate: string;
  timeRange: TimeRange;
  hourlyRate: number;
  isHoliday?: boolean;
  workType?: WorkType;
  rateTable: AllowanceRateTable;
}

const toAllowanceAmount = (hourlyRate: number, workMinutes: number, multiplier: number) =>
  roundMoney((hourlyRate * workMinutes * multiplier) / 60);

const createLine = (
  allowanceCode: AllowanceCalculationLine["allowanceCode"],
  workMinutes: number,
  hourlyRate: number,
  multiplier: number
): AllowanceCalculationLine | null => {
  if (workMinutes <= 0) {
    return null;
  }

  return {
    allowanceCode,
    workMinutes,
    multiplier,
    amount: toAllowanceAmount(hourlyRate, workMinutes, multiplier)
  };
};

export const createAllowanceCalculationSnapshot = (
  input: ApprovedPerformanceCalculationInput
): AllowanceCalculationSnapshot => {
  const breakdown = calculateWorkBreakdown({
    isHoliday: input.isHoliday,
    workType: input.workType,
    timeRange: input.timeRange
  });

  const lines = [
    createLine("base", breakdown.baseWorkMinutes, input.hourlyRate, input.rateTable.base),
    createLine(
      "overtime",
      breakdown.overtimeMinutes,
      input.hourlyRate,
      input.rateTable.overtime
    ),
    createLine("night", breakdown.nightMinutes, input.hourlyRate, input.rateTable.night),
    createLine("holiday", breakdown.holidayMinutes, input.hourlyRate, input.rateTable.holiday),
    createLine(
      "substitute",
      breakdown.substituteMinutes,
      input.hourlyRate,
      input.rateTable.substitute
    )
  ].filter((line): line is AllowanceCalculationLine => line !== null);

  const totalAllowanceAmount = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    id: input.calculationId,
    performanceApprovalId: input.performanceApprovalId,
    calculationVersion: input.calculationVersion,
    breakdown,
    lines,
    totalAllowanceAmount,
    createdAt: input.createdAt
  };
};

export const createAllowanceCalculationSignature = (
  snapshot: AllowanceCalculationSnapshot
) => JSON.stringify({
  performanceApprovalId: snapshot.performanceApprovalId,
  calculationVersion: snapshot.calculationVersion,
  breakdown: snapshot.breakdown,
  lines: snapshot.lines.map((line) => ({
    allowanceCode: line.allowanceCode,
    workMinutes: line.workMinutes,
    multiplier: line.multiplier,
    amount: line.amount
  })),
  totalAllowanceAmount: snapshot.totalAllowanceAmount
});
