import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { pruneExpiredArchivedPerformanceFiles } from "./performance-archive-retention-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

type Db = NonNullable<ReturnType<typeof getSqliteDatabase>>;

let workspaceCounter = 0;
const TEST_ROOT = path.resolve(process.cwd(), "artifacts", "tests");
const REFERENCE_TIME = Date.parse("2026-06-14T00:00:00.000Z");

interface Workspace {
  root: string;
  approvedDir: string;
  dbPath: string;
}

const createWorkspace = async (): Promise<Workspace> => {
  workspaceCounter += 1;
  const root = path.join(TEST_ROOT, `archive-retention-${process.pid}-${workspaceCounter}`);
  const approvedDir = path.join(root, "imports", "approved", "2026년", "3월");
  await mkdir(approvedDir, { recursive: true });
  return { root, approvedDir, dbPath: path.join(root, "performance.test.sqlite") };
};

const insertApprovedFile = (
  db: Db,
  input: {
    id: string;
    filePath: string;
    isEffective: number;
    scheduleKey: string;
    completedAt: string | null;
  }
) => {
  db.prepare(
    `INSERT INTO performance_files (
      id, file_name, file_path, directory_type, template_kind, sheet_name,
      row_count, column_count, file_size, modified_time_ms, duplicate_key, received_at,
      schedule_month, site_name, schedule_key, status, preview_json, is_effective, completed_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    input.id,
    path.basename(input.filePath),
    input.filePath,
    "approved",
    "schedule-plan",
    "Sheet1",
    1,
    1,
    100,
    1,
    `dup-${input.id}`,
    input.completedAt ?? "2026-03-01T00:00:00.000Z",
    "2026-03",
    "보라매DC",
    input.scheduleKey,
    "approved",
    "{}",
    input.isEffective,
    input.completedAt
  );
};

const insertApproval = (db: Db, input: { id: string; fileId: string }) => {
  db.prepare(
    `INSERT INTO performance_approvals (
      id, file_id, entry_id, logical_key, file_name, schedule_key,
      decision, processed_at, processed_by, processed_by_name, snapshot_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    input.id,
    input.fileId,
    `${input.fileId}-E1`,
    "2026-03:보라매dc:token",
    "보라매DC.xlsx",
    "2026-03:보라매dc",
    "approved",
    "2026-03-10T09:00:00.000Z",
    "admin",
    "관리자",
    JSON.stringify({ fileId: input.fileId, minutes: 660 })
  );
};

const countRows = (db: Db, table: string, id: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id = ?`).get(id) as { n: number }).n;

describe("performance-archive-retention-service", () => {
  const workspaces: Workspace[] = [];

  afterEach(async () => {
    resetSqliteStorageForTest();
    while (workspaces.length > 0) {
      const workspace = workspaces.pop()!;
      await rm(workspace.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
        () => undefined
      );
    }
  });

  const setup = async () => {
    const workspace = await createWorkspace();
    workspaces.push(workspace);
    initializeSqliteStorage({ dbPath: workspace.dbPath });
    return { workspace, db: getSqliteDatabase()! };
  };

  it("deletes a long-expired superseded workbook while preserving the in-use copy and all records", async () => {
    const { workspace, db } = await setup();
    const effectivePath = path.join(workspace.approvedDir, "보라매DC.xlsx");
    const supersededPath = path.join(workspace.approvedDir, "보라매DC_dup01.xlsx");
    await writeFile(effectivePath, "current");
    await writeFile(supersededPath, "old-version");
    insertApprovedFile(db, {
      id: "EFFECTIVE",
      filePath: effectivePath,
      isEffective: 1,
      scheduleKey: "2026-03:보라매dc",
      completedAt: "2026-05-20T00:00:00.000Z"
    });
    insertApprovedFile(db, {
      id: "SUPERSEDED",
      filePath: supersededPath,
      isEffective: 0,
      scheduleKey: "2026-03:보라매dc",
      completedAt: "2024-01-01T00:00:00.000Z"
    });
    insertApproval(db, { id: "APPROVAL-OLD", fileId: "SUPERSEDED" });

    const summary = await pruneExpiredArchivedPerformanceFiles({
      maxAgeDays: 365,
      referenceTime: REFERENCE_TIME
    });

    expect(summary.deletedFileCount).toBe(1);
    expect(existsSync(supersededPath)).toBe(false); // the old raw workbook is reclaimed from disk
    expect(existsSync(effectivePath)).toBe(true); // the in-use copy is never touched
    // The database row, and crucially the approval/pay record, are preserved.
    expect(countRows(db, "performance_files", "SUPERSEDED")).toBe(1);
    expect(countRows(db, "performance_approvals", "APPROVAL-OLD")).toBe(1);
  });

  it("keeps a superseded workbook that is not old enough", async () => {
    const { workspace, db } = await setup();
    const effectivePath = path.join(workspace.approvedDir, "보라매DC.xlsx");
    const recentSupersededPath = path.join(workspace.approvedDir, "보라매DC_dup01.xlsx");
    await writeFile(effectivePath, "current");
    await writeFile(recentSupersededPath, "recent-old-version");
    insertApprovedFile(db, {
      id: "EFFECTIVE",
      filePath: effectivePath,
      isEffective: 1,
      scheduleKey: "2026-03:보라매dc",
      completedAt: "2026-05-20T00:00:00.000Z"
    });
    insertApprovedFile(db, {
      id: "RECENT",
      filePath: recentSupersededPath,
      isEffective: 0,
      scheduleKey: "2026-03:보라매dc",
      completedAt: "2026-05-01T00:00:00.000Z"
    });

    const summary = await pruneExpiredArchivedPerformanceFiles({
      maxAgeDays: 365,
      referenceTime: REFERENCE_TIME
    });

    expect(summary.deletedFileCount).toBe(0);
    expect(existsSync(recentSupersededPath)).toBe(true);
  });

  it("never deletes a freshly-archived superseded file left non-effective by an interrupted approval", async () => {
    const { workspace, db } = await setup();
    const olderEffectivePath = path.join(workspace.approvedDir, "보라매DC.xlsx");
    const crashLeftoverPath = path.join(workspace.approvedDir, "보라매DC_dup01.xlsx");
    await writeFile(olderEffectivePath, "older-effective");
    await writeFile(crashLeftoverPath, "fresh-but-not-yet-effective");
    // An older copy is currently effective for the schedule...
    insertApprovedFile(db, {
      id: "OLDER-EFFECTIVE",
      filePath: olderEffectivePath,
      isEffective: 1,
      scheduleKey: "2026-03:보라매dc",
      completedAt: "2024-01-01T00:00:00.000Z"
    });
    // ...and a just-archived copy crashed between markStoredPerformanceFileArchived and the
    // effective-mark, so it reads is_effective=0 despite being the newest workbook.
    insertApprovedFile(db, {
      id: "FRESH-LEFTOVER",
      filePath: crashLeftoverPath,
      isEffective: 0,
      scheduleKey: "2026-03:보라매dc",
      completedAt: "2026-06-13T00:00:00.000Z"
    });

    const summary = await pruneExpiredArchivedPerformanceFiles({
      maxAgeDays: 365,
      referenceTime: REFERENCE_TIME
    });

    // The age gate must protect the recent leftover even though it is is_effective=0 with an
    // effective sibling — deleting it would lose a just-approved workbook.
    expect(summary.deletedFileCount).toBe(0);
    expect(existsSync(crashLeftoverPath)).toBe(true);
    expect(existsSync(olderEffectivePath)).toBe(true);
  });

  it("never deletes the last copy of a schedule (no in-use sibling)", async () => {
    const { workspace, db } = await setup();
    const onlyPath = path.join(workspace.approvedDir, "보라매DC.xlsx");
    await writeFile(onlyPath, "the-only-copy");
    // is_effective = 0 but there is NO is_effective = 1 sibling for this schedule key.
    insertApprovedFile(db, {
      id: "ONLY-COPY",
      filePath: onlyPath,
      isEffective: 0,
      scheduleKey: "2026-03:보라매dc",
      completedAt: "2023-01-01T00:00:00.000Z"
    });

    const summary = await pruneExpiredArchivedPerformanceFiles({
      maxAgeDays: 365,
      referenceTime: REFERENCE_TIME
    });

    expect(summary.deletedFileCount).toBe(0);
    expect(existsSync(onlyPath)).toBe(true);
  });
});
