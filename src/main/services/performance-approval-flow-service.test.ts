import { existsSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest
} from "./approved-allowance-calculation-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile
} from "./performance-approval-flow-service";
import {
  getPerformanceApprovalHistoryByEntryId,
  getLatestPerformanceApprovalByEntryId,
  resetPerformanceApprovalStateForTest
} from "./performance-approval-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { listPendingPerformanceFiles } from "./performance-queue-service";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "performance-approval-flow");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

describe("performance-approval-flow-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should approve a single row while keeping the file pending until all rows are processed", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries[0];

    expect(targetEntry).toBeDefined();

    const result = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        comment: "1차 확인"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(result.ok).toBe(true);
    expect(getLatestPerformanceApprovalByEntryId(targetEntry!.id)?.decision).toBe("approved");
    expect(getStoredPerformanceFileDetail(detail.id)?.approvedEntryCount).toBe(1);
    expect(getStoredPerformanceFileDetail(detail.id)?.status).toBe("pending");
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(1);
    expect(listApprovedAllowanceCalculationResults()[0]?.entryId).toBe(targetEntry!.id);

    const pendingItems = await listPendingPerformanceFiles();

    expect(pendingItems).toHaveLength(1);
    expect(pendingItems[0]?.approvedEntryCount).toBe(1);
  });

  it("should ignore pool substitute rows for approval progress and allowance results", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "Pool"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const visibleEntries = detail.entries.filter((entry) => entry.section !== "substitute");

    expect(detail.entryCount).toBe(2);
    expect(detail.entries.find((entry) => entry.section === "substitute")?.isPoolWorker).toBe(true);

    for (const entry of visibleEntries) {
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

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);

    expect(archivedDetail?.directoryType).toBe("approved");
    expect(archivedDetail?.status).toBe("approved");
    expect(archivedDetail?.approvedEntryCount).toBe(2);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(2);
    expect(
      listApprovedAllowanceCalculationResults().some((item) => item.workType === "substitute")
    ).toBe(false);
  });

  it("should still block an identical duplicate approval for the same entry", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry).toBeDefined();

    const firstResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(firstResult.ok).toBe(true);

    const duplicateResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(duplicateResult.ok).toBe(false);
    if (duplicateResult.ok) {
      throw new Error("중복 승인 요청이 성공하면 안 됩니다.");
    }
    expect(duplicateResult.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
  });

  it("should allow reapproval for the same pending entry when a manual hourly rate is newly assigned", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry).toBeDefined();

    const firstResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(firstResult.ok).toBe(true);

    const reapproveResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        comment: "재승인 보정",
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(reapproveResult.ok).toBe(true);

    const approvalHistory = getPerformanceApprovalHistoryByEntryId(targetEntry!.id);
    const calculations = listApprovedAllowanceCalculationResults().filter(
      (item) => item.entryId === targetEntry!.id
    );

    expect(approvalHistory).toHaveLength(2);
    expect(
      approvalHistory.some(
        (record) =>
          record.comment?.includes("재승인 보정") && record.comment.includes("시급 임의지정 15,500원")
      )
    ).toBe(true);
    expect(calculations.some((item) => item.hourlyRate === 15500)).toBe(true);
  });

  it("should archive the file and mark it effective after every parsed row is approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
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

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);

    expect(archivedDetail?.directoryType).toBe("approved");
    expect(archivedDetail?.status).toBe("approved");
    expect(archivedDetail?.isEffective).toBe(true);
    expect(archivedDetail?.approvedEntryCount).toBe(detail.entries.length);
    expect(archivedDetail?.filePath).toContain(path.resolve(fixture.approvedDir, "2026년", "3월"));
    expect(existsSync(archivedDetail?.filePath ?? "")).toBe(true);
  });

  it("should keep a fully re-approved pending file in place until the operator finalizes it", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

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

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    expect(secondDetail.id).not.toBe(firstDetail.id);
    expect(secondDetail.alerts.some((alert) => alert.message.includes("파일이 이미"))).toBe(true);
    let successfulReapprovals = 0;

    for (const entry of secondDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: secondDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      if (result.ok) {
        successfulReapprovals += 1;
        continue;
      }

      expect(result.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
    }

    expect(successfulReapprovals).toBeGreaterThan(0);

    const allDetails = listStoredPerformanceFileDetails().filter(
      (item) => item.scheduleMonth === "2026-03" && item.siteName === "보라매DC"
    );
    const firstApproved = allDetails.find((item) => item.id === firstDetail.id);
    const secondApproved = allDetails.find((item) => item.id === secondDetail.id);

    expect(allDetails).toHaveLength(2);
    expect(firstApproved?.status).toBe("approved");
    expect(firstApproved?.isEffective).toBe(true);
    expect(secondApproved?.directoryType).toBe("pending");
    expect(secondApproved?.status).toBe("pending");
    expect(secondApproved?.isEffective).toBe(false);
  });

  it("should finalize a reapproval file even when some rows were not individually re-approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: firstDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    const reapproveResult = await approvePerformanceFile(
      {
        fileId: secondDetail.id,
        entryId: overtimeEntry!.id,
        comment: "재승인 보정"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(reapproveResult.ok).toBe(true);

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      {
        fileId: secondDetail.id
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(finalizeResult.ok).toBe(true);
    if (!finalizeResult.ok) {
      throw new Error(finalizeResult.message);
    }

    const allDetails = listStoredPerformanceFileDetails().filter(
      (item) => item.scheduleMonth === "2026-03" && item.siteName === "보라매DC"
    );
    const firstApproved = allDetails.find((item) => item.id === firstDetail.id);
    const secondApproved = allDetails.find((item) => item.id === secondDetail.id);

    expect(firstApproved?.status).toBe("approved");
    expect(firstApproved?.isEffective).toBe(false);
    expect(secondApproved?.directoryType).toBe("approved");
    expect(secondApproved?.status).toBe("approved");
    expect(secondApproved?.isEffective).toBe(true);
    expect(secondApproved?.filePath).toContain(path.resolve(fixture.approvedDir, "2026년", "3월"));
    expect(existsSync(secondApproved?.filePath ?? "")).toBe(true);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === secondDetail.id)
    ).toHaveLength(1);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === firstDetail.id)
    ).toHaveLength(2);
  });

  it("should allow reapproval with a manually assigned hourly rate and keep the note in approval history", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare(`
      UPDATE wage_rates
      SET effective_from = '2026-03-21',
          effective_to = NULL
    `).run();

    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry).toBeDefined();

    const result = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        comment: "재승인 보정",
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(result.ok).toBe(true);

    const approval = getLatestPerformanceApprovalByEntryId(targetEntry!.id);

    expect(approval?.comment).toContain("재승인 보정");
    expect(approval?.comment).toContain("시급 임의지정 15,500원");

    const calculation = listApprovedAllowanceCalculationResults()[0];

    expect(calculation?.entryId).toBe(targetEntry!.id);
    expect(calculation?.hourlyRate).toBe(15500);
    expect(calculation?.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });

  it("should allow reapproval with a manual hourly rate even when the restaged row reports missing wage information", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        {
          fileId: firstDetail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const restagedDetail = await syncPreparedReturnedSchedule(fixture);
    const reapprovalEntry = restagedDetail.entries.find((entry) => entry.section === "overtime");

    expect(reapprovalEntry).toBeDefined();

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare(`
      UPDATE performance_entries
      SET hourly_rate = NULL,
          alert_json = ?
      WHERE id = ?
    `).run(
      JSON.stringify([
        {
          severity: "error",
          message: `${reapprovalEntry!.employeeName}의 시급 정보가 없습니다.`
        }
      ]),
      reapprovalEntry!.id
    );

    const result = await approvePerformanceFile(
      {
        fileId: restagedDetail.id,
        entryId: reapprovalEntry!.id,
        comment: "재승인 보정",
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(result.ok).toBe(true);

    const approval = getLatestPerformanceApprovalByEntryId(reapprovalEntry!.id);
    const calculation = listApprovedAllowanceCalculationResults().find(
      (item) => item.entryId === reapprovalEntry!.id
    );

    expect(approval?.comment).toContain("재승인 보정");
    expect(approval?.comment).toContain("시급 임의지정 15,500원");
    expect(calculation?.hourlyRate).toBe(15500);
    expect(calculation?.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
  });
});
