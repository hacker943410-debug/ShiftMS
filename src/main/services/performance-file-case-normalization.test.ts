import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getStoredPerformanceFileDetailByPath } from "./performance-file-storage-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const TEST_DB = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "case-normalization.test.sqlite"
);

type Db = NonNullable<ReturnType<typeof getSqliteDatabase>>;

const insertPendingFile = (db: Db, input: { id: string; filePath: string }) => {
  db.prepare(
    `INSERT INTO performance_files (
      id, file_name, file_path, directory_type, template_kind, sheet_name,
      row_count, column_count, file_size, modified_time_ms, duplicate_key, received_at,
      schedule_month, site_name, schedule_key, status, preview_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    input.id,
    path.basename(input.filePath),
    input.filePath,
    "pending",
    "schedule-plan",
    "Sheet1",
    1,
    1,
    100,
    1,
    `dup-${input.id}`,
    "2026-03-01T00:00:00.000Z",
    "2026-03",
    "보라매DC",
    "2026-03:보라매dc",
    "pending",
    "{}"
  );
};

describe("performance file path case-insensitive lookup", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
  });

  it("finds a stored file by path regardless of letter case", () => {
    initializeSqliteStorage({ dbPath: TEST_DB });
    const db = getSqliteDatabase()!;
    insertPendingFile(db, {
      id: "F-CASE",
      filePath: "C:/data/imports/pending/Report.xlsx"
    });

    // Windows reports the same physical file under varying letter casing; a case-sensitive match
    // would miss the existing row and let a duplicate row be created on re-import.
    const found = getStoredPerformanceFileDetailByPath(
      "C:/data/imports/pending/report.xlsx",
      "pending"
    );

    expect(found).not.toBeNull();
    expect(found?.id).toBe("F-CASE");
  });

  it("still scopes the lookup to the requested directory type", () => {
    initializeSqliteStorage({ dbPath: TEST_DB });
    const db = getSqliteDatabase()!;
    insertPendingFile(db, {
      id: "F-PENDING",
      filePath: "C:/data/imports/pending/Report.xlsx"
    });

    const found = getStoredPerformanceFileDetailByPath(
      "C:/data/imports/pending/report.xlsx",
      "approved"
    );

    expect(found).toBeNull();
  });
});
