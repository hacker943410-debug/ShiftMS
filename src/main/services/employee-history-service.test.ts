import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { acknowledgeReparseMarker, peekReparseMarker } from "./app-settings-storage-service";
import { listStoredEmployees, resetEmployeeStorageForTest } from "./employee-storage-service";
import {
  closeStoredEmployeeAssignment,
  closeStoredEmployeeWageRate,
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates,
  reorderStoredEmployeeAssignment,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate
} from "./employee-history-service";
import { listStoredSites } from "./site-storage-service";
import { listStoredShiftPatterns, saveStoredShiftPattern } from "./shift-pattern-storage-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

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

  it("should append a wage rate history entry and close the previous active one", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const saved = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13600,
      effectiveFrom: "2026-04-01",
      reason: "정기 인상"
    });

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(saved.hourlyRate).toBe(13600);
    expect(saved.effectiveFrom).toBe("2026-04-01");
    expect(wageRates).toHaveLength(2);
    expect(wageRates[0]?.hourlyRate).toBe(13600);
    expect(wageRates[0]?.reason).toBe("정기 인상");
    expect(wageRates[1]?.effectiveTo).toBe("2026-03-31");
  });

  // 같은 적용일로 다시 저장하면 줄이 늘지 않고 그 줄을 고쳐 쓴다(잘못 넣은 시급 정정).
  it("should overwrite the wage rate that already starts on the same date", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const currentWageRate = listStoredEmployeeWageRates(employee!.id)[0];

    expect(currentWageRate).toBeDefined();

    const saved = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13600,
      effectiveFrom: currentWageRate!.effectiveFrom,
      reason: "금액 정정"
    });

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(saved.id).toBe(currentWageRate!.id);
    expect(wageRates).toHaveLength(1);
    expect(wageRates[0]?.hourlyRate).toBe(13600);
    expect(wageRates[0]?.reason).toBe("금액 정정");
  });

  // R13 self-check: a migrated overlap ("2023-03-01~계속" still open under "2026-07-01~계속") is
  // repaired by saving on 2026-07-01 - a same-date rewrite, which used to leave the earlier line
  // open. The T-19 notice promises that repair, so the rewrite must cut the crossing line too.
  it("cuts an earlier line that still crosses the date when re-saving on the same start date", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const seeded = listStoredEmployeeWageRates(employee!.id)[0];

    expect(seeded?.effectiveTo ?? undefined).toBeUndefined();

    // Written straight into the store: the official save never creates an overlap.
    getSqliteDatabase()!
      .prepare(
        "INSERT INTO wage_rates (id, employee_id, hourly_rate, effective_from, effective_to, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("overlap-later", employee!.id, 14000, "2026-07-01", null, "migrated", "2026-07-01T00:00:00.000Z");

    const saved = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 14200,
      effectiveFrom: "2026-07-01",
      reason: "겹침 정리"
    });
    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(saved.id).toBe("overlap-later");
    expect(saved.hourlyRate).toBe(14200);
    expect(wageRates).toHaveLength(2);
    expect(wageRates.find((rate) => rate.id === seeded!.id)?.effectiveTo).toBe("2026-06-30");
    expect(wageRates.find((rate) => rate.id === "overlap-later")?.effectiveTo ?? undefined).toBeUndefined();
  });

  // 소급 인상: 지난 날짜로 넣어도 기간이 겹치지 않게 앞뒤 줄이 정리돼야 한다.
  it("should insert a backdated wage rate without overlapping the neighbouring rows", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const seededWageRate = listStoredEmployeeWageRates(employee!.id)[0];

    expect(seededWageRate).toBeDefined();

    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 14000,
      effectiveFrom: "2026-07-01",
      reason: "정기 인상"
    });

    const backdated = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13500,
      effectiveFrom: "2026-04-01",
      reason: "소급 인상"
    });

    const wageRates = listStoredEmployeeWageRates(employee!.id);

    expect(backdated.effectiveFrom).toBe("2026-04-01");
    // 시작일이 늦은 순서로 내려온다: 2026-07-01 → 2026-04-01 → 시드 시급.
    expect(wageRates.map((rate) => `${rate.effectiveFrom}~${rate.effectiveTo ?? ""}`)).toEqual([
      "2026-07-01~",
      "2026-04-01~2026-06-30",
      `${seededWageRate!.effectiveFrom}~2026-03-31`
    ]);
  });

  // 종료 처리된 줄이 있어도 기간이 겹치지 않아야 한다(예전에는 검사가 풀려 겹쳤다).
  it("should not overlap a closed wage rate when a backdated row is inserted", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const raised = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 14000,
      effectiveFrom: "2026-07-01",
      reason: "정기 인상"
    });

    closeStoredEmployeeWageRate({ wageRateId: raised.id, effectiveTo: "2026-12-31" });

    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 13900,
      effectiveFrom: "2026-05-01",
      reason: "소급 인상"
    });

    const ranges = listStoredEmployeeWageRates(employee!.id).map((rate) => ({
      from: rate.effectiveFrom,
      to: rate.effectiveTo ?? "9999-12-31"
    }));
    const sorted = [...ranges].sort((left, right) => left.from.localeCompare(right.from));
    const overlaps = sorted.some((range, index) => {
      const next = sorted[index + 1];

      return next ? next.from <= range.to : false;
    });

    expect(overlaps).toBe(false);
    expect(sorted.map((range) => range.from)).toEqual(
      [...new Set(sorted.map((range) => range.from))]
    );
  });

  it("should append an assignment history entry and close the previous active one", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const site = listStoredSites().find((targetSite) => targetSite.siteCode === "SITE-DTN");

    expect(employee).toBeDefined();
    expect(site).toBeDefined();

    const saved = saveStoredEmployeeAssignment({
      employeeId: employee!.id,
      siteId: site!.id,
      shiftGroup: "A",
      startDate: "2026-04-01"
    });

    const assignments = listStoredEmployeeAssignments(employee!.id);

    expect(saved.siteId).toBe(site!.id);
    expect(saved.siteName).toBe(site!.name);
    expect(saved.shiftGroup).toBe("A조");
    expect(assignments).toHaveLength(2);
    expect(assignments[0]?.siteName).toBe(site!.name);
    expect(assignments[0]?.status).toBe("active");
    expect(assignments[0]?.shiftGroup).toBe("A조");
    expect(assignments[1]?.status).toBe("ended");
    expect(assignments[1]?.endDate).toBe("2026-04-01");
  });

  it("should reject assignments that exceed the active team capacity", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const site = listStoredSites().find((targetSite) => targetSite.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-014"
    );

    expect(site).toBeDefined();
    expect(pattern).toBeDefined();
    expect(employee).toBeDefined();

    saveStoredShiftPattern({
      id: pattern!.id,
      siteId: pattern!.siteId,
      name: pattern!.name,
      teamCount: pattern!.teamCount,
      patternCode: pattern!.patternCode,
      startIndexRule: pattern!.startIndexRule,
      patternStartDate: pattern!.patternStartDate,
      status: pattern!.status,
      steps: pattern!.steps.map((step) => ({
        stepIndex: step.stepIndex,
        dutyCode: step.dutyCode,
        startTime: step.startTime,
        endTime: step.endTime,
        breakMinutes: step.breakMinutes
      })),
      teamIndexes: pattern!.teamIndexes,
      cycles: pattern!.cycles.map((cycle) => ({
        cycleKey: cycle.cycleKey,
        name: cycle.name,
        order: cycle.order,
        shiftCount: cycle.shiftCount,
        patternCode: cycle.patternCode,
        patternStartDate: cycle.patternStartDate,
        steps: cycle.steps.map((step) => ({
          stepIndex: step.stepIndex,
          dutyCode: step.dutyCode,
          startTime: step.startTime,
          endTime: step.endTime,
          breakMinutes: step.breakMinutes
        })),
        teamIndexes: cycle.teamIndexes
      })),
      teamCycleAssignments: pattern!.teamCycleAssignments,
      teamCapacities: [{ teamLabel: "A조", maxHeadcount: 1 }],
      poolEnabled: pattern!.poolEnabled,
      poolStartTime: pattern!.poolStartTime,
      poolEndTime: pattern!.poolEndTime,
      poolBreakMinutes: pattern!.poolBreakMinutes
    });

    expect(() =>
      saveStoredEmployeeAssignment({
        employeeId: employee!.id,
        siteId: site!.id,
        shiftGroup: "A조",
        startDate: "2026-04-01"
      })
    ).toThrow("A조 정원(1명)을 초과할 수 없습니다.");
  });

  it("should close an active wage rate without deleting history", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const wageRate = listStoredEmployeeWageRates(employee!.id)[0];

    expect(wageRate).toBeDefined();

    const closed = closeStoredEmployeeWageRate({
      wageRateId: wageRate!.id,
      effectiveTo: "2026-03-31"
    });

    expect(closed.effectiveTo).toBe("2026-03-31");
    expect(listStoredEmployeeWageRates(employee!.id)).toHaveLength(1);
  });

  it("should close an active assignment without deleting history", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const assignment = listStoredEmployeeAssignments(employee!.id)[0];

    expect(assignment).toBeDefined();

    const closed = closeStoredEmployeeAssignment({
      assignmentId: assignment!.id,
      endDate: "2026-03-31"
    });

    expect(closed.status).toBe("ended");
    expect(closed.endDate).toBe("2026-03-31");
    expect(listStoredEmployeeAssignments(employee!.id)).toHaveLength(1);
  });

  // R10 #2: an assignment decides which same-name person a parsed row lands on, so saving or
  // closing one must make the next overview read the pending files again.
  it("leaves the employee master reparse marker when an assignment is saved or closed", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const seedToken = peekReparseMarker("employee-master");

    if (seedToken) {
      acknowledgeReparseMarker("employee-master", seedToken);
    }

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const site = listStoredSites().find((targetSite) => targetSite.siteCode === "SITE-DTN");
    const saved = saveStoredEmployeeAssignment({
      employeeId: employee!.id,
      siteId: site!.id,
      shiftGroup: "A",
      startDate: "2026-04-01"
    });
    const afterSave = peekReparseMarker("employee-master");

    expect(afterSave).not.toBeNull();
    acknowledgeReparseMarker("employee-master", afterSave!);
    expect(peekReparseMarker("employee-master")).toBeNull();

    closeStoredEmployeeAssignment({ assignmentId: saved.id, endDate: "2026-04-30" });

    expect(peekReparseMarker("employee-master")).not.toBeNull();
  });

  it("should reorder active assignments within the same team", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const site = listStoredSites().find((targetSite) => targetSite.siteCode === "SITE-DTN");
    const firstEmployee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const secondEmployee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-014"
    );

    expect(site).toBeDefined();
    expect(firstEmployee).toBeDefined();
    expect(secondEmployee).toBeDefined();

    saveStoredEmployeeAssignment({
      employeeId: firstEmployee!.id,
      siteId: site!.id,
      shiftGroup: "A조",
      startDate: "2026-04-01"
    });
    const secondAssignment = saveStoredEmployeeAssignment({
      employeeId: secondEmployee!.id,
      siteId: site!.id,
      shiftGroup: "A조",
      startDate: "2026-04-02"
    });

    const reordered = reorderStoredEmployeeAssignment({
      assignmentId: secondAssignment.id,
      direction: "up"
    });

    expect(reordered.map((assignment) => assignment.employeeId)).toEqual([
      secondEmployee!.id,
      firstEmployee!.id
    ]);
    expect(reordered.map((assignment) => assignment.sortOrder)).toEqual([0, 1]);
  });

  // Nothing stops two rows sharing a start date, and reads break the tie by newest created_at.
  // Saving used to edit the OLDEST of them, so the screen confirmed overwriting one amount while
  // the row the payroll calculation actually reads kept its old value.
  it("should edit the row a read would resolve when two rows share a start date", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");
    const database = getSqliteDatabase();

    // Only a path that bypasses the save service (migration, backup restore) can produce this.
    database!.prepare(
      `INSERT INTO wage_rates (id, employee_id, hourly_rate, effective_from, effective_to, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("dup-old", employee!.id, 11000, "2026-05-01", null, "이관", "2026-05-21T00:00:00.000Z");
    database!.prepare(
      `INSERT INTO wage_rates (id, employee_id, hourly_rate, effective_from, effective_to, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("dup-new", employee!.id, 12000, "2026-05-01", null, "이관", "2026-05-21T00:00:01.000Z");

    // The row a read resolves is the newer one.
    const before = listStoredEmployeeWageRates(employee!.id).find(
      (rate) => rate.effectiveFrom === "2026-05-01"
    );
    expect(before?.id).toBe("dup-new");

    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 19000,
      effectiveFrom: "2026-05-01",
      reason: "정정"
    });

    const after = listStoredEmployeeWageRates(employee!.id).find(
      (rate) => rate.effectiveFrom === "2026-05-01"
    );

    expect(after?.id).toBe("dup-new");
    expect(after?.hourlyRate).toBe(19000);
  });

  // T-23: nothing dated for a person may start before the hire date. EMP-001 is seeded with
  // hire date 2023-03-01.
  it("refuses a wage line that would apply before the hire date, and accepts one on it", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee?.hireDate).toBe("2023-03-01");

    expect(() =>
      saveStoredEmployeeWageRate({
        employeeId: employee!.id,
        hourlyRate: 15000,
        effectiveFrom: "2023-02-28"
      })
    ).toThrow("시급 적용일은 입사일(2023-03-01)보다 빠를 수 없습니다.");
    expect(
      listStoredEmployeeWageRates(employee!.id).some((rate) => rate.effectiveFrom === "2023-02-28")
    ).toBe(false);

    const onHireDate = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 15000,
      effectiveFrom: "2023-03-01"
    });

    expect(onHireDate.effectiveFrom).toBe("2023-03-01");
    expect(onHireDate.hourlyRate).toBe(15000);
  });

  it("refuses an assignment that would start before the hire date, and accepts one on it", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const site = listStoredSites().find((targetSite) => targetSite.siteCode === "SITE-DTN");

    expect(employee?.hireDate).toBe("2023-03-01");
    expect(site).toBeDefined();

    const activeBefore = listStoredEmployeeAssignments(employee!.id).filter(
      (assignment) => assignment.status === "active"
    );

    expect(() =>
      saveStoredEmployeeAssignment({
        employeeId: employee!.id,
        siteId: site!.id,
        shiftGroup: "A",
        startDate: "2023-02-28"
      })
    ).toThrow("배정 시작일은 입사일(2023-03-01)보다 빠를 수 없습니다.");
    // The refusal happens before anything is written: the active assignment is untouched.
    expect(
      listStoredEmployeeAssignments(employee!.id).filter(
        (assignment) => assignment.status === "active"
      )
    ).toEqual(activeBefore);

    const onHireDate = saveStoredEmployeeAssignment({
      employeeId: employee!.id,
      siteId: site!.id,
      shiftGroup: "A",
      startDate: "2023-03-01"
    });

    expect(onHireDate.startDate).toBe("2023-03-01");
    expect(onHireDate.status).toBe("active");
  });
});

