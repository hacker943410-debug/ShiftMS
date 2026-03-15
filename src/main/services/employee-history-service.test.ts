import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStoredEmployees, resetEmployeeStorageForTest } from "./employee-storage-service";
import {
  closeStoredEmployeeAssignment,
  closeStoredEmployeeWageRate,
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate
} from "./employee-history-service";
import { listStoredSites } from "./site-storage-service";
import { listStoredShiftPatterns, saveStoredShiftPattern } from "./shift-pattern-storage-service";
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

  it("should reject wage rate changes that overlap the current active wage", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "employee-history.test.sqlite")
    });

    const employee = listStoredEmployees().find(
      (targetEmployee) => targetEmployee.employeeCode === "EMP-001"
    );

    expect(employee).toBeDefined();

    const currentWageRate = listStoredEmployeeWageRates(employee!.id)[0];

    expect(currentWageRate).toBeDefined();

    expect(() =>
      saveStoredEmployeeWageRate({
        employeeId: employee!.id,
        hourlyRate: 13600,
        effectiveFrom: currentWageRate!.effectiveFrom,
        reason: "중복 변경"
      })
    ).toThrow("Effective date must be later than current wage rate.");
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
      shiftGroup: "주간조",
      startDate: "2026-04-01"
    });

    const assignments = listStoredEmployeeAssignments(employee!.id);

    expect(saved.siteId).toBe(site!.id);
    expect(saved.siteName).toBe(site!.name);
    expect(saved.shiftGroup).toBe("주간조");
    expect(assignments).toHaveLength(2);
    expect(assignments[0]?.siteName).toBe(site!.name);
    expect(assignments[0]?.status).toBe("active");
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
});
