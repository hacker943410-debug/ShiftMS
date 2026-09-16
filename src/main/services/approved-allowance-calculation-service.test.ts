import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  deleteAllowanceCalculationByApprovalId,
  getLatestAllowanceCalculationByApprovalId,
  listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest,
  runApprovedAllowanceCalculation,
  setAllowanceCalculationEarlyPayout
} from "./approved-allowance-calculation-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "approved-allowance-calculation");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

describe("approved-allowance-calculation-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should calculate an approved overtime entry from the approval snapshot", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);

    const result = await runApprovedAllowanceCalculation({
      entryId: overtimeEntry!.id
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.fileId).toBe(detail.id);
    expect(result.data.entryId).toBe(overtimeEntry!.id);
    expect(result.data.employeeName).toBe(fixture.workers.overtime.name);
    expect(result.data.employeeRank).toBe("사원");
    expect(result.data.hourlyRate).toBe(14100);
    expect(result.data.snapshot.breakdown.totalWorkMinutes).toBe(270);
    expect(result.data.snapshot.breakdown.nightMinutes).toBe(150);
    expect(result.data.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });

  it("should return the stored calculation for duplicate runs of the same approved entry", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const first = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });
    const second = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(second.data.id).toBe(first.data.id);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
  });

  it("should persist the calculation summary and line items in sqlite", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const result = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const database = getSqliteDatabase();
    const summaryRow = database!.prepare(`
      SELECT employee_rank, total_allowance_amount
      FROM allowance_calculations
      WHERE id = ?
    `).get(result.data.id) as { employee_rank: string | null; total_allowance_amount: number } | undefined;
    const itemRows = database!.prepare(`
      SELECT allowance_code, amount
      FROM allowance_calculation_items
      WHERE calculation_id = ?
      ORDER BY allowance_code ASC
    `).all(result.data.id) as Array<{ allowance_code: string; amount: number }>;

    expect(summaryRow?.total_allowance_amount).toBe(result.data.snapshot.totalAllowanceAmount);
    expect(summaryRow?.employee_rank).toBe("사원");
    expect(itemRows.length).toBe(result.data.snapshot.lines.length);
  });

  it(
    "should refresh the latest allowance result when an entry is re-approved",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: createTestRoot(),
        templateVariant: "sample1"
      });
      const firstDetail = await syncPreparedReturnedSchedule(fixture);
      const firstOvertimeEntry = firstDetail.entries.find((entry) => entry.section === "overtime");

      expect(firstOvertimeEntry).toBeDefined();

      for (const entry of firstDetail.entries) {
        await approvePerformanceFile(
          {
            fileId: firstDetail.id,
            entryId: entry.id
          },
          testAdminSession,
          {
            userDataPath: fixture.userDataPath
          }
        );
      }

      const initialOvertimeResult = listApprovedAllowanceCalculationResults().find(
        (record) => record.entryId === firstOvertimeEntry!.id
      );

      expect(initialOvertimeResult).toBeDefined();

      const earlyPayoutResult = await setAllowanceCalculationEarlyPayout({
        calculationId: initialOvertimeResult!.id,
        earlyPayoutDate: "2026-04-05"
      });

      expect(earlyPayoutResult.ok).toBe(true);
      if (!earlyPayoutResult.ok) {
        return;
      }
      expect(earlyPayoutResult.data.earlyPayoutDate).toBe("2026-04-05");
      expect(earlyPayoutResult.data.status).toBe("pending");

      await restageReturnedScheduleFixture(fixture);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(fixture.filePath);
      const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

      worksheet.getCell("BE34").value = 2;
      await workbook.xlsx.writeFile(fixture.filePath);

      const restagedDetail = await syncPreparedReturnedSchedule(fixture);
      const restagedOvertimeEntry = restagedDetail.entries.find(
        (entry) => entry.section === "overtime"
      );

      expect(restagedOvertimeEntry).toBeDefined();

      const reapproveResult = await approvePerformanceFile(
        {
          fileId: restagedDetail.id,
          entryId: restagedOvertimeEntry!.id,
          comment: "재승인 보정"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(reapproveResult.ok).toBe(true);

      const latestResults = listApprovedAllowanceCalculationResults();
      const refreshedOvertimeResult = latestResults.find(
        (record) => record.entryId === restagedOvertimeEntry!.id
      );

      expect(latestResults).toHaveLength(3);
      expect(refreshedOvertimeResult).toBeDefined();
      expect(refreshedOvertimeResult?.fileId).toBe(restagedDetail.id);
      expect(refreshedOvertimeResult?.id).not.toBe(initialOvertimeResult?.id);
      expect(refreshedOvertimeResult?.earlyPayoutDate).toBeUndefined();
      expect(refreshedOvertimeResult?.snapshot.totalAllowanceAmount).not.toBe(
        initialOvertimeResult?.snapshot.totalAllowanceAmount
      );
      expect(listAllowanceCalculationHistory()).toHaveLength(4);

      const historicalInitialResult = listAllowanceCalculationHistory().find(
        (record) => record.id === initialOvertimeResult!.id
      );
      expect(historicalInitialResult?.earlyPayoutDate).toBe("2026-04-05");
    },
    15000
  );

  it("should persist the early payout date for an allowance calculation", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const calculation = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });

    expect(calculation.ok).toBe(true);
    if (!calculation.ok) {
      return;
    }

    const updated = setAllowanceCalculationEarlyPayout({
      calculationId: calculation.data.id,
      earlyPayoutDate: "2026-04-05"
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    expect(updated.data.earlyPayoutDate).toBe("2026-04-05");

    const database = getSqliteDatabase();
    const stored = database!.prepare(`
      SELECT early_payout_date
      FROM allowance_calculations
      WHERE id = ?
    `).get(calculation.data.id) as { early_payout_date: string } | undefined;

    expect(stored?.early_payout_date).toBe("2026-04-05");
  });

  it("rolls back allowance items when deleting the calculation summary fails", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    const approveResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: overtimeEntry!.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );
    expect(approveResult.ok).toBe(true);

    const calcResult = await runApprovedAllowanceCalculation({ entryId: overtimeEntry!.id });
    expect(calcResult.ok).toBe(true);
    if (!calcResult.ok) {
      return;
    }

    const calculationId = calcResult.data.id;
    const approvalId = calcResult.data.snapshot.performanceApprovalId;
    expect(approvalId).toBeDefined();

    const database = getSqliteDatabase();
    expect(database).not.toBeNull();
    const db = database!;

    const initialSummary = db
      .prepare(`SELECT * FROM allowance_calculations WHERE id = ?`)
      .get(calculationId) as Record<string, unknown> | undefined;
    expect(initialSummary).toBeDefined();

    const initialItems = db
      .prepare(`SELECT * FROM allowance_calculation_items WHERE calculation_id = ? ORDER BY id ASC`)
      .all(calculationId) as Array<Record<string, unknown>>;
    expect(initialItems.length).toBeGreaterThan(0);
    expect(initialItems.length).toBe(calcResult.data.snapshot.lines.length);

    db.exec(`
      CREATE TRIGGER fail_allowance_calculation_summary_delete
      BEFORE DELETE ON allowance_calculations
      WHEN OLD.id = '${calculationId}'
      BEGIN
        SELECT RAISE(ABORT, 'allowance calculation delete failed for test');
      END;
    `);

    try {
      expect(() => deleteAllowanceCalculationByApprovalId(approvalId)).toThrow(
        "allowance calculation delete failed for test"
      );
      expect(db.isTransaction).toBe(false);

      const afterFailSummary = db
        .prepare(`SELECT * FROM allowance_calculations WHERE id = ?`)
        .get(calculationId) as Record<string, unknown> | undefined;
      expect(afterFailSummary).toEqual(initialSummary);

      const afterFailItems = db
        .prepare(`SELECT * FROM allowance_calculation_items WHERE calculation_id = ? ORDER BY id ASC`)
        .all(calculationId) as Array<Record<string, unknown>>;
      expect(afterFailItems).toEqual(initialItems);

      const latestAfterFail = getLatestAllowanceCalculationByApprovalId(approvalId);
      expect(latestAfterFail).not.toBeNull();
      expect(latestAfterFail?.id).toBe(calculationId);
      expect(latestAfterFail?.snapshot.lines).toEqual(calcResult.data.snapshot.lines);
    } finally {
      db.exec("DROP TRIGGER IF EXISTS fail_allowance_calculation_summary_delete;");
    }

    expect(() => deleteAllowanceCalculationByApprovalId(approvalId)).not.toThrow();
    expect(db.isTransaction).toBe(false);

    const finalSummary = db
      .prepare(`SELECT * FROM allowance_calculations WHERE id = ?`)
      .get(calculationId);
    expect(finalSummary).toBeUndefined();

    const finalItems = db
      .prepare(`SELECT * FROM allowance_calculation_items WHERE calculation_id = ?`)
      .all(calculationId);
    expect(finalItems).toHaveLength(0);

    const finalLatest = getLatestAllowanceCalculationByApprovalId(approvalId);
    expect(finalLatest).toBeNull();
  });
});
