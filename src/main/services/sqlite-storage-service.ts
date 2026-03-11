import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { resolveAppSettings } from "./app-settings-service";

interface SqliteStorageState {
  dbPath: string;
  database: DatabaseSync;
}

let sqliteStorageState: SqliteStorageState | null = null;

const migrateDatabase = (database: DatabaseSync) => {
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      site_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      timezone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sites_status
      ON sites (status, name ASC);

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      employee_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      status TEXT NOT NULL,
      hire_date TEXT,
      retire_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_employees_status
      ON employees (status, name ASC);

    CREATE TABLE IF NOT EXISTS employee_site_assignments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      team_name TEXT,
      shift_group TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_employee_assignments_employee_id
      ON employee_site_assignments (employee_id, start_date DESC);

    CREATE TABLE IF NOT EXISTS wage_rates (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      hourly_rate INTEGER NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wage_rates_employee_id
      ON wage_rates (employee_id, effective_from DESC);

    CREATE TABLE IF NOT EXISTS shift_patterns (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cycle_length INTEGER NOT NULL,
      pattern_code TEXT NOT NULL,
      start_index_rule TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_shift_patterns_site_id
      ON shift_patterns (site_id, status, name ASC);

    CREATE TABLE IF NOT EXISTS shift_pattern_steps (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      duty_code TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shift_pattern_steps_pattern_id
      ON shift_pattern_steps (pattern_id, step_index ASC);

    CREATE TABLE IF NOT EXISTS monthly_schedules (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      schedule_month TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      generated_by TEXT NOT NULL,
      template_version_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_schedules_site_month
      ON monthly_schedules (site_id, schedule_month DESC);

    CREATE TABLE IF NOT EXISTS monthly_schedule_items (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      duty_code TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_schedule_items_schedule_id
      ON monthly_schedule_items (schedule_id, work_date ASC);

    CREATE TABLE IF NOT EXISTS performance_files (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      directory_type TEXT NOT NULL,
      template_kind TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      column_count INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      modified_time_ms INTEGER NOT NULL,
      duplicate_key TEXT NOT NULL,
      received_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      preview_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_performance_files_status
      ON performance_files (status, received_at DESC);

    CREATE TABLE IF NOT EXISTS performance_entries (
      id TEXT PRIMARY KEY,
      performance_file_id TEXT NOT NULL,
      employee_code TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      work_hours REAL NOT NULL,
      department TEXT,
      category TEXT,
      hourly_rate REAL,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_performance_entries_file_id
      ON performance_entries (performance_file_id, work_date ASC);

    CREATE TABLE IF NOT EXISTS performance_approvals (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      decision TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      processed_by TEXT NOT NULL,
      processed_by_name TEXT NOT NULL,
      comment TEXT,
      rejection_reason TEXT,
      snapshot_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_performance_approvals_file_id
      ON performance_approvals (file_id, processed_at DESC);

    CREATE TABLE IF NOT EXISTS allowance_calculations (
      id TEXT PRIMARY KEY,
      performance_approval_id TEXT NOT NULL,
      calculation_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      rate_version_id TEXT NOT NULL,
      rate_version_label TEXT NOT NULL,
      total_work_minutes INTEGER NOT NULL,
      base_work_minutes INTEGER NOT NULL,
      overtime_minutes INTEGER NOT NULL,
      night_minutes INTEGER NOT NULL,
      holiday_minutes INTEGER NOT NULL,
      substitute_minutes INTEGER NOT NULL,
      total_allowance_amount INTEGER NOT NULL,
      signature TEXT NOT NULL UNIQUE,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_calculations_file_id
      ON allowance_calculations (file_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS allowance_calculation_items (
      id TEXT PRIMARY KEY,
      calculation_id TEXT NOT NULL,
      allowance_code TEXT NOT NULL,
      work_minutes INTEGER NOT NULL,
      multiplier REAL NOT NULL,
      amount INTEGER NOT NULL,
      detail_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_calculation_items_calc_id
      ON allowance_calculation_items (calculation_id, allowance_code ASC);
  `);
};

export const initializeSqliteStorage = (input: {
  dbPath?: string;
  userDataPath?: string;
  env?: NodeJS.ProcessEnv;
}) => {
  const resolvedDbPath =
    input.dbPath ??
    resolveAppSettings({
      userDataPath: input.userDataPath ?? process.cwd(),
      env: input.env
    }).databasePath;

  if (sqliteStorageState?.dbPath === resolvedDbPath) {
    return sqliteStorageState;
  }

  sqliteStorageState?.database.close();
  mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

  const database = new DatabaseSync(resolvedDbPath);
  migrateDatabase(database);

  sqliteStorageState = {
    dbPath: resolvedDbPath,
    database
  };

  return sqliteStorageState;
};

export const isSqliteStorageReady = () => sqliteStorageState !== null;

export const getSqliteDatabase = () => sqliteStorageState?.database ?? null;

export const closeSqliteStorage = () => {
  sqliteStorageState?.database.close();
  sqliteStorageState = null;
};

export const resetSqliteStorageForTest = (removeFile = true) => {
  const dbPath = sqliteStorageState?.dbPath ?? null;
  closeSqliteStorage();

  if (removeFile && dbPath) {
    rmSync(dbPath, { force: true });
  }
};
