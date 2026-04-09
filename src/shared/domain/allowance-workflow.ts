import type { AllowanceDocumentExportFormat } from "./allowance-document";
import type { ApprovalStatus, WorkType } from "./model";

export type AllowanceCalculationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "proposal-approved";

export type AllowanceHistoryStatusFilter = AllowanceCalculationStatus | "all";

export interface AllowanceApprovalRecord {
  id: string;
  calculationId: string;
  workMonth: string;
  siteName: string;
  employeeCode: string;
  employeeName: string;
  workDate: string;
  workType: WorkType;
  decision: ApprovalStatus;
  processedAt: string;
  processedBy: string;
  processedByName: string;
  comment?: string;
}

export interface AllowanceReviewActionInput {
  calculationIds: string[];
  decision: ApprovalStatus;
  comment?: string;
  syncPerformanceSiteReject?: boolean;
}

export interface AllowanceProposalPreviewRow {
  calculationId: string;
  customerName?: string;
  siteName: string;
  employeeCode: string;
  employeeName: string;
  workDate: string;
  workType: WorkType;
  businessCategoryLabel: string;
  totalWorkMinutes: number;
  totalAllowanceAmount: number;
  earlyPayoutDate?: string;
}

export interface AllowanceProposalPreviewSiteSummary {
  customerName?: string;
  siteName: string;
  substituteAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  totalAmount: number;
}

export interface AllowanceProposalPreview {
  workMonth: string;
  generatedAt: string;
  calculationCount: number;
  employeeCount: number;
  totalAllowanceAmount: number;
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
  rows: AllowanceProposalPreviewRow[];
  regularSiteSummaries: AllowanceProposalPreviewSiteSummary[];
  earlyPayoutSiteSummaries: AllowanceProposalPreviewSiteSummary[];
}

export interface AllowanceProposalApprovalInput {
  calculationIds: string[];
  comment?: string;
  outputFormat?: AllowanceDocumentExportFormat;
}

export interface AllowanceBackupSummary {
  createdAt: string;
  jsonBackupPath: string;
  excelBackupPath?: string;
  accessBackupPath?: string;
  warningMessages: string[];
}

export interface AllowanceProposalApprovalRecord {
  id: string;
  workMonth: string;
  calculationIds: string[];
  calculationCount: number;
  employeeCount: number;
  totalAllowanceAmount: number;
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
  exportRecordId: string;
  outputFormat: AllowanceDocumentExportFormat;
  approvedAt: string;
  approvedBy: string;
  approvedByName: string;
  comment?: string;
  previewSnapshot: AllowanceProposalPreview;
  backupSummary: AllowanceBackupSummary;
}
