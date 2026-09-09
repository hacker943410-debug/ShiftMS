import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resetApprovedAllowanceCalculationStateForTest,
  runApprovedAllowanceCalculation
} from "./approved-allowance-calculation-service";
import {
  approvePerformanceFile,
  isPerformanceFileChangeLockedByProposal
} from "./performance-approval-flow-service";
import { listPerformanceOverview } from "./performance-management-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

// 실적 overview asked, once per ROW, questions that only have one answer per FILE, and reached
// those answers by materialising the whole allowance ledger plus one item query per calculation.
// Measured on a copy of the operator's own database: 8,449 SQL statements for a single row, and
// 21 seconds for one refresh of a 125-row month.
//
// These tests pin the SHAPE of the reads, not a stopwatch. A statement budget is the same number
// on a fast machine and a slow one, and it fails the moment a lookup is put back inside the row
// loop or answered by a full-table read.
const testRootBase = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "performance-overview-lock-lookup"
);
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

interface StatementRecorder {
  executed: string[];
  reset: () => void;
}

// Counts the statements the services actually EXECUTE - preparing alone proves nothing - by
// wrapping database.prepare and the all/get/run of every statement it hands back.
const installStatementRecorder = (): StatementRecorder => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("테스트 DB를 초기화하지 못했습니다.");
  }

  const executed: string[] = [];
  const originalPrepare = database.prepare.bind(database);

  (database as unknown as { prepare: unknown }).prepare = (sql: string) => {
    const statement = originalPrepare(sql);
    const normalized = normalizeSql(sql);
    const wrap = (name: "all" | "get" | "run") => {
      const target = statement as unknown as Record<string, (...args: never[]) => unknown>;
      const original = target[name].bind(statement);

      target[name] = (...args: never[]) => {
        executed.push(normalized);
        return original(...args);
      };
    };

    wrap("all");
    wrap("get");
    wrap("run");

    return statement;
  };

  return {
    executed,
    reset: () => {
      executed.length = 0;
    }
  };
};

const insertCalculationSql = `
  INSERT INTO allowance_calculations (
    id, performance_approval_id, performance_entry_id, calculation_version, status,
    file_id, file_name, site_name, employee_code, employee_name, employee_rank,
    work_date, work_type, hourly_rate, rate_version_id, rate_version_label,
    total_work_minutes, base_work_minutes, overtime_minutes, night_minutes,
    holiday_minutes, substitute_minutes, total_allowance_amount, signature,
    snapshot_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const insertItemSql = `
  INSERT INTO allowance_calculation_items (
    id, calculation_id, allowance_code, work_minutes, multiplier, amount
  ) VALUES (?, ?, ?, ?, ?, ?)
