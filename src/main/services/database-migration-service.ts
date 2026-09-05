import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";

import type {
  AppSettingsSnapshot,
  AppSettingsUpdateInput,
  DatabaseMigrationRequirementCheck,
  DatabaseMigrationPreview,
  DatabaseMigrationStateSnapshot,
  DatabaseMigrationSummary
} from "../../shared/bridge/contracts";
import {
  createAllowanceRateItems,
  resolveAllowanceRateCategoryLabel,
  type AllowanceRateCategoryCode,
  type AllowanceRateMatrix
} from "../../shared/domain/allowance-rate-matrix";
import { calculateWorkBreakdown } from "../../shared/domain/calculation";
import {
  isBpDisplayName,
  resolveImportedEmploymentType
} from "../../shared/domain/employment-type";
import { normalizeEmployeeRank } from "../../shared/domain/employee-rank";
import { createAllowanceCalculationSignature } from "../../shared/domain/allowance-service";
import type { WorkType } from "../../shared/domain/model";
import type { PerformanceEntrySection } from "../../shared/domain/performance-file";
import { roundUpWon } from "../../shared/domain/rounding";
import { parseCompressedShiftPatternString } from "../../shared/domain/shift-pattern-compression";
import { appendWeekendTeamLabel, normalizeTeamLabel } from "../../shared/domain/team-label";
import {
  normalizeSelectedAccessMigrationTables,
  resolveDatabaseMigrationSourceType,
  type AccessMigrationTableName
} from "../../shared/domain/database-migration";
import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "./app-settings-storage-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { resolveDatabaseMigrationInput } from "./database-file-policy-service";
import {
  buildAccessExportFailureMessage,
  buildAccessRequirementCheckFailure,
  buildPowerShellDiagnosticText,
  normalizePowerShellCommandOutput,
  parseDetectedAccessProvider
} from "./database-powershell-diagnostic-service";
import {
  removeSqliteSidecars,
  replaceDatabaseFileAtomically
} from "./database-replacement-service";
import { closeSqliteStorage, getSqliteDatabase, initializeSqliteStorage } from "./sqlite-storage-service";

const ACCESS_TABLES = [
  "공휴일",
  "연장근로요율",
  "사업조직현황",
  "사업조직별근무자현황",
  "근무자별시급관리",
  "사업조직별근무실적",
  "사업조직별패턴",
  "직무해제자현황"
] as const;

const ACCESS_TABLE_NAME_SET = new Set<AccessMigrationTableName>(ACCESS_TABLES);

const TEAM_COLUMN_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const JSON_IMPORT_TABLE_ORDER = [
  "sites",
  "employees",
  "employee_site_assignments",
  "wage_rates",
  "shift_patterns",
  "shift_pattern_steps",
  "shift_pattern_team_indexes",
  "shift_pattern_cycles",
  "shift_pattern_cycle_steps",
  "shift_pattern_cycle_team_indexes",
  "shift_pattern_team_cycles",
  "shift_pattern_team_capacities",
  "shift_pattern_team_settings",
  "monthly_schedules",
  "monthly_schedule_items",
  "schedule_plan_exports",
  "holiday_calendars",
  "holiday_items",
  "allowance_rate_versions",
  "allowance_rate_items",
  "allowance_rate_history",
  "app_users",
  "document_template_versions",
  "document_template_history",
  "performance_files",
  "performance_entries",
  "performance_approvals",
  "allowance_calculations",
  "allowance_calculation_items",
  "allowance_document_exports"
] as const;

interface AccessTableMap {
  holidays: Array<Record<string, unknown>>;
  rates: Array<Record<string, unknown>>;
  sites: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
  wages: Array<Record<string, unknown>>;
  performances: Array<Record<string, unknown>>;
  patterns: Array<Record<string, unknown>>;
  dutyReleases: Array<Record<string, unknown>>;
}

type ImportedMigrationSummary = Omit<
  DatabaseMigrationSummary,
  "databaseState" | "backupSummary" | "requirementCheck"
>;

interface RawSiteRow {
  id: string;
  site_code: string;
  name: string;
  status: string;
  timezone: string;
  deleted_at: null;
  created_at: string;
  updated_at: null;
}

interface RawEmployeeRow {
  id: string;
  employee_code: string;
  name: string;
  rank: string | null;
  employment_type: string;
  status: string;
  hire_date: string | null;
  retire_date: string | null;
  created_at: string;
  updated_at: string | null;
}

interface RawAssignmentRow {
  id: string;
  employee_id: string;
  site_id: string;
  team_name: string | null;
  shift_group: string | null;
  start_date: string;
  end_date: string | null;
  status: "active" | "ended";
  created_at: string;
}

interface RawWageRateRow {
  id: string;
  employee_id: string;
  hourly_rate: number;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
  created_at: string;
}

interface RawPatternRows {
  patterns: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
  teamIndexes: Array<Record<string, unknown>>;
  cycles: Array<Record<string, unknown>>;
  cycleSteps: Array<Record<string, unknown>>;
  cycleTeamIndexes: Array<Record<string, unknown>>;
  teamCycles: Array<Record<string, unknown>>;
  teamCapacities: Array<Record<string, unknown>>;
  importedPatternCount: number;
  skippedPatternSiteNames: string[];
  warningMessages: string[];
}

interface RawAccessPerformanceFileRow {
  id: string;
  file_name: string;
  file_path: string;
  directory_type: "pending" | "approved" | "unknown";
  template_kind: "unknown";
  template_variant: null;
  sheet_name: string;
  row_count: number;
  column_count: number;
  file_size: number;
  modified_time_ms: number;
  duplicate_key: string;
  received_at: string;
  schedule_month: string;
  site_name: string;
  schedule_key: string;
  entry_count: number;
  approved_entry_count: number;
  warning_count: number;
  is_effective: 0 | 1;
  completed_at: string | null;
  status: "parsed" | "approved";
  error_message: null;
  preview_json: string;
}

interface RawAccessPerformanceEntryRow {
  id: string;
  performance_file_id: string;
  logical_key: string;
  employee_code: string;
  employee_name: string;
  employee_rank: string | null;
  work_date: string;
  work_hours: number;
  schedule_month: string;
  schedule_key: string;
  site_name: string;
  work_type: WorkType;
  section: PerformanceEntrySection;
  duty_code: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  total_work_minutes: number;
  base_work_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
  department: string | null;
  category: string | null;
  reason_text: string | null;
  evidence_text: string | null;
  source_row_number: number;
  sort_order: number;
  alert_json: string;
  hourly_rate: number | null;
  note: string | null;
  is_pool_worker: 0 | 1;
}

interface RawAccessPerformanceApprovalRow {
  id: string;
  file_id: string;
  entry_id: string;
  logical_key: string;
  file_name: string;
  schedule_key: string;
  employee_code: string;
  employee_name: string;
  work_date: string;
  work_type: WorkType;
  decision: "approved";
  processed_at: string;
  processed_by: string;
  processed_by_name: string;
  comment: string | null;
  rejection_reason: null;
  snapshot_json: string;
  archived_file_name: string;
  archived_file_path: string;
}

interface RawAccessAllowanceCalculationRow {
  id: string;
  performance_approval_id: string;
  performance_entry_id: string;
  calculation_version: number;
  status: "calculated";
  file_id: string;
  file_name: string;
  site_name: string;
  employee_code: string;
  employee_name: string;
  employee_rank: string | null;
  work_date: string;
  work_type: WorkType;
  hourly_rate: number | null;
  rate_version_id: string;
  rate_version_label: string;
  total_work_minutes: number;
  base_work_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
  holiday_minutes: number;
  substitute_minutes: number;
  total_allowance_amount: number;
  early_payout_date: null;
  signature: string;
  snapshot_json: string;
  created_at: string;
}

interface RawAccessAllowanceCalculationItemRow {
  id: string;
  calculation_id: string;
  allowance_code: "base" | "overtime" | "night";
  work_minutes: number;
  multiplier: number;
  amount: number;
  detail_json: string;
}

interface RawAccessPerformanceRows {
  files: RawAccessPerformanceFileRow[];
  entries: RawAccessPerformanceEntryRow[];
  approvals: RawAccessPerformanceApprovalRow[];
  calculations: RawAccessAllowanceCalculationRow[];
  calculationItems: RawAccessAllowanceCalculationItemRow[];
  importedFileCount: number;
  importedEntryCount: number;
  importedApprovedEntryCount: number;
  importedAllowanceCalculationCount: number;
  skippedRowCount: number;
  warningMessages: string[];
}

interface JsonBackupSnapshot {
  appSettings?: Partial<AppSettingsUpdateInput>;
  tables: Record<string, unknown[]>;
}

interface AccessSiteConfig {
  siteName: string;
  declaredWorkType?: string;
  declaredShiftCount?: number;
  declaredTeamCount?: number;
  availableShiftCount: number;
  shiftTimes: string[];
  breakMinutes: number[];
  fallbackTeamCapacity?: number;
  teamCapacities: Map<string, number>;
  poolEnabled: boolean;
}

interface AccessPatternGroup {
  siteName: string;
  patternStartDate: string;
  workType: string;
  teamCount: number;
  shiftCount: number;
  rows: Array<Record<string, unknown>>;
}

interface EmployeeImportSource {
  assignmentId: string;
  employeeCode: string;
  employeeName: string;
  siteName: string;
  groupName: string;
  groupNumber: string;
  groupType: string;
  assignmentStartDate: string;
}

interface SiteValueLookup<T> {
  exact: Map<string, T>;
  loose: Map<string, T>;
}

const normalizeText = (value: unknown) => String(value ?? "").replace(/\uFEFF/g, "").trim();
const normalizePersonName = (value: unknown) => normalizeText(value).replace(/_[A-Z]$/i, "");
const normalizeSiteLookupKey = (value: unknown) => normalizeText(value).replace(/\s+/g, "").toUpperCase();
const normalizeKey = (value: unknown) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[\s_\-()/\\[\]{}.:]+/g, "");
export const normalizeImportedEmployeeStatus = (value: unknown): "active" | "leave" | "retired" => {
  if (typeof value === "boolean") {
    return value ? "active" : "retired";
  }

  const normalizedText = normalizeText(value);
  const normalizedKey = normalizeKey(value);

  if (!normalizedText || normalizedKey.includes("미분류") || normalizedKey === "unknown") {
    return "active";
  }

  if (
    normalizedKey.includes("퇴사") ||
    normalizedKey.includes("퇴직") ||
    normalizedKey.includes("직무해제") ||
    normalizedKey.includes("retired") ||
    normalizedKey === "false" ||
    normalizedKey === "n" ||
    normalizedKey === "no" ||
    normalizedKey === "0"
  ) {
    return "retired";
  }

  if (normalizedKey.includes("휴직") || normalizedKey.includes("leave")) {
    return "leave";
  }

  return "active";
};
const buildSiteValueLookup = <T,>(entries: Array<{ name: string; value: T }>): SiteValueLookup<T> => {
  const exact = new Map<string, T>();
  const looseCandidates = new Map<string, Set<T>>();

  entries.forEach(({ name, value }) => {
    const normalizedName = normalizeText(name);

    if (!normalizedName) {
      return;
    }

    exact.set(normalizedName, value);

    const lookupKey = normalizeSiteLookupKey(normalizedName);
    const bucket = looseCandidates.get(lookupKey) ?? new Set<T>();

    bucket.add(value);
    looseCandidates.set(lookupKey, bucket);
  });

  const loose = new Map<string, T>();

  looseCandidates.forEach((bucket, lookupKey) => {
    if (bucket.size === 1) {
      const [value] = Array.from(bucket);

      if (value !== undefined) {
        loose.set(lookupKey, value);
      }
    }
  });

  return {
    exact,
    loose
  };
};
const resolveSiteLookupValue = <T,>(lookup: SiteValueLookup<T>, siteName: string) =>
  lookup.exact.get(siteName) ?? lookup.loose.get(normalizeSiteLookupKey(siteName));
const toPowerShellLiteral = (value: string) => `'${String(value).replace(/'/g, "''")}'`;
const getProcessResourcesPath = () => {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return typeof resourcesPath === "string" && resourcesPath.trim().length > 0
    ? resourcesPath
    : undefined;
};

const resolveAccessExportScriptPath = () => {
  const resourcesPath = getProcessResourcesPath();
  const candidates = [
    resourcesPath ? path.join(resourcesPath, "scripts", "export-access-db.ps1") : undefined,
    path.resolve(process.cwd(), "scripts", "export-access-db.ps1")
  ].filter((candidate): candidate is string => Boolean(candidate));

  const scriptPath = candidates.find((candidate) => existsSync(candidate));

  if (!scriptPath) {
    throw new Error(
      "Access 복구 스크립트를 찾을 수 없습니다. 설치본 패키지에 export-access-db.ps1 포함 여부를 확인하세요."
    );
  }

  return scriptPath;
};

