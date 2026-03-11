import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  listStoredEmployees,
  resetEmployeeStorageForTest,
  saveStoredEmployee
} from "./employee-storage-service";

describe("employee-storage-service", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should seed and list default employees", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const employees = listStoredEmployees();

    expect(employees.length).toBeGreaterThanOrEqual(3);
    expect(employees.some((employee) => employee.name === "김현우")).toBe(true);
  });

  it("should insert a new employee record", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const saved = saveStoredEmployee({
      employeeCode: "EMP-100",
      name: "최민아",
      employmentType: "정규",
      status: "active",
      hireDate: "2026-03-01"
    });

    expect(saved.employeeCode).toBe("EMP-100");
    expect(listStoredEmployees().some((employee) => employee.employeeCode === "EMP-100")).toBe(
      true
    );
  });

  it("should filter employees by keyword and status", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const employees = listStoredEmployees({
      keyword: "김",
      status: "active"
    });

    expect(employees).toHaveLength(1);
    expect(employees[0]?.name).toBe("김현우");
  });
});
