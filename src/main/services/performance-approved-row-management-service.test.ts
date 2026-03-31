import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { deleteAllowanceCalculationByApprovalId } from "./approved-allowance-calculation-service";
import { hideApprovedPerformanceOverviewRow } from "./performance-approved-row-management-service";
import { getPerformanceApprovalById, resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetHiddenApprovedPerformanceRowsForTest } from "./performance-approved-row-visibility-service";
import { listPerformanceOverview } from "./performance-management-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "performance-approved-row-management"
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

const approveAllRows = async (rootDir: string) => {
  const fixture = await prepareReturnedScheduleFixture({
    rootDir,
    templateVariant: "sample1"
  });
  const detail = await syncPreparedReturnedSchedule(fixture);

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

  return fixture;
};

describe("performance-approved-row-management-service", () => {
  afterEach(() => {
    resetHiddenApprovedPerformanceRowsForTest();
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("blocks hiding approved rows that already have allowance history", async () => {
    const fixture = await approveAllRows(createTestRoot());
    const overview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const approvedRow = overview.groups[0]?.rows[0];

    expect(approvedRow?.latestApprovalId).toBeTruthy();

    const result = hideApprovedPerformanceOverviewRow(
      {
        approvalId: approvedRow!.latestApprovalId!
      },
      testAdminSession
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("PERFORMANCE_ALLOWANCE_HISTORY_EXISTS");
    }
  });

  it("hides only the approved list row when no allowance history is linked", async () => {
    const fixture = await approveAllRows(createTestRoot());
    const beforeOverview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const targetRow = beforeOverview.groups[0]?.rows.find((row) => row.entry.section === "substitute");

    expect(targetRow?.latestApprovalId).toBeTruthy();
    deleteAllowanceCalculationByApprovalId(targetRow!.latestApprovalId!);

    const result = hideApprovedPerformanceOverviewRow(
      {
        approvalId: targetRow!.latestApprovalId!
      },
      testAdminSession
    );

    expect(result.ok).toBe(true);
    expect(getPerformanceApprovalById(targetRow!.latestApprovalId!)).not.toBeNull();

    const afterOverview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(afterOverview.rowCount).toBe(beforeOverview.rowCount - 1);
    expect(
      afterOverview.groups.flatMap((group) => group.rows).some((row) => row.logicalKey === targetRow?.logicalKey)
    ).toBe(false);
  });
});
