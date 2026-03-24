import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "./app-settings-storage-service";
import {
  buildAccessPerformanceRows,
  previewDatabaseMigrationUpdate,
  runDatabaseMigrationUpdate
} from "./database-migration-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "database-migration");
const userDataPath = path.resolve(testRoot, "user-data");
const dataDir = path.resolve(testRoot, "data");
const dbPath = path.resolve(dataDir, "shiftmgmt.sqlite");
const env = {
  DATA_DIR: dataDir
};

describe("database-migration-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should replace the current sqlite database with a json backup while preserving current settings", () => {
    mkdirSync(testRoot, { recursive: true });
    initializeSqliteStorage({
      dbPath,
      userDataPath,
      env
    });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(dataDir, "pending"),
        approvedDir: path.resolve(dataDir, "approved"),
        scheduleExportDir: path.resolve(dataDir, "exports"),
        allowanceProposalExportDir: path.resolve(dataDir, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(dataDir, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(dataDir, "allowance", "attachment2"),
        migrationFilePath: ""
      },
      {
        userDataPath,
        env
      }
    );

    const database = getSqliteDatabase()!;
    database.prepare(`
      INSERT INTO sites (id, site_code, name, status, timezone, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "site-old",
      "OLD-001",
      "기존근무지",
      "active",
      "Asia/Seoul",
      null,
      "2026-03-24T00:00:00.000Z",
      null
    );

    const migrationFilePath = path.resolve(testRoot, "backup.json");
    writeFileSync(
      migrationFilePath,
      JSON.stringify(
        {
          tables: {
            sites: [
              {
                id: "site-restored",
                site_code: "RESTORE-001",
                name: "복원근무지",
                status: "active",
                timezone: "Asia/Seoul",
                deleted_at: null,
                created_at: "2026-03-24T01:00:00.000Z",
                updated_at: null
              }
            ]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const summary = runDatabaseMigrationUpdate({
      userDataPath,
      migrationFilePath,
      env
    });

    const restoredDatabase = getSqliteDatabase()!;
    const rows = restoredDatabase.prepare(`
      SELECT site_code, name
      FROM sites
      ORDER BY name ASC
    `).all() as Array<{ site_code: string; name: string }>;

    expect(rows).toEqual([
      {
        site_code: "RESTORE-001",
        name: "복원근무지"
      }
    ]);
    expect(summary.sourceType).toBe("json");
    expect(summary.restoredTableCount).toBe(1);
    expect(summary.databasePath).toBe(dbPath);
    expect(summary.databaseState.siteCount).toBe(1);
    expect(summary.databaseState.performanceFileCount).toBe(0);

    const settings = getStoredAppSettingsSnapshot({
      userDataPath,
      env
    });

    expect(settings.pendingDir).toBe(path.resolve(dataDir, "pending"));
    expect(settings.approvedDir).toBe(path.resolve(dataDir, "approved"));
    expect(settings.migrationFilePath).toBe(migrationFilePath);
  });

  it("should preview a json backup without replacing the current database", () => {
    mkdirSync(testRoot, { recursive: true });
    initializeSqliteStorage({
      dbPath,
      userDataPath,
      env
    });

    const database = getSqliteDatabase()!;
    database.prepare(`
      INSERT INTO sites (id, site_code, name, status, timezone, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "site-current",
      "CUR-001",
      "현재근무지",
      "active",
      "Asia/Seoul",
      null,
      "2026-03-24T00:00:00.000Z",
      null
    );

    const migrationFilePath = path.resolve(testRoot, "preview-backup.json");
    writeFileSync(
      migrationFilePath,
      JSON.stringify(
        {
          tables: {
            sites: [
              {
                id: "site-preview",
                site_code: "PREVIEW-001",
                name: "미리보기근무지",
                status: "active",
                timezone: "Asia/Seoul",
                deleted_at: null,
                created_at: "2026-03-24T01:00:00.000Z",
                updated_at: null
              }
            ],
            employees: [
              {
                id: "employee-preview",
                employee_code: "2026001",
                name: "미리보기인력",
                employment_type: "정규직",
                status: "active",
                hire_date: null,
                retire_date: null,
                created_at: "2026-03-24T01:00:00.000Z",
                updated_at: null
              }
            ]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const preview = previewDatabaseMigrationUpdate({
      userDataPath,
      migrationFilePath,
      env
    });

    expect(preview.sourceType).toBe("json");
    expect(preview.currentState.siteCount).toBe(1);
    expect(preview.previewState.siteCount).toBe(1);
    expect(preview.previewState.employeeCount).toBe(1);
    expect(preview.restoredTableCount).toBe(2);

    const currentRows = getSqliteDatabase()!.prepare(`
      SELECT site_code, name
      FROM sites
      ORDER BY name ASC
    `).all() as Array<{ site_code: string; name: string }>;

    expect(currentRows).toEqual([
      {
        site_code: "CUR-001",
        name: "현재근무지"
      }
    ]);
  });

  it("should transform access performance rows into performance, approval, and allowance records", () => {
    const rows = buildAccessPerformanceRows({
      migrationFilePath: path.resolve(testRoot, "source.accdb"),
      modifiedTimeMs: Date.parse("2026-03-24T09:00:00.000Z"),
      createdAt: "2026-03-24T09:00:00.000Z",
      activeWageMap: new Map(),
      performanceRows: [
        {
          근무지: "판교DC",
          사원번호: 2021021,
          직원명: "정혜진",
          직급명: "대리",
          근무사유: "법정휴일근무",
          근로유형: "법정 휴일 근로",
          수당지급유형: "법정 휴일 근로 수당",
          증적자료: null,
          근무날짜: "2024-08-15T00:00:00.0000000",
          근무시작시간_시: 8,
          근무시작시간_분: 0,
          근무종료시간_시: 20,
          근무종료시간_분: 0,
          총근로시간: 10.5,
          기본근로시간: 8,
          기본근로요율: 1.5,
          기본근로수당: 168528,
          연장근로시간: 2.5,
          연장근로요율: 1.5,
          연장근로수당: 52665,
          야간근로시간: 0,
          야간근로요율: 1.5,
          야간근로수당: 0,
          통상시급: null,
          총근로수당: 221200,
          승인구분: true
        },
        {
          근무지: "판교DC",
          사원번호: 0,
          직원명: "전인환(P)",
          직급명: null,
          근무사유: "연차휴가",
          근로유형: "주간 대체 근무",
          수당지급유형: "주간 대체 근로 수당",
          증적자료: "휴가 신청서",
          근무날짜: "2025-08-05T00:00:00.0000000",
          근무시작시간_시: 8,
          근무시작시간_분: 0,
          근무종료시간_시: 20,
          근무종료시간_분: 0,
          총근로시간: 10.5,
          기본근로시간: 8,
          기본근로요율: 1,
          기본근로수당: 130480,
          연장근로시간: 2.5,
          연장근로요율: 1.5,
          연장근로수당: 61162.5,
          야간근로시간: 0,
          야간근로요율: 1.5,
          야간근로수당: 0,
          통상시급: 16310,
          총근로수당: 191643,
          승인구분: false
        }
      ]
    });

    expect(rows.importedFileCount).toBe(1);
    expect(rows.importedEntryCount).toBe(1);
    expect(rows.importedApprovedEntryCount).toBe(1);
    expect(rows.importedAllowanceCalculationCount).toBe(1);
    expect(rows.files).toHaveLength(2);
    expect(rows.files.some((item) => item.directory_type === "unknown")).toBe(true);
    expect(rows.entries).toHaveLength(2);

    const approvedEntry = rows.entries.find((item) => item.employee_name === "정혜진");

    expect(approvedEntry).toMatchObject({
      site_name: "판교DC",
      work_type: "holiday",
      section: "legal-holiday",
      start_time: "08:00",
      end_time: "20:00",
      break_minutes: 90,
      total_work_minutes: 630,
      base_work_minutes: 480,
      overtime_minutes: 150,
      night_minutes: 0,
      hourly_rate: 14044
    });

    const calculation = rows.calculations[0];

    expect(calculation).toMatchObject({
      employee_name: "정혜진",
      work_type: "holiday",
      total_allowance_amount: 221200
    });

    const snapshot = JSON.parse(calculation.snapshot_json) as {
      businessCategoryCode: string;
      breakdown: { holidayMinutes: number };
      lines: Array<{ allowanceCode: string; amount: number }>;
    };

    expect(snapshot.businessCategoryCode).toBe("legal-holiday");
    expect(snapshot.breakdown.holidayMinutes).toBe(630);
    expect(snapshot.lines).toEqual([
      { allowanceCode: "base", workMinutes: 480, multiplier: 1.5, amount: 168528 },
      { allowanceCode: "overtime", workMinutes: 150, multiplier: 1.5, amount: 52665 }
    ]);
  });
});
