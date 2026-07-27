import type { AllowanceCalculationResultRecord } from "./allowance-service";
import type { EmployeeRank } from "./employee-rank";
import type { ApprovalStatus, PerformanceFileStatus, WorkType } from "./model";
import type { SchedulePlanTemplateVariant } from "./schedule-plan";
import type { SubstituteAllowanceReasonCode } from "./substitute-allowance-policy";
import { substituteAllowanceReasonLabels } from "./substitute-allowance-policy";
import type { TeamWorkType } from "./team-work-type";

export type ExcelTemplateKind =
  | "schedule-plan"
  | "attachment1"
  | "attachment2"
  | "proposal"
  | "unknown";

export type PerformanceEntryStatus = "pending" | "approved";
export type PerformanceOverviewApprovalStatus = PerformanceEntryStatus | "rejected" | "non-payable";

export type PerformanceEntrySection = "legal-holiday" | "substitute" | "overtime";

export type PerformanceApprovalScope = "pending" | "approved";

export type PerformanceReapprovalStatus = "none" | "pending" | "completed" | "locked";

export interface PerformanceAlert {
  severity: "warning" | "error";
  message: string;
}

export interface PerformanceFileSyncIssue {
  filePath: string;
  fileName: string;
  directoryType: PerformanceFileMetadataRecord["directoryType"];
  severity: PerformanceAlert["severity"];
  message: string;
  scheduleMonth?: string;
}

export type PerformanceFileSyncStatus =
  | "idle"
  | "scanning"
  | "parsing"
  | "completed"
  | "error";

export interface PerformanceFileSyncStateSnapshot {
  status: PerformanceFileSyncStatus;
  directoryType?: PerformanceFileMetadataRecord["directoryType"];
  scheduleMonth?: string;
  totalCount: number;
  processedCount: number;
  parsedCount: number;
  skippedCount: number;
  issueCount: number;
  currentFileName?: string;
  currentFilePath?: string;
  message: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

// Snapshot of the most recent app-startup performance recovery pass (monthly-schedule restore +
// approved-file resync). Surfaced to the renderer so months that could NOT be auto-recovered
// (missing exported workbook, missing pattern, unresolved duty time) become visible instead of
// silently staying at 0 minutes.
export interface PerformanceStartupRecoveryStatusSnapshot {
  hasRun: boolean;
  completedAt: string | null;
  restoredScheduleCount: number;
  skippedScheduleCount: number;
  approvedSyncIssueCount: number;
  issues: string[];
  // Orphan-file self-healing / archive-retention outcomes from the same startup pass. Optional so
  // older snapshots and IPC payloads stay backward-compatible.
  missingSourceCount?: number;
  removedDirectoryCount?: number;
  prunedArchiveCount?: number;
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

export interface PerformanceApprovedRowHideInput {
  approvalId: string;
}

export interface PerformanceApprovedRowHiddenResult {
  approvalId: string;
  logicalKey: string;
  hiddenAt: string;
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
  sourceSignature?: string;
  sourceRowNumber: number;
  sortOrder: number;
  teamLabel?: string;
  alerts: PerformanceAlert[];
  status: PerformanceEntryStatus;
  latestApprovalAt?: string;
  latestApprovalByName?: string;
  hourlyRate?: number;
  note?: string;
  workHours?: number;
  employeeRank?: EmployeeRank;
  department?: string;
  category?: string;
  isPoolWorker?: boolean;
  // 대체근무수당 판정 결과. 대체근무 행에만 채워지며, 판정 당시의 근무유형과 사유를 그대로 보관한다.
  substituteWorkType?: TeamWorkType;
  targetWorkType?: TeamWorkType;
  substituteAllowanceEligible?: boolean;
  substituteAllowanceReasonCode?: SubstituteAllowanceReasonCode;
  substituteAllowancePolicyVersion?: string;
}

export const parsePoolWorkerDisplayName = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";
  const matched = normalized.match(/^(.+?)\s*\(\s*p\s*\)$/i);

