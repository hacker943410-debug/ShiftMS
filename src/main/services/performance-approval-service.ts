import { randomUUID } from "node:crypto";

import type { PerformanceFileStatus } from "../../shared/domain/model";
import type { PerformanceApprovalRecord } from "../../shared/domain/performance-file";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface CreateApprovalRecordInput {
  fileId: string;
  fileName: string;
  decision: PerformanceApprovalRecord["decision"];
  processedBy: string;
  processedByName: string;
  comment?: string;
  rejectionReason?: string;
}

const statusByDecision: Record<
  PerformanceApprovalRecord["decision"],
  Extract<PerformanceFileStatus, "approved" | "rejected">
> = {
  approved: "approved",
  rejected: "rejected"
};

const approvalHistoryStore: PerformanceApprovalRecord[] = [];
const fileStatusStore = new Map<string, PerformanceFileStatus>();

const toRecord = (row: Record<string, unknown>): PerformanceApprovalRecord => ({
  id: String(row.id),
  fileId: String(row.file_id),
  fileName: String(row.file_name),
  decision: row.decision as PerformanceApprovalRecord["decision"],
  processedAt: String(row.processed_at),
  processedBy: String(row.processed_by),
  processedByName: String(row.processed_by_name),
  comment: row.comment ? String(row.comment) : undefined,
  rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined
});

export const createPerformanceApprovalRecord = (
  input: CreateApprovalRecordInput
): PerformanceApprovalRecord => {
  const record: PerformanceApprovalRecord = {
    id: randomUUID(),
    fileId: input.fileId,
    fileName: input.fileName,
    decision: input.decision,
    processedAt: new Date().toISOString(),
    processedBy: input.processedBy,
    processedByName: input.processedByName,
    comment: input.comment,
    rejectionReason: input.rejectionReason
  };

  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO performance_approvals (
        id,
        file_id,
        file_name,
        decision,
        processed_at,
        processed_by,
        processed_by_name,
        comment,
        rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.fileId,
      record.fileName,
      record.decision,
      record.processedAt,
      record.processedBy,
      record.processedByName,
      record.comment ?? null,
      record.rejectionReason ?? null
    );

    return record;
  }

  approvalHistoryStore.unshift(record);
  fileStatusStore.set(input.fileId, statusByDecision[input.decision]);

  return record;
};

export const resolvePerformanceFileStatus = (
  fileId: string,
  fallbackStatus: PerformanceFileStatus
): PerformanceFileStatus => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const row = database.prepare(`
      SELECT decision
      FROM performance_approvals
      WHERE file_id = ?
      ORDER BY processed_at DESC
      LIMIT 1
    `).get(fileId) as { decision?: PerformanceApprovalRecord["decision"] } | undefined;

    if (!row?.decision) {
      return fallbackStatus;
    }

    return statusByDecision[row.decision];
  }

  return fileStatusStore.get(fileId) ?? fallbackStatus;
};

export const getPerformanceApprovalHistory = (
  fileId: string
): PerformanceApprovalRecord[] => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const rows = database.prepare(`
      SELECT *
      FROM performance_approvals
      WHERE file_id = ?
      ORDER BY processed_at DESC
    `).all(fileId) as Array<Record<string, unknown>>;

    return rows.map(toRecord);
  }

  return approvalHistoryStore.filter((record) => record.fileId === fileId);
};

export const getLatestPerformanceApproval = (
  fileId: string
): PerformanceApprovalRecord | null => getPerformanceApprovalHistory(fileId)[0] ?? null;

export const listPerformanceApprovalHistory = (): PerformanceApprovalRecord[] => [
  ...((): PerformanceApprovalRecord[] => {
    const database = getSqliteDatabase();

    if (database && isSqliteStorageReady()) {
      const rows = database.prepare(`
        SELECT *
        FROM performance_approvals
        ORDER BY processed_at DESC
      `).all() as Array<Record<string, unknown>>;

      return rows.map(toRecord);
    }

    return approvalHistoryStore;
  })()
];

export const resetPerformanceApprovalStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM performance_approvals;");
  }

  approvalHistoryStore.length = 0;
  fileStatusStore.clear();
};