const buildDatabaseMigrationRequirementFailureMessage = (
  requirementCheck: DatabaseMigrationRequirementCheck
) => [requirementCheck.headline, ...requirementCheck.details, ...requirementCheck.recommendedActions].join("\n");

const createJsonMigrationRequirementCheck = (): DatabaseMigrationRequirementCheck => ({
  sourceType: "json",
  isReady: true,
  status: "not-required",
  checkedAt: new Date().toISOString(),
  headline: "JSON 복원은 추가 구성 없이 실행할 수 있습니다.",
  details: ["운영 DB 백업 JSON(.json) 파일이면 현재 PC 환경에서 바로 미리보기와 복원을 실행할 수 있습니다."],
  recommendedActions: []
});

const createAccessMigrationRequirementCheck = (): DatabaseMigrationRequirementCheck => {
  const checkedAt = new Date().toISOString();
  let scriptPath: string | undefined;

  try {
    scriptPath = resolveAccessExportScriptPath();
  } catch (error) {
    return {
      sourceType: "access",
      isReady: false,
      status: "script-missing",
      checkedAt,
      headline: "설치본에 Access 복구 스크립트가 없습니다.",
      details: [error instanceof Error ? error.message : "Access 복구 스크립트를 찾을 수 없습니다."],
      recommendedActions: [
        "최신 설치본으로 다시 설치한 뒤 DB복원 미리보기를 다시 확인하세요."
      ]
    };
  }

  const result = spawnSync(
    "powershell",
    [
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `& ${toPowerShellLiteral(scriptPath)} -CheckProviderOnly`
    ],
    {
      cwd: path.dirname(scriptPath),
      encoding: "utf8",
      windowsHide: true
    }
  );
  const snapshot = {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    errorMessage: result.error instanceof Error ? result.error.message : ""
  };
  const output = normalizePowerShellCommandOutput(snapshot);

  if (result.status === 0) {
    return {
      sourceType: "access",
      isReady: true,
      status: "ready",
      checkedAt,
      headline: "현재 PC에서 Access DB 복원을 실행할 수 있습니다.",
      details: [
        `Access 복구 스크립트: ${scriptPath}`,
        `감지된 Provider: ${parseDetectedAccessProvider(output) ?? "확인됨"}`
      ],
      recommendedActions: [],
      scriptPath,
      detectedProvider: parseDetectedAccessProvider(output)
    };
  }

  const failureCheck = buildAccessRequirementCheckFailure({
    checkedAt,
    scriptPath,
    snapshot
  });

  if (failureCheck.status === "check-failed") {
    console.error(
      "[database-migration] access requirement check failed",
      buildPowerShellDiagnosticText({
        commandName: "access-provider-check",
        scriptPath,
        snapshot
      })
    );
  }

  return failureCheck;
};

export const checkDatabaseMigrationRequirements = (input: {
  migrationFilePath: string;
}): DatabaseMigrationRequirementCheck => {
  const { extension } = resolveDatabaseMigrationInput(input);
  return extension === ".json" ? createJsonMigrationRequirementCheck() : createAccessMigrationRequirementCheck();
};

const assertDatabaseMigrationRequirementsReady = (
  requirementCheck: DatabaseMigrationRequirementCheck
) => {
  if (requirementCheck.isReady) {
    return;
  }

  throw new Error(buildDatabaseMigrationRequirementFailureMessage(requirementCheck));
};

const normalizeIsoDate = (value: unknown) => {
  const matched = String(value ?? "").match(/(\d{4})[-./](\d{2})[-./](\d{2})/);

  if (!matched) {
    return undefined;
  }

  return `${matched[1]}-${matched[2]}-${matched[3]}`;
};

const normalizeTimeValue = (value: unknown) => {
  const matched = String(value ?? "").match(/T(\d{2}):(\d{2})/);

  if (!matched) {
    return undefined;
  }

  return `${matched[1]}:${matched[2]}`;
};

const normalizeNumber = (value: unknown, label: string) => {
  const nextValue = Number(value);

  if (!Number.isFinite(nextValue)) {
    throw new Error(`${label} 값을 숫자로 해석할 수 없습니다.`);
  }

  return nextValue;
};

const normalizeOptionalInteger = (value: unknown, fallbackValue: number) => {
  if (value === null || value === undefined || normalizeText(value).length === 0) {
    return fallbackValue;
  }

  const nextValue = Number(value);

  return Number.isInteger(nextValue) ? nextValue : fallbackValue;
};

const findRowValue = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim().length > 0) {
      return row[key];
    }
  }

  return undefined;
};

const accessPerformanceRankColumnName = "직급명";
const getAccessEmployeeRankText = (row: Record<string, unknown>) =>
  normalizeText(row[accessPerformanceRankColumnName]);
const normalizeAccessEmployeeRank = (row: Record<string, unknown>) =>
  normalizeEmployeeRank(getAccessEmployeeRankText(row)) ?? null;

const assertRowValue = (row: Record<string, unknown>, keys: string[], label: string) => {
  const value = findRowValue(row, keys);

  if (value === undefined) {
    throw new Error(`${label} 값을 찾을 수 없습니다.`);
  }

  return value;
};

const formatCompactDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const getShiftLabels = (shiftCount: number) => {
  if (shiftCount === 1) {
    return ["주간"];
  }

  if (shiftCount === 2) {
    return ["주간", "야간"];
  }

  if (shiftCount === 3) {
    return ["1근", "2근", "3근"];
  }

  return Array.from({ length: shiftCount }, (_, index) => `${index + 1}근`);
};

const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const isPoolTeamLabel = (value: string) => normalizeTeamLabel(value) === "Pool";

const buildImportedShiftGroup = (groupName: string, groupType: string) => {
  if (isPoolTeamLabel(groupName)) {
    return "Pool";
  }

  if (groupType === "주말") {
    return appendWeekendTeamLabel(groupName) ?? null;
  }

  return normalizeTeamLabel(groupName) ?? null;
};

const buildImportedTeamName = (groupName: string, groupNumber: string, groupType: string) => {
  const normalizedGroupLabel =
    normalizeTeamLabel(groupName)?.replace(/\(주말\)$/, "") ??
    groupName.replace(/\(주말\)$/, "").trim();
  const normalizedGroupNumber = groupNumber.trim();

  if (!normalizedGroupLabel && !normalizedGroupNumber) {
    return null;
  }

  if (normalizedGroupLabel === "Pool") {
    return `${normalizedGroupLabel}${normalizedGroupNumber}`.trim();
  }

  if (groupType === "주말") {
    return `${normalizedGroupLabel}${normalizedGroupNumber}-주말`.trim();
  }

  return `${normalizedGroupLabel}${normalizedGroupNumber}`.trim();
};

const parseWorkType = (value: unknown) => {
  const normalized = normalizeText(value);
  const matched = normalized.match(/(\d+)\s*조\s*(\d+)\s*교대/);

  if (!matched) {
    return null;
  }

  return {
    teamCount: Number(matched[1]),
    shiftCount: Number(matched[2]),
    normalizedWorkType: normalized.replace(/\s+/g, "")
  };
};

const isPlaceholderName = (name: unknown) => {
  const normalizedName = normalizeText(name);

  return (
    normalizedName.length === 0 ||
    /^none_/i.test(normalizedName) ||
    /^공석/i.test(normalizedName) ||
    normalizedName === "-" ||
    normalizedName.toUpperCase() === "TBD"
  );
};

const compareEmployeeRows = (left: Record<string, unknown>, right: Record<string, unknown>) => {
  const leftDate =
    normalizeIsoDate(left["직무적용일자"]) ??
    normalizeIsoDate(left["조직개편일자"]) ??
    "0001-01-01";
  const rightDate =
    normalizeIsoDate(right["직무적용일자"]) ??
    normalizeIsoDate(right["조직개편일자"]) ??
    "0001-01-01";

  if (leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }

  const leftGroupType = normalizeText(left["그룹유형"]);
  const rightGroupType = normalizeText(right["그룹유형"]);

  if (leftGroupType !== rightGroupType) {
    if (leftGroupType === "기본") {
      return -1;
    }

    if (rightGroupType === "기본") {
      return 1;
    }
  }

  const leftGroupNumber = Number(left["그룹번호"] ?? Number.MAX_SAFE_INTEGER);
  const rightGroupNumber = Number(right["그룹번호"] ?? Number.MAX_SAFE_INTEGER);

  if (leftGroupNumber !== rightGroupNumber) {
    return leftGroupNumber - rightGroupNumber;
  }

  return normalizePersonName(left["직원명"]).localeCompare(normalizePersonName(right["직원명"]), "ko");
};

const buildEmployeeRankMapFromAccessPerformanceRows = (
  performanceRows: Array<Record<string, unknown>>
) => {
  const rankByEmployeeCode = new Map<
    string,
    { rank: NonNullable<RawEmployeeRow["rank"]>; workDate: string }
  >();

  performanceRows.forEach((row) => {
    const employeeCode = normalizeText(row["사원번호"]);
    const rank = normalizeAccessEmployeeRank(row);

    if (!employeeCode || !rank) {
      return;
    }

    const workDate = normalizeIsoDate(row["근무날짜"]) ?? "";
    const existing = rankByEmployeeCode.get(employeeCode);

    if (!existing || workDate >= existing.workDate) {
      rankByEmployeeCode.set(employeeCode, { rank, workDate });
    }
  });

  return new Map(
    Array.from(rankByEmployeeCode.entries()).map(([employeeCode, value]) => [
      employeeCode,
      value.rank
    ])
  );
};

const resolveRateCategoryCode = (rawCategory: unknown): AllowanceRateCategoryCode => {
  const normalized = normalizeKey(rawCategory);

  if (normalized.includes("법정공휴일") || normalized.includes("법정휴일") || normalized.includes("공휴일")) {
    return "legal-holiday";
  }

  if (normalized.includes("평대체")) {
    return "weekday-substitute";
  }

  if (normalized.includes("휴대체")) {
    return "holiday-substitute";
  }

  if (normalized.includes("평연장")) {
    return "weekday-overtime";
  }

  if (normalized.includes("휴연장")) {
    return "holiday-overtime";
  }

  throw new Error(`알 수 없는 근로유형입니다: ${String(rawCategory)}`);
};

const ensureMigrationDirectory = (databasePath: string) => {
  const migrationDir = path.resolve(path.dirname(databasePath), ".migration-work");
  mkdirSync(migrationDir, { recursive: true });
  return migrationDir;
};

const getRequiredDatabase = () => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database;
};

