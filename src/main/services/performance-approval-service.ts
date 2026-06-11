import { randomUUID } from "node:crypto";

import type {
  PerformanceApprovalRecord,
  PerformanceEntryRecord,
  PerformanceFileDetail
} from "../../shared/domain/performance-file";
import { parsePerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface CreateApprovalRecordInput {
  fileId: string;
  entry?: PerformanceEntryRecord;
  entryId?: string;
  logicalKey?: string;
  fileName: string;
  scheduleKey?: string;
  employeeCode?: string;
  employeeName?: string;
  workDate?: string;
  workType?: PerformanceApprovalRecord["workType"];
  decision?: PerformanceApprovalRecord["decision"];
  processedBy: string;
  processedByName: string;
  comment?: string;
  rejectionReason?: string;
  snapshotJson?: string;
  archivedFileName?: string;
  archivedFilePath?: string;
}

const approvalHistoryStore: PerformanceApprovalRecord[] = [];

const toRecord = (row: Record<string, unknown>): PerformanceApprovalRecord => ({
  id: String(row.id),
  fileId: String(row.file_id),
  entryId: String(row.entry_id),
  logicalKey: String(row.logical_key ?? ""),
  fileName: String(row.file_name),
  scheduleKey: String(row.schedule_key ?? ""),
  employeeCode: String(row.employee_code ?? ""),
  employeeName: String(row.employee_name ?? ""),
  workDate: String(row.work_date ?? ""),
  workType: String(row.work_type ?? "overtime") as PerformanceApprovalRecord["workType"],
  decision: row.decision as PerformanceApprovalRecord["decision"],
  processedAt: String(row.processed_at),
  processedBy: String(row.processed_by),
  processedByName: String(row.processed_by_name),
  comment: row.comment ? String(row.comment) : undefined,
  rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
  snapshotJson: row.snapshot_json ? String(row.snapshot_json) : undefined,
  archivedFileName: row.archived_file_name ? String(row.archived_file_name) : undefined,
  archivedFilePath: row.archived_file_path ? String(row.archived_file_path) : undefined
});

const listRecords = (whereSql?: string, params: unknown[] = []) => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const rows = database.prepare(`
      SELECT *
      FROM performance_approvals
      ${whereSql ? `WHERE ${whereSql}` : ""}
      ORDER BY processed_at DESC
    `).all(...(params as Array<string>)) as Array<Record<string, unknown>>;

    return rows.map(toRecord);
  }

  return approvalHistoryStore
    .filter((record) => {
      if (!whereSql) {
        return true;
      }

      if (whereSql === "file_id = ?") {
        return record.fileId === params[0];
      }

      if (whereSql === "entry_id = ?") {
        return record.entryId === params[0];
      }

      if (whereSql === "logical_key = ?") {
        return record.logicalKey === params[0];
      }

      return true;
    })
    .sort((left, right) => right.processedAt.localeCompare(left.processedAt));
};

