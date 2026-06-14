import { constants } from "node:fs";
import { access, rm } from "node:fs/promises";
import path from "node:path";

import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

// Bounded retention for archived performance workbooks so the approved folder does not grow without
// limit. The policy is deliberately conservative for a payroll-backing system:
//   - ONLY superseded versions are eligible: a record with is_effective = 0 whose (site, month)
//     STILL has an in-use (is_effective = 1) copy. The currently-effective workbook is never touched,
//     and a schedule whose only copy is non-effective is never touched (we never delete a last copy).
//   - ONLY old enough: older than maxAgeDays based on completed_at (falling back to received_at).
//   - ONLY the on-disk workbook is deleted. The database row, its parsed entries, the approval
//     records, and the calculated allowances are ALL preserved — the approval snapshot is
//     self-contained, so the audit/pay trail survives the raw Excel being reclaimed.
// Result: disk usage is bounded while no approval or payroll history is ever lost.

const DEFAULT_MAX_AGE_DAYS = 365;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface ArchiveRetentionSummary {
  deletedFileCount: number;
  candidateCount: number;
  issueMessages: string[];
}

const pathExists = async (target: string) => {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

interface SupersededArchiveRow {
  id: string;
  file_path: string | null;
  schedule_key: string | null;
  completed_at: string | null;
  received_at: string | null;
}

export const pruneExpiredArchivedPerformanceFiles = async (input?: {
  maxAgeDays?: number;
  referenceTime?: number;
}): Promise<ArchiveRetentionSummary> => {
  const summary: ArchiveRetentionSummary = {
    deletedFileCount: 0,
    candidateCount: 0,
    issueMessages: []
  };
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return summary;
  }

  const maxAgeDays = input?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const referenceTime = input?.referenceTime ?? Date.now();
  const cutoffMs = referenceTime - maxAgeDays * DAY_IN_MS;

  // Never throw: a failure here must not abort the surrounding startup recovery pass.
  try {
    // Schedule keys that still have an in-use copy — the only ones from which a superseded version
    // may be safely reclaimed.
    const effectiveScheduleKeys = new Set(
      (
        database
          .prepare(
            `SELECT DISTINCT schedule_key
             FROM performance_files
             WHERE directory_type = 'approved' AND status = 'approved' AND is_effective = 1
               AND schedule_key IS NOT NULL`
          )
          .all() as Array<{ schedule_key: string }>
      ).map((row) => row.schedule_key)
    );

    const supersededRows = database
      .prepare(
        `SELECT id, file_path, schedule_key, completed_at, received_at
         FROM performance_files
         WHERE directory_type = 'approved' AND status = 'approved' AND is_effective = 0
           AND schedule_key IS NOT NULL`
      )
      .all() as unknown as SupersededArchiveRow[];

    for (const row of supersededRows) {
      if (!row.schedule_key || !effectiveScheduleKeys.has(row.schedule_key)) {
        continue; // no in-use sibling → never delete the last copy of a schedule
      }

      if (!row.file_path) {
        continue;
      }

      const timestamp = row.completed_at ?? row.received_at;
      const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;

      if (Number.isNaN(timestampMs) || timestampMs > cutoffMs) {
        continue; // undatable or not old enough → keep
      }

      summary.candidateCount += 1;

      if (!(await pathExists(row.file_path))) {
        continue; // already gone
      }

      try {
        await rm(row.file_path, { force: true });
        summary.deletedFileCount += 1;
      } catch {
        // Leave the file rather than risk a partial delete, and tell the user so it is not silent.
        summary.issueMessages.push(
          `오래된 보관본 한 건을 정리하지 못했습니다: ${path.basename(
            row.file_path
          )}. 저장 공간이나 파일 사용 여부를 확인해 주세요.`
        );
      }
    }
  } catch {
    summary.issueMessages.push(
      "오래된 보관본 정리 점검 중 문제가 발생해 이번에는 건너뛰었습니다."
    );
  }

  return summary;
};