const queryCount = (database: DatabaseSync, tableName: string, whereClause?: string) => {
  const clause = whereClause ? ` WHERE ${whereClause}` : "";
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName}${clause}`)
    .get() as { count: number };

  return Number(row.count ?? 0);
};

const collectDatabaseMigrationState = (database: DatabaseSync): DatabaseMigrationStateSnapshot => ({
  siteCount: queryCount(database, "sites"),
  employeeCount: queryCount(database, "employees"),
  activeAssignmentCount: queryCount(database, "employee_site_assignments", `status = 'active'`),
  endedAssignmentCount: queryCount(database, "employee_site_assignments", `status = 'ended'`),
  wageRateCount: queryCount(database, "wage_rates"),
  patternCount: queryCount(database, "shift_patterns"),
  holidayCalendarCount: queryCount(database, "holiday_calendars"),
  holidayItemCount: queryCount(database, "holiday_items"),
  rateVersionCount: queryCount(database, "allowance_rate_versions"),
  rateItemCount: queryCount(database, "allowance_rate_items"),
  userCount: queryCount(database, "app_users"),
  templateVersionCount: queryCount(database, "document_template_versions"),
  templateHistoryCount: queryCount(database, "document_template_history"),
  performanceFileCount: queryCount(database, "performance_files"),
  performanceEntryCount: queryCount(database, "performance_entries"),
  performanceApprovalCount: queryCount(database, "performance_approvals"),
  allowanceCalculationCount: queryCount(database, "allowance_calculations"),
  allowanceDocumentExportCount: queryCount(database, "allowance_document_exports")
});

const importMigrationIntoCurrentStorage = (input: {
  extension: ".accdb" | ".json";
  migrationFilePath: string;
  currentSettings: AppSettingsSnapshot;
  selectedAccessTables?: AccessMigrationTableName[];
  userDataPath: string;
}): ImportedMigrationSummary =>
  input.extension === ".json"
    ? importJsonBackupIntoCurrentDatabase(
        input.migrationFilePath,
        input.currentSettings,
        input.selectedAccessTables ?? [],
        input.userDataPath
      )
    : importAccessDatabaseIntoCurrentDatabase(
        input.migrationFilePath,
        input.currentSettings,
        normalizeSelectedAccessMigrationTables(input.selectedAccessTables),
        input.userDataPath
      );

const readJsonFile = (filePath: string) =>
  JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as unknown;

const createTimestampSegment = () => formatCompactDate(new Date()) + randomUUID().slice(0, 8);

const exportAccessTables = (
  databasePath: string,
  outputDir: string,
  selectedTables: readonly AccessMigrationTableName[]
): AccessTableMap => {
  const scriptPath = resolveAccessExportScriptPath();
  const selectedTableSet = new Set<AccessMigrationTableName>(
    selectedTables.filter((table): table is AccessMigrationTableName =>
      ACCESS_TABLE_NAME_SET.has(table)
    )
  );
  const args = [
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `& ${toPowerShellLiteral(scriptPath)} -DatabasePath ${toPowerShellLiteral(
      databasePath
    )} -OutputDir ${toPowerShellLiteral(outputDir)} -Tables @(${selectedTables.map(toPowerShellLiteral).join(
      ", "
    )}) -IncludeRows`
  ];
  const result = spawnSync("powershell", args, {
    cwd: path.dirname(scriptPath),
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) {
    const snapshot = {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      errorMessage: result.error instanceof Error ? result.error.message : ""
    };

    console.error(
      "[database-migration] access export failed",
      buildPowerShellDiagnosticText({
        commandName: "access-export",
        scriptPath,
        databasePath,
        snapshot
      })
    );
    throw new Error(buildAccessExportFailureMessage(snapshot));
  }

  const readSelectedTableRows = (tableName: AccessMigrationTableName) => {
    if (!selectedTableSet.has(tableName)) {
      return [] as Array<Record<string, unknown>>;
    }

    return readJsonFile(path.join(outputDir, "tables", `${tableName}.json`)) as Array<
      Record<string, unknown>
    >;
  };

  return {
    holidays: readSelectedTableRows("공휴일"),
    rates: readSelectedTableRows("연장근로요율"),
    sites: readSelectedTableRows("사업조직현황"),
    employees: readSelectedTableRows("사업조직별근무자현황"),
    wages: readSelectedTableRows("근무자별시급관리"),
    performances: readSelectedTableRows("사업조직별근무실적"),
    patterns: readSelectedTableRows("사업조직별패턴"),
    dutyReleases: readSelectedTableRows("직무해제자현황")
  };
};

const buildAccessSiteRows = (
  siteRows: Array<Record<string, unknown>>,
  employeeRows: Array<Record<string, unknown>>,
  patternRows: Array<Record<string, unknown>>,
  performanceRows: Array<Record<string, unknown>>,
  createdAt: string
) => {
  const siteNameByKey = new Map<string, string>();

  const registerSiteName = (value: unknown) => {
    const siteName = normalizeText(value);

    if (!siteName) {
      return;
    }

    const lookupKey = normalizeSiteLookupKey(siteName);

    if (!siteNameByKey.has(lookupKey)) {
      siteNameByKey.set(lookupKey, siteName);
    }
  };

  siteRows.forEach((row) => {
    const siteName =
      normalizeText(row["근무지"]) ||
      normalizeText(row["근무지명"]) ||
      normalizeText(row["사업조직"]) ||
      normalizeText(row["사업조직명"]);

    registerSiteName(siteName);
  });

  employeeRows.forEach((row) => {
    registerSiteName(row["근무지"]);
  });

  patternRows.forEach((row) => {
    registerSiteName(row["근무지"]);
  });

  performanceRows.forEach((row) => {
    registerSiteName(row["근무지"]);
  });

  return Array.from(siteNameByKey.values())
    .sort((left, right) => left.localeCompare(right, "ko"))
    .map<RawSiteRow>((name, index) => ({
      id: randomUUID(),
      site_code: `ACCESS-SITE-${String(index + 1).padStart(3, "0")}`,
      name,
      status: "active",
      timezone: "Asia/Seoul",
      deleted_at: null,
      created_at: createdAt,
      updated_at: null
    }));
};

const buildHolidayRows = (
  rows: Array<Record<string, unknown>>,
  sourceVersion: string,
  createdAt: string
) => {
  const itemsByYear = new Map<number, Array<{ holidayDate: string; name: string; isSubstitute: boolean }>>();

  rows.forEach((row) => {
    const holidayDate = normalizeIsoDate(assertRowValue(row, ["날짜", "공휴일날짜"], "공휴일 날짜"));
    const name = normalizeText(assertRowValue(row, ["공휴일명", "이름", "명칭"], "공휴일명"));

    if (!holidayDate || !name) {
      return;
    }

    const year = Number(holidayDate.slice(0, 4));
    const bucket = itemsByYear.get(year) ?? [];

    if (bucket.some((item) => item.holidayDate === holidayDate)) {
      return;
    }

    bucket.push({
      holidayDate,
      name,
      isSubstitute: name.includes("대체")
    });
    itemsByYear.set(year, bucket);
  });

  const calendars: Array<Record<string, unknown>> = [];
  const items: Array<Record<string, unknown>> = [];

  Array.from(itemsByYear.entries())
    .sort(([left], [right]) => left - right)
    .forEach(([year, yearItems]) => {
      const calendarId = `holiday-access-${year}`;

      calendars.push({
        id: calendarId,
        year,
        source_name: "access-db",
        source_version: sourceVersion,
        created_at: createdAt
      });

      yearItems
        .sort((left, right) => left.holidayDate.localeCompare(right.holidayDate))
        .forEach((item, index) => {
          items.push({
            id: `holiday-item-access-${year}-${String(index + 1).padStart(3, "0")}`,
            calendar_id: calendarId,
            holiday_date: item.holidayDate,
            name: item.name,
            is_substitute: item.isSubstitute ? 1 : 0,
            created_at: createdAt
          });
        });
    });

  return {
    calendars,
    items
  };
};

const buildAllowanceRateRows = (
  rows: Array<Record<string, unknown>>,
  fallbackYear: number,
  sourceVersion: string,
  createdAt: string
) => {
  const matrixByYear = new Map<number, Partial<AllowanceRateMatrix>>();

  rows.forEach((row) => {
    const categoryCode = resolveRateCategoryCode(assertRowValue(row, ["근로유형"], "근로유형"));
    const year = Number(findRowValue(row, ["요율정의년도", "정의년도", "년도", "연도"]) ?? fallbackYear);
    const bucket = matrixByYear.get(year) ?? {};

    bucket[categoryCode] = {
      base: normalizeNumber(
        assertRowValue(row, ["기본근로수당요율", "기본요율"], "기본근로수당요율"),
        `${String(row["근로유형"])} 기본근로수당요율`
      ),
      overtime: normalizeNumber(
        assertRowValue(row, ["연장근로수당요율", "연장요율"], "연장근로수당요율"),
        `${String(row["근로유형"])} 연장근로수당요율`
      ),
      night: normalizeNumber(
        assertRowValue(row, ["야간근로수당요율", "야간요율"], "야간근로수당요율"),
        `${String(row["근로유형"])} 야간근로수당요율`
      )
    };
    matrixByYear.set(year, bucket);
  });

  const years = Array.from(matrixByYear.keys()).sort((left, right) => left - right);
  const latestYear = years[years.length - 1] ?? fallbackYear;
  const versions: Array<Record<string, unknown>> = [];
  const items: Array<Record<string, unknown>> = [];

  years.forEach((year) => {
    const versionId = `allowance-rate-access-${year}`;
    const status = year === latestYear ? "active" : "retired";

    versions.push({
      id: versionId,
      year,
      version_label: `ACCDB ${year} ${sourceVersion}`,
      status,
      effective_from: `${year}-01-01`,
      effective_to: status === "retired" ? `${year}-12-31` : null,
      created_at: createdAt,
      updated_at: createdAt
    });

    createAllowanceRateItems(versionId, matrixByYear.get(year)).forEach((item) => {
      items.push({
        id: item.id,
        version_id: versionId,
        allowance_code: item.allowanceCode,
        multiplier: item.multiplier,
        rounding_policy: item.roundingPolicy
      });
    });
  });

  return {
    versions,
    items
  };
};

// One line per employee survives the import: the one with the latest start date among the rows
// marked 적용유무. Everything earlier is dropped, which is why an imported history starts later
// than the person did (R-20 / T-15). Exported so that rule is pinned by a test.
export const buildActiveWageMap = (
  wageRows: Array<Record<string, unknown>>,
  sourceYear: number,
  sourceVersion: string
) => {
  const byEmployee = new Map<
    string,
    {
      employeeCode: string;
      employeeName: string;
      siteName: string;
      hourlyRate: number;
      effectiveFrom: string;
      reason: string;
    }
  >();

  wageRows.forEach((row) => {
    const employeeCode = normalizeText(row["사원번호"]);
    const employeeName = normalizeText(row["직원명"]);
    const hourlyRate = Number(row["통상시급"] ?? 0);

    if (row["적용유무"] !== true || !employeeCode || !employeeName) {
      return;
    }

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      return;
    }

    const key = employeeCode;
    const registeredAt =
      normalizeIsoDate(row["시급등록일시"]) ??
      (Number(row["시급정의년도"]) > 2000 ? `${Number(row["시급정의년도"])}-01-01` : `${sourceYear}-01-01`);
    const candidate = {
      employeeCode,
      employeeName,
      siteName: normalizeText(row["근무지"]),
      hourlyRate,
      effectiveFrom: registeredAt,
      reason: `Access import ${sourceVersion}`
    };
    const existing = byEmployee.get(key);

    if (!existing || candidate.effectiveFrom > existing.effectiveFrom) {
      byEmployee.set(key, candidate);
    }
  });

  return byEmployee;
};

export const buildEmployeeRows = (input: {
  employeeRows: Array<Record<string, unknown>>;
  performanceRows?: Array<Record<string, unknown>>;
  activeWageMap: ReturnType<typeof buildActiveWageMap>;
  siteIdByName: Map<string, string>;
  sourceYear: number;
  sourceVersion: string;
  createdAt: string;
}) => {
  const siteLookup = buildSiteValueLookup(
    Array.from(input.siteIdByName.entries()).map(([name, value]) => ({
      name,
      value
    }))
  );
  const selectedRowsByEmployee = new Map<string, Record<string, unknown>>();
  const rankByEmployeeCode = buildEmployeeRankMapFromAccessPerformanceRows(
    input.performanceRows ?? []
  );

  input.employeeRows.forEach((row) => {
    const employeeCode = normalizeText(row["사원번호"]);
    const employeeName = normalizePersonName(row["직원명"]);

    if (isPlaceholderName(employeeName) || !employeeCode) {
      return;
    }

    const key = employeeCode;
    const existing = selectedRowsByEmployee.get(key);

    if (!existing || compareEmployeeRows(row, existing) < 0) {
      selectedRowsByEmployee.set(key, row);
    }
  });

  const employees: RawEmployeeRow[] = [];
  const assignments: RawAssignmentRow[] = [];
  const wageRates: RawWageRateRow[] = [];
  const sources: EmployeeImportSource[] = [];
  const warningMessages: string[] = [];

  Array.from(selectedRowsByEmployee.entries())
    .sort(([left], [right]) => left.localeCompare(right, "ko"))
    .forEach(([, row]) => {
      const employeeCode = normalizeText(row["사원번호"]);
      const employeeName = normalizePersonName(row["직원명"]);
      const siteName = normalizeText(row["근무지"]);
      const siteId = resolveSiteLookupValue(siteLookup, siteName);
      const activeWage = input.activeWageMap.get(employeeCode);
      const groupName = normalizeText(row["그룹명"]);
      const groupNumber = normalizeText(row["그룹번호"]);
      const groupType = normalizeText(row["그룹유형"]);
      const employeeRank = rankByEmployeeCode.get(employeeCode) ?? null;
      const startDate =
        normalizeIsoDate(row["직무적용일자"]) ??
        normalizeIsoDate(row["조직개편일자"]) ??
        activeWage?.effectiveFrom ??
        `${input.sourceYear}-01-01`;

      if (!siteId) {
        warningMessages.push(`인력 ${employeeName}의 근무지 ${siteName}를 찾을 수 없어 제외했습니다.`);
        return;
      }

      const employeeId = randomUUID();
      const assignmentId = randomUUID();
      const shiftGroup = buildImportedShiftGroup(groupName, groupType);
      const teamName = buildImportedTeamName(groupName, groupNumber, groupType);

      employees.push({
        id: employeeId,
        employee_code: employeeCode,
        name: employeeName,
        rank: employeeRank,
        employment_type: resolveImportedEmploymentType(row),
        status: normalizeImportedEmployeeStatus(row["재직유무"]),
        hire_date: startDate,
        retire_date: null,
        created_at: input.createdAt,
        updated_at: null
      });
      assignments.push({
        id: assignmentId,
        employee_id: employeeId,
        site_id: siteId,
        team_name: teamName,
        shift_group: shiftGroup,
        start_date: startDate,
        end_date: null,
        status: "active",
        created_at: input.createdAt
      });
      sources.push({
        assignmentId,
        employeeCode,
        employeeName,
        siteName,
        groupName,
        groupNumber,
        groupType,
        assignmentStartDate: startDate
      });

      if (activeWage) {
        wageRates.push({
          id: randomUUID(),
          employee_id: employeeId,
          hourly_rate: activeWage.hourlyRate,
          effective_from: activeWage.effectiveFrom,
          effective_to: null,
          reason: activeWage.reason,
          created_at: input.createdAt
        });
      }
    });

  return {
    employees,
    assignments,
    wageRates,
    sources,
    warningMessages
  };
};

const buildAccessTeamCapacitiesBySiteName = (employeeRows: Array<Record<string, unknown>>) => {
  const map = new Map<string, Map<string, number>>();

  employeeRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const groupName = normalizeText(row["그룹명"]);
    const groupType = normalizeText(row["그룹유형"]);
    const teamLabel = buildImportedShiftGroup(groupName, groupType);

    if (!siteName || !teamLabel || teamLabel === "Pool" || teamLabel.endsWith("(주말)")) {
      return;
    }

    const siteKey = normalizeSiteLookupKey(siteName);
    const siteMap = map.get(siteKey) ?? new Map<string, number>();

    siteMap.set(teamLabel, (siteMap.get(teamLabel) ?? 0) + 1);
    map.set(siteKey, siteMap);
  });

  return map;
};

const buildAccessPoolSiteNames = (employeeRows: Array<Record<string, unknown>>) => {
  const poolSiteNames = new Set<string>();

  employeeRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const groupName = normalizeText(row["그룹명"]);

    if (siteName && isPoolTeamLabel(groupName)) {
      poolSiteNames.add(normalizeSiteLookupKey(siteName));
    }
  });

  return poolSiteNames;
};

const buildSiteConfigByName = (
  siteRows: Array<Record<string, unknown>>,
  employeeRows: Array<Record<string, unknown>>
) => {
  const map = new Map<string, AccessSiteConfig>();
  const teamCapacitiesBySiteName = buildAccessTeamCapacitiesBySiteName(employeeRows);
  const poolSiteNames = buildAccessPoolSiteNames(employeeRows);

  siteRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const workType = parseWorkType(row["근무형태"]);
    const shiftTimes: string[] = [];
    const breakMinutes: number[] = [];

    if (!siteName) {
      return;
    }

    for (let index = 1; index <= 6; index += 1) {
      const startTime = normalizeTimeValue(row[`근무시작시간${index}`]);
      const endTime = normalizeTimeValue(row[`근무종료시간${index}`]);

      if (!startTime || !endTime) {
        continue;
      }

      shiftTimes.push(`${startTime} - ${endTime}`);
      breakMinutes.push(
        Math.max(0, Math.round(Number(row[`휴게시간${index}`] ?? 0) * 60))
      );
    }

    if (shiftTimes.length === 0) {
      return;
    }

    const siteKey = normalizeSiteLookupKey(siteName);

    map.set(siteKey, {
      siteName,
      declaredWorkType: workType?.normalizedWorkType,
      declaredShiftCount: workType?.shiftCount,
      declaredTeamCount: workType?.teamCount,
      availableShiftCount: shiftTimes.length,
      shiftTimes,
      breakMinutes,
      fallbackTeamCapacity: Number.isFinite(Number(row["투입정원"])) ? Number(row["투입정원"]) : undefined,
      teamCapacities: teamCapacitiesBySiteName.get(siteKey) ?? new Map<string, number>(),
      poolEnabled: poolSiteNames.has(siteKey)
    });
  });

  return map;
};

const buildPatternGroups = (patternRows: Array<Record<string, unknown>>) => {
  const groups = new Map<string, AccessPatternGroup>();

  patternRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const patternStartDate = normalizeIsoDate(row["패턴시작날짜"]);
    const workType = parseWorkType(row["근무유형"]);
    const patternString = normalizeText(row["근무시작패턴"]);

    if (!siteName || !patternStartDate || !workType || !patternString) {
      return;
    }

    const key = `${siteName}|${patternStartDate}|${workType.normalizedWorkType}`;
    const bucket =
      groups.get(key) ??
      {
        siteName,
        patternStartDate,
        workType: workType.normalizedWorkType,
        teamCount: workType.teamCount,
        shiftCount: workType.shiftCount,
        rows: []
      };

    bucket.rows.push(row);
    groups.set(key, bucket);
  });

  return Array.from(groups.values()).sort((left, right) =>
    `${left.siteName}|${left.patternStartDate}`.localeCompare(
      `${right.siteName}|${right.patternStartDate}`,
      "ko"
    )
  );
};

export const buildPatternRows = (input: {
  siteRows: Array<Record<string, unknown>>;
  employeeRows: Array<Record<string, unknown>>;
  patternRows: Array<Record<string, unknown>>;
  siteIdByName: Map<string, string>;
  sourceVersion: string;
  createdAt: string;
}) => {
  const siteConfigByName = buildSiteConfigByName(input.siteRows, input.employeeRows);
  const siteLookup = buildSiteValueLookup(
    Array.from(input.siteIdByName.entries()).map(([name, value]) => ({
      name,
      value
    }))
  );
  const groups = buildPatternGroups(input.patternRows);
  const rows: RawPatternRows = {
    patterns: [],
    steps: [],
    teamIndexes: [],
    cycles: [],
    cycleSteps: [],
    cycleTeamIndexes: [],
    teamCycles: [],
    teamCapacities: [],
    importedPatternCount: 0,
    skippedPatternSiteNames: [],
    warningMessages: []
  };

  groups.forEach((group) => {
    const siteId = resolveSiteLookupValue(siteLookup, group.siteName);
    const siteConfig = siteConfigByName.get(normalizeSiteLookupKey(group.siteName));

    if (!siteId || !siteConfig) {
      rows.skippedPatternSiteNames.push(group.siteName);
      return;
    }

    if (siteConfig.availableShiftCount < group.shiftCount) {
      rows.warningMessages.push(
        `${group.siteName} 패턴은 시간대 슬롯이 부족해 제외했습니다.`
      );
      rows.skippedPatternSiteNames.push(group.siteName);
      return;
    }

    if (siteConfig.declaredShiftCount && siteConfig.declaredShiftCount !== group.shiftCount) {
      rows.warningMessages.push(
        `${group.siteName}는 사업조직별패턴 교대 수(${group.shiftCount})를 우선 적용했습니다.`
      );
    }

    const shiftLabels = getShiftLabels(group.shiftCount);
    const teamLabels = getTeamLabels(group.teamCount);
    const cycles: Array<{
      id: string;
      cycleKey: string;
      name: string;
      order: number;
      shiftCount: number;
      patternCode: string;
      patternString?: string;
      patternStartDate: string;
      steps: Array<{
        stepIndex: number;
        dutyCode: string;
        startTime?: string;
        endTime?: string;
        breakMinutes: number;
      }>;
      teamIndexes: Array<{ teamLabel: string; index: number }>;
    }> = [];
    const assignments: Array<{ teamLabel: string; cycleKey: string }> = [];
    let hasParseError = false;

    group.rows.forEach((row: Record<string, unknown>, rowIndex: number) => {
      if (hasParseError) {
        return;
      }

      const patternString = normalizeText(row["근무시작패턴"]);
      const parsedPattern = parseCompressedShiftPatternString(
        patternString,
        group.shiftCount,
        shiftLabels
      );

      if (parsedPattern.invalidTokens.length > 0 || parsedPattern.tokens.length === 0) {
        rows.warningMessages.push(
          `${group.siteName} 패턴 문자열을 해석하지 못해 제외했습니다.`
        );
        rows.skippedPatternSiteNames.push(group.siteName);
        hasParseError = true;
        return;
      }

      const symbolIndexBySymbol = new Map(
        parsedPattern.symbolEntries.map((entry, index) => [entry.symbol, index])
      );
      const symbolEntryBySymbol = new Map(
        parsedPattern.symbolEntries.map((entry) => [entry.symbol, entry])
      );
      const steps = parsedPattern.tokens.map((token, stepIndex) => {
        if (token === "휴") {
          return {
            stepIndex,
            dutyCode: "X",
            breakMinutes: 0
          };
        }

        const symbolIndex = symbolIndexBySymbol.get(token) ?? 0;
        const entry = symbolEntryBySymbol.get(token);
        const [startTime = "", endTime = ""] = String(siteConfig.shiftTimes[symbolIndex] ?? "")
          .split("-")
          .map((item) => item.trim());

        return {
          stepIndex,
          dutyCode: entry?.dutyCode ?? `S${symbolIndex + 1}`,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          breakMinutes: siteConfig.breakMinutes[symbolIndex] ?? 0
        };
      });

      const cycleKey = `cycle-${rowIndex + 1}`;
      const assignedTeamLabels = TEAM_COLUMN_LABELS.filter(
        (label) => row[label] !== null && row[label] !== undefined
      ).map((label) => `${label}조`);

      assignedTeamLabels.forEach((teamLabel) => {
        assignments.push({
          teamLabel,
          cycleKey
        });
      });

      cycles.push({
        id: randomUUID(),
        cycleKey,
        name: group.rows.length > 1 ? `Cycle ${rowIndex + 1}` : "Cycle 1",
        order: rowIndex,
        shiftCount: group.shiftCount,
        patternCode: steps.map((step) => step.dutyCode).join(""),
        patternString,
        patternStartDate: group.patternStartDate,
        steps,
        teamIndexes: teamLabels.map((teamLabel, teamIndex) => ({
          teamLabel,
          index: normalizeOptionalInteger(row[teamLabel[0]], teamIndex)
        }))
      });
    });

    if (hasParseError || cycles.length === 0) {
      return;
    }

    const firstCycle = cycles[0];
    const assignedTeams = new Set(assignments.map((item) => item.teamLabel));

    teamLabels.forEach((teamLabel) => {
      if (!assignedTeams.has(teamLabel)) {
        assignments.push({
          teamLabel,
          cycleKey: firstCycle.cycleKey
        });
      }
    });

    const patternId = randomUUID();

    const [poolStartTime = "", poolEndTime = ""] = String(siteConfig.shiftTimes[0] ?? "")
      .split("-")
      .map((item) => item.trim());

    rows.patterns.push({
      id: patternId,
      site_id: siteId,
      name: `ACCDB | ${group.siteName} | ${group.workType}`,
      team_count: group.teamCount,
      cycle_length: firstCycle.steps.length,
      pattern_code: firstCycle.patternCode,
      start_index_rule: `access-import-${input.sourceVersion}`,
      pattern_start_date: group.patternStartDate,
      pool_enabled: siteConfig.poolEnabled ? 1 : 0,
      pool_start_time: siteConfig.poolEnabled ? poolStartTime || null : null,
      pool_end_time: siteConfig.poolEnabled ? poolEndTime || null : null,
      pool_break_minutes: siteConfig.poolEnabled ? siteConfig.breakMinutes[0] ?? 0 : 0,
      status: "active",
      created_at: input.createdAt,
      updated_at: input.createdAt
    });

    firstCycle.steps.forEach((step) => {
      rows.steps.push({
        id: randomUUID(),
        pattern_id: patternId,
        step_index: step.stepIndex,
        duty_code: step.dutyCode,
        start_time: step.startTime ?? null,
        end_time: step.endTime ?? null,
        break_minutes: step.breakMinutes,
        created_at: input.createdAt
      });
    });

    firstCycle.teamIndexes.forEach((item) => {
      rows.teamIndexes.push({
        id: randomUUID(),
        pattern_id: patternId,
        team_label: item.teamLabel,
        team_index: item.index,
        created_at: input.createdAt
      });
    });

    cycles.forEach((cycle) => {
      rows.cycles.push({
        id: cycle.id,
        pattern_id: patternId,
        cycle_key: cycle.cycleKey,
        cycle_name: cycle.name,
        cycle_order: cycle.order,
        shift_count: cycle.shiftCount,
        cycle_length: cycle.steps.length,
        pattern_code: cycle.patternCode,
        pattern_string: cycle.patternString ?? null,
        pattern_start_date: cycle.patternStartDate,
        created_at: input.createdAt
      });

      cycle.steps.forEach((step) => {
        rows.cycleSteps.push({
          id: randomUUID(),
          cycle_id: cycle.id,
          step_index: step.stepIndex,
          duty_code: step.dutyCode,
          start_time: step.startTime ?? null,
          end_time: step.endTime ?? null,
          break_minutes: step.breakMinutes,
          created_at: input.createdAt
        });
      });

      cycle.teamIndexes.forEach((item) => {
        rows.cycleTeamIndexes.push({
          id: randomUUID(),
          cycle_id: cycle.id,
          team_label: item.teamLabel,
          team_index: item.index,
          created_at: input.createdAt
        });
      });
    });

    assignments.forEach((item) => {
      rows.teamCycles.push({
        id: randomUUID(),
        pattern_id: patternId,
        team_label: item.teamLabel,
        cycle_key: item.cycleKey,
        created_at: input.createdAt
      });
    });

    teamLabels.forEach((teamLabel) => {
      const maxHeadcount = siteConfig.teamCapacities.get(teamLabel) ?? siteConfig.fallbackTeamCapacity;

      if (typeof maxHeadcount === "number" && maxHeadcount > 0) {
        rows.teamCapacities.push({
          id: randomUUID(),
          pattern_id: patternId,
          team_label: teamLabel,
          max_headcount: maxHeadcount,
          created_at: input.createdAt
        });
      }
    });

    rows.importedPatternCount += 1;
  });

  rows.skippedPatternSiteNames = Array.from(new Set(rows.skippedPatternSiteNames)).sort((left, right) =>
    left.localeCompare(right, "ko")
  );

  return rows;
};

const applyDutyReleaseRows = (
  sources: EmployeeImportSource[],
  dutyReleaseRows: Array<Record<string, unknown>>,
  assignments: RawAssignmentRow[]
) => {
  const exactIndex = new Map<string, EmployeeImportSource[]>();
  const normalizedIndex = new Map<string, EmployeeImportSource[]>();
  const assignmentById = new Map(assignments.map((item) => [item.id, item]));
  let closedCount = 0;
  let skippedCount = 0;
  let normalizedMatchCount = 0;

  sources.forEach((employee) => {
    const exactKey = [
      employee.siteName,
      employee.employeeName,
      employee.groupName,
      employee.groupNumber,
      employee.groupType
    ].join("|");
    const normalizedKey = [employee.siteName, normalizePersonName(employee.employeeName)].join("|");
    const exactBucket = exactIndex.get(exactKey) ?? [];
    const normalizedBucket = normalizedIndex.get(normalizedKey) ?? [];

    exactBucket.push(employee);
    normalizedBucket.push(employee);
    exactIndex.set(exactKey, exactBucket);
    normalizedIndex.set(normalizedKey, normalizedBucket);
  });

  const sortedRows = [...dutyReleaseRows].sort((left, right) => {
    const leftDate = normalizeIsoDate(left["직무해제일자"]) ?? "9999-12-31";
    const rightDate = normalizeIsoDate(right["직무해제일자"]) ?? "9999-12-31";

    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    const leftKey = `${normalizeText(left["근무지"])}|${normalizeText(left["직원명"])}`;
    const rightKey = `${normalizeText(right["근무지"])}|${normalizeText(right["직원명"])}`;
    return leftKey.localeCompare(rightKey, "ko");
  });

  sortedRows.forEach((row) => {
    const siteName = normalizeText(row["근무지"]);
    const employeeName = normalizeText(row["직원명"]);
    const groupName = normalizeText(row["그룹명"]);
    const groupNumber = normalizeText(row["그룹번호"]);
    const groupType = normalizeText(row["그룹유형"]);
    const dutyReleaseDate = normalizeIsoDate(row["직무해제일자"]);

    if (isPlaceholderName(employeeName) || !dutyReleaseDate) {
      skippedCount += 1;
      return;
    }

    const exactKey = [siteName, employeeName, groupName, groupNumber, groupType].join("|");
    const normalizedKey = [siteName, normalizePersonName(employeeName)].join("|");
    const exactMatches = exactIndex.get(exactKey) ?? [];
    const normalizedMatches = normalizedIndex.get(normalizedKey) ?? [];
    const matched =
      exactMatches.length === 1
        ? exactMatches[0]
        : normalizedMatches.length === 1
          ? normalizedMatches[0]
          : null;

    if (!matched) {
      skippedCount += 1;
      return;
    }

    if (exactMatches.length !== 1 && normalizedMatches.length === 1) {
      normalizedMatchCount += 1;
    }

    const assignment = assignmentById.get(matched.assignmentId);

    if (!assignment || assignment.status !== "active") {
      skippedCount += 1;
      return;
    }

    if (dutyReleaseDate < matched.assignmentStartDate) {
      skippedCount += 1;
      return;
    }

    assignment.end_date = dutyReleaseDate;
    assignment.status = "ended";
    closedCount += 1;
  });

  const warningMessages: string[] = [];

  if (normalizedMatchCount > 0) {
    warningMessages.push(`직무해제 ${normalizedMatchCount}건은 이름 정규화로 매칭했습니다.`);
  }

  return {
    closedCount,
    skippedCount,
    warningMessages
  };
};

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const padTimePart = (value: unknown) => String(Math.max(0, Number(value ?? 0))).padStart(2, "0");

const buildAccessTimeText = (hourValue: unknown, minuteValue: unknown) => {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${padTimePart(hour)}:${padTimePart(minute)}`;
};

