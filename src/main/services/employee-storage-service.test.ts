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
import { listStoredEmployeeWageRates, saveStoredEmployeeWageRate } from "./employee-history-service";
import { acknowledgeReparseMarker, peekReparseMarker } from "./app-settings-storage-service";
import type { EmployeeRank } from "../../shared/domain/employee-rank";

// Reads the marker the way a full-period overview does: peek, then acknowledge the token read.
const spendMasterMarker = () => {
  const token = peekReparseMarker("employee-master");

  if (token) {
    acknowledgeReparseMarker("employee-master", token);
  }

  return Boolean(token);
};

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
    expect(kim?.rank).toBe("사원");
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
      contact: "010-5555-1000",
      rank: "대리",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite?.id,
      shiftGroup: "A",
      hourlyRate: 15600
    });

    expect(saved.employeeCode).toBe("EMP-100");
    expect(saved.contact).toBe("010-5555-1000");
    expect(saved.rank).toBe("대리");
    expect(saved.employmentType).toBe("정규");
    expect(saved.currentSiteName).toBe("동탄센터");
    expect(saved.currentShiftGroup).toBe("A조");
    expect(saved.currentAssignmentStartDate).toBe("2026-03-01");
    expect(saved.currentHourlyRate).toBe(15600);
    expect(listStoredEmployees().some((employee) => employee.employeeCode === "EMP-100")).toBe(true);
  });

  it("registers the first wage line from the hire date through the same rule as the wage screen", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const saved = saveStoredEmployee({
      employeeCode: "EMP-101",
      name: "한지원",
      contact: "010-0000-0101",
      rank: "사원",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-02-01",
      hourlyRate: 14000
    });
    const rates = listStoredEmployeeWageRates(saved.id);

    expect(rates).toHaveLength(1);
    expect(rates[0]?.effectiveFrom).toBe("2026-02-01");
    expect(rates[0]?.effectiveTo).toBeUndefined();
    expect(rates[0]?.reason).toBe("직원 등록/수정");
    expect(saved.currentHourlyRate).toBe(14000);
  });

  // T-12: the hire date could only be set once, at registration, and a typo stayed for ever.
  it("updates the hire date of an existing employee and rejects a retire date before it", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const created = saveStoredEmployee({
      employeeCode: "EMP-102",
      name: "서도윤",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01"
    });
    const corrected = saveStoredEmployee({
      id: created.id,
      employeeCode: "EMP-102",
      name: "서도윤",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-02-15"
    });

    expect(corrected.hireDate).toBe("2026-02-15");
    expect(() =>
      saveStoredEmployee({
        id: created.id,
        employeeCode: "EMP-102",
        name: "서도윤",
        employmentType: "정규직",
        status: "retired",
        hireDate: "2026-02-15",
        retireDate: "2026-02-01"
      })
    ).toThrowError("퇴사 처리일은 입사일보다 빠를 수 없습니다.");
    expect(() =>
      saveStoredEmployee({
        id: created.id,
        employeeCode: "EMP-102",
        name: "서도윤",
        employmentType: "정규직",
        status: "active",
        hireDate: "2026-2-15"
      })
    ).toThrowError("입사일 형식이 올바르지 않습니다.");
  });

  it("rejects hire and retire dates that are not real dates or fall outside the allowed range", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const base = {
      employeeCode: "EMP-103",
      name: "강하늘",
      employmentType: "정규직",
      status: "active" as const
    };

    expect(() => saveStoredEmployee({ ...base, hireDate: "2026-02-30" })).toThrowError(
      "입사일 형식이 올바르지 않습니다."
    );
    expect(() => saveStoredEmployee({ ...base, hireDate: "1989-12-31" })).toThrowError(
      "입사일은 1990-01-01 이후여야 합니다."
    );
    expect(() => saveStoredEmployee({ ...base, hireDate: "2999-01-01" })).toThrowError(
      "입사일은 오늘 이후 날짜로 넣을 수 없습니다."
    );
    expect(() =>
      saveStoredEmployee({ ...base, hireDate: "2026-03-01", status: "retired", retireDate: "2026-13-01" })
    ).toThrowError("퇴사 처리일 형식이 올바르지 않습니다.");
    expect(listStoredEmployees().some((employee) => employee.employeeCode === "EMP-103")).toBe(false);
  });

  // T-12 / R10 #2: the parser finds a person by code or name, judges them by the dates and stamps
  // their rank on the row, so a new person or any of those fields changing must make the next
  // overview read the pending files again. A contact or a status alone must not. (The rank is
  // covered on its own below, in "...for a changed rank"; this test never sets one.)
  it("leaves the employee master reparse marker for a new person and for a changed key field only", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    spendMasterMarker();

    const base = { employmentType: "정규직", status: "active" as const, hireDate: "2026-03-01" };
    const created = saveStoredEmployee({ ...base, employeeCode: "EMP-104", name: "문지호" });

    // A new person is a new candidate for every name already parsed as unknown.
    expect(spendMasterMarker()).toBe(true);

    saveStoredEmployee({
      ...base,
      id: created.id,
      employeeCode: "EMP-104",
      name: "문지호",
      contact: "010-0000-0104"
    });
    expect(spendMasterMarker()).toBe(false);

    saveStoredEmployee({ ...base, id: created.id, employeeCode: "EMP-104", name: "문지호", status: "leave" });
    expect(spendMasterMarker()).toBe(false);

    saveStoredEmployee({ ...base, id: created.id, employeeCode: "EMP-104", name: "문지호", hireDate: "2026-02-15" });
    expect(spendMasterMarker()).toBe(true);
    expect(spendMasterMarker()).toBe(false);

    saveStoredEmployee({ ...base, id: created.id, employeeCode: "EMP-104", name: "문지훈", hireDate: "2026-02-15" });
    expect(spendMasterMarker()).toBe(true);

    saveStoredEmployee({ ...base, id: created.id, employeeCode: "EMP-104-B", name: "문지훈", hireDate: "2026-02-15" });
    expect(spendMasterMarker()).toBe(true);

    saveStoredEmployee({
      ...base,
      id: created.id,
      employeeCode: "EMP-104-B",
      name: "문지훈",
      status: "retired",
      hireDate: "2026-02-15",
      retireDate: "2026-08-31"
    });
    expect(spendMasterMarker()).toBe(true);
  });

  // The rank is a parser input, not just an employee-screen field: the parser stamps it on the
  // pending row and, once approved, it is the 직급 별첨1 prints. Correcting a rank after the file
  // was parsed therefore has to re-read that file. The comparison runs on the NORMALIZED rank on
  // both sides, because that is the only rank the parser ever sees.
  it("leaves the employee master reparse marker for a changed rank, comparing the rank the parser sees", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    spendMasterMarker();

    const base = {
      employeeCode: "EMP-104-R",
      name: "우도현",
      employmentType: "정규직",
      status: "active" as const,
      hireDate: "2026-03-01"
    };
    const created = saveStoredEmployee({ ...base, rank: "사원" });

    expect(spendMasterMarker()).toBe(true);

    // Promoted: the pending rows still carry 사원 and have to be read again.
    saveStoredEmployee({ ...base, id: created.id, rank: "과장" });
    expect(spendMasterMarker()).toBe(true);
    expect(listStoredEmployees().find((employee) => employee.id === created.id)?.rank).toBe("과장");

    // Saved again with the same rank: nothing the parser sees changed.
    saveStoredEmployee({ ...base, id: created.id, rank: "과장" });
    expect(spendMasterMarker()).toBe(false);

    // Cleared: the rank the parser sees goes from 과장 to none, which is still a change.
    saveStoredEmployee({ ...base, id: created.id });
    expect(spendMasterMarker()).toBe(true);
    expect(listStoredEmployees().find((employee) => employee.id === created.id)?.rank).toBeUndefined();

    // A value outside the five known ranks does not normalize, so the parser keeps seeing none:
    // storing it must not force a re-read. The cast stands in for the bridge, which hands this
    // function plain JSON that the type cannot police.
    saveStoredEmployee({ ...base, id: created.id, rank: "팀장" as EmployeeRank });
    expect(spendMasterMarker()).toBe(false);
    expect(listStoredEmployees().find((employee) => employee.id === created.id)?.rank).toBeUndefined();

    // The other side of the same rule: a stored value the parser cannot read (only a hand edit can
    // put one there - every write path normalizes) is already invisible to it, so wiping it is not
    // a change either.
    getSqliteDatabase()!.prepare("UPDATE employees SET rank = '팀장' WHERE id = ?").run(created.id);
    saveStoredEmployee({ ...base, id: created.id });
    expect(spendMasterMarker()).toBe(false);
  });

  // R10 #1: the screen always asks for a hire date and for a retire date exactly when the person is
  // retired; the bridge can be called without the screen, so the same rule lives where the row is
  // saved. A blank is absent, not "" in the database.
  it("requires a hire date, and a retire date exactly when the person is retired", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const base = {
      employeeCode: "EMP-105",
      name: "한소율",
      employmentType: "정규직",
      status: "active" as const
    };

    expect(() => saveStoredEmployee({ ...base, hireDate: "" })).toThrowError("입사일을 입력해야 합니다.");
    expect(() => saveStoredEmployee({ ...base, hireDate: "   " })).toThrowError("입사일을 입력해야 합니다.");
    expect(() => saveStoredEmployee({ ...base } as never)).toThrowError("입사일을 입력해야 합니다.");
    expect(() =>
      saveStoredEmployee({ ...base, hireDate: "2026-03-01", status: "retired" })
    ).toThrowError("퇴사 처리일을 입력해야 합니다.");
    expect(() =>
      saveStoredEmployee({ ...base, hireDate: "2026-03-01", status: "retired", retireDate: " " })
    ).toThrowError("퇴사 처리일을 입력해야 합니다.");
    expect(() =>
      saveStoredEmployee({ ...base, hireDate: "2026-03-01", retireDate: "2026-08-31" })
    ).toThrowError("퇴사 처리일은 퇴사 상태에서만 입력할 수 있습니다.");
    expect(() =>
      saveStoredEmployee({ ...base, hireDate: "2026-03-01", status: "leave", retireDate: "2026-08-31" })
    ).toThrowError("퇴사 처리일은 퇴사 상태에서만 입력할 수 있습니다.");
    expect(
      listStoredEmployees({ includeDeleted: true }).some((employee) => employee.employeeCode === "EMP-105")
    ).toBe(false);

    // A rejected save leaves an existing row exactly as it was.
    const created = saveStoredEmployee({ ...base, hireDate: "2026-03-01" });

    expect(() => saveStoredEmployee({ ...base, id: created.id, hireDate: " " })).toThrowError(
      "입사일을 입력해야 합니다."
    );
    expect(() =>
      saveStoredEmployee({ ...base, id: created.id, hireDate: "2026-03-01", status: "retired" })
    ).toThrowError("퇴사 처리일을 입력해야 합니다.");

    const untouched = listStoredEmployees().find((employee) => employee.id === created.id);

    expect(untouched?.hireDate).toBe("2026-03-01");
    expect(untouched?.status).toBe("active");
    expect(untouched?.retireDate ?? undefined).toBeUndefined();

    // The retire date travels with the status: set on retiring, dropped on coming back.
    saveStoredEmployee({
      ...base,
      id: created.id,
      hireDate: "2026-03-01",
      status: "retired",
      retireDate: "2026-08-31"
    });
    expect(listStoredEmployees().find((employee) => employee.id === created.id)?.retireDate).toBe(
      "2026-08-31"
    );

    saveStoredEmployee({ ...base, id: created.id, hireDate: "2026-03-01" });
    expect(
      listStoredEmployees().find((employee) => employee.id === created.id)?.retireDate ?? undefined
    ).toBeUndefined();
  });

  // T-20: registering is one action. If the last write fails nothing of the person may remain,
  // and the same code must register cleanly afterwards.
  it("registers the person, the assignment and the first wage line together or not at all", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const database = getSqliteDatabase();
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");

    expect(database).toBeDefined();
    expect(targetSite).toBeDefined();

    database!.exec(
      "CREATE TRIGGER fail_wage_insert_for_test BEFORE INSERT ON wage_rates BEGIN SELECT RAISE(ABORT, 'wage insert failed for test'); END;"
    );

    try {
      expect(() =>
        saveStoredEmployee({
          employeeCode: "EMP-105",
          name: "윤서아",
          employmentType: "정규직",
          status: "active",
          hireDate: "2026-03-01",
          siteId: targetSite?.id,
          shiftGroup: "A",
          hourlyRate: 15000
        })
      ).toThrowError("wage insert failed for test");
    } finally {
      database!.exec("DROP TRIGGER fail_wage_insert_for_test");
    }

    const countRows = (sql: string) => Number((database!.prepare(sql).get() as { n: number }).n);

    expect(countRows("SELECT COUNT(*) AS n FROM employees WHERE employee_code = 'EMP-105'")).toBe(0);
    expect(
      countRows(
        "SELECT COUNT(*) AS n FROM employee_site_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_code = 'EMP-105')"
      )
    ).toBe(0);

    const retried = saveStoredEmployee({
      employeeCode: "EMP-105",
      name: "윤서아",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite?.id,
      shiftGroup: "A",
      hourlyRate: 15000
    });

    expect(retried.currentSiteName).toBe("동탄센터");
    expect(listStoredEmployeeWageRates(retried.id)).toHaveLength(1);
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

  it("should generate an internal employee code for BP workers without creating a wage rate", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");

    expect(targetSite).toBeDefined();

    const saved = saveStoredEmployee({
      employeeCode: "",
      name: "외부 협력사",
      employmentType: "BP",
      status: "active",
      hireDate: "2026-04-01",
      siteId: targetSite?.id,
      shiftGroup: "A조"
    });
    const database = getSqliteDatabase()!;
    const wageRateCount = database
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM wage_rates
          WHERE employee_id = ?
        `
      )
      .get(saved.id) as { count: number };

    expect(saved.employeeCode).toMatch(/^BP-\d{4}$/);
    expect(saved.employmentType).toBe("BP");
    expect(saved.currentSiteName).toBe("동탄센터");
    expect(saved.currentShiftGroup).toBe("A조");
    expect(saved.currentHourlyRate).toBeUndefined();
    expect(wageRateCount.count).toBe(0);
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

  it("should search employees by contact and rank and normalize legacy dispatched employment types to contract", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const saved = saveStoredEmployee({
      employeeCode: "EMP-103",
      name: "연락처 검색 직원",
      contact: "010-9999-1234",
      rank: "차장",
      employmentType: "파견직",
      status: "active",
      hireDate: "2026-04-01",
      hourlyRate: 15000
    });

    const searched = listStoredEmployees({ keyword: "9999" });
    const rankSearched = listStoredEmployees({ keyword: "차장" });

    expect(saved.employmentType).toBe("계약");
    expect(searched.map((employee) => employee.employeeCode)).toContain("EMP-103");
    expect(rankSearched.map((employee) => employee.employeeCode)).toContain("EMP-103");
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
    expect(kim?.currentSiteDeletedAt).toBeDefined();
    expect(listStoredSites().some((site) => site.id === targetSite!.id)).toBe(false);
  });

  it("should archive a retired employee after the retirement date without deleting history", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const retiredEmployee = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-023");

    expect(retiredEmployee).toBeDefined();

    const deleted = deleteStoredEmployee(retiredEmployee!.id);

    expect(deleted.employeeCode).toBe("EMP-023");
    expect(listStoredEmployees().some((employee) => employee.id === retiredEmployee!.id)).toBe(false);
    expect(
      listStoredEmployees({ includeDeleted: true }).find(
        (employee) => employee.id === retiredEmployee!.id
      )?.deletedAt
    ).toBeDefined();

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

    expect(assignmentCount.count).toBeGreaterThan(0);
    expect(wageRateCount.count).toBeGreaterThan(0);
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

  // The list used to take whichever row had no end date, so a future-dated wage showed up as the
  // current one. That is what made the screen disagree with the payroll calculation.
  it("should keep today's wage as the current wage when a future rate is registered", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const before = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-001");
    expect(before?.currentHourlyRate).toBe(12800);

    saveStoredEmployeeWageRate({
      employeeId: before!.id,
      hourlyRate: 20000,
      effectiveFrom: "2099-01-01",
      reason: "미래 적용 예정"
    });

    const after = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-001");

    expect(after?.currentHourlyRate).toBe(12800);
  });

  it("should pick the wage rate that actually covers today", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const employee = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");

    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 17000,
      effectiveFrom: "2024-01-01",
      reason: "소급 인상"
    });
    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 21000,
      effectiveFrom: "2099-06-01",
      reason: "미래 적용 예정"
    });

    const after = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");

    expect(after?.currentHourlyRate).toBe(17000);
  });
});
