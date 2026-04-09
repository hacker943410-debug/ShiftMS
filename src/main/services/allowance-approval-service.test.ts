import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest,
  updateAllowanceCalculationStatus
} from "./approved-allowance-calculation-service";
import {
  resetAllowanceApprovalStateForTest,
  reviewAllowanceCalculations
} from "./allowance-approval-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  getStoredPerformanceFileDetail,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import { listPerformanceOverview } from "./performance-management-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "allowance-approval");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

describe("allowance-approval-service", () => {
  afterEach(() => {
    resetAllowanceApprovalStateForTest();
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should reject a site from allowance management and move the approved performance file back to pending", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const approvalResult = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(approvalResult.ok).toBe(true);
    }

    const calculations = listApprovedAllowanceCalculationResults();
    expect(calculations).toHaveLength(3);
    expect(calculations.every((record) => record.status === "pending")).toBe(true);

    const approveResult = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((record) => record.id),
        decision: "approved"
      },
      testAdminSession
    );

    expect(approveResult.ok).toBe(true);
    expect(listApprovedAllowanceCalculationResults().every((record) => record.status === "approved")).toBe(
      true
    );

    const rejectResult = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((record) => record.id),
        decision: "rejected",
        comment: "현장 정정 요청",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(rejectResult.ok).toBe(true);

    const returnedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(returnedDetail?.directoryType).toBe("pending");
    expect(returnedDetail?.status).toBe("rejected");
    expect(returnedDetail?.filePath).toContain(fixture.pendingDir);
    expect(existsSync(returnedDetail?.filePath ?? "")).toBe(true);

    const rejectedResults = listApprovedAllowanceCalculationResults();
    expect(rejectedResults).toHaveLength(3);
    expect(rejectedResults.every((record) => record.status === "rejected")).toBe(true);

    const pendingOverview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(pendingOverview.rowCount).toBe(3);
    expect(pendingOverview.reapprovalFiles).toHaveLength(1);
    expect(pendingOverview.reapprovalFiles[0]).toMatchObject({
      resolvedApprovedEntryCount: 0,
      reapprovalPendingCount: 3
    });
    expect(pendingOverview.groups[0]?.rows.every((row) => row.reapprovalStatus === "pending")).toBe(
      true
    );

    const approvedOverview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(approvedOverview.rowCount).toBe(0);
    expect(approvedOverview.groups).toHaveLength(0);
  });

  it("should keep site rejection when the approved performance file is missing", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const approvalResult = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(approvalResult.ok).toBe(true);
    }

    const approvedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(approvedDetail?.directoryType).toBe("approved");
    expect(existsSync(approvedDetail?.filePath ?? "")).toBe(true);

    unlinkSync(approvedDetail!.filePath);

    const calculations = listApprovedAllowanceCalculationResults();
    const rejectResult = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((record) => record.id),
        decision: "rejected",
        comment: "승인완료 파일 없음",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(rejectResult.ok).toBe(true);

    const returnedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(returnedDetail?.directoryType).toBe("pending");
    expect(returnedDetail?.status).toBe("rejected");
    expect(returnedDetail?.filePath).toContain(fixture.pendingDir);
    expect(existsSync(returnedDetail?.filePath ?? "")).toBe(false);
    expect(listApprovedAllowanceCalculationResults().every((record) => record.status === "rejected")).toBe(
      true
    );
  });

  it("should require a comment when a site rejection syncs performance back to pending", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const approvalResult = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(approvalResult.ok).toBe(true);
    }

    const calculations = listApprovedAllowanceCalculationResults();
    const rejectResult = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((record) => record.id),
        decision: "rejected",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(rejectResult.ok).toBe(false);
    if (rejectResult.ok) {
      throw new Error("근무지 반려 사유 없이 반려가 완료되었습니다.");
    }
    expect(rejectResult.errorCode).toBe("ALLOWANCE_REVIEW_COMMENT_REQUIRED");
    expect(rejectResult.message).toBe("근무지 반려 사유를 입력해 주세요.");

    const currentDetail = getStoredPerformanceFileDetail(detail.id);

    expect(currentDetail?.directoryType).toBe("approved");
    expect(listApprovedAllowanceCalculationResults().every((record) => record.status === "pending")).toBe(
      true
    );
  });

  it("should keep proposal-approved rows locked when a site is rejected for reapproval", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const approvalResult = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(approvalResult.ok).toBe(true);
    }

    const calculations = listApprovedAllowanceCalculationResults();
    const lockedCalculation = calculations[0];
    const changeableCalculations = calculations.slice(1);

    expect(lockedCalculation).toBeDefined();
    expect(changeableCalculations).toHaveLength(2);

    updateAllowanceCalculationStatus({
      calculationId: lockedCalculation!.id,
      status: "proposal-approved"
    });

    const rejectResult = await reviewAllowanceCalculations(
      {
        calculationIds: changeableCalculations.map((record) => record.id),
        decision: "rejected",
        comment: "품의 미마감 건 정정",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(rejectResult.ok).toBe(true);

    const returnedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(returnedDetail?.directoryType).toBe("pending");
    expect(returnedDetail?.status).toBe("rejected");

    const rejectedResults = listApprovedAllowanceCalculationResults();
    expect(rejectedResults.find((record) => record.id === lockedCalculation!.id)?.status).toBe(
      "proposal-approved"
    );
    expect(
      rejectedResults
        .filter((record) => changeableCalculations.some((item) => item.id === record.id))
        .every((record) => record.status === "rejected")
    ).toBe(true);

    const pendingOverview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const lockedRow = pendingOverview.groups[0]?.rows.find(
      (row) => row.latestApprovalId === lockedCalculation!.snapshot.performanceApprovalId
    );
    const changeableRows = pendingOverview.groups[0]?.rows.filter((row) => !row.isChangeLocked) ?? [];

    expect(lockedRow).toBeDefined();
    expect(lockedRow?.isChangeLocked).toBe(true);
    expect(lockedRow?.reapprovalStatus).toBe("locked");
    expect(lockedRow?.canApprove).toBe(false);
    expect(changeableRows).toHaveLength(2);
    expect(pendingOverview.reapprovalFiles).toHaveLength(1);
    expect(pendingOverview.reapprovalFiles[0]).toMatchObject({
      entryCount: 3,
      resolvedApprovedEntryCount: 1,
      reapprovalPendingCount: 2,
      lockedEntryCount: 1
    });

    const lockedReapprovalResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: lockedRow!.entryId
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(lockedReapprovalResult.ok).toBe(false);
    if (lockedReapprovalResult.ok) {
      throw new Error("품의승인 완료 행이 재승인되었습니다.");
    }
    expect(lockedReapprovalResult.errorCode).toBe("PERFORMANCE_APPROVAL_BLOCKED");

    const approvedOverview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    expect(approvedOverview.rowCount).toBe(0);

    for (const row of changeableRows) {
      const reapproveResult = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: row.entryId
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(reapproveResult.ok).toBe(true);
    }

    const reapprovedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(reapprovedDetail?.directoryType).toBe("approved");
    expect(reapprovedDetail?.status).toBe("approved");

    const currentResults = listApprovedAllowanceCalculationResults();
    expect(currentResults).toHaveLength(3);
    expect(currentResults.find((record) => record.id === lockedCalculation!.id)?.status).toBe(
      "proposal-approved"
    );
    expect(currentResults.filter((record) => record.status === "pending")).toHaveLength(2);
  });

  it("should reapprove a rejected pending file and recreate pending allowance rows for the current cycle", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

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

    const rejectResult = await reviewAllowanceCalculations(
      {
        calculationIds: listApprovedAllowanceCalculationResults().map((record) => record.id),
        decision: "rejected",
        comment: "현장 정정 요청",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(rejectResult.ok).toBe(true);

    const rejectedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(rejectedDetail?.directoryType).toBe("pending");

    for (const entry of rejectedDetail?.entries ?? []) {
      const reapproveResult = await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(reapproveResult.ok).toBe(true);
    }

    const reapprovedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(reapprovedDetail?.directoryType).toBe("approved");
    expect(reapprovedDetail?.status).toBe("approved");
    expect(reapprovedDetail?.isEffective).toBe(true);
    expect(reapprovedDetail?.filePath).toContain(fixture.approvedDir);

    const currentResults = listApprovedAllowanceCalculationResults();
    expect(currentResults).toHaveLength(3);
    expect(currentResults.every((record) => record.fileId === detail.id)).toBe(true);
    expect(currentResults.every((record) => record.status === "pending")).toBe(true);
  });
});
