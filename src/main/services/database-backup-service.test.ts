import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "database-backup");
const dbPath = path.resolve(testRoot, "database-backup.test.sqlite");
const userDataPath = path.resolve(testRoot, "user-data");

describe("database-backup-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should write a JSON snapshot and warn when no access file is configured", async () => {
    initializeSqliteStorage({ dbPath });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports"),
        allowanceProposalExportDir: path.resolve(testRoot, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRoot, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRoot, "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testRoot, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      { userDataPath }
    );

    const result = await runDatabaseBackupNow({ userDataPath });

    expect(existsSync(result.jsonBackupPath)).toBe(true);
    expect(existsSync(result.excelBackupPath ?? "")).toBe(true);
    expect(result.accessBackupPath).toBeUndefined();
    expect(result.warningMessages[0]).toContain("Access 원본 경로");

    const snapshot = JSON.parse(readFileSync(result.jsonBackupPath, "utf8")) as {
      tables: Record<string, unknown[]>;
    };
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(result.excelBackupPath ?? "");

    expect(Array.isArray(snapshot.tables.app_setting_entries)).toBe(true);
    expect(workbook.getWorksheet("app_setting_entries")).toBeTruthy();
    expect(workbook.getWorksheet("app_setting_entries")?.getCell("A1").text).toBe("setting_key");
    expect(workbook.getWorksheet("app_setting_entries")?.getCell("B1").text).toBe("value");
  });

  it("should copy the configured access source file in parallel", async () => {
    initializeSqliteStorage({ dbPath });
    const accessSourcePath = path.resolve(testRoot, "source.accdb");

    writeFileSync(accessSourcePath, "dummy-access-content");

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports"),
        allowanceProposalExportDir: path.resolve(testRoot, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRoot, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRoot, "allowance", "attachment2"),
        databaseBackupDir: path.resolve(testRoot, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: accessSourcePath
      },
      { userDataPath }
    );

    const result = await runDatabaseBackupNow({ userDataPath });

    expect(existsSync(result.jsonBackupPath)).toBe(true);
    expect(existsSync(result.excelBackupPath ?? "")).toBe(true);
    expect(result.accessBackupPath).toBeTruthy();
    expect(result.accessBackupPath ? existsSync(result.accessBackupPath) : false).toBe(true);
    expect(result.warningMessages).toHaveLength(0);
  });
});
