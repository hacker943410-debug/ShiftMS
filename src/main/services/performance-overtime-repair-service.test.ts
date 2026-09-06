import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetApprovedAllowanceCalculationStateForTest } from "./approved-allowance-calculation-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  repairStoredOvertimePerformanceData,
  runStartupOvertimePerformanceRepair
} from "./performance-overtime-repair-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "performance-overtime-repair"
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

type TestDatabase = NonNullable<ReturnType<typeof getSqliteDatabase>>;

const captureRepairTables = (database: TestDatabase) => ({
  entries: database.prepare(`SELECT * FROM performance_entries ORDER BY id ASC`).all(),
  approvals: database.prepare(`SELECT * FROM performance_approvals ORDER BY id ASC`).all(),
  calculations: database.prepare(`SELECT * FROM allowance_calculations ORDER BY id ASC`).all(),
  calculationItems: database
    .prepare(`SELECT * FROM allowance_calculation_items ORDER BY id ASC`)
    .all()
});

const prepareApprovedOvertimeFixture = async () => {
  const fixture = await prepareReturnedScheduleFixture({
    rootDir: createTestRoot(),
    templateVariant: "sample1"
  });
  const detail = await syncPreparedReturnedSchedule(fixture);
  const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

  expect(overtimeEntry).toBeDefined();

  for (const entry of detail.entries) {
    const result = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: entry.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(result.ok).toBe(true);
  }

  const database = getSqliteDatabase();

  expect(database).not.toBeNull();

  const approvalRow = database!.prepare(`
    SELECT id, snapshot_json
    FROM performance_approvals
    WHERE entry_id = ?
      AND decision = 'approved'
    ORDER BY processed_at DESC
    LIMIT 1
  `).get(overtimeEntry!.id) as { id: string; snapshot_json: string } | undefined;

  expect(approvalRow).toBeDefined();

  const calculationRow = database!.prepare(`
    SELECT id, snapshot_json
    FROM allowance_calculations
    WHERE performance_approval_id = ?
  `).get(approvalRow!.id) as { id: string; snapshot_json: string } | undefined;

  expect(calculationRow).toBeDefined();

  return {
    approvalId: approvalRow!.id,
    approvalSnapshotJson: approvalRow!.snapshot_json,
    calculationId: calculationRow!.id,
    database: database!,
    entryId: overtimeEntry!.id
  };
};

// Rewrites one approved overtime row the way an older version left it: everything booked as base
// minutes. The allowance item rows are deliberately kept, so a rolled back repair can be told apart
// from a repair that actually ran.
const breakApprovedOvertimeRow = (
  fixture: Awaited<ReturnType<typeof prepareApprovedOvertimeFixture>>
) => {
  const brokenApprovalSnapshot = JSON.parse(fixture.approvalSnapshotJson) as {
    entry: Record<string, unknown>;
  };
  brokenApprovalSnapshot.entry = {
    ...brokenApprovalSnapshot.entry,
    totalWorkMinutes: 240,
    breakMinutes: 60,
    baseWorkMinutes: 240,
    overtimeMinutes: 0,
    nightMinutes: 0,
    workHours: 4
  };

  fixture.database.prepare(`
    UPDATE performance_entries
    SET total_work_minutes = 240,
        work_hours = 4,
        break_minutes = 60,
        base_work_minutes = 240,
        overtime_minutes = 0,
        night_minutes = 0
    WHERE id = ?
  `).run(fixture.entryId);

  fixture.database.prepare(`
    UPDATE performance_approvals
    SET snapshot_json = ?
    WHERE id = ?
  `).run(JSON.stringify(brokenApprovalSnapshot), fixture.approvalId);
};