export const createPerformanceApprovalRecord = (
  input: CreateApprovalRecordInput
): PerformanceApprovalRecord => {
  const record: PerformanceApprovalRecord = {
    id: randomUUID(),
    fileId: input.fileId,
    entryId: input.entry?.id ?? input.entryId ?? input.fileId,
    logicalKey: input.entry?.logicalKey ?? input.logicalKey ?? input.fileId,
    fileName: input.fileName,
    scheduleKey: input.entry?.scheduleKey ?? input.scheduleKey ?? "",
    employeeCode: input.entry?.employeeCode ?? input.employeeCode ?? "",
    employeeName: input.entry?.employeeName ?? input.employeeName ?? "",
    workDate: input.entry?.workDate ?? input.workDate ?? "",
    workType: input.entry?.workType ?? input.workType ?? "overtime",
    decision: input.decision ?? "approved",
    processedAt: new Date().toISOString(),
    processedBy: input.processedBy,
    processedByName: input.processedByName,
    comment: input.comment,
    rejectionReason: input.rejectionReason,
    snapshotJson: input.snapshotJson,
    archivedFileName: input.archivedFileName,
    archivedFilePath: input.archivedFilePath
  };

  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO performance_approvals (
        id,
        file_id,
        entry_id,
        logical_key,
        file_name,
        schedule_key,
        employee_code,
        employee_name,
        work_date,
        work_type,
        decision,
        processed_at,
        processed_by,
        processed_by_name,
        comment,
        rejection_reason,
        snapshot_json,
        archived_file_name,
        archived_file_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.fileId,
      record.entryId,
      record.logicalKey,
      record.fileName,
      record.scheduleKey,
      record.employeeCode,
      record.employeeName,
      record.workDate,
      record.workType,
      record.decision,
      record.processedAt,
      record.processedBy,
      record.processedByName,
      record.comment ?? null,
      record.rejectionReason ?? null,
      record.snapshotJson ?? null,
      record.archivedFileName ?? null,
      record.archivedFilePath ?? null
    );

    return record;
  }

  approvalHistoryStore.unshift(record);
  return record;
};

export const getPerformanceApprovalHistoryByFileId = (fileId: string): PerformanceApprovalRecord[] =>
  listRecords("file_id = ?", [fileId]);

export const getLatestPerformanceApprovalByFileId = (
  fileId: string
): PerformanceApprovalRecord | null => getPerformanceApprovalHistoryByFileId(fileId)[0] ?? null;

export const getPerformanceApprovalHistoryByEntryId = (
  entryId: string
): PerformanceApprovalRecord[] => listRecords("entry_id = ?", [entryId]);

export const getPerformanceApprovalById = (
  approvalId: string
): PerformanceApprovalRecord | null => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const row = database.prepare(`
      SELECT *
      FROM performance_approvals
      WHERE id = ?
    `).get(approvalId) as Record<string, unknown> | undefined;

    return row ? toRecord(row) : null;
  }

  return approvalHistoryStore.find((record) => record.id === approvalId) ?? null;
};

export const getLatestPerformanceApprovalByEntryId = (
  entryId: string
): PerformanceApprovalRecord | null => getPerformanceApprovalHistoryByEntryId(entryId)[0] ?? null;

export const getPerformanceApprovalHistoryByLogicalKey = (
  logicalKey: string
): PerformanceApprovalRecord[] =>
  logicalKey.trim() ? listRecords("logical_key = ?", [logicalKey]) : [];

export const getLatestPerformanceApprovalByLogicalKey = (
  logicalKey: string
): PerformanceApprovalRecord | null => getPerformanceApprovalHistoryByLogicalKey(logicalKey)[0] ?? null;

export const listLatestPerformanceApprovalsByLogicalKey = (): PerformanceApprovalRecord[] => {
  const latestByLogicalKey = new Map<string, PerformanceApprovalRecord>();

  listPerformanceApprovalHistory().forEach((record) => {
    const key = record.logicalKey.trim();

    if (!key) {
      return;
    }

    if (!latestByLogicalKey.has(key)) {
      latestByLogicalKey.set(key, record);
    }
  });

  return [...latestByLogicalKey.values()];
};

export const listLatestApprovedPerformanceApprovalsByLogicalKey = (): PerformanceApprovalRecord[] =>
  listLatestPerformanceApprovalsByLogicalKey().filter((record) => record.decision === "approved");

export const getApprovedEntryIdsByFileId = (fileId: string) => {
  const latestByEntryId = new Map<string, PerformanceApprovalRecord>();

  getPerformanceApprovalHistoryByFileId(fileId).forEach((record) => {
    if (!latestByEntryId.has(record.entryId)) {
      latestByEntryId.set(record.entryId, record);
    }
  });

  return new Set(
    [...latestByEntryId.values()]
      .filter((record) => record.decision === "approved")
      .map((record) => record.entryId)
  );
};

