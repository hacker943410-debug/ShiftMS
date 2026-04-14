import { describe, expect, it } from "vitest";

import { regressionCalculationCases } from "./calculation-fixtures";
import {
  calculateAutomaticBreakMinutes,
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

describe("calculateAutomaticBreakMinutes", () => {
  it("should grant overtime breaks only after each full 4-hour span", () => {
    expect(
      calculateAutomaticBreakMinutes({
        startTime: "20:00",
        endTime: "21:00"
      })
    ).toBe(0);

    expect(
      calculateAutomaticBreakMinutes({
        startTime: "20:00",
        endTime: "00:00"
      })
    ).toBe(30);

    expect(
      calculateAutomaticBreakMinutes({
        startTime: "22:00",
        endTime: "08:00"
      })
    ).toBe(60);

    expect(
      calculateAutomaticBreakMinutes({
        startTime: "23:00",
        endTime: "07:00"
      })
    ).toBe(60);

    expect(
      calculateAutomaticBreakMinutes({
        startTime: "17:00",
        endTime: "05:00"
      })
    ).toBe(90);
  });
});

describe("calculateWorkBreakdown", () => {
  it("should deduct overtime breaks from night minutes before non-night overtime", () => {
    expect(
      calculateWorkBreakdown({
        workType: "overtime",
        timeRange: {
          startTime: "22:00",
          endTime: "02:00",
          breakMinutes: 30
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 210,
      baseWorkMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 210
    });

    expect(
      calculateWorkBreakdown({
        workType: "overtime",
        timeRange: {
          startTime: "20:00",
          endTime: "01:00",
          breakMinutes: 30
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 270,
      baseWorkMinutes: 0,
      overtimeMinutes: 120,
      nightMinutes: 150
    });

    expect(
      calculateWorkBreakdown({
        workType: "overtime",
        timeRange: {
          startTime: "02:00",
          endTime: "05:00",
          breakMinutes: 30
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 150,
      baseWorkMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 150
    });
  });

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
