import type { AllowanceRateItemSaveInput } from "../bridge/contracts";
import {
  calculateRoundedAllowanceLineAmounts,
  type AllowanceCalculationResultRecord
} from "./allowance-service";
import {
  allowanceRateAxisLabels,
  allowanceRateAxisOrder,
  allowanceRateCategoryLabels,
  getAllowanceRateEntryCode
} from "./allowance-rate-matrix";

export interface AllowanceRateImpactPreviewRow {
  afterAmount: number;
  beforeAmount: number;
  calculationId: string;
  deltaAmount: number;
  employeeName: string;
  siteName: string;
  workDate: string;
}

export interface AllowanceRateImpactZeroedPayWarning {
  allowanceLabel: string;
  beforeAmount: number;
  calculationId: string;
  employeeName: string;
  siteName: string;
  workDate: string;
  workMinutes: number;
}

export interface AllowanceRateImpactPreview {
  affectedCalculationCount: number;
  afterAmount: number;
  beforeAmount: number;
  calculationCount: number;
  deltaAmount: number;
  rows: AllowanceRateImpactPreviewRow[];
  zeroedPayWarningCount: number;
  zeroedPayWarnings: AllowanceRateImpactZeroedPayWarning[];
}

export const buildAllowanceRateImpactPreview = (
  calculations: AllowanceCalculationResultRecord[],
  candidateItems: AllowanceRateItemSaveInput[]
): AllowanceRateImpactPreview => {
  const multiplierByCode = new Map(
    candidateItems.map((item) => [item.allowanceCode, item.multiplier])
  );
  const zeroedPayWarnings: AllowanceRateImpactZeroedPayWarning[] = [];
  const rows = calculations.map((calculation) => {
    const categoryCode = calculation.snapshot.businessCategoryCode;
    const afterLineInputs = calculation.snapshot.lines.map((line) => {
      const allowanceCode = allowanceRateAxisOrder.includes(line.allowanceCode)
        ? getAllowanceRateEntryCode(categoryCode, line.allowanceCode)
        : "";
      const multiplier = multiplierByCode.get(allowanceCode) ?? line.multiplier;

      if (line.workMinutes > 0 && line.amount > 0 && multiplier === 0) {
        zeroedPayWarnings.push({
          allowanceLabel: allowanceRateAxisOrder.includes(line.allowanceCode)
            ? `${allowanceRateCategoryLabels[categoryCode]} ${allowanceRateAxisLabels[line.allowanceCode]}`
            : line.allowanceCode,
          beforeAmount: line.amount,
          calculationId: calculation.id,
          employeeName: calculation.employeeName,
          siteName: calculation.siteName,
          workDate: calculation.workDate,
          workMinutes: line.workMinutes
        });
      }

      return {
        workMinutes: line.workMinutes,
        multiplier
      };
    });
    const afterAmount = calculateRoundedAllowanceLineAmounts(
      calculation.hourlyRate,
      afterLineInputs
    ).totalAmount;
    const beforeAmount = calculation.snapshot.totalAllowanceAmount;

    return {
      afterAmount,
      beforeAmount,
      calculationId: calculation.id,
      deltaAmount: afterAmount - beforeAmount,
      employeeName: calculation.employeeName,
      siteName: calculation.siteName,
      workDate: calculation.workDate
    } satisfies AllowanceRateImpactPreviewRow;
  });

  const beforeAmount = rows.reduce((sum, row) => sum + row.beforeAmount, 0);
  const afterAmount = rows.reduce((sum, row) => sum + row.afterAmount, 0);

  return {
    affectedCalculationCount: rows.filter((row) => row.deltaAmount !== 0).length,
    afterAmount,
    beforeAmount,
    calculationCount: rows.length,
    deltaAmount: afterAmount - beforeAmount,
    rows: rows
      .filter((row) => row.deltaAmount !== 0)
      .sort((left, right) => Math.abs(right.deltaAmount) - Math.abs(left.deltaAmount)),
    zeroedPayWarningCount: zeroedPayWarnings.length,
    zeroedPayWarnings: zeroedPayWarnings.sort((left, right) => right.beforeAmount - left.beforeAmount)
  };
};
