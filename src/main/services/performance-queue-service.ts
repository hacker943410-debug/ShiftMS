import path from "node:path";

import type {
  PerformanceFileDetail,
  PerformanceQueueItem
} from "../../shared/domain/performance-file";
import {
  buildPerformanceFileDetailFromPath,
  syncPendingPerformanceFilesToStorage
} from "./performance-file-intake-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPendingPerformanceFiles
} from "./performance-file-storage-service";
import { isSqliteStorageReady } from "./sqlite-storage-service";

const sampleDirectory = path.resolve(process.cwd(), "양식샘플");

const sampleFiles = [
  "별첨1_샘플.xlsx",
  "별첨2_샘플.xlsx",
  "배포_근무표샘플.xlsx",
  "품위서_샘플.xlsx"
];

const sampleSettings = {
  pendingDir: sampleDirectory,
  approvedDir: path.resolve(process.cwd(), "imports", "approved")
};

const resolveSampleFileName = (fileId: string) =>
  sampleFiles.find((fileName) => fileName === fileId) ?? null;

const syncSamplePerformanceFilesToStorage = async () => {
  if (!isSqliteStorageReady()) {
    return;
  }

  await syncPendingPerformanceFilesToStorage(sampleSettings);
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
    const items = listStoredPendingPerformanceFiles();

    if (items.length > 0 || process.env.NODE_ENV !== "test") {
      return items;
    }

    await syncSamplePerformanceFilesToStorage();
    return listStoredPendingPerformanceFiles();
  }

  const details = await Promise.all(
    sampleFiles.map((fileName) =>
      buildPerformanceFileDetailFromPath({
        filePath: path.resolve(sampleDirectory, fileName),
        settings: sampleSettings
      })
    )
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
    const detail = getStoredPerformanceFileDetail(fileId);

    if (detail || process.env.NODE_ENV !== "test") {
      return detail;
    }

    await syncSamplePerformanceFilesToStorage();
    return getStoredPerformanceFileDetail(fileId);
  }

  const resolvedFileName = resolveSampleFileName(fileId);

  if (!resolvedFileName) {
    return null;
  }

  return buildPerformanceFileDetailFromPath({
    filePath: path.resolve(sampleDirectory, resolvedFileName),
    settings: sampleSettings
  });
};
