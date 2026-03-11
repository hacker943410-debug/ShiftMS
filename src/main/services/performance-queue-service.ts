import { stat } from "node:fs/promises";
import path from "node:path";

import type {
  PerformanceFileDetail,
  PerformanceQueueItem
} from "../../shared/domain/performance-file";
import { createDuplicateFileKey, toFileWatchEvent } from "./file-watch-service";
import { inspectExcelTemplate, parseAttachmentOnePreview } from "./excel-template-parser";
import { createPerformanceFileMetadataRecord } from "./performance-file-metadata-service";

const sampleDirectory = path.resolve(process.cwd(), "양식샘플");

const sampleFiles = [
  "별첨1_샘플.xlsx",
  "별첨2_샘플.xlsx",
  "배포_근무표샘플.xlsx",
  "품위서_샘플.xlsx"
];

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
  const details = await Promise.all(sampleFiles.map((fileName) => getPendingPerformanceFileDetail(fileName)));

  return details
    .filter((detail): detail is PerformanceFileDetail => detail !== null)
    .map(toQueueItem);
};

export const getPendingPerformanceFileDetail = async (
  fileId: string
): Promise<PerformanceFileDetail | null> => {
  const filePath = path.resolve(sampleDirectory, fileId);
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

  const previewRows: PerformanceFileDetail["previewRows"] = [];
  if (inspection.templateKind === "attachment1") {
    const preview = await parseAttachmentOnePreview(filePath);

    if (preview) {
      previewRows.push({
        사번: preview.employeeCode,
        성명: preview.employeeName,
        조직: preview.department,
        구분: preview.category,
        근무일자: preview.workDate,
        근무시간: preview.workHours
      });
    }
  }

  return {
    ...metadata,
    previewRows
  };
};
