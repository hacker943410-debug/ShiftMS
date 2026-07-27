import { describe, expect, it } from "vitest";

import type { ShiftPatternRecord } from "./model";
import {
  buildShiftPatternVersions,
  getPreviousDateValue,
  getShiftPatternEffectiveFrom,
  getShiftPatternEffectiveFromError,
  resolveShiftPatternForDate,
  resolveShiftPatternForMonth
} from "./shift-pattern-version";

const createPattern = (overrides: Partial<ShiftPatternRecord> & { id: string }): ShiftPatternRecord => ({
  siteId: "site-1",
  name: "패턴",
  teamCount: 4,
  cycleLength: 12,
  patternCode: "DDDOOO",
  startIndexRule: "manual-seed",
  status: "active",
  steps: [],
  teamIndexes: [],
  cycles: [],
  teamCycleAssignments: [],
  teamCapacities: [],
  teamSettings: [],
  poolEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("shift-pattern-version", () => {
  it("should fall back to the pattern start date when no effective date is stored", () => {
    expect(
      getShiftPatternEffectiveFrom({ effectiveFrom: "2026-08-01", patternStartDate: "2026-01-01" })
    ).toBe("2026-08-01");
    expect(
      getShiftPatternEffectiveFrom({ effectiveFrom: undefined, patternStartDate: "2026-01-01" })
    ).toBe("2026-01-01");
    expect(getShiftPatternEffectiveFrom({ effectiveFrom: "  ", patternStartDate: "  " })).toBeUndefined();
    expect(
      getShiftPatternEffectiveFrom({ effectiveFrom: "2026-8-1", patternStartDate: undefined })
    ).toBeUndefined();
  });

  it("should step back one day across month, year and leap-day boundaries", () => {
    expect(getPreviousDateValue("2026-08-01")).toBe("2026-07-31");
    expect(getPreviousDateValue("2026-01-01")).toBe("2025-12-31");
    expect(getPreviousDateValue("2028-03-01")).toBe("2028-02-29");
    expect(getPreviousDateValue("2026-03-01")).toBe("2026-02-28");
  });

  it("should use the version that was in effect on the target date", () => {
    const first = createPattern({ id: "v1", effectiveFrom: "2026-01-01" });
    const second = createPattern({ id: "v2", effectiveFrom: "2026-08-01" });
    const patterns = [second, first];

    expect(resolveShiftPatternForDate(patterns, "2026-07-31")?.id).toBe("v1");
    expect(resolveShiftPatternForDate(patterns, "2026-08-01")?.id).toBe("v2");
    expect(resolveShiftPatternForDate(patterns, "2027-01-01")?.id).toBe("v2");
  });

  it("should keep using the earliest version for dates before every start date", () => {
    const first = createPattern({ id: "v1", effectiveFrom: "2026-01-01" });
    const second = createPattern({ id: "v2", effectiveFrom: "2026-08-01" });

    expect(resolveShiftPatternForDate([first, second], "2025-12-31")?.id).toBe("v1");
  });

  it("should ignore inactive versions and return null when nothing is active", () => {
    const active = createPattern({ id: "v1", effectiveFrom: "2026-01-01" });
    const stopped = createPattern({ id: "v2", effectiveFrom: "2026-08-01", status: "inactive" });

    expect(resolveShiftPatternForDate([active, stopped], "2026-09-01")?.id).toBe("v1");
    expect(resolveShiftPatternForDate([stopped], "2026-09-01")).toBeNull();
    expect(resolveShiftPatternForDate([], "2026-09-01")).toBeNull();
  });

  it("should behave exactly as before when a site has a single version", () => {
    const only = createPattern({ id: "v1", effectiveFrom: undefined, patternStartDate: "2026-05-01" });

    expect(resolveShiftPatternForDate([only], "2026-01-01")?.id).toBe("v1");
    expect(resolveShiftPatternForDate([only], "2026-05-01")?.id).toBe("v1");
    expect(resolveShiftPatternForDate([only], "2030-12-31")?.id).toBe("v1");
  });

  it("should resolve a schedule month by its first day", () => {
    const first = createPattern({ id: "v1", effectiveFrom: "2026-01-01" });
    const second = createPattern({ id: "v2", effectiveFrom: "2026-08-02" });
    const patterns = [first, second];

    // 8월 2일부터 적용되는 설정은 8월 근무표에는 아직 쓰지 않는다(그 달 1일 기준).
    expect(resolveShiftPatternForMonth(patterns, "2026-08")?.id).toBe("v1");
    expect(resolveShiftPatternForMonth(patterns, "2026-09")?.id).toBe("v2");
  });

  it("should derive each version end date from the next version start date", () => {
    const first = createPattern({ id: "v1", effectiveFrom: "2026-01-01" });
    const second = createPattern({ id: "v2", effectiveFrom: "2026-08-01" });
    const third = createPattern({ id: "v3", effectiveFrom: "2027-01-01" });

    const versions = buildShiftPatternVersions([third, first, second]);

    expect(versions.map((item) => [item.effectiveFrom, item.effectiveTo])).toEqual([
      ["2026-01-01", "2026-07-31"],
      ["2026-08-01", "2026-12-31"],
      ["2027-01-01", undefined]
    ]);
  });

  it("should drop stopped versions from the history", () => {
    const versions = buildShiftPatternVersions([
      createPattern({ id: "v1", effectiveFrom: "2026-01-01" }),
      createPattern({ id: "v2", effectiveFrom: "2026-08-01", status: "inactive" })
    ]);

    expect(versions.map((item) => item.pattern.id)).toEqual(["v1"]);
    expect(versions[0]?.effectiveTo).toBeUndefined();
  });

  it("should reject a missing, malformed or duplicated start date", () => {
    const patterns = [
      createPattern({ id: "v1", effectiveFrom: "2026-01-01" }),
      createPattern({ id: "v2", effectiveFrom: "2026-08-01" })
    ];

    expect(getShiftPatternEffectiveFromError({ effectiveFrom: "", patterns })).toContain("입력");
    expect(getShiftPatternEffectiveFromError({ effectiveFrom: "2026/08/01", patterns })).toContain(
      "형식"
    );
    expect(getShiftPatternEffectiveFromError({ effectiveFrom: "2026-08-01", patterns })).toContain(
      "이미 있습니다"
    );
    expect(
      getShiftPatternEffectiveFromError({
        editingPatternId: "v2",
        effectiveFrom: "2026-08-01",
        patterns
      })
    ).toBeNull();
    expect(
      getShiftPatternEffectiveFromError({ effectiveFrom: "2026-09-01", patterns })
    ).toBeNull();
  });
});
