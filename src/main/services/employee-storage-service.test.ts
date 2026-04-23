import path from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { deleteStoredSite, listStoredSites } from "./site-storage-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import {
  deleteStoredEmployee,
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
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite?.id,
      shiftGroup: "A",
      hourlyRate: 15600
    });

    expect(saved.employeeCode).toBe("EMP-100");
    expect(saved.employmentType).toBe("정규");
    expect(saved.currentSiteName).toBe("동탄센터");
    expect(saved.currentShiftGroup).toBe("A조");
    expect(saved.currentAssignmentStartDate).toBe("2026-03-01");
    expect(saved.currentHourlyRate).toBe(15600);
    expect(listStoredEmployees().some((employee) => employee.employeeCode === "EMP-100")).toBe(true);
  });

  it("should keep a newly created employee unassigned when no site is selected", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const saved = saveStoredEmployee({
      employeeCode: "EMP-101",
      name: "무배정 직원",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-04-01",
      hourlyRate: 14000
    });

    expect(saved.currentSiteId).toBeUndefined();
    expect(saved.currentSiteName).toBeUndefined();
    expect(saved.currentShiftGroup).toBeUndefined();
    expect(saved.currentAssignmentStartDate).toBeUndefined();
  });

  it("should keep a newly created employee unassigned when only the site is selected", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");

    expect(targetSite).toBeDefined();

    const saved = saveStoredEmployee({
      employeeCode: "EMP-102",
      name: "근무조 미지정 직원",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-04-01",
      siteId: targetSite?.id,
      hourlyRate: 15000
    });

    expect(saved.currentSiteId).toBeUndefined();
    expect(saved.currentSiteName).toBeUndefined();
    expect(saved.currentShiftGroup).toBeUndefined();
    expect(saved.currentAssignmentStartDate).toBeUndefined();
  });

  it("should reject duplicate employee codes", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    expect(() =>
      saveStoredEmployee({
        employeeCode: "EMP-001",
        name: "중복 직원",
        employmentType: "정규직",
        status: "active",
        hireDate: "2026-04-01"
      })
    ).toThrow("이미 사용 중인 사원번호입니다.");
  });

  it("should list only the latest active assignment for each employee", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const database = getSqliteDatabase()!;
    const employee = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");
    const site = listStoredSites().find((item) => item.name === "동탄센터");

    expect(employee).toBeDefined();
    expect(site).toBeDefined();

    database.prepare(`
      INSERT INTO employee_site_assignments (
        id,
        employee_id,
        site_id,
        team_name,
        shift_group,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      employee!.id,
      site!.id,
      "B조",
      "B조",
      "2026-04-01",
      null,
      "active",
      "2026-04-01T00:00:00.000Z"
    );

    const records = listStoredEmployees().filter((item) => item.employeeCode === "EMP-001");

    expect(records).toHaveLength(1);
    expect(records[0]?.currentSiteName).toBe("동탄센터");
    expect(records[0]?.currentShiftGroup).toBe("B조");
    expect(records[0]?.currentAssignmentStartDate).toBe("2026-04-01");
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

  it("should delete a retired employee after the retirement date", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const retiredEmployee = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-023");

    expect(retiredEmployee).toBeDefined();

    const deleted = deleteStoredEmployee(retiredEmployee!.id);

    expect(deleted.employeeCode).toBe("EMP-023");
    expect(listStoredEmployees().some((employee) => employee.id === retiredEmployee!.id)).toBe(false);

    const database = getSqliteDatabase()!;
    const assignmentCount = database
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM employee_site_assignments
          WHERE employee_id = ?
        `
      )
      .get(retiredEmployee!.id) as { count: number };
    const wageRateCount = database
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM wage_rates
          WHERE employee_id = ?
        `
      )
      .get(retiredEmployee!.id) as { count: number };

    expect(assignmentCount.count).toBe(0);
    expect(wageRateCount.count).toBe(0);
  });

  it("should reject deleting employees who are not fully retired yet", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const activeEmployee = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-001");

    expect(activeEmployee).toBeDefined();
    expect(() => deleteStoredEmployee(activeEmployee!.id)).toThrow(
      "퇴사 처리된 인력만 삭제할 수 있습니다."
    );
  });
});
