const importedEmploymentTypeKeys = [
  "고용형태",
  "고용형태명",
  "고용구분",
  "고용구분명",
  "직원구분",
  "직원구분명",
  "사원구분",
  "사원구분명",
  "근로형태",
  "근로형태명"
] as const;

export const normalizeEmploymentTypeLabel = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return "미분류";
  }

  if (normalized.includes("정규")) {
    return "정규";
  }

  if (normalized.includes("계약")) {
    return "계약";
  }

  if (normalized.includes("파견") || normalized.includes("용역")) {
    return "파견";
  }

  return normalized;
};

export const resolveImportedEmploymentType = (row: Record<string, unknown>) => {
  for (const key of importedEmploymentTypeKeys) {
    const value = row[key];

    if (value === undefined || value === null) {
      continue;
    }

    const normalized = String(value).trim();

    if (normalized) {
      return normalizeEmploymentTypeLabel(normalized);
    }
  }

  return "미분류";
};