// T-1: the wage is stamped on each performance row when the file is read, so a wage line saved or
// closed leaves a reparse marker and the next overview reads the pending files again.
describe("employee-history-service · wage-rate reparse marker", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  const spendWageMarker = () => {
    const token = peekReparseMarker("wage-rate");

    if (token !== null) {
      acknowledgeReparseMarker("wage-rate", token);
    }

    return token !== null;
  };

  it("leaves the wage-rate reparse marker when a wage line is saved or closed", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    // Seeding left nothing behind for this kind.
    expect(spendWageMarker()).toBe(false);

    const saved = saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 15000,
      effectiveFrom: "2026-05-01",
      reason: "marker test"
    });

    expect(spendWageMarker()).toBe(true);
    expect(spendWageMarker()).toBe(false);

    // Rewriting the same start date is a wage change too.
    saveStoredEmployeeWageRate({
      employeeId: employee!.id,
      hourlyRate: 15500,
      effectiveFrom: "2026-05-01",
      reason: "marker test, rewrite"
    });

    expect(spendWageMarker()).toBe(true);

    closeStoredEmployeeWageRate({ wageRateId: saved.id, effectiveTo: "2026-06-30" });

    expect(spendWageMarker()).toBe(true);

    // A refused save (before the hire date, T-23) leaves nothing.
    expect(() =>
      saveStoredEmployeeWageRate({
        employeeId: employee!.id,
        hourlyRate: 15000,
        effectiveFrom: "2023-02-28"
      })
    ).toThrow();
    expect(spendWageMarker()).toBe(false);
  });
});

