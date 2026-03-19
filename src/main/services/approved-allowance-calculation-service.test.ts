import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest,
  runApprovedAllowanceCalculation
} from "./approved-allowance-calculation-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "approved-allowance-calculation");

describe("approved-allowance-calculation-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should calculate an approved overtime entry from the approval snapshot", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
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
    expect(result.data.hourlyRate).toBe(14100);
    expect(result.data.snapshot.breakdown.totalWorkMinutes).toBe(240);
    expect(result.data.snapshot.breakdown.nightMinutes).toBe(120);
    expect(result.data.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });

  it("should return the stored calculation for duplicate runs of the same approved entry", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
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
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(1);
  });

  it("should persist the calculation summary and line items in sqlite", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
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
      SELECT total_allowance_amount
      FROM allowance_calculations
      WHERE id = ?
    `).get(result.data.id) as { total_allowance_amount: number } | undefined;
    const itemRows = database!.prepare(`
      SELECT allowance_code, amount
      FROM allowance_calculation_items
      WHERE calculation_id = ?
      ORDER BY allowance_code ASC
    `).all(result.data.id) as Array<{ allowance_code: string; amount: number }>;

    expect(summaryRow?.total_allowance_amount).toBe(result.data.snapshot.totalAllowanceAmount);
    expect(itemRows.length).toBe(result.data.snapshot.lines.length);
  });
});
