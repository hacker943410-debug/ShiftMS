import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  closeSqliteStorage,
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest,
  runInSqliteTransaction
} from "./sqlite-storage-service";

describe("sqlite-storage-service", () => {
  it("should initialize the sqlite file and apply runtime tables", () => {
    const dbPath = path.resolve(process.cwd(), "artifacts", "tests", "sqlite-storage.test.sqlite");

    initializeSqliteStorage({ dbPath });

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    const tables = database!.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    expect(tables.map((item) => item.name)).toContain("performance_approvals");
    expect(tables.map((item) => item.name)).toContain("allowance_calculations");
    expect(tables.map((item) => item.name)).toContain("allowance_calculation_items");
    expect(tables.map((item) => item.name)).toContain("allowance_document_exports");
    expect(tables.map((item) => item.name)).toContain("performance_files");
    expect(tables.map((item) => item.name)).toContain("performance_entries");
    expect(tables.map((item) => item.name)).toContain("sites");
    expect(tables.map((item) => item.name)).toContain("employees");
    expect(tables.map((item) => item.name)).toContain("employee_site_assignments");
    expect(tables.map((item) => item.name)).toContain("wage_rates");
    expect(tables.map((item) => item.name)).toContain("shift_patterns");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_steps");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_cycles");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_cycle_steps");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_cycle_team_indexes");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_team_cycles");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_team_capacities");
    expect(tables.map((item) => item.name)).toContain("shift_pattern_team_settings");
    expect(tables.map((item) => item.name)).toContain("monthly_schedules");
    expect(tables.map((item) => item.name)).toContain("monthly_schedule_items");
    expect(tables.map((item) => item.name)).toContain("schedule_plan_exports");
    expect(tables.map((item) => item.name)).toContain("holiday_calendars");
    expect(tables.map((item) => item.name)).toContain("holiday_items");
    expect(tables.map((item) => item.name)).toContain("allowance_rate_versions");
    expect(tables.map((item) => item.name)).toContain("allowance_rate_items");
    expect(tables.map((item) => item.name)).toContain("app_users");
    expect(tables.map((item) => item.name)).toContain("document_template_versions");
    expect(tables.map((item) => item.name)).toContain("app_setting_entries");

    const shiftPatternColumns = database!.prepare(`
      PRAGMA table_info(shift_patterns)
    `).all() as Array<{ name: string }>;
    const approvalColumns = database!.prepare(`
      PRAGMA table_info(performance_approvals)
    `).all() as Array<{ name: string }>;
    const employeeColumns = database!.prepare(`
      PRAGMA table_info(employees)
    `).all() as Array<{ name: string }>;
    const performanceEntryColumns = database!.prepare(`
      PRAGMA table_info(performance_entries)
    `).all() as Array<{ name: string }>;
    const allowanceCalculationColumns = database!.prepare(`
      PRAGMA table_info(allowance_calculations)
    `).all() as Array<{ name: string }>;
    const appUserColumns = database!.prepare(`
      PRAGMA table_info(app_users)
    `).all() as Array<{ name: string }>;

    expect(employeeColumns.map((item) => item.name)).toContain("rank");
    expect(performanceEntryColumns.map((item) => item.name)).toContain("employee_rank");
    expect(allowanceCalculationColumns.map((item) => item.name)).toContain("employee_rank");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("team_count");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pattern_start_date");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_enabled");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_start_time");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_end_time");
    expect(shiftPatternColumns.map((item) => item.name)).toContain("pool_break_minutes");
    expect(approvalColumns.map((item) => item.name)).toContain("archived_file_name");
    expect(approvalColumns.map((item) => item.name)).toContain("archived_file_path");
    expect(appUserColumns.map((item) => item.name)).toContain("password_hash");
    expect(appUserColumns.map((item) => item.name)).toContain("must_change_password");
    expect(appUserColumns.map((item) => item.name)).toContain("sign_in_failure_count");
    expect(appUserColumns.map((item) => item.name)).toContain("sign_in_locked_until");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_key_hash");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_key_issued_at");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_failure_count");
    expect(appUserColumns.map((item) => item.name)).toContain("account_recovery_locked_until");
    expect(appUserColumns.map((item) => item.name)).toContain("extension_number");

    closeSqliteStorage();
    resetSqliteStorageForTest();
  });
});

