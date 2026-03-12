import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getStoredAppSettingsSnapshot,
  saveStoredAppSettings
} from "./app-settings-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "app-settings-storage");
const dbPath = path.resolve(testRoot, "app-settings-storage.test.sqlite");
const userDataPath = path.resolve(testRoot, "user-data");

describe("app-settings-storage-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should persist resolved directory settings in sqlite and create the directories", () => {
    initializeSqliteStorage({ dbPath });

    const saved = saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: "./runtime/pending-custom",
        approvedDir: "./runtime/approved-custom",
        scheduleExportDir: "./runtime/schedule-exports"
      },
      {
        userDataPath,
        env: {
          DATA_DIR: "./data-root"
        }
      }
    );

    expect(saved.holidayApiBaseUrl).toBe("https://example.com/holidays");
    expect(saved.pendingDir).toBe(path.resolve(saved.dataDir, "./runtime/pending-custom"));
    expect(saved.approvedDir).toBe(path.resolve(saved.dataDir, "./runtime/approved-custom"));
    expect(saved.scheduleExportDir).toBe(
      path.resolve(saved.dataDir, "./runtime/schedule-exports")
    );
    expect(existsSync(saved.pendingDir)).toBe(true);
    expect(existsSync(saved.approvedDir)).toBe(true);
    expect(existsSync(saved.scheduleExportDir)).toBe(true);

    expect(
      getStoredAppSettingsSnapshot({
        userDataPath,
        env: {
          DATA_DIR: "./data-root"
        }
      })
    ).toEqual(saved);
  });

  it("should reject using the same path for pending and approved directories", () => {
    initializeSqliteStorage({ dbPath });

    expect(() =>
      saveStoredAppSettings(
        {
          holidayApiBaseUrl: "https://example.com/holidays",
          pendingDir: "./runtime/shared",
          approvedDir: "./runtime/shared",
          scheduleExportDir: "./runtime/schedule-exports"
        },
        {
          userDataPath,
          env: {
            DATA_DIR: "./data-root"
          }
        }
      )
    ).toThrow("승인 대기 폴더와 승인 완료 폴더는 서로 달라야 합니다.");
  });
});
