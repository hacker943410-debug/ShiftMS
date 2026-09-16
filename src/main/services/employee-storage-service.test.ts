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
  listStoredEmployeesForSiteMonth,
  correctStoredEmployeeRetirement,
  rehireStoredEmployee,
  resetEmployeeStorageForTest,
  saveStoredEmployee
} from "./employee-storage-service";
import {
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate
} from "./employee-history-service";
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

const spendWageMarker = () => {
  const token = peekReparseMarker("wage-rate");

  if (token) {
    acknowledgeReparseMarker("wage-rate", token);
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
    expect(saved.employmentPeriods).toEqual([
      {
        id: expect.any(String),
        startDate: "2026-03-01",
        closureProvenanceComplete: true
      }
    ]);
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
    expect(() =>
      saveStoredEmployee({
        ...base,
        id: created.id,
        hireDate: "2026-03-01",
        status: "retired",
        retireDate: "2026-08-31",
        hourlyRate: 15000
      })
    ).toThrowError("퇴사 처리와 시급 변경은 한 번에 저장할 수 없습니다.");

    const untouched = listStoredEmployees().find((employee) => employee.id === created.id);

    expect(untouched?.hireDate).toBe("2026-03-01");
    expect(untouched?.status).toBe("active");
    expect(untouched?.retireDate ?? undefined).toBeUndefined();

    // R38 closes assignment and wage history when retirement is saved. Generic basic-info saves
    // must not silently reopen or move that boundary; the dedicated employment actions own it.
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

    expect(() =>
      saveStoredEmployee({ ...base, id: created.id, hireDate: "2026-03-01" })
    ).toThrowError("퇴사 상태 해제는 재입사 기능에서 처리해야 합니다.");
    expect(() =>
      saveStoredEmployee({
        ...base,
        id: created.id,
        hireDate: "2026-03-01",
        status: "retired",
        retireDate: "2026-09-01"
      })
    ).toThrowError("퇴사 처리일 변경은 전용 퇴사 정정 기능에서 처리해야 합니다.");
  });

  it("preserves NULL hire date for legacy employees without creating periods or reparse tokens until a real date is entered", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const database = getSqliteDatabase()!;

    const base = {
      employeeCode: "EMP-LEGACY-01",
      name: "레거시인력",
      employmentType: "정규직",
      status: "active" as const
    };

    const created = saveStoredEmployee({ ...base, hireDate: "2026-03-01" });

    // Force legacy state: hire_date IS NULL and remove compatibility employment periods
    database.prepare(`UPDATE employees SET hire_date = NULL WHERE id = ?`).run(created.id);
    database.prepare(`DELETE FROM employee_employment_periods WHERE employee_id = ?`).run(created.id);

    spendMasterMarker();

    // 1. Saving contact with empty hireDate preserves NULL
    const updatedWithEmpty = saveStoredEmployee({
      ...base,
      id: created.id,
      contact: "010-9999-0001",
      hireDate: ""
    });

    expect(updatedWithEmpty.hireDate).toBeUndefined();
    expect(updatedWithEmpty.contact).toBe("010-9999-0001");

    // DB row check: hire_date IS NULL
    const row = database
      .prepare(`SELECT hire_date FROM employees WHERE id = ?`)
      .get(created.id) as { hire_date: string | null };
    expect(row.hire_date).toBeNull();

    // Employment periods count: 0
    const periodCount = database
      .prepare(`SELECT COUNT(*) as count FROM employee_employment_periods WHERE employee_id = ?`)
      .get(created.id) as { count: number };
    expect(periodCount.count).toBe(0);

    // No employee-master reparse marker
    expect(spendMasterMarker()).toBe(false);

    // Also verify listStoredEmployees returns undefined hireDate and empty employmentPeriods
    const fetched = listStoredEmployees().find((e) => e.id === created.id);
    expect(fetched?.hireDate).toBeUndefined();
    expect(fetched?.employmentPeriods).toEqual([]);

    // 2. Later saving a real valid hire date creates period and leaves reparse marker
    const updatedWithDate = saveStoredEmployee({
      ...base,
      id: created.id,
      contact: "010-9999-0001",
      hireDate: "2026-01-15"
    });

    expect(updatedWithDate.hireDate).toBe("2026-01-15");
    expect(spendMasterMarker()).toBe(true);

    const periodRows = database
      .prepare(`SELECT * FROM employee_employment_periods WHERE employee_id = ?`)
      .all(created.id) as Array<{ start_date: string }>;
    expect(periodRows).toHaveLength(1);
    expect(periodRows[0]?.start_date).toBe("2026-01-15");
  });

  it("closes active assignment and wage history at the retirement boundary", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");

    expect(targetSite).toBeDefined();

    const created = saveStoredEmployee({
      employeeCode: "EMP-105-R",
      name: "퇴사경계",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite!.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });
    spendMasterMarker();
    spendWageMarker();

    const retired = saveStoredEmployee({
      id: created.id,
      employeeCode: created.employeeCode,
      name: created.name,
      employmentType: created.employmentType,
      status: "retired",
      hireDate: "2026-03-01",
      retireDate: "2026-08-31"
    });
    const database = getSqliteDatabase()!;
    const assignment = database
      .prepare(
        "SELECT status, end_date FROM employee_site_assignments WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(created.id) as { status: string; end_date: string | null };
    const wageRate = database
      .prepare(
        "SELECT effective_to FROM wage_rates WHERE employee_id = ? ORDER BY effective_from DESC, created_at DESC LIMIT 1"
      )
      .get(created.id) as { effective_to: string | null };

    expect(retired.status).toBe("retired");
    expect(retired.retireDate).toBe("2026-08-31");
    expect(assignment).toEqual({ status: "ended", end_date: "2026-08-31" });
    expect(wageRate.effective_to).toBe("2026-08-30");
    expect(peekReparseMarker("employee-master")).not.toBeNull();
    expect(peekReparseMarker("wage-rate")).not.toBeNull();
  });

  it("rehire keeps the person identity, adds a new period, and refuses writes in the gap", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터")!;
    const created = saveStoredEmployee({
      employeeCode: "EMP-REHIRE",
      name: "재입사검증",
      employmentType: "정규직",
      status: "active",
      hireDate: "2025-01-01",
      siteId: targetSite.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });

    saveStoredEmployeeWageRate({
      employeeId: created.id,
      hourlyRate: 17000,
      effectiveFrom: "2026-08-01",
      reason: "퇴사 전에 등록된 미래 시급"
    });

    saveStoredEmployee({
      id: created.id,
      employeeCode: created.employeeCode,
      name: created.name,
      employmentType: created.employmentType,
      status: "retired",
      hireDate: "2025-01-01",
      retireDate: "2026-02-01"
    });
    const rehired = rehireStoredEmployee({
      employeeId: created.id,
      rehireDate: "2026-07-01",
      reason: "재입사 승인"
    });

    expect(rehired.id).toBe(created.id);
    expect(rehired.employeeCode).toBe(created.employeeCode);
    expect(rehired.status).toBe("active");
    expect(rehired.hireDate).toBe("2026-07-01");
    expect(rehired.retireDate).toBeUndefined();
    expect(rehired.currentSiteId).toBeUndefined();
    expect(rehired.currentHourlyRate).toBeUndefined();
    expect(rehired.employmentPeriods?.map(({ startDate, endDate }) => ({ startDate, endDate }))).toEqual([
      { startDate: "2025-01-01", endDate: "2026-02-01" },
      { startDate: "2026-07-01", endDate: undefined }
    ]);
    expect(() =>
      saveStoredEmployeeWageRate({
        employeeId: created.id,
        hourlyRate: 15500,
        effectiveFrom: "2026-05-01",
        reason: "공백일 입력 시도"
      })
    ).toThrowError("등록된 고용기간 밖");

    saveStoredEmployeeWageRate({
      employeeId: created.id,
      hourlyRate: 16000,
      effectiveFrom: "2026-07-01",
      reason: "재입사 시급"
    });
    saveStoredEmployeeAssignment({
      employeeId: created.id,
      siteId: targetSite.id,
      shiftGroup: "B조",
      startDate: "2026-07-01"
    });

    const active = listStoredEmployees().find((employee) => employee.id === created.id)!;
    expect(active.currentHourlyRate).toBe(16000);
    expect(active.currentShiftGroup).toBe("B조");
  });

  it("corrects a tracked retirement by restoring history before applying the new boundary", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터")!;
    const created = saveStoredEmployee({
      employeeCode: "EMP-RETIRE-CORRECT",
      name: "퇴사정정검증",
      employmentType: "정규직",
      status: "active",
      hireDate: "2025-01-01",
      siteId: targetSite.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });

    saveStoredEmployee({
      id: created.id,
      employeeCode: created.employeeCode,
      name: created.name,
      employmentType: created.employmentType,
      status: "retired",
      hireDate: "2025-01-01",
      retireDate: "2026-04-01"
    });
    const corrected = correctStoredEmployeeRetirement({
      employeeId: created.id,
      retireDate: "2026-06-01",
      reason: "퇴사일 오입력 정정"
    });
    const assignment = listStoredEmployeeAssignments(created.id)[0];
    const wageRate = listStoredEmployeeWageRates(created.id)[0];

    expect(corrected.retireDate).toBe("2026-06-01");
    expect(corrected.employmentPeriods?.[0]?.endDate).toBe("2026-06-01");
    expect(assignment?.endDate).toBe("2026-06-01");
    expect(wageRate?.effectiveTo).toBe("2026-05-31");

    const event = getSqliteDatabase()!.prepare(`
      SELECT event_type, event_date, previous_event_date, reason
      FROM employee_employment_period_events
      WHERE employee_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(created.id);
    expect(event).toEqual({
      event_type: "retirement-corrected",
      event_date: "2026-06-01",
      previous_event_date: "2026-04-01",
      reason: "퇴사일 오입력 정정"
    });
  });

  it("does not reopen untracked legacy retirement history", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const legacy = listStoredEmployees().find((employee) => employee.employeeCode === "EMP-023")!;

    expect(() =>
      correctStoredEmployeeRetirement({
        employeeId: legacy.id,
        retireDate: "2026-03-01",
        reason: "뒤로 이동 시도"
      })
    ).toThrowError("이전 버전에서 처리되어");

    const shortened = correctStoredEmployeeRetirement({
      employeeId: legacy.id,
      retireDate: "2026-02-01",
      reason: "더 이른 날짜로 정정"
    });
    expect(shortened.retireDate).toBe("2026-02-01");
  });

  it("rolls back rehire when its employment event cannot be recorded", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const employee = saveStoredEmployee({
      employeeCode: "EMP-REHIRE-ROLLBACK",
      name: "재입사롤백",
      employmentType: "정규직",
      status: "retired",
      hireDate: "2025-01-01",
      retireDate: "2026-02-01"
    });
    const database = getSqliteDatabase()!;

    database.exec(`
      CREATE TRIGGER fail_rehire_event_for_test
      BEFORE INSERT ON employee_employment_period_events
      WHEN NEW.event_type = 'rehired'
      BEGIN
        SELECT RAISE(ABORT, 'rehire event failed for test');
      END;
    `);

    try {
      expect(() =>
        rehireStoredEmployee({
          employeeId: employee.id,
          rehireDate: "2026-07-01",
          reason: "롤백 검증"
        })
      ).toThrowError("rehire event failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_rehire_event_for_test");
    }

    const unchanged = listStoredEmployees().find((item) => item.id === employee.id)!;
    expect(unchanged.status).toBe("retired");
    expect(unchanged.retireDate).toBe("2026-02-01");
    expect(unchanged.employmentPeriods).toHaveLength(1);
  });

  it("rolls back restored history when a retirement correction event cannot be recorded", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const site = listStoredSites().find((item) => item.name === "동탄센터")!;
    const employee = saveStoredEmployee({
      employeeCode: "EMP-RETIRE-ROLLBACK",
      name: "퇴사정정롤백",
      employmentType: "정규직",
      status: "active",
      hireDate: "2025-01-01",
      siteId: site.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });

    saveStoredEmployee({
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      employmentType: employee.employmentType,
      status: "retired",
      hireDate: "2025-01-01",
      retireDate: "2026-04-01"
    });

    const database = getSqliteDatabase()!;
    database.exec(`
      CREATE TRIGGER fail_retirement_correction_event_for_test
      BEFORE INSERT ON employee_employment_period_events
      WHEN NEW.event_type = 'retirement-corrected'
      BEGIN
        SELECT RAISE(ABORT, 'retirement correction event failed for test');
      END;
    `);

    try {
      expect(() =>
        correctStoredEmployeeRetirement({
          employeeId: employee.id,
          retireDate: "2026-06-01",
          reason: "롤백 검증"
        })
      ).toThrowError("retirement correction event failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_retirement_correction_event_for_test");
    }

    const unchanged = listStoredEmployees().find((item) => item.id === employee.id)!;
    expect(unchanged.retireDate).toBe("2026-04-01");
    expect(listStoredEmployeeAssignments(employee.id)[0]?.endDate).toBe("2026-04-01");
    expect(listStoredEmployeeWageRates(employee.id)[0]?.effectiveTo).toBe("2026-03-31");
  });

  it("clamps a scheduled transfer without creating a negative assignment period", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");
    const created = saveStoredEmployee({
      employeeCode: "EMP-105-FUTURE",
      name: "퇴사예약",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite!.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });

    saveStoredEmployeeAssignment({
      employeeId: created.id,
      siteId: targetSite!.id,
      shiftGroup: "B조",
      startDate: "2026-10-01"
    });
    saveStoredEmployee({
      id: created.id,
      employeeCode: created.employeeCode,
      name: created.name,
      employmentType: created.employmentType,
      status: "retired",
      hireDate: "2026-03-01",
      retireDate: "2026-08-31"
    });

    expect(
      listStoredEmployeeAssignments(created.id).map((assignment) => ({
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        status: assignment.status
      }))
    ).toEqual([
      { startDate: "2026-10-01", endDate: "2026-10-01", status: "ended" },
      { startDate: "2026-03-01", endDate: "2026-08-31", status: "ended" }
    ]);
  });

  it("rolls back the retirement and history boundaries when its wage marker cannot be saved", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "동탄센터");
    const created = saveStoredEmployee({
      employeeCode: "EMP-105-ROLLBACK",
      name: "퇴사롤백",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite!.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });
    const database = getSqliteDatabase()!;
    spendMasterMarker();
    spendWageMarker();

    database.exec(
      "CREATE TRIGGER fail_retirement_wage_marker_insert BEFORE INSERT ON app_setting_entries WHEN NEW.setting_key = 'wage_rate_reparse_marker' BEGIN SELECT RAISE(ABORT, 'retirement marker failed'); END;"
    );
    database.exec(
      "CREATE TRIGGER fail_retirement_wage_marker_update BEFORE UPDATE ON app_setting_entries WHEN NEW.setting_key = 'wage_rate_reparse_marker' BEGIN SELECT RAISE(ABORT, 'retirement marker failed'); END;"
    );

    try {
      expect(() =>
        saveStoredEmployee({
          id: created.id,
          employeeCode: created.employeeCode,
          name: created.name,
          employmentType: created.employmentType,
          status: "retired",
          hireDate: "2026-03-01",
          retireDate: "2026-08-31"
        })
      ).toThrowError("retirement marker failed");
    } finally {
      database.exec("DROP TRIGGER fail_retirement_wage_marker_insert");
      database.exec("DROP TRIGGER fail_retirement_wage_marker_update");
    }

    const untouched = listStoredEmployees().find((employee) => employee.id === created.id);
    const assignment = database
      .prepare(
        "SELECT status, end_date FROM employee_site_assignments WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(created.id) as { status: string; end_date: string | null };
    const wageRate = listStoredEmployeeWageRates(created.id)[0];

    expect(untouched?.status).toBe("active");
    expect(untouched?.retireDate).toBeUndefined();
    expect(assignment).toEqual({ status: "active", end_date: null });
    expect(wageRate?.effectiveTo).toBeUndefined();
    expect(peekReparseMarker("employee-master")).toBeNull();
    expect(peekReparseMarker("wage-rate")).toBeNull();
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

  it("returns every overlapping assignment segment for the site and month rather than only the latest one", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const sites = listStoredSites();
    const siteA = sites.find((site) => site.name === "동탄센터")!;
    const siteB = sites.find((site) => site.name === "보라매DC")!;

    const employee = saveStoredEmployee({
      employeeCode: "EMP-R40-MULTI",
      name: "다중배정",
      contact: "010-1234-5678",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: siteA.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });

    // 2026-03-10: change shift group to B조 at same site A
    saveStoredEmployeeAssignment({
      employeeId: employee.id,
      siteId: siteA.id,
      shiftGroup: "B조",
      startDate: "2026-03-10"
    });

    // 2026-03-20: transfer to site B with C조
    saveStoredEmployeeAssignment({
      employeeId: employee.id,
      siteId: siteB.id,
      shiftGroup: "C조",
      startDate: "2026-03-20"
    });

    // Site A in 2026-03: should return both segments
    const siteAMarch = listStoredEmployeesForSiteMonth(siteA.id, "2026-03");
    const siteAMarchEmployeeRows = siteAMarch.filter((row) => row.id === employee.id);
    expect(siteAMarchEmployeeRows).toHaveLength(2);
    expect(
      siteAMarchEmployeeRows.map((row) => ({
        shiftGroup: row.currentShiftGroup,
        startDate: row.currentAssignmentStartDate,
        endDate: row.currentAssignmentEndDate
      }))
    ).toEqual([
      { shiftGroup: "A조", startDate: "2026-03-01", endDate: "2026-03-10" },
      { shiftGroup: "B조", startDate: "2026-03-10", endDate: "2026-03-20" }
    ]);

    // Site B in 2026-03: should return one segment
    const siteBMarch = listStoredEmployeesForSiteMonth(siteB.id, "2026-03");
    const siteBMarchEmployeeRows = siteBMarch.filter((row) => row.id === employee.id);
    expect(siteBMarchEmployeeRows).toHaveLength(1);
    expect(siteBMarchEmployeeRows[0]?.currentShiftGroup).toBe("C조");
    expect(siteBMarchEmployeeRows[0]?.currentAssignmentStartDate).toBe("2026-03-20");
    expect(siteBMarchEmployeeRows[0]?.currentAssignmentEndDate).toBeUndefined();
    expect("contact" in siteBMarchEmployeeRows[0]!).toBe(false);
    expect("currentHourlyRate" in siteBMarchEmployeeRows[0]!).toBe(false);
    expect("deletedAt" in siteBMarchEmployeeRows[0]!).toBe(false);

    // Site A in 2026-04: should have no rows for this employee
    const siteAApril = listStoredEmployeesForSiteMonth(siteA.id, "2026-04");
    expect(siteAApril.some((row) => row.id === employee.id)).toBe(false);

    // Site B in 2026-04: should have this employee
    const siteBApril = listStoredEmployeesForSiteMonth(siteB.id, "2026-04");
    expect(siteBApril.some((row) => row.id === employee.id)).toBe(true);
  });

  it("rejects assignment input when saving an existing employee to prevent retroactive initial assignments", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employees.test.sqlite")
    });

    const targetSite = listStoredSites().find((site) => site.name === "동탄센터")!;
    const created = saveStoredEmployee({
      employeeCode: "EMP-R40-REJECT",
      name: "초기배정보호",
      employmentType: "정규직",
      status: "active",
      hireDate: "2026-03-01",
      siteId: targetSite.id,
      shiftGroup: "A조",
      hourlyRate: 15000
    });

    const assignmentsBefore = listStoredEmployeeAssignments(created.id);
    expect(assignmentsBefore).toHaveLength(1);

    expect(() =>
      saveStoredEmployee({
        id: created.id,
        employeeCode: created.employeeCode,
        name: "초기배정보호-수정시도",
        employmentType: created.employmentType,
        status: "active",
        hireDate: "2026-03-01",
        siteId: targetSite.id,
        shiftGroup: "B조"
      })
    ).toThrow("기존 인력의 근무지 배정은 전용 배정 기능에서 변경해야 합니다.");

    expect(() =>
      saveStoredEmployee({
        id: created.id,
        employeeCode: created.employeeCode,
        name: "초기배정보호-근무지만",
        employmentType: created.employmentType,
        status: "active",
        hireDate: "2026-03-01",
        siteId: targetSite.id
      })
    ).toThrow("기존 인력의 근무지 배정은 전용 배정 기능에서 변경해야 합니다.");

    const assignmentsAfter = listStoredEmployeeAssignments(created.id);
    expect(assignmentsAfter).toEqual(assignmentsBefore);

    const employeeAfter = listStoredEmployees().find((emp) => emp.id === created.id);
    expect(employeeAfter?.name).toBe("초기배정보호");
  });
});
