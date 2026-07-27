import { describe, expect, it } from "vitest";

import {
  getDefaultTeamWorkType,
  getTeamWorkTypeLabel,
  isPoolTeamLabel,
  isTeamWorkType,
  normalizeTeamWorkType
} from "./team-work-type";

describe("team-work-type", () => {
  it("should treat pool-style labels as pool teams", () => {
    expect(isPoolTeamLabel("Pool")).toBe(true);
    expect(isPoolTeamLabel("pool")).toBe(true);
    expect(isPoolTeamLabel("P")).toBe(true);
    expect(isPoolTeamLabel("P조")).toBe(true);
    expect(isPoolTeamLabel("Pool(주말)")).toBe(true);
    expect(isPoolTeamLabel("A조")).toBe(false);
    expect(isPoolTeamLabel("")).toBe(false);
    expect(isPoolTeamLabel(undefined)).toBe(false);
  });

  it("should default pool labels to POOL and every other label to ROTATING", () => {
    expect(getDefaultTeamWorkType("Pool")).toBe("POOL");
    expect(getDefaultTeamWorkType("A조")).toBe("ROTATING");
    expect(getDefaultTeamWorkType("야간전담")).toBe("ROTATING");
  });

  it("should normalize stored values and fall back when unknown", () => {
    expect(normalizeTeamWorkType("FIXED_DAY")).toBe("FIXED_DAY");
    expect(normalizeTeamWorkType("fixed day")).toBe("FIXED_DAY");
    expect(normalizeTeamWorkType("fixed-day")).toBe("FIXED_DAY");
    expect(normalizeTeamWorkType("pool")).toBe("POOL");
    expect(normalizeTeamWorkType("")).toBe("ROTATING");
    expect(normalizeTeamWorkType(undefined)).toBe("ROTATING");
    expect(normalizeTeamWorkType("알수없음", "POOL")).toBe("POOL");
  });

  it("should expose type guards and korean labels", () => {
    expect(isTeamWorkType("ROTATING")).toBe(true);
    expect(isTeamWorkType("rotating")).toBe(false);
    expect(getTeamWorkTypeLabel("FIXED_DAY")).toBe("주간고정조");
    expect(getTeamWorkTypeLabel("POOL")).toBe("Pool");
    expect(getTeamWorkTypeLabel("ROTATING")).toBe("교대조");
  });
});
