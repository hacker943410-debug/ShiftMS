import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { listStoredSites } from "./site-storage-service";
import { listStoredEmployees } from "./employee-storage-service";
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
    const employee = listStoredEmployees({ siteId: site?.id }).find(
      (item) => item.employeeCode === "EMP-001"
    );

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

    expect(saved.siteName).toBe("보라매DC");
    expect(saved.patternName).toBe("보라매 4조 2교대");
    expect(saved.items).toHaveLength(2);
    expect(saved.items[0]?.employeeCode).toBe("EMP-001");
    expect(listStoredMonthlySchedules(site!.id)).toHaveLength(1);
  });
});
