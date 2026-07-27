import { describe, expect, it } from "vitest";

import {
  ROTATION_TEMPLATES,
  buildRotationTeamIndexes,
  getRotationTemplateTeamCount
} from "./site-rotation-templates";

describe("site-rotation-templates", () => {
  it("spreads team start positions evenly across the cycle length", () => {
    expect(buildRotationTeamIndexes(4, 8)).toEqual([0, 2, 4, 6]);
    expect(buildRotationTeamIndexes(3, 6)).toEqual([0, 2, 4]);
    expect(buildRotationTeamIndexes(2, 6)).toEqual([0, 3]);
  });

  it("keeps every start position inside the cycle and never throws on zero length", () => {
    expect(buildRotationTeamIndexes(2, 0)).toEqual([0, 0]);

    for (const template of ROTATION_TEMPLATES) {
      for (const cycle of template.cycles) {
        const length = cycle.patternString.length;
        const indexes = buildRotationTeamIndexes(cycle.teamCount, length);

        expect(indexes).toHaveLength(cycle.teamCount);
        expect(indexes.every((value) => value >= 0 && value < length)).toBe(true);
      }
    }
  });

  it("defines each template with shift times matching its shift count", () => {
    expect(ROTATION_TEMPLATES.map((template) => template.key)).toEqual([
      "day-only",
      "two-team-two-shift",
      "three-team-two-shift",
      "four-team-three-shift",
      "fixed-day-3on-3off",
      "rotating-3on-3off-3night-3off",
      "fixed-day-plus-rotating"
    ]);

    for (const template of ROTATION_TEMPLATES) {
      expect(template.cycles.length).toBeGreaterThan(0);
      expect(getRotationTemplateTeamCount(template)).toBeGreaterThanOrEqual(2);

      for (const cycle of template.cycles) {
        expect(cycle.shiftTimes).toHaveLength(cycle.shiftCount);
        expect(cycle.patternString.length).toBeGreaterThan(0);
        expect(cycle.teamCount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // 지시서 10장의 기본 패턴/조 구성.
  it("ships the handbook default patterns with the documented start positions", () => {
    const fixedDay = ROTATION_TEMPLATES.find((item) => item.key === "fixed-day-3on-3off");
    const rotating = ROTATION_TEMPLATES.find(
      (item) => item.key === "rotating-3on-3off-3night-3off"
    );
    const combined = ROTATION_TEMPLATES.find((item) => item.key === "fixed-day-plus-rotating");

    expect(fixedDay?.cycles[0]?.patternString).toBe("주주주휴휴휴");
    expect(fixedDay?.cycles[0]?.teamWorkType).toBe("FIXED_DAY");
    // A조 0, B조 3
    expect(buildRotationTeamIndexes(2, 6)).toEqual([0, 3]);

    expect(rotating?.cycles[0]?.patternString).toBe("주주주휴휴휴야야야휴휴휴");
    expect(rotating?.cycles[0]?.teamWorkType).toBe("ROTATING");
    // C조 0, D조 3, E조 6, F조 9
    expect(buildRotationTeamIndexes(4, 12)).toEqual([0, 3, 6, 9]);

    expect(getRotationTemplateTeamCount(combined!)).toBe(6);
    expect(combined?.cycles.map((cycle) => [cycle.teamCount, cycle.teamWorkType])).toEqual([
      [2, "FIXED_DAY"],
      [4, "ROTATING"]
    ]);
  });
});
