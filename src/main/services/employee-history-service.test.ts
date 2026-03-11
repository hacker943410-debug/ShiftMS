import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStoredEmployees, resetEmployeeStorageForTest } from "./employee-storage-service";
import {
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates
} from "./employee-history-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

describe("employee-history-service", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should list wage rate history for a seeded employee", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(wageRates).toHaveLength(1);
    expect(wageRates[0]?.employeeCode).toBe("EMP-001");
    expect(wageRates[0]?.employeeName).toBe("김현우");
    expect(wageRates[0]?.hourlyRate).toBe(12800);
    expect(wageRates[0]?.reason).toBe("초기 시드");
  });

  it("should list assignment history for a seeded employee", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const assignments = listStoredEmployeeAssignments(employee!.id);

    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.employeeCode).toBe("EMP-001");
    expect(assignments[0]?.employeeName).toBe("김현우");
    expect(assignments[0]?.siteName).toBe("보라매DC");
    expect(assignments[0]?.shiftGroup).toBe("A조");
    expect(assignments[0]?.status).toBe("active");
  });
});