const toAccessWorkMinutes = (value: unknown) => {
  const hours = Number(value ?? 0);

  if (!Number.isFinite(hours) || hours <= 0) {
    return 0;
  }

  return Math.round(hours * 60);
};

const calculateAccessRawDurationMinutes = (startTime?: string | null, endTime?: string | null) => {
  if (!startTime || !endTime) {
    return null;
  }

  const [startHour, startMinute] = startTime.split(":").map((item) => Number(item));
  const [endHour, endMinute] = endTime.split(":").map((item) => Number(item));

  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endHour) ||
    !Number.isInteger(endMinute)
  ) {
    return null;
  }

  const startTotalMinutes = (startHour * 60) + startMinute;
  const endTotalMinutes = (endHour * 60) + endMinute;
  const normalizedEndMinutes =
    endTotalMinutes <= startTotalMinutes ? endTotalMinutes + (24 * 60) : endTotalMinutes;

  return Math.max(normalizedEndMinutes - startTotalMinutes, 0);
};

const normalizeAccessPerformanceBreakdown = (input: {
  workType: WorkType;
  totalWorkMinutes: number;
  baseWorkMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes: number;
}) => {
  if (input.workType !== "overtime") {
    return {
      totalWorkMinutes: input.totalWorkMinutes,
      baseWorkMinutes: input.baseWorkMinutes,
      overtimeMinutes: input.overtimeMinutes,
      nightMinutes: input.nightMinutes
    };
  }

  if (input.startTime && input.endTime) {
    return calculateWorkBreakdown({
      workType: "overtime",
      timeRange: {
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes
      }
    });
  }

  return {
    totalWorkMinutes: input.totalWorkMinutes,
    baseWorkMinutes: 0,
    overtimeMinutes: Math.max(input.totalWorkMinutes - input.nightMinutes, 0),
    nightMinutes: Math.min(input.nightMinutes, input.totalWorkMinutes),
    holidayMinutes: 0,
    substituteMinutes: 0
  };
};

