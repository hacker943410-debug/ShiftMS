import { existsSync, renameSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { listApprovedAllowanceCalculationResults } from "./approved-allowance-calculation-service";
import {
  getPerformanceComparison,
  listPerformanceOverview
} from "./performance-management-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile
} from "./performance-approval-flow-service";
import { getStoredPerformanceFileDetail } from "./performance-file-storage-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "performance-management");
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

describe("performance-management-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should group pending rows by site and sort them by requested section order", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.siteCount).toBe(1);
    expect(overview.rowCount).toBe(3);
    expect(overview.approvableCount).toBe(3);
    expect(overview.groups[0]?.rows.map((row) => row.entry.section)).toEqual([
      "substitute",
      "overtime",
      "legal-holiday"
    ]);
  });

  it("should default the overview to pending rows instead of loading approved archives", async () => {
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

    const defaultOverview = await listPerformanceOverview(
      {},
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
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

    expect(defaultOverview.rowCount).toBe(0);
    expect(approvedOverview.rowCount).toBe(3);
  });

  it("should require a schedule month before listing approved archives", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "approved"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(0);
    expect(overview.syncIssues[0]?.message).toContain("연도와 월을 선택");
  });

  it("should not show stale pending rows when the workbook is no longer in the pending folder", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);
    renameSync(fixture.filePath, path.resolve(fixture.rootDir, "moved-outside-pending.xlsx"));

    expect(existsSync(fixture.filePath)).toBe(false);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(0);
    expect(overview.groups).toHaveLength(0);
  });

  it("should keep pool substitute rows visible while excluding them from payable approval", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "Pool"
    });

    const detail = await syncPreparedReturnedSchedule(fixture);

    expect(detail.entries.find((entry) => entry.section === "substitute")?.isPoolWorker).toBe(true);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.siteCount).toBe(1);
    expect(overview.rowCount).toBe(3);
    expect(overview.approvableCount).toBe(2);
    expect(overview.groups[0]?.rows.map((row) => row.entry.section)).toEqual([
      "substitute",
      "overtime",
      "legal-holiday"
    ]);
    const substituteRow = overview.groups[0]?.rows.find((row) => row.entry.section === "substitute");

    expect(substituteRow?.approvalStatus).toBe("non-payable");
    expect(substituteRow?.canApprove).toBe(false);
    expect(substituteRow?.entry.note).toContain("Pool 대체근무");
    expect(substituteRow?.entry.note).toContain("수당 미지급");
  });

  it("should surface reapproval candidates when a changed file is re-staged after approval", async () => {
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

      if (!result.ok) {
        throw new Error(`${result.errorCode}: ${result.message}`);
      }
      expect(result.ok).toBe(true);
    }

    await restageReturnedScheduleFixture(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.approvableCount).toBe(0);
    expect(overview.needsReapprovalCount).toBe(1);

    const overtimeRow = overview.groups[0]?.rows.find((row) => row.entry.section === "overtime");

    expect(overtimeRow?.needsReapproval).toBe(true);
    expect(overtimeRow?.approvalStatus).toBe("approved");
    expect(overtimeRow?.reapprovalStatus).toBe("pending");
    expect(overview.reapprovalFiles).toHaveLength(1);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      entryCount: 3,
      reapprovalCompletedCount: 0,
      reapprovalPendingCount: 3,
      remainingEntryCount: 3,
      canFinalize: false
    });

    const comparison = getPerformanceComparison({
      fileId: overtimeRow!.fileId,
      entryId: overtimeRow!.entryId
    });

    expect(comparison?.approvedEntry?.endTime).toBe("01:00");
    expect(comparison?.currentEntry.endTime).toBe("02:00");
    expect(comparison?.approvedCalculation?.snapshot.totalAllowanceAmount).toBeGreaterThan(0);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
  });

  it("should surface reapproval when a holiday source edit changes payable minutes", async () => {
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

    database.prepare(`
      UPDATE monthly_schedule_items
      SET start_time = '08:00',
          end_time = '17:00',
          break_minutes = 60
      WHERE work_date = '2026-03-01'
        AND duty_code = 'D'
    `).run();

    await restageReturnedScheduleFixture(fixture);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const holidayRow = overview.groups[0]?.rows.find((row) => row.entry.section === "legal-holiday");

    expect(overview.needsReapprovalCount).toBe(1);
    expect(holidayRow?.needsReapproval).toBe(true);
    expect(holidayRow?.reapprovalStatus).toBe("pending");
    expect(holidayRow?.entry.totalWorkMinutes).toBe(480);
    expect(holidayRow?.entry.overtimeMinutes).toBe(0);
  });

  it("should reparse unchanged pending files on explicit refresh so stored schedule time changes are reflected", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);

    const database = getSqliteDatabase()!;

    database.prepare(`
      UPDATE monthly_schedule_items
      SET start_time = '08:00',
          end_time = '17:00',
          break_minutes = 60
      WHERE work_date = '2026-03-01'
        AND duty_code = 'D'
    `).run();

    const reusedOverview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const reusedHolidayRow = reusedOverview.groups[0]?.rows.find(
      (row) => row.entry.section === "legal-holiday"
    );

    expect(reusedHolidayRow?.entry.totalWorkMinutes).toBe(660);

    const refreshedOverview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03",
        forceReparse: true
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );
    const refreshedHolidayRow = refreshedOverview.groups[0]?.rows.find(
      (row) => row.entry.section === "legal-holiday"
    );

    expect(refreshedHolidayRow?.entry.totalWorkMinutes).toBe(480);
    expect(refreshedHolidayRow?.entry.overtimeMinutes).toBe(0);
  });

  it("should keep already approved rows visible in pending view and open comparison even without content changes", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.approvableCount).toBe(0);
    expect(overview.needsReapprovalCount).toBe(0);

    const substituteRow = overview.groups[0]?.rows.find((row) => row.entry.section === "substitute");

    expect(substituteRow?.sourceDirectoryType).toBe("pending");
    expect(substituteRow?.approvalStatus).toBe("approved");
    expect(substituteRow?.needsReapproval).toBe(false);
    expect(substituteRow?.reapprovalStatus).toBe("none");
    expect(overview.reapprovalFiles).toHaveLength(0);

    const comparison = getPerformanceComparison({
      fileId: substituteRow!.fileId,
      entryId: substituteRow!.entryId
    });

    expect(comparison?.approvedRecord?.decision).toBe("approved");
    expect(comparison?.approvedEntry?.logicalKey).toBe(substituteRow?.logicalKey);
    expect(comparison?.approvedEntry?.startTime).toBe(comparison?.currentEntry.startTime);
    expect(comparison?.approvedEntry?.endTime).toBe(comparison?.currentEntry.endTime);
    expect(listApprovedAllowanceCalculationResults()).toHaveLength(3);
  });

  it("should not surface a reapproval summary when a restaged pending file has identical approved content", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.needsReapprovalCount).toBe(0);
    expect(overview.reapprovalFiles).toHaveLength(0);
    expect(overview.groups[0]?.rows.every((row) => row.reapprovalStatus === "none")).toBe(true);
  });

  it("should mark individually re-approved rows as completed in pending view", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const rows = overview.groups[0]?.rows ?? [];
    const completedRow = rows.find((row) => row.entry.section === "overtime");

    expect(completedRow?.reapprovalStatus).toBe("completed");
    expect(rows.filter((row) => row.reapprovalStatus === "pending")).toHaveLength(2);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      reapprovalCompletedCount: 1,
      reapprovalPendingCount: 2,
      canFinalize: false
    });
  });

  it("should keep a finalized file moved back into pending out of reapproval when content is unchanged", async () => {
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
    for (const entry of secondDetail.entries) {
      const reapproveResult = await approvePerformanceFile(
        {
          fileId: secondDetail.id,
          entryId: entry.id,
          comment: "재승인 보정"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(reapproveResult.ok).toBe(true);
    }

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

    const finalizedDetail = getStoredPerformanceFileDetail(secondDetail.id);

    expect(finalizedDetail?.directoryType).toBe("approved");
    expect(finalizedDetail?.filePath).toBeDefined();

    renameSync(finalizedDetail!.filePath, fixture.filePath);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const rows = overview.groups[0]?.rows ?? [];

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.sourceDirectoryType === "pending")).toBe(true);
    expect(rows.every((row) => row.approvalStatus === "approved")).toBe(true);
    expect(rows.every((row) => row.reapprovalStatus === "none")).toBe(true);
    expect(overview.reapprovalFiles).toHaveLength(0);
  });

  it("should keep the approved view limited to approved archive rows when an approved file is re-staged into pending", async () => {
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

    expect(overview.rowCount).toBe(3);
    expect(overview.approvedCount).toBe(3);
    expect(overview.pendingCount).toBe(0);
    expect(overview.groups[0]?.rows.every((row) => row.approvalStatus === "approved")).toBe(true);
    expect(overview.groups[0]?.rows.every((row) => row.sourceDirectoryType === "approved")).toBe(true);
    expect(overview.reapprovalFiles).toHaveLength(0);
  });

  it("should keep reapproval file summary available in pending view even before individual reapproval", async () => {
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

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.reapprovalFiles).toHaveLength(1);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      entryCount: 3,
      resolvedApprovedEntryCount: 0,
      remainingEntryCount: 3,
      reapprovalCompletedCount: 0,
      reapprovalPendingCount: 3,
      needsReapprovalCount: 1,
      canFinalize: false
    });
  });

  it("should block pending approval when no hourly rate is applicable on the work date", async () => {
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

    await syncPreparedReturnedSchedule(fixture);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(overview.approvableCount).toBe(0);
    expect(overview.groups[0]?.rows.every((row) => row.canApprove === false)).toBe(true);
    expect(
      overview.groups[0]?.rows.every((row) =>
        row.entry.alerts.some((alert) => alert.message.includes("기준 적용 시급을 찾지 못했습니다."))
      )
    ).toBe(true);
  });

  it("should show the approved manual hourly rate without missing-wage alerts after approval", async () => {
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

    const approvalResult = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: targetEntry!.id,
        manualHourlyRate: 15500
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(approvalResult.ok).toBe(true);

    const overview = await listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    const approvedRow = overview.groups[0]?.rows.find((row) => row.entryId === targetEntry?.id);

    expect(approvedRow?.approvalStatus).toBe("approved");
    expect(approvedRow?.entry.hourlyRate).toBe(15500);
    expect(approvedRow?.latestApprovalUsedManualRate).toBe(true);
    expect(approvedRow?.latestApprovalManualHourlyRate).toBe(15500);
    expect(
      approvedRow?.entry.alerts.some((alert) => alert.message.includes("적용 시급을 찾지 못했습니다."))
    ).toBe(false);
  });

  it("should keep approved snapshot data visible even if the archived file is re-read with missing hourly rate alerts", async () => {
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

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare(`
      UPDATE performance_entries
      SET hourly_rate = NULL,
          alert_json = ?
      WHERE performance_file_id = ?
    `).run(
      JSON.stringify([
        {
          severity: "error",
          message: "홍길동의 2026-03-01 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: 2026-03-21"
        }
      ]),
      firstDetail.id
    );

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

    const approvedRow = overview.groups[0]?.rows.find((row) => row.entry.section === "legal-holiday");

    expect(approvedRow?.approvalStatus).toBe("approved");
    expect(approvedRow?.entry.hourlyRate).toBeGreaterThan(0);
    expect(approvedRow?.entry.alerts.some((alert) => alert.message.includes("적용 시급"))).toBe(false);
  });
});
