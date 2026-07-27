import path from "node:path";

import type { AppHealth } from "../../shared/bridge/contracts";
import { authSessionPolicy } from "../../shared/config/auth-session-policy";

export interface AppSettings {
  appName: string;
  holidayApiBaseUrl: string;
  dataDir: string;
  databasePath: string;
  pendingDir: string;
  approvedDir: string;
  scheduleExportDir: string;
  allowanceProposalExportDir: string;
  allowanceAttachment1ExportDir: string;
  allowanceAttachment2ExportDir: string;
  databaseBackupDir: string;
  databaseBackupSchedule: "monthly" | "weekly" | "daily";
  databaseBackupTime: string;
  migrationFilePath: string;
  scheduleConsecutiveNightLimit: number;
  scheduleMinimumRestMinutes: number;
  scheduleRequireWeeklyHoliday: boolean;
  scheduleWeeklyMaxMinutes: number;
  // 대체근무수당 새 정책 적용 시작일(YYYY-MM-DD). 빈 값이면 새 규칙 미적용.
  substituteAllowancePolicyEffectiveFrom: string;
}

const DEFAULT_SETTINGS = {
  appName: "ShiftMgmt_V3.4",
  holidayApiBaseUrl: "https://date.nager.at/api/v3/PublicHolidays",
  dataDir: "./data",
  databaseFileName: "shiftmgmt.sqlite",
  pendingDir: "./imports/pending",
  approvedDir: "./imports/approved",
  scheduleExportDir: "./exports/schedules",
  allowanceProposalExportDir: "./exports/allowances/proposal",
  allowanceAttachment1ExportDir: "./exports/allowances/attachment1",
  allowanceAttachment2ExportDir: "./exports/allowances/attachment2",
  databaseBackupDir: "./backups",
  databaseBackupSchedule: "daily",
  databaseBackupTime: "02:00",
  migrationFilePath: "",
  scheduleConsecutiveNightLimit: 3,
  scheduleMinimumRestMinutes: 11 * 60,
  scheduleRequireWeeklyHoliday: true,
  scheduleWeeklyMaxMinutes: 52 * 60,
  substituteAllowancePolicyEffectiveFrom: ""
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
    ),
    allowanceProposalExportDir: resolveChildPath(
      dataRoot,
      env.ALLOWANCE_PROPOSAL_EXPORT_DIR ?? DEFAULT_SETTINGS.allowanceProposalExportDir
    ),
    allowanceAttachment1ExportDir: resolveChildPath(
      dataRoot,
      env.ALLOWANCE_ATTACHMENT1_EXPORT_DIR ?? DEFAULT_SETTINGS.allowanceAttachment1ExportDir
    ),
    allowanceAttachment2ExportDir: resolveChildPath(
      dataRoot,
      env.ALLOWANCE_ATTACHMENT2_EXPORT_DIR ?? DEFAULT_SETTINGS.allowanceAttachment2ExportDir
    ),
    databaseBackupDir: resolveChildPath(
      dataRoot,
      env.DATABASE_BACKUP_DIR ?? DEFAULT_SETTINGS.databaseBackupDir
    ),
    databaseBackupSchedule:
      env.DATABASE_BACKUP_SCHEDULE === "monthly" ||
      env.DATABASE_BACKUP_SCHEDULE === "weekly" ||
      env.DATABASE_BACKUP_SCHEDULE === "daily"
        ? env.DATABASE_BACKUP_SCHEDULE
        : DEFAULT_SETTINGS.databaseBackupSchedule,
    databaseBackupTime:
      env.DATABASE_BACKUP_TIME?.trim() || DEFAULT_SETTINGS.databaseBackupTime,
    migrationFilePath:
      env.MIGRATION_FILE_PATH?.trim() ??
      DEFAULT_SETTINGS.migrationFilePath,
    scheduleConsecutiveNightLimit:
      Number(env.SCHEDULE_CONSECUTIVE_NIGHT_LIMIT) > 0
        ? Number(env.SCHEDULE_CONSECUTIVE_NIGHT_LIMIT)
        : DEFAULT_SETTINGS.scheduleConsecutiveNightLimit,
    scheduleMinimumRestMinutes:
      Number(env.SCHEDULE_MINIMUM_REST_MINUTES) > 0
        ? Number(env.SCHEDULE_MINIMUM_REST_MINUTES)
        : DEFAULT_SETTINGS.scheduleMinimumRestMinutes,
    scheduleRequireWeeklyHoliday:
      env.SCHEDULE_REQUIRE_WEEKLY_HOLIDAY === "false"
        ? false
        : DEFAULT_SETTINGS.scheduleRequireWeeklyHoliday,
    scheduleWeeklyMaxMinutes:
      Number(env.SCHEDULE_WEEKLY_MAX_MINUTES) > 0
        ? Number(env.SCHEDULE_WEEKLY_MAX_MINUTES)
        : DEFAULT_SETTINGS.scheduleWeeklyMaxMinutes,
    substituteAllowancePolicyEffectiveFrom:
      env.SUBSTITUTE_ALLOWANCE_POLICY_EFFECTIVE_FROM?.trim() ??
      DEFAULT_SETTINGS.substituteAllowancePolicyEffectiveFrom
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
    approvedDirectoryConfigured: settings.approvedDir.length > 0,
    sessionPolicy: authSessionPolicy
  };
};