`;

const calculationValues = (input: {
  calculationId: string;
  approvalId: string;
  fileId: string;
  status: string;
  createdAt: string;
}) => [
  input.calculationId,
  input.approvalId,
  `${input.approvalId}-entry`,
  1,
  input.status,
  input.fileId,
  `${input.fileId}.xlsx`,
  "테스트근무지",
  "E1",
  "직원1",
  "사원",
  "2026-03-01",
  "overtime",
  14100,
  "rate-version",
  "요율",
  270,
  120,
  150,
  150,
  0,
  0,
  100000,
  `signature-${input.calculationId}`,
  JSON.stringify({
    performanceApprovalId: input.approvalId,
    createdAt: input.createdAt,
    breakdown: { totalWorkMinutes: 270 },
    lines: []
  }),
  input.createdAt
];

// A synthetic approval history, written straight into the tables. This is a COST probe, not a
// data fixture: four thousand approvals cannot be produced through the Excel intake queue, and the
// rows never leave this temp database. The behavioural tests below go through the real intake
// helpers (prepareReturnedScheduleFixture -> approvePerformanceFile -> runApprovedAllowanceCalculation).
const seedApprovalHistory = (input: {
  dbPath: string;
  fileCount: number;
  approvalsPerFile: number;
}) => {
  initializeSqliteStorage({ dbPath: input.dbPath });
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("테스트 DB를 초기화하지 못했습니다.");
  }

  const insertApproval = database.prepare(`
    INSERT INTO performance_approvals (
      id, file_id, entry_id, logical_key, file_name, schedule_key, employee_code,
      employee_name, work_date, work_type, decision, processed_at, processed_by,
      processed_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCalculation = database.prepare(insertCalculationSql);
  const insertItem = database.prepare(insertItemSql);
  const fileIds: string[] = [];

  database.exec("BEGIN");

  for (let fileIndex = 0; fileIndex < input.fileCount; fileIndex += 1) {
    const fileId = `seeded-file-${fileIndex}`;
    fileIds.push(fileId);

    for (let approvalIndex = 0; approvalIndex < input.approvalsPerFile; approvalIndex += 1) {
      const approvalId = `${fileId}-approval-${approvalIndex}`;
      const calculationId = `${fileId}-calculation-${approvalIndex}`;
      // Only the very first file carries a 품의승인. Every other file is ordinary approved work.
      const status = fileIndex === 0 && approvalIndex === 0 ? "proposal-approved" : "calculated";

      insertApproval.run(
        approvalId,
        fileId,
        `${approvalId}-entry`,
        `${approvalId}-logical`,
        `${fileId}.xlsx`,
        `2026-03:${fileId}`,
        "E1",
        "직원1",
        "2026-03-01",
        "overtime",
        "approved",
        `2026-03-01T00:00:0${approvalIndex % 10}.000Z`,
        "admin",
        "관리자"
      );
      insertCalculation.run(
        ...(calculationValues({
          calculationId,
          approvalId,
          fileId,
          status,
          createdAt: `2026-03-01T00:00:0${approvalIndex % 10}.000Z`
        }) as never[])
      );

      for (let itemIndex = 0; itemIndex < 2; itemIndex += 1) {
        insertItem.run(
          `${calculationId}-item-${itemIndex}`,
          calculationId,
          `code-${itemIndex}`,
          120,
          1.5,
          50000
        );
      }
    }
  }

  database.exec("COMMIT");

  return { fileIds };
};

const measureLockLookup = (input: {
  rootDir: string;
  fileCount: number;
  approvalsPerFile: number;
}) => {
  const seeded = seedApprovalHistory({
    dbPath: path.resolve(input.rootDir, "lock-lookup.sqlite"),
    fileCount: input.fileCount,
    approvalsPerFile: input.approvalsPerFile
  });
  const recorder = installStatementRecorder();
  const lockedFileId = seeded.fileIds[0];
  const unlockedFileId = seeded.fileIds[seeded.fileIds.length - 1];

  const locked = isPerformanceFileChangeLockedByProposal(lockedFileId);
  const unlocked = isPerformanceFileChangeLockedByProposal(unlockedFileId);

  recorder.reset();
  isPerformanceFileChangeLockedByProposal(unlockedFileId);

  return { locked, unlocked, executed: [...recorder.executed] };
};

const countUnscoped = (executed: string[], table: string) =>
  executed.filter((sql) => sql.includes(`FROM ${table}`) && !sql.includes("WHERE")).length;

const buildApprovedFixture = async (rootDir: string) => {
  const fixture = await prepareReturnedScheduleFixture({
    rootDir,
    templateVariant: "sample1"
  });
  const detail = await syncPreparedReturnedSchedule(fixture);

  for (const entry of detail.entries) {
    const approved = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: entry.id
      },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approved.ok).toBe(true);
  }

  for (const entry of detail.entries) {
    await runApprovedAllowanceCalculation({ entryId: entry.id });
  }

  return {
    settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
    query: { approvalScope: "approved" as const, scheduleMonth: "2026-03" }
  };
};

