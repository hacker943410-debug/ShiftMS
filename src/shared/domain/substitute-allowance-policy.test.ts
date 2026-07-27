import { describe, expect, it } from "vitest";

import {
  determineSubstituteAllowanceEligibility,
  isNewPolicyApplicable,
  resolveSubstituteAllowanceDecision,
  SUBSTITUTE_ALLOWANCE_POLICY_VERSION
} from "./substitute-allowance-policy";

describe("substitute-allowance-policy", () => {
  it("should exclude a pool worker replacing a rotating night shift", () => {
    expect(
      determineSubstituteAllowanceEligibility({
        targetWorkType: "ROTATING",
        substituteWorkType: "POOL",
        isAdditionalWork: true
      })
    ).toEqual({ eligible: false, reasonCode: "POOL_SUBSTITUTE_EXCLUDED" });
  });

  it("should exclude a day-fixed worker replacing a rotating shift", () => {
    expect(
      determineSubstituteAllowanceEligibility({
        targetWorkType: "ROTATING",
        substituteWorkType: "FIXED_DAY",
        isAdditionalWork: true
      })
    ).toEqual({ eligible: false, reasonCode: "FIXED_DAY_SUBSTITUTE_EXCLUDED" });
  });

  it("should keep paying a rotating-to-rotating substitute", () => {
    expect(
      determineSubstituteAllowanceEligibility({
        targetWorkType: "ROTATING",
        substituteWorkType: "ROTATING",
        isAdditionalWork: true
      })
    ).toEqual({ eligible: true, reasonCode: "ROTATING_SUBSTITUTE_ELIGIBLE" });
  });

  it("should reject when the covered shift is not a rotating shift", () => {
    expect(
      determineSubstituteAllowanceEligibility({
        targetWorkType: "FIXED_DAY",
        substituteWorkType: "ROTATING",
        isAdditionalWork: true
      })
    ).toEqual({ eligible: false, reasonCode: "TARGET_IS_NOT_ROTATING_SHIFT" });
  });

  it("should reject when the shift is the substitute's own regular duty", () => {
    expect(
      determineSubstituteAllowanceEligibility({
        targetWorkType: "ROTATING",
        substituteWorkType: "ROTATING",
        isAdditionalWork: false
      })
    ).toEqual({ eligible: false, reasonCode: "NOT_ADDITIONAL_WORK" });
  });

  it("should honour an explicit manual exclusion before every other rule", () => {
    expect(
      determineSubstituteAllowanceEligibility({
        targetWorkType: "ROTATING",
        substituteWorkType: "ROTATING",
        isAdditionalWork: true,
        manualExclusion: true
      })
    ).toEqual({ eligible: false, reasonCode: "MANUAL_EXCLUSION" });
  });

  it("should apply new exclusions only from the configured effective date", () => {
    expect(
      isNewPolicyApplicable({ workDate: "2026-08-01", policyEffectiveFrom: "2026-08-01" })
    ).toBe(true);
    expect(
      isNewPolicyApplicable({ workDate: "2026-07-31", policyEffectiveFrom: "2026-08-01" })
    ).toBe(false);
    expect(isNewPolicyApplicable({ workDate: "2026-08-01" })).toBe(false);
    expect(isNewPolicyApplicable({ workDate: "2026-08-01", policyEffectiveFrom: "  " })).toBe(false);
  });

  it("should keep pre-effective-date exclusions payable and never touch the pool rule", () => {
    const beforePolicy = resolveSubstituteAllowanceDecision({
      targetWorkType: "ROTATING",
      substituteWorkType: "FIXED_DAY",
      isAdditionalWork: true,
      workDate: "2026-07-31",
      policyEffectiveFrom: "2026-08-01"
    });
    const afterPolicy = resolveSubstituteAllowanceDecision({
      targetWorkType: "ROTATING",
      substituteWorkType: "FIXED_DAY",
      isAdditionalWork: true,
      workDate: "2026-08-01",
      policyEffectiveFrom: "2026-08-01"
    });
    const nonRotatingTargetBeforePolicy = resolveSubstituteAllowanceDecision({
      targetWorkType: "FIXED_DAY",
      substituteWorkType: "ROTATING",
      isAdditionalWork: true,
      workDate: "2026-07-31",
      policyEffectiveFrom: "2026-08-01"
    });
    const manualExclusionWithoutPolicyDate = resolveSubstituteAllowanceDecision({
      targetWorkType: "ROTATING",
      substituteWorkType: "ROTATING",
      isAdditionalWork: true,
      manualExclusion: true,
      workDate: "2026-07-31"
    });

    expect(nonRotatingTargetBeforePolicy.eligible).toBe(true);
    expect(manualExclusionWithoutPolicyDate.eligible).toBe(false);
    expect(manualExclusionWithoutPolicyDate.reasonCode).toBe("MANUAL_EXCLUSION");
    const poolBeforePolicy = resolveSubstituteAllowanceDecision({
      targetWorkType: "ROTATING",
      substituteWorkType: "POOL",
      isAdditionalWork: true,
      workDate: "2020-01-01"
    });

    expect(beforePolicy.eligible).toBe(true);
    expect(beforePolicy.reasonCode).toBe("ROTATING_SUBSTITUTE_ELIGIBLE");
    expect(afterPolicy.eligible).toBe(false);
    expect(afterPolicy.reasonCode).toBe("FIXED_DAY_SUBSTITUTE_EXCLUDED");
    expect(afterPolicy.reasonLabel).toBe("주간고정조는 교대조 대체근무수당 지급 대상이 아닙니다.");
    expect(afterPolicy.policyVersion).toBe(SUBSTITUTE_ALLOWANCE_POLICY_VERSION);
    expect(poolBeforePolicy.eligible).toBe(false);
    expect(poolBeforePolicy.reasonCode).toBe("POOL_SUBSTITUTE_EXCLUDED");
  });
});
