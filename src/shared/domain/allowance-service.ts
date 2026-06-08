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
import type { EmployeeRank } from "./employee-rank";
import type { WorkType } from "./model";
import { roundUpWon } from "./rounding";

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
  employeeRank?: EmployeeRank;
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

export interface AllowanceLineAmountInput {
  workMinutes: number;
  multiplier: number;
}

export interface RoundedAllowanceLineAmounts {
  lineAmounts: number[];
  totalAmount: number;
}

type AllowanceCalculationLineDraft = Omit<AllowanceCalculationLine, "amount">;

const toRawAllowanceAmount = (hourlyRate: number, workMinutes: number, multiplier: number) => {
  const amount = (hourlyRate * workMinutes * multiplier) / 60;
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export const calculateRoundedAllowanceLineAmounts = (
  hourlyRate: number,
  lines: AllowanceLineAmountInput[]
): RoundedAllowanceLineAmounts => {
  const rawAmounts = lines.map((line) =>
    toRawAllowanceAmount(hourlyRate, line.workMinutes, line.multiplier)
  );
  const totalAmount = roundUpWon(rawAmounts.reduce((sum, amount) => sum + amount, 0));
  const lineAmounts = rawAmounts.map((amount) => Math.floor(amount));
  let remainingAmount = totalAmount - lineAmounts.reduce((sum, amount) => sum + amount, 0);

  const allocationOrder = rawAmounts
    .map((amount, index) => ({
      index,
      fractionalAmount: amount - Math.floor(amount)
    }))
    .sort(
      (left, right) =>
        right.fractionalAmount - left.fractionalAmount ||
        left.index - right.index
    );

  for (const allocation of allocationOrder) {
    if (remainingAmount <= 0) {
      break;
    }

    lineAmounts[allocation.index] += 1;
    remainingAmount -= 1;
  }

  return {
    lineAmounts,
    totalAmount
  };
};

const createLine = (
  allowanceCode: AllowanceCalculationLine["allowanceCode"],
  workMinutes: number,
  multiplier: number
): AllowanceCalculationLineDraft | null => {
  if (workMinutes <= 0 || multiplier <= 0) {
    return null;
  }

  return {
    allowanceCode,
    workMinutes,
    multiplier
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

  const lineDrafts = [
    createLine("base", breakdown.baseWorkMinutes, activeRate.base),
    createLine("overtime", breakdown.overtimeMinutes, activeRate.overtime),
    createLine("night", breakdown.nightMinutes, activeRate.night)
  ].filter((line): line is AllowanceCalculationLineDraft => line !== null);
  const roundedAmounts = calculateRoundedAllowanceLineAmounts(input.hourlyRate, lineDrafts);
  const lines = lineDrafts.map((line, index) => ({
    ...line,
    amount: roundedAmounts.lineAmounts[index] ?? 0
  }));

  const totalAllowanceAmount = roundedAmounts.totalAmount;

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
