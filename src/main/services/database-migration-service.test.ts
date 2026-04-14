import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "./app-settings-storage-service";
import {
  buildAccessPerformanceRows,
  buildPatternRows,
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

  it("should replace the current sqlite database with a json backup while preserving current settings", async () => {
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
        databaseBackupDir: path.resolve(dataDir, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
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

    const summary = await runDatabaseMigrationUpdate({
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
    expect(existsSync(summary.backupSummary.jsonBackupPath)).toBe(true);

    const backupSnapshot = JSON.parse(readFileSync(summary.backupSummary.jsonBackupPath, "utf8")) as {
      tables: {
        sites?: Array<{ site_code: string }>;
      };
    };

    expect(backupSnapshot.tables.sites?.some((row) => row.site_code === "OLD-001")).toBe(true);

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

  it("should normalize short overtime access rows into overtime minutes and allowance amounts", () => {
    const rows = buildAccessPerformanceRows({
      migrationFilePath: path.resolve(testRoot, "source.accdb"),
      modifiedTimeMs: Date.parse("2026-03-24T09:00:00.000Z"),
      createdAt: "2026-03-24T09:00:00.000Z",
      activeWageMap: new Map(),
      performanceRows: [
        {
          근무지: "판교DC",
          사원번호: 2023023,
          직원명: "김영서",
          직급명: "사원",
          근무사유: "장애지원",
          근로유형: "평일 연장 근로",
          수당지급유형: "평_연장근로수당",
          증적자료: "장애 보고서",
          근무날짜: "2026-03-21T00:00:00.0000000",
          근무시작시간_시: 20,
          근무시작시간_분: 0,
          근무종료시간_시: 22,
          근무종료시간_분: 0,
          총근로시간: 1.5,
          기본근로시간: 1.5,
          기본근로요율: 0,
          기본근로수당: 0,
          연장근로시간: 0,
          연장근로요율: 1.5,
          연장근로수당: 0,
          야간근로시간: 0,
          야간근로요율: 2,
          야간근로수당: 0,
          통상시급: 13666,
          총근로수당: 0,
          승인구분: true
        }
      ]
    });

    expect(rows.entries).toHaveLength(1);
    expect(rows.entries[0]).toMatchObject({
      employee_name: "김영서",
      work_type: "overtime",
      total_work_minutes: 90,
      base_work_minutes: 0,
      overtime_minutes: 90,
      night_minutes: 0,
      hourly_rate: 13666
    });
    expect(rows.calculations).toHaveLength(1);
    expect(rows.calculations[0]).toMatchObject({
      employee_name: "김영서",
      work_type: "overtime",
      total_allowance_amount: 30749,
      base_work_minutes: 0,
      overtime_minutes: 90,
      night_minutes: 0
    });

    const snapshot = JSON.parse(rows.calculations[0]!.snapshot_json) as {
      lines: Array<{ allowanceCode: string; workMinutes: number; amount: number }>;
    };

    expect(snapshot.lines).toEqual([
      {
        allowanceCode: "overtime",
        workMinutes: 90,
        multiplier: 1.5,
        amount: 30749
      }
    ]);
  });

  it("should preserve access zero pattern indexes, derive team capacities, and enable Pool", () => {
    const rows = buildPatternRows({
      siteRows: [
        {
          근무지: "판교DC",
          근무형태: "3조 2교대",
          투입정원: 1,
          근무시작시간1: "1899-12-30T09:00:00.0000000",
          근무종료시간1: "1899-12-30T18:00:00.0000000",
          휴게시간1: 1,
          근무시작시간2: "1899-12-30T18:00:00.0000000",
          근무종료시간2: "1899-12-30T09:00:00.0000000",
          휴게시간2: 1.5
        }
      ],
      employeeRows: [
        { 근무지: "판교DC", 그룹명: "A", 그룹번호: 1, 직원명: "김현우", 그룹유형: "기본" },
        { 근무지: "판교DC", 그룹명: "A", 그룹번호: 2, 직원명: "None_A2", 그룹유형: "기본" },
        { 근무지: "판교DC", 그룹명: "B", 그룹번호: 1, 직원명: "이수민", 그룹유형: "기본" },
        { 근무지: "판교DC", 그룹명: "P", 그룹번호: 1, 직원명: "Pool_1", 그룹유형: "기본" }
      ],
      patternRows: [
        {
          근무지: "판교DC",
          패턴시작날짜: "2026-03-01",
          근무시작패턴: "주야휴",
          근무유형: "3조2교대",
          A: 0,
          B: 0,
          C: 2
        }
      ],
      siteIdByName: new Map([["판교DC", "site-1"]]),
      sourceVersion: "20260412",
      createdAt: "2026-04-12T00:00:00.000Z"
    });

    expect(rows.patterns[0]).toMatchObject({
      pool_enabled: 1,
      pool_start_time: "09:00",
      pool_end_time: "18:00",
      pool_break_minutes: 60
    });
    expect(rows.teamIndexes.map((item) => [item.team_label, item.team_index])).toEqual([
      ["A조", 0],
      ["B조", 0],
      ["C조", 2]
    ]);
    expect(rows.teamCapacities.map((item) => [item.team_label, item.max_headcount])).toEqual([
      ["A조", 2],
      ["B조", 1],
      ["C조", 1]
    ]);
  });
});
