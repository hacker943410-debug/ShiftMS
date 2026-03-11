import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AuthSession } from "../../shared/domain/model";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest,
  runApprovedAllowanceCalculation
} from "./approved-allowance-calculation-service";
import { listPendingPerformanceFiles } from "./performance-queue-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const session: AuthSession = {
  userId: "user-admin",
  loginId: "admin",
  role: "admin",
  displayName: "관리자",
  expiresAt: "2026-03-11T18:00:00+09:00",
  sessionToken: "session-token"
};

describe("approved-allowance-calculation-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetSqliteStorageForTest();
  });

  it("should run allowance calculation for an approved file", async () => {
    const target = (await listPendingPerformanceFiles()).find(
      (item) => item.fileName === "별첨1_샘플.xlsx"
    );

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    await approvePerformanceFile(
      {
        fileId: target.id
      },
      session
    );

    const result = await runApprovedAllowanceCalculation(target.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.fileId).toBe(target.id);
    expect(result.data.rateVersionId).toMatch(/^rate-\d{4}-\d$/);
    expect(result.data.rateVersionLabel).toMatch(/^\d{4}\.\d$/);
    expect(result.data.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });

  it("should return the same stored result for duplicate runs", async () => {
    const target = (await listPendingPerformanceFiles()).find(
      (item) => item.fileName === "별첨1_샘플.xlsx"
    );

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    await approvePerformanceFile(
      {
        fileId: target.id
      },
      session
    );

    const first = await runApprovedAllowanceCalculation(target.id);
    const second = await runApprovedAllowanceCalculation(target.id);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(second.data.id).toBe(first.data.id);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(1);
  });

  it("should reject calculation when the file is not approved", async () => {
    const target = (await listPendingPerformanceFiles()).find(
      (item) => item.fileName === "별첨1_샘플.xlsx"
    );

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    const result = await runApprovedAllowanceCalculation(target.id);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errorCode).toBe("ALLOWANCE_APPROVAL_REQUIRED");
  });

  it("should persist calculation summary and items in sqlite when storage is initialized", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "allowance-calc.test.sqlite")
    });

    const target = (await listPendingPerformanceFiles()).find(
      (item) => item.fileName === "별첨1_샘플.xlsx"
    );

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    await approvePerformanceFile(
      {
        fileId: target.id
      },
      session
    );

    const result = await runApprovedAllowanceCalculation(target.id);

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
