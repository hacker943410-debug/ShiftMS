import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStoredEmployees } from "./employee-storage-service";
import {
  listStoredMonthlySchedules,
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { previewMonthlySchedulePlan } from "./schedule-plan-preview-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

describe("schedule-plan-preview-service", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should build a cell update preview from a stored monthly schedule", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-preview.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = listStoredEmployees({ siteId: site?.id }).find(
      (item) => item.employeeCode === "EMP-001"
    );

    saveStoredMonthlySchedule({
      siteId: site!.id,
      scheduleMonth: "2024-10",
      patternId: pattern!.id,
      generatedBy: "admin",
      items: [
        {
          employeeCode: employee!.employeeCode,
          workDate: "2024-10-27",
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: employee!.employeeCode,
          workDate: "2024-10-28",
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        }
      ]
    });

    const savedSchedule = listStoredMonthlySchedules(site!.id)[0];
    const preview = await previewMonthlySchedulePlan(savedSchedule.id);

    expect(preview?.siteName).toBe("보라매DC");
    expect(preview?.templateSheetName).toBe("교대 근무 계획표");
    expect(preview?.updates).toEqual([
      { address: "C3", value: "보라매DC" },
      { address: "C10", value: "EMP-001" },
      { address: "F12", value: "EMP-001" }
    ]);
  });
});
