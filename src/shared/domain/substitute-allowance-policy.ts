import type { TeamWorkType } from "./team-work-type";

// 대체근무수당 지급 여부 판정. 조 이름이 아니라 조의 근무유형(POOL/FIXED_DAY/ROTATING)으로만 판단한다.
// Pool 제외는 기존 규칙 그대로이고, 주간고정조 제외는 적용 시작일 이후 발생분에만 적용한다(forward-only).

export type SubstituteAllowanceReasonCode =
  | "POOL_SUBSTITUTE_EXCLUDED"
  | "FIXED_DAY_SUBSTITUTE_EXCLUDED"
  | "ROTATING_SUBSTITUTE_ELIGIBLE"
  | "NOT_ADDITIONAL_WORK"
  | "TARGET_IS_NOT_ROTATING_SHIFT"
  | "MANUAL_EXCLUSION"
  | "NO_ALLOWANCE_POLICY";

export interface SubstituteAllowanceEligibility {
  eligible: boolean;
  reasonCode: SubstituteAllowanceReasonCode;
}

// 판정 당시 어떤 정책이 적용됐는지 기록하기 위한 값. 규칙이 바뀌면 이 값을 올린다.
export const SUBSTITUTE_ALLOWANCE_POLICY_VERSION = "2026-07-team-work-type";

export const substituteAllowanceReasonLabels: Record<SubstituteAllowanceReasonCode, string> = {
  POOL_SUBSTITUTE_EXCLUDED: "Pool은 교대조 대체근무수당 지급 대상이 아닙니다.",
  FIXED_DAY_SUBSTITUTE_EXCLUDED: "주간고정조는 교대조 대체근무수당 지급 대상이 아닙니다.",
  ROTATING_SUBSTITUTE_ELIGIBLE: "교대조 간 대체근무로 기존 지급 규칙을 적용합니다.",
  NOT_ADDITIONAL_WORK: "본인의 정규근무라 추가근무가 아닙니다.",
  TARGET_IS_NOT_ROTATING_SHIFT: "대체 대상 근무가 교대조 근무가 아닙니다.",
  MANUAL_EXCLUSION: "관리자가 지급 대상에서 제외했습니다.",
  NO_ALLOWANCE_POLICY: "적용할 수당 정책이 없습니다."
};

export const getSubstituteAllowanceReasonLabel = (reasonCode: SubstituteAllowanceReasonCode) =>
  substituteAllowanceReasonLabels[reasonCode];

export interface SubstituteAllowanceEligibilityInput {
  // 대체 대상(원 근무자)의 근무유형
  targetWorkType: TeamWorkType;
  // 실제로 대체 투입된 사람의 근무유형
  substituteWorkType: TeamWorkType;
  // 본인의 원래 근무가 아니라 추가로 들어간 근무인지
  isAdditionalWork: boolean;
  // 관리자가 명시적으로 제외한 경우(기본은 사용하지 않음)
  manualExclusion?: boolean;
}

export const determineSubstituteAllowanceEligibility = (
  params: SubstituteAllowanceEligibilityInput
): SubstituteAllowanceEligibility => {
  if (params.manualExclusion === true) {
    return { eligible: false, reasonCode: "MANUAL_EXCLUSION" };
  }

  if (params.targetWorkType !== "ROTATING") {
    return { eligible: false, reasonCode: "TARGET_IS_NOT_ROTATING_SHIFT" };
  }

  if (!params.isAdditionalWork) {
    return { eligible: false, reasonCode: "NOT_ADDITIONAL_WORK" };
  }

  if (params.substituteWorkType === "POOL") {
    return { eligible: false, reasonCode: "POOL_SUBSTITUTE_EXCLUDED" };
  }

  if (params.substituteWorkType === "FIXED_DAY") {
    return { eligible: false, reasonCode: "FIXED_DAY_SUBSTITUTE_EXCLUDED" };
  }

  if (params.substituteWorkType === "ROTATING") {
    return { eligible: true, reasonCode: "ROTATING_SUBSTITUTE_ELIGIBLE" };
  }

  return { eligible: false, reasonCode: "NO_ALLOWANCE_POLICY" };
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 주간고정조 제외 규칙에만 적용되는 시작일 판정. 시작일이 설정돼 있지 않으면 새 규칙을 적용하지 않는다.
export const isFixedDayExclusionApplicable = (input: {
  workDate: string;
  policyEffectiveFrom?: string;
}) => {
  const effectiveFrom = input.policyEffectiveFrom?.trim() ?? "";

  if (!DATE_PATTERN.test(effectiveFrom) || !DATE_PATTERN.test(input.workDate)) {
    return false;
  }

  return input.workDate >= effectiveFrom;
};

export interface SubstituteAllowanceDecision extends SubstituteAllowanceEligibility {
  policyVersion: string;
  targetWorkType: TeamWorkType;
  substituteWorkType: TeamWorkType;
  reasonLabel: string;
}

// 실제 판정 진입점. Pool 제외는 날짜와 무관하게 기존대로 적용되고,
// 주간고정조 제외는 적용 시작일 이후 근무일에만 적용된다(그 전에는 기존 지급 규칙 유지).
export const resolveSubstituteAllowanceDecision = (
  input: SubstituteAllowanceEligibilityInput & {
    workDate: string;
    fixedDayPolicyEffectiveFrom?: string;
  }
): SubstituteAllowanceDecision => {
  const baseDecision = determineSubstituteAllowanceEligibility(input);
  const shouldDowngradeFixedDay =
    baseDecision.reasonCode === "FIXED_DAY_SUBSTITUTE_EXCLUDED" &&
    !isFixedDayExclusionApplicable({
      workDate: input.workDate,
      policyEffectiveFrom: input.fixedDayPolicyEffectiveFrom
    });
  const decision: SubstituteAllowanceEligibility = shouldDowngradeFixedDay
    ? { eligible: true, reasonCode: "ROTATING_SUBSTITUTE_ELIGIBLE" }
    : baseDecision;

  return {
    ...decision,
    policyVersion: SUBSTITUTE_ALLOWANCE_POLICY_VERSION,
    reasonLabel: substituteAllowanceReasonLabels[decision.reasonCode],
    substituteWorkType: input.substituteWorkType,
    targetWorkType: input.targetWorkType
  };
};
