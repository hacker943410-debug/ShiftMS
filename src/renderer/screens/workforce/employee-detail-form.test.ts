import { describe, expect, it } from "vitest";

import type { EmployeeRecord } from "../../../shared/domain/model";
import {
  createEmployeeDetailFormState,
  describeEmployeeDetailFormSource,
  initialEmployeeDetailFormState
} from "./employee-detail-form";

const employee = (overrides: Partial<EmployeeRecord> = {}): EmployeeRecord =>
  ({
    id: "employee-1",
    employeeCode: "EMP-001",
    name: "김현우",
    employmentType: "정규",
    status: "active",
    hireDate: "2023-03-01",
    currentHourlyRate: 12800,
    createdAt: "2023-03-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides
  }) as EmployeeRecord;

describe("employee-detail-form", () => {
  it("maps the stored record into the form, blank where nothing is stored", () => {
    expect(createEmployeeDetailFormState(employee())).toEqual({
      employmentType: "정규",
      rank: "",
      contact: "",
      status: "active",
      hireDate: "2023-03-01",
      retireDate: ""
    });
    expect(
      createEmployeeDetailFormState(
        employee({ rank: "대리", contact: "010-1234-5678", status: "retired", retireDate: "2026-08-31" })
      )
    ).toMatchObject({ rank: "대리", contact: "010-1234-5678", status: "retired", retireDate: "2026-08-31" });
    expect(createEmployeeDetailFormState(null)).toEqual(initialEmployeeDetailFormState);
  });

  // R14 self-check: a wage save, an assignment close or a bulk update reloads the list and hands
  // back a new object with the same basics. The reset key must not move for that, or the operator's
  // half-typed contact is wiped by an unrelated save.
  it("keeps the same reset key when only the wage, the list order or the timestamps changed", () => {
    const before = describeEmployeeDetailFormSource(employee());
    const afterWageSave = describeEmployeeDetailFormSource(
      employee({ currentHourlyRate: 14500, updatedAt: "2026-09-05T09:00:00.000Z" })
    );
    const afterAssignmentClose = describeEmployeeDetailFormSource(
      employee({ currentSiteId: undefined, currentSiteName: undefined, currentAssignmentEndDate: "2026-09-05" })
    );

    expect(afterWageSave).toBe(before);
    expect(afterAssignmentClose).toBe(before);
  });

  it("moves the reset key when a field the form mirrors changes", () => {
    const before = describeEmployeeDetailFormSource(employee());

    expect(describeEmployeeDetailFormSource(employee({ contact: "010-0000-0000" }))).not.toBe(before);
    expect(describeEmployeeDetailFormSource(employee({ hireDate: "2023-04-01" }))).not.toBe(before);
    expect(
      describeEmployeeDetailFormSource(employee({ status: "retired", retireDate: "2026-08-31" }))
    ).not.toBe(before);
    expect(describeEmployeeDetailFormSource(employee({ rank: "과장" }))).not.toBe(before);
    expect(describeEmployeeDetailFormSource(employee({ employmentType: "계약" }))).not.toBe(before);
    expect(describeEmployeeDetailFormSource(null)).toBeNull();
  });
});
