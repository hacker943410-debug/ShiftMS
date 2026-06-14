import { describe, expect, it } from "vitest";

import { buildHolidayMissingGuidance, detectHolidayMarkingGap } from "./holiday-missing-guidance";

const holiday = (holidayDate: string, name?: string) => ({ holidayDate, name });

const overviewWith = (sections: string[][]) => ({
  groups: sections.map((rowSections) => ({
    rows: rowSections.map((section) => ({ entry: { section } }))
  }))
});

describe("detectHolidayMarkingGap", () => {
  it("returns null when no specific month is selected", () => {
    expect(
      detectHolidayMarkingGap({
        scheduleMonth: null,
        holidayItems: [holiday("2026-03-01", "삼일절")],
        overview: overviewWith([["overtime"]])
      })
    ).toBeNull();
  });

  it("returns null when the month has no registered holidays", () => {
    expect(
      detectHolidayMarkingGap({
        scheduleMonth: "2026-04",
        holidayItems: [holiday("2026-03-01", "삼일절")],
        overview: overviewWith([["overtime"]])
      })
    ).toBeNull();
  });

  it("returns null when the month has no rows loaded yet (nothing to compare)", () => {
    expect(
      detectHolidayMarkingGap({
        scheduleMonth: "2026-03",
        holidayItems: [holiday("2026-03-01", "삼일절")],
        overview: overviewWith([])
      })
    ).toBeNull();
  });

  it("returns null when a legal-holiday row is already present", () => {
    expect(
      detectHolidayMarkingGap({
        scheduleMonth: "2026-03",
        holidayItems: [holiday("2026-03-01", "삼일절")],
        overview: overviewWith([["overtime", "legal-holiday"]])
      })
    ).toBeNull();
  });

  it("flags a gap when holidays are registered, rows exist, but no holiday row parsed", () => {
    const gap = detectHolidayMarkingGap({
      scheduleMonth: "2026-03",
      holidayItems: [holiday("2026-03-01", "삼일절"), holiday("2026-04-05")],
      overview: overviewWith([["overtime"], ["substitute"]])
    });

    expect(gap).not.toBeNull();
    expect(gap?.scheduleMonth).toBe("2026-03");
    expect(gap?.holidayLabels).toEqual(["3월 1일(삼일절)"]);
  });
});

describe("buildHolidayMissingGuidance", () => {
  it("produces a guidance config that navigates to 운영 관리 and names the holiday", () => {
    const config = buildHolidayMissingGuidance({
      scheduleMonth: "2026-03",
      holidayLabels: ["3월 1일(삼일절)"]
    });

    expect(config.why).toContain("삼일절");
    expect(config.steps.length).toBeGreaterThanOrEqual(2);
    expect(config.navigation?.route).toBe("operations");
  });
});
