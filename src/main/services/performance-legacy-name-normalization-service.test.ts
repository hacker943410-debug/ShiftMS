import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeLegacyPerformanceSiteNames } from "./performance-legacy-name-normalization-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const TEST_DB = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "legacy-name-normalization.test.sqlite"
);

type Db = NonNullable<ReturnType<typeof getSqliteDatabase>>;

const insertFile = (
  db: Db,
  input: { id: string; siteName: string; scheduleMonth: string; scheduleKey: string }
) => {
  db.prepare(
    `INSERT INTO performance_files (
      id, file_name, file_path, directory_type, template_kind, sheet_name,
      row_count, column_count, file_size, modified_time_ms, duplicate_key, received_at,
      schedule_month, site_name, schedule_key, status, preview_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    input.id,
    `${input.siteName}.xlsx`,
    `C:/data/${input.siteName}.xlsx`,
    "approved",
    "schedule-return",
    "Sheet1",
    1,
    1,
    100,
    1,
    `dup-${input.id}`,
    "2026-03-01T00:00:00.000Z",
    input.scheduleMonth,
    input.siteName,
    input.scheduleKey,
    "approved",
    "{}"
  );
};

const insertEntry = (
  db: Db,
  input: {
    id: string;
    fileId: string;
    siteName: string;
    scheduleMonth: string;
    scheduleKey: string;
    logicalKey: string;
    sourceSignature: string;
  }
) => {
  db.prepare(
    `INSERT INTO performance_entries (
      id, performance_file_id, logical_key, employee_code, employee_name, work_date, work_hours,
      schedule_month, schedule_key, site_name, source_signature
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    input.id,
    input.fileId,
    input.logicalKey,
    "EMP-001",
    "가람",
    `${input.scheduleMonth}-05`,
    8,
    input.scheduleMonth,
    input.scheduleKey,
    input.siteName,
    input.sourceSignature
  );
};

const insertApproval = (
  db: Db,
  input: {
    id: string;
    fileId: string;
    entryId: string;
    siteName: string;
    scheduleKey: string;
    logicalKey: string;
    sourceSignature: string;
  }
) => {
  const snapshot = {
    fileId: input.fileId,
    siteName: input.siteName,
    scheduleKey: input.scheduleKey,
    entry: {
      logicalKey: input.logicalKey,
      siteName: input.siteName,
      scheduleKey: input.scheduleKey,
      sourceSignature: input.sourceSignature
    }
  };

  db.prepare(
    `INSERT INTO performance_approvals (
      id, file_id, entry_id, logical_key, file_name, schedule_key,
      decision, processed_at, processed_by, processed_by_name, snapshot_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    input.id,
    input.fileId,
    input.entryId,
    input.logicalKey,
    `${input.siteName}.xlsx`,
    input.scheduleKey,
    "approved",
    "2026-03-10T09:00:00.000Z",
    "admin",
    "관리자",
    JSON.stringify(snapshot)
  );
};

describe("performance-legacy-name-normalization-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
  });

  it("normalizes a legacy _1 site name across file, entry and approval keys while preserving approval history", () => {
    initializeSqliteStorage({ dbPath: TEST_DB });
    const db = getSqliteDatabase()!;

    insertFile(db, {
      id: "F1",
      siteName: "판교DC_1",
      scheduleMonth: "2026-03",
      scheduleKey: "2026-03:판교dc1"
    });
    insertEntry(db, {
      id: "E1",
      fileId: "F1",
      siteName: "판교DC_1",
      scheduleMonth: "2026-03",
      scheduleKey: "2026-03:판교dc1",
      logicalKey: "2026-03:판교dc1:token1",
      sourceSignature: "SIG-KEEP"
    });
    insertApproval(db, {
      id: "A1",
      fileId: "F1",
      entryId: "E1",
      siteName: "판교DC_1",
      scheduleKey: "2026-03:판교dc1",
      logicalKey: "2026-03:판교dc1:token1",
      sourceSignature: "SIG-KEEP"
    });

    const summary = normalizeLegacyPerformanceSiteNames();

    expect(summary.normalizedFileCount).toBe(1);
    expect(summary.conflictCount).toBe(0);

    const file = db
      .prepare("SELECT site_name, schedule_key FROM performance_files WHERE id = 'F1'")
      .get() as { site_name: string; schedule_key: string };
    expect(file.site_name).toBe("판교DC");
    expect(file.schedule_key).toBe("2026-03:판교dc");

    const entry = db
      .prepare(
        "SELECT site_name, schedule_key, logical_key, source_signature FROM performance_entries WHERE id = 'E1'"
      )
      .get() as {
      site_name: string;
      schedule_key: string;
      logical_key: string;
      source_signature: string;
    };
    expect(entry.site_name).toBe("판교DC");
    expect(entry.schedule_key).toBe("2026-03:판교dc");
    expect(entry.logical_key).toBe("2026-03:판교dc:token1");
    // The schedule-derived source signature must be preserved so reapproval is NOT triggered.
    expect(entry.source_signature).toBe("SIG-KEEP");

    const approval = db
      .prepare(
        "SELECT schedule_key, logical_key, decision, processed_by, processed_at, snapshot_json FROM performance_approvals WHERE id = 'A1'"
      )
      .get() as {
      schedule_key: string;
      logical_key: string;
      decision: string;
      processed_by: string;
      processed_at: string;
      snapshot_json: string;
    };
    expect(approval.schedule_key).toBe("2026-03:판교dc");
    expect(approval.logical_key).toBe("2026-03:판교dc:token1");
    // Approval history fields are preserved exactly.
    expect(approval.decision).toBe("approved");
    expect(approval.processed_by).toBe("admin");
    expect(approval.processed_at).toBe("2026-03-10T09:00:00.000Z");

    const snapshot = JSON.parse(approval.snapshot_json) as {
      siteName: string;
      scheduleKey: string;
      entry: { logicalKey: string; siteName: string; sourceSignature: string };
    };
    expect(snapshot.siteName).toBe("판교DC");
    expect(snapshot.scheduleKey).toBe("2026-03:판교dc");
    expect(snapshot.entry.logicalKey).toBe("2026-03:판교dc:token1");
    expect(snapshot.entry.siteName).toBe("판교DC");
    expect(snapshot.entry.sourceSignature).toBe("SIG-KEEP");
  });

  it("does NOT auto-merge when a clean-named sibling already exists, and surfaces it as a conflict", () => {
    initializeSqliteStorage({ dbPath: TEST_DB });
    const db = getSqliteDatabase()!;

    insertFile(db, {
      id: "CLEAN",
      siteName: "판교DC",
      scheduleMonth: "2026-03",
      scheduleKey: "2026-03:판교dc"
    });
    insertFile(db, {
      id: "LEGACY",
      siteName: "판교DC_1",
      scheduleMonth: "2026-03",
      scheduleKey: "2026-03:판교dc1"
    });

    const summary = normalizeLegacyPerformanceSiteNames();

    expect(summary.normalizedFileCount).toBe(0);
    expect(summary.conflictCount).toBe(1);
    expect(summary.issueMessages.length).toBeGreaterThan(0);

    const legacy = db
      .prepare("SELECT site_name FROM performance_files WHERE id = 'LEGACY'")
      .get() as { site_name: string };
    // The legacy row is left untouched (no risky auto-merge of approval records).
    expect(legacy.site_name).toBe("판교DC_1");

    const clean = db
      .prepare("SELECT site_name FROM performance_files WHERE id = 'CLEAN'")
      .get() as { site_name: string };
    expect(clean.site_name).toBe("판교DC");
  });
});
