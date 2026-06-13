import {
  normalizeLookupKey,
  stripFileDuplicateSuffix
} from "./schedule-return-performance-parser";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

// One-time, idempotent cleanup of performance records that were persisted (before the parser
// learned to strip file-copy suffixes) with a duplicate-suffixed site name such as "동작국사_1".
// The suffix is not just a display label: it is baked into the hidden matching keys
// (schedule_key / logical_key) that link approvals to entries, so a rename must rewrite every key
// consistently in one transaction. Decision / processor / timestamps / minutes / source signatures
// are deliberately left untouched, so approval history is preserved and the rename never
// re-triggers reapproval (the reapproval check is schedule-derived and does not include the site
// name). When a clean-named sibling already exists for the same (month, site) we do NOT auto-merge
// — we surface it as an issue for manual review instead.

export interface LegacyPerformanceNameNormalizationSummary {
  normalizedFileCount: number;
  conflictCount: number;
  issueMessages: string[];
}

interface PerformanceFileRow {
  id: string;
  schedule_month: string | null;
  site_name: string;
  schedule_key: string | null;
}

// Logical keys are composed as `${scheduleKey}:${sourceToken}` at parse time, so only the
// schedule-key prefix carries the (now-normalized) site identity. Swap that prefix and keep the
// rest of the key byte-for-byte.
const rewriteLogicalKeyPrefix = (
  logicalKey: string | null | undefined,
  oldScheduleKey: string,
  newScheduleKey: string
): string | null => {
  if (!logicalKey) {
    return logicalKey ?? null;
  }

  const prefix = `${oldScheduleKey}:`;
  if (oldScheduleKey.length > 0 && logicalKey.startsWith(prefix)) {
    return `${newScheduleKey}:${logicalKey.slice(prefix.length)}`;
  }

  return logicalKey;
};

const rewriteSnapshotJson = (
  snapshotJson: string | null | undefined,
  params: { newSiteName: string; oldScheduleKey: string; newScheduleKey: string }
): string | null => {
  if (!snapshotJson) {
    return snapshotJson ?? null;
  }

  try {
    const snapshot = JSON.parse(snapshotJson) as Record<string, unknown> & {
      entry?: Record<string, unknown>;
    };

    if (typeof snapshot.siteName === "string") {
      snapshot.siteName = params.newSiteName;
    }
    if (typeof snapshot.scheduleKey === "string") {
      snapshot.scheduleKey = params.newScheduleKey;
    }

    if (snapshot.entry && typeof snapshot.entry === "object") {
      const entry = snapshot.entry as Record<string, unknown>;
      if (typeof entry.siteName === "string") {
        entry.siteName = params.newSiteName;
      }
      if (typeof entry.scheduleKey === "string") {
        entry.scheduleKey = params.newScheduleKey;
      }
      if (typeof entry.logicalKey === "string") {
        entry.logicalKey =
          rewriteLogicalKeyPrefix(entry.logicalKey, params.oldScheduleKey, params.newScheduleKey) ??
          entry.logicalKey;
      }
      // entry.sourceSignature is intentionally NOT rewritten — it is schedule-derived and contains
      // no site name, so leaving it as-is keeps the approval out of the reapproval queue.
    }

    return JSON.stringify(snapshot);
  } catch {
    // A snapshot we cannot parse is left exactly as-is rather than risk corrupting it.
    return snapshotJson;
  }
};

type SqliteDatabase = NonNullable<ReturnType<typeof getSqliteDatabase>>;

