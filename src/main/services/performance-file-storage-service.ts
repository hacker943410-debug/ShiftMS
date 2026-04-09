import path from "node:path";

import type {
  PerformanceAlert,
  PerformanceEntryRecord,
  PerformanceFileDetail,
  PerformanceFileMetadataRecord,
  PerformanceQueueItem
} from "../../shared/domain/performance-file";
import { isPoolSubstitutePerformanceEntry } from "../../shared/domain/performance-file";
import {
  getApprovedEntryIdsByFileId,
  getLatestPerformanceApprovalByFileId,
  getLatestPerformanceApprovalByEntryId,
  getPerformanceApprovalHistoryByFileId
} from "./performance-approval-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const toQueueItem = (detail: PerformanceFileDetail): PerformanceQueueItem => ({
  id: detail.id,
  fileName: detail.fileName,
  templateKind: detail.templateKind,
  status: detail.status,
  receivedAt: detail.receivedAt,
  fileSize: detail.fileSize,
  scheduleMonth: detail.scheduleMonth ?? "",
  siteName: detail.siteName ?? "",
  entryCount: detail.entryCount ?? 0,
  approvedEntryCount: detail.approvedEntryCount ?? 0,
  warningCount: detail.warningCount ?? 0,
  detailLabel: `${detail.scheduleMonth || "-"} / ${detail.siteName || "근무지 미확인"}`
});

const createProtectedSourceSignature = (
  detail: Pick<
    PerformanceFileDetail,
    | "templateKind"
    | "templateVariant"
    | "scheduleMonth"
    | "siteName"
    | "sheetName"
    | "rowCount"
    | "columnCount"
    | "fileSize"
    | "modifiedTimeMs"
    | "previewRows"
    | "entries"
  >
) =>
  JSON.stringify({
    templateKind: detail.templateKind,
    templateVariant: detail.templateVariant,
    scheduleMonth: detail.scheduleMonth,
    siteName: detail.siteName,
    sheetName: detail.sheetName,
    rowCount: detail.rowCount,
    columnCount: detail.columnCount,
    fileSize: detail.fileSize,
    modifiedTimeMs: detail.modifiedTimeMs,
    previewRows: detail.previewRows.map((row) =>
      Object.fromEntries(
        Object.entries(row).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      )
    ),
    entries: [...detail.entries]
      .map((entry) => ({
        id: entry.id,
        logicalKey: entry.logicalKey,
        employeeCode: entry.employeeCode,
        employeeName: entry.employeeName,
        workDate: entry.workDate,
        workType: entry.workType,
        section: entry.section,
        dutyCode: entry.dutyCode,
        startTime: entry.startTime,
        endTime: entry.endTime,
        breakMinutes: entry.breakMinutes,
        totalWorkMinutes: entry.totalWorkMinutes,
        baseWorkMinutes: entry.baseWorkMinutes,
        overtimeMinutes: entry.overtimeMinutes,
        nightMinutes: entry.nightMinutes,
        reason: entry.reason,
        evidence: entry.evidence,
        isPoolWorker: Boolean(entry.isPoolWorker),
        alerts: entry.alerts.map((alert) => alert.message)
      }))
      .sort((left, right) => left.logicalKey.localeCompare(right.logicalKey))
  });

const parseAlerts = (value: unknown): PerformanceAlert[] => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((alert) => {
      if (typeof alert?.message !== "string") {
        return [];
      }

      return [
        {
          severity: alert.severity === "error" ? "error" : "warning",
          message: alert.message
        } satisfies PerformanceAlert
      ];
    });
  } catch {
    return [];
  }
};

const resolveDuplicateAlerts = (
  database: NonNullable<ReturnType<typeof getSqliteDatabase>>,
  detail: Pick<PerformanceFileMetadataRecord, "id" | "scheduleKey" | "scheduleMonth" | "siteName">
) => {
  if (!detail.scheduleKey) {
    return [];
  }

  const rows = database.prepare(`
    SELECT file_name, status, directory_type
    FROM performance_files
    WHERE schedule_key = ?
      AND id <> ?
    ORDER BY received_at DESC
  `).all(detail.scheduleKey, detail.id) as Array<{
    file_name: string;
    status: string;
    directory_type: string;
  }>;

  if (rows.length === 0) {
    return [];
  }

  return [
    {
      severity: "warning" as const,
      message: `${detail.scheduleMonth} ${detail.siteName} 파일이 이미 ${rows.length}건 존재합니다. 최신본 여부를 확인하세요.`
    }
  ];
};

