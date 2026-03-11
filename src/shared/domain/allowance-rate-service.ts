import type { AllowanceRateVersion } from "./model";

const isDateInRange = (
  targetDate: string,
  effectiveFrom: string,
  effectiveTo?: string
) => {
  if (targetDate < effectiveFrom) {
    return false;
  }

  if (effectiveTo && targetDate > effectiveTo) {
    return false;
  }

  return true;
};

export const selectActiveAllowanceRateVersion = (input: {
  targetDate: string;
  versions: AllowanceRateVersion[];
}) => {
  const candidates = input.versions
    .filter((version) => version.status === "active")
    .filter((version) =>
      isDateInRange(input.targetDate, version.effectiveFrom, version.effectiveTo)
    )
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));

  return candidates[0] ?? null;
};
