import { copyFileSync, existsSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest,
  setAllowanceCalculationEarlyPayout,
  updateAllowanceCalculationStatus
} from "./approved-allowance-calculation-service";
import {
  listAllowanceApprovalHistory,
  resetAllowanceApprovalStateForTest,
  reviewAllowanceCalculations
} from "./allowance-approval-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { restoreApprovedPerformanceFileToPending } from "./performance-file-archive-service";
import {
  getStoredPerformanceFileDetail,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import { listPerformanceOverview } from "./performance-management-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

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

  it("should move a pending performance file to approved when approving allowance results", async () => {
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
        testAdminSession
      );

      expect(approvalResult.ok).toBe(true);
    }

    const pendingDetail = getStoredPerformanceFileDetail(detail.id);
    expect(pendingDetail?.directoryType).toBe("pending");
    expect(pendingDetail?.approvedEntryCount).toBe(3);

    const calculations = listApprovedAllowanceCalculationResults();
    const approveResult = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((record) => record.id),
        decision: "approved"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(approveResult.ok).toBe(true);

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(archivedDetail?.directoryType).toBe("approved");
    expect(archivedDetail?.status).toBe("approved");
    expect(archivedDetail?.filePath).toContain(fixture.approvedDir);
    expect(existsSync(archivedDetail?.filePath ?? "")).toBe(true);
    // The allowance-approval archive path must leave the file in-use (is_effective=1) atomically;
    // a dangling non-atomic caller could leave it archived-but-non-effective (invisible to payroll).
    expect(archivedDetail?.isEffective).toBe(true);
    expect(listApprovedAllowanceCalculationResults().every((record) => record.status === "approved")).toBe(
      true
    );
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

  it("should block site rejection when a proposal-approved row exists in the same site closeout", async () => {
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

    expect(rejectResult.ok).toBe(false);
    if (rejectResult.ok) {
      throw new Error("품의승인 완료 근무지가 반려되었습니다.");
    }
    expect(rejectResult.errorCode).toBe("ALLOWANCE_SITE_REJECT_PROPOSAL_APPROVED");
    expect(rejectResult.message).toBe("품의 승인으로 마감된 근무지는 근무지 반려를 할 수 없습니다.");

    const currentDetail = getStoredPerformanceFileDetail(detail.id);
    expect(currentDetail?.directoryType).toBe("approved");
    expect(currentDetail?.status).toBe("approved");

    const currentResults = listApprovedAllowanceCalculationResults();
    expect(currentResults.find((record) => record.id === lockedCalculation!.id)?.status).toBe(
      "proposal-approved"
    );
    expect(
      currentResults
        .filter((record) => changeableCalculations.some((item) => item.id === record.id))
        .every((record) => record.status === "pending")
    ).toBe(true);

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
    expect(approvedOverview.rowCount).toBe(3);
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

  it("should recognize an externally returned approved file as a rejected reapproval cycle", async () => {
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
    expect(approvedDetail?.filePath).toContain(fixture.approvedDir);

    const rejectAllowanceOnlyResult = await reviewAllowanceCalculations(
      {
        calculationIds: listApprovedAllowanceCalculationResults().map((record) => record.id),
        decision: "rejected",
        comment: "수당 반려 후 파일 수동 이동"
      },
      testAdminSession
    );

    expect(rejectAllowanceOnlyResult.ok).toBe(true);

    const returnedPath = path.resolve(fixture.pendingDir, path.basename(approvedDetail!.filePath));
    renameSync(approvedDetail!.filePath, returnedPath);

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

    const legalHolidayRow = pendingOverview.groups
      .flatMap((group) => group.rows)
      .find((row) => row.entry.section === "legal-holiday");

    expect(legalHolidayRow).toBeDefined();

    const reapproveResult = await approvePerformanceFile(
      {
        fileId: legalHolidayRow!.fileId,
        entryId: legalHolidayRow!.entryId
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(reapproveResult.ok).toBe(true);
  });

  it("should keep legal holiday rows available across repeated reject and reapproval cycles", async () => {
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

    for (const cycle of [1, 2]) {
      const allowanceApproveResult = await reviewAllowanceCalculations(
        {
          calculationIds: listApprovedAllowanceCalculationResults().map((record) => record.id),
          decision: "approved"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(allowanceApproveResult.ok).toBe(true);

      const rejectResult = await reviewAllowanceCalculations(
        {
          calculationIds: listApprovedAllowanceCalculationResults().map((record) => record.id),
          decision: "rejected",
          comment: `현장 정정 요청 ${cycle}`,
          syncPerformanceSiteReject: true
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(rejectResult.ok).toBe(true);

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
      const rows = pendingOverview.groups.flatMap((group) => group.rows);

      expect(rows).toHaveLength(3);
      expect(rows.some((row) => row.entry.section === "legal-holiday")).toBe(true);
      expect(pendingOverview.reapprovalFiles[0]).toMatchObject({
        resolvedApprovedEntryCount: 0,
        reapprovalPendingCount: 3
      });

      for (const row of rows) {
        const reapproveResult = await approvePerformanceFile(
          {
            fileId: row.fileId,
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
    }
  });
});

// G28: "수당 관리 → 근무지 승인" archived a 승인대기 file on a file-level counter alone, walking past
// the two gates the 실적 확정 button holds. The same gate is asked here now, and an allowance
// approval that would need a reapproval first is refused before anything is written.
describe("allowance-approval-service · performance archive gate (G28)", () => {
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

  const writeOvertimeEndHour = async (filePath: string, endHour: number) => {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = endHour;
    await workbook.xlsx.writeFile(filePath);
  };

  const approveEveryRow = async (
    fixture: Awaited<ReturnType<typeof prepareReturnedScheduleFixture>>,
    fileId: string,
    options?: { archive?: boolean }
  ) => {
    const detail = getStoredPerformanceFileDetail(fileId);

    expect(detail).toBeDefined();

    for (const entry of detail!.entries) {
      const result = await approvePerformanceFile(
        { fileId, entryId: entry.id },
        testAdminSession,
        options?.archive === false ? undefined : { userDataPath: fixture.userDataPath }
      );

      if (!result.ok) {
        throw new Error(`${result.errorCode}: ${result.message}`);
      }
    }
  };

  // 승인완료까지 갔다가 근무지 반려로 승인대기(반려)로 돌아온 상태.
  const prepareReturnedSite = async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    await approveEveryRow(fixture, detail.id);

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
    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("pending");
    expect(getStoredPerformanceFileDetail(detail.id)?.status).toBe("rejected");

    return { detail, fixture };
  };

  it("should refuse to approve allowance for a returned site before its performance is re-approved", async () => {
    const { detail, fixture } = await prepareReturnedSite();

    const approveResult = await reviewAllowanceCalculations(
      {
        calculationIds: listApprovedAllowanceCalculationResults().map((record) => record.id),
        decision: "approved"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(approveResult.ok).toBe(false);
    if (approveResult.ok) {
      throw new Error("재승인 전에 수당 근무지 승인이 통과했습니다.");
    }
    expect(approveResult.errorCode).toBe("ALLOWANCE_APPROVE_REAPPROVAL_PENDING");
    expect(approveResult.message).toContain(fixture.siteName);

    // Refused before anything was written: the file and every allowance row stay as they were.
    const currentDetail = getStoredPerformanceFileDetail(detail.id);

    expect(currentDetail?.directoryType).toBe("pending");
    expect(currentDetail?.status).toBe("rejected");
    expect(currentDetail?.filePath).toContain(fixture.pendingDir);
    expect(
      listApprovedAllowanceCalculationResults().every((record) => record.status === "rejected")
    ).toBe(true);
  });

  it("should archive the returned file from the allowance approval once every row was re-approved", async () => {
    const { detail, fixture } = await prepareReturnedSite();

    // Re-approved without an archive path, so the file is still 승인대기 when the allowance is
    // approved - the catch-up archive this path exists for.
    await approveEveryRow(fixture, detail.id, { archive: false });

    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("pending");

    const approveResult = await reviewAllowanceCalculations(
      {
        calculationIds: listApprovedAllowanceCalculationResults().map((record) => record.id),
        decision: "approved"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(approveResult.ok).toBe(true);

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);

    expect(archivedDetail?.directoryType).toBe("approved");
    expect(archivedDetail?.status).toBe("approved");
    expect(archivedDetail?.isEffective).toBe(true);
  });

  it("should refuse when the returned file was overwritten with a correction nobody re-approved", async () => {
    const { detail, fixture } = await prepareReturnedSite();

    await approveEveryRow(fixture, detail.id, { archive: false });

    // 정정본 덮어쓰기: 같은 이름으로 다시 올라오고, 그대로 다시 읽힌다.
    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 2);

    const correctedDetail = await syncPreparedReturnedSchedule(fixture);

    expect(correctedDetail.id).toBe(detail.id);

    const approveResult = await reviewAllowanceCalculations(
      {
        calculationIds: listApprovedAllowanceCalculationResults().map((record) => record.id),
        decision: "approved"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(approveResult.ok).toBe(false);
    if (approveResult.ok) {
      throw new Error("재승인되지 않은 정정본이 수당 승인으로 보관되었습니다.");
    }
    expect(approveResult.errorCode).toBe("ALLOWANCE_APPROVE_REAPPROVAL_PENDING");
    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("pending");
  });

  it("should keep the existing approved copy in use when a first-time file's allowance is approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    await approveEveryRow(fixture, firstDetail.id);

    expect(getStoredPerformanceFileDetail(firstDetail.id)?.directoryType).toBe("approved");

    await restageReturnedScheduleFixture(fixture);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    expect(secondDetail.id).not.toBe(firstDetail.id);

    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    // Makes the second file cover people the approved copy never covered - a genuinely new file for
    // the same 근무지·월, not a correction of the first one. Only the row identity is retouched, so
    // the amounts and the approval history stay untouched.
    database
      .prepare(
        "UPDATE performance_entries SET logical_key = logical_key || '|second' WHERE performance_file_id = ?"
      )
      .run(secondDetail.id);

    await approveEveryRow(fixture, secondDetail.id);

    // The approve flow already refuses to auto-archive over the existing approved copy.
    expect(getStoredPerformanceFileDetail(secondDetail.id)?.directoryType).toBe("pending");

    const secondFileCalculations = listApprovedAllowanceCalculationResults().filter(
      (record) => record.fileId === secondDetail.id
    );

    expect(secondFileCalculations).toHaveLength(3);

    const approveResult = await reviewAllowanceCalculations(
      {
        calculationIds: secondFileCalculations.map((record) => record.id),
        decision: "approved"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    // The allowance approval itself stands - only the archive is skipped, and nothing is rolled back.
    expect(approveResult.ok).toBe(true);
    expect(
      listApprovedAllowanceCalculationResults()
        .filter((record) => record.fileId === secondDetail.id)
        .every((record) => record.status === "approved")
    ).toBe(true);
    expect(getStoredPerformanceFileDetail(secondDetail.id)?.directoryType).toBe("pending");
    expect(getStoredPerformanceFileDetail(firstDetail.id)?.directoryType).toBe("approved");
    expect(getStoredPerformanceFileDetail(firstDetail.id)?.isEffective).toBe(true);
  });

  // The automatic archive is the third door out of a reapproval file: once every eligible row is
  // counted as approved the file leaves 승인대기 with no finalize and no allowance approval. It has to
  // ask the same question the other two doors ask, or the workbook can be edited between the last
  // two approvals and the stale amounts get frozen through the one door that never looked.
  it("should keep a returned file in place when a row went stale between re-approvals", async () => {
    const { detail, fixture } = await prepareReturnedSite();

    // BE34 is the overtime end hour, so the row that must go stale is the overtime one.
    const firstEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(firstEntry).toBeDefined();

    const firstApproval = await approvePerformanceFile(
      { fileId: detail.id, entryId: firstEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(firstApproval.ok).toBe(true);

    // The operator edits the same workbook before finishing the remaining rows.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeOvertimeEndHour(fixture.filePath, 3);

    const editedDetail = await syncPreparedReturnedSchedule(fixture);

    // Same file, same cycle - only the rows moved underneath the approval that already happened.
    expect(editedDetail.id).toBe(detail.id);

    const staleEntry = editedDetail.entries.find(
      (entry) => entry.logicalKey === firstEntry!.logicalKey
    );

    expect(staleEntry).toBeDefined();

    for (const entry of editedDetail.entries) {
      if (entry.logicalKey === firstEntry!.logicalKey) {
        continue;
      }

      const result = await approvePerformanceFile(
        { fileId: editedDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    // The stale row is not settled, so the count never reaches the eligible total and the file stays
    // where the operator can still re-approve it.
    const afterDetail = getStoredPerformanceFileDetail(editedDetail.id);

    expect(afterDetail?.directoryType).toBe("pending");
    expect(afterDetail?.isEffective).toBe(false);
  });

  it("rolls back database and compensates moved files when second file move fails during site rejection", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    await approveEveryRow(fixture, detail.id);

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

    const firstDetail = getStoredPerformanceFileDetail(detail.id)!;
    expect(firstDetail.directoryType).toBe("approved");
    expect(firstDetail.status).toBe("approved");
    const firstApprovedPath = firstDetail.filePath;
    expect(existsSync(firstApprovedPath)).toBe(true);

    // Clone first approved file into a second approved performance file
    const secondFileId = `second-file-${randomUUID()}`;
    const secondApprovedPath = path.resolve(
      path.dirname(firstApprovedPath),
      "second-approved-performance.xlsx"
    );
    copyFileSync(firstApprovedPath, secondApprovedPath);

    const database = getSqliteDatabase()!;
    const row = database
      .prepare("SELECT * FROM performance_files WHERE id = ?")
      .get(detail.id) as Record<string, string | number | null>;

    database
      .prepare(`
        INSERT INTO performance_files (
          id, file_name, file_path, directory_type, template_kind, template_variant,
          sheet_name, row_count, column_count, file_size, modified_time_ms, duplicate_key,
          received_at, schedule_month, site_name, schedule_key, entry_count, approved_entry_count,
          warning_count, is_effective, completed_at, status, error_message, preview_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        secondFileId,
        path.basename(secondApprovedPath),
        secondApprovedPath,
        row.directory_type,
        row.template_kind,
        row.template_variant,
        row.sheet_name,
        row.row_count,
        row.column_count,
        row.file_size,
        row.modified_time_ms,
        `dup-key-${secondFileId}`,
        row.received_at,
        row.schedule_month,
        row.site_name,
        row.schedule_key,
        row.entry_count,
        row.approved_entry_count,
        row.warning_count,
        0,
        row.completed_at,
        row.status,
        row.error_message,
        row.preview_json
      );

    // Map one of the calculations to secondFileId so that rejecting the site affects both files
    database
      .prepare("UPDATE allowance_calculations SET file_id = ? WHERE id = ?")
      .run(secondFileId, calculations[calculations.length - 1]!.id);

    const beforeFirstDetail = getStoredPerformanceFileDetail(detail.id)!;
    const beforeSecondDetail = getStoredPerformanceFileDetail(secondFileId)!;
    const beforeCalculations = listApprovedAllowanceCalculationResults();

    expect(beforeFirstDetail.directoryType).toBe("approved");
    expect(beforeSecondDetail.directoryType).toBe("approved");
    expect(beforeCalculations.every((c) => c.status === "approved")).toBe(true);

    let moveCallCount = 0;
    const rejectResult = await reviewAllowanceCalculations(
      {
        calculationIds: beforeCalculations.map((record) => record.id),
        decision: "rejected",
        comment: "현장 정정 요청",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath,
        restoreApprovedPerformanceFileToPending: async (input) => {
          moveCallCount += 1;
          if (moveCallCount === 2) {
            throw new Error("테스트용 두 번째 파일 잠금");
          }
          return restoreApprovedPerformanceFileToPending(input);
        }
      }
    );

    // Required assertions:
    // 1. Return is ok: false with ALLOWANCE_REVIEW_SYNC_FAILED
    expect(rejectResult.ok).toBe(false);
    if (rejectResult.ok) {
      throw new Error("Expected rejectResult to be failed");
    }
    expect(rejectResult.errorCode).toBe("ALLOWANCE_REVIEW_SYNC_FAILED");
    expect(rejectResult.message).toContain("테스트용 두 번째 파일 잠금");

    // 2. Allowance calculation statuses are restored to pre-call status and no rejection approval history
    const afterCalculations = listApprovedAllowanceCalculationResults();
    expect(afterCalculations).toHaveLength(beforeCalculations.length);
    expect(afterCalculations.every((record) => record.status === "approved")).toBe(true);
    const histories = listAllowanceApprovalHistory();
    expect(histories.some((h) => h.decision === "rejected")).toBe(false);

    // 3. Both performance details preserve directoryType, status, filePath, isEffective
    const afterFirstDetail = getStoredPerformanceFileDetail(detail.id)!;
    const afterSecondDetail = getStoredPerformanceFileDetail(secondFileId)!;
    expect(afterFirstDetail.directoryType).toBe(beforeFirstDetail.directoryType);
    expect(afterFirstDetail.status).toBe(beforeFirstDetail.status);
    expect(afterFirstDetail.filePath).toBe(beforeFirstDetail.filePath);
    expect(afterFirstDetail.isEffective).toBe(beforeFirstDetail.isEffective);
    expect(afterSecondDetail.directoryType).toBe(beforeSecondDetail.directoryType);
    expect(afterSecondDetail.status).toBe(beforeSecondDetail.status);
    expect(afterSecondDetail.filePath).toBe(beforeSecondDetail.filePath);
    expect(afterSecondDetail.isEffective).toBe(beforeSecondDetail.isEffective);

    // 4. Both approved original files exist
    expect(existsSync(firstApprovedPath)).toBe(true);
    expect(existsSync(secondApprovedPath)).toBe(true);

    // 5. First file's pending moved copy does not remain
    const pendingFiles = readdirSync(fixture.pendingDir);
    expect(pendingFiles).toHaveLength(0);
  });

  it("rolls back database transaction and compensates moved files when performance DB update fails", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    await approveEveryRow(fixture, detail.id);

    const calculations = listApprovedAllowanceCalculationResults();
    expect(calculations).toHaveLength(3);

    const approveResult = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((record) => record.id),
        decision: "approved"
      },
      testAdminSession
    );
    expect(approveResult.ok).toBe(true);

    const beforeDetail = getStoredPerformanceFileDetail(detail.id)!;
    expect(beforeDetail.directoryType).toBe("approved");
    expect(beforeDetail.status).toBe("approved");
    const approvedPath = beforeDetail.filePath;
    expect(existsSync(approvedPath)).toBe(true);

    const beforeCalculations = listApprovedAllowanceCalculationResults();
    expect(beforeCalculations.every((record) => record.status === "approved")).toBe(true);

    const database = getSqliteDatabase()!;

    // Install TEMP trigger to force failure during performance DB row update
    database.exec(`
      CREATE TEMP TRIGGER trg_test_r43_db_failure
      BEFORE UPDATE OF directory_type ON performance_files
      FOR EACH ROW
      WHEN NEW.directory_type = 'pending'
      BEGIN
        SELECT RAISE(ABORT, 'R43 forced performance DB failure');
      END;
    `);

    try {
      // Call reviewAllowanceCalculations WITHOUT injected mover so that physical move happens first
      const rejectResult = await reviewAllowanceCalculations(
        {
          calculationIds: beforeCalculations.map((record) => record.id),
          decision: "rejected",
          comment: "현장 정정 요청",
          syncPerformanceSiteReject: true
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      // Assertions:
      // 1. Result is ok: false with ALLOWANCE_REVIEW_SYNC_FAILED and contains the forced error message
      expect(rejectResult.ok).toBe(false);
      if (rejectResult.ok) {
        throw new Error("Expected rejectResult to be failed");
      }
      expect(rejectResult.errorCode).toBe("ALLOWANCE_REVIEW_SYNC_FAILED");
      expect(rejectResult.message).toContain("R43 forced performance DB failure");

      // 2. database.isTransaction === false (no open transaction remaining)
      expect(database.isTransaction).toBe(false);

      // 3. Performance detail maintains snapshot state
      const afterDetail = getStoredPerformanceFileDetail(detail.id)!;
      expect(afterDetail.directoryType).toBe(beforeDetail.directoryType);
      expect(afterDetail.status).toBe(beforeDetail.status);
      expect(afterDetail.filePath).toBe(beforeDetail.filePath);
      expect(afterDetail.isEffective).toBe(beforeDetail.isEffective);

      // 4. File exists in original approved path and no file in pending directory
      expect(existsSync(approvedPath)).toBe(true);
      const pendingFiles = readdirSync(fixture.pendingDir);
      expect(pendingFiles).toHaveLength(0);

      // 5. Allowance calculation statuses are restored to pre-call status
      const afterCalculations = listApprovedAllowanceCalculationResults();
      expect(afterCalculations.every((record) => record.status === "approved")).toBe(true);

      // 6. No new rejected allowance approval history remains
      const afterHistories = listAllowanceApprovalHistory();
      expect(afterHistories.some((h) => h.decision === "rejected")).toBe(false);
    } finally {
      database.exec("DROP TRIGGER IF EXISTS trg_test_r43_db_failure;");
    }
  });

  it("should inherit early payout date on re-approval after site rejection and not resurrect cleared date", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    // 1. Approve all performance entries to generate initial 3 allowance calculations
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

    const initialCalculations = listApprovedAllowanceCalculationResults();
    expect(initialCalculations).toHaveLength(3);
    expect(initialCalculations.every((r) => r.status === "pending")).toBe(true);

    // 2. Select one target calculation and set early payout date to "2026-04-05"
    const targetCalculation = initialCalculations[0];
    const targetOriginalId = targetCalculation.id;
    const targetEntryId = targetCalculation.entryId;
    const otherCalculations = initialCalculations.slice(1);
    expect(otherCalculations).toHaveLength(2);

    const setPayoutResult = setAllowanceCalculationEarlyPayout({
      calculationId: targetOriginalId,
      earlyPayoutDate: "2026-04-05"
    });
    expect(setPayoutResult.ok).toBe(true);
    if (!setPayoutResult.ok) {
      return;
    }
    expect(setPayoutResult.data.earlyPayoutDate).toBe("2026-04-05");

    // 3. Approve all 3 allowance calculations, then site-reject with syncPerformanceSiteReject: true
    const firstAllowanceApproval = await reviewAllowanceCalculations(
      {
        calculationIds: initialCalculations.map((r) => r.id),
        decision: "approved"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );
    expect(firstAllowanceApproval.ok).toBe(true);

    const siteRejectResult = await reviewAllowanceCalculations(
      {
        calculationIds: initialCalculations.map((r) => r.id),
        decision: "rejected",
        comment: "현장 정정 요청",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );
    expect(siteRejectResult.ok).toBe(true);

    // 4. Check history: target calculation is rejected and preserves early payout date
    const historyAfterReject = listAllowanceCalculationHistory();
    const originalRecordInHistory = historyAfterReject.find((r) => r.id === targetOriginalId);
    expect(originalRecordInHistory).toBeDefined();
    expect(originalRecordInHistory?.status).toBe("rejected");
    expect(originalRecordInHistory?.earlyPayoutDate).toBe("2026-04-05");

    // 5. Re-approve all performance entries from the returned/pending file
    const returnedDetail = getStoredPerformanceFileDetail(detail.id);
    expect(returnedDetail).toBeDefined();
    expect(returnedDetail?.directoryType).toBe("pending");

    for (const entry of returnedDetail!.entries) {
      const reapproveResult = await approvePerformanceFile(
        {
          fileId: returnedDetail!.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
      expect(reapproveResult.ok).toBe(true);
    }

    // 6. Verify first re-approval calculations:
    // Latest calculations are 3, all pending.
    // Target calculation has a new ID, and earlyPayoutDate is inherited ("2026-04-05").
    // The other two calculations must have earlyPayoutDate === undefined.
    const reapprovedCalculations1 = listApprovedAllowanceCalculationResults();
    expect(reapprovedCalculations1).toHaveLength(3);
    expect(reapprovedCalculations1.every((r) => r.status === "pending")).toBe(true);

    const reapprovedTarget1 = reapprovedCalculations1.find((r) => r.entryId === targetEntryId);
    expect(reapprovedTarget1).toBeDefined();
    expect(reapprovedTarget1!.id).not.toBe(targetOriginalId);
    expect(reapprovedTarget1!.earlyPayoutDate).toBe("2026-04-05");

    const reapprovedOthers1 = reapprovedCalculations1.filter((r) => r.entryId !== targetEntryId);
    expect(reapprovedOthers1).toHaveLength(2);
    expect(reapprovedOthers1.every((r) => r.earlyPayoutDate === undefined)).toBe(true);

    // 7. Second cycle: Explicitly clear the early payout date from the reapproved target calculation
    const clearPayoutResult = setAllowanceCalculationEarlyPayout({
      calculationId: reapprovedTarget1!.id,
      earlyPayoutDate: null
    });
    expect(clearPayoutResult.ok).toBe(true);
    if (!clearPayoutResult.ok) {
      return;
    }
    expect(clearPayoutResult.data.earlyPayoutDate).toBeUndefined();

    // 8. Approve all 3 calculations again, site-reject, and re-approve all entries
    const secondAllowanceApproval = await reviewAllowanceCalculations(
      {
        calculationIds: reapprovedCalculations1.map((r) => r.id),
        decision: "approved"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );
    expect(secondAllowanceApproval.ok).toBe(true);

    const secondSiteReject = await reviewAllowanceCalculations(
      {
        calculationIds: reapprovedCalculations1.map((r) => r.id),
        decision: "rejected",
        comment: "2차 정정 요청",
        syncPerformanceSiteReject: true
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );
    expect(secondSiteReject.ok).toBe(true);

    const secondReturnedDetail = getStoredPerformanceFileDetail(detail.id);
    for (const entry of secondReturnedDetail!.entries) {
      const reapproveResult2 = await approvePerformanceFile(
        {
          fileId: secondReturnedDetail!.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
      expect(reapproveResult2.ok).toBe(true);
    }

    // 9. Second re-approval target calculation has a new ID, pending, and earlyPayoutDate === undefined
    const reapprovedCalculations2 = listApprovedAllowanceCalculationResults();
    expect(reapprovedCalculations2).toHaveLength(3);
    expect(reapprovedCalculations2.every((r) => r.status === "pending")).toBe(true);

    const reapprovedTarget2 = reapprovedCalculations2.find((r) => r.entryId === targetEntryId);
    expect(reapprovedTarget2).toBeDefined();
    expect(reapprovedTarget2!.id).not.toBe(reapprovedTarget1!.id);
    expect(reapprovedTarget2!.id).not.toBe(targetOriginalId);
    expect(reapprovedTarget2!.earlyPayoutDate).toBeUndefined();

    const reapprovedOthers2 = reapprovedCalculations2.filter((r) => r.entryId !== targetEntryId);
    expect(reapprovedOthers2).toHaveLength(2);
    expect(reapprovedOthers2.every((r) => r.earlyPayoutDate === undefined)).toBe(true);

    // 10. Verify that in history, the original record still has "2026-04-05", but it was NOT resurrected in the latest calculation
    const allHistories = listAllowanceCalculationHistory();
    const originalInFullHistory = allHistories.find((r) => r.id === targetOriginalId);
    expect(originalInFullHistory?.earlyPayoutDate).toBe("2026-04-05");
    const secondCyclePriorRecord = allHistories.find((r) => r.id === reapprovedTarget1!.id);
    expect(secondCyclePriorRecord?.status).toBe("rejected");
    expect(secondCyclePriorRecord?.earlyPayoutDate).toBeUndefined();
  });
});
