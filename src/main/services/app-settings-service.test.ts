import path from "node:path";

import { describe, expect, it } from "vitest";

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
      pendingDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./imports/pending"
      ),
      approvedDir: path.resolve(
        path.resolve("C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4", "./data"),
        "./imports/approved"
      )
    });
  });

  it("should keep absolute paths as-is", () => {
    const settings = resolveAppSettings({
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\ShiftMgmt_V3.4",
      env: {
        DATA_DIR: "D:\\ShiftMgmtData",
        WATCH_PENDING_DIR: "D:\\ShiftMgmtData\\pending",
        WATCH_APPROVED_DIR: "D:\\ShiftMgmtData\\approved"
      }
    });

    expect(settings.dataDir).toBe("D:\\ShiftMgmtData");
    expect(settings.pendingDir).toBe("D:\\ShiftMgmtData\\pending");
    expect(settings.approvedDir).toBe("D:\\ShiftMgmtData\\approved");
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
      approvedDirectoryConfigured: true
    });
  });
});