export const listPerformanceApprovalHistory = (): PerformanceApprovalRecord[] => listRecords();

export const hasApprovedSnapshotMissingSourceSignature = (fileId: string) =>
  listRecords("file_id = ?", [fileId]).some((record) => {
    if (record.decision !== "approved" || !record.snapshotJson) {
      return false;
    }

    const snapshot = parsePerformanceApprovalSnapshot(record.snapshotJson);

    return Boolean(snapshot?.entry && !snapshot.entry.sourceSignature?.trim());
  });

export const backfillPerformanceApprovalSnapshotSourceSignatures = (
  detail: Pick<PerformanceFileDetail, "id" | "entries">
) => {
  const entriesById = new Map(detail.entries.map((entry) => [entry.id, entry]));
  const entriesByLogicalKey = new Map(detail.entries.map((entry) => [entry.logicalKey, entry]));
  const database = getSqliteDatabase();
  let updatedCount = 0;

  const resolveEntry = (record: Pick<PerformanceApprovalRecord, "entryId" | "logicalKey">) =>
    entriesById.get(record.entryId) ?? entriesByLogicalKey.get(record.logicalKey) ?? null;

  const updateSnapshot = (snapshotJson: string | undefined, sourceSignature: string) => {
    if (!snapshotJson) {
      return null;
    }

    try {
      const snapshot = JSON.parse(snapshotJson) as { entry?: { sourceSignature?: unknown } };

      if (!snapshot.entry || typeof snapshot.entry !== "object") {
        return null;
      }

      if (snapshot.entry.sourceSignature === sourceSignature) {
        return null;
      }

      snapshot.entry.sourceSignature = sourceSignature;
      return JSON.stringify(snapshot);
    } catch {
      return null;
    }
  };

  if (database && isSqliteStorageReady()) {
    const rows = database.prepare(`
      SELECT *
      FROM performance_approvals
      WHERE file_id = ?
        AND decision = 'approved'
        AND snapshot_json IS NOT NULL
    `).all(detail.id) as Array<Record<string, unknown>>;

    rows.forEach((row) => {
      const record = toRecord(row);
      const entry = resolveEntry(record);

      if (!entry?.sourceSignature) {
        return;
      }

      const updatedSnapshotJson = updateSnapshot(record.snapshotJson, entry.sourceSignature);

      if (!updatedSnapshotJson) {
        return;
      }

      database.prepare(`
        UPDATE performance_approvals
        SET snapshot_json = ?
        WHERE id = ?
      `).run(updatedSnapshotJson, record.id);
      updatedCount += 1;
    });

    return updatedCount;
  }

  approvalHistoryStore.forEach((record, index) => {
    if (
      record.fileId !== detail.id ||
      record.decision !== "approved" ||
      !record.snapshotJson
    ) {
      return;
    }

    const entry = resolveEntry(record);

    if (!entry?.sourceSignature) {
      return;
    }

    const updatedSnapshotJson = updateSnapshot(record.snapshotJson, entry.sourceSignature);

    if (!updatedSnapshotJson) {
      return;
    }

    approvalHistoryStore[index] = {
      ...record,
      snapshotJson: updatedSnapshotJson
    };
    updatedCount += 1;
  });

  return updatedCount;
};

const isScheduleDerivedSnapshotEntry = (entry: Pick<PerformanceEntryRecord, "section">) =>
  entry.section === "legal-holiday" || entry.section === "substitute";