// F4: saving or closing a wage line is several writes (cut the earlier line, write the line, leave
// the reparse marker). They have to land together: a half-applied save cuts the earlier line
// without writing the new one, and nobody is paid for the gap it leaves.
describe("employee-history-service · wage line atomicity", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
  });

  const openStorage = () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );
    const database = getSqliteDatabase();

    expect(employee).toBeDefined();
    expect(database).toBeDefined();

    return { database: database!, employee: employee! };
  };

  it("undoes the cut of the earlier line when the new wage row cannot be written", () => {
    const { database, employee } = openStorage();
    const seeded = listStoredEmployeeWageRates(employee.id)[0];
    const markerBefore = peekReparseMarker("wage-rate");

    expect(seeded?.effectiveTo ?? undefined).toBeUndefined();
    expect(markerBefore).toBeNull();

    database.exec(
      "CREATE TRIGGER fail_wage_insert_for_test BEFORE INSERT ON wage_rates BEGIN SELECT RAISE(ABORT, 'wage insert failed for test'); END;"
    );

    try {
      expect(() =>
        saveStoredEmployeeWageRate({
          employeeId: employee.id,
          hourlyRate: 15000,
          effectiveFrom: "2026-03-01",
          reason: "atomicity test"
        })
      ).toThrowError("wage insert failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_wage_insert_for_test");
    }

    const afterFailure = listStoredEmployeeWageRates(employee.id);

    // The earlier line is still open: it was not cut on 2026-02-28 for a line that never landed.
    expect(afterFailure).toHaveLength(1);
    expect(afterFailure[0]?.id).toBe(seeded!.id);
    expect(afterFailure[0]?.effectiveTo ?? undefined).toBeUndefined();
    // And nothing asked the pending files to be read again.
    expect(peekReparseMarker("wage-rate")).toBe(markerBefore);

    const retried = saveStoredEmployeeWageRate({
      employeeId: employee.id,
      hourlyRate: 15000,
      effectiveFrom: "2026-03-01",
      reason: "atomicity test"
    });
    const afterRetry = listStoredEmployeeWageRates(employee.id);

    expect(retried.effectiveFrom).toBe("2026-03-01");
    expect(afterRetry).toHaveLength(2);
    expect(afterRetry.map((rate) => `${rate.effectiveFrom}~${rate.effectiveTo ?? ""}`)).toEqual([
      "2026-03-01~",
      `${seeded!.effectiveFrom}~2026-02-28`
    ]);
    expect(peekReparseMarker("wage-rate")).not.toBeNull();
  });

  it("undoes the cut of the earlier line when rewriting a line on the same start date fails", () => {
    const { database, employee } = openStorage();
    const seeded = listStoredEmployeeWageRates(employee.id)[0];
    const markerBefore = peekReparseMarker("wage-rate");

    expect(seeded?.effectiveTo ?? undefined).toBeUndefined();
    expect(markerBefore).toBeNull();

    // Written straight into the store, the way a migrated overlap looks: the official save never
    // creates one. Re-saving on 2026-07-01 is the rewrite branch AND cuts the seeded line.
    database
      .prepare(
        "INSERT INTO wage_rates (id, employee_id, hourly_rate, effective_from, effective_to, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("overlap-later", employee.id, 14000, "2026-07-01", null, "migrated", "2026-07-01T00:00:00.000Z");

    // Only the rewrite of the target row is refused; the cut of the earlier line still runs, which
    // is exactly the write that must be undone.
    database.exec(
      "CREATE TRIGGER fail_wage_rewrite_for_test BEFORE UPDATE ON wage_rates WHEN NEW.hourly_rate = 14200 BEGIN SELECT RAISE(ABORT, 'wage rewrite failed for test'); END;"
    );

    try {
      expect(() =>
        saveStoredEmployeeWageRate({
          employeeId: employee.id,
          hourlyRate: 14200,
          effectiveFrom: "2026-07-01",
          reason: "겹침 정리"
        })
      ).toThrowError("wage rewrite failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_wage_rewrite_for_test");
    }

    const afterFailure = listStoredEmployeeWageRates(employee.id);

    expect(afterFailure.find((rate) => rate.id === seeded!.id)?.effectiveTo ?? undefined).toBeUndefined();
    expect(afterFailure.find((rate) => rate.id === "overlap-later")?.hourlyRate).toBe(14000);
    expect(peekReparseMarker("wage-rate")).toBe(markerBefore);
  });

  it("undoes closing a wage line when the reparse marker cannot be written", () => {
    const { database, employee } = openStorage();
    const seeded = listStoredEmployeeWageRates(employee.id)[0];

    expect(seeded?.effectiveTo ?? undefined).toBeUndefined();
    expect(peekReparseMarker("wage-rate")).toBeNull();

    // The marker is an upsert, so both halves have to be refused - the row does not exist yet here,
    // but the pair keeps the test honest if the seed ever leaves one behind.
    database.exec(
      "CREATE TRIGGER fail_wage_marker_insert_for_test BEFORE INSERT ON app_setting_entries WHEN NEW.setting_key = 'wage_rate_reparse_marker' BEGIN SELECT RAISE(ABORT, 'wage marker failed for test'); END;"
    );
    database.exec(
      "CREATE TRIGGER fail_wage_marker_update_for_test BEFORE UPDATE ON app_setting_entries WHEN NEW.setting_key = 'wage_rate_reparse_marker' BEGIN SELECT RAISE(ABORT, 'wage marker failed for test'); END;"
    );

    try {
      expect(() =>
        closeStoredEmployeeWageRate({ wageRateId: seeded!.id, effectiveTo: "2026-06-30" })
      ).toThrowError("wage marker failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_wage_marker_insert_for_test");
      database.exec("DROP TRIGGER fail_wage_marker_update_for_test");
    }

    // The line is still open: it was not closed behind a marker that never landed.
    expect(
      listStoredEmployeeWageRates(employee.id).find((rate) => rate.id === seeded!.id)?.effectiveTo ??
        undefined
    ).toBeUndefined();
    expect(peekReparseMarker("wage-rate")).toBeNull();

    const closed = closeStoredEmployeeWageRate({
      wageRateId: seeded!.id,
      effectiveTo: "2026-06-30"
    });

    expect(closed.effectiveTo).toBe("2026-06-30");
    expect(peekReparseMarker("wage-rate")).not.toBeNull();
  });

  // Registration and the bulk wage update already own a transaction when they call this, and
  // node:sqlite refuses a nested BEGIN. The save has to join theirs and leave the closing to them.
  it("joins a transaction the caller already owns and leaves closing it to the caller", () => {
    const { database, employee } = openStorage();
    const seeded = listStoredEmployeeWageRates(employee.id)[0];

    expect(peekReparseMarker("wage-rate")).toBeNull();

    database.exec("BEGIN");

    const saved = saveStoredEmployeeWageRate({
      employeeId: employee.id,
      hourlyRate: 15000,
      effectiveFrom: "2026-03-01",
      reason: "owner test"
    });

    // Still inside the caller's transaction: the save neither committed nor rolled it back.
    expect(database.isTransaction).toBe(true);
    expect(saved.effectiveFrom).toBe("2026-03-01");
    expect(peekReparseMarker("wage-rate")).not.toBeNull();

    database.exec("ROLLBACK");

    const afterRollback = listStoredEmployeeWageRates(employee.id);

    expect(afterRollback.some((rate) => rate.id === saved.id)).toBe(false);
    expect(afterRollback.find((rate) => rate.id === seeded!.id)?.effectiveTo ?? undefined).toBeUndefined();
    expect(peekReparseMarker("wage-rate")).toBeNull();
  });

  // The shape the bulk wage update relies on: one owner transaction around several saves, and a
  // failure on any of them takes the whole batch - wage lines and marker - back with it.
  it("takes the whole batch back when one save in the caller's transaction fails", () => {
    const { database, employee } = openStorage();
    const other = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-014"
    );

    expect(other).toBeDefined();

    const firstBefore = listStoredEmployeeWageRates(employee.id);
    const markerBefore = peekReparseMarker("wage-rate");

    expect(markerBefore).toBeNull();

    database.exec(
      `CREATE TRIGGER fail_second_wage_insert_for_test BEFORE INSERT ON wage_rates WHEN NEW.employee_id = '${other!.id}' BEGIN SELECT RAISE(ABORT, 'second wage insert failed for test'); END;`
    );

    try {
      expect(() => {
        database.exec("BEGIN");

        try {
          saveStoredEmployeeWageRate({
            employeeId: employee.id,
            hourlyRate: 15000,
            effectiveFrom: "2026-03-01",
            reason: "batch test"
          });
          saveStoredEmployeeWageRate({
            employeeId: other!.id,
            hourlyRate: 15000,
            effectiveFrom: "2026-03-01",
            reason: "batch test"
          });
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      }).toThrowError("second wage insert failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_second_wage_insert_for_test");
    }

    expect(listStoredEmployeeWageRates(employee.id)).toEqual(firstBefore);
    expect(peekReparseMarker("wage-rate")).toBe(markerBefore);
  });
});
