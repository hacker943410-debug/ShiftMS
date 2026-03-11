import { randomUUID } from "node:crypto";

import type { PerformanceFileMetadataRecord } from "../../shared/domain/performance-file";
import type { ExcelTemplateInspection } from "./excel-template-parser";
import type { FileWatchEvent } from "./file-watch-service";

export const createPerformanceFileMetadataRecord = (input: {
  watchEvent: FileWatchEvent;
  inspection?: ExcelTemplateInspection;
  fileSize: number;
  modifiedTimeMs: number;
  receivedAt?: string;
}): PerformanceFileMetadataRecord => ({
  id: randomUUID(),
  fileName: input.watchEvent.fileName,
  filePath: input.watchEvent.filePath,
  directoryType: input.watchEvent.directoryType,
  templateKind: input.inspection?.templateKind ?? "unknown",
  sheetName: input.inspection?.sheetName ?? "",
  rowCount: input.inspection?.rowCount ?? 0,
  columnCount: input.inspection?.columnCount ?? 0,
  fileSize: input.fileSize,
  modifiedTimeMs: input.modifiedTimeMs,
  duplicateKey: input.watchEvent.duplicateKey ?? "",
  receivedAt: input.receivedAt ?? new Date().toISOString(),
  status: input.watchEvent.type === "watcher-error" ? "error" : "pending",
  errorMessage: input.watchEvent.message
});

export const updatePerformanceFileMetadataStatus = (
  record: PerformanceFileMetadataRecord,
  status: PerformanceFileMetadataRecord["status"],
  errorMessage?: string
): PerformanceFileMetadataRecord => ({
  ...record,
  status,
  errorMessage
});
