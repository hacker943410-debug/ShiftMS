import { describe, expect, it } from "vitest";

import {
  buildDutyTimeSourceMapForTest,
  classifyGridDutyCodeForTest,
  hasUsableWindowForTest
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
  it("classifies a morning-start window as Day", () => {
    expect(classifyGridDutyCodeForTest({ startTime: "08:00", endTime: "17:00", breakMinutes: 60 })).toBe("D");
  });

  it("classifies an afternoon-start window as Evening", () => {
    expect(classifyGridDutyCodeForTest({ startTime: "14:00", endTime: "22:00", breakMinutes: 60 })).toBe("E");
  });

  it("classifies an overnight window as Night", () => {
    expect(classifyGridDutyCodeForTest({ startTime: "18:00", endTime: "08:00", breakMinutes: 90 })).toBe("N");
  });

  it("classifies a late same-day start as Night", () => {
    expect(classifyGridDutyCodeForTest({ startTime: "17:00", endTime: "23:00", breakMinutes: 60 })).toBe("N");
  });

  it("classifies an evening window that ends at midnight as Evening (00:00 = end of day, not overnight)", () => {
    // 16:00-00:00 is a 4pm-midnight evening shift; the 00:00 end must not be read as spanning midnight.
    expect(classifyGridDutyCodeForTest({ startTime: "16:00", endTime: "00:00", breakMinutes: 60 })).toBe("E");
  });

  it("classifies a shift starting exactly at midnight as Night", () => {
    // 00:00-08:00 is the night/dawn leg of an 8h 3교대; a 00:00 start belongs to the Night position.
    expect(classifyGridDutyCodeForTest({ startTime: "00:00", endTime: "08:00", breakMinutes: 60 })).toBe("N");
  });

  it("does NOT misroute an early-morning Day shift (start before 06:00 but not midnight) to Night", () => {
    // Guards against the over-broad "start < 06:00 -> Night" rule: 05:00-13:00 is an early Day shift and
    // must stay Day so it does not collide with the real Night window under first-match-wins.
    expect(classifyGridDutyCodeForTest({ startTime: "05:00", endTime: "13:00", breakMinutes: 60 })).toBe("D");
  });

  it("classifies a late evening window that ends at midnight as Night (e.g. 20:00-00:00)", () => {
    // 20:00-00:00 (8pm-midnight) is night-band, consistent with 17:00-23:00 -> N. A non-continuous
    // pattern pairing this with 00:00-08:00 leaves Evening unresolved (-> warned) by design; the
    // realistic continuous 8h-3교대 (08-16 / 16-00 / 00-08) instead resolves D/E/N without collision.
    expect(classifyGridDutyCodeForTest({ startTime: "20:00", endTime: "00:00", breakMinutes: 0 })).toBe("N");
  });

  it("does NOT classify a degenerate equal start/end window into any grid position", () => {
    // Regression: 08:00-08:00 carries no usable duration. It must NOT be relabeled into a band (which
    // would persist a phantom ~24h shift downstream) — it returns null so the caller surfaces it as
    // unresolved instead.
    expect(classifyGridDutyCodeForTest({ startTime: "08:00", endTime: "08:00", breakMinutes: 0 })).toBeNull();
    expect(classifyGridDutyCodeForTest({ startTime: "00:00", endTime: "00:00", breakMinutes: 0 })).toBeNull();
  });

  it("accepts HH:MM:SS time strings", () => {
    expect(classifyGridDutyCodeForTest({ startTime: "08:00:00", endTime: "17:00:00", breakMinutes: 60 })).toBe("D");
  });

  it("returns null when the start time is missing or malformed", () => {
    expect(classifyGridDutyCodeForTest({ startTime: undefined, endTime: undefined, breakMinutes: 0 })).toBeNull();
    expect(classifyGridDutyCodeForTest({ startTime: "오전 8시", endTime: "17:00", breakMinutes: 0 })).toBeNull();
  });

  it("rejects out-of-range seconds rather than silently truncating them", () => {
    // The HH:MM:SS tolerance must not let a garbage time (seconds > 59) pass as a valid window.
    expect(classifyGridDutyCodeForTest({ startTime: "08:00:99", endTime: "17:00", breakMinutes: 0 })).toBeNull();
  });
});

