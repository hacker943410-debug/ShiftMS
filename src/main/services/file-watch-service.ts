import path from "node:path";

import type { ChokidarOptions, FSWatcher } from "chokidar";
import chokidar from "chokidar";

export type WatchEventType =
  | "file-added"
  | "file-changed"
  | "file-removed"
  | "watcher-error";

export interface FileWatchState {
  pendingDir: string;
  approvedDir: string;
  isRunning: boolean;
}

export interface FileWatchEvent {
  type: WatchEventType;
  filePath: string;
  fileName: string;
  directoryType: "pending" | "approved" | "unknown";
  duplicateKey?: string;
  message?: string;
}

type FileWatchSettings = Pick<FileWatchState, "pendingDir" | "approvedDir">;

export const createFileWatchState = <T extends FileWatchSettings>(settings: T): FileWatchState => ({
  pendingDir: settings.pendingDir,
  approvedDir: settings.approvedDir,
  isRunning: false
});

export const createDuplicateFileKey = (input: {
  filePath: string;
  size: number;
  modifiedTimeMs: number;
}) =>
  `${path.normalize(input.filePath).toLowerCase()}::${input.size}::${Math.trunc(input.modifiedTimeMs)}`;

export const classifyWatchDirectory = (
  filePath: string,
  state: FileWatchState
): FileWatchEvent["directoryType"] => {
  const normalizedPath = path.normalize(filePath).toLowerCase();
  const pendingDir = path.normalize(state.pendingDir).toLowerCase();
  const approvedDir = path.normalize(state.approvedDir).toLowerCase();

  if (normalizedPath.startsWith(pendingDir)) {
    return "pending";
  }

  if (normalizedPath.startsWith(approvedDir)) {
    return "approved";
  }

  return "unknown";
};

export const toFileWatchEvent = (input: {
  type: WatchEventType;
  filePath: string;
  state: FileWatchState;
  size?: number;
  modifiedTimeMs?: number;
  message?: string;
}): FileWatchEvent => ({
  type: input.type,
  filePath: input.filePath,
  fileName: path.basename(input.filePath),
  directoryType: classifyWatchDirectory(input.filePath, input.state),
  duplicateKey:
    input.size !== undefined && input.modifiedTimeMs !== undefined
      ? createDuplicateFileKey({
          filePath: input.filePath,
          size: input.size,
          modifiedTimeMs: input.modifiedTimeMs
        })
      : undefined,
  message: input.message
});

// Wait until a dropped file's size stays stable before emitting add/change so the
// intake parser never reads a partially-copied workbook (folder drop / network copy).
export const fileWatchAwaitWriteFinish = {
  stabilityThreshold: 2000,
  pollInterval: 100
};

export const createFileWatchOptions = (): ChokidarOptions => ({
  ignoreInitial: true,
  depth: 5,
  awaitWriteFinish: fileWatchAwaitWriteFinish
});

export const createFileWatchers = <T extends FileWatchSettings>(settings: T): FSWatcher[] => [
  chokidar.watch(settings.pendingDir, createFileWatchOptions()),
  chokidar.watch(settings.approvedDir, createFileWatchOptions())
];
