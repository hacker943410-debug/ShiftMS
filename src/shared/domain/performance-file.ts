import type { AllowanceCalculationResultRecord } from "./allowance-service";
import type { ApprovalStatus, PerformanceFileStatus, WorkType } from "./model";
import type { SchedulePlanTemplateVariant } from "./schedule-plan";

export type ExcelTemplateKind =
  | "schedule-plan"
  | "attachment1"
  | "attachment2"
  | "proposal"
  | "unknown";

export type PerformanceEntryStatus = "pending" | "approved";

export type PerformanceEntrySection = "legal-holiday" | "substitute" | "overtime";

export type PerformanceApprovalScope = "all" | "pending" | "approved";

export type PerformanceReapprovalStatus = "none" | "pending" | "completed";

export interface PerformanceAlert {
  severity: "warning" | "error";
  message: string;
}

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
  scheduleMonth?: string;
  siteName?: string;
  scheduleKey?: string;
  templateVariant?: SchedulePlanTemplateVariant;
  entryCount?: number;
  approvedEntryCount?: number;
  warningCount?: number;
  isEffective?: boolean;
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
  scheduleMonth: string;
  siteName: string;
  entryCount: number;
  approvedEntryCount: number;
  warningCount: number;
  detailLabel: string;
}

export interface PerformanceApprovalActionInput {
  fileId: string;
  entryId?: string;
  comment?: string;
  manualHourlyRate?: number;
}

export interface PerformanceReapprovalFinalizeInput {
  fileId: string;
}

export interface PerformanceRejectionInput extends PerformanceApprovalActionInput {
  rejectionReason: string;
}

export interface PerformanceApprovalRecord {
  id: string;
  fileId: string;
  entryId: string;
  logicalKey: string;
  fileName: string;
  scheduleKey: string;
  employeeCode: string;
  employeeName: string;
  workDate: string;
  workType: WorkType;
  decision: ApprovalStatus;
  processedAt: string;
  processedBy: string;
  processedByName: string;
  comment?: string;
  rejectionReason?: string;
  snapshotJson?: string;
  archivedFileName?: string;
  archivedFilePath?: string;
}

export interface PerformanceEntryRecord {
  id: string;
  performanceFileId: string;
  logicalKey: string;
  scheduleMonth: string;
  scheduleKey: string;
  siteName: string;
  employeeCode: string;
  employeeName: string;
  workDate: string;
  workType: WorkType;
  section: PerformanceEntrySection;
  dutyCode?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  totalWorkMinutes: number;
  baseWorkMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  reason?: string;
  evidence?: string;
  sourceRowNumber: number;
  sortOrder: number;
  alerts: PerformanceAlert[];
  status: PerformanceEntryStatus;
  latestApprovalAt?: string;
  latestApprovalByName?: string;
  hourlyRate?: number;
  note?: string;
  workHours?: number;
  department?: string;
  category?: string;
  isPoolWorker?: boolean;
}

export const isPoolSubstitutePerformanceEntry = (
  entry: Pick<PerformanceEntryRecord, "section" | "isPoolWorker">
) => entry.section === "substitute" && Boolean(entry.isPoolWorker);

export interface PerformanceFileDetail extends PerformanceFileMetadataRecord {
  alerts: PerformanceAlert[];
  previewRows: Array<Record<string, string | number>>;
  entries: PerformanceEntryRecord[];
  approvalHistory: PerformanceApprovalRecord[];
  latestApproval: PerformanceApprovalRecord | null;
}

export interface PerformanceOverviewRow {
  rowId: string;
  fileId: string;
  entryId: string;
  logicalKey: string;
  sourceFileName: string;
  sourceFileExists: boolean;
  sourceDirectoryType: PerformanceFileMetadataRecord["directoryType"];
  sourceReceivedAt: string;
  entry: PerformanceEntryRecord;
  approvalStatus: PerformanceEntryStatus;
  canApprove: boolean;
  needsReapproval: boolean;
  reapprovalStatus: PerformanceReapprovalStatus;
  latestApprovalAt?: string;
  latestApprovalByName?: string;
  latestApprovalFileId?: string;
  latestApprovalComment?: string;
  latestApprovalUsedManualRate?: boolean;
  latestApprovalManualHourlyRate?: number;
}

export interface PerformanceOverviewSiteGroup {
  siteName: string;
  rowCount: number;
  approvedCount: number;
  pendingCount: number;
  approvableCount: number;
  needsReapprovalCount: number;
  alertCount: number;
  rows: PerformanceOverviewRow[];
}

export interface PerformanceReapprovalFileSummary {
  fileId: string;
  fileName: string;
  scheduleKey: string;
  scheduleMonth: string;
  siteName: string;
  receivedAt: string;
  entryCount: number;
  resolvedApprovedEntryCount: number;
  remainingEntryCount: number;
  reapprovalCompletedCount: number;
  reapprovalPendingCount: number;
  needsReapprovalCount: number;
  canFinalize: boolean;
}

export interface PerformanceOverviewSnapshot {
  groups: PerformanceOverviewSiteGroup[];
  reapprovalFiles: PerformanceReapprovalFileSummary[];
  siteCount: number;
  rowCount: number;
  approvedCount: number;
  pendingCount: number;
  approvableCount: number;
  needsReapprovalCount: number;
}

export interface PerformanceComparisonDetail {
  logicalKey: string;
  currentFile: Pick<
    PerformanceFileMetadataRecord,
    "id" | "fileName" | "directoryType" | "receivedAt" | "scheduleMonth" | "siteName"
  >;
  currentEntry: PerformanceEntryRecord;
  approvedRecord: PerformanceApprovalRecord | null;
  approvedEntry: PerformanceEntryRecord | null;
  approvedCalculation: AllowanceCalculationResultRecord | null;
}
