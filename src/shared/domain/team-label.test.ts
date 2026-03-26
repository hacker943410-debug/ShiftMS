import { describe, expect, it } from "vitest";

import { appendWeekendTeamLabel, normalizeTeamLabel } from "./team-label";

describe("team-label", () => {
  it("should normalize single-letter team labels to korean team labels", () => {
    expect(normalizeTeamLabel("A")).toBe("A조");
    expect(normalizeTeamLabel("b")).toBe("B조");
    expect(normalizeTeamLabel("C조")).toBe("C조");
  });

  it("should preserve non-alphabetic team labels as-is", () => {
    expect(normalizeTeamLabel("주간조")).toBe("주간조");
    expect(normalizeTeamLabel("Pool")).toBe("Pool");
  });

  it("should append weekend suffix after normalizing team labels", () => {
    expect(appendWeekendTeamLabel("A")).toBe("A조(주말)");
    expect(appendWeekendTeamLabel("B조")).toBe("B조(주말)");
    expect(appendWeekendTeamLabel("B조(주말)")).toBe("B조(주말)");
  });
});
