import type {
  PerformanceEntryRecord,
  PerformanceFileDetail
} from "../../shared/domain/performance-file";

export interface PerformanceApprovalSnapshotEntry {
  employeeCode: string;
  employeeName: string;
  workDate: string;
  workHours: number;
  department?: string;
  category?: string;
  hourlyRate?: number;
}

export interface PerformanceApprovalSnapshot {
  fileId: string;
  fileName: string;
  filePath: string;
  templateKind: PerformanceFileDetail["templateKind"];
  sheetName: string;
  rowCount: number;
  columnCount: number;
  fileSize: number;
  duplicateKey: string;
  receivedAt: string;
  previewRows: Array<Record<string, string | number>>;
  entries: PerformanceApprovalSnapshotEntry[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizePreviewRows = (
  value: unknown
): PerformanceApprovalSnapshot["previewRows"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).flatMap(([key, cellValue]) =>
          typeof cellValue === "string" || typeof cellValue === "number"
            ? [[key, cellValue]]
            : []
        )
      )
    );
};

const normalizeEntries = (value: unknown): PerformanceApprovalSnapshotEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).flatMap((entry) => {
    if (
      typeof entry.employeeCode !== "string" ||
      typeof entry.employeeName !== "string" ||
      typeof entry.workDate !== "string" ||
      typeof entry.workHours !== "number"
    ) {
      return [];
    }

    return [
      {
        employeeCode: entry.employeeCode,
        employeeName: entry.employeeName,
        workDate: entry.workDate,
        workHours: entry.workHours,
        department: typeof entry.department === "string" ? entry.department : undefined,
        category: typeof entry.category === "string" ? entry.category : undefined,
        hourlyRate: typeof entry.hourlyRate === "number" ? entry.hourlyRate : undefined
      }
    ];
  });
};

const toSnapshotEntries = (
  entries: PerformanceEntryRecord[]
): PerformanceApprovalSnapshotEntry[] =>
  entries.map((entry) => ({
    employeeCode: entry.employeeCode,
    employeeName: entry.employeeName,
    workDate: entry.workDate,
    workHours: entry.workHours,
    department: entry.department,
    category: entry.category,
    hourlyRate: entry.hourlyRate
  }));

export const createPerformanceApprovalSnapshot = (
  detail: PerformanceFileDetail
): string =>
  JSON.stringify({
    fileId: detail.id,
    fileName: detail.fileName,
    filePath: detail.filePath,
    templateKind: detail.templateKind,
    sheetName: detail.sheetName,
    rowCount: detail.rowCount,
    columnCount: detail.columnCount,
    fileSize: detail.fileSize,
    duplicateKey: detail.duplicateKey,
    receivedAt: detail.receivedAt,
    previewRows: detail.previewRows,
    entries: toSnapshotEntries(detail.entries)
  } satisfies PerformanceApprovalSnapshot);

export const parsePerformanceApprovalSnapshot = (
  snapshotJson?: string
): PerformanceApprovalSnapshot | null => {
  if (!snapshotJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(snapshotJson);

    if (!isRecord(parsed)) {
      return null;
    }

    if (
      typeof parsed.fileId !== "string" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.filePath !== "string" ||
      typeof parsed.templateKind !== "string" ||
      typeof parsed.sheetName !== "string" ||
      typeof parsed.rowCount !== "number" ||
      typeof parsed.columnCount !== "number" ||
      typeof parsed.fileSize !== "number" ||
      typeof parsed.duplicateKey !== "string" ||
      typeof parsed.receivedAt !== "string"
    ) {
      return null;
    }

    return {
      fileId: parsed.fileId,
      fileName: parsed.fileName,
      filePath: parsed.filePath,
      templateKind: parsed.templateKind as PerformanceFileDetail["templateKind"],
      sheetName: parsed.sheetName,
      rowCount: parsed.rowCount,
      columnCount: parsed.columnCount,
      fileSize: parsed.fileSize,
      duplicateKey: parsed.duplicateKey,
      receivedAt: parsed.receivedAt,
      previewRows: normalizePreviewRows(parsed.previewRows),
      entries: normalizeEntries(parsed.entries)
    };
  } catch {
    return null;
  }
};