const toEntryRecord = (
  entryRow: Record<string, unknown>,
  fallbackFileStatus?: PerformanceFileMetadataRecord["status"]
): PerformanceEntryRecord => {
  const latestApproval = getLatestPerformanceApprovalByEntryId(String(entryRow.id));
  const fallbackApproved = fallbackFileStatus === "approved";

  return {
    id: String(entryRow.id),
    performanceFileId: String(entryRow.performance_file_id),
    logicalKey: String(entryRow.logical_key ?? ""),
    scheduleMonth: String(entryRow.schedule_month ?? ""),
    scheduleKey: String(entryRow.schedule_key ?? ""),
    siteName: String(entryRow.site_name ?? ""),
    employeeCode: String(entryRow.employee_code ?? ""),
    employeeName: String(entryRow.employee_name ?? ""),
    workDate: String(entryRow.work_date ?? ""),
    workType: String(entryRow.work_type ?? "overtime") as PerformanceEntryRecord["workType"],
    section: String(entryRow.section ?? "overtime") as PerformanceEntryRecord["section"],
    dutyCode: entryRow.duty_code ? String(entryRow.duty_code) : undefined,
    startTime: entryRow.start_time ? String(entryRow.start_time) : undefined,
    endTime: entryRow.end_time ? String(entryRow.end_time) : undefined,
    breakMinutes: Number(entryRow.break_minutes ?? 0),
    totalWorkMinutes: Number(entryRow.total_work_minutes ?? 0),
    baseWorkMinutes: Number(entryRow.base_work_minutes ?? 0),
    overtimeMinutes: Number(entryRow.overtime_minutes ?? 0),
    nightMinutes: Number(entryRow.night_minutes ?? 0),
    reason: entryRow.reason_text ? String(entryRow.reason_text) : undefined,
    evidence: entryRow.evidence_text ? String(entryRow.evidence_text) : undefined,
    sourceRowNumber: Number(entryRow.source_row_number ?? 0),
    sortOrder: Number(entryRow.sort_order ?? 0),
    alerts: parseAlerts(entryRow.alert_json),
    status:
      latestApproval?.decision === "approved" || (!latestApproval && fallbackApproved)
        ? "approved"
        : "pending",
    latestApprovalAt: latestApproval?.processedAt,
    latestApprovalByName: latestApproval?.processedByName,
    hourlyRate:
      entryRow.hourly_rate !== null && entryRow.hourly_rate !== undefined
        ? Number(entryRow.hourly_rate)
        : undefined,
    note: entryRow.note ? String(entryRow.note) : undefined,
    workHours: Number(entryRow.work_hours ?? 0),
    department: entryRow.department ? String(entryRow.department) : undefined,
    category: entryRow.category ? String(entryRow.category) : undefined,
    isPoolWorker: Number(entryRow.is_pool_worker ?? 0) === 1
  };
};

