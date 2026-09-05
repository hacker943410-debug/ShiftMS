import { mkdirSync } from "node:fs";
import path from "node:path";

import type {
  AppSettingsSnapshot,
  AppSettingsUpdateInput
} from "../../shared/bridge/contracts";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";
import { resolveAppSettings } from "./app-settings-service";

type PersistedAppSettingKey =
  | "holiday_api_base_url"
  | "pending_dir"
  | "approved_dir"
  | "schedule_export_dir"
  | "allowance_proposal_export_dir"
  | "allowance_attachment1_export_dir"
  | "allowance_attachment2_export_dir"
  | "database_backup_dir"
  | "database_backup_schedule"
  | "database_backup_time"
  | "migration_file_path"
  | "schedule_consecutive_night_limit"
  | "schedule_minimum_rest_minutes"
  | "schedule_require_weekly_holiday"
  | "schedule_weekly_max_minutes"
  | "substitute_allowance_policy_effective_from"
  | "changed_slot_priority_effective_from"
  | "update_last_seen_patch_note_version"
  | "update_last_skipped_version";

const persistedSettingKeyMap: Record<
  keyof Pick<
    AppSettingsSnapshot,
    | "holidayApiBaseUrl"
    | "pendingDir"
    | "approvedDir"
    | "scheduleExportDir"
    | "allowanceProposalExportDir"
    | "allowanceAttachment1ExportDir"
    | "allowanceAttachment2ExportDir"
    | "databaseBackupDir"
    | "databaseBackupSchedule"
    | "databaseBackupTime"
    | "migrationFilePath"
    | "scheduleConsecutiveNightLimit"
    | "scheduleMinimumRestMinutes"
    | "scheduleRequireWeeklyHoliday"
    | "scheduleWeeklyMaxMinutes"
    | "substituteAllowancePolicyEffectiveFrom"
    | "changedSlotPriorityEffectiveFrom"
  >,
  PersistedAppSettingKey
> = {
  holidayApiBaseUrl: "holiday_api_base_url",
  pendingDir: "pending_dir",
  approvedDir: "approved_dir",
  scheduleExportDir: "schedule_export_dir",
  allowanceProposalExportDir: "allowance_proposal_export_dir",
  allowanceAttachment1ExportDir: "allowance_attachment1_export_dir",
  allowanceAttachment2ExportDir: "allowance_attachment2_export_dir",
  databaseBackupDir: "database_backup_dir",
  databaseBackupSchedule: "database_backup_schedule",
  databaseBackupTime: "database_backup_time",
  migrationFilePath: "migration_file_path",
  scheduleConsecutiveNightLimit: "schedule_consecutive_night_limit",
  scheduleMinimumRestMinutes: "schedule_minimum_rest_minutes",
  scheduleRequireWeeklyHoliday: "schedule_require_weekly_holiday",
  scheduleWeeklyMaxMinutes: "schedule_weekly_max_minutes",
  substituteAllowancePolicyEffectiveFrom: "substitute_allowance_policy_effective_from",
  changedSlotPriorityEffectiveFrom: "changed_slot_priority_effective_from"
};

const resolveStoredPath = (dataDir: string, targetPath: string) =>
  path.isAbsolute(targetPath) ? path.normalize(targetPath) : path.resolve(dataDir, targetPath);

