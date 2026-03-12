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
  | "schedule_export_dir";

const persistedSettingKeyMap: Record<
  keyof Pick<
    AppSettingsSnapshot,
    "holidayApiBaseUrl" | "pendingDir" | "approvedDir" | "scheduleExportDir"
  >,
  PersistedAppSettingKey
> = {
  holidayApiBaseUrl: "holiday_api_base_url",
  pendingDir: "pending_dir",
  approvedDir: "approved_dir",
  scheduleExportDir: "schedule_export_dir"
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

const loadPersistedAppSettingValues = (): Partial<
  Pick<
    AppSettingsSnapshot,
    "holidayApiBaseUrl" | "pendingDir" | "approvedDir" | "scheduleExportDir"
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
};

export const getStoredAppSettingsSnapshot = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): AppSettingsSnapshot => {
  const baseSettings = resolveAppSettings(input);
  const persistedValues = loadPersistedAppSettingValues();

  return {
    ...baseSettings,
    ...persistedValues
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
    )
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
      ["scheduleExportDir", nextSettings.scheduleExportDir]
    ] as const
  ).forEach(([key, value]) => {
    upsertSetting.run(persistedSettingKeyMap[key], value, updatedAt);
  });

  return nextSettings;
};
