import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { listStoredEmployees } from "./employee-storage-service";
import {
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testOutputDir = path.resolve(process.cwd(), "artifacts", "tests", "schedule-exports");

describe("schedule-plan-export-service", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSqliteStorageForTest();
    rmSync(testOutputDir, { recursive: true, force: true });
  });

  it("should export a schedule workbook file from stored monthly data", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = listStoredEmployees({ siteId: site?.id }).find(
      (item) => item.employeeCode === "EMP-001"
    );
    const saved = saveStoredMonthlySchedule({
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

    const exported = await exportMonthlySchedulePlan({
      scheduleId: saved.id,
      userDataPath: process.cwd(),
      outputDir: testOutputDir
    });

    expect(exported).not.toBeNull();
    expect(existsSync(exported!.outputPath)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported!.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    expect(worksheet.getCell("C3").value).toBe("보라매DC");
    expect(worksheet.getCell("C10").value).toBe("EMP-001");
    expect(worksheet.getCell("F12").value).toBe("EMP-001");
  });
});
