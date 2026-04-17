import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "database-backup");
const dataDir = path.resolve(testRoot, "data");
const dbPath = path.resolve(dataDir, "database-backup.test.sqlite");
const userDataPath = path.resolve(testRoot, "user-data");
const env = {
  DATA_DIR: dataDir
};

describe("database-backup-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should write a JSON snapshot and warn when no access file is configured", async () => {
    initializeSqliteStorage({ dbPath, env });

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
      { userDataPath, env }
    );

    const result = await runDatabaseBackupNow({ userDataPath, env });

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
    initializeSqliteStorage({ dbPath, env });
    const accessSourcePath = path.resolve(dataDir, "source.accdb");
    const relativeAccessSourcePath = path.relative(dataDir, accessSourcePath);

    mkdirSync(dataDir, { recursive: true });
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
        migrationFilePath: relativeAccessSourcePath
      },
      { userDataPath, env }
    );

    const result = await runDatabaseBackupNow({ userDataPath, env });

    expect(existsSync(result.jsonBackupPath)).toBe(true);
    expect(existsSync(result.excelBackupPath ?? "")).toBe(true);
    expect(result.accessBackupPath).toBeTruthy();
    expect(result.accessBackupPath ? existsSync(result.accessBackupPath) : false).toBe(true);
    expect(result.warningMessages).toHaveLength(0);
  });

  it("should warn when the configured access source path is a directory", async () => {
    initializeSqliteStorage({ dbPath, env });
    const accessSourceDir = path.resolve(dataDir, "source.accdb");
    const relativeAccessSourceDir = path.relative(dataDir, accessSourceDir);

    mkdirSync(accessSourceDir, { recursive: true });

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
        migrationFilePath: relativeAccessSourceDir
      },
      { userDataPath, env }
    );

    const result = await runDatabaseBackupNow({ userDataPath, env });

    expect(result.accessBackupPath).toBeUndefined();
    expect(result.warningMessages).toContain(
      "설정된 Access 원본 경로가 파일이 아니어서 Access 백업은 생략했습니다."
    );
  });
});