  return {
    employeeName: matched?.[1]?.trim() || normalized,
    isPoolDisplayName: Boolean(matched)
  };
};

export const isPoolWorkerDisplayName = (value: string | null | undefined) =>
  parsePoolWorkerDisplayName(value).isPoolDisplayName;

// 수당 미지급 대체근무 판정. Pool 표식(기존 규칙)과 조 근무유형 판정 결과(신규 규칙)를 함께 본다.
// 판정 결과는 파싱 시점에 행에 저장되므로, 정책 시작일 이전에 들어온 과거 행은 값이 없어 그대로 지급된다.
export const isNonPayableSubstitutePerformanceEntry = (
  entry: Pick<PerformanceEntryRecord, "section"> &
    Partial<
      Pick<
        PerformanceEntryRecord,
        "employeeName" | "isPoolWorker" | "substituteAllowanceEligible"
      >
    >
) =>
  entry.section === "substitute" &&
  (Boolean(entry.isPoolWorker) ||
    isPoolWorkerDisplayName(entry.employeeName) ||
    entry.substituteAllowanceEligible === false);

// 기존 호출부 호환용 별칭(같은 함수). 규칙은 한 곳에서만 판단한다.
export const isPoolSubstitutePerformanceEntry = isNonPayableSubstitutePerformanceEntry;

export const isNonPayablePoolSubstitutePerformanceEntry = isNonPayableSubstitutePerformanceEntry;

// 화면·알림에 쓰는 미지급 사유 문구. 사유 코드가 없으면 기존 Pool 문구를 쓴다.
export const getNonPayableSubstituteReasonText = (
  entry: Pick<PerformanceEntryRecord, "section"> &
    Partial<
      Pick<
        PerformanceEntryRecord,
        | "employeeName"
        | "isPoolWorker"
        | "substituteAllowanceEligible"
        | "substituteAllowanceReasonCode"
      >
    >
) => {
  if (!isNonPayableSubstitutePerformanceEntry(entry)) {
    return undefined;
  }

  if (entry.substituteAllowanceReasonCode) {
    return substituteAllowanceReasonLabels[entry.substituteAllowanceReasonCode];
  }

  return substituteAllowanceReasonLabels.POOL_SUBSTITUTE_EXCLUDED;
};

const nonPayableSubstituteShortLabels: Record<SubstituteAllowanceReasonCode, string> = {
  POOL_SUBSTITUTE_EXCLUDED: "Pool 대체근무 수당 미지급",
  FIXED_DAY_SUBSTITUTE_EXCLUDED: "주간고정조 대체근무 수당 미지급",
  ROTATING_SUBSTITUTE_ELIGIBLE: "대체근무 수당 지급",
  NOT_ADDITIONAL_WORK: "정규근무라 수당 미지급",
  TARGET_IS_NOT_ROTATING_SHIFT: "교대조 근무가 아니라 수당 미지급",
  MANUAL_EXCLUSION: "관리자 제외로 수당 미지급",
  NO_ALLOWANCE_POLICY: "적용 정책이 없어 수당 미지급"
};

// 표·버튼에 들어갈 짧은 문구.
export const getNonPayableSubstituteShortLabel = (
  entry: Pick<PerformanceEntryRecord, "section"> &
    Partial<
      Pick<
        PerformanceEntryRecord,
        | "employeeName"
        | "isPoolWorker"
        | "substituteAllowanceEligible"
        | "substituteAllowanceReasonCode"
      >
    >
) => {
  if (!isNonPayableSubstitutePerformanceEntry(entry)) {
    return undefined;
  }

  return entry.substituteAllowanceReasonCode
    ? nonPayableSubstituteShortLabels[entry.substituteAllowanceReasonCode]
    : nonPayableSubstituteShortLabels.POOL_SUBSTITUTE_EXCLUDED;
};

export const isHourlyRateUnappliedPerformanceEntry = (
  entry: Pick<PerformanceEntryRecord, "alerts" | "note" | "isPoolWorker">
) =>
  !entry.isPoolWorker &&
  (
    entry.note?.includes("시급미반영항목") === true ||
    entry.alerts.some((alert) => alert.message.includes("시급미반영항목"))
  );

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
  approvalStatus: PerformanceOverviewApprovalStatus;
  canApprove: boolean;
  needsReapproval: boolean;
  reapprovalStatus: PerformanceReapprovalStatus;
  isChangeLocked: boolean;
  changeLockedReason?: string;
  latestApprovalId?: string;
  latestApprovalAt?: string;
  latestApprovalByName?: string;
  latestApprovalFileId?: string;
  latestApprovalComment?: string;
  latestApprovalUsedManualRate?: boolean;
  latestApprovalManualHourlyRate?: number;
  canHideApprovedRow: boolean;
  hideApprovedRowBlockedReason?: string;
}

export interface PerformanceOverviewSiteGroup {
  siteName: string;
  rowCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  approvableCount: number;
  needsReapprovalCount: number;
  changeLockedCount: number;
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
  lockedEntryCount: number;
  needsReapprovalCount: number;
  canFinalize: boolean;
}

export interface PerformanceOverviewSnapshot {
  groups: PerformanceOverviewSiteGroup[];
  reapprovalFiles: PerformanceReapprovalFileSummary[];
  syncIssues: PerformanceFileSyncIssue[];
  siteCount: number;
  rowCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  approvableCount: number;
  needsReapprovalCount: number;
  changeLockedCount: number;
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