export const rebaselinePerformanceApprovalSnapshotScheduleEntries = (
  detail: Pick<PerformanceFileDetail, "id" | "entries">
) => {
  const entriesById = new Map(detail.entries.map((entry) => [entry.id, entry]));
  const entriesByLogicalKey = new Map(detail.entries.map((entry) => [entry.logicalKey, entry]));
  const database = getSqliteDatabase();
  let updatedCount = 0;

  const resolveEntry = (record: Pick<PerformanceApprovalRecord, "entryId" | "logicalKey">) =>
    entriesById.get(record.entryId) ?? entriesByLogicalKey.get(record.logicalKey) ?? null;

  const updateSnapshot = (snapshotJson: string | undefined, entry: PerformanceEntryRecord) => {
    if (!snapshotJson || !isScheduleDerivedSnapshotEntry(entry)) {
      return null;
    }

    try {
      const snapshot = JSON.parse(snapshotJson) as { entry?: Record<string, unknown> };

      if (!snapshot.entry || typeof snapshot.entry !== "object") {
        return null;
      }

      const nextEntry = {
        ...snapshot.entry,
        dutyCode: entry.dutyCode,
        startTime: entry.startTime,
        endTime: entry.endTime,
        breakMinutes: entry.breakMinutes,
        totalWorkMinutes: entry.totalWorkMinutes,
        baseWorkMinutes: entry.baseWorkMinutes,
        overtimeMinutes: entry.overtimeMinutes,
        nightMinutes: entry.nightMinutes,
        sourceSignature: entry.sourceSignature,
        alerts: entry.alerts,
        note: entry.note,
        workHours: entry.workHours
      };

      if (JSON.stringify(snapshot.entry) === JSON.stringify(nextEntry)) {
        return null;
      }

      snapshot.entry = nextEntry;
      return JSON.stringify(snapshot);
    } catch {
      return null;
    }
  };

  if (database && isSqliteStorageReady()) {
    const rows = database.prepare(`
      SELECT *
      FROM performance_approvals
      WHERE file_id = ?
        AND decision = 'approved'
        AND snapshot_json IS NOT NULL
    `).all(detail.id) as Array<Record<string, unknown>>;

    rows.forEach((row) => {
      const record = toRecord(row);
      const entry = resolveEntry(record);

      if (!entry) {
        return;
      }

      const updatedSnapshotJson = updateSnapshot(record.snapshotJson, entry);

      if (!updatedSnapshotJson) {
        return;
      }

      database.prepare(`
        UPDATE performance_approvals
        SET snapshot_json = ?
        WHERE id = ?
      `).run(updatedSnapshotJson, record.id);
      updatedCount += 1;
    });

    return updatedCount;
  }

  approvalHistoryStore.forEach((record, index) => {
    if (
      record.fileId !== detail.id ||
      record.decision !== "approved" ||
      !record.snapshotJson
    ) {
      return;
    }

    const entry = resolveEntry(record);

    if (!entry) {
      return;
    }

    const updatedSnapshotJson = updateSnapshot(record.snapshotJson, entry);

    if (!updatedSnapshotJson) {
      return;
    }

    approvalHistoryStore[index] = {
      ...record,
      snapshotJson: updatedSnapshotJson
    };
    updatedCount += 1;
  });

  return updatedCount;
};

export const deletePerformanceApprovalRecord = (approvalId: string) => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      DELETE FROM performance_approvals
      WHERE id = ?
    `).run(approvalId);
    return;
  }

  const index = approvalHistoryStore.findIndex((record) => record.id === approvalId);

  if (index >= 0) {
    approvalHistoryStore.splice(index, 1);
  }
};

export const getPerformanceApprovalHistory = (fileId: string) =>
  getPerformanceApprovalHistoryByFileId(fileId);

export const getLatestPerformanceApproval = (fileId: string) =>
  getLatestPerformanceApprovalByFileId(fileId);

export const resolvePerformanceFileStatus = (
  fileId: string,
  fallbackStatus: "pending" | "parsed" | "approved" | "rejected" | "error"
) => {
  const latest = getLatestPerformanceApprovalByFileId(fileId);

  if (!latest) {
    return fallbackStatus;
  }

  return latest.decision === "approved" ? "approved" : "rejected";
};

export const resetPerformanceApprovalStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM performance_approvals;");
  }

  approvalHistoryStore.length = 0;
};