const applyNormalizationToFile = (
  database: SqliteDatabase,
  fileId: string,
  params: { newSiteName: string; oldScheduleKey: string; newScheduleKey: string }
) => {
  database.exec("BEGIN");
  try {
    database
      .prepare("UPDATE performance_files SET site_name = ?, schedule_key = ? WHERE id = ?")
      .run(params.newSiteName, params.newScheduleKey, fileId);

    const entryRows = database
      .prepare(
        "SELECT id, logical_key, schedule_key FROM performance_entries WHERE performance_file_id = ?"
      )
      .all(fileId) as Array<{ id: string; logical_key: string | null; schedule_key: string | null }>;
    const updateEntry = database.prepare(
      "UPDATE performance_entries SET site_name = ?, schedule_key = ?, logical_key = ? WHERE id = ?"
    );
    for (const row of entryRows) {
      const rowOldKey = row.schedule_key ?? params.oldScheduleKey;
      const newLogical = rewriteLogicalKeyPrefix(row.logical_key, rowOldKey, params.newScheduleKey);
      updateEntry.run(params.newSiteName, params.newScheduleKey, newLogical, row.id);
    }

    const approvalRows = database
      .prepare(
        "SELECT id, logical_key, schedule_key, snapshot_json FROM performance_approvals WHERE file_id = ?"
      )
      .all(fileId) as Array<{
      id: string;
      logical_key: string | null;
      schedule_key: string | null;
      snapshot_json: string | null;
    }>;
    const updateApproval = database.prepare(
      "UPDATE performance_approvals SET schedule_key = ?, logical_key = ?, snapshot_json = ? WHERE id = ?"
    );
    for (const row of approvalRows) {
      const rowOldKey = row.schedule_key ?? params.oldScheduleKey;
      const newLogical = rewriteLogicalKeyPrefix(row.logical_key, rowOldKey, params.newScheduleKey);
      const newSnapshot = rewriteSnapshotJson(row.snapshot_json, {
        newSiteName: params.newSiteName,
        oldScheduleKey: rowOldKey,
        newScheduleKey: params.newScheduleKey
      });
      updateApproval.run(params.newScheduleKey, newLogical, newSnapshot, row.id);
    }

    // allowance_calculations.site_name is a display field linked by approval/entry id (not by key),
    // so keep it consistent with the renamed site.
    database
      .prepare("UPDATE allowance_calculations SET site_name = ? WHERE file_id = ?")
      .run(params.newSiteName, fileId);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

export const normalizeLegacyPerformanceSiteNames =
  (): LegacyPerformanceNameNormalizationSummary => {
    const summary: LegacyPerformanceNameNormalizationSummary = {
      normalizedFileCount: 0,
      conflictCount: 0,
      issueMessages: []
    };
    const database = getSqliteDatabase();

    if (!database || !isSqliteStorageReady()) {
      return summary;
    }

    const rows = database
      .prepare(
        "SELECT id, schedule_month, site_name, schedule_key FROM performance_files WHERE site_name IS NOT NULL"
      )
      .all() as unknown as PerformanceFileRow[];

    // Group every file by its NORMALIZED (month, site) identity so we can detect when a clean-named
    // sibling already exists (the merge case we intentionally do not auto-merge).
    const normalizedIdentityToFileIds = new Map<string, string[]>();
    for (const row of rows) {
      const identity = `${row.schedule_month ?? ""}:${normalizeLookupKey(
        stripFileDuplicateSuffix(row.site_name)
      )}`;
      const fileIds = normalizedIdentityToFileIds.get(identity) ?? [];
      fileIds.push(row.id);
      normalizedIdentityToFileIds.set(identity, fileIds);
    }

    for (const row of rows) {
      const newSiteName = stripFileDuplicateSuffix(row.site_name);

      if (newSiteName === row.site_name) {
        continue; // already clean
      }

      const month = row.schedule_month ?? "";
      const newSiteKey = normalizeLookupKey(newSiteName);
      const identity = `${month}:${newSiteKey}`;
      const siblings = (normalizedIdentityToFileIds.get(identity) ?? []).filter(
        (id) => id !== row.id
      );

      if (siblings.length > 0) {
        summary.conflictCount += 1;
        summary.issueMessages.push(
          `${month || "월 미상"} ${newSiteName}: 같은 근무지로 정리된 기록이 이미 있어 자동으로 정리하지 못했습니다. 직접 확인이 필요합니다.`
        );
        continue;
      }

      try {
        applyNormalizationToFile(database, row.id, {
          newSiteName,
          oldScheduleKey: row.schedule_key ?? `${month}:${normalizeLookupKey(row.site_name)}`,
          newScheduleKey: `${month}:${newSiteKey}`
        });
        summary.normalizedFileCount += 1;
      } catch {
        summary.conflictCount += 1;
        summary.issueMessages.push(
          `${month || "월 미상"} ${newSiteName}: 옛 기록을 정리하는 중 문제가 발생해 건너뛰었습니다. 직접 확인이 필요합니다.`
        );
      }
    }

    return summary;
  };
