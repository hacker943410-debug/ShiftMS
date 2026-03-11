import { describe, expect, it } from "vitest";

import { regressionCalculationCases } from "./calculation-fixtures";
import {
  calculateDurationMinutes,
  calculateWorkBreakdown,
  parseTimeToMinutes
} from "./calculation";

describe("parseTimeToMinutes", () => {
  it("should convert HH:mm to minutes", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
  });

  it("should throw for an invalid time string", () => {
    expect(() => parseTimeToMinutes("25:00")).toThrow("Invalid time format");
  });
});

describe("calculateDurationMinutes", () => {
  it("should calculate worked minutes for a same-day shift", () => {
    expect(
      calculateDurationMinutes({
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60
      })
    ).toBe(480);
  });

  it("should support overnight shifts", () => {
    expect(
      calculateDurationMinutes({
        startTime: "23:30",
        endTime: "02:30",
        breakMinutes: 30
      })
    ).toBe(150);
  });
});

describe("calculateWorkBreakdown", () => {
  for (const calculationCase of regressionCalculationCases) {
    it(`should match ${calculationCase.id} ${calculationCase.description}`, () => {
      expect(
        calculateWorkBreakdown({
          isHoliday: calculationCase.isHoliday,
          workType: calculationCase.workType,
          timeRange: calculationCase.timeRange
        })
      ).toMatchObject(calculationCase.expected);
    });
  }
});
