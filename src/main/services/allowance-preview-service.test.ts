import { describe, expect, it, vi } from "vitest";

import { previewAllowanceCalculation } from "./allowance-preview-service";

describe("previewAllowanceCalculation", () => {
  it("should return a successful preview result for a valid input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T06:00:00.000Z"));

    const result = previewAllowanceCalculation({
      workDate: "2026-03-03",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      hourlyRate: 10000,
      workType: "substitute"
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.breakdown.totalWorkMinutes).toBe(480);
      expect(result.data.businessCategoryCode).toBe("weekday-substitute");
      expect(result.data.totalAllowanceAmount).toBe(120000);
      expect(result.data.createdAt).toBe("2026-03-11T06:00:00.000Z");
    }

    vi.useRealTimers();
  });

  it("should return a failure result for an invalid time input", () => {
    const result = previewAllowanceCalculation({
      workDate: "2026-03-03",
      startTime: "99:00",
      endTime: "18:00",
      breakMinutes: 60,
      hourlyRate: 10000
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "ALLOWANCE_PREVIEW_FAILED"
    });
  });
});
