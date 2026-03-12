import { EventEmitter } from "node:events";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import {
  configureFileWatchRuntimeForTest,
  getFileWatchStatusSnapshot,
  resetFileWatchRuntimeForTest,
  restartFileWatchRuntime,
  stopFileWatchRuntime
} from "./file-watch-runtime-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

class FakeWatcher extends EventEmitter {
  closed = false;

  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "file-watch-runtime");
const dbPath = path.resolve(testRoot, "file-watch-runtime.test.sqlite");
const userDataPath = path.resolve(testRoot, "user-data");

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("file-watch-runtime-service", () => {
  afterEach(async () => {
    await resetFileWatchRuntimeForTest();
    resetSqliteStorageForTest();
  });

  it("should start runtime watchers from stored settings", async () => {
    initializeSqliteStorage({ dbPath });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports")
      },
      { userDataPath }
    );

    const pendingWatcher = new FakeWatcher();
    const approvedWatcher = new FakeWatcher();

    configureFileWatchRuntimeForTest({
      createWatchers: () => [pendingWatcher, approvedWatcher]
    });

    const snapshot = await restartFileWatchRuntime({ userDataPath });

    expect(snapshot.isRunning).toBe(true);
    expect(snapshot.pendingDir).toBe(path.resolve(testRoot, "pending"));
    expect(snapshot.approvedDir).toBe(path.resolve(testRoot, "approved"));
    expect(snapshot.lastStartedAt).toBeTruthy();

    const current = getFileWatchStatusSnapshot({ userDataPath });

    expect(current.isRunning).toBe(true);
    expect(current.pendingDir).toBe(snapshot.pendingDir);
  });

  it("should capture file events and stop runtime watchers", async () => {
    initializeSqliteStorage({ dbPath });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRoot, "pending"),
        approvedDir: path.resolve(testRoot, "approved"),
        scheduleExportDir: path.resolve(testRoot, "exports")
      },
      { userDataPath }
    );

    const pendingWatcher = new FakeWatcher();
    const approvedWatcher = new FakeWatcher();

    configureFileWatchRuntimeForTest({
      createWatchers: () => [pendingWatcher, approvedWatcher],
      statFile: async () => ({
        size: 2048,
        mtimeMs: 1710000000999
      })
    });

    await restartFileWatchRuntime({ userDataPath });

    pendingWatcher.emit("add", path.resolve(testRoot, "pending", "report.xlsx"));
    approvedWatcher.emit("error", new Error("Permission denied"));
    await flushAsync();

    const runningSnapshot = getFileWatchStatusSnapshot({ userDataPath });
    const eventTypes = runningSnapshot.recentEvents.map((event) => event.type);
    const errorEvent = runningSnapshot.recentEvents.find((event) => event.type === "watcher-error");
    const addedEvent = runningSnapshot.recentEvents.find((event) => event.type === "file-added");

    expect(eventTypes).toContain("watcher-error");
    expect(eventTypes).toContain("file-added");
    expect(errorEvent?.message).toBe("Permission denied");
    expect(addedEvent?.directoryType).toBe("pending");
    expect(addedEvent?.duplicateKey).toContain("report.xlsx::2048::1710000000999");
    expect(runningSnapshot.lastErrorMessage).toBe("Permission denied");

    const stoppedSnapshot = await stopFileWatchRuntime({ userDataPath });

    expect(stoppedSnapshot.isRunning).toBe(false);
    expect(stoppedSnapshot.lastStoppedAt).toBeTruthy();
    expect(pendingWatcher.closed).toBe(true);
    expect(approvedWatcher.closed).toBe(true);
  });
});
