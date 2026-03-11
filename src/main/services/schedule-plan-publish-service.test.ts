import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStoredEmployees } from "./employee-storage-service";
import {
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import {
  listStoredSchedulePlanExports,
  resetSchedulePlanExportHistoryForTest
} from "./schedule-plan-export-history-service";
import { publishSchedulePlanExport } from "./schedule-plan-publish-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const exportDir = path.resolve(process.cwd(), "artifacts", "tests", "schedule-publish", "exports");
const publishDir = path.resolve(process.cwd(), "artifacts", "tests", "schedule-publish", "approved");

describe("schedule-plan-publish-service", () => {
  afterEach(() => {
    resetMonthlyScheduleStorageForTest();
    resetSchedulePlanExportHistoryForTest();
    resetSqliteStorageForTest();
    rmSync(path.resolve(process.cwd(), "artifacts", "tests", "schedule-publish"), {
      recursive: true,
      force: true
    });
  });

  it("should copy an exported schedule file into the approved directory", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-publish.test.sqlite")
    });

    const site = listStoredSites().find((item) => item.name === "보라매DC");
    const pattern = listStoredShiftPatterns(site?.id)[0];
    const employee = listStoredEmployees({ siteId: site?.id }).find(
      (item) => item.employeeCode === "EMP-001"
    );
    const schedule = saveStoredMonthlySchedule({
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
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: schedule.id,
      userDataPath: process.cwd(),
      outputDir: exportDir
    });
    const published = publishSchedulePlanExport({
      exportId: exported!.id,
      userDataPath: process.cwd(),
      outputDir: publishDir
    });

    expect(published?.publishStatus).toBe("published");
    expect(published?.publishedPath).toBeTruthy();
    expect(existsSync(published!.publishedPath!)).toBe(true);
    expect(listStoredSchedulePlanExports()[0]?.publishStatus).toBe("published");
  });
});
