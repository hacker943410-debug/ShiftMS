import type {
  PerformanceEntryRecord,
  PerformanceFileDetail
} from "../../shared/domain/performance-file";

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
        message: alert.message
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
    sourceRowNumber: Number(value.sourceRowNumber ?? 0),
    sortOrder: Number(value.sortOrder ?? 0),
    alerts: parseAlerts(value.alerts),
    status: value.status === "approved" ? "approved" : "pending",
    latestApprovalAt:
      typeof value.latestApprovalAt === "string" ? value.latestApprovalAt : undefined,
    latestApprovalByName:
      typeof value.latestApprovalByName === "string" ? value.latestApprovalByName : undefined,
    hourlyRate: typeof value.hourlyRate === "number" ? value.hourlyRate : undefined,
    note: typeof value.note === "string" ? value.note : undefined
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
