import { mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";

import type {
  FileWatchEventSnapshot,
  FileWatchStatusSnapshot
} from "../../shared/bridge/contracts";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import {
  createFileWatchState,
  createFileWatchers,
  toFileWatchEvent
} from "./file-watch-service";
import {
  applyPerformanceFileWatchEventToStorage,
  syncPendingPerformanceFilesToStorage
} from "./performance-file-intake-service";

type RuntimeWatcher = {
  on: (event: string, listener: (...args: any[]) => void) => RuntimeWatcher;
  close: () => Promise<unknown>;
};

type FileStatLike = {
  size: number;
  mtimeMs: number;
};

interface FileWatchRuntimeState {
  watchers: RuntimeWatcher[];
  snapshot: FileWatchStatusSnapshot;
}

const MAX_RECENT_EVENTS = 20;

let fileWatchRuntimeState: FileWatchRuntimeState | null = null;

let createRuntimeWatchers = (settings: ReturnType<typeof getStoredAppSettingsSnapshot>) =>
  createFileWatchers(settings) as unknown as RuntimeWatcher[];

let readFileStats = async (filePath: string): Promise<FileStatLike> => {
  const stats = await stat(filePath);

  return {
    size: stats.size,
    mtimeMs: stats.mtimeMs
  };
};

const cloneSnapshot = (snapshot: FileWatchStatusSnapshot): FileWatchStatusSnapshot => ({
  ...snapshot,
  recentEvents: snapshot.recentEvents.map((event) => ({ ...event }))
});

const createIdleSnapshot = (
  settings: ReturnType<typeof getStoredAppSettingsSnapshot>,
  previous?: Partial<FileWatchStatusSnapshot>
): FileWatchStatusSnapshot => ({
  isRunning: false,
  pendingDir: settings.pendingDir,
  approvedDir: settings.approvedDir,
  lastStartedAt: previous?.lastStartedAt,
  lastStoppedAt: previous?.lastStoppedAt,
  lastErrorMessage: previous?.lastErrorMessage,
  recentEvents: previous?.recentEvents ? [...previous.recentEvents] : []
});

const appendRecentEvent = (snapshot: FileWatchStatusSnapshot, event: FileWatchEventSnapshot) => {
  snapshot.recentEvents = [event, ...snapshot.recentEvents].slice(0, MAX_RECENT_EVENTS);
};

const recordRuntimeEvent = async (
  snapshot: FileWatchStatusSnapshot,
  state: ReturnType<typeof createFileWatchState>,
  input: {
    type: FileWatchEventSnapshot["type"];
    filePath: string;
    message?: string;
  }
): Promise<FileWatchEventSnapshot> => {
  let size: number | undefined;
  let modifiedTimeMs: number | undefined;

  if (input.type !== "file-removed" && input.type !== "watcher-error") {
    const stats = await readFileStats(input.filePath).catch(() => null);

    if (stats) {
      size = stats.size;
      modifiedTimeMs = stats.mtimeMs;
    }
  }

  const event = toFileWatchEvent({
    type: input.type,
    filePath: input.filePath,
    state,
    size,
    modifiedTimeMs,
    message: input.message
  });

  const snapshotEvent = {
    ...event,
    occurredAt: new Date().toISOString()
  };

  appendRecentEvent(snapshot, snapshotEvent);

  if (input.type === "watcher-error") {
    snapshot.lastErrorMessage = input.message ?? "파일 감시 중 오류가 발생했습니다.";
  }

  return snapshotEvent;
};

const attachWatcherHandlers = (
  watchers: RuntimeWatcher[],
  settings: ReturnType<typeof getStoredAppSettingsSnapshot>,
  snapshot: FileWatchStatusSnapshot
) => {
  const state = createFileWatchState(settings);
  state.isRunning = true;
  const handleFileEvent = async (input: {
    type: "file-added" | "file-changed" | "file-removed";
    filePath: string;
  }) => {
    await recordRuntimeEvent(snapshot, state, input);

    const issue = await applyPerformanceFileWatchEventToStorage({
      ...input,
      settings
    });

    if (issue) {
      await recordRuntimeEvent(snapshot, state, {
        type: "watcher-error",
        filePath: issue.filePath,
        message: issue.message
      });
    }
  };

  watchers.forEach((watcher, index) => {
    const directoryPath = index === 0 ? settings.pendingDir : settings.approvedDir;

    watcher.on("add", (filePath: string) => {
      void handleFileEvent({
        type: "file-added",
        filePath
      });
    });
    watcher.on("change", (filePath: string) => {
      void handleFileEvent({
        type: "file-changed",
        filePath
      });
    });
    watcher.on("unlink", (filePath: string) => {
      void handleFileEvent({
        type: "file-removed",
        filePath
      });
    });
    watcher.on("error", (error: unknown) => {
      void recordRuntimeEvent(snapshot, state, {
        type: "watcher-error",
        filePath: directoryPath,
        message: error instanceof Error ? error.message : String(error)
      });
    });
  });
};

const closeRuntimeWatchers = async (watchers: RuntimeWatcher[]) => {
  await Promise.allSettled(watchers.map((watcher) => watcher.close()));
};

export const getFileWatchStatusSnapshot = (context: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): FileWatchStatusSnapshot => {
  if (fileWatchRuntimeState) {
    return cloneSnapshot(fileWatchRuntimeState.snapshot);
  }

  const settings = getStoredAppSettingsSnapshot(context);

  return createIdleSnapshot(settings);
};

export const restartFileWatchRuntime = async (context: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<FileWatchStatusSnapshot> => {
  const previousSnapshot = fileWatchRuntimeState?.snapshot;

  if (fileWatchRuntimeState) {
    await closeRuntimeWatchers(fileWatchRuntimeState.watchers);
    fileWatchRuntimeState = null;
  }

  const settings = getStoredAppSettingsSnapshot(context);
  mkdirSync(settings.pendingDir, { recursive: true });
  mkdirSync(settings.approvedDir, { recursive: true });

  const snapshot: FileWatchStatusSnapshot = {
    ...createIdleSnapshot(settings, previousSnapshot),
    isRunning: true,
    pendingDir: settings.pendingDir,
    approvedDir: settings.approvedDir,
    lastStartedAt: new Date().toISOString(),
    lastErrorMessage: undefined
  };
  const watchers = createRuntimeWatchers(settings);

  attachWatcherHandlers(watchers, settings, snapshot);
  const startupIssues = await syncPendingPerformanceFilesToStorage(settings);

  for (const issue of startupIssues) {
    await recordRuntimeEvent(snapshot, createFileWatchState(settings), {
      type: "watcher-error",
      filePath: issue.filePath,
      message: issue.message
    });
  }

  fileWatchRuntimeState = {
    watchers,
    snapshot
  };

  return cloneSnapshot(snapshot);
};

export const stopFileWatchRuntime = async (context: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<FileWatchStatusSnapshot> => {
  if (!fileWatchRuntimeState) {
    const settings = getStoredAppSettingsSnapshot(context);

    return createIdleSnapshot(settings);
  }

  const currentSnapshot = fileWatchRuntimeState.snapshot;
  await closeRuntimeWatchers(fileWatchRuntimeState.watchers);
  fileWatchRuntimeState = null;

  const settings = getStoredAppSettingsSnapshot(context);
  const stoppedSnapshot: FileWatchStatusSnapshot = {
    ...createIdleSnapshot(settings, currentSnapshot),
    lastStoppedAt: new Date().toISOString()
  };

  return stoppedSnapshot;
};

export const closeFileWatchRuntime = async () => {
  if (!fileWatchRuntimeState) {
    return;
  }

  await closeRuntimeWatchers(fileWatchRuntimeState.watchers);
  fileWatchRuntimeState = null;
};

export const configureFileWatchRuntimeForTest = (input?: {
  createWatchers?: typeof createRuntimeWatchers;
  statFile?: typeof readFileStats;
}) => {
  createRuntimeWatchers =
    input?.createWatchers ??
    ((settings) => createFileWatchers(settings) as unknown as RuntimeWatcher[]);
  readFileStats =
    input?.statFile ??
    (async (filePath) => {
      const stats = await stat(filePath);

      return {
        size: stats.size,
        mtimeMs: stats.mtimeMs
      };
    });
};

export const resetFileWatchRuntimeForTest = async () => {
  await closeFileWatchRuntime();
  configureFileWatchRuntimeForTest();
};
