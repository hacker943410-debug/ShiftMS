import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type {
  PerformanceEntryRecord,
  PerformanceFileDetail
} from "../../shared/domain/performance-file";
import type { AppSettings } from "./app-settings-service";
import { inspectExcelTemplate, parseAttachmentOneEntries, parseAttachmentOnePreview } from "./excel-template-parser";
import { toFileWatchEvent } from "./file-watch-service";
import {
  createPerformanceFileMetadataRecord,
  updatePerformanceFileMetadataStatus
} from "./performance-file-metadata-service";
import {
  getLatestPerformanceApproval,
  getPerformanceApprovalHistory,
  resolvePerformanceFileStatus
} from "./performance-approval-service";
import {
  deleteStoredPerformanceFile,
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import { isSqliteStorageReady } from "./sqlite-storage-service";

const supportedFileExtensions = new Set([".xlsx", ".xlsm", ".xls"]);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "실적 파일 처리 중 오류가 발생했습니다.";

const normalizeFileId = (value: string) => value.split(path.sep).join("/");

const createPerformanceFileId = (filePath: string, rootDir: string) => {
  const relativePath = path.relative(rootDir, filePath);

  if (!relativePath || relativePath.startsWith("..")) {
    return path.basename(filePath);
  }

  return normalizeFileId(relativePath);
};

const isSupportedPerformanceFile = (filePath: string) =>
  supportedFileExtensions.has(path.extname(filePath).toLowerCase());

const createDetail = (
  metadata: Omit<PerformanceFileDetail, "id" | "approvalHistory" | "latestApproval" | "previewRows" | "entries">,
  fileId: string,
  previewRows: PerformanceFileDetail["previewRows"],
  entries: PerformanceEntryRecord[]
): PerformanceFileDetail => ({
  ...metadata,
  id: fileId,
  status: resolvePerformanceFileStatus(fileId, metadata.status),
  previewRows,
  entries,
  approvalHistory: getPerformanceApprovalHistory(fileId),
  latestApproval: getLatestPerformanceApproval(fileId)
});

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

const createAttachmentOneEntries = async (
  filePath: string,
  fileId: string
): Promise<{
  previewRows: PerformanceFileDetail["previewRows"];
  entries: PerformanceEntryRecord[];
}> => {
  const parsedEntries = await parseAttachmentOneEntries(filePath);
  const preview = await parseAttachmentOnePreview(filePath);
  const entries: PerformanceEntryRecord[] = parsedEntries.map((entry) => ({
    id: randomUUID(),
    performanceFileId: fileId,
    employeeCode: entry.employeeCode,
    employeeName: entry.employeeName,
    workDate: entry.workDate,
    workHours: entry.workHours,
    department: entry.department,
    category: entry.category,
    hourlyRate: entry.rate
  }));
  const previewRows: PerformanceFileDetail["previewRows"] = [];

  if (preview) {
    previewRows.push({
      사번: preview.employeeCode,
      성명: preview.employeeName,
      조직: preview.department,
      구분: preview.category,
      근무일자: preview.workDate,
      근무시간: preview.workHours,
      시급: preview.rate
    });
  }

  return {
    previewRows,
    entries
  };
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
  const fileId = createPerformanceFileId(input.filePath, rootDir);
  const existingDetail = isSqliteStorageReady() ? getStoredPerformanceFileDetail(fileId) : null;
  const receivedAt = input.receivedAt ?? existingDetail?.receivedAt;

  try {
    const inspection = await inspectExcelTemplate(input.filePath);
    const metadata = createPerformanceFileMetadataRecord({
      watchEvent,
      inspection,
      fileSize: fileStats.size,
      modifiedTimeMs: fileStats.mtimeMs,
      receivedAt
    });

    if (inspection.templateKind === "attachment1") {
      const attachmentOne = await createAttachmentOneEntries(input.filePath, fileId);

      return createDetail(
        metadata,
        fileId,
        attachmentOne.previewRows,
        attachmentOne.entries
      );
    }

    return createDetail(metadata, fileId, [], []);
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

    return createDetail(metadata, fileId, [], []);
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
    deleteStoredPerformanceFile(createPerformanceFileId(input.filePath, input.settings.pendingDir));
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
