import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { deleteStoredSite, listStoredSites } from "./site-storage-service";
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
    const kim = employees.find((employee) => employee.employeeCode === "EMP-001");

    expect(employees.length).toBeGreaterThanOrEqual(3);
    expect(employees.some((employee) => employee.name === "김현우")).toBe(true);
    expect(kim?.currentSiteName).toBe("보라매DC");
    expect(kim?.currentShiftGroup).toBe("A조");
    expect(kim?.currentAssignmentStartDate).toBe("2023-03-01");
    expect(kim?.currentHourlyRate).toBe(12800);
  });

  it("should insert a new employee record with assignment and wage rate", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");
    expect(targetSite).toBeDefined();

    const saved = saveStoredEmployee({
      employeeCode: "EMP-100",
      name: "최민아",
      employmentType: "정규",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite?.id,
      shiftGroup: "주간조",
      hourlyRate: 15600
    });

    expect(saved.employeeCode).toBe("EMP-100");
    expect(saved.currentSiteName).toBe("동탄센터");
    expect(saved.currentShiftGroup).toBe("주간조");
    expect(saved.currentAssignmentStartDate).toBe("2026-03-01");
    expect(saved.currentHourlyRate).toBe(15600);
    expect(listStoredEmployees().some((employee) => employee.employeeCode === "EMP-100")).toBe(true);
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

  it("should preserve employee current site name after the site is removed from visible lists", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const targetSite = listStoredSites().find((site) => site.name === "보라매DC");

    expect(targetSite).toBeDefined();

    deleteStoredSite(targetSite!.id);

    const kim = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-001");

    expect(kim?.currentSiteName).toBe("보라매DC");
    expect(listStoredSites().some((site) => site.id === targetSite!.id)).toBe(false);
  });
});
