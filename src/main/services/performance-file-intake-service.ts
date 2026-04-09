import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PerformanceFileDetail } from "../../shared/domain/performance-file";
import { isPoolSubstitutePerformanceEntry } from "../../shared/domain/performance-file";
import type { AppSettings } from "./app-settings-service";
import { inspectExcelTemplate } from "./excel-template-parser";
import { toFileWatchEvent } from "./file-watch-service";
import {
  createPerformanceFileMetadataRecord,
  updatePerformanceFileMetadataStatus
} from "./performance-file-metadata-service";
import {
  getLatestPerformanceApprovalByFileId,
  getPerformanceApprovalHistoryByFileId
} from "./performance-approval-service";
import {
  deleteStoredPerformanceFileByPath,
  deleteStoredPerformanceFile,
  getStoredPerformanceFileDetail,
  getStoredPerformanceFileDetailByPath,
  listStoredPerformanceFileDetails,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import { buildApprovedPerformanceArchiveDirectory } from "./performance-file-archive-service";
import { parseReturnedSchedulePerformanceFile } from "./schedule-return-performance-parser";
import { isSqliteStorageReady } from "./sqlite-storage-service";

const supportedFileExtensions = new Set([".xlsx", ".xlsm", ".xls"]);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "실적 파일 처리 중 오류가 발생했습니다.";

const normalizeFileId = (value: string) => value.split(path.sep).join("/");

const createPerformanceFileId = (
  filePath: string,
  rootDir: string,
  modifiedTimeMs: number
) => {
  const relativePath = path.relative(rootDir, filePath);
  const versionToken = String(Math.trunc(modifiedTimeMs));

  if (!relativePath || relativePath.startsWith("..")) {
    return `${path.basename(filePath)}::${versionToken}`;
  }

  return `${normalizeFileId(relativePath)}::${versionToken}`;
};

const isSupportedPerformanceFile = (filePath: string) =>
  supportedFileExtensions.has(path.extname(filePath).toLowerCase());

const createDetail = (
  input: {
    metadata: Omit<
      PerformanceFileDetail,
      | "id"
      | "previewRows"
      | "entries"
      | "alerts"
      | "approvalHistory"
      | "latestApproval"
    >;
    fileId: string;
    previewRows: PerformanceFileDetail["previewRows"];
    entries: PerformanceFileDetail["entries"];
    alerts: PerformanceFileDetail["alerts"];
  }
): PerformanceFileDetail => ({
  ...input.metadata,
  id: input.fileId,
  previewRows: input.previewRows,
  entries: input.entries,
  alerts: input.alerts,
  approvalHistory: getPerformanceApprovalHistoryByFileId(input.fileId),
  latestApproval: getLatestPerformanceApprovalByFileId(input.fileId)
});

const resolvePendingDetailStatus = (input: {
  existingDetail: PerformanceFileDetail | null;
  existingPathDetail: PerformanceFileDetail | null;
  fallbackStatus: PerformanceFileDetail["status"];
}) =>
  input.existingDetail?.status === "rejected" || input.existingPathDetail?.status === "rejected"
    ? "rejected"
    : input.fallbackStatus;

const listFilesRecursive = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const resolvedPath = path.resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(resolvedPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(resolvedPath);
    }
  }

  return files;
};

export interface PerformanceFileSyncIssue {
  filePath: string;
  message: string;
}

export const buildPerformanceFileDetailFromPath = async (input: {
  filePath: string;
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">;
  receivedAt?: string;
}): Promise<PerformanceFileDetail | null> => {
  if (!isSupportedPerformanceFile(input.filePath)) {
    return null;
  }

  const fileStats = await stat(input.filePath).catch(() => null);

  if (!fileStats?.isFile()) {
    return null;
  }

  const state = {
    pendingDir: input.settings.pendingDir,
    approvedDir: input.settings.approvedDir,
    isRunning: false
  };
  const watchEvent = toFileWatchEvent({
    type: "file-added",
    filePath: input.filePath,
    state,
    size: fileStats.size,
    modifiedTimeMs: fileStats.mtimeMs
  });
  const rootDir =
    watchEvent.directoryType === "approved" ? input.settings.approvedDir : input.settings.pendingDir;
  const isApprovedDirectory = watchEvent.directoryType === "approved";
  const existingPathDetail = isSqliteStorageReady()
    ? getStoredPerformanceFileDetailByPath(input.filePath, watchEvent.directoryType)
    : null;
  const fileId =
    existingPathDetail?.id ??
    createPerformanceFileId(input.filePath, rootDir, fileStats.mtimeMs);
  const existingDetail = isSqliteStorageReady() ? getStoredPerformanceFileDetail(fileId) : null;
  const isReenteredPendingCycle =
    watchEvent.directoryType === "pending" && existingDetail?.directoryType === "approved";
  const receivedAt =
    input.receivedAt ??
    (isReenteredPendingCycle
      ? new Date().toISOString()
      : existingDetail?.receivedAt ?? existingPathDetail?.receivedAt);

  try {
    const inspection = await inspectExcelTemplate(input.filePath);
    const metadata = createPerformanceFileMetadataRecord({
      watchEvent,
      inspection,
      fileSize: fileStats.size,
      modifiedTimeMs: fileStats.mtimeMs,
      receivedAt
    });

    if (inspection.templateKind === "schedule-plan") {
      const parsed = await parseReturnedSchedulePerformanceFile({
        filePath: input.filePath,
        fileId
      });
      const effectiveEntries = parsed.entries.filter(
        (entry) => !isPoolSubstitutePerformanceEntry(entry)
      );
      const effectiveWarningCount =
        parsed.alerts.length +
        effectiveEntries.reduce((sum, entry) => sum + entry.alerts.length, 0);

      return createDetail({
        metadata: {
          ...metadata,
          templateVariant: parsed.templateVariant,
          scheduleMonth: parsed.scheduleMonth,
          siteName: parsed.siteName,
          scheduleKey: parsed.scheduleKey,
          entryCount: effectiveEntries.length,
          approvedEntryCount:
            isApprovedDirectory ? existingDetail?.approvedEntryCount ?? effectiveEntries.length : 0,
          warningCount: effectiveWarningCount,
          isEffective: existingDetail?.isEffective ?? false,
          status: isApprovedDirectory
            ? existingDetail?.status ?? "approved"
            : resolvePendingDetailStatus({
                existingDetail,
                existingPathDetail,
                fallbackStatus: metadata.status
              })
        },
        fileId,
        previewRows: parsed.previewRows,
        entries: parsed.entries,
        alerts: parsed.alerts
      });
    }

    return createDetail({
      metadata: {
        ...metadata,
        scheduleMonth: "",
        siteName: "",
        scheduleKey: "",
        entryCount: 0,
        approvedEntryCount: isApprovedDirectory ? existingDetail?.approvedEntryCount ?? 0 : 0,
        warningCount: 0,
        isEffective: existingDetail?.isEffective ?? false,
        status: isApprovedDirectory
          ? existingDetail?.status ?? "approved"
          : resolvePendingDetailStatus({
              existingDetail,
              existingPathDetail,
              fallbackStatus: metadata.status
            })
      },
      fileId,
      previewRows: [],
      entries: [],
      alerts: []
    });
  } catch (error) {
    const metadata = updatePerformanceFileMetadataStatus(
      createPerformanceFileMetadataRecord({
        watchEvent,
        fileSize: fileStats.size,
        modifiedTimeMs: fileStats.mtimeMs,
        receivedAt
      }),
      "error",
      getErrorMessage(error)
    );

    return createDetail({
      metadata,
      fileId,
      previewRows: [],
      entries: [],
      alerts: [
        {
          severity: "error",
          message: metadata.errorMessage ?? "실적 파일 처리 중 오류가 발생했습니다."
        }
      ]
    });
  }
};