const calculateAccessAllowanceAmount = (
  hourlyRate: number | null,
  workMinutes: number,
  multiplier: number,
  fallbackAmount: number
) => {
  if (!Number.isFinite(workMinutes) || workMinutes <= 0) {
    return 0;
  }

  if (
    hourlyRate &&
    hourlyRate > 0 &&
    Number.isFinite(multiplier) &&
    multiplier > 0
  ) {
    return roundUpWon((hourlyRate * workMinutes * multiplier) / 60);
  }

  return Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? fallbackAmount : 0;
};

const hasPositiveNumericValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

const hasAccessImportedAllowanceAmount = (row: Record<string, unknown>) =>
  [
    row["총근로수당"],
    row["기본근로수당"],
    row["연장근로수당"],
    row["야간근로수당"]
  ].some(hasPositiveNumericValue);

const buildAccessPerformanceFallbackIdentity = (input: {
  siteName: string;
  employeeName: string;
  workDate?: string;
  rowNumber: number;
  createdAt: string;
}) => ({
  siteName: input.siteName || "미지정 근무지",
  employeeName: input.employeeName || `미상(${input.rowNumber}행)`,
  workDate: input.workDate ?? input.createdAt.slice(0, 10)
});

const buildAccessPerformanceFallbackAlerts = (input: {
  rowNumber: number;
  siteNameMissing: boolean;
  employeeNameMissing: boolean;
  workDateMissing: boolean;
  fallbackWorkDate: string;
}) => {
  const alerts: Array<{ severity: "warning"; message: string }> = [];

  if (input.siteNameMissing) {
    alerts.push({
      severity: "warning",
      message: `Access ${input.rowNumber}행의 근무지가 비어 있어 미지정 근무지로 복원했습니다.`
    });
  }

  if (input.employeeNameMissing) {
    alerts.push({
      severity: "warning",
      message: `Access ${input.rowNumber}행의 직원명이 비어 있어 미상으로 복원했습니다.`
    });
  }

  if (input.workDateMissing) {
    alerts.push({
      severity: "warning",
      message: `Access ${input.rowNumber}행의 근무날짜가 비어 있어 ${input.fallbackWorkDate}로 복원했습니다.`
    });
  }

  return alerts;
};

const findFallbackActiveHourlyRate = (
  activeWageMap: ReturnType<typeof buildActiveWageMap>,
  employeeCode: string
) => {
  const exact = activeWageMap.get(employeeCode);

  if (exact) {
    return exact.hourlyRate;
  }

  return null;
};

const deriveAccessHourlyRate = (
  row: Record<string, unknown>,
  activeWageMap: ReturnType<typeof buildActiveWageMap>
) => {
  const directRate = Number(row["통상시급"] ?? 0);

  if (Number.isFinite(directRate) && directRate > 0) {
    return directRate;
  }

  const candidates = [
    {
      hours: Number(row["기본근로시간"] ?? 0),
      multiplier: Number(row["기본근로요율"] ?? 0),
      amount: Number(row["기본근로수당"] ?? 0)
    },
    {
      hours: Number(row["연장근로시간"] ?? 0),
      multiplier: Number(row["연장근로요율"] ?? 0),
      amount: Number(row["연장근로수당"] ?? 0)
    },
    {
      hours: Number(row["야간근로시간"] ?? 0),
      multiplier: Number(row["야간근로요율"] ?? 0),
      amount: Number(row["야간근로수당"] ?? 0)
    }
  ];

  for (const candidate of candidates) {
    if (
      Number.isFinite(candidate.hours) &&
      Number.isFinite(candidate.multiplier) &&
      Number.isFinite(candidate.amount) &&
      candidate.hours > 0 &&
      candidate.multiplier > 0 &&
      candidate.amount > 0
    ) {
      return Math.round(candidate.amount / (candidate.hours * candidate.multiplier));
    }
  }

  const employeeCode = normalizeText(row["사원번호"]);
  const employeeName = normalizeText(row["직원명"]);

  if (!employeeCode) {
    return null;
  }

  return findFallbackActiveHourlyRate(activeWageMap, employeeCode);
};

const resolveAccessPerformanceCategory = (
  row: Record<string, unknown>
): {
  workType: WorkType;
  section: PerformanceEntrySection;
  allowanceCategoryCode: AllowanceRateCategoryCode;
} => {
  const normalized = normalizeKey(row["수당지급유형"] ?? row["근로유형"]);

  if (normalized.includes("대체근로법정휴일")) {
    return {
      workType: "holiday",
      section: "legal-holiday",
      allowanceCategoryCode: "holiday-substitute"
    };
  }

  if (normalized.includes("연장근로법정휴일")) {
    return {
      workType: "holiday",
      section: "legal-holiday",
      allowanceCategoryCode: "holiday-overtime"
    };
  }

  if (normalized.includes("법정휴일") || normalized.includes("법정공휴일")) {
    return {
      workType: "holiday",
      section: "legal-holiday",
      allowanceCategoryCode: "legal-holiday"
    };
  }

  if (normalized.includes("대체")) {
    return {
      workType: "substitute",
      section: "substitute",
      allowanceCategoryCode: "weekday-substitute"
    };
  }

  return {
    workType: "overtime",
    section: "overtime",
    allowanceCategoryCode: "weekday-overtime"
  };
};

const isAccessPoolWorker = (employeeName: string) => /\(P\)$/i.test(employeeName.trim());
const isExcludedAccessPerformanceEmployeeName = (employeeName: string) =>
  isBpDisplayName(employeeName) || normalizePersonName(employeeName).toUpperCase() === "BP";

const buildSyntheticPerformanceFilePath = (input: {
  migrationFilePath: string;
  scheduleMonth: string;
  statusLabel: "approved" | "pending" | "hidden";
  fileName: string;
}) =>
  path.resolve(
    path.dirname(input.migrationFilePath),
    "__access_migrated__",
    input.statusLabel,
    input.scheduleMonth,
    input.fileName
  );

