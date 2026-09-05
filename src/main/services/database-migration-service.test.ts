import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "./app-settings-storage-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import {
  buildAccessPerformanceRows,
  buildActiveWageMap,
  buildEmployeeRows,
  checkDatabaseMigrationRequirements,
  buildPatternRows,
  normalizeImportedEmployeeStatus,
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

  it("should preserve approval and audit history tables across a backup→restore round trip", async () => {
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

    // 직전 감사에서 critical로 지목된, 복원 시 소리 없이 사라지던 4개 이력 표를 시드한다.
    database
      .prepare(
        `INSERT INTO access_logs
          (id, user_id, login_id, display_name, role, action_type, action_label, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "access-1",
        "user-1",
        "reviewer1",
        "검토자",
        "reviewer",
        "performance-approve",
        "실적 승인",
        "2026-06-14T01:00:00.000Z"
      );

    database
      .prepare(
        `INSERT INTO allowance_approvals
          (id, calculation_id, work_month, employee_name, work_date, decision, processed_at, processed_by, processed_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "appr-1",
        "calc-1",
        "2026-03",
        "홍길동",
        "2026-03-02",
        "approved",
        "2026-06-14T01:05:00.000Z",
        "user-1",
        "검토자"
      );

    database
      .prepare(
        `INSERT INTO allowance_proposal_approvals
          (id, work_month, calculation_ids_json, calculation_count, employee_count, total_allowance_amount, export_record_id, approved_at, approved_by, approved_by_name, preview_snapshot_json, backup_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "prop-1",
        "2026-03",
        JSON.stringify(["calc-1"]),
        1,
        1,
        135450,
        "export-1",
        "2026-06-14T01:10:00.000Z",
        "user-1",
        "검토자",
        JSON.stringify({ rows: [] }),
        JSON.stringify({ jsonBackupPath: "" })
      );

    database
      .prepare(
        `INSERT INTO hidden_approved_performance_rows
          (id, approval_id, logical_key, file_id, entry_id, hidden_at, hidden_by, hidden_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "hidden-1",
        "approval-1",
        "2026-03:yuseong:OT",
        "file-1",
        "entry-1",
        "2026-06-14T01:15:00.000Z",
        "user-1",
        "검토자"
      );

    // 실제 백업을 만들고(그 백업이 4개 표를 담아야 함) 그 백업으로 복원한다.
    const backupSummary = await runDatabaseBackupNow({ userDataPath, env });
    const migrationFilePath = path.resolve(testRoot, "restore-source.json");
    copyFileSync(backupSummary.jsonBackupPath, migrationFilePath);

    const persistedBackup = JSON.parse(readFileSync(migrationFilePath, "utf8")) as {
      tables: Record<string, unknown[]>;
    };
    expect(persistedBackup.tables.allowance_approvals).toHaveLength(1);
    expect(persistedBackup.tables.allowance_proposal_approvals).toHaveLength(1);
    expect(persistedBackup.tables.hidden_approved_performance_rows).toHaveLength(1);

    await runDatabaseMigrationUpdate({
      userDataPath,
      migrationFilePath,
      env
    });

    const restoredDatabase = getSqliteDatabase()!;
    const hasId = (tableName: string, id: string) =>
      (
        restoredDatabase
          .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE id = ?`)
          .get(id) as { count: number }
      ).count;

    // 복원 후에도 결재·감사 이력이 살아 있어야 한다(이전에는 모두 0이 되었음).
    expect(hasId("allowance_approvals", "appr-1")).toBe(1);
    expect(hasId("allowance_proposal_approvals", "prop-1")).toBe(1);
    expect(hasId("hidden_approved_performance_rows", "hidden-1")).toBe(1);
    expect(hasId("access_logs", "access-1")).toBe(1);
  });

  it("should skip unknown backup columns instead of aborting the whole restore", async () => {
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

    const migrationFilePath = path.resolve(testRoot, "backup-with-extra-column.json");
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
                updated_at: null,
                // 현재 구조에 없는 컬럼(새 버전 백업을 옛 구조로 되돌리는 상황)
                bogus_future_column: "should-be-ignored"
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

    // 모르는 컬럼 때문에 복원 전체가 중단되지 않고, 알 수 있는 컬럼으로 정상 복원된다.
    const restoredDatabase = getSqliteDatabase()!;
    const rows = restoredDatabase
      .prepare(`SELECT site_code, name FROM sites`)
      .all() as Array<{ site_code: string; name: string }>;

    expect(rows).toEqual([{ site_code: "RESTORE-001", name: "복원근무지" }]);
    expect(summary.databaseState.siteCount).toBe(1);
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

  it("should mark json migration requirements as ready without additional runtime checks", () => {
    mkdirSync(testRoot, { recursive: true });

    const migrationFilePath = path.resolve(testRoot, "requirements-backup.json");
    writeFileSync(
      migrationFilePath,
      JSON.stringify(
        {
          tables: {}
        },
        null,
        2
      ),
      "utf8"
    );

    const requirementCheck = checkDatabaseMigrationRequirements({
      migrationFilePath
    });

    expect(requirementCheck.sourceType).toBe("json");
    expect(requirementCheck.isReady).toBe(true);
    expect(requirementCheck.status).toBe("not-required");
  });

  it("should reject directory paths before checking migration requirements", () => {
    const migrationDirectoryPath = path.resolve(testRoot, "migration-dir");

    mkdirSync(migrationDirectoryPath, { recursive: true });

    expect(() =>
      checkDatabaseMigrationRequirements({
        migrationFilePath: migrationDirectoryPath
      })
    ).toThrow("복원 경로가 파일이 아닙니다.");
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
      employee_rank: "대리",
      hourly_rate: 14044
    });

    const calculation = rows.calculations[0];

    expect(calculation).toMatchObject({
      employee_name: "정혜진",
      employee_rank: "대리",
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

  it("should preserve duplicate performance rows, import employee code 0 rows, and skip BP names", () => {
    const rows = buildAccessPerformanceRows({
      migrationFilePath: path.resolve(testRoot, "source.accdb"),
      modifiedTimeMs: Date.parse("2026-03-24T09:00:00.000Z"),
      createdAt: "2026-03-24T09:00:00.000Z",
      activeWageMap: new Map(),
      performanceRows: [
        {
          근무지: "판교DC",
          사원번호: 0,
          직원명: "백업근무자",
          직급명: "사원",
          근무사유: "긴급지원",
          근로유형: "평일 연장 근로",
          수당지급유형: "평_연장근로수당",
          근무예정자: "",
          증적자료: "복구보고서",
          근무날짜: "2026-04-01T00:00:00.0000000",
          근무시작시간_시: 20,
          근무시작시간_분: 0,
          근무종료시간_시: 22,
          근무종료시간_분: 0,
          총근로시간: 2,
          기본근로시간: 0,
          기본근로요율: 0,
          기본근로수당: 0,
          연장근로시간: 2,
          연장근로요율: 1.5,
          연장근로수당: 45000,
          야간근로시간: 0,
          야간근로요율: 2,
          야간근로수당: 0,
          통상시급: 15000,
          총근로수당: 45000,
          승인구분: false
        },
        {
          근무지: "판교DC",
          사원번호: 2026010,
          직원명: "중복허용",
          직급명: "사원",
          근무사유: "긴급지원",
          근로유형: "평일 연장 근로",
          수당지급유형: "평_연장근로수당",
          증적자료: "복구보고서",
          근무날짜: "2026-04-02T00:00:00.0000000",
          근무시작시간_시: 20,
          근무시작시간_분: 0,
          근무종료시간_시: 22,
          근무종료시간_분: 0,
          총근로시간: 2,
          기본근로시간: 0,
          기본근로요율: 0,
          기본근로수당: 0,
          연장근로시간: 2,
          연장근로요율: 1.5,
          연장근로수당: 45000,
          야간근로시간: 0,
          야간근로요율: 2,
          야간근로수당: 0,
          통상시급: 15000,
          총근로수당: 45000,
          승인구분: false
        },
        {
          근무지: "판교DC",
          사원번호: 2026010,
          직원명: "중복허용",
          직급명: "사원",
          근무사유: "긴급지원",
          근로유형: "평일 연장 근로",
          수당지급유형: "평_연장근로수당",
          증적자료: "복구보고서",
          근무날짜: "2026-04-02T00:00:00.0000000",
          근무시작시간_시: 20,
          근무시작시간_분: 0,
          근무종료시간_시: 22,
          근무종료시간_분: 0,
          총근로시간: 2,
          기본근로시간: 0,
          기본근로요율: 0,
          기본근로수당: 0,
          연장근로시간: 2,
          연장근로요율: 1.5,
          연장근로수당: 45000,
          야간근로시간: 0,
          야간근로요율: 2,
          야간근로수당: 0,
          통상시급: 15000,
          총근로수당: 45000,
          승인구분: false
        },
        {
          근무지: "판교DC",
          사원번호: 2026011,
          직원명: "BP",
          직급명: "사원",
          근무사유: "긴급지원",
          근로유형: "평일 연장 근로",
          수당지급유형: "평_연장근로수당",
          증적자료: "복구보고서",
          근무날짜: "2026-04-03T00:00:00.0000000",
          근무시작시간_시: 20,
          근무시작시간_분: 0,
          근무종료시간_시: 22,
          근무종료시간_분: 0,
          총근로시간: 2,
          기본근로시간: 0,
          기본근로요율: 0,
          기본근로수당: 0,
          연장근로시간: 2,
          연장근로요율: 1.5,
          연장근로수당: 45000,
          야간근로시간: 0,
          야간근로요율: 2,
          야간근로수당: 0,
          통상시급: 15000,
          총근로수당: 45000,
          승인구분: false
        }
      ]
    });

    expect(rows.entries).toHaveLength(3);
    expect(rows.entries.filter((row) => row.employee_name === "중복허용")).toHaveLength(2);
    expect(rows.entries.some((row) => row.employee_code === "0")).toBe(true);
    expect(rows.entries.some((row) => row.employee_name === "BP")).toBe(false);
    expect(rows.warningMessages.some((message) => message.includes("직원명이 BP"))).toBe(true);
  });

  it("should restore approved access rows with allowance amounts even when hourly rate is unresolved", () => {
    const rows = buildAccessPerformanceRows({
      migrationFilePath: path.resolve(testRoot, "source.accdb"),
      modifiedTimeMs: Date.parse("2026-03-24T09:00:00.000Z"),
      createdAt: "2026-03-24T09:00:00.000Z",
      activeWageMap: new Map(),
      performanceRows: [
        {
          근무지: "판교DC",
          사원번호: 2026020,
          직원명: "시급누락",
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
          총근로시간: 2,
          기본근로시간: 0,
          기본근로요율: 0,
          기본근로수당: 0,
          연장근로시간: 2,
          연장근로요율: 0,
          연장근로수당: 45000,
          야간근로시간: 0,
          야간근로요율: 0,
          야간근로수당: 0,
          통상시급: null,
          총근로수당: 45000,
          승인구분: true
        }
      ]
    });

    expect(rows.entries).toHaveLength(1);
    expect(rows.approvals).toHaveLength(1);
    expect(rows.calculations).toHaveLength(1);
    expect(rows.calculations[0]).toMatchObject({
      employee_name: "시급누락",
      hourly_rate: null,
      total_allowance_amount: 45000
    });
    expect(rows.entries[0]?.note).toContain("시급미반영항목");
    expect(rows.entries[0]?.alert_json).toContain("시급미반영항목");
    expect(
      rows.warningMessages.some((message) => message.includes("시급과 수당 금액을 모두 복원하지 못해"))
    ).toBe(false);
  });

  it("should restore allowance-bearing access rows even when required identity fields are missing", () => {
    const rows = buildAccessPerformanceRows({
      migrationFilePath: path.resolve(testRoot, "source.accdb"),
      modifiedTimeMs: Date.parse("2026-03-24T09:00:00.000Z"),
      createdAt: "2026-03-24T09:00:00.000Z",
      activeWageMap: new Map(),
      performanceRows: [
        {
          근무지: "",
          사원번호: "",
          직원명: "",
          직급명: "사원",
          근무사유: "긴급지원",
          근로유형: "평일 연장 근로",
          수당지급유형: "평_연장근로수당",
          증적자료: "복구보고서",
          근무날짜: "",
          근무시작시간_시: 20,
          근무시작시간_분: 0,
          근무종료시간_시: 22,
          근무종료시간_분: 0,
          총근로시간: 2,
          기본근로시간: 0,
          기본근로요율: 0,
          기본근로수당: 0,
          연장근로시간: 2,
          연장근로요율: 0,
          연장근로수당: 30000,
          야간근로시간: 0,
          야간근로요율: 0,
          야간근로수당: 0,
          통상시급: null,
          총근로수당: 30000,
          승인구분: false
        }
      ]
    });

    expect(rows.skippedRowCount).toBe(0);
    expect(rows.entries).toHaveLength(1);
    expect(rows.entries[0]).toMatchObject({
      site_name: "미지정 근무지",
      employee_name: "미상(1행)",
      work_date: "2026-03-24"
    });
    expect(rows.entries[0]?.note).toContain("복원보정항목");
    expect(rows.entries[0]?.alert_json).toContain("미지정 근무지로 복원");
    expect(
      rows.warningMessages.some((message) => message.includes("필수값 일부가 비어 있었지만 수당 금액이 있어 보정 복원"))
    ).toBe(true);
  });

  it("should collapse access employees by employee code before restore", () => {
    const rows = buildEmployeeRows({
      employeeRows: [
        {
          사원번호: "2026001",
          직원명: "홍길동",
          근무지: "판교DC",
          그룹명: "A",
          그룹번호: 1,
          그룹유형: "기본",
          직무적용일자: "2026-03-01",
          재직유무: true
        },
        {
          사원번호: "2026001",
          직원명: "홍길동_A",
          근무지: "판교DC",
          그룹명: "A",
          그룹번호: 1,
          그룹유형: "기본",
          직무적용일자: "2026-03-05",
          재직유무: true
        }
      ],
      performanceRows: [
        {
          근무지: "판교DC",
          사원번호: "2026001",
          직원명: "홍길동",
          직급명: "사원",
          근무날짜: "2026-03-01T00:00:00.0000000"
        },
        {
          근무지: "판교DC",
          사원번호: "2026001",
          직원명: "홍길동",
          직급명: "대리",
          근무날짜: "2026-03-10T00:00:00.0000000"
        }
      ],
      activeWageMap: new Map([
        [
          "2026001",
          {
            employeeCode: "2026001",
            employeeName: "홍길동",
            siteName: "판교DC",
            hourlyRate: 15000,
            effectiveFrom: "2026-03-01",
            reason: "Access import 20260301"
          }
        ]
      ]),
      siteIdByName: new Map([["판교DC", "site-1"]]),
      sourceYear: 2026,
      sourceVersion: "20260301",
      createdAt: "2026-03-24T00:00:00.000Z"
    });

    expect(rows.employees).toHaveLength(1);
    expect(rows.assignments).toHaveLength(1);
    expect(rows.wageRates).toHaveLength(1);
    expect(rows.employees[0]).toMatchObject({
      employee_code: "2026001",
      name: "홍길동",
      rank: "대리"
    });
    expect(rows.assignments[0]).toMatchObject({
      site_id: "site-1",
      start_date: "2026-03-05"
    });
  });

  it("should restore employees with whitespace-variant site names to the same site", () => {
    const rows = buildEmployeeRows({
      employeeRows: [
        {
          사원번호: "2026002",
          직원명: "이수민",
          근무지: "판교 DC",
          그룹명: "A",
          그룹번호: 1,
          그룹유형: "기본",
          직무적용일자: "2026-03-01",
          재직유무: true
        }
      ],
      activeWageMap: new Map(),
      siteIdByName: new Map([["판교DC", "site-1"]]),
      sourceYear: 2026,
      sourceVersion: "20260301",
      createdAt: "2026-03-24T00:00:00.000Z"
    });

    expect(rows.employees).toHaveLength(1);
    expect(rows.assignments).toHaveLength(1);
    expect(rows.assignments[0]).toMatchObject({
      site_id: "site-1",
      shift_group: "A조"
    });
    expect(rows.warningMessages).toEqual([]);
  });

  it("should default unclassified imported employee statuses to active", () => {
    expect(normalizeImportedEmployeeStatus("")).toBe("active");
    expect(normalizeImportedEmployeeStatus("미분류")).toBe("active");
    expect(normalizeImportedEmployeeStatus(undefined)).toBe("active");
    expect(normalizeImportedEmployeeStatus("퇴사")).toBe("retired");
    expect(normalizeImportedEmployeeStatus("휴직")).toBe("leave");

    const rows = buildEmployeeRows({
      employeeRows: [
        {
          사원번호: "2026003",
          직원명: "박정우",
          근무지: "판교DC",
          그룹명: "A",
          그룹번호: 1,
          그룹유형: "기본",
          직무적용일자: "2026-03-01",
          재직유무: "미분류"
        }
      ],
      activeWageMap: new Map(),
      siteIdByName: new Map([["판교DC", "site-1"]]),
      sourceYear: 2026,
      sourceVersion: "20260301",
      createdAt: "2026-03-24T00:00:00.000Z"
    });

    expect(rows.employees[0]?.status).toBe("active");
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

  it("should restore patterns when site names differ only by whitespace", () => {
    const rows = buildPatternRows({
      siteRows: [
        {
          근무지: "판교DC",
          근무형태: "3조 2교대",
          근무시작시간1: "1899-12-30T09:00:00.0000000",
          근무종료시간1: "1899-12-30T18:00:00.0000000",
          휴게시간1: 1,
          근무시작시간2: "1899-12-30T18:00:00.0000000",
          근무종료시간2: "1899-12-30T09:00:00.0000000",
          휴게시간2: 1
        }
      ],
      employeeRows: [{ 근무지: "판교DC", 그룹명: "A", 그룹번호: 1, 직원명: "김현우", 그룹유형: "기본" }],
      patternRows: [
        {
          근무지: "판교 DC",
          패턴시작날짜: "2026-03-01",
          근무시작패턴: "주야휴",
          근무유형: "3조2교대",
          A: 0
        }
      ],
      siteIdByName: new Map([["판교DC", "site-1"]]),
      sourceVersion: "20260412",
      createdAt: "2026-04-12T00:00:00.000Z"
    });

    expect(rows.importedPatternCount).toBe(1);
    expect(rows.skippedPatternSiteNames).toEqual([]);
    expect(rows.patterns[0]).toMatchObject({
      site_id: "site-1"
    });
  });

  it("should preserve imported access pattern strings for single-duty cycles", () => {
    const rows = buildPatternRows({
      siteRows: [
        {
          근무지: "SKB 동작국사",
          근무형태: "2조 3교대",
          근무시작시간1: "1899-12-30T06:00:00.0000000",
          근무종료시간1: "1899-12-30T14:00:00.0000000",
          휴게시간1: 1,
          근무시작시간2: "1899-12-30T14:00:00.0000000",
          근무종료시간2: "1899-12-30T22:00:00.0000000",
          휴게시간2: 1,
          근무시작시간3: "1899-12-30T22:00:00.0000000",
          근무종료시간3: "1899-12-30T06:00:00.0000000",
          휴게시간3: 1
        }
      ],
      employeeRows: [{ 근무지: "SKB 동작국사", 그룹명: "A", 그룹번호: 1, 직원명: "김현우", 그룹유형: "기본" }],
      patternRows: [
        {
          근무지: "SKB 동작국사",
          패턴시작날짜: "2026-03-01",
          근무시작패턴: "석*5휴",
          근무유형: "2조3교대",
          A: 0
        }
      ],
      siteIdByName: new Map([["SKB 동작국사", "site-1"]]),
      sourceVersion: "20260421",
      createdAt: "2026-04-21T00:00:00.000Z"
    });

    expect(rows.importedPatternCount).toBe(1);
    expect(rows.cycles[0]).toMatchObject({
      pattern_string: "석*5휴"
    });
    expect(rows.cycleSteps.slice(0, 5).every((step) => step.duty_code === "B")).toBe(true);
  });
});

describe("buildActiveWageMap (R-20)", () => {
  it("keeps one line per employee - the latest start date among applied rows - and drops the rest", () => {
    const map = buildActiveWageMap(
      [
        {
          사원번호: "2026001",
          직원명: "홍길동",
          근무지: "판교DC",
          통상시급: 14000,
          적용유무: true,
          시급등록일시: "2025-01-05T00:00:00.0000000"
        },
        {
          사원번호: "2026001",
          직원명: "홍길동",
          근무지: "판교DC",
          통상시급: 15000,
          적용유무: true,
          시급정의년도: 2026
        },
        // Not applied: ignored even though it is the newest.
        {
          사원번호: "2026001",
          직원명: "홍길동",
          근무지: "판교DC",
          통상시급: 16000,
          적용유무: false,
          시급등록일시: "2026-06-01T00:00:00.0000000"
        },
        // A zero wage is not a wage.
        { 사원번호: "2026001", 직원명: "홍길동", 근무지: "판교DC", 통상시급: 0, 적용유무: true },
        // No date at all: the source year's first day.
        { 사원번호: "2026002", 직원명: "김철수", 근무지: "판교DC", 통상시급: 13000, 적용유무: true }
      ],
      2026,
      "20260301"
    );

    expect(map.size).toBe(2);
    expect(map.get("2026001")).toMatchObject({
      hourlyRate: 15000,
      effectiveFrom: "2026-01-01",
      reason: "Access import 20260301"
    });
    expect(map.get("2026002")).toMatchObject({ hourlyRate: 13000, effectiveFrom: "2026-01-01" });
  });
});
