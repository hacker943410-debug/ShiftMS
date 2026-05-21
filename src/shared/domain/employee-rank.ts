export const employeeRankOptions = ["사원", "대리", "과장", "차장", "부장"] as const;

export type EmployeeRank = (typeof employeeRankOptions)[number];

export const isEmployeeRank = (value: string | null | undefined): value is EmployeeRank =>
  employeeRankOptions.includes((value?.trim() ?? "") as EmployeeRank);

export const normalizeEmployeeRank = (value: string | null | undefined): EmployeeRank | undefined => {
  const normalized = value?.trim() ?? "";

  return isEmployeeRank(normalized) ? normalized : undefined;
};

export const formatEmployeeRank = (value: string | null | undefined) =>
  normalizeEmployeeRank(value) ?? "-";