describe("performance overview lock lookup", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("answers the file lock question with scoped reads only", () => {
    const measured = measureLockLookup({
      rootDir: createTestRoot(),
      fileCount: 40,
      approvalsPerFile: 10
    });

    // Behaviour first: the batched lookup must give the same answers the per-row helper gave.
    expect(measured.locked).toBe(true);
    expect(measured.unlocked).toBe(false);

    // One question about one file must not read whole tables.
    expect(measured.executed.length).toBeLessThanOrEqual(3);
    expect(measured.executed.every((sql) => sql.includes("WHERE"))).toBe(true);
  }, 300_000);

  it("keeps the file lock question the same size when the approval history grows ten times", () => {
    const small = measureLockLookup({
      rootDir: createTestRoot(),
      fileCount: 40,
      approvalsPerFile: 10
    });

    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetSqliteStorageForTest();

    const large = measureLockLookup({
      rootDir: createTestRoot(),
      fileCount: 400,
      approvalsPerFile: 10
    });

    expect(large.locked).toBe(true);
    expect(large.unlocked).toBe(false);
    // Same file, same question, ten times the history: the cost belongs to the file, not the table.
    expect(large.executed.length).toBe(small.executed.length);
  }, 300_000);

  it("builds the whole overview without re-reading the ledgers once per row", async () => {
    const { settings, query } = await buildApprovedFixture(createTestRoot());

    // Warm-up: the first approved read also syncs the archive folder into storage, a one-off cost
    // that is not what this test is about.
    await listPerformanceOverview(query, settings);

    const recorder = installStatementRecorder();
    recorder.reset();
    const overview = await listPerformanceOverview(query, settings);
    const executed = [...recorder.executed];

    expect(overview.rowCount).toBe(3);
    // Building the latest-approval map is the only unscoped approval scan the overview needs. The
    // lock used to add one more per ROW, by reading the whole approval history and filtering it in
    // JavaScript. (A file-scoped read is not counted here: two unrelated per-file checks issue the
    // exact same SQL, so counting "file_id = ?" would measure them, not the lock.)
    expect(countUnscoped(executed, "performance_approvals")).toBeLessThanOrEqual(1);
    // And no lookup may reach its answer by materialising the whole allowance ledger.
    expect(countUnscoped(executed, "allowance_calculations")).toBe(0);
    expect(executed.filter((sql) => sql.includes("FROM allowance_calculation_items")).length).toBe(
      0
    );
  }, 300_000);

  it("keeps the overview the same size when the allowance ledger grows by a thousand rows", async () => {
    const { settings, query } = await buildApprovedFixture(createTestRoot());

    await listPerformanceOverview(query, settings);

    const recorder = installStatementRecorder();
    recorder.reset();
    await listPerformanceOverview(query, settings);
    const before = recorder.executed.length;

    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("테스트 DB를 초기화하지 못했습니다.");
    }

    // A thousand calculations that belong to no row on screen. A per-row full-table read pays for
    // every one of them; a scoped read pays for none.
    const insertCalculation = database.prepare(insertCalculationSql);
    const insertItem = database.prepare(insertItemSql);

    database.exec("BEGIN");
    for (let index = 0; index < 1_000; index += 1) {
      insertCalculation.run(
        ...(calculationValues({
          calculationId: `unrelated-${index}`,
          approvalId: `unrelated-approval-${index}`,
          fileId: `unrelated-file-${index}`,
          status: "calculated",
          createdAt: "2026-03-01T00:00:00.000Z"
        }) as never[])
      );
      insertItem.run(`unrelated-item-${index}`, `unrelated-${index}`, "code-0", 120, 1.5, 50000);
    }
    database.exec("COMMIT");

    recorder.reset();
    const grownOverview = await listPerformanceOverview(query, settings);

    expect(grownOverview.rowCount).toBe(3);
    expect(recorder.executed.length).toBe(before);
  }, 300_000);
});
