import path from "node:path";

import type { AppHealth } from "../../shared/bridge/contracts";

export interface AppSettings {
  appName: string;
  holidayApiBaseUrl: string;
  dataDir: string;
  databasePath: string;
  pendingDir: string;
  approvedDir: string;
  scheduleExportDir: string;
}

const DEFAULT_SETTINGS = {
  appName: "ShiftMgmt_V3.4",
  holidayApiBaseUrl: "https://date.nager.at/api/v3/PublicHolidays",
  dataDir: "./data",
  databaseFileName: "shiftmgmt.sqlite",
  pendingDir: "./imports/pending",
  approvedDir: "./imports/approved",
  scheduleExportDir: "./exports/schedules"
} as const;

const resolveChildPath = (baseDir: string, targetPath: string) =>
  path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath);

export const resolveAppSettings = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): AppSettings => {
  const env = input.env ?? process.env;
  const dataRoot = resolveChildPath(
    input.userDataPath,
    env.DATA_DIR ?? DEFAULT_SETTINGS.dataDir
  );

  return {
    appName: env.APP_NAME ?? DEFAULT_SETTINGS.appName,
    holidayApiBaseUrl:
      env.HOLIDAY_API_BASE_URL ?? DEFAULT_SETTINGS.holidayApiBaseUrl,
    dataDir: dataRoot,
    databasePath: resolveChildPath(
      dataRoot,
      env.DATABASE_PATH ?? DEFAULT_SETTINGS.databaseFileName
    ),
    pendingDir: resolveChildPath(
      dataRoot,
      env.WATCH_PENDING_DIR ?? DEFAULT_SETTINGS.pendingDir
    ),
    approvedDir: resolveChildPath(
      dataRoot,
      env.WATCH_APPROVED_DIR ?? DEFAULT_SETTINGS.approvedDir
    ),
    scheduleExportDir: resolveChildPath(
      dataRoot,
      env.SCHEDULE_EXPORT_DIR ?? DEFAULT_SETTINGS.scheduleExportDir
    )
  };
};

export const createAppHealth = (input: {
  appVersion: string;
  environment: AppHealth["environment"];
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): AppHealth => {
  const settings = resolveAppSettings({
    userDataPath: input.userDataPath,
    env: input.env
  });

  return {
    appVersion: input.appVersion,
    environment: input.environment,
    databaseConfigured: settings.databasePath.length > 0,
    pendingDirectoryConfigured: settings.pendingDir.length > 0,
    approvedDirectoryConfigured: settings.approvedDir.length > 0
  };
};
