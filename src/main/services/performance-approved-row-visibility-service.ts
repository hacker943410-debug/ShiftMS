import { randomUUID } from "node:crypto";

import type {
  PerformanceApprovedRowHiddenResult,
  PerformanceApprovedRowHideInput
} from "../../shared/domain/performance-file";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface HiddenApprovedRowRecord extends PerformanceApprovedRowHiddenResult {
  id: string;
  fileId: string;
  entryId: string;
  hiddenBy: string;
  hiddenByName: string;
}

const hiddenApprovedRowStore: HiddenApprovedRowRecord[] = [];

const toRecord = (row: Record<string, unknown>): HiddenApprovedRowRecord => ({
  id: String(row.id),
  approvalId: String(row.approval_id),
  logicalKey: String(row.logical_key),
  fileId: String(row.file_id),
  entryId: String(row.entry_id),
  hiddenAt: String(row.hidden_at),
  hiddenBy: String(row.hidden_by),
  hiddenByName: String(row.hidden_by_name)
});

export const listHiddenApprovedPerformanceRows = (): HiddenApprovedRowRecord[] => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const rows = database.prepare(`
      SELECT *
      FROM hidden_approved_performance_rows
      ORDER BY hidden_at DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map(toRecord);
  }

  return [...hiddenApprovedRowStore].sort((left, right) =>
    right.hiddenAt.localeCompare(left.hiddenAt)
  );
};

export const getHiddenApprovedPerformanceRowByApprovalId = (
  approvalId: string
): HiddenApprovedRowRecord | null =>
  listHiddenApprovedPerformanceRows().find((record) => record.approvalId === approvalId) ?? null;

export const hideApprovedPerformanceRow = (
  input: PerformanceApprovedRowHideInput & {
    logicalKey: string;
    fileId: string;
    entryId: string;
    hiddenBy: string;
    hiddenByName: string;
  }
): PerformanceApprovedRowHiddenResult => {
  const existing = getHiddenApprovedPerformanceRowByApprovalId(input.approvalId);

  if (existing) {
    return {
      approvalId: existing.approvalId,
      logicalKey: existing.logicalKey,
      hiddenAt: existing.hiddenAt
    };
  }

  const record: HiddenApprovedRowRecord = {
    id: randomUUID(),
    approvalId: input.approvalId,
    logicalKey: input.logicalKey,
    fileId: input.fileId,
    entryId: input.entryId,
    hiddenAt: new Date().toISOString(),
    hiddenBy: input.hiddenBy,
    hiddenByName: input.hiddenByName
  };
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO hidden_approved_performance_rows (
        id,
        approval_id,
        logical_key,
        file_id,
        entry_id,
        hidden_at,
        hidden_by,
        hidden_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.approvalId,
      record.logicalKey,
      record.fileId,
      record.entryId,
      record.hiddenAt,
      record.hiddenBy,
      record.hiddenByName
    );
  } else {
    hiddenApprovedRowStore.unshift(record);
  }

  return {
    approvalId: record.approvalId,
    logicalKey: record.logicalKey,
    hiddenAt: record.hiddenAt
  };
};

export const resetHiddenApprovedPerformanceRowsForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM hidden_approved_performance_rows;");
  }

  hiddenApprovedRowStore.length = 0;
};