const toDetail = (row: Record<string, unknown>): PerformanceFileDetail => {
  const stableFileId = String(row.id);
  const database = getSqliteDatabase();
  const fileStatus = row.status as PerformanceFileMetadataRecord["status"];
  const entryRows =
    database && isSqliteStorageReady()
      ? (database.prepare(`
          SELECT *
          FROM performance_entries
          WHERE performance_file_id = ?
          ORDER BY sort_order ASC, work_date ASC, employee_name ASC
        `).all(stableFileId) as Array<Record<string, unknown>>)
      : [];
  const entries = entryRows.map((entryRow) => toEntryRecord(entryRow, fileStatus));
  const approvedEntryIds = getApprovedEntryIdsByFileId(stableFileId);
  const resolvedApprovedEntryCount =
    approvedEntryIds.size > 0 || fileStatus !== "approved"
      ? approvedEntryIds.size
      : Number(
          row.approved_entry_count ??
            row.entry_count ??
            entries.filter((entry) => !isPoolSubstitutePerformanceEntry(entry)).length
        );
  const metadata: PerformanceFileMetadataRecord = {
    id: stableFileId,
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    directoryType: row.directory_type as PerformanceFileMetadataRecord["directoryType"],
    templateKind: row.template_kind as PerformanceFileMetadataRecord["templateKind"],
    templateVariant: row.template_variant
      ? (String(row.template_variant) as PerformanceFileMetadataRecord["templateVariant"])
      : undefined,
    sheetName: String(row.sheet_name),
    rowCount: Number(row.row_count),
    columnCount: Number(row.column_count),
    fileSize: Number(row.file_size),
    modifiedTimeMs: Number(row.modified_time_ms),
    duplicateKey: String(row.duplicate_key),
    receivedAt: String(row.received_at),
    scheduleMonth: String(row.schedule_month ?? ""),
    siteName: String(row.site_name ?? ""),
    scheduleKey: String(row.schedule_key ?? ""),
    entryCount: Number(
      row.entry_count ?? entries.filter((entry) => !isPoolSubstitutePerformanceEntry(entry)).length
    ),
    approvedEntryCount: resolvedApprovedEntryCount,
    warningCount: 0,
    isEffective: Number(row.is_effective ?? 0) === 1,
    status: fileStatus,
    errorMessage: row.error_message ? String(row.error_message) : undefined
  };
  const alerts = [
    ...(metadata.errorMessage
      ? [{ severity: "error" as const, message: metadata.errorMessage }]
      : []),
    ...(database && isSqliteStorageReady() ? resolveDuplicateAlerts(database, metadata) : [])
  ];

  return {
    ...metadata,
    warningCount:
      alerts.length +
      entries
        .filter((entry) => !isPoolSubstitutePerformanceEntry(entry))
        .reduce((sum, entry) => sum + entry.alerts.length, 0),
    alerts,
    previewRows: JSON.parse(String(row.preview_json ?? "[]")) as PerformanceFileDetail["previewRows"],
    entries,
    approvalHistory: getPerformanceApprovalHistoryByFileId(stableFileId),
    latestApproval:
      getPerformanceApprovalHistoryByFileId(stableFileId).sort((left, right) =>
        right.processedAt.localeCompare(left.processedAt)
      )[0] ?? null
  };
};