export const buildAccessPerformanceRows = (input: {
  performanceRows: Array<Record<string, unknown>>;
  migrationFilePath: string;
  modifiedTimeMs: number;
  createdAt: string;
  activeWageMap: ReturnType<typeof buildActiveWageMap>;
}): RawAccessPerformanceRows => {
  const grouped = new Map<
    string,
    {
      file: RawAccessPerformanceFileRow;
      entries: RawAccessPerformanceEntryRow[];
      approvals: RawAccessPerformanceApprovalRow[];
      calculations: RawAccessAllowanceCalculationRow[];
      calculationItems: RawAccessAllowanceCalculationItemRow[];
      visibleEntryCount: number;
      approvedVisibleEntryCount: number;
      alertCount: number;
    }
  >();
  const warningMessages: string[] = [];
  let skippedRowCount = 0;

  input.performanceRows.forEach((row, index) => {
    const rawSiteName = normalizeText(row["근무지"]);
    const rawEmployeeName = normalizeText(row["직원명"]);
    const employeeCode = normalizeText(row["사원번호"]);
    const rawWorkDate = normalizeIsoDate(row["근무날짜"]);
    const rowNumber = index + 1;
    const hasImportedAllowanceAmount = hasAccessImportedAllowanceAmount(row);
    const { siteName, employeeName, workDate } = buildAccessPerformanceFallbackIdentity({
      siteName: rawSiteName,
      employeeName: rawEmployeeName,
      workDate: rawWorkDate,
      rowNumber,
      createdAt: input.createdAt
    });
    const employeeRank = normalizeAccessEmployeeRank(row);
    const employeeRankText = getAccessEmployeeRankText(row);
    const hasMissingRequiredIdentity =
      rawSiteName.length === 0 || rawEmployeeName.length === 0 || !rawWorkDate;

    if (hasMissingRequiredIdentity && !hasImportedAllowanceAmount) {
      skippedRowCount += 1;
      warningMessages.push(`실적 ${rowNumber}행은 근무지/직원명/근무날짜가 없어 제외했습니다.`);
      return;
    }

    if (isExcludedAccessPerformanceEmployeeName(rawEmployeeName)) {
      skippedRowCount += 1;
      warningMessages.push(`실적 ${rowNumber}행은 직원명이 BP 인력이라서 제외했습니다.`);
      return;
    }

    const scheduleMonth = workDate.slice(0, 7);
    const isApprovedRow = row["승인구분"] === true;
    const category = resolveAccessPerformanceCategory(row);
    const isPoolWorker = isAccessPoolWorker(employeeName);
    const startTime = buildAccessTimeText(row["근무시작시간_시"], row["근무시작시간_분"]);
    const endTime = buildAccessTimeText(row["근무종료시간_시"], row["근무종료시간_분"]);
    const importedTotalWorkMinutes = toAccessWorkMinutes(row["총근로시간"]);
    const importedBaseWorkMinutes = toAccessWorkMinutes(row["기본근로시간"]);
    const importedOvertimeMinutes = toAccessWorkMinutes(row["연장근로시간"]);
    const importedNightMinutes = toAccessWorkMinutes(row["야간근로시간"]);
    const rawDurationMinutes = calculateAccessRawDurationMinutes(startTime, endTime);
    const breakMinutes =
      rawDurationMinutes !== null ? Math.max(rawDurationMinutes - importedTotalWorkMinutes, 0) : 0;
    const hourlyRate = deriveAccessHourlyRate(row, input.activeWageMap);
    const normalizedBreakdown = normalizeAccessPerformanceBreakdown({
      workType: category.workType,
      totalWorkMinutes: importedTotalWorkMinutes,
      baseWorkMinutes: importedBaseWorkMinutes,
      overtimeMinutes: importedOvertimeMinutes,
      nightMinutes: importedNightMinutes,
      startTime,
      endTime,
      breakMinutes
    });
    const totalWorkMinutes = normalizedBreakdown.totalWorkMinutes;
    const baseWorkMinutes = normalizedBreakdown.baseWorkMinutes;
    const overtimeMinutes = normalizedBreakdown.overtimeMinutes;
    const nightMinutes = normalizedBreakdown.nightMinutes;
    const visibilityStatus = isApprovedRow ? "approved" : "pending";
    const fileKey = `${scheduleMonth}|${siteName}|${visibilityStatus}`;
    const scheduleKey = `access-performance:${scheduleMonth}:${normalizeKey(siteName)}:${visibilityStatus}`;
    const fileId = `access-performance-file-${normalizeKey(fileKey)}`;
    const displayStatus = isApprovedRow ? "승인완료" : "미승인";
    const fileName = `ACCESS_실적_${scheduleMonth}_${sanitizeFileSegment(siteName)}_${displayStatus}.json`;
    const filePath = buildSyntheticPerformanceFilePath({
      migrationFilePath: input.migrationFilePath,
      scheduleMonth,
      statusLabel: isApprovedRow ? "approved" : "pending",
      fileName
    });
    const logicalKey = `access-performance:${scheduleMonth}:${normalizeKey(siteName)}:${employeeCode || "no-code"}:${workDate}:${String(index + 1).padStart(4, "0")}`;
    const entryId = `access-performance-entry-${normalizeKey(logicalKey)}`;
    const importedTotalAllowanceAmount = Number(row["총근로수당"] ?? 0);
    const importedBaseAmount = Number(row["기본근로수당"] ?? 0);
    const importedOvertimeAmount = Number(row["연장근로수당"] ?? 0);
    const importedNightAmount = Number(row["야간근로수당"] ?? 0);
    const baseMultiplier = Number(row["기본근로요율"] ?? 0);
    const overtimeMultiplier = Number(row["연장근로요율"] ?? 0);
    const nightMultiplier = Number(row["야간근로요율"] ?? 0);
    const shouldNormalizeOvertimeAllowance =
      category.workType === "overtime" &&
      (importedBaseWorkMinutes !== baseWorkMinutes ||
        importedOvertimeMinutes !== overtimeMinutes ||
        importedNightMinutes !== nightMinutes);
    const baseAmount = shouldNormalizeOvertimeAllowance
      ? calculateAccessAllowanceAmount(hourlyRate, baseWorkMinutes, baseMultiplier, importedBaseAmount)
      : importedBaseAmount;
    const overtimeAmount = shouldNormalizeOvertimeAllowance
      ? calculateAccessAllowanceAmount(
          hourlyRate,
          overtimeMinutes,
          overtimeMultiplier,
          importedOvertimeAmount
        )
      : importedOvertimeAmount;
    const nightAmount = shouldNormalizeOvertimeAllowance
      ? calculateAccessAllowanceAmount(hourlyRate, nightMinutes, nightMultiplier, importedNightAmount)
      : importedNightAmount;
    const totalAllowanceAmount = shouldNormalizeOvertimeAllowance
      ? baseAmount + overtimeAmount + nightAmount
      : importedTotalAllowanceAmount;
    const notes = ["Access 실적 이관"];
    const alerts = buildAccessPerformanceFallbackAlerts({
      rowNumber,
      siteNameMissing: rawSiteName.length === 0,
      employeeNameMissing: rawEmployeeName.length === 0,
      workDateMissing: !rawWorkDate,
      fallbackWorkDate: workDate
    });
    const canRestoreAllowanceHistory =
      !isPoolWorker &&
      isApprovedRow &&
      (
        (hourlyRate !== null && hourlyRate > 0) ||
        totalAllowanceAmount > 0 ||
        baseAmount > 0 ||
        overtimeAmount > 0 ||
        nightAmount > 0
      );

    if (hasMissingRequiredIdentity && hasImportedAllowanceAmount) {
      notes.push("복원보정항목");
      warningMessages.push(
        `실적 ${rowNumber}행은 필수값 일부가 비어 있었지만 수당 금액이 있어 보정 복원했습니다.`
      );
    }

    if (normalizeText(row["근무예정자"])) {
      notes.push(`근무예정자 ${normalizeText(row["근무예정자"])}`);
    }

    if (!isPoolWorker && (!hourlyRate || hourlyRate <= 0)) {
      notes.push("시급미반영항목");
      alerts.push({
        severity: "warning",
        message: canRestoreAllowanceHistory
          ? "Access 원본에서 시급을 복원하지 못했습니다. 시급미반영항목으로 분류하고 금액 기준으로 수당 이력을 복원했습니다."
          : "Access 원본에서 시급을 복원하지 못했습니다. 시급미반영항목으로 분류했습니다."
      });
    }

    const entry: RawAccessPerformanceEntryRow = {
      id: entryId,
      performance_file_id: fileId,
      logical_key: logicalKey,
      employee_code: employeeCode,
      employee_name: employeeName,
      work_date: workDate,
      work_hours: totalWorkMinutes / 60,
      schedule_month: scheduleMonth,
      schedule_key: scheduleKey,
      site_name: siteName,
      work_type: category.workType,
      section: category.section,
      duty_code: null,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      total_work_minutes: totalWorkMinutes,
      base_work_minutes: baseWorkMinutes,
      overtime_minutes: overtimeMinutes,
      night_minutes: nightMinutes,
      employee_rank: employeeRank,
      department: employeeRankText || null,
      category: normalizeText(row["수당지급유형"]) || null,
      reason_text: normalizeText(row["근무사유"]) || null,
      evidence_text: normalizeText(row["증적자료"]) || null,
      source_row_number: rowNumber,
      sort_order: rowNumber,
      alert_json: JSON.stringify(alerts),
      hourly_rate: hourlyRate && hourlyRate > 0 ? hourlyRate : null,
      note: notes.join(" / "),
      is_pool_worker: isPoolWorker ? 1 : 0
    };
    const previewRow = {
      근무지: siteName,
      직원명: employeeName,
      근무날짜: workDate,
      근로유형: normalizeText(row["근로유형"]) || normalizeText(row["수당지급유형"]),
      승인구분: isApprovedRow ? "승인" : "미승인"
    };
    const existingGroup =
      grouped.get(fileKey) ??
      {
        file: {
          id: fileId,
          file_name: fileName,
          file_path: filePath,
          directory_type: isApprovedRow ? "approved" : "pending",
          template_kind: "unknown",
          template_variant: null,
          sheet_name: "사업조직별근무실적",
          row_count: 0,
          column_count: 27,
          file_size: 0,
          modified_time_ms: input.modifiedTimeMs,
          duplicate_key: scheduleKey,
          received_at: `${workDate}T00:00:00.000Z`,
          schedule_month: scheduleMonth,
          site_name: siteName,
          schedule_key: scheduleKey,
          entry_count: 0,
          approved_entry_count: 0,
          warning_count: 0,
          is_effective: isApprovedRow ? 1 : 0,
          completed_at: isApprovedRow ? input.createdAt : null,
          status: isApprovedRow ? "approved" : "parsed",
          error_message: null,
          preview_json: "[]"
        },
        entries: [],
        approvals: [],
        calculations: [],
        calculationItems: [],
        visibleEntryCount: 0,
        approvedVisibleEntryCount: 0,
        alertCount: 0
      };

    existingGroup.entries.push(entry);
    existingGroup.file.row_count += 1;
    existingGroup.file.file_size += 1;
    existingGroup.alertCount += alerts.length;

    const previewRows = JSON.parse(existingGroup.file.preview_json) as Array<Record<string, string>>;

    if (previewRows.length < 5) {
      previewRows.push(previewRow);
      existingGroup.file.preview_json = JSON.stringify(previewRows);
    }

    if (!isPoolWorker) {
      existingGroup.visibleEntryCount += 1;

      if (canRestoreAllowanceHistory) {
        existingGroup.approvedVisibleEntryCount += 1;
        const approvalId = `access-performance-approval-${normalizeKey(logicalKey)}`;
        const processedAt = `${workDate}T23:59:59.000Z`;
        const snapshotJson = JSON.stringify({
          fileId,
          fileName,
          filePath,
          scheduleMonth,
          siteName,
          scheduleKey,
          templateKind: "unknown",
          sheetName: "사업조직별근무실적",
          duplicateKey: scheduleKey,
          receivedAt: `${workDate}T00:00:00.000Z`,
          entry: {
            id: entry.id,
            performanceFileId: fileId,
            logicalKey,
            scheduleMonth,
            scheduleKey,
            siteName,
            employeeCode: employeeCode,
            employeeName,
            workDate,
            workType: category.workType,
            section: category.section,
            dutyCode: undefined,
            startTime: startTime ?? undefined,
            endTime: endTime ?? undefined,
            breakMinutes,
            totalWorkMinutes,
            baseWorkMinutes,
            overtimeMinutes,
            nightMinutes,
            reason: normalizeText(row["근무사유"]) || undefined,
            evidence: normalizeText(row["증적자료"]) || undefined,
            sourceRowNumber: rowNumber,
            sortOrder: rowNumber,
            alerts,
            status: "approved",
            latestApprovalAt: processedAt,
            latestApprovalByName: "Access 마이그레이션",
            hourlyRate: hourlyRate ?? undefined,
            note: notes.join(" / "),
            workHours: totalWorkMinutes / 60,
            employeeRank: employeeRank ?? undefined,
            department: employeeRankText || undefined,
            category: normalizeText(row["수당지급유형"]) || undefined,
            isPoolWorker: false
          }
        });
        const rateVersionId = `access-performance-inline-${workDate.slice(0, 4)}`;
        const rateVersionLabel = `Access 실적 이관 ${workDate.slice(0, 4)}`;
        const breakdown = {
          totalWorkMinutes,
          baseWorkMinutes,
          overtimeMinutes,
          nightMinutes,
          holidayMinutes: category.workType === "holiday" ? totalWorkMinutes : 0,
          substituteMinutes:
            category.allowanceCategoryCode === "weekday-substitute" ||
            category.allowanceCategoryCode === "holiday-substitute"
              ? totalWorkMinutes
              : 0
        };
        const lines = [
          baseWorkMinutes > 0
            ? {
                allowanceCode: "base" as const,
                workMinutes: baseWorkMinutes,
                multiplier: baseMultiplier,
                amount: baseAmount
              }
            : null,
          overtimeMinutes > 0
            ? {
                allowanceCode: "overtime" as const,
                workMinutes: overtimeMinutes,
                multiplier: overtimeMultiplier,
                amount: overtimeAmount
              }
            : null,
          nightMinutes > 0
            ? {
                allowanceCode: "night" as const,
                workMinutes: nightMinutes,
                multiplier: nightMultiplier,
                amount: nightAmount
              }
            : null
        ].filter(
          (line): line is {
            allowanceCode: "base" | "overtime" | "night";
            workMinutes: number;
            multiplier: number;
            amount: number;
          } => line !== null
        );
        const calculationSnapshot = {
          id: `access-allowance-calculation-${normalizeKey(logicalKey)}`,
          performanceApprovalId: approvalId,
          calculationVersion: 1,
          businessCategoryCode: category.allowanceCategoryCode,
          businessCategoryLabel: resolveAllowanceRateCategoryLabel(category.allowanceCategoryCode),
          breakdown,
          lines,
          totalAllowanceAmount:
            Number.isFinite(totalAllowanceAmount) && totalAllowanceAmount > 0
              ? totalAllowanceAmount
              : lines.reduce((sum, line) => sum + line.amount, 0),
          createdAt: processedAt
        };
        const signature = createAllowanceCalculationSignature(calculationSnapshot);

        existingGroup.approvals.push({
          id: approvalId,
          file_id: fileId,
          entry_id: entry.id,
          logical_key: logicalKey,
          file_name: fileName,
          schedule_key: scheduleKey,
          employee_code: employeeCode,
          employee_name: employeeName,
          work_date: workDate,
          work_type: category.workType,
          decision: "approved",
          processed_at: processedAt,
          processed_by: "access-migration",
          processed_by_name: "Access 마이그레이션",
          comment: "Access 승인 이관",
          rejection_reason: null,
          snapshot_json: snapshotJson,
          archived_file_name: fileName,
          archived_file_path: filePath
        });

        existingGroup.calculations.push({
          id: calculationSnapshot.id,
          performance_approval_id: approvalId,
          performance_entry_id: entry.id,
          calculation_version: 1,
          status: "calculated",
          file_id: fileId,
          file_name: fileName,
          site_name: siteName,
          employee_code: employeeCode,
          employee_name: employeeName,
          employee_rank: employeeRank,
          work_date: workDate,
          work_type: category.workType,
          hourly_rate: hourlyRate && hourlyRate > 0 ? hourlyRate : null,
          rate_version_id: rateVersionId,
          rate_version_label: rateVersionLabel,
          total_work_minutes: totalWorkMinutes,
          base_work_minutes: baseWorkMinutes,
          overtime_minutes: overtimeMinutes,
          night_minutes: nightMinutes,
          holiday_minutes: breakdown.holidayMinutes,
          substitute_minutes: breakdown.substituteMinutes,
          total_allowance_amount: calculationSnapshot.totalAllowanceAmount,
          early_payout_date: null,
          signature,
          snapshot_json: JSON.stringify(calculationSnapshot),
          created_at: processedAt
        });

        lines.forEach((line) => {
          existingGroup.calculationItems.push({
            id: randomUUID(),
            calculation_id: calculationSnapshot.id,
            allowance_code: line.allowanceCode,
            work_minutes: line.workMinutes,
            multiplier: line.multiplier,
            amount: line.amount,
            detail_json: JSON.stringify({
              sourceType: "access-performance",
              entryId: entry.id,
              fileId
            })
          });
        });
      } else if (isApprovedRow) {
        warningMessages.push(
          `${siteName} ${employeeName} ${workDate} 승인 행은 시급과 수당 금액을 모두 복원하지 못해 승인/수당 이력을 생성하지 않았습니다.`
        );
      }
    }

    grouped.set(fileKey, existingGroup);
  });

  const files = Array.from(grouped.values())
    .map((group) => {
      group.file.entry_count = group.visibleEntryCount;
      group.file.approved_entry_count = group.approvedVisibleEntryCount;
      group.file.warning_count = group.alertCount;

      if (group.visibleEntryCount === 0) {
        group.file.directory_type = "unknown";
        group.file.is_effective = 0;
      }

      return group.file;
    })
    .sort((left, right) => left.file_name.localeCompare(right.file_name, "ko"));
  const entries = Array.from(grouped.values()).flatMap((group) => group.entries);
  const approvals = Array.from(grouped.values()).flatMap((group) => group.approvals);
  const calculations = Array.from(grouped.values()).flatMap((group) => group.calculations);
  const calculationItems = Array.from(grouped.values()).flatMap((group) => group.calculationItems);

  return {
    files,
    entries,
    approvals,
    calculations,
    calculationItems,
    importedFileCount: files.filter((file) => file.directory_type !== "unknown").length,
    importedEntryCount: entries.filter((entry) => entry.is_pool_worker === 0).length,
    importedApprovedEntryCount: approvals.length,
    importedAllowanceCalculationCount: calculations.length,
    skippedRowCount,
    warningMessages
  };
};

