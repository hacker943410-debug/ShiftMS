import path from "node:path";

import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";

import type { AppSettings } from "./app-settings-service";

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

export const createFileWatchState = (settings: AppSettings): FileWatchState => ({
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

export const createFileWatchers = (settings: AppSettings): FSWatcher[] => [
  chokidar.watch(settings.pendingDir, {
    ignoreInitial: true,
    depth: 5
  }),
  chokidar.watch(settings.approvedDir, {
    ignoreInitial: true,
    depth: 5
  })
];
