export const workforceEmploymentTypeOptions = ["정규", "계약", "파견", "BP"] as const;

export type WorkforceEmploymentTypeOption = (typeof workforceEmploymentTypeOptions)[number];

export const isWorkforceEmploymentTypeOption = (
  value: string | null | undefined
): value is WorkforceEmploymentTypeOption =>
  workforceEmploymentTypeOptions.includes(
    (value?.trim() ?? "") as WorkforceEmploymentTypeOption
  );

export const resolveWorkforceEmploymentTypeFormValue = (
  value: string | null | undefined
): WorkforceEmploymentTypeOption => {
  const normalized = value?.trim() ?? "";

  return isWorkforceEmploymentTypeOption(normalized) ? normalized : "정규";
};