const normalizeSqliteValue = (value: unknown) => {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value === null || typeof value === "string" || typeof value === "number") {
    return value;
  }

  return JSON.stringify(value);
};

const normalizeImportedTableValue = (
  tableName: string,
  columnName: string,
  value: unknown
) => {
  if (tableName === "employees" && columnName === "status") {
    return normalizeImportedEmployeeStatus(value);
  }

  if (
    (tableName === "employees" && columnName === "rank") ||
    (tableName === "performance_entries" && columnName === "employee_rank") ||
    (tableName === "allowance_calculations" && columnName === "employee_rank")
  ) {
    return normalizeEmployeeRank(value === null || value === undefined ? undefined : String(value)) ?? null;
  }

  return value;
};

const insertTableRows = (
  database: NonNullable<ReturnType<typeof getSqliteDatabase>>,
  tableName: string,
  rows: unknown[]
) => {
  if (rows.length === 0) {
    return 0;
  }

  const backupColumns = Array.from(
    rows.reduce<Set<string>>((accumulator, current) => {
      if (current && typeof current === "object" && !Array.isArray(current)) {
        Object.keys(current as Record<string, unknown>).forEach((key) => {
          accumulator.add(key);
        });
      }

      return accumulator;
    }, new Set<string>())
  );

  // 백업 컬럼을 현재 표에 실제로 존재하는 컬럼과 교집합한다.
  // 새 버전 백업을 옛 구조로 되돌릴 때(없는 컬럼 포함) 복원 전체가 중단되지 않도록,
  // 없는 컬럼은 건너뛰고 있는 컬럼만 채운다.
  const liveColumns = new Set(
    (database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );
  const columns = backupColumns.filter((column) => liveColumns.has(column));
  const droppedColumns = backupColumns.filter((column) => !liveColumns.has(column));

  if (droppedColumns.length > 0) {
    console.warn(
      `[database-migration] '${tableName}' 표의 현재 구조에 없는 컬럼은 복원에서 제외했습니다: ${droppedColumns.join(", ")}`
    );
  }

  if (columns.length === 0) {
    return 0;
  }

  const placeholders = columns.map(() => "?").join(", ");
  const statement = database.prepare(`
    INSERT INTO ${tableName} (${columns.join(", ")})
    VALUES (${placeholders})
  `);

  rows.forEach((row) => {
    const record = row as Record<string, unknown>;
    statement.run(
      ...columns.map((column) =>
        normalizeSqliteValue(normalizeImportedTableValue(tableName, column, record[column]))
      )
    );
  });

  return rows.length;
};

const APP_SETTINGS_TABLE_NAME = "app_setting_entries";
const RESERVED_BACKUP_ROOT_KEYS = new Set(["tables", "schemaVersion", "createdAt", "appSettings"]);

const normalizeJsonBackupSnapshot = (filePath: string): JsonBackupSnapshot => {
  const parsed = readJsonFile(filePath);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("백업 JSON 형식이 올바르지 않습니다.");
  }

  const tables: JsonBackupSnapshot["tables"] = {};
  const rootRecord = parsed as Record<string, unknown>;
  const tableRecord =
    rootRecord.tables && typeof rootRecord.tables === "object" && !Array.isArray(rootRecord.tables)
      ? (rootRecord.tables as Record<string, unknown>)
      : {};

  // 백업은 sqlite_master 전수 덤프이므로, 복원도 고정 목록에 의존하지 않고
  // 백업에 들어 있는 모든 표를 그대로 받아들인다(승인·감사 이력 등 누락 방지).
  // 실제 삽입 대상은 importJsonBackupIntoCurrentDatabase에서 현재 스키마에 존재하는 표로 제한한다.
  Object.entries(tableRecord).forEach(([tableName, tableRows]) => {
    if (Array.isArray(tableRows)) {
      tables[tableName] = tableRows;
    }
  });

  // 구버전 백업(테이블이 최상위에 평탄하게 들어간 형식) 호환.
  Object.entries(rootRecord).forEach(([tableName, tableRows]) => {
    if (RESERVED_BACKUP_ROOT_KEYS.has(tableName) || tableName in tables) {
      return;
    }

    if (Array.isArray(tableRows)) {
      tables[tableName] = tableRows;
    }
  });

  return {
    tables
  };
};

const buildAppSettingsInput = (
  settings: AppSettingsSnapshot,
  migrationFilePath: string
): AppSettingsUpdateInput => ({
  holidayApiBaseUrl: settings.holidayApiBaseUrl,
  pendingDir: settings.pendingDir,
  approvedDir: settings.approvedDir,
  scheduleExportDir: settings.scheduleExportDir,
  allowanceProposalExportDir: settings.allowanceProposalExportDir,
  allowanceAttachment1ExportDir: settings.allowanceAttachment1ExportDir,
  allowanceAttachment2ExportDir: settings.allowanceAttachment2ExportDir,
  databaseBackupDir: settings.databaseBackupDir,
  databaseBackupSchedule: settings.databaseBackupSchedule,
  databaseBackupTime: settings.databaseBackupTime,
  migrationFilePath
});

// 현재 데이터베이스 스키마에 실제로 존재하는 표를, 알려진 순서를 앞세워 나열한다.
// 백업에는 있으나 현재 구조에 없는 표는 여기서 빠지므로 삽입 시 오류가 나지 않고,
// 새로 추가된 표는 자동으로 포함되어 고정 목록 갱신을 잊어도 복원에서 누락되지 않는다.
const listImportableTableNames = (
  database: NonNullable<ReturnType<typeof getSqliteDatabase>>
): string[] => {
  const liveTables = (
    database
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as Array<{ name: string }>
  )
    .map((row) => row.name)
    .filter((name) => name !== APP_SETTINGS_TABLE_NAME);

  const liveTableSet = new Set(liveTables);
  const knownOrder = (JSON_IMPORT_TABLE_ORDER as readonly string[]).filter((name) =>
    liveTableSet.has(name)
  );
  const knownOrderSet = new Set(knownOrder);

  return [...knownOrder, ...liveTables.filter((name) => !knownOrderSet.has(name))];
};