export const applyPerformanceFileWatchEventToStorage = async (input: {
  type: "file-added" | "file-changed" | "file-removed";
  filePath: string;
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">;
}): Promise<PerformanceFileSyncIssue | null> => {
  if (!isSqliteStorageReady()) {
    return null;
  }

  if (!isSupportedPerformanceFile(input.filePath)) {
    return null;
  }

  const directoryType = toFileWatchEvent({
    type: input.type,
    filePath: input.filePath,
    state: {
      pendingDir: input.settings.pendingDir,
      approvedDir: input.settings.approvedDir,
      isRunning: false
    }
  }).directoryType;

  if (directoryType !== "pending") {
    return null;
  }

  if (input.type === "file-removed") {
    deleteStoredPerformanceFileByPath(input.filePath, "pending");
    return null;
  }

  const detail = await buildPerformanceFileDetailFromPath({
    filePath: input.filePath,
    settings: input.settings
  });

  if (!detail) {
    return null;
  }

  try {
    upsertPerformanceFileDetail(detail);
    return null;
  } catch (error) {
    return {
      filePath: input.filePath,
      message: getErrorMessage(error)
    };
  }
};

export const syncPendingPerformanceFilesToStorage = async (
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">
): Promise<PerformanceFileSyncIssue[]> => {
  if (!isSqliteStorageReady()) {
    return [];
  }

  const filePaths = (await listFilesRecursive(settings.pendingDir)).filter(isSupportedPerformanceFile);
  const activeFileIds = new Set<string>();
  const issues: PerformanceFileSyncIssue[] = [];

  for (const filePath of filePaths) {
    const detail = await buildPerformanceFileDetailFromPath({
      filePath,
      settings
    });

    if (!detail) {
      continue;
    }

    activeFileIds.add(detail.id);

    try {
      upsertPerformanceFileDetail(detail);
    } catch (error) {
      issues.push({
        filePath,
        message: getErrorMessage(error)
      });
    }
  }

  listStoredPerformanceFileDetails()
    .filter(
      (detail) =>
        detail.directoryType === "pending" &&
        detail.status !== "approved" &&
        detail.status !== "rejected" &&
        !activeFileIds.has(detail.id)
    )
    .forEach((detail) => {
      deleteStoredPerformanceFile(detail.id);
    });

  return issues;
};

export const syncApprovedPerformanceFilesToStorage = async (input: {
  settings: Pick<AppSettings, "pendingDir" | "approvedDir">;
  scheduleMonth?: string;
}): Promise<PerformanceFileSyncIssue[]> => {
  if (!isSqliteStorageReady()) {
    return [];
  }

  const targetDirectory = input.scheduleMonth
    ? buildApprovedPerformanceArchiveDirectory(input.settings.approvedDir, {
        scheduleMonth: input.scheduleMonth
      })
    : input.settings.approvedDir;
  const filePaths = (await listFilesRecursive(targetDirectory)).filter(isSupportedPerformanceFile);
  const issues: PerformanceFileSyncIssue[] = [];

  for (const filePath of filePaths) {
    const detail = await buildPerformanceFileDetailFromPath({
      filePath,
      settings: input.settings
    });

    if (!detail) {
      continue;
    }

    try {
      upsertPerformanceFileDetail({
        ...detail,
        status: detail.status === "error" ? "error" : "approved",
        approvedEntryCount: detail.entryCount ?? detail.entries.length
      });
    } catch (error) {
      issues.push({
        filePath,
        message: getErrorMessage(error)
      });
    }
  }

  return issues;
};
