import { closeSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
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

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(process.cwd(), "artifacts", "tests", "schedule-publish", "pending"),
        approvedDir: publishDir,
        scheduleExportDir: exportDir,
        allowanceProposalExportDir: path.resolve(
          process.cwd(),
          "artifacts",
          "tests",
          "schedule-publish",
          "allowance",
          "proposal"
        ),
        allowanceAttachment1ExportDir: path.resolve(
          process.cwd(),
          "artifacts",
          "tests",
          "schedule-publish",
          "allowance",
          "attachment1"
        ),
        allowanceAttachment2ExportDir: path.resolve(
          process.cwd(),
          "artifacts",
          "tests",
          "schedule-publish",
          "allowance",
          "attachment2"
        ),
        databaseBackupDir: path.resolve(
          process.cwd(),
          "artifacts",
          "tests",
          "schedule-publish",
          "backups"
        ),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      {
        userDataPath: process.cwd()
      }
    );

    const exported = await exportMonthlySchedulePlan({
      scheduleId: schedule.id,
      userDataPath: process.cwd()
    });
    const published = publishSchedulePlanExport({
      exportId: exported!.id,
      userDataPath: process.cwd()
    });

    expect(published?.publishStatus).toBe("published");
    expect(published?.publishedPath).toBeTruthy();
    expect(published?.templateVersionLabel).toBe("근무표 양식 1");
    expect(existsSync(published!.publishedPath!)).toBe(true);
    expect(listStoredSchedulePlanExports()[0]?.publishStatus).toBe("published");
    expect(path.dirname(exported!.outputPath)).toBe(path.resolve(exportDir, "2024년", "10월"));
    expect(path.dirname(published!.publishedPath!)).toBe(publishDir);
  });

  it("should avoid overwriting an existing file in the approved directory", async () => {
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

    const existingTargetPath = path.resolve(publishDir, exported!.outputFileName);
    mkdirSync(publishDir, { recursive: true });
    closeSync(openSync(existingTargetPath, "w"));

    const published = publishSchedulePlanExport({
      exportId: exported!.id,
      userDataPath: process.cwd(),
      outputDir: publishDir
    });

    expect(published?.publishedPath).not.toBe(existingTargetPath);
    expect(published?.publishedPath?.includes("_dup01")).toBe(true);
    expect(existsSync(existingTargetPath)).toBe(true);
    expect(existsSync(published!.publishedPath!)).toBe(true);
  });
});
