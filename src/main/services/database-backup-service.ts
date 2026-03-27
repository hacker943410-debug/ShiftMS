import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppSettingsSnapshot } from "../../shared/bridge/contracts";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { getSqliteDatabase } from "./sqlite-storage-service";

interface BackupRuntimeState {
  interval: NodeJS.Timeout | null;
  lastTriggeredSlot: string | null;
}

export interface DatabaseBackupSummary {
  createdAt: string;
  jsonBackupPath: string;
  accessBackupPath?: string;
  warningMessages: string[];
}

const runtimeState: BackupRuntimeState = {
  interval: null,
  lastTriggeredSlot: null
};

const backupTickIntervalMs = 30_000;

const getTimestampSegment = (date = new Date()) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(
    date.getMinutes()
  ).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;

const resolveMigrationFilePath = (settings: AppSettingsSnapshot) => {
  const migrationFilePath = settings.migrationFilePath.trim();

  if (!migrationFilePath) {
    return "";
  }

  return path.isAbsolute(migrationFilePath)
    ? migrationFilePath
    : path.resolve(settings.dataDir, migrationFilePath);
};

const listUserTableNames = () => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("데이터베이스가 초기화되지 않았습니다.");
  }

  return database
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `
    )
    .all() as Array<{ name: string }>;
};

const buildJsonBackupSnapshot = () => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("데이터베이스가 초기화되지 않았습니다.");
  }

  const tables = listUserTableNames().reduce<Record<string, unknown[]>>((accumulator, row) => {
    accumulator[row.name] = database.prepare(`SELECT * FROM ${row.name}`).all() as unknown[];
    return accumulator;
  }, {});

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    tables
  };
};

const shouldRunForSchedule = (
  schedule: AppSettingsSnapshot["databaseBackupSchedule"],
  now: Date
) => {
  if (schedule === "daily") {
    return true;
  }

  if (schedule === "weekly") {
    return now.getDay() === 1;
  }

  return now.getDate() === 1;
};

const getScheduleSlotKey = (
  schedule: AppSettingsSnapshot["databaseBackupSchedule"],
  backupTime: string,
  now: Date
) =>
  `${schedule}:${backupTime}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;

export const runDatabaseBackupNow = async (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<DatabaseBackupSummary> => {
  const settings = getStoredAppSettingsSnapshot(input);
  const timestamp = getTimestampSegment();
  const createdAt = new Date().toISOString();
  const jsonDir = path.resolve(settings.databaseBackupDir, "json");
  const accessDir = path.resolve(settings.databaseBackupDir, "access");
  const jsonBackupPath = path.resolve(jsonDir, `shiftmgmt-backup-${timestamp}.json`);
  const accessSourcePath = resolveMigrationFilePath(settings);
  const warningMessages: string[] = [];

  await mkdir(jsonDir, { recursive: true });
  await mkdir(accessDir, { recursive: true });

  const jsonBackupPromise = writeFile(
    jsonBackupPath,
    JSON.stringify(buildJsonBackupSnapshot(), null, 2),
    "utf8"
  );

  const accessBackupPromise = (async () => {
    if (!accessSourcePath) {
      warningMessages.push("Access 원본 경로가 설정되지 않아 Access 백업은 생략했습니다.");
      return undefined;
    }

    if (path.extname(accessSourcePath).toLowerCase() !== ".accdb") {
      warningMessages.push("현재 마이그레이션 파일이 Access(.accdb)가 아니어서 Access 백업은 생략했습니다.");
      return undefined;
    }

    if (!existsSync(accessSourcePath)) {
      warningMessages.push("설정된 Access 원본 파일을 찾을 수 없어 Access 백업은 생략했습니다.");
      return undefined;
    }

    const accessBackupPath = path.resolve(accessDir, `access-backup-${timestamp}.accdb`);
    await copyFile(accessSourcePath, accessBackupPath);
    return accessBackupPath;
  })();

  const [, accessBackupPath] = await Promise.all([jsonBackupPromise, accessBackupPromise]);

  return {
    createdAt,
    jsonBackupPath,
    accessBackupPath,
    warningMessages
  };
};

const checkAndRunScheduledBackup = async (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}) => {
  const settings = getStoredAppSettingsSnapshot(input);
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  if (currentTime !== settings.databaseBackupTime) {
    return;
  }

  if (!shouldRunForSchedule(settings.databaseBackupSchedule, now)) {
    return;
  }

  const slotKey = getScheduleSlotKey(
    settings.databaseBackupSchedule,
    settings.databaseBackupTime,
    now
  );

  if (runtimeState.lastTriggeredSlot === slotKey) {
    return;
  }

  runtimeState.lastTriggeredSlot = slotKey;

  try {
    await runDatabaseBackupNow(input);
  } catch (error) {
    console.error("[database-backup] scheduled backup failed", error);
  }
};

export const restartDatabaseBackupRuntime = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}) => {
  if (runtimeState.interval) {
    clearInterval(runtimeState.interval);
    runtimeState.interval = null;
  }

  runtimeState.lastTriggeredSlot = null;
  runtimeState.interval = setInterval(() => {
    void checkAndRunScheduledBackup(input);
  }, backupTickIntervalMs);
};

export const stopDatabaseBackupRuntime = () => {
  if (runtimeState.interval) {
    clearInterval(runtimeState.interval);
    runtimeState.interval = null;
  }

  runtimeState.lastTriggeredSlot = null;
};
