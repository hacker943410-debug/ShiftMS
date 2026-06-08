import { EventEmitter } from "node:events";
import path from "node:path";
import { rmSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReleaseManifest } from "../../shared/domain/app-update";
import { createAppUpdateService } from "./app-update-service";
import {
  getStoredAppSettingEntry,
  saveStoredAppSettingEntry
} from "./app-settings-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "app-update-service");

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  forceDevUpdateConfig = false;
  nextUpdateInfo: { version?: string | null } | null = null;
  checkError: Error | null = null;
  downloadError: Error | null = null;
  downloadCallCount = 0;
  quitAndInstall = vi.fn<(isSilent?: boolean, isForceRunAfter?: boolean) => void>(() => undefined);

  async checkForUpdates() {
    if (this.checkError) {
      throw this.checkError;
    }

    return {
      updateInfo: this.nextUpdateInfo
    };
  }

  async downloadUpdate() {
    this.downloadCallCount += 1;

    if (this.downloadError) {
      throw this.downloadError;
    }

    this.emit("download-progress", { percent: 55 });
    this.emit("update-downloaded");
    return null;
  }
}

const createFetchMock = (manifests: Record<string, ReleaseManifest>) =>
  vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const releaseMatch = url.match(/\/releases\/tags\/v(.+)$/);

    if (releaseMatch) {
      const version = releaseMatch[1];
      const manifest = manifests[version];

      if (!manifest) {
        return new Response(null, { status: 404 });
      }

      return new Response(
        JSON.stringify({
          assets: [
            {
              id: 1,
              name: "RELEASE_MANIFEST.json",
              browser_download_url: `https://example.test/${version}/RELEASE_MANIFEST.json`
            }
          ]
        }),
        { status: 200 }
      );
    }

    const assetMatch = url.match(/https:\/\/example\.test\/(.+)\/RELEASE_MANIFEST\.json$/);

    if (assetMatch) {
      const manifest = manifests[assetMatch[1]];

      if (!manifest) {
        return new Response(null, { status: 404 });
      }

      return new Response(JSON.stringify(manifest), { status: 200 });
    }

    return new Response(null, { status: 404 });
  });

const createManifest = (
  version: string,
  overrides?: Partial<ReleaseManifest>
): ReleaseManifest => ({
  version,
  required: false,
  headline: `v${version} 업데이트`,
  notes: [`${version} 기능 보강`],
  requiresDbBackup: false,
  publishedAt: "2026-04-23T00:00:00.000Z",
  ...overrides
});

