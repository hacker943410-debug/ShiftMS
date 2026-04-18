import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { resetAuthBootstrapCredentialsFileForTest } from "./auth-bootstrap-service";
import { resolveAppSettings } from "./app-settings-service";

interface SqliteStorageState {
  dbPath: string;
  database: DatabaseSync;
  env?: NodeJS.ProcessEnv;
  userDataPath?: string;
}

let sqliteStorageState: SqliteStorageState | null = null;

const ensureColumn = (
  database: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string
) => {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;

  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
};

const migrateDatabase = (database: DatabaseSync) => {
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      site_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      customer_name TEXT,
      status TEXT NOT NULL,
      timezone TEXT NOT NULL,
      deleted_at TEXT,
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
      team_count INTEGER NOT NULL DEFAULT 2,
      cycle_length INTEGER NOT NULL,
      pattern_code TEXT NOT NULL,
      start_index_rule TEXT NOT NULL,
      pattern_start_date TEXT,
      pool_enabled INTEGER NOT NULL DEFAULT 0,
      pool_start_time TEXT,
      pool_end_time TEXT,
      pool_break_minutes INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS shift_pattern_team_indexes (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL,
      team_label TEXT NOT NULL,
      team_index INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shift_pattern_team_indexes_pattern_id
      ON shift_pattern_team_indexes (pattern_id, team_label ASC);

    CREATE TABLE IF NOT EXISTS shift_pattern_cycles (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL,
      cycle_key TEXT NOT NULL,
      cycle_name TEXT NOT NULL,
      cycle_order INTEGER NOT NULL,
      shift_count INTEGER NOT NULL DEFAULT 2,
      cycle_length INTEGER NOT NULL,
      pattern_code TEXT NOT NULL,
      pattern_start_date TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shift_pattern_cycles_pattern_id
      ON shift_pattern_cycles (pattern_id, cycle_order ASC);

    CREATE TABLE IF NOT EXISTS shift_pattern_cycle_steps (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      duty_code TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shift_pattern_cycle_steps_cycle_id
      ON shift_pattern_cycle_steps (cycle_id, step_index ASC);

    CREATE TABLE IF NOT EXISTS shift_pattern_cycle_team_indexes (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      team_label TEXT NOT NULL,
      team_index INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shift_pattern_cycle_team_indexes_cycle_id
      ON shift_pattern_cycle_team_indexes (cycle_id, team_label ASC);

    CREATE TABLE IF NOT EXISTS shift_pattern_team_cycles (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL,
      team_label TEXT NOT NULL,
      cycle_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shift_pattern_team_cycles_pattern_id
      ON shift_pattern_team_cycles (pattern_id, team_label ASC);

    CREATE TABLE IF NOT EXISTS shift_pattern_team_capacities (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL,
      team_label TEXT NOT NULL,
      max_headcount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shift_pattern_team_capacities_pattern_id
      ON shift_pattern_team_capacities (pattern_id, team_label ASC);

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
      team_label TEXT,
      work_date TEXT NOT NULL,
      duty_code TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_schedule_items_schedule_id
      ON monthly_schedule_items (schedule_id, work_date ASC);

    CREATE TABLE IF NOT EXISTS schedule_plan_exports (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      schedule_month TEXT NOT NULL,
      site_name TEXT NOT NULL,
      pattern_name TEXT NOT NULL,
      template_version_id TEXT,
      template_version_label TEXT,
      output_file_name TEXT NOT NULL,
      output_path TEXT NOT NULL,
      update_count INTEGER NOT NULL,
      publish_status TEXT NOT NULL,
      published_path TEXT,
      exported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_plan_exports_schedule_id
      ON schedule_plan_exports (schedule_id, exported_at DESC);

    CREATE TABLE IF NOT EXISTS holiday_calendars (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      source_version TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_holiday_calendars_year
      ON holiday_calendars (year DESC, source_name ASC);

    CREATE TABLE IF NOT EXISTS holiday_items (
      id TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      holiday_date TEXT NOT NULL,
      name TEXT NOT NULL,
      is_substitute INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_holiday_items_calendar_id
      ON holiday_items (calendar_id, holiday_date ASC);

    CREATE TABLE IF NOT EXISTS allowance_rate_versions (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      version_label TEXT NOT NULL,
      status TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      change_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_rate_versions_year
      ON allowance_rate_versions (year DESC, effective_from DESC);

    CREATE TABLE IF NOT EXISTS allowance_rate_items (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      allowance_code TEXT NOT NULL,
      multiplier REAL NOT NULL,
      rounding_policy TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_rate_items_version_id
      ON allowance_rate_items (version_id, allowance_code ASC);

    CREATE TABLE IF NOT EXISTS allowance_rate_history (
      id TEXT PRIMARY KEY,
      rate_version_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      version_label TEXT NOT NULL,
      action_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      detail TEXT,
      occurred_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_rate_history_rate_version_id
      ON allowance_rate_history (rate_version_id, occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_allowance_rate_history_occurred_at
      ON allowance_rate_history (occurred_at DESC);

    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      login_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      password_hash TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      sign_in_failure_count INTEGER NOT NULL DEFAULT 0,
      sign_in_locked_until TEXT,
      extension_number TEXT,
      contact TEXT,
      email TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_app_users_status
      ON app_users (status, display_name ASC);

    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      login_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_label TEXT NOT NULL,
      route_key TEXT,
      route_label TEXT,
      details TEXT,
      occurred_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_access_logs_occurred_at
      ON access_logs (occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_access_logs_login_id
      ON access_logs (login_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS document_template_versions (
      id TEXT PRIMARY KEY,
      template_type TEXT NOT NULL,
      version_label TEXT NOT NULL,
      source_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved',
      is_default INTEGER NOT NULL DEFAULT 0,
      output_file_name_pattern TEXT,
      profile_schema_version TEXT,
      profile_json TEXT,
      validation_json TEXT,
      checksum TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      approved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_document_template_versions_type
      ON document_template_versions (template_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS document_template_history (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      template_type TEXT NOT NULL,
      version_label TEXT NOT NULL,
      action_type TEXT NOT NULL,
      detail TEXT,
      occurred_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_document_template_history_template_id
      ON document_template_history (template_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS app_setting_entries (
      setting_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS performance_files (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      directory_type TEXT NOT NULL,
      template_kind TEXT NOT NULL,
      template_variant TEXT,
      sheet_name TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      column_count INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      modified_time_ms INTEGER NOT NULL,
      duplicate_key TEXT NOT NULL,
      received_at TEXT NOT NULL,
      schedule_month TEXT,
      site_name TEXT,
      schedule_key TEXT,
      entry_count INTEGER NOT NULL DEFAULT 0,
      approved_entry_count INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      is_effective INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      preview_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_performance_files_status
      ON performance_files (status, received_at DESC);

    CREATE TABLE IF NOT EXISTS performance_entries (
      id TEXT PRIMARY KEY,
      performance_file_id TEXT NOT NULL,
      logical_key TEXT NOT NULL,
      employee_code TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      work_hours REAL NOT NULL,
      schedule_month TEXT,
      schedule_key TEXT,
      site_name TEXT,
      work_type TEXT,
      section TEXT,
      duty_code TEXT,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER NOT NULL DEFAULT 0,
      total_work_minutes INTEGER NOT NULL DEFAULT 0,
      base_work_minutes INTEGER NOT NULL DEFAULT 0,
      overtime_minutes INTEGER NOT NULL DEFAULT 0,
      night_minutes INTEGER NOT NULL DEFAULT 0,
      department TEXT,
      category TEXT,
      reason_text TEXT,
      evidence_text TEXT,
      source_row_number INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      alert_json TEXT,
      hourly_rate REAL,
      note TEXT,
      is_pool_worker INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_performance_entries_file_id
      ON performance_entries (performance_file_id, work_date ASC);

    CREATE TABLE IF NOT EXISTS performance_approvals (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      logical_key TEXT,
      file_name TEXT NOT NULL,
      schedule_key TEXT,
      employee_code TEXT,
      employee_name TEXT,
      work_date TEXT,
      work_type TEXT,
      decision TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      processed_by TEXT NOT NULL,
      processed_by_name TEXT NOT NULL,
      comment TEXT,
      rejection_reason TEXT,
      snapshot_json TEXT,
      archived_file_name TEXT,
      archived_file_path TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_performance_approvals_file_id
      ON performance_approvals (file_id, processed_at DESC);

    CREATE TABLE IF NOT EXISTS hidden_approved_performance_rows (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL UNIQUE,
      logical_key TEXT NOT NULL,
      file_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      hidden_at TEXT NOT NULL,
      hidden_by TEXT NOT NULL,
      hidden_by_name TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_hidden_approved_performance_rows_approval_id
      ON hidden_approved_performance_rows (approval_id, hidden_at DESC);

    CREATE TABLE IF NOT EXISTS allowance_calculations (
      id TEXT PRIMARY KEY,
      performance_approval_id TEXT NOT NULL,
      performance_entry_id TEXT,
      calculation_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      site_name TEXT,
      employee_code TEXT,
      employee_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      work_type TEXT,
      hourly_rate REAL,
      rate_version_id TEXT NOT NULL,
      rate_version_label TEXT NOT NULL,
      total_work_minutes INTEGER NOT NULL,
      base_work_minutes INTEGER NOT NULL,
      overtime_minutes INTEGER NOT NULL,
      night_minutes INTEGER NOT NULL,
      holiday_minutes INTEGER NOT NULL,
      substitute_minutes INTEGER NOT NULL,
      total_allowance_amount INTEGER NOT NULL,
      early_payout_date TEXT,
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

    CREATE TABLE IF NOT EXISTS allowance_document_exports (
      id TEXT PRIMARY KEY,
      work_month TEXT NOT NULL,
      output_format TEXT NOT NULL DEFAULT 'xlsx',
      calculation_ids_json TEXT NOT NULL,
      calculation_count INTEGER NOT NULL,
      employee_count INTEGER NOT NULL,
      total_allowance_amount INTEGER NOT NULL,
      proposal_template_version_id TEXT,
      attachment1_template_version_id TEXT,
      attachment2_template_version_id TEXT,
      proposal_file_name TEXT NOT NULL,
      proposal_path TEXT NOT NULL,
      attachment1_file_name TEXT NOT NULL,
      attachment1_path TEXT NOT NULL,
      attachment2_file_name TEXT NOT NULL,
      attachment2_path TEXT NOT NULL,
      exported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_document_exports_month
      ON allowance_document_exports (work_month DESC, exported_at DESC);

    CREATE TABLE IF NOT EXISTS allowance_approvals (
      id TEXT PRIMARY KEY,
      calculation_id TEXT NOT NULL,
      work_month TEXT NOT NULL,
      site_name TEXT,
      employee_code TEXT,
      employee_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      work_type TEXT,
      decision TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      processed_by TEXT NOT NULL,
      processed_by_name TEXT NOT NULL,
      comment TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_approvals_calculation_id
      ON allowance_approvals (calculation_id, processed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_allowance_approvals_work_month
      ON allowance_approvals (work_month DESC, processed_at DESC);

    CREATE TABLE IF NOT EXISTS allowance_proposal_approvals (
      id TEXT PRIMARY KEY,
      work_month TEXT NOT NULL,
      calculation_ids_json TEXT NOT NULL,
      calculation_count INTEGER NOT NULL,
      employee_count INTEGER NOT NULL,
      total_allowance_amount INTEGER NOT NULL,
      regular_total_allowance_amount INTEGER NOT NULL DEFAULT 0,
      early_payout_total_allowance_amount INTEGER NOT NULL DEFAULT 0,
      export_record_id TEXT NOT NULL,
      output_format TEXT NOT NULL DEFAULT 'pdf',
      approved_at TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      approved_by_name TEXT NOT NULL,
      comment TEXT,
      preview_snapshot_json TEXT NOT NULL,
      backup_summary_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_allowance_proposal_approvals_month
      ON allowance_proposal_approvals (work_month DESC, approved_at DESC);
  `);

  ensureColumn(database, "shift_patterns", "team_count", "INTEGER NOT NULL DEFAULT 2");
  ensureColumn(database, "shift_patterns", "pattern_start_date", "TEXT");
  ensureColumn(database, "shift_patterns", "pool_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "shift_patterns", "pool_start_time", "TEXT");
  ensureColumn(database, "shift_patterns", "pool_end_time", "TEXT");
  ensureColumn(database, "shift_patterns", "pool_break_minutes", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "sites", "deleted_at", "TEXT");
  ensureColumn(database, "monthly_schedule_items", "team_label", "TEXT");
  ensureColumn(database, "schedule_plan_exports", "template_version_id", "TEXT");
  ensureColumn(database, "schedule_plan_exports", "template_version_label", "TEXT");
  ensureColumn(
    database,
    "document_template_versions",
    "status",
    "TEXT NOT NULL DEFAULT 'approved'"
  );
  ensureColumn(
    database,
    "document_template_versions",
    "is_default",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(database, "document_template_versions", "output_file_name_pattern", "TEXT");
  ensureColumn(database, "document_template_versions", "profile_schema_version", "TEXT");
  ensureColumn(database, "document_template_versions", "profile_json", "TEXT");
  ensureColumn(database, "document_template_versions", "validation_json", "TEXT");
  ensureColumn(database, "document_template_versions", "updated_at", "TEXT");
  ensureColumn(database, "document_template_versions", "approved_at", "TEXT");
  ensureColumn(database, "allowance_rate_versions", "change_reason", "TEXT");
  ensureColumn(database, "performance_files", "template_variant", "TEXT");
  ensureColumn(database, "performance_files", "schedule_month", "TEXT");
  ensureColumn(database, "performance_files", "site_name", "TEXT");
  ensureColumn(database, "performance_files", "schedule_key", "TEXT");
  ensureColumn(database, "performance_files", "entry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(
    database,
    "performance_files",
    "approved_entry_count",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(database, "performance_files", "warning_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "performance_files", "is_effective", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "performance_files", "completed_at", "TEXT");
  ensureColumn(database, "performance_entries", "logical_key", "TEXT");
  ensureColumn(database, "performance_entries", "schedule_month", "TEXT");
  ensureColumn(database, "performance_entries", "schedule_key", "TEXT");
  ensureColumn(database, "performance_entries", "site_name", "TEXT");
  ensureColumn(database, "performance_entries", "work_type", "TEXT");
  ensureColumn(database, "performance_entries", "section", "TEXT");
  ensureColumn(database, "performance_entries", "duty_code", "TEXT");
  ensureColumn(database, "performance_entries", "start_time", "TEXT");
  ensureColumn(database, "performance_entries", "end_time", "TEXT");
  ensureColumn(database, "performance_entries", "break_minutes", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(
    database,
    "performance_entries",
    "total_work_minutes",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(
    database,
    "performance_entries",
    "base_work_minutes",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(
    database,
    "performance_entries",
    "overtime_minutes",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(database, "performance_entries", "night_minutes", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "performance_entries", "reason_text", "TEXT");
  ensureColumn(database, "performance_entries", "evidence_text", "TEXT");
  ensureColumn(database, "performance_entries", "source_row_number", "INTEGER");
  ensureColumn(database, "performance_entries", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "performance_entries", "alert_json", "TEXT");
  ensureColumn(database, "performance_entries", "is_pool_worker", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "performance_approvals", "entry_id", "TEXT");
  ensureColumn(database, "performance_approvals", "logical_key", "TEXT");
  ensureColumn(database, "performance_approvals", "schedule_key", "TEXT");
  ensureColumn(database, "performance_approvals", "employee_code", "TEXT");
  ensureColumn(database, "performance_approvals", "employee_name", "TEXT");
  ensureColumn(database, "performance_approvals", "work_date", "TEXT");
  ensureColumn(database, "performance_approvals", "work_type", "TEXT");
  ensureColumn(database, "performance_approvals", "archived_file_name", "TEXT");
  ensureColumn(database, "performance_approvals", "archived_file_path", "TEXT");
  ensureColumn(database, "app_users", "password_hash", "TEXT");
  ensureColumn(database, "app_users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "app_users", "sign_in_failure_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "app_users", "sign_in_locked_until", "TEXT");
  ensureColumn(database, "app_users", "extension_number", "TEXT");
  ensureColumn(database, "allowance_calculations", "performance_entry_id", "TEXT");
  ensureColumn(database, "allowance_calculations", "site_name", "TEXT");
  ensureColumn(database, "allowance_calculations", "employee_code", "TEXT");
  ensureColumn(database, "allowance_calculations", "work_type", "TEXT");
  ensureColumn(database, "allowance_calculations", "hourly_rate", "REAL");
  ensureColumn(database, "allowance_calculations", "early_payout_date", "TEXT");
  ensureColumn(
    database,
    "allowance_document_exports",
    "output_format",
    "TEXT NOT NULL DEFAULT 'xlsx'"
  );

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_performance_files_schedule_key
      ON performance_files (schedule_key, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_performance_entries_logical_key
      ON performance_entries (logical_key, work_date ASC);
    CREATE INDEX IF NOT EXISTS idx_performance_approvals_entry_id
      ON performance_approvals (entry_id, processed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_performance_approvals_logical_key
      ON performance_approvals (logical_key, processed_at DESC);
  `);

  ensureColumn(database, "sites", "customer_name", "TEXT");
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
    database,
    env: input.env,
    userDataPath: input.userDataPath
  };

  return sqliteStorageState;
};

export const isSqliteStorageReady = () => sqliteStorageState !== null;

export const getSqliteDatabase = () => sqliteStorageState?.database ?? null;

export const getSqliteStorageContext = () =>
  sqliteStorageState
    ? {
        dbPath: sqliteStorageState.dbPath,
        env: sqliteStorageState.env,
        userDataPath: sqliteStorageState.userDataPath
      }
    : null;

export const closeSqliteStorage = () => {
  sqliteStorageState?.database.close();
  sqliteStorageState = null;
};

export const resetSqliteStorageForTest = (removeFile = true) => {
  const storageContext = getSqliteStorageContext();
  const dbPath = sqliteStorageState?.dbPath ?? null;
  closeSqliteStorage();

  if (removeFile && dbPath) {
    rmSync(dbPath, { force: true });
  }

  if (removeFile && storageContext) {
    resetAuthBootstrapCredentialsFileForTest(storageContext);
  }
};
