import type {
  PerformanceFileDetail,
  PerformanceEntryRecord,
  PerformanceFileMetadataRecord,
  PerformanceQueueItem
} from "../../shared/domain/performance-file";
import { getLatestPerformanceApproval, getPerformanceApprovalHistory, resolvePerformanceFileStatus } from "./performance-approval-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const toQueueItem = (detail: PerformanceFileDetail): PerformanceQueueItem => ({
  id: detail.id,
  fileName: detail.fileName,
  templateKind: detail.templateKind,
  status: detail.status,
  receivedAt: detail.receivedAt,
  fileSize: detail.fileSize,
  detailLabel: `${detail.templateKind} / ${detail.sheetName || "시트 미확인"}`
});

const createProtectedSourceSignature = (
  detail: Pick<
    PerformanceFileDetail,
    | "templateKind"
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
        employeeCode: entry.employeeCode,
        employeeName: entry.employeeName,
        workDate: entry.workDate,
        workHours: entry.workHours,
        department: entry.department,
        category: entry.category,
        hourlyRate: entry.hourlyRate,
        note: entry.note
      }))
      .sort(
        (left, right) =>
          left.workDate.localeCompare(right.workDate) ||
          left.employeeCode.localeCompare(right.employeeCode)
      )
  });

const toDetail = (row: Record<string, unknown>): PerformanceFileDetail => {
  const stableFileId = String(row.id);
  const database = getSqliteDatabase();
  const entryRows =
    database && isSqliteStorageReady()
      ? (database.prepare(`
          SELECT *
          FROM performance_entries
          WHERE performance_file_id = ?
          ORDER BY work_date ASC, employee_code ASC
        `).all(stableFileId) as Array<Record<string, unknown>>)
      : [];
  const entries: PerformanceEntryRecord[] = entryRows.map((entryRow) => ({
    id: String(entryRow.id),
    performanceFileId: String(entryRow.performance_file_id),
    employeeCode: String(entryRow.employee_code),
    employeeName: String(entryRow.employee_name),
    workDate: String(entryRow.work_date),
    workHours: Number(entryRow.work_hours),
    department: entryRow.department ? String(entryRow.department) : undefined,
    category: entryRow.category ? String(entryRow.category) : undefined,
    hourlyRate: entryRow.hourly_rate !== null && entryRow.hourly_rate !== undefined
      ? Number(entryRow.hourly_rate)
      : undefined,
    note: entryRow.note ? String(entryRow.note) : undefined
  }));

  return {
    id: stableFileId,
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    directoryType: row.directory_type as PerformanceFileMetadataRecord["directoryType"],
    templateKind: row.template_kind as PerformanceFileMetadataRecord["templateKind"],
    sheetName: String(row.sheet_name),
    rowCount: Number(row.row_count),
    columnCount: Number(row.column_count),
    fileSize: Number(row.file_size),
    modifiedTimeMs: Number(row.modified_time_ms),
    duplicateKey: String(row.duplicate_key),
    receivedAt: String(row.received_at),
    status: resolvePerformanceFileStatus(
      stableFileId,
      row.status as PerformanceFileMetadataRecord["status"]
    ),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    previewRows: JSON.parse(String(row.preview_json)) as PerformanceFileDetail["previewRows"],
    entries,
    approvalHistory: getPerformanceApprovalHistory(stableFileId),
    latestApproval: getLatestPerformanceApproval(stableFileId)
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
      existingDetail.status === "approved" || existingDetail.status === "rejected";
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
      sheet_name,
      row_count,
      column_count,
      file_size,
      modified_time_ms,
      duplicate_key,
      received_at,
      status,
      error_message,
      preview_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_name = excluded.file_name,
      file_path = excluded.file_path,
      directory_type = excluded.directory_type,
      template_kind = excluded.template_kind,
      sheet_name = excluded.sheet_name,
      row_count = excluded.row_count,
      column_count = excluded.column_count,
      file_size = excluded.file_size,
      modified_time_ms = excluded.modified_time_ms,
      duplicate_key = excluded.duplicate_key,
      received_at = excluded.received_at,
      status = excluded.status,
      error_message = excluded.error_message,
      preview_json = excluded.preview_json
  `).run(
    detail.id,
    detail.fileName,
    detail.filePath,
    detail.directoryType,
    detail.templateKind,
    detail.sheetName,
    detail.rowCount,
    detail.columnCount,
    detail.fileSize,
    detail.modifiedTimeMs,
    detail.duplicateKey,
    detail.receivedAt,
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
      employee_code,
      employee_name,
      work_date,
      work_hours,
      department,
      category,
      hourly_rate,
      note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  detail.entries.forEach((entry) => {
    insertEntry.run(
      entry.id,
      detail.id,
      entry.employeeCode,
      entry.employeeName,
      entry.workDate,
      entry.workHours,
      entry.department ?? null,
      entry.category ?? null,
      entry.hourlyRate ?? null,
      entry.note ?? null
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
    ORDER BY received_at DESC, file_name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows
    .map(toDetail)
    .filter((detail) => detail.status === "pending")
    .map(toQueueItem);
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

export const deleteStoredPerformanceFile = (fileId: string) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  const detail = getStoredPerformanceFileDetail(fileId);

  if (!detail || detail.status === "approved" || detail.status === "rejected") {
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

export const markStoredPerformanceFileArchived = (input: {
  fileId: string;
  archivedFilePath: string;
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return false;
  }

  database.prepare(`
    UPDATE performance_files
    SET file_path = ?,
        directory_type = 'approved',
        status = 'approved'
    WHERE id = ?
  `).run(input.archivedFilePath, input.fileId);

  return true;
};

export const resetPerformanceFileStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM performance_entries;");
    database.exec("DELETE FROM performance_files;");
  }
};
