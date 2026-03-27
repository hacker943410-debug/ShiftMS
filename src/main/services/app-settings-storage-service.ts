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
  | "migration_file_path";

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
  migrationFilePath: "migration_file_path"
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
    migrationFilePath: persistedValues.migrationFilePath ?? mergedSettings.migrationFilePath
  };
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
    migrationFilePath: normalizeOptionalText(input.migrationFilePath)
  };

  if (nextSettings.pendingDir.toLowerCase() === nextSettings.approvedDir.toLowerCase()) {
    throw new Error("승인 대기 폴더와 승인 완료 폴더는 서로 달라야 합니다.");
  }

  ensureWritableDirectories(nextSettings);

  const upsertSetting = database.prepare(`
    INSERT INTO app_setting_entries (
      setting_key,
      value,
      updated_at
    ) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  const updatedAt = new Date().toISOString();

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
      ["migrationFilePath", nextSettings.migrationFilePath]
    ] as const
  ).forEach(([key, value]) => {
    upsertSetting.run(persistedSettingKeyMap[key], value, updatedAt);
  });

  return nextSettings;
};
