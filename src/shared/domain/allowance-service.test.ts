import { describe, expect, it } from "vitest";

import { buildAllowanceRateTable } from "./allowance-rate-matrix";
import {
  calculateRoundedAllowanceLineAmounts,
  createAllowanceCalculationSignature,
  createAllowanceCalculationSnapshot
} from "./allowance-service";

describe("createAllowanceCalculationSnapshot", () => {
  const baseInput = {
    calculationId: "calc-01",
    performanceApprovalId: "approval-01",
    calculationVersion: 1,
    createdAt: "2026-03-11T15:00:00+09:00",
    approvedSnapshot: {
      performanceFileId: "file-01",
      approvalStatus: "approved" as const,
      approvedAt: "2026-03-11T14:00:00+09:00",
      approvedBy: "user-01",
      holidayCalendarId: "holiday-2026",
      allowanceRateVersionId: "rate-2026-1",
      sourceFileChecksum: "abc123"
    },
    workDate: "2026-03-03",
    timeRange: {
      startTime: "09:00",
      endTime: "20:00",
      breakMinutes: 60
    },
    hourlyRate: 10000,
    rateTable: buildAllowanceRateTable()
  };

  it("should apply weekday overtime rates to overtime and night lines", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });

    expect(snapshot.businessCategoryCode).toBe("weekday-overtime");
    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 600,
      baseWorkMinutes: 480,
      overtimeMinutes: 120,
      nightMinutes: 0,
      holidayMinutes: 0,
      substituteMinutes: 0
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "overtime",
        workMinutes: 120,
        multiplier: 1.5,
        amount: 30000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(30000);
  });

  it("should pay the full non-night span as overtime for standalone overtime rows", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-01-overtime-short",
      performanceApprovalId: "approval-01-overtime-short",
      allowanceCategoryCode: "weekday-overtime",
      workType: "overtime",
      timeRange: {
        startTime: "20:00",
        endTime: "22:00",
        breakMinutes: 30
      }
    });

    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 90,
      baseWorkMinutes: 0,
      overtimeMinutes: 90,
      nightMinutes: 0
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "overtime",
        workMinutes: 90,
        multiplier: 1.5,
        amount: 22500
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(22500);
  });

  it("should round a single allowance line up to the next won when decimals occur", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-round-up",
      performanceApprovalId: "approval-round-up",
      allowanceCategoryCode: "weekday-overtime",
      hourlyRate: 10001,
      workType: "overtime",
      timeRange: {
        startTime: "20:00",
        endTime: "20:01",
        breakMinutes: 0
      }
    });

    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "overtime",
        workMinutes: 1,
        multiplier: 1.5,
        amount: 251
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(251);
  });

  it("should round the raw allowance total once regardless of line split", () => {
    const hourlyRate = 17457.07;
    const threeLineCase = calculateRoundedAllowanceLineAmounts(hourlyRate, [
      {
        workMinutes: 90,
        multiplier: 1.5
      },
      {
        workMinutes: 150,
        multiplier: 1.5
      },
      {
        workMinutes: 390,
        multiplier: 1.5
      }
    ]);
    const twoLineCase = calculateRoundedAllowanceLineAmounts(hourlyRate, [
      {
        workMinutes: 480,
        multiplier: 1.5
      },
      {
        workMinutes: 150,
        multiplier: 1.5
      }
    ]);

    expect(threeLineCase.totalAmount).toBe(274949);
    expect(twoLineCase.totalAmount).toBe(274949);
    expect(threeLineCase.lineAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(
      threeLineCase.totalAmount
    );
    expect(twoLineCase.lineAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(
      twoLineCase.totalAmount
    );
  });

  it("should apply legal holiday rates across base overtime and night lines", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-02",
      performanceApprovalId: "approval-02",
      workDate: "2026-03-01",
      allowanceCategoryCode: "legal-holiday",
      isHoliday: true,
      timeRange: {
        startTime: "20:00",
        endTime: "06:00",
        breakMinutes: 60
      }
    });

    expect(snapshot.businessCategoryCode).toBe("legal-holiday");
    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 540,
      baseWorkMinutes: 60,
      overtimeMinutes: 60,
      nightMinutes: 420,
      holidayMinutes: 540
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "base",
        workMinutes: 60,
        multiplier: 1.5,
        amount: 15000
      },
      {
        allowanceCode: "overtime",
        workMinutes: 60,
        multiplier: 1.5,
        amount: 15000
      },
      {
        allowanceCode: "night",
        workMinutes: 420,
        multiplier: 1.5,
        amount: 105000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(135000);
  });

  it("should apply weekday substitute rates to all three axes", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-03",
      performanceApprovalId: "approval-03",
      allowanceCategoryCode: "weekday-substitute",
      workType: "substitute",
      timeRange: {
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60
      }
    });

    expect(snapshot.businessCategoryCode).toBe("weekday-substitute");
    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 480,
      substituteMinutes: 480
    });
    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "base",
        workMinutes: 480,
        multiplier: 1.5,
        amount: 120000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(120000);
  });

  it("should create the same signature for the same input", () => {
    const left = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });
    const right = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });

    expect(createAllowanceCalculationSignature(left)).toBe(
      createAllowanceCalculationSignature(right)
    );
  });

  it("should change the signature when the business category changes", () => {
    const left = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-overtime"
    });
    const right = createAllowanceCalculationSnapshot({
      ...baseInput,
      allowanceCategoryCode: "weekday-substitute"
    });

    expect(createAllowanceCalculationSignature(left)).not.toBe(
      createAllowanceCalculationSignature(right)
    );
  });
});
