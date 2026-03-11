import { describe, expect, it } from "vitest";

import { allowanceRateVersionFixtures } from "./allowance-rate-fixtures";
import { selectActiveAllowanceRateVersion } from "./allowance-rate-service";

describe("selectActiveAllowanceRateVersion", () => {
  it("should select the active version that matches the target date", () => {
    const result = selectActiveAllowanceRateVersion({
      targetDate: "2026-08-01",
      versions: allowanceRateVersionFixtures
    });

    expect(result?.id).toBe("rate-2026-2");
  });

  it("should ignore retired versions for new calculations", () => {
    const result = selectActiveAllowanceRateVersion({
      targetDate: "2026-03-15",
      versions: allowanceRateVersionFixtures
    });

    expect(result).toBeNull();
  });

  it("should select the next year's active version when the date crosses the year", () => {
    const result = selectActiveAllowanceRateVersion({
      targetDate: "2027-01-05",
      versions: allowanceRateVersionFixtures
    });

    expect(result?.id).toBe("rate-2027-1");
  });
});
