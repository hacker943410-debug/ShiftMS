import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { autoUpdater } from "electron-updater";

import type { ReleaseManifest, UpdateStateSnapshot } from "../../shared/domain/app-update";
import { compareAppVersions, isAppVersionNewer } from "../../shared/domain/app-update";
import { runDatabaseBackupNow } from "./database-backup-service";
import {
  getStoredAppSettingEntry,
  saveStoredAppSettingEntry
} from "./app-settings-storage-service";
import {
  listReleaseNotesBetweenVersions,
  parseReleaseManifest
} from "./release-history-service";

type ProgressInfoLike = {
  percent?: number;
};

type UpdateInfoLike = {
  version?: string | null;
};

type UpdateCheckResultLike = {
  updateInfo?: UpdateInfoLike | null;
} | null;

type AppUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  forceDevUpdateConfig?: boolean;
  checkForUpdates: () => Promise<UpdateCheckResultLike>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => AppUpdaterLike;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type AppUpdateServiceDependencies = {
  currentVersion: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  isPackaged: boolean;
  runDatabaseBackup?: typeof runDatabaseBackupNow;
  startupCheckDelayMs?: number;
  startupCheckSilent?: boolean;
  updater?: AppUpdaterLike;
  userDataPath: string;
};

type GitHubReleaseAsset = {
  id: number;
  name: string;
  browser_download_url: string;
};

type GitHubReleaseByTagResponse = {
  assets?: GitHubReleaseAsset[];
};

const GITHUB_RELEASE_OWNER = "hacker943410-debug";
const GITHUB_RELEASE_REPO = "ShiftMS";
const RELEASE_MANIFEST_ASSET_NAME = "RELEASE_MANIFEST.json";
const UPDATE_LAST_SEEN_PATCH_NOTE_KEY = "update_last_seen_patch_note_version";
const UPDATE_LAST_SKIPPED_VERSION_KEY = "update_last_skipped_version";

const createInitialUpdateState = (input: {
  currentVersion: string;
  enabled: boolean;
}): UpdateStateSnapshot => ({
  enabled: input.enabled,
  status: "idle",
  currentVersion: input.currentVersion,
  availableManifest: null,
  releaseNotesToShow: null
});

const buildManifestCachePath = (userDataPath: string, version: string) =>
  path.resolve(userDataPath, "update-cache", `release-manifest-v${version}.json`);

const buildReleaseByTagUrl = (version: string) =>
  `https://api.github.com/repos/${GITHUB_RELEASE_OWNER}/${GITHUB_RELEASE_REPO}/releases/tags/v${version}`;

const normalizeProgress = (value?: number) => {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
};

const buildFallbackHeadline = (version: string) => `v${version} 업데이트`;

const createUpdateErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback} ${error.message.trim()}`;
  }

  return fallback;
};

const createGitHubHeaders = (env?: NodeJS.ProcessEnv) => {
  const token = env?.GH_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ShiftMgmt-App-Updater"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const readCachedReleaseManifest = async (input: {
  userDataPath: string;
  version: string;
}) => {
  try {
    const fileText = await readFile(buildManifestCachePath(input.userDataPath, input.version), "utf8");
    return parseReleaseManifest(JSON.parse(fileText));
  } catch {
    return null;
  }
};

const writeCachedReleaseManifest = async (input: {
  manifest: ReleaseManifest;
  userDataPath: string;
}) => {
  const cachePath = buildManifestCachePath(input.userDataPath, input.manifest.version);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(input.manifest, null, 2)}\n`, "utf8");
};

const fetchReleaseManifestFromGitHub = async (input: {
  env?: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  version: string;
}) => {
  const releaseResponse = await input.fetchImpl(buildReleaseByTagUrl(input.version), {
    headers: createGitHubHeaders(input.env)
  });

  if (releaseResponse.status === 404) {
    return null;
  }

  if (!releaseResponse.ok) {
    throw new Error(`GitHub Release 조회 실패 (${releaseResponse.status})`);
  }

  const releasePayload = (await releaseResponse.json()) as GitHubReleaseByTagResponse;
  const manifestAsset = releasePayload.assets?.find(
    (asset) => asset.name === RELEASE_MANIFEST_ASSET_NAME
  );

  if (!manifestAsset?.browser_download_url) {
    return null;
  }

  const manifestResponse = await input.fetchImpl(manifestAsset.browser_download_url, {
    headers: createGitHubHeaders(input.env)
  });

  if (!manifestResponse.ok) {
    throw new Error(`릴리즈 매니페스트 다운로드 실패 (${manifestResponse.status})`);
  }

  return parseReleaseManifest(await manifestResponse.json());
};

const resolveReleaseManifest = async (input: {
  env?: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  userDataPath: string;
  version: string;
}) => {
  try {
    const manifest = await fetchReleaseManifestFromGitHub(input);

    if (manifest) {
      await writeCachedReleaseManifest({
        manifest,
        userDataPath: input.userDataPath
      });
    }

    return manifest;
  } catch {
    return await readCachedReleaseManifest({
      userDataPath: input.userDataPath,
      version: input.version
    });
  }
};

