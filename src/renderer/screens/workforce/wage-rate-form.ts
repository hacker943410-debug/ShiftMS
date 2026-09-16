import type { EmployeeRecord, WageRateRecord } from "../../../shared/domain/model";

export type WageRateFormMode = "create" | "correct";

export interface WageRateFormState {
  mode: WageRateFormMode;
  targetWageRateId?: string;
  hourlyRate: string;
  effectiveFrom: string;
  reason: string;
}

export const createInitialWageRateFormState = (
  employee?: EmployeeRecord | null
): WageRateFormState => ({
  mode: "create",
  targetWageRateId: undefined,
  hourlyRate:
    typeof employee?.currentHourlyRate === "number" ? String(employee.currentHourlyRate) : "",
  effectiveFrom: "",
  reason: ""
});

export const createWageRateCorrectionFormState = (
  rate: WageRateRecord
): WageRateFormState => ({
  mode: "correct",
  targetWageRateId: rate.id,
  hourlyRate: String(rate.hourlyRate),
  effectiveFrom: rate.effectiveFrom,
  reason: rate.reason ?? ""
});

export const isWageRateFormCorrection = (state: WageRateFormState): boolean =>
  state.mode === "correct";
