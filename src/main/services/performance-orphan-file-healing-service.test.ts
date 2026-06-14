import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { healOrphanPerformanceFiles } from "./performance-orphan-file-healing-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

type Db = NonNullable<ReturnType<typeof getSqliteDatabase>>;

let workspaceCounter = 0;

const TEST_ROOT = path.resolve(process.cwd(), "artifacts", "tests");

interface Workspace {
  dbPath: string;
  pendingDir: string;
  approvedDir: string;
  root: string;
}

const createWorkspace = async (): Promise<Workspace> => {
  workspaceCounter += 1;
  const root = path.join(TEST_ROOT, `orphan-heal-${process.pid}-${workspaceCounter}`);
  const pendingDir = path.join(root, "imports", "pending");
  const approvedDir = path.join(root, "imports", "approved");
  await mkdir(pendingDir, { recursive: true });
  await mkdir(approvedDir, { recursive: true });
  return { root, pendingDir, approvedDir, dbPath: path.join(root, "performance.test.sqlite") };
};

const insertFile = (
  db: Db,
  input: {
    id: string;
    filePath: string;
    directoryType: "pending" | "approved";
    status: string;
    isEffective?: number;
    scheduleKey?: string;
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
    input.directoryType,
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
    input.scheduleKey ?? "2026-03:보라매dc",
    input.status,
    "{}",
    input.isEffective ?? 0,
    null
  );
};

const countFileRows = (db: Db, id: string) =>
  (db.prepare("SELECT COUNT(*) AS n FROM performance_files WHERE id = ?").get(id) as { n: number }).n;

describe("performance-orphan-file-healing-service", () => {
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

  it("surfaces an in-use approved record whose source workbook has gone missing", async () => {
    const { workspace, db } = await setup();
    insertFile(db, {
      id: "EFF-MISSING",
      filePath: path.join(workspace.approvedDir, "2026년", "3월", "보라매DC.xlsx"),
      directoryType: "approved",
      status: "approved",
      isEffective: 1
    });

    const summary = await healOrphanPerformanceFiles({
      userDataPath: workspace.root,
      pendingDir: workspace.pendingDir,
      approvedDir: workspace.approvedDir
    });

    expect(summary.missingEffectiveSourceCount).toBe(1);
    expect(summary.issueMessages.length).toBe(1);
    expect(summary.issueMessages[0]).toContain("원본 파일을 찾을 수 없습니다");
    // The database row (and its approval/pay trail) is left intact — only surfaced, never deleted.
    expect(countFileRows(db, "EFF-MISSING")).toBe(1);
  });

  it("does NOT flag a superseded (non-effective) record whose file is gone", async () => {
    const { workspace, db } = await setup();
    insertFile(db, {
      id: "SUPERSEDED-MISSING",
      filePath: path.join(workspace.approvedDir, "2026년", "3월", "보라매DC_dup01.xlsx"),
      directoryType: "approved",
      status: "approved",
      isEffective: 0
    });

    const summary = await healOrphanPerformanceFiles({
      userDataPath: workspace.root,
      pendingDir: workspace.pendingDir,
      approvedDir: workspace.approvedDir
    });

    // Only the in-use copy matters to the user; an old superseded version is expected to be absent.
    expect(summary.missingEffectiveSourceCount).toBe(0);
    expect(summary.issueMessages.length).toBe(0);
  });

  it("tidies empty directories left behind by an interrupted move", async () => {
    const { workspace } = await setup();
    const emptyMonthDir = path.join(workspace.approvedDir, "2026년", "3월");
    await mkdir(emptyMonthDir, { recursive: true });

    const summary = await healOrphanPerformanceFiles({
      userDataPath: workspace.root,
      pendingDir: workspace.pendingDir,
      approvedDir: workspace.approvedDir
    });

    expect(summary.removedEmptyDirectoryCount).toBeGreaterThanOrEqual(1);
    expect(existsSync(emptyMonthDir)).toBe(false);
    // The approved root itself is never removed.
    expect(existsSync(workspace.approvedDir)).toBe(true);
  });
});