describe("performance-overtime-repair-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("repairs stored overtime approvals and allowance calculations that were saved with base minutes", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    const database = getSqliteDatabase();
    expect(database).not.toBeNull();

    const approvalRow = database!.prepare(`
      SELECT id, snapshot_json
      FROM performance_approvals
      WHERE entry_id = ?
        AND decision = 'approved'
      ORDER BY processed_at DESC
      LIMIT 1
    `).get(overtimeEntry!.id) as { id: string; snapshot_json: string } | undefined;

    expect(approvalRow).toBeDefined();

    const allowanceRow = database!.prepare(`
      SELECT id, snapshot_json
      FROM allowance_calculations
      WHERE performance_approval_id = ?
    `).get(approvalRow!.id) as { id: string; snapshot_json: string } | undefined;

    expect(allowanceRow).toBeDefined();

    const brokenApprovalSnapshot = JSON.parse(approvalRow!.snapshot_json) as {
      entry: Record<string, unknown>;
    };
    brokenApprovalSnapshot.entry = {
      ...brokenApprovalSnapshot.entry,
      totalWorkMinutes: 240,
      breakMinutes: 60,
      baseWorkMinutes: 240,
      overtimeMinutes: 0,
      nightMinutes: 0,
      workHours: 4
    };

    const brokenCalculationSnapshot = JSON.parse(allowanceRow!.snapshot_json) as {
      breakdown: Record<string, unknown>;
      totalAllowanceAmount: number;
      lines: Array<Record<string, unknown>>;
    };
    brokenCalculationSnapshot.breakdown = {
      ...brokenCalculationSnapshot.breakdown,
      totalWorkMinutes: 240,
      baseWorkMinutes: 240,
      overtimeMinutes: 0,
      nightMinutes: 0
    };
    brokenCalculationSnapshot.totalAllowanceAmount = 0;
    brokenCalculationSnapshot.lines = [];

    database!.prepare(`
      UPDATE performance_entries
      SET total_work_minutes = 240,
          work_hours = 4,
          break_minutes = 60,
          base_work_minutes = 240,
          overtime_minutes = 0,
          night_minutes = 0
      WHERE id = ?
    `).run(overtimeEntry!.id);

    database!.prepare(`
      UPDATE performance_approvals
      SET snapshot_json = ?
      WHERE id = ?
    `).run(JSON.stringify(brokenApprovalSnapshot), approvalRow!.id);

    database!.prepare(`
      UPDATE allowance_calculations
      SET total_work_minutes = 240,
          base_work_minutes = 240,
          overtime_minutes = 0,
          night_minutes = 0,
          total_allowance_amount = 0,
          snapshot_json = ?
      WHERE id = ?
    `).run(JSON.stringify(brokenCalculationSnapshot), allowanceRow!.id);

    database!.prepare(`
      DELETE FROM allowance_calculation_items
      WHERE calculation_id = ?
    `).run(allowanceRow!.id);

    const summary = repairStoredOvertimePerformanceData();

    expect(summary).toEqual({
      repairedEntryCount: 1,
      repairedApprovalCount: 1,
      repairedCalculationCount: 1
    });

    const repairedEntryRow = database!.prepare(`
      SELECT break_minutes, base_work_minutes, overtime_minutes, night_minutes
      FROM performance_entries
      WHERE id = ?
    `).get(overtimeEntry!.id) as {
      break_minutes: number;
      base_work_minutes: number;
      overtime_minutes: number;
      night_minutes: number;
    };
    const repairedApprovalSnapshot = database!.prepare(`
      SELECT snapshot_json
      FROM performance_approvals
      WHERE id = ?
    `).get(approvalRow!.id) as { snapshot_json: string };
    const repairedCalculationRow = database!.prepare(`
      SELECT total_allowance_amount, base_work_minutes, overtime_minutes, night_minutes
      FROM allowance_calculations
      WHERE id = ?
    `).get(allowanceRow!.id) as {
      total_allowance_amount: number;
      base_work_minutes: number;
      overtime_minutes: number;
      night_minutes: number;
    };
    const repairedCalculationItems = database!.prepare(`
      SELECT allowance_code, amount
      FROM allowance_calculation_items
      WHERE calculation_id = ?
      ORDER BY allowance_code ASC
    `).all(allowanceRow!.id) as Array<{
      allowance_code: string;
      amount: number;
    }>;

    const parsedApprovalSnapshot = JSON.parse(repairedApprovalSnapshot.snapshot_json) as {
      entry: {
        breakMinutes: number;
        baseWorkMinutes: number;
        overtimeMinutes: number;
        nightMinutes: number;
      };
    };

    expect(repairedEntryRow).toEqual({
      break_minutes: 30,
      base_work_minutes: 0,
      overtime_minutes: 120,
      night_minutes: 150
    });
    expect(parsedApprovalSnapshot.entry).toMatchObject({
      breakMinutes: 30,
      baseWorkMinutes: 0,
      overtimeMinutes: 120,
      nightMinutes: 150
    });
    expect(repairedCalculationRow.base_work_minutes).toBe(0);
    expect(repairedCalculationRow.overtime_minutes).toBe(120);
    expect(repairedCalculationRow.night_minutes).toBe(150);
    expect(repairedCalculationRow.total_allowance_amount).toBeGreaterThan(0);
    expect(repairedCalculationItems.length).toBeGreaterThan(0);
    expect(repairedCalculationItems.some((item) => item.amount > 0)).toBe(true);
  });

  it("rolls the whole row back when an allowance item insert fails, and retries it on the next run", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const fixture = await prepareApprovedOvertimeFixture();
      const { database } = fixture;

      breakApprovedOvertimeRow(fixture);

      // Fail the second allowance item insert: by then the calculation UPDATE, the item DELETE and
      // the first item INSERT have all run inside the repair transaction.
      database.exec(`
        CREATE TRIGGER inject_repair_item_failure
        BEFORE INSERT ON allowance_calculation_items
        WHEN NEW.id LIKE 'repair-item-%'
          AND EXISTS (SELECT 1 FROM allowance_calculation_items WHERE id LIKE 'repair-item-%')
        BEGIN
          SELECT RAISE(ABORT, 'injected allowance item insert failure');
        END;
      `);

      const beforeFailedRepair = captureRepairTables(database);
      const failedSummary = repairStoredOvertimePerformanceData();

      expect(failedSummary).toEqual({
        repairedEntryCount: 0,
        repairedApprovalCount: 0,
        repairedCalculationCount: 0
      });
      expect(captureRepairTables(database)).toEqual(beforeFailedRepair);
      expect(database.isTransaction).toBe(false);

      database.exec("DROP TRIGGER inject_repair_item_failure");

      // The failed row was left untouched, so the very next run picks it up again instead of
      // treating it as already repaired.
      const retrySummary = repairStoredOvertimePerformanceData();

      expect(retrySummary).toEqual({
        repairedEntryCount: 1,
        repairedApprovalCount: 1,
        repairedCalculationCount: 1
      });

      const retriedEntryRow = database.prepare(`
        SELECT break_minutes, base_work_minutes, overtime_minutes, night_minutes
        FROM performance_entries
        WHERE id = ?
      `).get(fixture.entryId) as {
        break_minutes: number;
        base_work_minutes: number;
        overtime_minutes: number;
        night_minutes: number;
      };
      const retriedItems = database.prepare(`
        SELECT id
        FROM allowance_calculation_items
        WHERE calculation_id = ?
      `).all(fixture.calculationId) as Array<{ id: string }>;

      expect(retriedEntryRow).toEqual({
        break_minutes: 30,
        base_work_minutes: 0,
        overtime_minutes: 120,
        night_minutes: 150
      });
      // Two or more items is what makes the injected failure land on the second insert above.
      expect(retriedItems.length).toBeGreaterThanOrEqual(2);
      expect(retriedItems.every((item) => item.id.startsWith("repair-item-"))).toBe(true);
      expect(database.isTransaction).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("leaves a healthy database untouched", async () => {
    const fixture = await prepareApprovedOvertimeFixture();
    const beforeRepair = captureRepairTables(fixture.database);

    expect(repairStoredOvertimePerformanceData()).toEqual({
      repairedEntryCount: 0,
      repairedApprovalCount: 0,
      repairedCalculationCount: 0
    });
    expect(captureRepairTables(fixture.database)).toEqual(beforeRepair);
    expect(fixture.database.isTransaction).toBe(false);
  });

  it("lets startup continue when the repair throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const failedResult = runStartupOvertimePerformanceRepair(() => {
        throw new Error("repair failed");
      });

      expect(failedResult).toBeNull();
      expect(errorSpy).toHaveBeenCalled();

      const succeededResult = runStartupOvertimePerformanceRepair(() => ({
        repairedEntryCount: 1,
        repairedApprovalCount: 2,
        repairedCalculationCount: 3
      }));

      expect(succeededResult).toEqual({
        repairedEntryCount: 1,
        repairedApprovalCount: 2,
        repairedCalculationCount: 3
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
