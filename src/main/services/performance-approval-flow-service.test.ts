import { existsSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest,
  updateAllowanceCalculationStatus
} from "./approved-allowance-calculation-service";
import { peekReparseMarker } from "./app-settings-storage-service";
import { listStoredEmployees, saveStoredEmployee } from "./employee-storage-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile,
  returnApprovedPerformanceFileToPending
} from "./performance-approval-flow-service";
import {
  getPerformanceApprovalHistoryByEntryId,
  getLatestPerformanceApprovalByEntryId,
  listPerformanceApprovalHistory,
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

  // T-2 took the wage out of the approval comparison, so only a manual rate that actually differs
  // from the approved one counts as a deliberate change; the same rate again is still "already
  // approved".
  it("still treats a manual hourly rate equal to the approved one as already approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry?.hourlyRate).toBeGreaterThan(0);

    const firstResult = await approvePerformanceFile(
      { fileId: detail.id, entryId: targetEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(firstResult.ok).toBe(true);

    const sameRateResult = await approvePerformanceFile(
      { fileId: detail.id, entryId: targetEntry!.id, manualHourlyRate: targetEntry!.hourlyRate },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(sameRateResult.ok).toBe(false);
    expect(!sameRateResult.ok && sameRateResult.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
    expect(getPerformanceApprovalHistoryByEntryId(targetEntry!.id)).toHaveLength(1);
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

  it("should not create a reapproval record when identical approved content is restaged", async () => {
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
    const secondDetail = await syncPreparedReturnedSchedule(fixture);
    const targetEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(secondDetail.id).not.toBe(firstDetail.id);
    expect(targetEntry).toBeDefined();

    const duplicateResult = await approvePerformanceFile(
      {
        fileId: secondDetail.id,
        entryId: targetEntry!.id,
        comment: "동일 파일 재확인"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(duplicateResult.ok).toBe(false);
    if (duplicateResult.ok) {
      throw new Error("동일 승인본 재투입이 재승인으로 처리되면 안 됩니다.");
    }
    expect(duplicateResult.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");
    expect(getLatestPerformanceApprovalByEntryId(targetEntry!.id)).toBeNull();
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(firstDetail.entries.length);
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

      expect(result.ok).toBe(true);
    }

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

  it("should detect an approved archive even when legacy schedule keys include directory suffixes", async () => {
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

    const database = getSqliteDatabase()!;
    const legacyBaseScheduleKey = firstDetail.scheduleKey;

    database
      .prepare("UPDATE performance_files SET schedule_key = ? WHERE id = ?")
      .run(`${legacyBaseScheduleKey}:approved`, firstDetail.id);

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    database
      .prepare("UPDATE performance_files SET schedule_key = ? WHERE id = ?")
      .run(`${legacyBaseScheduleKey}:pending`, secondDetail.id);

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

      expect(result.ok).toBe(true);
    }

    const restagedDetail = getStoredPerformanceFileDetail(secondDetail.id);

    expect(restagedDetail?.directoryType).toBe("pending");
    expect(restagedDetail?.status).toBe("pending");
  });

  it("should block finalize when some reapproval rows were not individually re-approved", async () => {
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

    expect(finalizeResult.ok).toBe(false);
    if (finalizeResult.ok) {
      throw new Error("일부 행만 재승인된 파일이 확정되었습니다.");
    }
    expect(finalizeResult.errorCode).toBe("PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED");
    expect(finalizeResult.message).toContain("현재 파일 기준으로 다시 승인해야 합니다.");

    const storedDetail = getStoredPerformanceFileDetail(secondDetail.id);

    expect(storedDetail?.directoryType).toBe("pending");
    expect(storedDetail?.status).toBe("pending");
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === secondDetail.id)
    ).toHaveLength(1);
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

  it("should re-enable approval for a hand-moved orphan whose approved source is gone", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: firstDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    const firstApproved = getStoredPerformanceFileDetail(firstDetail.id);

    expect(firstApproved?.directoryType).toBe("approved");

    // A byte-identical copy is left back in the pending tree (a hand-move): new fileId, same logicalKeys.
    await restageReturnedScheduleFixture(fixture);
    const secondDetail = await syncPreparedReturnedSchedule(fixture);
    const overtimeEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(secondDetail.id).not.toBe(firstDetail.id);
    expect(overtimeEntry).toBeDefined();

    // Control: while the approved source file STILL exists, the prior approval must keep blocking it.
    const blocked = await approvePerformanceFile(
      { fileId: secondDetail.id, entryId: overtimeEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(blocked.ok).toBe(false);
    if (blocked.ok) {
      throw new Error("승인본이 살아 있는데 재승인이 열리면 안 됩니다.");
    }
    expect(blocked.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");

    const database = getSqliteDatabase()!;

    // Guard: when the recorded source path's CONTAINING FOLDER is also unreachable (a momentarily
    // offline network/cloud 승인완료 folder), this must NOT look like a missing source and must keep
    // blocking — otherwise a whole-share outage would mass-unlock reapproval.
    database
      .prepare("UPDATE performance_files SET file_path = ? WHERE id = ?")
      .run(path.resolve(fixture.approvedDir, "offline-share", "gone.xlsx"), firstDetail.id);

    const stillBlocked = await approvePerformanceFile(
      { fileId: secondDetail.id, entryId: overtimeEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(stillBlocked.ok).toBe(false);
    if (stillBlocked.ok) {
      throw new Error("승인완료 폴더가 통째로 안 보일 때 재승인이 열리면 안 됩니다.");
    }
    expect(stillBlocked.errorCode).toBe("PERFORMANCE_ALREADY_APPROVED");

    // The user hand-moved the approved workbook out of 승인완료: the recorded source file no longer
    // exists on disk, but its containing folder (approvedDir) is still reachable — the genuine
    // hand-moved-orphan signature. Point it at a missing file inside that existing folder.
    database
      .prepare("UPDATE performance_files SET file_path = ? WHERE id = ?")
      .run(path.resolve(fixture.approvedDir, "hand-moved-away.xlsx"), firstDetail.id);

    expect(existsSync(getStoredPerformanceFileDetail(firstDetail.id)?.filePath ?? "x")).toBe(false);

    // FIX B: the orphaned approval no longer shadows the pending file, so it becomes re-approvable.
    const recovered = await approvePerformanceFile(
      { fileId: secondDetail.id, entryId: overtimeEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(recovered.ok).toBe(true);
  });

  it("should block returning a file to pending when it is not currently approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    const result = await returnApprovedPerformanceFileToPending(
      { fileId: detail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("승인대기 파일을 되돌릴 수 있으면 안 됩니다.");
    }
    expect(result.errorCode).toBe("PERFORMANCE_RETURN_TO_PENDING_BLOCKED");
  });

  it("should cleanly return an approved file to pending and wipe its prior approvals", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        { fileId: detail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    const archived = getStoredPerformanceFileDetail(detail.id);

    expect(archived?.directoryType).toBe("approved");
    expect(archived?.isEffective).toBe(true);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === detail.id).length
    ).toBeGreaterThan(0);

    const returnResult = await returnApprovedPerformanceFileToPending(
      { fileId: detail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(returnResult.ok).toBe(true);

    const restored = getStoredPerformanceFileDetail(detail.id);

    expect(restored?.directoryType).toBe("pending");
    expect(restored?.status).toBe("pending");
    expect(restored?.approvedEntryCount).toBe(0);
    expect(restored?.isEffective).toBe(false);

    // Clean undo: the file's prior approvals and allowance calculations are gone.
    expect(
      listPerformanceApprovalHistory().filter((approval) => approval.fileId === detail.id)
    ).toHaveLength(0);
    expect(
      listApprovedAllowanceCalculationResults().filter((item) => item.fileId === detail.id)
    ).toHaveLength(0);

    // The file is freshly re-approvable, with no PERFORMANCE_ALREADY_APPROVED deadlock.
    const reapprove = await approvePerformanceFile(
      { fileId: detail.id, entryId: detail.entries[0]!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(reapprove.ok).toBe(true);
  });

  it("should block finalizing a first-time file over an existing approved copy of the same schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: firstDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    expect(getStoredPerformanceFileDetail(firstDetail.id)?.isEffective).toBe(true);

    // Stage a second pending file for the SAME 근무지·월. Removing the first file's approval records
    // makes the second file a genuine first-time file (its rows have no prior approval) that merely
    // shares the schedule_key — the disjoint-sibling shape.
    await restageReturnedScheduleFixture(fixture);
    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    expect(secondDetail.id).not.toBe(firstDetail.id);

    getSqliteDatabase()!
      .prepare("DELETE FROM performance_approvals WHERE file_id = ?")
      .run(firstDetail.id);

    for (const entry of secondDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: secondDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    // The second file stayed pending (an approved sibling blocks auto-archive); finalizing it must be
    // refused so it cannot flip the existing approved copy's effective flag off.
    const stored = getStoredPerformanceFileDetail(secondDetail.id);
    expect(stored?.directoryType).toBe("pending");

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: secondDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(false);
    if (finalizeResult.ok) {
      throw new Error("같은 일정의 승인완료본이 있는데 첫 확정이 통과되면 안 됩니다.");
    }
    expect(finalizeResult.errorCode).toBe("PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED");

    // The original approved copy keeps its effective flag.
    expect(getStoredPerformanceFileDetail(firstDetail.id)?.isEffective).toBe(true);
  });
});

// T-22: work outside the matched person's employment period parses as an error, and approval
// refuses it - also under a manual hourly rate, which clears wage alerts only. The whole chain is
// exercised here: the hire date is moved past the work date on the person, the file is read again,
// and the approval is attempted.
describe("performance-approval-flow-service · employment period (T-22)", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  const dayAfter = (date: string) => {
    const shifted = new Date(`${date}T00:00:00Z`);

    shifted.setUTCDate(shifted.getUTCDate() + 1);
    return shifted.toISOString().slice(0, 10);
  };

  it("refuses to approve a row worked before the hire date, with or without a manual hourly rate", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const initialDetail = await syncPreparedReturnedSchedule(fixture);
    const initialEntry = initialDetail.entries.find((entry) => entry.section === "overtime");

    expect(initialEntry).toBeDefined();
    expect(initialEntry!.alerts).toEqual([]);

    const person = listStoredEmployees().find(
      (employee) => employee.employeeCode === initialEntry!.employeeCode
    );

    expect(person).toBeDefined();

    saveStoredEmployee({
      id: person!.id,
      employeeCode: person!.employeeCode,
      name: person!.name,
      employmentType: person!.employmentType,
      status: "active",
      hireDate: dayAfter(initialEntry!.workDate)
    });

    await restageReturnedScheduleFixture(fixture);

    const detail = await syncPreparedReturnedSchedule(fixture);
    const entry = detail.entries.find((item) => item.section === "overtime");

    expect(entry).toBeDefined();
    expect(entry!.employeeCode).toBe(initialEntry!.employeeCode);
    expect(entry!.alerts.map((alert) => alert.severity)).toEqual(["error"]);
    expect(entry!.alerts[0]?.message).toContain("고용 기간 밖 근무는 승인할 수 없습니다");

    const plain = await approvePerformanceFile(
      { fileId: detail.id, entryId: entry!.id, comment: "승인 시도" },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(plain.ok).toBe(false);
    expect(plain.ok ? "" : plain.message).toContain("오류 알림이 남아 있어 승인할 수 없습니다");

    const withManualRate = await approvePerformanceFile(
      { fileId: detail.id, entryId: entry!.id, comment: "시급 임의지정", manualHourlyRate: 15500 },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(withManualRate.ok).toBe(false);
    expect(getLatestPerformanceApprovalByEntryId(entry!.id)).toBeFalsy();
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(0);
  });
});

// T-17: a file returned to 승인대기 was archived while the reparse markers were consumed by
// overviews that read pending files only, so the return leaves a marker of its own.
describe("performance-approval-flow-service · return leaves a reparse marker (T-17)", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("leaves the wage-rate reparse marker when an approved file is returned to pending", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        { fileId: detail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("approved");

    // Nothing else has left this marker since the helper spent the fixture's own.
    const before = peekReparseMarker("wage-rate");

    const returned = await returnApprovedPerformanceFileToPending(
      { fileId: detail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(returned.ok).toBe(true);
    expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("pending");

    const after = peekReparseMarker("wage-rate");

    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });
});

// F1: finalizing a reapproval file must look at the row in hand, not only at the clock. Approving
// every row and then editing the workbook again used to leave the file finalizable, freezing the
// amounts from before the edit as 승인완료.
describe("performance-approval-flow-service · finalize checks the current rows (F1)", () => {
  afterEach(() => {
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

  // 승인완료본 하나 + 그 위에 올라온 정정본(전 행 재승인 완료) + 확정 전에 한 번 더 바뀐 엑셀.
  const prepareReapprovedFileEditedAgain = async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: firstDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 2);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    expect(secondDetail.id).not.toBe(firstDetail.id);

    for (const entry of secondDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: secondDetail.id, entryId: entry.id, comment: "재승인 보정" },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    // The workbook changes once more, after every row was already re-approved. The re-read keeps the
    // same file id and the same received time (same path, still pending), so the cycle-time
    // condition on its own still reports every row as done.
    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 3);

    const editedDetail = await syncPreparedReturnedSchedule(fixture);

    expect(editedDetail.id).toBe(secondDetail.id);
    expect(editedDetail.receivedAt).toBe(secondDetail.receivedAt);

    return { editedDetail, fixture, secondDetail };
  };

  it("should refuse to finalize a re-approved file whose workbook changed again", async () => {
    const { editedDetail, fixture } = await prepareReapprovedFileEditedAgain();
    const calculationsBefore = listApprovedAllowanceCalculationResults()
      .map((record) => `${record.id}:${record.status}:${record.snapshot.totalAllowanceAmount}`)
      .sort();

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: editedDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(false);
    if (finalizeResult.ok) {
      throw new Error("확정 전에 다시 바뀐 파일이 승인완료로 확정되었습니다.");
    }
    expect(finalizeResult.errorCode).toBe("PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED");
    expect(finalizeResult.message).toContain(fixture.workers.overtime.name);
    expect(finalizeResult.message).toContain("2026-03-03");

    const storedDetail = getStoredPerformanceFileDetail(editedDetail.id);

    expect(storedDetail?.directoryType).toBe("pending");
    expect(storedDetail?.status).toBe("pending");
    // Nothing that was already approved and paid may move because the finalize was refused.
    expect(
      listApprovedAllowanceCalculationResults()
        .map((record) => `${record.id}:${record.status}:${record.snapshot.totalAllowanceAmount}`)
        .sort()
    ).toEqual(calculationsBefore);
  });

  it("should finalize once the changed row is approved again", async () => {
    const { editedDetail, fixture } = await prepareReapprovedFileEditedAgain();
    const changedEntry = editedDetail.entries.find((entry) => entry.section === "overtime");

    expect(changedEntry).toBeDefined();

    const reapproveResult = await approvePerformanceFile(
      { fileId: editedDetail.id, entryId: changedEntry!.id, comment: "재정정 승인" },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(reapproveResult.ok).toBe(true);

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: editedDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(true);
    expect(getStoredPerformanceFileDetail(editedDetail.id)?.directoryType).toBe("approved");
  });

  it("should keep counting a proposal-approved row as done even after its source row changes", async () => {
    const { editedDetail, fixture } = await prepareReapprovedFileEditedAgain();
    const changedCalculation = listApprovedAllowanceCalculationResults().find(
      (record) => record.fileId === editedDetail.id && record.workDate === "2026-03-03"
    );

    expect(changedCalculation).toBeDefined();

    // 품의 승인으로 마감된 행은 다시 승인할 수 없다. 그 행까지 확정을 막으면 이미 지급된 수당을 안은
    // 채 파일이 갇히므로, 잠긴 행은 내용이 달라져도 계속 완료로 센다.
    updateAllowanceCalculationStatus({
      calculationId: changedCalculation!.id,
      status: "proposal-approved"
    });

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: editedDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(true);
    expect(getStoredPerformanceFileDetail(editedDetail.id)?.directoryType).toBe("approved");
  });

  it("should keep the as-is finalize open for a first-time file with no approved sibling", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    // No userDataPath: every row is approved but the auto-archive cannot run, which is the state the
    // "이대로 승인완료" button exists for.
    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        { fileId: detail.id, entryId: entry.id },
        testAdminSession
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 2);

    const editedDetail = await syncPreparedReturnedSchedule(fixture);

    expect(editedDetail.id).toBe(detail.id);

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: editedDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(true);
    expect(getStoredPerformanceFileDetail(editedDetail.id)?.directoryType).toBe("approved");
  });

  const dayAfterDate = (date: string) => {
    const shifted = new Date(`${date}T00:00:00Z`);

    shifted.setUTCDate(shifted.getUTCDate() + 1);
    return shifted.toISOString().slice(0, 10);
  };

  // A row that gains a T-22 error after it was approved must not leave 승인대기 through finalize. The
  // workbook is rewritten with the SAME overtime hour, so the rows stay equivalent and the only
  // thing that moved is the employment period - which isolates this gate from the workbook-changed
  // one above. A row without a source signature already refuses here, because the legacy comparison
  // reads the alert list; this pins the same answer for a row that carries one.
  it("should refuse to finalize a re-approved file whose row fell outside the employment period", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const firstDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of firstDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: firstDetail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 2);

    const secondDetail = await syncPreparedReturnedSchedule(fixture);

    for (const entry of secondDetail.entries) {
      const result = await approvePerformanceFile(
        { fileId: secondDetail.id, entryId: entry.id, comment: "재승인 보정" },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    const overtimeEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    const person = listStoredEmployees().find(
      (employee) => employee.employeeCode === overtimeEntry!.employeeCode
    );

    expect(person).toBeDefined();

    saveStoredEmployee({
      id: person!.id,
      employeeCode: person!.employeeCode,
      name: person!.name,
      employmentType: person!.employmentType,
      status: "active",
      hireDate: dayAfterDate(overtimeEntry!.workDate)
    });

    // Same content, new mtime: the file is read again and the rows come back equivalent.
    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 2);

    const rereadDetail = await syncPreparedReturnedSchedule(fixture);

    expect(rereadDetail.id).toBe(secondDetail.id);

    const blockedEntry = rereadDetail.entries.find((entry) => entry.section === "overtime");

    expect(blockedEntry?.alerts.some((alert) => alert.severity === "error")).toBe(true);

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: rereadDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(false);
    expect(finalizeResult.ok ? "" : finalizeResult.errorCode).toBe(
      "PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED"
    );
    expect(getStoredPerformanceFileDetail(rereadDetail.id)?.directoryType).toBe("pending");
  });
});
