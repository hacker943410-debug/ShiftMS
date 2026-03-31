import { describe, expect, it } from "vitest";

import { allowanceRateVersionFixtures } from "./allowance-rate-fixtures";
import {
  selectActiveAllowanceRateVersion,
  selectAppliedAllowanceRateVersion
} from "./allowance-rate-service";

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

  it("should select the currently applied version by active status", () => {
    const result = selectAppliedAllowanceRateVersion(allowanceRateVersionFixtures);

    expect(result?.id).toBe("rate-2026-2");
  });
});
