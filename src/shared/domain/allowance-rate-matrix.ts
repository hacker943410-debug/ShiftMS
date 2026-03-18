import type { AllowanceRateItem, AllowanceRateVersion, WorkType } from "./model";

export type AllowanceRateCategoryCode =
  | "legal-holiday"
  | "weekday-substitute"
  | "holiday-substitute"
  | "weekday-overtime"
  | "holiday-overtime";

export type AllowanceRateAxis = "base" | "overtime" | "night";

export type AllowanceSummaryCategory = "legalHoliday" | "substitute" | "overtime";

export type AllowanceRateMatrix = Record<
  AllowanceRateCategoryCode,
  Record<AllowanceRateAxis, number>
>;

export const allowanceRateCategoryOrder: AllowanceRateCategoryCode[] = [
  "legal-holiday",
  "weekday-substitute",
  "holiday-substitute",
  "weekday-overtime",
  "holiday-overtime"
];

export const allowanceRateAxisOrder: AllowanceRateAxis[] = ["base", "overtime", "night"];

export const allowanceRateCategoryLabels: Record<AllowanceRateCategoryCode, string> = {
  "legal-holiday": "법정공휴일",
  "weekday-substitute": "평_대체근로수당",
  "holiday-substitute": "휴_대체근로수당",
  "weekday-overtime": "평_연장근로수당",
  "holiday-overtime": "휴_연장근로수당"
};

export const allowanceRateAxisLabels: Record<AllowanceRateAxis, string> = {
  base: "기본",
  overtime: "연장",
  night: "야간"
};

export const allowanceRateDefaultMatrix: AllowanceRateMatrix = {
  "legal-holiday": {
    base: 1.5,
    overtime: 1.5,
    night: 1.5
  },
  "weekday-substitute": {
    base: 1.5,
    overtime: 2,
    night: 2.5
  },
  "holiday-substitute": {
    base: 1.5,
    overtime: 2,
    night: 2.5
  },
  "weekday-overtime": {
    base: 0,
    overtime: 1.5,
    night: 2
  },
  "holiday-overtime": {
    base: 0,
    overtime: 0,
    night: 0
  }
};

const normalizeCategoryText = (value?: string) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

export const getAllowanceRateEntryCode = (
  categoryCode: AllowanceRateCategoryCode,
  axis: AllowanceRateAxis
) => `${categoryCode}:${axis}`;

export const resolveAllowanceRateCategoryLabel = (categoryCode: AllowanceRateCategoryCode) =>
  allowanceRateCategoryLabels[categoryCode];

export const resolveAllowanceSummaryCategory = (
  categoryCode: AllowanceRateCategoryCode
): AllowanceSummaryCategory => {
  if (categoryCode === "legal-holiday") {
    return "legalHoliday";
  }

  if (categoryCode === "weekday-substitute" || categoryCode === "holiday-substitute") {
    return "substitute";
  }

  return "overtime";
};

export const buildAllowanceRateTable = (
  version?: AllowanceRateVersion | null
): AllowanceRateMatrix => {
  const getLegacyMultiplier = (
    categoryCode: AllowanceRateCategoryCode,
    axis: AllowanceRateAxis
  ) => {
    if (!version) {
      return null;
    }

    const readLegacy = (allowanceCode: string) =>
      version.items.find((item) => item.allowanceCode === allowanceCode)?.multiplier;

    if (categoryCode === "legal-holiday") {
      return readLegacy("holiday");
    }

    if (categoryCode === "weekday-substitute" || categoryCode === "holiday-substitute") {
      if (axis === "base") {
        return readLegacy("substitute");
      }

      return readLegacy(axis) ?? readLegacy("substitute");
    }

    if (axis === "base") {
      return readLegacy("base");
    }

    return readLegacy(axis);
  };

  return Object.fromEntries(
    allowanceRateCategoryOrder.map((categoryCode) => [
      categoryCode,
      Object.fromEntries(
        allowanceRateAxisOrder.map((axis) => [
          axis,
          version?.items.find(
            (item) => item.allowanceCode === getAllowanceRateEntryCode(categoryCode, axis)
          )?.multiplier ??
            getLegacyMultiplier(categoryCode, axis) ??
            allowanceRateDefaultMatrix[categoryCode][axis]
        ])
      )
    ])
  ) as AllowanceRateMatrix;
};

export const createAllowanceRateItems = (
  versionId: string,
  matrix: Partial<AllowanceRateMatrix> = {}
): AllowanceRateItem[] =>
  allowanceRateCategoryOrder.flatMap((categoryCode) =>
    allowanceRateAxisOrder.map((axis) => ({
      id: `rate-item-${versionId}-${categoryCode}-${axis}`,
      allowanceCode: getAllowanceRateEntryCode(categoryCode, axis),
      multiplier: matrix[categoryCode]?.[axis] ?? allowanceRateDefaultMatrix[categoryCode][axis],
      roundingPolicy: "round-half-up"
    }))
  );

export const resolveAllowanceRateCategoryCode = (input: {
  rawCategory?: string;
  isHoliday?: boolean;
  workType?: WorkType;
}): AllowanceRateCategoryCode => {
  const normalizedCategory = normalizeCategoryText(input.rawCategory);

  if (normalizedCategory.includes("휴_대체")) {
    return "holiday-substitute";
  }

  if (normalizedCategory.includes("평_대체") || normalizedCategory.includes("대체")) {
    return input.isHoliday ? "holiday-substitute" : "weekday-substitute";
  }

  if (normalizedCategory.includes("휴_연장")) {
    return "holiday-overtime";
  }

  if (normalizedCategory.includes("평_연장") || normalizedCategory.includes("연장")) {
    return input.isHoliday ? "holiday-overtime" : "weekday-overtime";
  }

  if (
    normalizedCategory.includes("법정공휴일") ||
    normalizedCategory.includes("법정휴일") ||
    normalizedCategory.includes("공휴일") ||
    normalizedCategory.includes("휴일근로") ||
    normalizedCategory.includes("휴일")
  ) {
    return "legal-holiday";
  }

  if (input.workType === "substitute") {
    return input.isHoliday ? "holiday-substitute" : "weekday-substitute";
  }

  if (input.workType === "holiday") {
    return "legal-holiday";
  }

  if (input.isHoliday) {
    return "legal-holiday";
  }

  return "weekday-overtime";
};
