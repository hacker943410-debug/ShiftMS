import {
  calculateWorkBreakdown,
  type AllowanceCalculationLine,
  type AllowanceCalculationSnapshot,
  type ApprovedPerformanceSnapshot,
  type TimeRange
} from "./calculation";
import {
  resolveAllowanceRateCategoryCode,
  resolveAllowanceRateCategoryLabel,
  type AllowanceRateCategoryCode,
  type AllowanceRateMatrix
} from "./allowance-rate-matrix";
import type { AllowanceCalculationStatus } from "./allowance-workflow";
import type { WorkType } from "./model";
import { roundMoney } from "./rounding";

export type AllowanceRateTable = AllowanceRateMatrix;

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
  allowanceCategoryCode?: AllowanceRateCategoryCode;
  rateTable: AllowanceRateTable;
}

export interface AllowanceCalculationResultRecord {
  id: string;
  fileId: string;
  fileName: string;
  entryId: string;
  employeeCode: string;
  employeeName: string;
  siteName: string;
  workDate: string;
  workType: WorkType;
  hourlyRate: number;
  rateVersionId: string;
  rateVersionLabel: string;
  status: AllowanceCalculationStatus;
  earlyPayoutDate?: string;
  signature: string;
  snapshot: AllowanceCalculationSnapshot;
}

const toAllowanceAmount = (hourlyRate: number, workMinutes: number, multiplier: number) =>
  roundMoney((hourlyRate * workMinutes * multiplier) / 60);

const createLine = (
  allowanceCode: AllowanceCalculationLine["allowanceCode"],
  workMinutes: number,
  hourlyRate: number,
  multiplier: number
): AllowanceCalculationLine | null => {
  if (workMinutes <= 0 || multiplier <= 0) {
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
  const businessCategoryCode =
    input.allowanceCategoryCode ??
    resolveAllowanceRateCategoryCode({
      rawCategory: undefined,
      isHoliday: input.isHoliday,
      workType: input.workType
    });
  const isHolidayCategory =
    businessCategoryCode === "legal-holiday" ||
    businessCategoryCode === "holiday-substitute" ||
    businessCategoryCode === "holiday-overtime";
  const isSubstituteCategory =
    businessCategoryCode === "weekday-substitute" || businessCategoryCode === "holiday-substitute";
  const breakdown = calculateWorkBreakdown({
    isHoliday: isHolidayCategory,
    workType: isSubstituteCategory ? "substitute" : input.workType,
    timeRange: input.timeRange
  });
  const activeRate = input.rateTable[businessCategoryCode] ?? input.rateTable["weekday-overtime"];

  const lines = [
    createLine("base", breakdown.baseWorkMinutes, input.hourlyRate, activeRate.base),
    createLine("overtime", breakdown.overtimeMinutes, input.hourlyRate, activeRate.overtime),
    createLine("night", breakdown.nightMinutes, input.hourlyRate, activeRate.night)
  ].filter((line): line is AllowanceCalculationLine => line !== null);

  const totalAllowanceAmount = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    id: input.calculationId,
    performanceApprovalId: input.performanceApprovalId,
    calculationVersion: input.calculationVersion,
    businessCategoryCode,
    businessCategoryLabel: resolveAllowanceRateCategoryLabel(businessCategoryCode),
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
  businessCategoryCode: snapshot.businessCategoryCode,
  breakdown: snapshot.breakdown,
  lines: snapshot.lines.map((line) => ({
    allowanceCode: line.allowanceCode,
    workMinutes: line.workMinutes,
    multiplier: line.multiplier,
    amount: line.amount
  })),
  totalAllowanceAmount: snapshot.totalAllowanceAmount
});
