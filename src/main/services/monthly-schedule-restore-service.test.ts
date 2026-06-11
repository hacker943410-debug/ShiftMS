import { describe, expect, it } from "vitest";

import {
  buildDutyTimeSourceMapForTest,
  classifyGridDutyCodeForTest
} from "./monthly-schedule-restore-service";

const step = (
  dutyCode: string,
  startTime: string | undefined,
  endTime: string | undefined,
  breakMinutes = 60
) => ({ dutyCode, startTime, endTime, breakMinutes });

// buildDutyTimeSourceMap only reads pattern.cycles / pattern.steps.
const pattern = (steps: ReturnType<typeof step>[]) => ({ steps, cycles: [] }) as never;

describe("classifyGridDutyCode", () => {
  it("maps a morning-start window to the Day grid code", () => {
    expect(
      classifyGridDutyCodeForTest({ startTime: "08:00", endTime: "17:00", breakMinutes: 60 })
    ).toBe("D");
  });

  it("maps an overnight window to the Night grid code", () => {
    expect(
      classifyGridDutyCodeForTest({ startTime: "18:00", endTime: "08:00", breakMinutes: 90 })
    ).toBe("N");
  });

  it("maps an afternoon-start window to the Evening grid code", () => {
    expect(
      classifyGridDutyCodeForTest({ startTime: "14:00", endTime: "22:00", breakMinutes: 60 })
    ).toBe("E");
  });

  it("returns null when the window has no usable start time", () => {
    expect(
      classifyGridDutyCodeForTest({ startTime: undefined, endTime: undefined, breakMinutes: 0 })
    ).toBeNull();
  });
});

describe("buildDutyTimeSourceMap", () => {
  it("backfills D/E/N grid times for a pattern that uses A/B/C duty letters (SKB동작국사 5조3교대)", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("B", "09:00", "18:00"),
        step("A", "08:00", "17:00"),
        step("C", "18:00", "08:00", 90),
        step("X", undefined, undefined, 0)
      ])
    );

    // Original pattern letters still resolve.
    expect(map.get("A")).toMatchObject({ startTime: "08:00", endTime: "17:00" });
    // Grid-positional codes now carry real times (previously undefined -> 0 work minutes -> 0 수당).
    expect(map.get("D")?.startTime).toBeTruthy();
    expect(map.get("D")).toMatchObject({ startTime: "09:00", endTime: "18:00" });
    expect(map.get("N")).toMatchObject({ startTime: "18:00", endTime: "08:00", breakMinutes: 90 });
  });

  it("preserves the native window for a pattern that already uses D/N codes (판교DC)", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("D", "08:00", "20:00", 90),
        step("N", "20:00", "08:00", 90),
        step("X", undefined, undefined, 0)
      ])
    );

    // Classification must not overwrite the pattern's own D window.
    expect(map.get("D")).toMatchObject({ startTime: "08:00", endTime: "20:00" });
    expect(map.get("N")).toMatchObject({ startTime: "20:00", endTime: "08:00" });
  });
});
