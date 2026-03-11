import { describe, expect, it } from "vitest";

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
  it("should match case 01 daytime base shift", () => {
    expect(
      calculateWorkBreakdown({
        timeRange: {
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 480,
      baseWorkMinutes: 480,
      overtimeMinutes: 0,
      nightMinutes: 0,
      holidayMinutes: 0,
      substituteMinutes: 0
    });
  });

  it("should match case 02 overtime daytime shift", () => {
    expect(
      calculateWorkBreakdown({
        timeRange: {
          startTime: "09:00",
          endTime: "20:00",
          breakMinutes: 60
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 600,
      baseWorkMinutes: 480,
      overtimeMinutes: 120,
      nightMinutes: 0
    });
  });

  it("should match case 03 overnight night shift", () => {
    expect(
      calculateWorkBreakdown({
        timeRange: {
          startTime: "22:00",
          endTime: "06:00",
          breakMinutes: 60
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 420,
      nightMinutes: 420
    });
  });

  it("should match case 04 mixed evening and night overtime shift", () => {
    expect(
      calculateWorkBreakdown({
        timeRange: {
          startTime: "18:00",
          endTime: "04:00",
          breakMinutes: 60
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 540,
      baseWorkMinutes: 480,
      overtimeMinutes: 60,
      nightMinutes: 360
    });
  });

  it("should match case 06 holiday daytime shift", () => {
    expect(
      calculateWorkBreakdown({
        isHoliday: true,
        timeRange: {
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 480,
      holidayMinutes: 480,
      baseWorkMinutes: 0,
      overtimeMinutes: 0
    });
  });

  it("should match case 07 holiday long shift", () => {
    expect(
      calculateWorkBreakdown({
        isHoliday: true,
        timeRange: {
          startTime: "09:00",
          endTime: "21:00",
          breakMinutes: 60
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 660,
      holidayMinutes: 660
    });
  });

  it("should match case 08 substitute work tag", () => {
    expect(
      calculateWorkBreakdown({
        workType: "substitute",
        timeRange: {
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      })
    ).toMatchObject({
      totalWorkMinutes: 480,
      substituteMinutes: 480
    });
  });
});