const importJsonBackupIntoCurrentDatabase = (
  migrationFilePath: string,
  currentSettings: AppSettingsSnapshot,
  selectedAccessTables: AccessMigrationTableName[],
  userDataPath: string
): ImportedMigrationSummary => {
  const database = getRequiredDatabase();
  const backupSnapshot = normalizeJsonBackupSnapshot(migrationFilePath);
  const warningMessages: string[] = [];
  let restoredTableCount = 0;

  const importableTableNames = listImportableTableNames(database);
  const importableTableSet = new Set(importableTableNames);

  database.exec("BEGIN;");

  try {
    importableTableNames.forEach((tableName) => {
      const rows = backupSnapshot.tables[tableName] ?? [];

      if (Array.isArray(rows) && rows.length > 0) {
        insertTableRows(database, tableName, rows);
        restoredTableCount += 1;
      }
    });

    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  const skippedBackupTables = Object.keys(backupSnapshot.tables).filter(
    (tableName) =>
      tableName !== APP_SETTINGS_TABLE_NAME &&
      !importableTableSet.has(tableName) &&
      Array.isArray(backupSnapshot.tables[tableName]) &&
      backupSnapshot.tables[tableName].length > 0
  );

  if (skippedBackupTables.length > 0) {
    warningMessages.push(
      `백업의 다음 표는 현재 버전 구조에 없어 복원에서 제외했습니다: ${skippedBackupTables.join(", ")}`
    );
  }

  if (Array.isArray(backupSnapshot.tables.app_setting_entries)) {
    warningMessages.push("백업 JSON의 경로 설정은 무시하고 현재 환경 경로를 유지했습니다.");
  }

  saveStoredAppSettings(buildAppSettingsInput(currentSettings, migrationFilePath), {
    userDataPath
  });

  return {
    sourceType: "json",
    migrationFilePath,
    selectedAccessTables,
    databasePath: currentSettings.databasePath,
    importedSiteCount: Array.isArray(backupSnapshot.tables.sites) ? backupSnapshot.tables.sites.length : 0,
    importedEmployeeCount: Array.isArray(backupSnapshot.tables.employees)
      ? backupSnapshot.tables.employees.length
      : 0,
    importedWageRateCount: Array.isArray(backupSnapshot.tables.wage_rates)
      ? backupSnapshot.tables.wage_rates.length
      : 0,
    importedPatternCount: Array.isArray(backupSnapshot.tables.shift_patterns)
      ? backupSnapshot.tables.shift_patterns.length
      : 0,
    importedPerformanceFileCount: Array.isArray(backupSnapshot.tables.performance_files)
      ? backupSnapshot.tables.performance_files.length
      : 0,
    importedPerformanceEntryCount: Array.isArray(backupSnapshot.tables.performance_entries)
      ? backupSnapshot.tables.performance_entries.length
      : 0,
    importedApprovedEntryCount: Array.isArray(backupSnapshot.tables.performance_approvals)
      ? backupSnapshot.tables.performance_approvals.length
      : 0,
    importedAllowanceCalculationCount: Array.isArray(backupSnapshot.tables.allowance_calculations)
      ? backupSnapshot.tables.allowance_calculations.length
      : 0,
    closedAssignmentCount: 0,
    skippedDutyReleaseCount: 0,
    restoredTableCount,
    skippedPatternSiteNames: [],
    warningMessages,
    completedAt: new Date().toISOString()
  };
};

const importAccessDatabaseIntoCurrentDatabase = (
  migrationFilePath: string,
  currentSettings: AppSettingsSnapshot,
  selectedAccessTables: AccessMigrationTableName[],
  userDataPath: string
): ImportedMigrationSummary => {
  if (selectedAccessTables.length === 0) {
    throw new Error("복원할 Access 테이블을 하나 이상 선택해야 합니다.");
  }

  const database = getRequiredDatabase();
  const databaseStat = statSync(migrationFilePath);
  const sourceVersion = formatCompactDate(databaseStat.mtime);
  const createdAt = new Date().toISOString();
  const migrationDir = ensureMigrationDirectory(currentSettings.databasePath);
  const exportOutputDir = path.join(migrationDir, `access-import-${createTimestampSegment()}`);
  mkdirSync(exportOutputDir, { recursive: true });

  const accessTables = exportAccessTables(migrationFilePath, exportOutputDir, selectedAccessTables);
  const sites = buildAccessSiteRows(
    accessTables.sites,
    accessTables.employees,
    accessTables.patterns,
    accessTables.performances,
    createdAt
  );
  const siteIdByName = new Map(sites.map((site) => [site.name, site.id]));
  const holidayRows = buildHolidayRows(accessTables.holidays, sourceVersion, createdAt);
  const rateRows = buildAllowanceRateRows(
    accessTables.rates,
    databaseStat.mtime.getFullYear(),
    sourceVersion,
    createdAt
  );
  const activeWageMap = buildActiveWageMap(
    accessTables.wages,
    databaseStat.mtime.getFullYear(),
    sourceVersion
  );
  const employeeRows = buildEmployeeRows({
    employeeRows: accessTables.employees,
    performanceRows: accessTables.performances,
    activeWageMap,
    siteIdByName,
    sourceYear: databaseStat.mtime.getFullYear(),
    sourceVersion,
    createdAt
  });
  const patternRows = buildPatternRows({
    siteRows: accessTables.sites,
    employeeRows: accessTables.employees,
    patternRows: accessTables.patterns,
    siteIdByName,
    sourceVersion,
    createdAt
  });
  const performanceRows = buildAccessPerformanceRows({
    performanceRows: accessTables.performances,
    migrationFilePath,
    modifiedTimeMs: databaseStat.mtimeMs,
    createdAt,
    activeWageMap
  });
  const dutyReleaseResult = applyDutyReleaseRows(
    employeeRows.sources,
    accessTables.dutyReleases,
    employeeRows.assignments
  );

  database.exec("BEGIN;");

  try {
    insertTableRows(database, "sites", sites);
    insertTableRows(database, "employees", employeeRows.employees);
    insertTableRows(database, "employee_site_assignments", employeeRows.assignments);
    insertTableRows(database, "wage_rates", employeeRows.wageRates);
    insertTableRows(database, "shift_patterns", patternRows.patterns);
    insertTableRows(database, "shift_pattern_steps", patternRows.steps);
    insertTableRows(database, "shift_pattern_team_indexes", patternRows.teamIndexes);
    insertTableRows(database, "shift_pattern_cycles", patternRows.cycles);
    insertTableRows(database, "shift_pattern_cycle_steps", patternRows.cycleSteps);
    insertTableRows(database, "shift_pattern_cycle_team_indexes", patternRows.cycleTeamIndexes);
    insertTableRows(database, "shift_pattern_team_cycles", patternRows.teamCycles);
    insertTableRows(database, "shift_pattern_team_capacities", patternRows.teamCapacities);
    insertTableRows(database, "holiday_calendars", holidayRows.calendars);
    insertTableRows(database, "holiday_items", holidayRows.items);
    insertTableRows(database, "allowance_rate_versions", rateRows.versions);
    insertTableRows(database, "allowance_rate_items", rateRows.items);
    insertTableRows(database, "performance_files", performanceRows.files);
    insertTableRows(database, "performance_entries", performanceRows.entries);
    insertTableRows(database, "performance_approvals", performanceRows.approvals);
    insertTableRows(database, "allowance_calculations", performanceRows.calculations);
    insertTableRows(database, "allowance_calculation_items", performanceRows.calculationItems);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  const warningMessages = [
    ...employeeRows.warningMessages,
    ...patternRows.warningMessages,
    ...performanceRows.warningMessages,
    ...dutyReleaseResult.warningMessages
  ];

  if (patternRows.skippedPatternSiteNames.length > 0) {
    warningMessages.push(
      `패턴 복원 제외 근무지: ${patternRows.skippedPatternSiteNames.join(", ")}`
    );
  }

  if (dutyReleaseResult.skippedCount > 0) {
    warningMessages.push(`직무해제 ${dutyReleaseResult.skippedCount}건은 자동 매칭되지 않아 제외했습니다.`);
  }

  if (dutyReleaseResult.closedCount > 0) {
    warningMessages.push(`직무해제 적용으로 배정 ${dutyReleaseResult.closedCount}건이 종료 상태로 복원되었습니다.`);
  }

  if (performanceRows.skippedRowCount > 0) {
    warningMessages.push(`실적 ${performanceRows.skippedRowCount}건은 필수값 부족으로 제외했습니다.`);
  }

  saveStoredAppSettings(buildAppSettingsInput(currentSettings, migrationFilePath), {
    userDataPath
  });

  return {
    sourceType: "access",
    migrationFilePath,
    selectedAccessTables,
    databasePath: currentSettings.databasePath,
    importedSiteCount: sites.length,
    importedEmployeeCount: employeeRows.employees.length,
    importedWageRateCount: employeeRows.wageRates.length,
    importedPatternCount: patternRows.importedPatternCount,
    importedPerformanceFileCount: performanceRows.importedFileCount,
    importedPerformanceEntryCount: performanceRows.importedEntryCount,
    importedApprovedEntryCount: performanceRows.importedApprovedEntryCount,
    importedAllowanceCalculationCount: performanceRows.importedAllowanceCalculationCount,
    closedAssignmentCount: dutyReleaseResult.closedCount,
    skippedDutyReleaseCount: dutyReleaseResult.skippedCount,
    restoredTableCount: 0,
    skippedPatternSiteNames: patternRows.skippedPatternSiteNames,
    warningMessages,
    completedAt: new Date().toISOString()
  };
};

export const previewDatabaseMigrationUpdate = (input: {
  userDataPath: string;
  migrationFilePath: string;
  selectedAccessTables?: AccessMigrationTableName[];
  env?: NodeJS.ProcessEnv;
}): DatabaseMigrationPreview => {
  const { migrationFilePath, extension } = resolveDatabaseMigrationInput(input);
  const requirementCheck =
    extension === ".json" ? createJsonMigrationRequirementCheck() : createAccessMigrationRequirementCheck();

  assertDatabaseMigrationRequirementsReady(requirementCheck);

  initializeSqliteStorage({
    userDataPath: input.userDataPath,
    env: input.env
  });

  const currentSettings = getStoredAppSettingsSnapshot({
    userDataPath: input.userDataPath,
    env: input.env
  });
  const currentDatabase = getRequiredDatabase();
  const currentState = collectDatabaseMigrationState(currentDatabase);
  const tempDatabasePath = path.join(
    ensureMigrationDirectory(currentSettings.databasePath),
    `preview-${Date.now()}-${randomUUID()}.sqlite`
  );

  closeSqliteStorage();

  try {
    initializeSqliteStorage({
      dbPath: tempDatabasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });

    const previewSummary = importMigrationIntoCurrentStorage({
      extension,
      migrationFilePath,
      currentSettings,
      selectedAccessTables: input.selectedAccessTables,
      userDataPath: input.userDataPath
    });
    const previewState = collectDatabaseMigrationState(getRequiredDatabase());
    const { completedAt: _completedAt, ...summary } = previewSummary;

    return {
      ...summary,
      requirementCheck,
      databasePath: currentSettings.databasePath,
      currentState,
      previewState,
      previewedAt: new Date().toISOString()
    };
  } finally {
    closeSqliteStorage();
    removeSqliteSidecars(tempDatabasePath);
    rmSync(tempDatabasePath, { force: true });
    initializeSqliteStorage({
      dbPath: currentSettings.databasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });
  }
};

export const runDatabaseMigrationUpdate = async (input: {
  userDataPath: string;
  migrationFilePath: string;
  selectedAccessTables?: AccessMigrationTableName[];
  env?: NodeJS.ProcessEnv;
}): Promise<DatabaseMigrationSummary> => {
  const { migrationFilePath, extension } = resolveDatabaseMigrationInput(input);
  const requirementCheck =
    extension === ".json" ? createJsonMigrationRequirementCheck() : createAccessMigrationRequirementCheck();

  assertDatabaseMigrationRequirementsReady(requirementCheck);

  initializeSqliteStorage({
    userDataPath: input.userDataPath,
    env: input.env
  });

  const currentSettings = getStoredAppSettingsSnapshot({
    userDataPath: input.userDataPath,
    env: input.env
  });
  const backupSummary = await runDatabaseBackupNow(input);
  const tempDatabasePath = path.join(
    ensureMigrationDirectory(currentSettings.databasePath),
    `restore-${Date.now()}-${randomUUID()}.sqlite`
  );

  closeSqliteStorage();

  try {
    initializeSqliteStorage({
      dbPath: tempDatabasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });

    const summary = importMigrationIntoCurrentStorage({
      extension,
      migrationFilePath,
      currentSettings,
      selectedAccessTables: input.selectedAccessTables,
      userDataPath: input.userDataPath
    });

    closeSqliteStorage();
    replaceDatabaseFileAtomically(currentSettings.databasePath, tempDatabasePath);
    initializeSqliteStorage({
      dbPath: currentSettings.databasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });
    const databaseState = collectDatabaseMigrationState(getRequiredDatabase());

    return {
      ...summary,
      requirementCheck,
      migrationFilePath,
      databasePath: currentSettings.databasePath,
      databaseState,
      backupSummary,
      completedAt: new Date().toISOString()
    };
  } catch (error) {
    closeSqliteStorage();
    removeSqliteSidecars(tempDatabasePath);
    rmSync(tempDatabasePath, { force: true });
    initializeSqliteStorage({
      dbPath: currentSettings.databasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });
    throw error;
  }
};