// A save made of several writes has to land whole or not at all, and some of those saves are
// already called from inside another save's transaction. This helper is what decides who owns the
// transaction, and the joining branch is exercised by callers that do not exist yet - so it is
// pinned here rather than only through them.
describe("sqlite-storage-service · runInSqliteTransaction", () => {
  const dbPath = path.resolve(process.cwd(), "artifacts", "tests", "sqlite-transaction.test.sqlite");

  afterEach(() => {
    resetSqliteStorageForTest();
  });

  const prepareProbeTable = () => {
    initializeSqliteStorage({ dbPath });

    const database = getSqliteDatabase()!;

    database.exec("CREATE TABLE IF NOT EXISTS transaction_probe (id TEXT PRIMARY KEY);");
    database.exec("DELETE FROM transaction_probe;");

    return database;
  };

  const countProbeRows = (database: DatabaseSync) =>
    Number(
      (database.prepare("SELECT COUNT(*) AS n FROM transaction_probe").get() as { n: number }).n
    );

  it("commits its own transaction and leaves none open", () => {
    const database = prepareProbeTable();

    const result = runInSqliteTransaction(database, () => {
      database.prepare("INSERT INTO transaction_probe (id) VALUES (?)").run("committed");

      return "done";
    });

    expect(result).toBe("done");
    expect(countProbeRows(database)).toBe(1);
    expect(database.isTransaction).toBe(false);
  });

  it("rolls its own transaction back whole when the work throws", () => {
    const database = prepareProbeTable();

    database.prepare("INSERT INTO transaction_probe (id) VALUES (?)").run("before");

    expect(() =>
      runInSqliteTransaction(database, () => {
        database.prepare("INSERT INTO transaction_probe (id) VALUES (?)").run("during");

        throw new Error("work failed for test");
      })
    ).toThrowError("work failed for test");

    expect(countProbeRows(database)).toBe(1);
    expect(database.isTransaction).toBe(false);
  });

  it("joins an open transaction without committing or rolling it back", () => {
    const database = prepareProbeTable();

    database.exec("BEGIN");
    runInSqliteTransaction(database, () => {
      database.prepare("INSERT INTO transaction_probe (id) VALUES (?)").run("joined");
    });

    // The caller still owns it: a join must neither commit nor end the transaction.
    expect(database.isTransaction).toBe(true);

    database.exec("ROLLBACK");

    expect(countProbeRows(database)).toBe(0);
    expect(database.isTransaction).toBe(false);
  });

  // The window this guards: isTransaction is connection-wide, so an await inside the work hands the
  // event loop to another IPC handler whose save joins THIS transaction and dies with its rollback.
  // Silent data loss - so the helper refuses the thenable and rolls its own transaction back.
  it("refuses work that hands the event loop away, and rolls the transaction back", () => {
    const statements: string[] = [];
    const fakeDatabase = {
      isTransaction: false,
      exec(statement: string) {
        statements.push(statement);

        if (statement === "BEGIN") {
          fakeDatabase.isTransaction = true;
        }

        if (statement === "COMMIT" || statement === "ROLLBACK") {
          fakeDatabase.isTransaction = false;
        }
      }
    };

    expect(() =>
      runInSqliteTransaction(
        fakeDatabase as unknown as DatabaseSync,
        () => Promise.resolve("이 값은 저장 묶음을 벗어난다")
      )
    ).toThrowError("저장 묶음 안에서는 기다리는 작업을 쓸 수 없습니다.");

    // Never committed.
    expect(statements).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("refuses async work even when it joins a transaction someone else opened", () => {
    const statements: string[] = [];
    const joinedDatabase = {
      isTransaction: true,
      exec(statement: string) {
        statements.push(statement);
      }
    };

    expect(() =>
      runInSqliteTransaction(joinedDatabase as unknown as DatabaseSync, () => Promise.resolve(1))
    ).toThrowError("저장 묶음 안에서는 기다리는 작업을 쓸 수 없습니다.");

    // The owner decides commit or rollback; this call must not touch either.
    expect(statements).toEqual([]);
  });

  it("reports the original failure even when the rollback itself throws", () => {
    const statements: string[] = [];
    const throwingDatabase = {
      isTransaction: false,
      exec(statement: string) {
        statements.push(statement);

        if (statement === "BEGIN") {
          throwingDatabase.isTransaction = true;

          return;
        }

        if (statement === "ROLLBACK") {
          throw new Error("rollback failed for test");
        }
      }
    };

    expect(() =>
      runInSqliteTransaction(throwingDatabase as unknown as DatabaseSync, () => {
        throw new Error("work failed for test");
      })
    ).toThrowError("work failed for test");

    expect(statements).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
