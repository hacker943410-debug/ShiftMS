import { describe, expect, it } from "vitest";

import { ROTATION_TEMPLATES, buildRotationTeamIndexes } from "./site-rotation-templates";

describe("site-rotation-templates", () => {
  it("spreads team start positions evenly across the cycle length", () => {
    expect(buildRotationTeamIndexes(4, 8)).toEqual([0, 2, 4, 6]);
    expect(buildRotationTeamIndexes(3, 6)).toEqual([0, 2, 4]);
    expect(buildRotationTeamIndexes(2, 6)).toEqual([0, 3]);
  });

  it("keeps every start position inside the cycle and never throws on zero length", () => {
    expect(buildRotationTeamIndexes(2, 0)).toEqual([0, 0]);
    for (const template of ROTATION_TEMPLATES) {
      const length = template.patternString.length;
      const indexes = buildRotationTeamIndexes(template.teamCount, length);
      expect(indexes).toHaveLength(template.teamCount);
      expect(indexes.every((value) => value >= 0 && value < length)).toBe(true);
    }
  });

  it("defines each template with shift times matching its shift count", () => {
    expect(ROTATION_TEMPLATES.map((template) => template.key)).toEqual([
      "day-only",
      "two-team-two-shift",
      "three-team-two-shift",
      "four-team-three-shift",
    ]);
    for (const template of ROTATION_TEMPLATES) {
      expect(template.shiftTimes).toHaveLength(template.shiftCount);
      expect(template.patternString.length).toBeGreaterThan(0);
      expect(template.teamCount).toBeGreaterThanOrEqual(2);
    }
  });
});
