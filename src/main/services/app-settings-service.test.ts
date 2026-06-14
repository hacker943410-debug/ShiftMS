import path from "node:path";

import { describe, expect, it } from "vitest";

import { authSessionPolicy } from "../../shared/config/auth-session-policy";
import { createAppHealth, resolveAppSettings } from "./app-settings-service";

describe("resolveAppSettings", () => {
  it("should resolve relative directories under the user data path", () => {
    const settings = resolveAppSettings({
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4",
      env: {
        APP_NAME: "ShiftMgmt_V3.4",
        HOLIDAY_API_BASE_URL: "https://date.nager.at/api/v3/PublicHolidays",
        DATA_DIR: "./data",
        WATCH_PENDING_DIR: "./imports/pending",
        WATCH_APPROVED_DIR: "./imports/approved"
      }
    });

    expect(settings).toEqual({
      appName: "ShiftMgmt_V3.4",
      holidayApiBaseUrl: "https://date.nager.at/api/v3/PublicHolidays",
      dataDir: path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
      databasePath: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "shiftmgmt.sqlite"
      ),
      pendingDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./imports/pending"
      ),
      approvedDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./imports/approved"
      ),
      scheduleExportDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./exports/schedules"
      ),
      allowanceProposalExportDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./exports/allowances/proposal"
      ),
      allowanceAttachment1ExportDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./exports/allowances/attachment1"
      ),
      allowanceAttachment2ExportDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./exports/allowances/attachment2"
      ),
      databaseBackupDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./backups"
      ),
      databaseBackupSchedule: "daily",
      databaseBackupTime: "02:00",
      migrationFilePath: "",
      scheduleConsecutiveNightLimit: 3,
      scheduleMinimumRestMinutes: 660,
      scheduleRequireWeeklyHoliday: true,
      scheduleWeeklyMaxMinutes: 3120
    });
  });

  // Uses Windows drive-letter paths (D:\...) which path.isAbsolute only treats as absolute on win32;
  // the app ships Windows-only, so this assertion is Windows-specific.
  it.runIf(process.platform === "win32")("should keep absolute paths as-is", () => {
    const settings = resolveAppSettings({
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4",
      env: {
        DATA_DIR: "D:\\ShiftMgmtData",
        DATABASE_PATH: "D:\\ShiftMgmtData\\shiftmgmt.sqlite",
        WATCH_PENDING_DIR: "D:\\ShiftMgmtData\\pending",
        WATCH_APPROVED_DIR: "D:\\ShiftMgmtData\\approved"
      }
    });

    expect(settings.dataDir).toBe("D:\\ShiftMgmtData");
    expect(settings.databasePath).toBe("D:\\ShiftMgmtData\\shiftmgmt.sqlite");
    expect(settings.pendingDir).toBe("D:\\ShiftMgmtData\\pending");
    expect(settings.approvedDir).toBe("D:\\ShiftMgmtData\\approved");
    expect(settings.scheduleExportDir).toBe(
      path.resolve("D:\\ShiftMgmtData", "./exports/schedules")
    );
    expect(settings.allowanceProposalExportDir).toBe(
      path.resolve("D:\\ShiftMgmtData", "./exports/allowances/proposal")
    );
    expect(settings.allowanceAttachment1ExportDir).toBe(
      path.resolve("D:\\ShiftMgmtData", "./exports/allowances/attachment1")
    );
    expect(settings.allowanceAttachment2ExportDir).toBe(
      path.resolve("D:\\ShiftMgmtData", "./exports/allowances/attachment2")
    );
    expect(settings.databaseBackupDir).toBe(path.resolve("D:\\ShiftMgmtData", "./backups"));
    expect(settings.databaseBackupSchedule).toBe("daily");
    expect(settings.databaseBackupTime).toBe("02:00");
    expect(settings.migrationFilePath).toBe("");
    expect(settings.scheduleConsecutiveNightLimit).toBe(3);
    expect(settings.scheduleMinimumRestMinutes).toBe(660);
    expect(settings.scheduleRequireWeeklyHoliday).toBe(true);
    expect(settings.scheduleWeeklyMaxMinutes).toBe(3120);
  });
});

describe("createAppHealth", () => {
  it("should mark path-based settings as configured when they resolve successfully", () => {
    const health = createAppHealth({
      appVersion: "0.1.0",
      environment: "development",
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4"
    });

    expect(health).toEqual({
      appVersion: "0.1.0",
      environment: "development",
      databaseConfigured: true,
      pendingDirectoryConfigured: true,
      approvedDirectoryConfigured: true,
      sessionPolicy: authSessionPolicy
    });
  });
});