const withCheckedAt = (state: UpdateStateSnapshot): UpdateStateSnapshot => ({
  ...state,
  checkedAt: new Date().toISOString()
});

export const createAppUpdateService = (dependencies: AppUpdateServiceDependencies) => {
  const updater = dependencies.updater ?? autoUpdater;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const runDatabaseBackupImpl = dependencies.runDatabaseBackup ?? runDatabaseBackupNow;
  const enabled =
    dependencies.isPackaged || dependencies.env?.ENABLE_APP_UPDATER_IN_DEV === "true";

  let state = createInitialUpdateState({
    currentVersion: dependencies.currentVersion,
    enabled
  });
  let initialized = false;
  let activeCheckPromise: Promise<UpdateStateSnapshot> | null = null;
  let startupCheckTimer: ReturnType<typeof setTimeout> | null = null;

  const downloadProgressListener = (...args: unknown[]) => {
    const progress = (args[0] as ProgressInfoLike | undefined)?.percent;
    state = {
      ...state,
      status: "downloading",
      downloadProgress: normalizeProgress(progress),
      errorMessage: undefined
    };
  };

  const updateDownloadedListener = () => {
    state = {
      ...state,
      status: "downloaded",
      downloadProgress: 100,
      errorMessage: undefined
    };
  };

  const errorListener = (...args: unknown[]) => {
    const error = args[0];
    const errorMessage = createUpdateErrorMessage(
      error,
      "업데이트 처리 중 오류가 발생했습니다."
    );

    if (state.status === "downloading" || state.status === "checking" || state.required) {
      state = {
        ...state,
        status: "error",
        errorMessage,
        checkedAt: new Date().toISOString()
      };
    }
  };

  const getUpdateState = () => ({ ...state });

  const attachListeners = () => {
    if (!enabled || initialized) {
      return;
    }

    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;

    if (!dependencies.isPackaged) {
      updater.forceDevUpdateConfig = true;
    }

    updater.on("download-progress", downloadProgressListener);
    updater.on("update-downloaded", updateDownloadedListener);
    updater.on("error", errorListener);
    initialized = true;
  };

  const clearAvailableUpdate = (nextStatus: UpdateStateSnapshot["status"] = "idle") => {
    state = withCheckedAt({
      ...state,
      status: nextStatus,
      targetVersion: undefined,
      downloadProgress: undefined,
      required: undefined,
      headline: undefined,
      errorMessage: nextStatus === "error" ? state.errorMessage : undefined,
      availableManifest: null
    });
  };

  const hydrateReleaseNotes = async () => {
    if (!enabled) {
      return;
    }

    const lastSeenPatchNoteVersion = getStoredAppSettingEntry(UPDATE_LAST_SEEN_PATCH_NOTE_KEY);

    if (!isAppVersionNewer(state.currentVersion, lastSeenPatchNoteVersion)) {
      return;
    }

    const manifests = listReleaseNotesBetweenVersions({
      currentVersion: state.currentVersion,
      lastSeenVersion: lastSeenPatchNoteVersion
    });

    if (manifests.length === 0) {
      return;
    }

    state = {
      ...state,
      releaseNotesToShow: {
        fromVersion: lastSeenPatchNoteVersion,
        toVersion: manifests[manifests.length - 1]?.version ?? state.currentVersion,
        manifests
      }
    };
  };

  const scheduleStartupUpdateCheck = () => {
    if (!enabled || startupCheckTimer) {
      return;
    }

    const delayMs = Math.max(0, dependencies.startupCheckDelayMs ?? 0);

    startupCheckTimer = setTimeout(() => {
      startupCheckTimer = null;
      void checkForAppUpdate({
        silent: dependencies.startupCheckSilent ?? false
      });
    }, delayMs);
  };

  const checkForAppUpdate = async (options?: {
    silent?: boolean;
  }): Promise<UpdateStateSnapshot> => {
    if (!enabled) {
      return getUpdateState();
    }

    if (state.status === "downloading" || state.status === "downloaded") {
      return getUpdateState();
    }

    if (activeCheckPromise) {
      return activeCheckPromise;
    }

    const isSilent = options?.silent ?? false;

    state = {
      ...state,
      status: "checking",
      errorMessage: undefined
    };

    activeCheckPromise = (async () => {
      try {
        const result = await updater.checkForUpdates();
        const targetVersion = String((result?.updateInfo as UpdateInfoLike | undefined)?.version ?? "").trim();

        if (!targetVersion || compareAppVersions(targetVersion, state.currentVersion) <= 0) {
          clearAvailableUpdate();
          return getUpdateState();
        }

        if (!isSilent) {
          saveStoredAppSettingEntry(UPDATE_LAST_SKIPPED_VERSION_KEY, null);
        }

        const manifest = await resolveReleaseManifest({
          env: dependencies.env,
          fetchImpl,
          userDataPath: dependencies.userDataPath,
          version: targetVersion
        });
        const skippedVersion = getStoredAppSettingEntry(UPDATE_LAST_SKIPPED_VERSION_KEY);
        const required = manifest?.required ?? false;

        if (isSilent && !required && skippedVersion === targetVersion) {
          clearAvailableUpdate();
          return getUpdateState();
        }

        state = withCheckedAt({
          ...state,
          status: "available",
          targetVersion,
          downloadProgress: undefined,
          required,
          headline: manifest?.headline ?? buildFallbackHeadline(targetVersion),
          errorMessage: undefined,
          availableManifest: manifest ?? null
        });

        return getUpdateState();
      } catch (error) {
        if (!isSilent || state.required) {
          state = withCheckedAt({
            ...state,
            status: "error",
            errorMessage: createUpdateErrorMessage(
              error,
              "GitHub 릴리즈에서 업데이트 정보를 확인하지 못했습니다."
            )
          });
          return getUpdateState();
        }

        clearAvailableUpdate();
        return getUpdateState();
      } finally {
        activeCheckPromise = null;
      }
    })();

    return activeCheckPromise;
  };

  const downloadAppUpdate = async () => {
    if (!enabled) {
      return getUpdateState();
    }

    if (state.status !== "available" && !(state.status === "error" && state.targetVersion)) {
      throw new Error("다운로드할 업데이트가 없습니다.");
    }

    state = {
      ...state,
      status: "downloading",
      downloadProgress: 0,
      errorMessage: undefined
    };

    try {
      await updater.downloadUpdate();

      if (state.status === "downloading") {
        state = {
          ...state,
          status: "downloaded",
          downloadProgress: 100
        };
      }

      return getUpdateState();
    } catch (error) {
      state = withCheckedAt({
        ...state,
        status: "error",
        errorMessage: createUpdateErrorMessage(
          error,
          "업데이트 파일을 다운로드하지 못했습니다."
        )
      });
      return getUpdateState();
    }
  };

  const installDownloadedUpdate = async () => {
    if (!enabled) {
      return getUpdateState();
    }

    if (state.status !== "downloaded") {
      throw new Error("적용할 업데이트가 아직 준비되지 않았습니다.");
    }

    if (state.availableManifest?.requiresDbBackup) {
      await runDatabaseBackupImpl({
        userDataPath: dependencies.userDataPath,
        env: dependencies.env
      });
    }

    updater.quitAndInstall(false, true);

    return getUpdateState();
  };

  const dismissUpdateNotice = async (version: string) => {
    const normalizedVersion = version.trim();

    if (!normalizedVersion) {
      return getUpdateState();
    }

    if (state.releaseNotesToShow?.toVersion === normalizedVersion) {
      saveStoredAppSettingEntry(UPDATE_LAST_SEEN_PATCH_NOTE_KEY, normalizedVersion);
      state = {
        ...state,
        releaseNotesToShow: null
      };
      return getUpdateState();
    }

    if (
      state.status === "available" &&
      state.targetVersion === normalizedVersion &&
      !state.required
    ) {
      saveStoredAppSettingEntry(UPDATE_LAST_SKIPPED_VERSION_KEY, normalizedVersion);
      clearAvailableUpdate();
    }

    return getUpdateState();
  };

  const initialize = async () => {
    if (!enabled) {
      return getUpdateState();
    }

    attachListeners();
    await hydrateReleaseNotes();
    scheduleStartupUpdateCheck();
    return getUpdateState();
  };

  const dispose = () => {
    if (startupCheckTimer) {
      clearTimeout(startupCheckTimer);
      startupCheckTimer = null;
    }

    if (!initialized) {
      return;
    }

    updater.removeListener?.("download-progress", downloadProgressListener);
    updater.removeListener?.("update-downloaded", updateDownloadedListener);
    updater.removeListener?.("error", errorListener);
    initialized = false;
  };

  return {
    checkForAppUpdate,
    dismissUpdateNotice,
    dispose,
    downloadAppUpdate,
    getUpdateState,
    initialize,
    installDownloadedUpdate
  };
};

type AppUpdateService = ReturnType<typeof createAppUpdateService>;

let runtimeService: AppUpdateService | null = null;

const requireRuntimeService = () => {
  if (!runtimeService) {
    throw new Error("업데이트 서비스가 초기화되지 않았습니다.");
  }

  return runtimeService;
};

export const initializeAppUpdateService = async (input: AppUpdateServiceDependencies) => {
  runtimeService?.dispose();
  runtimeService = createAppUpdateService(input);
  return runtimeService.initialize();
};

export const disposeAppUpdateService = () => {
  runtimeService?.dispose();
  runtimeService = null;
};

export const getAppUpdateState = () =>
  runtimeService ? runtimeService.getUpdateState() : createInitialUpdateState({
    currentVersion: "0.0.0",
    enabled: false
  });

export const checkForAppUpdate = () => requireRuntimeService().checkForAppUpdate();

export const downloadAppUpdate = () => requireRuntimeService().downloadAppUpdate();

export const installDownloadedUpdate = () => requireRuntimeService().installDownloadedUpdate();

export const dismissUpdateNotice = (version: string) =>
  requireRuntimeService().dismissUpdateNotice(version);
