import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import {
  detectUnmarkedHolidayGap,
  hasUnmarkedHolidayGapFromData
} from "./performance-holiday-gap-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const entry = (section: PerformanceEntryRecord["section"], workDate: string) =>
  ({ section, workDate }) as unknown as PerformanceEntryRecord;

describe("hasUnmarkedHolidayGapFromData", () => {
  it("is not a gap when the file has no rows", () => {
    expect(
      hasUnmarkedHolidayGapFromData({
        workDates: [],
        registeredHolidayDates: ["2026-05-05"]
      })
    ).toBe(false);
  });

  it("is a gap when a holiday in a month the file covers has no row on it", () => {
    expect(
      hasUnmarkedHolidayGapFromData({
        workDates: ["2026-05-03", "2026-05-10"],
        registeredHolidayDates: ["2026-05-05"]
      })
    ).toBe(true);
  });

  it("is not a gap when the holiday date itself has a recorded row (even a substitute row)", () => {
    expect(
      hasUnmarkedHolidayGapFromData({
        workDates: ["2026-05-05", "2026-05-10"],
        registeredHolidayDates: ["2026-05-05"]
      })
    ).toBe(false);
  });

  it("is not a gap when the registered holiday is in a month the file has no rows for (cross-month)", () => {
    expect(
      hasUnmarkedHolidayGapFromData({
        workDates: ["2026-06-01", "2026-06-03"],
        registeredHolidayDates: ["2026-05-05"]
      })
    ).toBe(false);
  });
});

describe("detectUnmarkedHolidayGap (database-backed)", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
  });

  const initStorage = () => {
    initializeSqliteStorage({
      dbPath: path.resolve(
        process.cwd(),
        "artifacts",
        "tests",
        "performance-holiday-gap",
        `holiday-gap-${process.pid}-${Math.random().toString(16).slice(2, 8)}.sqlite`
      )
    });
  };

  it("flags a March file whose seeded 삼일절 holiday has no row on it", () => {
    initStorage();

    expect(
      detectUnmarkedHolidayGap({
        entries: [entry("overtime", "2026-03-03"), entry("substitute", "2026-03-10")]
      })
    ).toBe(true);
  });

  it("does not flag a file that has a row on the holiday date", () => {
    initStorage();

    expect(
      detectUnmarkedHolidayGap({
        entries: [entry("substitute", "2026-03-01"), entry("overtime", "2026-03-03")]
      })
    ).toBe(false);
  });

  it("does not flag a file whose rows are all in a month with no registered holiday", () => {
    initStorage();

    expect(
      detectUnmarkedHolidayGap({
        entries: [entry("overtime", "2026-04-10")]
      })
    ).toBe(false);
  });

  it("does not strand a file whose rows spill into a month without that holiday", () => {
    initStorage();

    // Rows are all in June (no seeded June holiday); a May holiday must not strand a June file.
    expect(
      detectUnmarkedHolidayGap({
        entries: [entry("overtime", "2026-06-01"), entry("overtime", "2026-06-03")]
      })
    ).toBe(false);
  });
});