export const upsertPerformanceFileDetail = (detail: PerformanceFileDetail) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const existingRow = database.prepare(`
    SELECT *
    FROM performance_files
    WHERE id = ?
    LIMIT 1
  `).get(detail.id) as Record<string, unknown> | undefined;

  if (existingRow) {
    const existingDetail = toDetail(existingRow);
    const isProtectedStatus =
      existingDetail.directoryType === "approved" &&
      (existingDetail.status === "approved" ||
        getLatestPerformanceApprovalByFileId(detail.id)?.decision === "approved");
    const sourceChanged =
      createProtectedSourceSignature(existingDetail) !== createProtectedSourceSignature(detail);

    if (isProtectedStatus && sourceChanged) {
      throw new Error("이미 승인 또는 반려된 실적 파일은 다른 원본으로 덮어쓸 수 없습니다.");
    }
  }

  database.prepare(`
    INSERT INTO performance_files (
      id,
      file_name,
      file_path,
      directory_type,
      template_kind,
      template_variant,
      sheet_name,
      row_count,
      column_count,
      file_size,
      modified_time_ms,
      duplicate_key,
      received_at,
      schedule_month,
      site_name,
      schedule_key,
      entry_count,
      approved_entry_count,
      warning_count,
      is_effective,
      completed_at,
      status,
      error_message,
      preview_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_name = excluded.file_name,
      file_path = excluded.file_path,
      directory_type = excluded.directory_type,
      template_kind = excluded.template_kind,
      template_variant = excluded.template_variant,
      sheet_name = excluded.sheet_name,
      row_count = excluded.row_count,
      column_count = excluded.column_count,
      file_size = excluded.file_size,
      modified_time_ms = excluded.modified_time_ms,
      duplicate_key = excluded.duplicate_key,
      received_at = excluded.received_at,
      schedule_month = excluded.schedule_month,
      site_name = excluded.site_name,
      schedule_key = excluded.schedule_key,
      entry_count = excluded.entry_count,
      approved_entry_count = excluded.approved_entry_count,
      warning_count = excluded.warning_count,
      is_effective = excluded.is_effective,
      completed_at = excluded.completed_at,
      status = excluded.status,
      error_message = excluded.error_message,
      preview_json = excluded.preview_json
  `).run(
    detail.id,
    detail.fileName,
    detail.filePath,
    detail.directoryType,
    detail.templateKind,
    detail.templateVariant ?? null,
    detail.sheetName,
    detail.rowCount,
    detail.columnCount,
    detail.fileSize,
    detail.modifiedTimeMs,
    detail.duplicateKey,
    detail.receivedAt,
    detail.scheduleMonth ?? "",
    detail.siteName ?? "",
    detail.scheduleKey ?? "",
    detail.entryCount ?? detail.entries.length,
    detail.approvedEntryCount ?? 0,
    detail.warningCount ?? 0,
    detail.isEffective ? 1 : 0,
    null,
    detail.status,
    detail.errorMessage ?? null,
    JSON.stringify(detail.previewRows)
  );

  database.prepare(`
    DELETE FROM performance_entries
    WHERE performance_file_id = ?
  `).run(detail.id);

  const insertEntry = database.prepare(`
    INSERT INTO performance_entries (
      id,
      performance_file_id,
      logical_key,
      employee_code,
      employee_name,
      work_date,
      work_hours,
      schedule_month,
      schedule_key,
      site_name,
      work_type,
      section,
      duty_code,
      start_time,
      end_time,
      break_minutes,
      total_work_minutes,
      base_work_minutes,
      overtime_minutes,
      night_minutes,
      department,
      category,
      reason_text,
      evidence_text,
      source_row_number,
      sort_order,
      alert_json,
      hourly_rate,
      note,
      is_pool_worker
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  detail.entries.forEach((entry) => {
    insertEntry.run(
      entry.id,
      detail.id,
      entry.logicalKey,
      entry.employeeCode,
      entry.employeeName,
      entry.workDate,
      entry.totalWorkMinutes / 60,
      entry.scheduleMonth,
      entry.scheduleKey,
      entry.siteName,
      entry.workType,
      entry.section,
      entry.dutyCode ?? null,
      entry.startTime ?? null,
      entry.endTime ?? null,
      entry.breakMinutes,
      entry.totalWorkMinutes,
      entry.baseWorkMinutes,
      entry.overtimeMinutes,
      entry.nightMinutes,
      entry.siteName || null,
      entry.section,
      entry.reason ?? null,
      entry.evidence ?? null,
      entry.sourceRowNumber,
      entry.sortOrder,
      JSON.stringify(entry.alerts),
      entry.hourlyRate ?? null,
      entry.note ?? null,
      entry.isPoolWorker ? 1 : 0
    );
  });
};

export const listStoredPendingPerformanceFiles = (): PerformanceQueueItem[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT *
    FROM performance_files
    WHERE directory_type = 'pending'
      AND status <> 'approved'
    ORDER BY received_at DESC, file_name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(toDetail).map(toQueueItem);
};

export const listStoredApprovedPerformanceFiles = (scheduleMonth?: string): PerformanceQueueItem[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = (
    scheduleMonth
      ? database.prepare(`
          SELECT *
          FROM performance_files
          WHERE directory_type = 'approved'
            AND status = 'approved'
            AND schedule_month = ?
          ORDER BY completed_at DESC, received_at DESC, file_name ASC
        `).all(scheduleMonth)
      : database.prepare(`
          SELECT *
          FROM performance_files
          WHERE directory_type = 'approved'
            AND status = 'approved'
          ORDER BY completed_at DESC, received_at DESC, file_name ASC
        `).all()
  ) as Array<Record<string, unknown>>;

  return rows.map(toDetail).map(toQueueItem);
};

export const listStoredPerformanceFileDetails = (): PerformanceFileDetail[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT *
    FROM performance_files
    ORDER BY received_at DESC, file_name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(toDetail);
};

export const getStoredPerformanceFileDetail = (fileId: string): PerformanceFileDetail | null => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  const row = database.prepare(`
    SELECT *
    FROM performance_files
    WHERE id = ?
    LIMIT 1
  `).get(fileId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return toDetail(row);
};

export const getStoredPerformanceFileDetailByPath = (
  filePath: string,
  directoryType?: PerformanceFileDetail["directoryType"]
): PerformanceFileDetail | null => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  const row = (
    directoryType
      ? database.prepare(`
          SELECT *
          FROM performance_files
          WHERE file_path = ?
            AND directory_type = ?
          ORDER BY received_at DESC
          LIMIT 1
        `).get(filePath, directoryType)
      : database.prepare(`
          SELECT *
          FROM performance_files
          WHERE file_path = ?
          ORDER BY received_at DESC
          LIMIT 1
        `).get(filePath)
  ) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return toDetail(row);
};

export const deleteStoredPerformanceFile = (fileId: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  const detail = getStoredPerformanceFileDetail(fileId);

  if (
    !detail ||
    (detail.directoryType === "approved" && detail.status === "approved")
  ) {
    return false;
  }

  database.prepare(`
    DELETE FROM performance_entries
    WHERE performance_file_id = ?
  `).run(fileId);
  database.prepare(`
    DELETE FROM performance_files
    WHERE id = ?
  `).run(fileId);

  return true;
};

export const deleteStoredPerformanceFileByPath = (
  filePath: string,
  directoryType?: PerformanceFileDetail["directoryType"]
) => {
  const detail = getStoredPerformanceFileDetailByPath(filePath, directoryType);

  if (!detail) {
    return false;
  }

  return deleteStoredPerformanceFile(detail.id);
};

export const markStoredPerformanceFileArchived = (input: {
  fileId: string;
  archivedFilePath: string;
  archivedFileName: string;
  completedAt: string;
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  database.prepare(`
    UPDATE performance_files
    SET file_path = ?,
        directory_type = 'approved',
        status = 'approved',
        approved_entry_count = entry_count,
        completed_at = ?
    WHERE id = ?
  `).run(input.archivedFilePath, input.completedAt, input.fileId);

  return true;
};

export const moveStoredPerformanceFileToPending = (input: {
  fileId: string;
  pendingFilePath: string;
  receivedAt: string;
  status?: "pending" | "rejected";
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  database.prepare(`
    UPDATE performance_files
    SET file_name = ?,
        file_path = ?,
        directory_type = 'pending',
        status = ?,
        approved_entry_count = 0,
        is_effective = 0,
        completed_at = NULL,
        received_at = ?
    WHERE id = ?
  `).run(
    path.basename(input.pendingFilePath),
    input.pendingFilePath,
    input.status ?? "rejected",
    input.receivedAt,
    input.fileId
  );

  return true;
};

export const setStoredEffectivePerformanceFile = (input: {
  fileId: string;
  scheduleKey: string;
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  database.prepare(`
    UPDATE performance_files
    SET is_effective = CASE WHEN id = ? THEN 1 ELSE 0 END
    WHERE schedule_key = ?
  `).run(input.fileId, input.scheduleKey);

  return true;
};

export const clearStoredEffectivePerformanceFiles = (scheduleKey: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  database.prepare(`
    UPDATE performance_files
    SET is_effective = 0
    WHERE schedule_key = ?
  `).run(scheduleKey);

  return true;
};

export const updateStoredPerformanceFileApprovalProgress = (input: {
  fileId: string;
  approvedEntryCount: number;
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  database.prepare(`
    UPDATE performance_files
    SET approved_entry_count = ?
    WHERE id = ?
  `).run(input.approvedEntryCount, input.fileId);

  return true;
};

export const resetPerformanceFileStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM performance_entries;");
    database.exec("DELETE FROM performance_files;");
  }
};
