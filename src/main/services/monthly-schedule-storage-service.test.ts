import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { acknowledgeReparseMarker, peekReparseMarker } from "./app-settings-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredSites } from "./site-storage-service";
import { listStoredEmployees, saveStoredEmployee } from "./employee-storage-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import {
  listStoredMonthlySchedules,
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";

describe("monthly-schedule-storage-service", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should save and list a monthly schedule with enriched items", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "monthly-schedules.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id).find((item) => item.name === "보라매 4조 2교대");
    const firstEmployee = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");
    const secondEmployee = listStoredEmployees().find((item) => item.employeeCode === "EMP-014");

    expect(site).toBeDefined();
    expect(pattern).toBeDefined();
    expect(firstEmployee).toBeDefined();
    expect(secondEmployee).toBeDefined();

    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-04",
      patternId: pattern!.id,
      generatedBy: "admin",
      items: [
        {
          employeeCode: firstEmployee!.employeeCode,
          workDate: "2026-04-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60,
          sortOrder: 1
        },
        {
          employeeCode: secondEmployee!.employeeCode,
          workDate: "2026-04-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60,
          sortOrder: 0
        }
      ]
    });

    expect(saved.siteName).toBe("보라매DC");
    expect(saved.patternName).toBe("보라매 4조 2교대");
    expect(saved.items).toHaveLength(2);
    expect(saved.items.map((item) => item.employeeCode)).toEqual(["EMP-014", "EMP-001"]);
    expect(saved.items.map((item) => item.sortOrder)).toEqual([0, 1]);
    expect(listStoredMonthlySchedules(site!.id)).toHaveLength(1);
  });

  it("should exclude schedule items on and after an employee retirement date", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "monthly-schedules.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id).find((item) => item.name === "보라매 4조 2교대");
    const employee = listStoredEmployees({ siteId: site?.id }).find(
      (item) => item.employeeCode === "EMP-001"
    );

    expect(site).toBeDefined();
    expect(pattern).toBeDefined();
    expect(employee).toBeDefined();

    saveStoredEmployee({
      id: employee!.id,
      employeeCode: employee!.employeeCode,
      name: employee!.name,
      employmentType: employee!.employmentType,
      status: "retired",
      hireDate: employee!.hireDate ?? "2023-03-01",
      retireDate: "2026-04-02"
    });

    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-04",
      patternId: pattern!.id,
      generatedBy: "admin",
      items: [
        {
          employeeCode: employee!.employeeCode,
          workDate: "2026-04-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employee!.employeeCode,
          workDate: "2026-04-02",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]?.workDate).toBe("2026-04-01");
    expect(listStoredMonthlySchedules(site!.id)[0]?.items).toHaveLength(1);
  });

  it("should keep the previous schedule when an update item references a missing employee", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "monthly-schedules.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id).find((item) => item.name === "보라매 4조 2교대");
    const employee = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");

    expect(site).toBeDefined();
    expect(pattern).toBeDefined();
    expect(employee).toBeDefined();

    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-04",
      patternId: pattern!.id,
      generatedBy: "admin",
      items: [
        {
          employeeCode: employee!.employeeCode,
          workDate: "2026-04-01",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    expect(() =>
      saveStoredMonthlySchedule({
        id: saved.id,
        siteId: site!.id,
        scheduleMonth: "2026-04",
        patternId: pattern!.id,
        generatedBy: "admin",
        items: [
          {
            employeeCode: "EMP-MISSING",
            workDate: "2026-04-02",
            dutyCode: "N",
            startTime: "18:00",
            endTime: "06:00",
            breakMinutes: 60
          }
        ]
      })
    ).toThrowError("직원 사번을 찾을 수 없습니다: EMP-MISSING");

    const current = listStoredMonthlySchedules(site!.id).find((schedule) => schedule.id === saved.id);

    expect(current?.items).toHaveLength(1);
    expect(current?.items[0]?.employeeCode).toBe(employee!.employeeCode);
    expect(current?.items[0]?.workDate).toBe("2026-04-01");
  });
});

// A stored monthly schedule is what the parser reads a file against. Saving one - first save or a
// regeneration of the same month - leaves a reparse marker with the schedule, in the same
// transaction, so the next overview reads the pending files again.
describe("monthly-schedule-storage-service · reparse marker", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
  });

  const spendMonthlyScheduleMarker = () => {
    const token = peekReparseMarker("monthly-schedule");

    if (token !== null) {
      acknowledgeReparseMarker("monthly-schedule", token);
    }

    return token !== null;
  };

  it("leaves the monthly-schedule reparse marker on a first save and again on a regeneration", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "monthly-schedules.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id).find((item) => item.name === "보라매 4조 2교대");
    const employee = listStoredEmployees().find((item) => item.employeeCode === "EMP-001");
    const item = {
      employeeCode: employee!.employeeCode,
      workDate: "2026-04-01",
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00",
      breakMinutes: 60,
      sortOrder: 0
    };

    expect(spendMonthlyScheduleMarker()).toBe(false);

    const saved = saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2026-04",
      patternId: pattern!.id,
      generatedBy: "admin",
      items: [item]
    });

    expect(spendMonthlyScheduleMarker()).toBe(true);
    expect(spendMonthlyScheduleMarker()).toBe(false);

    // The same month regenerated in place: the marker is left again.
    saveStoredMonthlySchedule({
      id: saved.id,
      siteId: site!.id,
      scheduleMonth: "2026-04",
      patternId: pattern!.id,
      generatedBy: "admin",
      items: [{ ...item, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 }]
    });

    expect(spendMonthlyScheduleMarker()).toBe(true);

    // A save that fails (unknown employee code) rolls back and leaves no marker.
    expect(() =>
      saveStoredMonthlySchedule({
        id: saved.id,
        siteId: site!.id,
        scheduleMonth: "2026-04",
        patternId: pattern!.id,
        generatedBy: "admin",
        items: [{ ...item, employeeCode: "NO-SUCH-CODE" }]
      })
    ).toThrow();
    expect(spendMonthlyScheduleMarker()).toBe(false);
  });
});