const normalizeRequiredText = (value: string, label: string) => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${label}은 비워둘 수 없습니다.`);
  }

  return trimmed;
};

const normalizeOptionalText = (value?: string | null) => String(value ?? "").trim();
const backupTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

// 대체수당 새 정책 시작일. 비워두면 "미설정"(새 규칙 미적용)이고, 값이 있으면 날짜 형식을 강제한다.
const normalizeOptionalIsoDate = (value: string | undefined, label: string) => {
  const trimmed = String(value ?? "").trim();

  if (trimmed.length === 0) {
    return "";
  }

  if (!isoDatePattern.test(trimmed) || Number.isNaN(new Date(`${trimmed}T00:00:00`).getTime())) {
    throw new Error(`${label}은 YYYY-MM-DD 형식으로 입력해야 합니다.`);
  }

  return trimmed;
};

const normalizePositiveInteger = (value: number, label: string) => {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error(`${label}은 1 이상의 정수여야 합니다.`);
  }

  return normalized;
};

const upsertStoredSetting = (settingKey: string, value: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("앱 설정 저장소가 초기화되지 않았습니다.");
  }

  database
    .prepare(
      `
        INSERT INTO app_setting_entries (
          setting_key,
          value,
          updated_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `
    )
    .run(settingKey, value, new Date().toISOString());
};

const deleteStoredSetting = (settingKey: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("앱 설정 저장소가 초기화되지 않았습니다.");
  }

  database
    .prepare(
      `
        DELETE FROM app_setting_entries
        WHERE setting_key = ?
      `
    )
    .run(settingKey);
};

const normalizeBackupSchedule = (value: string) => {
  if (value === "monthly" || value === "weekly" || value === "daily") {
    return value;
  }

  throw new Error("백업 주기는 월간, 주간, 일간 중 하나여야 합니다.");
};

const normalizeBackupTime = (value: string) => {
  const trimmed = value.trim();

  if (!backupTimePattern.test(trimmed)) {
    throw new Error("백업 시간은 HH:mm 형식으로 입력해야 합니다.");
  }

  return trimmed;
};

const loadPersistedAppSettingValues = (): Partial<
  Pick<
    AppSettingsSnapshot,
    | "holidayApiBaseUrl"
    | "pendingDir"
    | "approvedDir"
    | "scheduleExportDir"
    | "allowanceProposalExportDir"
    | "allowanceAttachment1ExportDir"
    | "allowanceAttachment2ExportDir"
    | "databaseBackupDir"
    | "databaseBackupSchedule"
    | "databaseBackupTime"
    | "migrationFilePath"
    | "scheduleConsecutiveNightLimit"
    | "scheduleMinimumRestMinutes"
    | "scheduleRequireWeeklyHoliday"
    | "scheduleWeeklyMaxMinutes"
    | "substituteAllowancePolicyEffectiveFrom"
    | "changedSlotPriorityEffectiveFrom"
  >
> => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return {};
  }

  const rows = database.prepare(`
    SELECT setting_key, value
    FROM app_setting_entries
  `).all() as Array<{ setting_key: PersistedAppSettingKey; value: string }>;

  return rows.reduce<Partial<AppSettingsSnapshot>>((accumulator, row) => {
    switch (row.setting_key) {
      case "holiday_api_base_url":
        accumulator.holidayApiBaseUrl = row.value;
        break;
      case "pending_dir":
        accumulator.pendingDir = row.value;
        break;
      case "approved_dir":
        accumulator.approvedDir = row.value;
        break;
      case "schedule_export_dir":
        accumulator.scheduleExportDir = row.value;
        break;
      case "allowance_proposal_export_dir":
        accumulator.allowanceProposalExportDir = row.value;
        break;
      case "allowance_attachment1_export_dir":
        accumulator.allowanceAttachment1ExportDir = row.value;
        break;
      case "allowance_attachment2_export_dir":
        accumulator.allowanceAttachment2ExportDir = row.value;
        break;
      case "database_backup_dir":
        accumulator.databaseBackupDir = row.value;
        break;
      case "database_backup_schedule":
        if (row.value === "monthly" || row.value === "weekly" || row.value === "daily") {
          accumulator.databaseBackupSchedule = row.value;
        }
        break;
      case "database_backup_time":
        accumulator.databaseBackupTime = row.value;
        break;
      case "migration_file_path":
        accumulator.migrationFilePath = row.value;
        break;
      case "schedule_consecutive_night_limit":
        accumulator.scheduleConsecutiveNightLimit = Number(row.value);
        break;
      case "schedule_minimum_rest_minutes":
        accumulator.scheduleMinimumRestMinutes = Number(row.value);
        break;
      case "schedule_require_weekly_holiday":
        accumulator.scheduleRequireWeeklyHoliday = row.value === "true";
        break;
      case "schedule_weekly_max_minutes":
        accumulator.scheduleWeeklyMaxMinutes = Number(row.value);
        break;
      case "substitute_allowance_policy_effective_from":
        accumulator.substituteAllowancePolicyEffectiveFrom = row.value;
        break;
      case "changed_slot_priority_effective_from":
        accumulator.changedSlotPriorityEffectiveFrom = row.value;
        break;
      default:
        break;
    }

    return accumulator;
  }, {});
};

const ensureWritableDirectories = (settings: AppSettingsSnapshot) => {
  mkdirSync(settings.pendingDir, { recursive: true });
  mkdirSync(settings.approvedDir, { recursive: true });
  mkdirSync(settings.scheduleExportDir, { recursive: true });
  mkdirSync(settings.allowanceProposalExportDir, { recursive: true });
  mkdirSync(settings.allowanceAttachment1ExportDir, { recursive: true });
  mkdirSync(settings.allowanceAttachment2ExportDir, { recursive: true });
  mkdirSync(settings.databaseBackupDir, { recursive: true });
};

export const getStoredAppSettingsSnapshot = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): AppSettingsSnapshot => {
  const baseSettings = resolveAppSettings(input);
  const persistedValues = loadPersistedAppSettingValues();
  const mergedSettings = {
    ...baseSettings,
    ...persistedValues
  };

  return {
    ...mergedSettings,
    allowanceProposalExportDir:
      persistedValues.allowanceProposalExportDir ?? mergedSettings.scheduleExportDir,
    allowanceAttachment1ExportDir:
      persistedValues.allowanceAttachment1ExportDir ?? mergedSettings.scheduleExportDir,
    allowanceAttachment2ExportDir:
      persistedValues.allowanceAttachment2ExportDir ?? mergedSettings.scheduleExportDir,
    databaseBackupDir:
      persistedValues.databaseBackupDir ?? mergedSettings.databaseBackupDir,
    databaseBackupSchedule:
      persistedValues.databaseBackupSchedule ?? mergedSettings.databaseBackupSchedule,
    databaseBackupTime:
      persistedValues.databaseBackupTime ?? mergedSettings.databaseBackupTime,
    migrationFilePath: persistedValues.migrationFilePath ?? mergedSettings.migrationFilePath,
    scheduleConsecutiveNightLimit:
      persistedValues.scheduleConsecutiveNightLimit ??
      mergedSettings.scheduleConsecutiveNightLimit,
    scheduleMinimumRestMinutes:
      persistedValues.scheduleMinimumRestMinutes ?? mergedSettings.scheduleMinimumRestMinutes,
    scheduleRequireWeeklyHoliday:
      persistedValues.scheduleRequireWeeklyHoliday ??
      mergedSettings.scheduleRequireWeeklyHoliday,
    scheduleWeeklyMaxMinutes:
      persistedValues.scheduleWeeklyMaxMinutes ?? mergedSettings.scheduleWeeklyMaxMinutes,
    substituteAllowancePolicyEffectiveFrom:
      persistedValues.substituteAllowancePolicyEffectiveFrom ??
      mergedSettings.substituteAllowancePolicyEffectiveFrom,
    changedSlotPriorityEffectiveFrom:
      persistedValues.changedSlotPriorityEffectiveFrom ??
      mergedSettings.changedSlotPriorityEffectiveFrom
  };
};

export const getStoredAppSettingEntry = (settingKey: PersistedAppSettingKey | string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  const row = database
    .prepare(
      `
        SELECT value
        FROM app_setting_entries
        WHERE setting_key = ?
      `
    )
    .get(settingKey) as { value: string } | undefined;

  return row?.value ?? null;
};

// 회수 파일의 대체수당 판정은 파싱 시점의 정책 시작일로 저장되고, 파일이 그대로면 다시 읽지 않는다.
// 그래서 시작일을 나중에 바꾸면 이미 대기열에 있는 파일은 옛 판정이 남는다.
// 값이 바뀌면 표시만 남겨 두고, 다음 실적 조회 때 대기 파일을 한 번 다시 읽게 한다.
// (승인이 끝난 보관본은 건드리지 않는다 — 과거 지급분은 그대로 둔다.)
const POLICY_EFFECTIVE_DATE_SETTING_KEYS = new Set<string>([
  persistedSettingKeyMap.substituteAllowancePolicyEffectiveFrom,
  persistedSettingKeyMap.changedSlotPriorityEffectiveFrom
]);
const SUBSTITUTE_POLICY_REPARSE_MARKER_KEY = "substitute_allowance_policy_reparse_marker";

const markSubstitutePolicyChange = () => {
  upsertStoredSetting(SUBSTITUTE_POLICY_REPARSE_MARKER_KEY, new Date().toISOString());
};

// 표시가 남아 있으면 지우고 true를 돌려준다(한 번만 다시 읽도록).
export const consumeSubstituteAllowancePolicyReparseMarker = () => {
  const marker = getStoredAppSettingEntry(SUBSTITUTE_POLICY_REPARSE_MARKER_KEY);

  if (!marker) {
    return false;
  }

  deleteStoredSetting(SUBSTITUTE_POLICY_REPARSE_MARKER_KEY);

  return true;
};

const EMPLOYEE_ELIGIBILITY_REPARSE_MARKER_KEY = "employee_eligibility_reparse_marker";

// A hire or retire date moved after a file was parsed leaves 승인대기 rows judged by the old dates
// until the file is read again, and an unchanged file is not read again on its own. The change
// leaves this one-shot marker; the next overview reads the pending files once more (T-12).
export const markEmployeeEligibilityReparseRequired = () => {
  upsertStoredSetting(EMPLOYEE_ELIGIBILITY_REPARSE_MARKER_KEY, new Date().toISOString());
};

export const consumeEmployeeEligibilityReparseMarker = () => {
  const marker = getStoredAppSettingEntry(EMPLOYEE_ELIGIBILITY_REPARSE_MARKER_KEY);

  if (!marker) {
    return false;
  }

  deleteStoredSetting(EMPLOYEE_ELIGIBILITY_REPARSE_MARKER_KEY);

  return true;
};

export const saveStoredAppSettingEntry = (
  settingKey: PersistedAppSettingKey | string,
  value: string | null
) => {
  const isPolicyEffectiveDateKey = POLICY_EFFECTIVE_DATE_SETTING_KEYS.has(settingKey);
  const previousValue = isPolicyEffectiveDateKey ? getStoredAppSettingEntry(settingKey) : null;

  if (value === null) {
    deleteStoredSetting(settingKey);
  } else {
    upsertStoredSetting(settingKey, value);
  }

  if (isPolicyEffectiveDateKey && (previousValue ?? "") !== (value ?? "")) {
    markSubstitutePolicyChange();
  }
};

export const saveStoredAppSettings = (
  input: AppSettingsUpdateInput,
  context: {
    userDataPath: string;
    env?: NodeJS.ProcessEnv;
  }
): AppSettingsSnapshot => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("앱 설정 저장소가 초기화되지 않았습니다.");
  }

  const currentSettings = getStoredAppSettingsSnapshot(context);
  const nextSettings: AppSettingsSnapshot = {
    ...currentSettings,
    holidayApiBaseUrl: normalizeRequiredText(input.holidayApiBaseUrl, "공휴일 API 주소"),
    pendingDir: resolveStoredPath(
      currentSettings.dataDir,
      normalizeRequiredText(input.pendingDir, "승인 대기 폴더")
    ),
    approvedDir: resolveStoredPath(
      currentSettings.dataDir,
      normalizeRequiredText(input.approvedDir, "승인 완료 폴더")
    ),
    scheduleExportDir: resolveStoredPath(
      currentSettings.dataDir,
      normalizeRequiredText(input.scheduleExportDir, "근무표 내보내기 폴더")
    ),
    allowanceProposalExportDir: resolveStoredPath(
      currentSettings.dataDir,
      normalizeRequiredText(input.allowanceProposalExportDir, "품의서 저장 폴더")
    ),
    allowanceAttachment1ExportDir: resolveStoredPath(
      currentSettings.dataDir,
      normalizeRequiredText(input.allowanceAttachment1ExportDir, "별첨1 저장 폴더")
    ),
    allowanceAttachment2ExportDir: resolveStoredPath(
      currentSettings.dataDir,
      normalizeRequiredText(input.allowanceAttachment2ExportDir, "별첨2 저장 폴더")
    ),
    databaseBackupDir: resolveStoredPath(
      currentSettings.dataDir,
      normalizeRequiredText(input.databaseBackupDir, "DB 백업 저장 폴더")
    ),
    databaseBackupSchedule: normalizeBackupSchedule(input.databaseBackupSchedule),
    databaseBackupTime: normalizeBackupTime(input.databaseBackupTime),
    migrationFilePath: normalizeOptionalText(input.migrationFilePath),
    scheduleConsecutiveNightLimit: normalizePositiveInteger(
      input.scheduleConsecutiveNightLimit ?? currentSettings.scheduleConsecutiveNightLimit ?? 3,
      "연속 야간 경고 기준"
    ),
    scheduleMinimumRestMinutes: normalizePositiveInteger(
      input.scheduleMinimumRestMinutes ?? currentSettings.scheduleMinimumRestMinutes ?? 11 * 60,
      "최소 휴식시간 경고 기준"
    ),
    scheduleRequireWeeklyHoliday:
      input.scheduleRequireWeeklyHoliday ?? currentSettings.scheduleRequireWeeklyHoliday ?? true,
    scheduleWeeklyMaxMinutes: normalizePositiveInteger(
      input.scheduleWeeklyMaxMinutes ?? currentSettings.scheduleWeeklyMaxMinutes ?? 52 * 60,
      "주간 총 근무시간 경고 기준"
    ),
    substituteAllowancePolicyEffectiveFrom: normalizeOptionalIsoDate(
      input.substituteAllowancePolicyEffectiveFrom ??
        currentSettings.substituteAllowancePolicyEffectiveFrom,
      "대체근무수당 정책 적용 시작일"
    ),
    changedSlotPriorityEffectiveFrom: normalizeOptionalIsoDate(
      input.changedSlotPriorityEffectiveFrom ?? currentSettings.changedSlotPriorityEffectiveFrom,
      "변경후 우선 적용 시작일"
    )
  };

  if (nextSettings.pendingDir.toLowerCase() === nextSettings.approvedDir.toLowerCase()) {
    throw new Error("승인 대기 폴더와 승인 완료 폴더는 서로 달라야 합니다.");
  }

  ensureWritableDirectories(nextSettings);

  (
    [
      ["holidayApiBaseUrl", nextSettings.holidayApiBaseUrl],
      ["pendingDir", nextSettings.pendingDir],
      ["approvedDir", nextSettings.approvedDir],
      ["scheduleExportDir", nextSettings.scheduleExportDir],
      ["allowanceProposalExportDir", nextSettings.allowanceProposalExportDir],
      ["allowanceAttachment1ExportDir", nextSettings.allowanceAttachment1ExportDir],
      ["allowanceAttachment2ExportDir", nextSettings.allowanceAttachment2ExportDir],
      ["databaseBackupDir", nextSettings.databaseBackupDir],
      ["databaseBackupSchedule", nextSettings.databaseBackupSchedule],
      ["databaseBackupTime", nextSettings.databaseBackupTime],
      ["migrationFilePath", nextSettings.migrationFilePath],
      ["scheduleConsecutiveNightLimit", String(nextSettings.scheduleConsecutiveNightLimit)],
      ["scheduleMinimumRestMinutes", String(nextSettings.scheduleMinimumRestMinutes)],
      ["scheduleRequireWeeklyHoliday", String(nextSettings.scheduleRequireWeeklyHoliday)],
      ["scheduleWeeklyMaxMinutes", String(nextSettings.scheduleWeeklyMaxMinutes)],
      [
        "substituteAllowancePolicyEffectiveFrom",
        nextSettings.substituteAllowancePolicyEffectiveFrom ?? ""
      ],
      ["changedSlotPriorityEffectiveFrom", nextSettings.changedSlotPriorityEffectiveFrom ?? ""]
    ] as const
  ).forEach(([key, value]) => {
    upsertStoredSetting(persistedSettingKeyMap[key], value);
  });

  // 두 정책 시작일 모두 파싱 시점에 굳으므로, 바뀌면 대기 파일을 한 번 다시 읽게 표시한다.
  if (
    (currentSettings.substituteAllowancePolicyEffectiveFrom ?? "") !==
      (nextSettings.substituteAllowancePolicyEffectiveFrom ?? "") ||
    (currentSettings.changedSlotPriorityEffectiveFrom ?? "") !==
      (nextSettings.changedSlotPriorityEffectiveFrom ?? "")
  ) {
    markSubstitutePolicyChange();
  }

  return nextSettings;
};
