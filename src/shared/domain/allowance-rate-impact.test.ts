import { describe, expect, it } from "vitest";

import { getAllowanceRateEntryCode } from "./allowance-rate-matrix";
import type { AllowanceCalculationResultRecord } from "./allowance-service";
import { buildAllowanceRateImpactPreview } from "./allowance-rate-impact";

const createCalculation = (): AllowanceCalculationResultRecord => ({
  id: "calc-1",
  fileId: "file-1",
  fileName: "approved.xlsx",
  entryId: "entry-1",
  employeeCode: "EMP-001",
  employeeName: "김현우",
  siteName: "본관",
  workDate: "2026-04-01",
  workType: "overtime",
  hourlyRate: 10000,
  rateVersionId: "rate-old",
  rateVersionLabel: "기존",
  status: "pending",
  signature: "signature",
  snapshot: {
    id: "calc-1",
    performanceApprovalId: "approval-1",
    calculationVersion: 1,
    businessCategoryCode: "weekday-overtime",
    businessCategoryLabel: "평일 연장근로",
    breakdown: {
      totalWorkMinutes: 120,
      baseWorkMinutes: 0,
      overtimeMinutes: 120,
      nightMinutes: 0,
      holidayMinutes: 0,
      substituteMinutes: 0
    },
    lines: [
      {
        allowanceCode: "overtime",
        workMinutes: 120,
        multiplier: 1.5,
        amount: 30000
      }
    ],
    totalAllowanceAmount: 30000,
    createdAt: "2026-04-01T00:00:00.000Z"
  }
});

describe("allowance-rate-impact", () => {
  it("should compare existing allowance calculations against candidate rate items", () => {
    const preview = buildAllowanceRateImpactPreview([createCalculation()], [
      {
        allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "overtime"),
        multiplier: 2
      }
    ]);

    expect(preview.calculationCount).toBe(1);
    expect(preview.affectedCalculationCount).toBe(1);
    expect(preview.beforeAmount).toBe(30000);
    expect(preview.afterAmount).toBe(40000);
    expect(preview.deltaAmount).toBe(10000);
    expect(preview.rows[0]).toMatchObject({
      calculationId: "calc-1",
      deltaAmount: 10000
    });
    expect(preview.zeroedPayWarningCount).toBe(0);
  });

  it("should warn when candidate rates zero out payable minutes", () => {
    const preview = buildAllowanceRateImpactPreview([createCalculation()], [
      {
        allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "overtime"),
        multiplier: 0
      }
    ]);

    expect(preview.afterAmount).toBe(0);
    expect(preview.deltaAmount).toBe(-30000);
    expect(preview.zeroedPayWarningCount).toBe(1);
    expect(preview.zeroedPayWarnings[0]).toMatchObject({
      allowanceLabel: "평_연장근로수당 연장",
      beforeAmount: 30000,
      employeeName: "김현우",
      workMinutes: 120
    });
  });
});