describe("app-update-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { force: true, recursive: true });
  });

  it("surfaces startup updates before downloading the installer", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRoot, "startup-check.sqlite")
    });
    saveStoredAppSettingEntry("update_last_skipped_version", "0.4.9");

    const updater = new FakeUpdater();
    updater.nextUpdateInfo = { version: "0.4.9" };
    const service = createAppUpdateService({
      currentVersion: "0.4.8",
      fetchImpl: createFetchMock({
        "0.4.9": createManifest("0.4.9")
      }),
      isPackaged: true,
      updater,
      userDataPath: path.resolve(testRoot, "user-data")
    });

    await service.initialize();
    const state = await service.checkForAppUpdate();

    expect(state.status).toBe("available");
    expect(state.targetVersion).toBe("0.4.9");
    expect(updater.autoDownload).toBe(false);
    expect(updater.downloadCallCount).toBe(0);
    expect(getStoredAppSettingEntry("update_last_skipped_version")).toBeNull();
  });

  it("suppresses a skipped optional update during silent check and shows it on manual check", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRoot, "silent-check.sqlite")
    });
    saveStoredAppSettingEntry("update_last_skipped_version", "0.4.5");

    const updater = new FakeUpdater();
    updater.nextUpdateInfo = { version: "0.4.5" };
    const service = createAppUpdateService({
      currentVersion: "0.4.4",
      fetchImpl: createFetchMock({
        "0.4.5": createManifest("0.4.5")
      }),
      isPackaged: true,
      updater,
      userDataPath: path.resolve(testRoot, "user-data")
    });

    const silentState = await service.checkForAppUpdate({ silent: true });
    const manualState = await service.checkForAppUpdate();

    expect(silentState.status).toBe("idle");
    expect(manualState.status).toBe("available");
    expect(manualState.targetVersion).toBe("0.4.5");
    expect(manualState.availableManifest?.headline).toBe("v0.4.5 업데이트");
  });

  it("surfaces a required update even when the same version was skipped before", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRoot, "required-check.sqlite")
    });
    saveStoredAppSettingEntry("update_last_skipped_version", "0.4.6");

    const updater = new FakeUpdater();
    updater.nextUpdateInfo = { version: "0.4.6" };
    const service = createAppUpdateService({
      currentVersion: "0.4.4",
      fetchImpl: createFetchMock({
        "0.4.6": createManifest("0.4.6", {
          required: true
        })
      }),
      isPackaged: true,
      updater,
      userDataPath: path.resolve(testRoot, "user-data")
    });

    const state = await service.checkForAppUpdate({ silent: true });

    expect(state.status).toBe("available");
    expect(state.required).toBe(true);
    expect(state.targetVersion).toBe("0.4.6");
  });

  it("loads every unseen release note between the last confirmed version and the current version", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRoot, "release-notes.sqlite")
    });
    saveStoredAppSettingEntry("update_last_seen_patch_note_version", "0.4.2");

    const updater = new FakeUpdater();
    const service = createAppUpdateService({
      currentVersion: "0.4.4",
      isPackaged: true,
      updater,
      userDataPath: path.resolve(testRoot, "user-data")
    });

    const initializedState = await service.initialize();
    const dismissedState = await service.dismissUpdateNotice("0.4.4");

    expect(initializedState.releaseNotesToShow?.manifests.map((manifest) => manifest.version)).toEqual([
      "0.4.3",
      "0.4.4"
    ]);
    expect(initializedState.releaseNotesToShow?.toVersion).toBe("0.4.4");
    expect(dismissedState.releaseNotesToShow).toBeNull();
    expect(getStoredAppSettingEntry("update_last_seen_patch_note_version")).toBe("0.4.4");
  });

  it("backs up the database before installing an update that requires backup", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRoot, "install-update.sqlite")
    });

    const updater = new FakeUpdater();
    updater.nextUpdateInfo = { version: "0.4.7" };
    const runDatabaseBackup = vi.fn(async () => ({
      createdAt: "2026-04-23T00:00:00.000Z",
      jsonBackupPath: "backup.json",
      warningMessages: []
    }));
    const service = createAppUpdateService({
      currentVersion: "0.4.4",
      fetchImpl: createFetchMock({
        "0.4.7": createManifest("0.4.7", {
          requiresDbBackup: true
        })
      }),
      isPackaged: true,
      runDatabaseBackup,
      updater,
      userDataPath: path.resolve(testRoot, "user-data")
    });

    await service.initialize();
    await service.checkForAppUpdate();
    await service.downloadAppUpdate();
    await service.installDownloadedUpdate();

    expect(runDatabaseBackup).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("keeps the downloaded state when backup fails during install", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRoot, "install-failure.sqlite")
    });

    const updater = new FakeUpdater();
    updater.nextUpdateInfo = { version: "0.4.8" };
    const runDatabaseBackup = vi.fn(async () => {
      throw new Error("backup failed");
    });
    const service = createAppUpdateService({
      currentVersion: "0.4.4",
      fetchImpl: createFetchMock({
        "0.4.8": createManifest("0.4.8", {
          requiresDbBackup: true
        })
      }),
      isPackaged: true,
      runDatabaseBackup,
      updater,
      userDataPath: path.resolve(testRoot, "user-data")
    });

    await service.initialize();
    await service.checkForAppUpdate();
    await service.downloadAppUpdate();

    await expect(service.installDownloadedUpdate()).rejects.toThrow("backup failed");

    expect(service.getUpdateState().status).toBe("downloaded");
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
