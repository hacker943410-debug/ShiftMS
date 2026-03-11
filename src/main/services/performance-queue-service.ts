import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  PerformanceFileDetail,
  PerformanceQueueItem
} from "../../shared/domain/performance-file";
import {
  getLatestPerformanceApproval,
  getPerformanceApprovalHistory,
  resolvePerformanceFileStatus
} from "./performance-approval-service";
import { createDuplicateFileKey, toFileWatchEvent } from "./file-watch-service";
import {
  inspectExcelTemplate,
  parseAttachmentOneEntries,
  parseAttachmentOnePreview
} from "./excel-template-parser";
import { createPerformanceFileMetadataRecord } from "./performance-file-metadata-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPendingPerformanceFiles,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import { isSqliteStorageReady } from "./sqlite-storage-service";

const sampleDirectory = path.resolve(process.cwd(), "양식샘플");

const sampleFiles = [
  "별첨1_샘플.xlsx",
  "별첨2_샘플.xlsx",
  "배포_근무표샘플.xlsx",
  "품위서_샘플.xlsx"
];

const resolveSampleFileName = (fileId: string) =>
  sampleFiles.find((fileName) => fileName === fileId) ?? null;

const createPerformanceFileDetailFromSample = async (
  fileName: string
): Promise<PerformanceFileDetail | null> => {
  const resolvedFileName = resolveSampleFileName(fileName);

  if (!resolvedFileName) {
    return null;
  }

  const filePath = path.resolve(sampleDirectory, resolvedFileName);
  const fileStats = await stat(filePath).catch(() => null);

  if (!fileStats?.isFile()) {
    return null;
  }
  const inspection = await inspectExcelTemplate(filePath);
  const watchEvent = toFileWatchEvent({
    type: "file-added",
    filePath,
    state: {
      pendingDir: sampleDirectory,
      approvedDir: path.resolve(process.cwd(), "imports", "approved"),
      isRunning: false
    },
    size: fileStats.size,
    modifiedTimeMs: fileStats.mtimeMs
  });

  const metadata = createPerformanceFileMetadataRecord({
    watchEvent: {
      ...watchEvent,
      duplicateKey:
        watchEvent.duplicateKey ??
        createDuplicateFileKey({
          filePath,
          size: fileStats.size,
          modifiedTimeMs: fileStats.mtimeMs
        })
    },
    inspection,
    fileSize: fileStats.size,
    modifiedTimeMs: fileStats.mtimeMs
  });
  const stableFileId = path.basename(filePath);

  const previewRows: PerformanceFileDetail["previewRows"] = [];
  const entries: PerformanceFileDetail["entries"] = [];
  if (inspection.templateKind === "attachment1") {
    const parsedEntries = await parseAttachmentOneEntries(filePath);
    const preview = await parseAttachmentOnePreview(filePath);

    parsedEntries.forEach((entry) => {
      entries.push({
        id: randomUUID(),
        performanceFileId: stableFileId,
        employeeCode: entry.employeeCode,
        employeeName: entry.employeeName,
        workDate: entry.workDate,
        workHours: entry.workHours,
        department: entry.department,
        category: entry.category,
        hourlyRate: entry.rate
      });
    });

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
  }

  const latestApproval = getLatestPerformanceApproval(stableFileId);

  const detail = {
    ...metadata,
    id: stableFileId,
    status: resolvePerformanceFileStatus(stableFileId, metadata.status),
    previewRows,
    entries,
    approvalHistory: getPerformanceApprovalHistory(stableFileId),
    latestApproval
  };

  return detail;
};

const syncSamplePerformanceFilesToStorage = async () => {
  if (!isSqliteStorageReady()) {
    return;
  }

  const details = await Promise.all(
    sampleFiles.map((fileName) => createPerformanceFileDetailFromSample(fileName))
  );

  details
    .filter((detail): detail is PerformanceFileDetail => detail !== null)
    .forEach((detail) => {
      upsertPerformanceFileDetail(detail);
    });
};

const toQueueItem = (detail: PerformanceFileDetail): PerformanceQueueItem => ({
  id: detail.id,
  fileName: detail.fileName,
  templateKind: detail.templateKind,
  status: detail.status,
  receivedAt: detail.receivedAt,
  fileSize: detail.fileSize,
  detailLabel: `${detail.templateKind} / ${detail.sheetName || "시트 미확인"}`
});

export const listPendingPerformanceFiles = async (): Promise<PerformanceQueueItem[]> => {
  if (isSqliteStorageReady()) {
    await syncSamplePerformanceFilesToStorage();
    return listStoredPendingPerformanceFiles();
  }

  const details = await Promise.all(
    sampleFiles.map((fileName) => createPerformanceFileDetailFromSample(fileName))
  );

  return details
    .filter((detail): detail is PerformanceFileDetail => detail !== null)
    .filter((detail) => detail.status === "pending")
    .map(toQueueItem);
};

export const getPendingPerformanceFileDetail = async (
  fileId: string
): Promise<PerformanceFileDetail | null> => {
  if (isSqliteStorageReady()) {
    await syncSamplePerformanceFilesToStorage();
    return getStoredPerformanceFileDetail(fileId);
  }

  return createPerformanceFileDetailFromSample(fileId);
};
