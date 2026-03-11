import type { ApprovalStatus, PerformanceFileStatus } from "./model";

export type ExcelTemplateKind =
  | "schedule-plan"
  | "attachment1"
  | "attachment2"
  | "proposal"
  | "unknown";

export interface PerformanceFileMetadataRecord {
  id: string;
  fileName: string;
  filePath: string;
  directoryType: "pending" | "approved" | "unknown";
  templateKind: ExcelTemplateKind;
  sheetName: string;
  rowCount: number;
  columnCount: number;
  fileSize: number;
  modifiedTimeMs: number;
  duplicateKey: string;
  receivedAt: string;
  status: PerformanceFileStatus;
  errorMessage?: string;
}

export interface PerformanceQueueItem {
  id: string;
  fileName: string;
  templateKind: ExcelTemplateKind;
  status: PerformanceFileStatus;
  receivedAt: string;
  fileSize: number;
  detailLabel: string;
}

export interface PerformanceApprovalActionInput {
  fileId: string;
  comment?: string;
}

export interface PerformanceRejectionInput extends PerformanceApprovalActionInput {
  rejectionReason: string;
}

export interface PerformanceApprovalRecord {
  id: string;
  fileId: string;
  fileName: string;
  decision: ApprovalStatus;
  processedAt: string;
  processedBy: string;
  processedByName: string;
  comment?: string;
  rejectionReason?: string;
}

export interface PerformanceFileDetail extends PerformanceFileMetadataRecord {
  previewRows: Array<Record<string, string | number>>;
  approvalHistory: PerformanceApprovalRecord[];
  latestApproval: PerformanceApprovalRecord | null;
}
