import { describe, expect, it } from "vitest";

import { isChangedSlotPriorityApplicable } from "./changed-slot-priority-policy";

describe("변경후 우선 규칙 적용 시작일", () => {
  it("applies from the effective date onward, by work date", () => {
    expect(
      isChangedSlotPriorityApplicable({ workDate: "2026-07-01", effectiveFrom: "2026-07-01" })
    ).toBe(true);
    expect(
      isChangedSlotPriorityApplicable({ workDate: "2026-12-31", effectiveFrom: "2026-07-01" })
    ).toBe(true);
  });

  it("leaves earlier work dates on the old rule so approved past pay does not move", () => {
    expect(
      isChangedSlotPriorityApplicable({ workDate: "2026-06-30", effectiveFrom: "2026-07-01" })
    ).toBe(false);
    expect(
      isChangedSlotPriorityApplicable({ workDate: "2025-01-01", effectiveFrom: "2026-07-01" })
    ).toBe(false);
  });

  it("does not apply when the effective date is unset or malformed", () => {
    expect(isChangedSlotPriorityApplicable({ workDate: "2026-07-01" })).toBe(false);
    expect(isChangedSlotPriorityApplicable({ workDate: "2026-07-01", effectiveFrom: "" })).toBe(
      false
    );
    expect(
      isChangedSlotPriorityApplicable({ workDate: "2026-07-01", effectiveFrom: "2026-07" })
    ).toBe(false);
    expect(
      isChangedSlotPriorityApplicable({ workDate: "2026-07-01", effectiveFrom: "  " })
    ).toBe(false);
  });

  it("does not apply when the work date itself is unusable", () => {
    expect(isChangedSlotPriorityApplicable({ workDate: "", effectiveFrom: "2026-07-01" })).toBe(
      false
    );
    expect(
      isChangedSlotPriorityApplicable({ workDate: "2026-7-1", effectiveFrom: "2026-07-01" })
    ).toBe(false);
  });
});