describe("hasUsableWindow", () => {
  it("is true only when both start and end parse into a non-zero-length window", () => {
    expect(hasUsableWindowForTest({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 })).toBe(true);
    expect(hasUsableWindowForTest({ startTime: "09:00:00", endTime: "18:00:00", breakMinutes: 60 })).toBe(true);
    expect(hasUsableWindowForTest({ startTime: "09:00", endTime: undefined, breakMinutes: 60 })).toBe(false);
    // Degenerate zero-length window (start === end) is not a real shift.
    expect(hasUsableWindowForTest({ startTime: "08:00", endTime: "08:00", breakMinutes: 0 })).toBe(false);
    expect(hasUsableWindowForTest(undefined)).toBe(false);
  });
});

describe("buildDutyTimeSourceMap", () => {
  it("resolves D/E/N from a non-D/E/N pattern by time, and exposes ONLY grid codes (SKB 5조3교대 A/B/C)", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("B", "09:00", "18:00", 60),
        step("A", "08:00", "17:00", 60),
        step("C", "18:00", "08:00", 90),
        step("X", undefined, undefined, 0)
      ])
    );

    expect(map.get("D")).toMatchObject({ startTime: "09:00", endTime: "18:00" }); // first morning wins
    expect(map.get("N")).toMatchObject({ startTime: "18:00", endTime: "08:00", breakMinutes: 90 });
    // Pattern letters are NOT used as keys.
    expect(map.has("A")).toBe(false);
    expect(map.has("B")).toBe(false);
    expect(map.has("C")).toBe(false);
    expect(map.has("X")).toBe(false);
  });

  it("keeps a native D/N pattern's own windows (판교DC)", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("D", "08:00", "20:00", 90),
        step("N", "20:00", "08:00", 90),
        step("X", undefined, undefined, 0)
      ])
    );

    expect(map.get("D")).toMatchObject({ startTime: "08:00", endTime: "20:00" });
    expect(map.get("N")).toMatchObject({ startTime: "20:00", endTime: "08:00" });
  });

  it("F3B: a literal D step with no time does not block the real morning window (classification wins)", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("D", undefined, undefined, 0), // literal D but no usable time
        step("A", "08:00", "17:00", 60),
        step("C", "18:00", "08:00", 90)
      ])
    );

    expect(map.get("D")).toMatchObject({ startTime: "08:00", endTime: "17:00" });
    expect(map.get("N")).toMatchObject({ startTime: "18:00", endTime: "08:00" });
  });

  it("F3A: a literal D step that is actually a night window does not poison the Day position", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("D", "20:00", "08:00", 90), // mislabeled: 'D' but overnight -> classifies as N
        step("A", "08:00", "17:00", 60) // real morning -> Day
      ])
    );

    expect(map.get("D")).toMatchObject({ startTime: "08:00", endTime: "17:00" });
    expect(map.get("N")).toMatchObject({ startTime: "20:00", endTime: "08:00" });
  });

  it("resolves all three positions for an 8h 3교대 that crosses the midnight boundary (08-16 / 16-00 / 00-08)", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("A", "08:00", "16:00", 60), // morning -> Day
        step("B", "16:00", "00:00", 60), // afternoon-to-midnight -> Evening (NOT Night)
        step("C", "00:00", "08:00", 60) // midnight-to-morning -> Night (NOT Day)
      ])
    );

    expect(map.get("D")).toMatchObject({ startTime: "08:00", endTime: "16:00" });
    expect(map.get("E")).toMatchObject({ startTime: "16:00", endTime: "00:00" });
    expect(map.get("N")).toMatchObject({ startTime: "00:00", endTime: "08:00" });
  });

  it("drops a degenerate equal-time step instead of filling a grid slot with a phantom window", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("A", "08:00", "17:00", 60), // real morning -> Day
        step("B", "12:00", "12:00", 60), // degenerate zero-length window -> must NOT become Evening
        step("C", "20:00", "08:00", 90) // overnight -> Night
      ])
    );

    expect(map.get("D")).toMatchObject({ startTime: "08:00", endTime: "17:00" });
    expect(map.get("N")).toMatchObject({ startTime: "20:00", endTime: "08:00" });
    // The 12:00-12:00 step is unusable, so the Evening position stays unresolved.
    expect(map.has("E")).toBe(false);
  });

  it("F1: a pattern with no morning shift leaves Day unresolved (caller must warn, not silently 0)", () => {
    const map = buildDutyTimeSourceMapForTest(
      pattern([
        step("P", "12:00", "20:00", 60), // afternoon -> Evening
        step("Q", "20:00", "08:00", 90) // overnight -> Night
      ])
    );

    expect(map.get("E")).toMatchObject({ startTime: "12:00", endTime: "20:00" });
    expect(map.get("N")).toMatchObject({ startTime: "20:00", endTime: "08:00" });
    expect(map.has("D")).toBe(false);
  });
});
