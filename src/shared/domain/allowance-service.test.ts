import { describe, expect, it } from "vitest";

import { createAllowanceCalculationSnapshot } from "./allowance-service";

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
    rateTable: {
      base: 1,
      overtime: 1.5,
      night: 0.5,
      holiday: 1.5,
      substitute: 1
    }
  };

  it("should create allowance lines from the calculated work breakdown", () => {
    const snapshot = createAllowanceCalculationSnapshot(baseInput);

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
        allowanceCode: "base",
        workMinutes: 480,
        multiplier: 1,
        amount: 80000
      },
      {
        allowanceCode: "overtime",
        workMinutes: 120,
        multiplier: 1.5,
        amount: 30000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(110000);
  });

  it("should include holiday and night lines when those minutes exist", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-02",
      performanceApprovalId: "approval-02",
      workDate: "2026-03-01",
      isHoliday: true,
      timeRange: {
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: 60
      }
    });

    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 420,
      nightMinutes: 420,
      holidayMinutes: 420
    });

    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "night",
        workMinutes: 420,
        multiplier: 0.5,
        amount: 35000
      },
      {
        allowanceCode: "holiday",
        workMinutes: 420,
        multiplier: 1.5,
        amount: 105000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(140000);
  });

  it("should include substitute line when the work type is substitute", () => {
    const snapshot = createAllowanceCalculationSnapshot({
      ...baseInput,
      calculationId: "calc-03",
      performanceApprovalId: "approval-03",
      workType: "substitute",
      timeRange: {
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60
      }
    });

    expect(snapshot.breakdown).toMatchObject({
      totalWorkMinutes: 480,
      substituteMinutes: 480
    });

    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "base",
        workMinutes: 480,
        multiplier: 1,
        amount: 80000
      },
      {
        allowanceCode: "substitute",
        workMinutes: 480,
        multiplier: 1,
        amount: 80000
      }
    ]);
    expect(snapshot.totalAllowanceAmount).toBe(160000);
  });
});
