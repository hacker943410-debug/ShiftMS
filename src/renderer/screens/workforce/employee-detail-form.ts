import type { EmployeeRecord } from "../../../shared/domain/model";
import { resolveWorkforceEmploymentTypeFormValue } from "./workforce-employment-type-options";

// The 기본 정보 수정 card on the employee detail screen: six fields the operator edits and saves
// together. Kept apart from the screen so the one rule that matters - WHEN the form is reset from
// the stored record - can be tested without rendering the screen.
export interface EmployeeDetailFormState {
  employmentType: string;
  rank: string;
  contact: string;
  status: EmployeeRecord["status"];
  hireDate: string;
  retireDate: string;
}

export const initialEmployeeDetailFormState: EmployeeDetailFormState = {
  employmentType: "정규",
  rank: "",
  contact: "",
  status: "active",
  hireDate: "",
  retireDate: ""
};

export const createEmployeeDetailFormState = (
  employee: EmployeeRecord | null
): EmployeeDetailFormState =>
  employee
    ? {
        employmentType: resolveWorkforceEmploymentTypeFormValue(employee.employmentType),
        rank: employee.rank ?? "",
        contact: employee.contact ?? "",
        status: employee.status,
        hireDate: employee.hireDate ?? "",
        retireDate: employee.retireDate ?? ""
      }
    : initialEmployeeDetailFormState;

// The form is reset from the stored record only when the stored values it mirrors change. The list
// is reloaded after a wage save, an assignment close or a bulk update, and hands back a NEW employee
// object with the SAME basics; resetting on the object wiped whatever the operator had typed in the
// meantime - the same defect the wage form had until R8. This key is what the reset depends on.
export const describeEmployeeDetailFormSource = (employee: EmployeeRecord | null): string | null =>
  employee ? JSON.stringify(createEmployeeDetailFormState(employee)) : null;

export const describeEmployeeDetailHireDateError = (
  storedEmployee: Pick<EmployeeRecord, "hireDate">,
  draftHireDate: string | null | undefined
): string | null => {
  const trimmedDraft = draftHireDate?.trim() ?? "";
  if (trimmedDraft.length > 0) {
    return null;
  }
  const hasStoredHireDate = Boolean(
    storedEmployee.hireDate && storedEmployee.hireDate.trim().length > 0
  );
  if (hasStoredHireDate) {
    return "입사일을 입력해야 합니다.";
  }
  return null;
};
