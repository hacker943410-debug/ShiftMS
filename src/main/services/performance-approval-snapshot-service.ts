import type {
  PerformanceEntryRecord,
  PerformanceFileDetail
} from "../../shared/domain/performance-file";
import { isKnownAlertReasonCode } from "../../shared/domain/performance-file";
import { normalizeEmployeeRank } from "../../shared/domain/employee-rank";

export interface PerformanceApprovalSnapshot {
  fileId: string;
  fileName: string;
  filePath: string;
  scheduleMonth: string;
  siteName: string;
  scheduleKey: string;
  templateKind: PerformanceFileDetail["templateKind"];
  templateVariant?: PerformanceFileDetail["templateVariant"];
  sheetName: string;
  duplicateKey: string;
  receivedAt: string;
  entry: PerformanceEntryRecord;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseAlerts = (value: unknown): PerformanceEntryRecord["alerts"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((alert) => {
    if (!isRecord(alert) || typeof alert.message !== "string") {
      return [];
    }

    return [
      {
        severity: alert.severity === "error" ? "error" : "warning",
        message: alert.message,
        // See performance-file-storage-service parseAlerts: the code is kept when this build knows
        // it, and it stays out of every equivalence comparison.
        ...(isKnownAlertReasonCode(alert.reasonCode) ? { reasonCode: alert.reasonCode } : {})
      } satisfies PerformanceEntryRecord["alerts"][number]
    ];
  });
};

const normalizeEntry = (value: unknown): PerformanceEntryRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.performanceFileId !== "string" ||
    typeof value.logicalKey !== "string" ||
    typeof value.scheduleMonth !== "string" ||
    typeof value.scheduleKey !== "string" ||
    typeof value.siteName !== "string" ||
    typeof value.employeeCode !== "string" ||
    typeof value.employeeName !== "string" ||
    typeof value.workDate !== "string" ||
    typeof value.workType !== "string" ||
    typeof value.section !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    performanceFileId: value.performanceFileId,
    logicalKey: value.logicalKey,
    scheduleMonth: value.scheduleMonth,
    scheduleKey: value.scheduleKey,
    siteName: value.siteName,
    employeeCode: value.employeeCode,
    employeeName: value.employeeName,
    workDate: value.workDate,
    workType: value.workType as PerformanceEntryRecord["workType"],
    section: value.section as PerformanceEntryRecord["section"],
    dutyCode: typeof value.dutyCode === "string" ? value.dutyCode : undefined,
    startTime: typeof value.startTime === "string" ? value.startTime : undefined,
    endTime: typeof value.endTime === "string" ? value.endTime : undefined,
    breakMinutes: Number(value.breakMinutes ?? 0),
    totalWorkMinutes: Number(value.totalWorkMinutes ?? 0),
    baseWorkMinutes: Number(value.baseWorkMinutes ?? 0),
    overtimeMinutes: Number(value.overtimeMinutes ?? 0),
    nightMinutes: Number(value.nightMinutes ?? 0),
    reason: typeof value.reason === "string" ? value.reason : undefined,
    evidence: typeof value.evidence === "string" ? value.evidence : undefined,
    sourceSignature:
      typeof value.sourceSignature === "string" ? value.sourceSignature : undefined,
    sourceRowNumber: Number(value.sourceRowNumber ?? 0),
    sortOrder: Number(value.sortOrder ?? 0),
    alerts: parseAlerts(value.alerts),
    status: value.status === "approved" ? "approved" : "pending",
    latestApprovalAt:
      typeof value.latestApprovalAt === "string" ? value.latestApprovalAt : undefined,
    latestApprovalByName:
      typeof value.latestApprovalByName === "string" ? value.latestApprovalByName : undefined,
    hourlyRate: typeof value.hourlyRate === "number" ? value.hourlyRate : undefined,
    note: typeof value.note === "string" ? value.note : undefined,
    employeeRank: normalizeEmployeeRank(
      typeof value.employeeRank === "string" ? value.employeeRank : undefined
    ),
    department: typeof value.department === "string" ? value.department : undefined,
    category: typeof value.category === "string" ? value.category : undefined,
    isPoolWorker: value.isPoolWorker === true,
    // 대체수당 판정 결과는 승인 스냅샷에도 그대로 남겨 나중에 사유를 확인할 수 있게 한다.
    substituteWorkType:
      typeof value.substituteWorkType === "string"
        ? (value.substituteWorkType as PerformanceEntryRecord["substituteWorkType"])
        : undefined,
    targetWorkType:
      typeof value.targetWorkType === "string"
        ? (value.targetWorkType as PerformanceEntryRecord["targetWorkType"])
        : undefined,
    substituteAllowanceEligible:
      typeof value.substituteAllowanceEligible === "boolean"
        ? value.substituteAllowanceEligible
        : undefined,
    substituteAllowanceReasonCode:
      typeof value.substituteAllowanceReasonCode === "string"
        ? (value.substituteAllowanceReasonCode as PerformanceEntryRecord["substituteAllowanceReasonCode"])
        : undefined,
    substituteAllowancePolicyVersion:
      typeof value.substituteAllowancePolicyVersion === "string"
        ? value.substituteAllowancePolicyVersion
        : undefined
  };
};

export const createPerformanceApprovalSnapshot = (
  detail: PerformanceFileDetail,
  entry: PerformanceEntryRecord
): string =>
  JSON.stringify({
    fileId: detail.id,
    fileName: detail.fileName,
    filePath: detail.filePath,
    scheduleMonth: detail.scheduleMonth ?? "",
    siteName: detail.siteName ?? "",
    scheduleKey: detail.scheduleKey ?? "",
    templateKind: detail.templateKind,
    templateVariant: detail.templateVariant,
    sheetName: detail.sheetName,
    duplicateKey: detail.duplicateKey,
    receivedAt: detail.receivedAt,
    entry
  } satisfies PerformanceApprovalSnapshot);

export const parsePerformanceApprovalSnapshot = (
  snapshotJson?: string
): PerformanceApprovalSnapshot | null => {
  if (!snapshotJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(snapshotJson);

    if (
      !isRecord(parsed) ||
      typeof parsed.fileId !== "string" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.filePath !== "string" ||
      typeof parsed.scheduleMonth !== "string" ||
      typeof parsed.siteName !== "string" ||
      typeof parsed.scheduleKey !== "string" ||
      typeof parsed.templateKind !== "string" ||
      typeof parsed.sheetName !== "string" ||
      typeof parsed.duplicateKey !== "string" ||
      typeof parsed.receivedAt !== "string"
    ) {
      return null;
    }

    const entry = normalizeEntry(parsed.entry);

    if (!entry) {
      return null;
    }

    return {
      fileId: parsed.fileId,
      fileName: parsed.fileName,
      filePath: parsed.filePath,
      scheduleMonth: parsed.scheduleMonth,
      siteName: parsed.siteName,
      scheduleKey: parsed.scheduleKey,
      templateKind: parsed.templateKind as PerformanceFileDetail["templateKind"],
      templateVariant:
        typeof parsed.templateVariant === "string"
          ? (parsed.templateVariant as PerformanceFileDetail["templateVariant"])
          : undefined,
      sheetName: parsed.sheetName,
      duplicateKey: parsed.duplicateKey,
      receivedAt: parsed.receivedAt,
      entry
    };
  } catch {
    return null;
  }
};
