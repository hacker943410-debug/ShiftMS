import { existsSync, renameSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  isReparseMonthCovered,
  markWageRateReparseRequired,
  peekReparseMarker,
  saveStoredAppSettingEntry
} from "./app-settings-storage-service";
import { listApprovedAllowanceCalculationResults } from "./approved-allowance-calculation-service";
import { closeStoredEmployeeWageRate, saveStoredEmployeeWageRate } from "./employee-history-service";
import { listStoredEmployees, saveStoredEmployee } from "./employee-storage-service";
import {
  getPerformanceComparison,
  listPerformanceOverview,
  resetPerformanceOverviewMarkerHoldForTest
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
import { listStoredMonthlySchedules, saveStoredMonthlySchedule } from "./monthly-schedule-storage-service";
import { listStoredShiftPatterns, saveStoredShiftPattern } from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { isNonPayableSubstitutePerformanceEntry } from "../../shared/domain/performance-file";

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

  it("should group pending rows by site and sort them by work date before team label", async () => {
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
    expect(overview.groups[0]?.rows.map((row) => row.entry.workDate)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03"
    ]);
    expect(overview.groups[0]?.rows.map((row) => row.entry.teamLabel)).toEqual([
      "A조",
      "B조",
      "D조"
    ]);
    expect(overview.groups[0]?.rows.map((row) => row.entry.section)).toEqual([
      "legal-holiday",
      "substitute",
      "overtime"
    ]);
  });

  it("should keep work date as the primary sort key when team labels would sort differently", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("테스트 DB를 초기화하지 못했습니다.");
    }

    database.prepare(`
      UPDATE performance_entries
      SET work_date = ?, team_label = ?
      WHERE performance_file_id = ?
        AND section = ?
    `).run("2026-03-01", "D조", fixture.fileId, "legal-holiday");
    database.prepare(`
      UPDATE performance_entries
      SET work_date = ?, team_label = ?
      WHERE performance_file_id = ?
        AND section = ?
    `).run("2026-03-02", "A조", fixture.fileId, "overtime");
    database.prepare(`
      UPDATE performance_entries
      SET work_date = ?, team_label = ?
      WHERE performance_file_id = ?
        AND section = ?
    `).run("2026-03-02", "B조", fixture.fileId, "substitute");

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

    expect(
      overview.groups[0]?.rows.map((row) => [
        row.entry.workDate,
        row.entry.teamLabel,
        row.entry.section
      ])
    ).toEqual([
      ["2026-03-01", "D조", "legal-holiday"],
      ["2026-03-02", "A조", "overtime"],
      ["2026-03-02", "B조", "substitute"]
    ]);
  });

  it("should recover team labels for existing stored rows without a persisted team label", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("테스트 DB를 초기화하지 못했습니다.");
    }

    database.prepare(`
      UPDATE performance_entries
      SET team_label = NULL
      WHERE performance_file_id = ?
    `).run(fixture.fileId);

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

    expect(overview.groups[0]?.rows.map((row) => row.entry.teamLabel)).toEqual([
      "A조",
      "B조",
      "D조"
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

  it("should reparse rejected pending files instead of reusing stale stored entries", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase()!;

    database.prepare(`
      DELETE FROM performance_entries
      WHERE performance_file_id = ?
        AND section = 'legal-holiday'
    `).run(detail.id);
    database.prepare(`
      UPDATE performance_files
      SET status = 'rejected',
          entry_count = 2
      WHERE id = ?
    `).run(detail.id);

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
    const restoredDetail = getStoredPerformanceFileDetail(detail.id);

    expect(overview.rowCount).toBe(3);
    expect(overview.reapprovalFiles[0]?.entryCount).toBe(3);
    expect(
      overview.groups[0]?.rows.some((row) => row.entry.section === "legal-holiday")
    ).toBe(true);
    expect(
      restoredDetail?.entries.some((entry) => entry.section === "legal-holiday")
    ).toBe(true);
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
      "legal-holiday",
      "substitute",
      "overtime"
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

  // T-12: an unchanged file is reused as parsed. A hire date moved after that parse leaves a
  // one-shot marker, and the next plain overview reads the pending files again. The signal used
  // here is a wage saved between the two reads: a reused row keeps the old wage, a re-read row
  // carries the new one.
  it("reads the pending files again once after a hire date changes, without a forced refresh", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const worker = listStoredEmployees({ includeDeleted: true } as never).find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );

    if (!worker) {
      throw new Error("휴일 근무자를 찾지 못했습니다.");
    }

    const holidayWage = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) => entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      )?.hourlyRate;

    // Registering the fixture's people left a marker of its own; the first overview spends it.
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);
    expect(peekReparseMarker("employee-master")).toBeNull();
    expect(holidayWage()).toBe(13200);

    // A probe that only a re-read undoes: stamp a wage straight into the stored row. A reuse keeps
    // it; a re-read restores the real wage. (A wage saved through the service would leave a marker
    // of its own now, so it can no longer serve as the "invisible" probe.)
    const stampProbeWage = () => {
      const entry = getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (item) => item.section === "legal-holiday" && item.employeeName === fixture.workers.holiday.name
      );

      getSqliteDatabase()!
        .prepare("UPDATE performance_entries SET hourly_rate = 1 WHERE id = ?")
        .run(entry!.id);
    };

    stampProbeWage();
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    // Unchanged file, no marker: the stored rows are reused, probe and all.
    expect(holidayWage()).toBe(1);

    saveStoredEmployee({
      id: worker.id,
      employeeCode: worker.employeeCode,
      name: worker.name,
      employmentType: worker.employmentType,
      status: worker.status,
      hireDate: "2024-02-01"
    });
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    // The hire date change made this plain overview read the file again...
    expect(holidayWage()).toBe(13200);

    // ...and, being month-scoped, recorded the month against the marker instead of spending it:
    // the next overview of the same month reuses the rows (the probe survives).
    const token = peekReparseMarker("employee-master");

    expect(token).not.toBeNull();
    expect(isReparseMonthCovered("employee-master", token!, "2026-03")).toBe(true);

    stampProbeWage();
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayWage()).toBe(1);
  });

  // R10 #2: "실적 파일 파싱 → 인력 정보 없음 → 그 사람을 등록 → 실적 관리 복귀". The file did not change,
  // so without the marker the stored error row would be reused and the operator could not approve
  // what they had just fixed. Checked on the stored row, not on the marker alone.
  it("finds a person registered after the file was parsed, on the next plain overview", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const overtimeRow = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) => entry.section === "overtime" && entry.employeeName === fixture.workers.overtime.name
      );
    const errorMessages = () =>
      (overtimeRow()?.alerts ?? []).filter((alert) => alert.severity === "error").map((alert) => alert.message);

    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);
    expect(overtimeRow()?.employeeCode).toBe(fixture.workers.overtime.employeeCode);

    // Make the name in the file unknown, as if the person had never been registered.
    const worker = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.overtime.employeeCode
    );

    if (!worker) {
      throw new Error("연장 근무자를 찾지 못했습니다.");
    }

    saveStoredEmployee({
      id: worker.id,
      employeeCode: `${worker.employeeCode}-OLD`,
      name: "다른사람",
      employmentType: worker.employmentType,
      status: worker.status,
      hireDate: worker.hireDate ?? "2024-01-01"
    });

    const renameToken = peekReparseMarker("employee-master");

    expect(renameToken).not.toBeNull();
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(overtimeRow()?.employeeCode).toBe("");
    expect(errorMessages()).toEqual([`${fixture.workers.overtime.name} 인력 정보를 찾지 못했습니다.`]);
    expect(isReparseMonthCovered("employee-master", renameToken!, "2026-03")).toBe(true);

    // Register the person the file names. No refresh, nothing done by hand.
    const site = listStoredSites().find((item) => item.name === fixture.siteName);

    if (!site) {
      throw new Error("근무지를 찾지 못했습니다.");
    }

    saveStoredEmployee({
      employeeCode: fixture.workers.overtime.employeeCode,
      name: fixture.workers.overtime.name,
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: site.id,
      shiftGroup: "D조",
      hourlyRate: 15100
    });

    // A new token: the month record of the earlier token does not vouch for it.
    const registerToken = peekReparseMarker("employee-master");

    expect(registerToken).not.toBeNull();
    expect(registerToken).not.toBe(renameToken);
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(overtimeRow()?.employeeCode).toBe(fixture.workers.overtime.employeeCode);
    expect(overtimeRow()?.hourlyRate).toBe(15100);
    expect(errorMessages()).toEqual([]);
    expect(isReparseMonthCovered("employee-master", registerToken!, "2026-03")).toBe(true);
  });

  // R10 #5: the marker is spent only after the re-read succeeded. A scan that throws must leave it
  // for the next overview; otherwise the rows stay judged by the old master with nothing to retry.
  it("keeps the reparse marker when the re-read fails, and spends it on the next overview that succeeds", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const worker = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );

    if (!worker) {
      throw new Error("휴일 근무자를 찾지 못했습니다.");
    }

    const holidayWage = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) => entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      )?.hourlyRate;

    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);
    expect(peekReparseMarker("employee-master")).toBeNull();

    saveStoredEmployeeWageRate({
      employeeId: worker.id,
      hourlyRate: 14500,
      effectiveFrom: "2026-01-01",
      reason: "R10 #5 test"
    });
    saveStoredEmployee({
      id: worker.id,
      employeeCode: worker.employeeCode,
      name: worker.name,
      employmentType: worker.employmentType,
      status: worker.status,
      hireDate: "2024-02-01"
    });

    const token = peekReparseMarker("employee-master");

    expect(token).not.toBeNull();

    // Take the stored file table away for one overview: the scan throws before any file is re-read.
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    database.exec("ALTER TABLE performance_files RENAME TO performance_files_offline");

    await expect(
      listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings)
    ).rejects.toThrow();

    database.exec("ALTER TABLE performance_files_offline RENAME TO performance_files");

    // Still there, still the same token, and the rows still carry the old wage.
    expect(peekReparseMarker("employee-master")).toBe(token);
    expect(holidayWage()).toBe(13200);

    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayWage()).toBe(14500);
    // Month-scoped: the marker stays, with this month recorded against the token it read.
    expect(peekReparseMarker("employee-master")).toBe(token);
    expect(isReparseMonthCovered("employee-master", token!, "2026-03")).toBe(true);
  });

  // R11 self-check: the screen almost always asks for one month, and the allowance review asks for
  // approved rows of one month - both re-read that month's pending files only. Spending the marker
  // there left every other month judged by the old master. A month-scoped query records the month
  // instead; the same month is not read twice for one token; a full-period query clears it.
  it("records a month-scoped re-read against the marker and clears it only after a full-period overview", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const worker = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );

    if (!worker) {
      throw new Error("휴일 근무자를 찾지 못했습니다.");
    }

    const holidayWage = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) => entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      )?.hourlyRate;
    const setWage = (hourlyRate: number) =>
      saveStoredEmployeeWageRate({
        employeeId: worker.id,
        hourlyRate,
        effectiveFrom: "2026-01-01",
        reason: "R11 month scope test"
      });

    expect(peekReparseMarker("employee-master")).toBeNull();
    expect(holidayWage()).toBe(13200);

    setWage(14500);
    saveStoredEmployee({
      id: worker.id,
      employeeCode: worker.employeeCode,
      name: worker.name,
      employmentType: worker.employmentType,
      status: worker.status,
      hireDate: "2024-02-01"
    });

    const token = peekReparseMarker("employee-master");

    expect(token).not.toBeNull();

    // The allowance review's query: approved scope, one month. It re-reads that month's pending
    // files and records the month - but the marker stays for the months it did not read.
    await listPerformanceOverview({ approvalScope: "approved", scheduleMonth: "2026-03" }, settings);

    expect(holidayWage()).toBe(14500);
    expect(peekReparseMarker("employee-master")).toBe(token);
    expect(isReparseMonthCovered("employee-master", token!, "2026-03")).toBe(true);
    expect(isReparseMonthCovered("employee-master", token!, "2026-04")).toBe(false);

    // The same month is not read again for this token. The probe is a wage stamped straight into
    // the stored row: a reuse keeps it, a re-read restores the real wage. (A wage saved through the
    // service would leave a marker of its own now, T-1.)
    const holidayEntryId = getStoredPerformanceFileDetail(detail.id)?.entries.find(
      (entry) => entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
    )?.id;

    expect(holidayEntryId).toBeDefined();
    getSqliteDatabase()!
      .prepare("UPDATE performance_entries SET hourly_rate = 1 WHERE id = ?")
      .run(holidayEntryId!);
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayWage()).toBe(1);
    expect(peekReparseMarker("employee-master")).toBe(token);

    // A full-period overview reads every month and spends the marker.
    await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(holidayWage()).toBe(14500);
    expect(peekReparseMarker("employee-master")).toBeNull();
    expect(isReparseMonthCovered("employee-master", token!, "2026-03")).toBe(false);
  });

  // T-2: the wage left the approval comparison, so a refresh re-reads an approved row at a new wage
  // without touching its approval. The row must then show the wage it was approved and paid at.
  it("shows an approved row at the wage it was approved with, even after a refresh re-reads it at a new wage", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const targetEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(targetEntry?.hourlyRate).toBeGreaterThan(0);

    const approvedWage = targetEntry!.hourlyRate!;
    const approvalResult = await approvePerformanceFile(
      { fileId: detail.id, entryId: targetEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approvalResult.ok).toBe(true);

    const worker = listStoredEmployees({ includeDeleted: true } as never).find(
      (employee) => employee.employeeCode === targetEntry!.employeeCode
    );

    if (!worker) {
      throw new Error("연장 근무자를 찾지 못했습니다.");
    }

    saveStoredEmployeeWageRate({
      employeeId: worker.id,
      hourlyRate: approvedWage + 1300,
      effectiveFrom: "2026-01-01",
      reason: "T-2 test"
    });

    const overview = await listPerformanceOverview(
      { approvalScope: "pending", scheduleMonth: "2026-03", forceReparse: true },
      settings
    );
    const approvedRow = overview.groups[0]?.rows.find((row) => row.entryId === targetEntry?.id);

    expect(approvedRow?.approvalStatus).toBe("approved");
    expect(approvedRow?.needsReapproval).toBe(false);
    // Shown at the approved wage, not the re-read one.
    expect(approvedRow?.entry.hourlyRate).toBe(approvedWage);
    // And paid at it.
    expect(
      listApprovedAllowanceCalculationResults()
        .filter((item) => item.entryId === targetEntry!.id)
        .every((item) => item.hourlyRate === approvedWage)
    ).toBe(true);
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

// A team's work type in the shift settings decides whether a substitute row is payable. Changing
// it leaves a marker of its own, and the next plain overview reads the pending file again against
// the new settings - the substitute row flips to non-payable without a forced refresh.
describe("performance-management-service · team work-type reparse", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("reads the pending files again once after a team's work type changes in the shift settings", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    // The work type only matters once the substitute allowance policy is in force for the month.
    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-01-01");

    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const substituteEntry = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find((entry) => entry.section === "substitute");

    // Registering the fixture's people and settings left markers of their own; the first overview
    // spends them. The replacement worker sits in C조, a rotating team: the row is payable.
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);
    expect(peekReparseMarker("team-work-type")).toBeNull();
    expect(substituteEntry()).toBeDefined();
    expect(isNonPayableSubstitutePerformanceEntry(substituteEntry()!)).toBe(false);

    const site = listStoredSites().find((item) => item.name === fixture.siteName);
    const pattern = listStoredShiftPatterns(site!.id).find((item) => item.name === "실적 테스트 4조 3교대");

    expect(pattern).toBeDefined();

    // The same settings, saved in place, with C조 turned into a Pool team.
    saveStoredShiftPattern({
      id: pattern!.id,
      siteId: site!.id,
      name: pattern!.name,
      teamCount: 4,
      patternCode: "DENX",
      startIndexRule: "team-sequence",
      patternStartDate: "2024-01-01",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "E", startTime: "14:00", endTime: "22:00", breakMinutes: 60 },
        { stepIndex: 2, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: Array.from({ length: 4 }, (_, index) => ({
        teamLabel: `${String.fromCharCode(65 + index)}조`,
        index
      })),
      teamSettings: [{ teamLabel: "C조", workType: "POOL" }],
      poolEnabled: false,
      poolBreakMinutes: 0
    });

    expect(peekReparseMarker("team-work-type")).not.toBeNull();

    // Unchanged file, no forced refresh: the marker alone makes this overview read it again.
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(isNonPayableSubstitutePerformanceEntry(substituteEntry()!)).toBe(true);

    // Month-scoped, so the month is recorded against the token instead of spending it.
    const token = peekReparseMarker("team-work-type");

    expect(token).not.toBeNull();
    expect(isReparseMonthCovered("team-work-type", token!, "2026-03")).toBe(true);
  });
});

// A stored monthly schedule is what the parser reads a file against. Regenerating the same month
// used to leave the pending files on the old schedule until a manual refresh; the save now leaves
// a marker, and the next plain overview reads them again.
describe("performance-management-service · monthly schedule reparse", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("reads the pending files again once after the month's schedule is saved again", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const holidayWage = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) => entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      )?.hourlyRate;

    // The fixture's own schedule save left a marker, which the helper spent after its read (as the
    // app's first overview would). Nothing has changed since, so this overview reuses the rows.
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);
    expect(peekReparseMarker("monthly-schedule")).toBeNull();
    expect(holidayWage()).toBe(13200);

    // A probe that only a re-read undoes: stamp a wage straight into the stored row.
    const holidayEntry = getStoredPerformanceFileDetail(detail.id)?.entries.find(
      (entry) => entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
    );

    getSqliteDatabase()!
      .prepare("UPDATE performance_entries SET hourly_rate = 1 WHERE id = ?")
      .run(holidayEntry!.id);
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayWage()).toBe(1);

    const site = listStoredSites().find((item) => item.name === fixture.siteName);
    const schedule = listStoredMonthlySchedules(site!.id).find(
      (item) => item.scheduleMonth === "2026-03"
    );

    expect(schedule).toBeDefined();
    expect(schedule!.items.every((item) => Boolean(item.employeeCode))).toBe(true);

    // The same month regenerated in place, with the same rows.
    saveStoredMonthlySchedule({
      id: schedule!.id,
      siteId: site!.id,
      scheduleMonth: schedule!.scheduleMonth,
      patternId: schedule!.patternId,
      generatedBy: schedule!.generatedBy,
      items: schedule!.items.map((item) => ({
        employeeCode: item.employeeCode!,
        teamLabel: item.teamLabel,
        sortOrder: item.sortOrder,
        workDate: item.workDate,
        dutyCode: item.dutyCode,
        startTime: item.startTime,
        endTime: item.endTime,
        breakMinutes: item.breakMinutes
      }))
    });

    // The save left a fresh token, so this plain month overview reads the file again.
    expect(peekReparseMarker("monthly-schedule")).not.toBeNull();

    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    // Read again against the saved schedule: the probe is gone, the real wage is back.
    expect(holidayWage()).toBe(13200);

    const token = peekReparseMarker("monthly-schedule");

    expect(token).not.toBeNull();
    expect(isReparseMonthCovered("monthly-schedule", token!, "2026-03")).toBe(true);
  });
});

// T-1: a wage saved after a file was read used to stay off its rows until a manual refresh. The
// save now leaves a marker of its own, and the next plain overview reads the pending files again.
describe("performance-management-service · wage-rate reparse", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("reads the pending files again once after a wage line is saved, and after one is closed", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const worker = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );

    expect(worker).toBeDefined();

    const holidayRow = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) => entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      );

    // The fixture's own wage lines left a marker, spent by the helper. Nothing changed since.
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);
    expect(peekReparseMarker("wage-rate")).toBeNull();
    expect(holidayRow()?.hourlyRate).toBe(13200);

    // A backdated wage line covering the work date: the row is read again with it, unasked.
    const raised = saveStoredEmployeeWageRate({
      employeeId: worker!.id,
      hourlyRate: 14500,
      effectiveFrom: "2026-01-01",
      reason: "T-1 auto reparse"
    });

    expect(peekReparseMarker("wage-rate")).not.toBeNull();

    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayRow()?.hourlyRate).toBe(14500);

    // Month-scoped: the month is recorded against the token rather than spending it.
    const token = peekReparseMarker("wage-rate");

    expect(token).not.toBeNull();
    expect(isReparseMonthCovered("wage-rate", token!, "2026-03")).toBe(true);

    // Closing that line before the work date leaves the row without a wage: read again, the row
    // now carries the missing-wage error instead of the old amount.
    closeStoredEmployeeWageRate({ wageRateId: raised.id, effectiveTo: "2026-02-28" });

    expect(peekReparseMarker("wage-rate")).not.toBe(token);

    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayRow()?.hourlyRate ?? null).not.toBe(14500);
    expect(holidayRow()?.alerts.some((alert) => alert.severity === "error")).toBe(true);
  });
});


// F2: settling a re-read marker says "every pending file has now been judged by the new rule". A
// file whose analysis never reached the database was not judged at all.
describe("performance-management-service · unsaved re-read gate", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetPerformanceOverviewMarkerHoldForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  const blockEntryWrites = () => {
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    database.exec(`
      CREATE TRIGGER block_entry_writes BEFORE INSERT ON performance_entries
      WHEN (SELECT COUNT(*) FROM performance_entries WHERE performance_file_id = NEW.performance_file_id) >= 1
      BEGIN SELECT RAISE(ABORT, 'injected'); END;
    `);
  };

  const allowEntryWrites = () => {
    getSqliteDatabase()?.exec("DROP TRIGGER block_entry_writes");
  };

  const findHolidayWorkerId = (employeeCode: string) => {
    const worker = listStoredEmployees().find(
      (employee) => employee.employeeCode === employeeCode
    );

    if (!worker) {
      throw new Error("휴일 근무자를 찾지 못했습니다.");
    }

    return worker.id;
  };

  it("keeps the reparse marker when a file's analysis cannot be saved, and settles it once it can", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const workerId = findHolidayWorkerId(fixture.workers.holiday.employeeCode);
    const holidayWage = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) =>
          entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      )?.hourlyRate;

    await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(peekReparseMarker("wage-rate")).toBeNull();
    expect(holidayWage()).toBe(13200);

    saveStoredEmployeeWageRate({
      employeeId: workerId,
      hourlyRate: 14500,
      effectiveFrom: "2026-01-01",
      reason: "F2 unsaved re-read gate"
    });

    const token = peekReparseMarker("wage-rate");

    expect(token).not.toBeNull();

    blockEntryWrites();

    const failedOverview = await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(failedOverview.syncIssues.some((issue) => issue.kind === "persist-failed")).toBe(true);
    // Nothing was written, so nothing was re-read: the marker and the stored rows both stand.
    expect(peekReparseMarker("wage-rate")).toBe(token);
    expect(holidayWage()).toBe(13200);
    expect(getStoredPerformanceFileDetail(detail.id)?.entries).toHaveLength(3);

    allowEntryWrites();

    await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(holidayWage()).toBe(14500);
    expect(peekReparseMarker("wage-rate")).toBeNull();
  });

  // A file the scan could not OPEN is the same kind of unfinished re-read as one it could not save.
  // Its retry debt lives in memory, so settling the marker here would let a restart forget both the
  // debt and the reason for it, and the file would keep serving rows judged by the old wage.
  it("keeps the reparse marker when a file cannot be opened, and settles it once it can", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const workerId = findHolidayWorkerId(fixture.workers.holiday.employeeCode);
    const holidayWage = () =>
      getStoredPerformanceFileDetail(detail.id)?.entries.find(
        (entry) =>
          entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      )?.hourlyRate;

    await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(peekReparseMarker("wage-rate")).toBeNull();
    expect(holidayWage()).toBe(13200);

    saveStoredEmployeeWageRate({
      employeeId: workerId,
      hourlyRate: 14500,
      effectiveFrom: "2026-01-01",
      reason: "F3 unread re-read gate"
    });

    const token = peekReparseMarker("wage-rate");

    expect(token).not.toBeNull();

    // The workbook becomes unreadable for a moment - a lock, an antivirus hold, a cloud placeholder.
    const intactWorkbook = await readFile(fixture.filePath);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(fixture.filePath, Buffer.from("not a workbook"));

    const failedOverview = await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(failedOverview.syncIssues.some((issue) => issue.kind === "read-failure")).toBe(true);
    // The file was never judged by the new wage, so the marker keeps waiting.
    expect(peekReparseMarker("wage-rate")).toBe(token);
    expect(holidayWage()).toBe(13200);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(fixture.filePath, intactWorkbook);

    await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(holidayWage()).toBe(14500);
    expect(peekReparseMarker("wage-rate")).toBeNull();
  });

  it("releases the held marker after a few failed rounds so one file cannot freeze it", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);

    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const workerId = findHolidayWorkerId(fixture.workers.holiday.employeeCode);

    await listPerformanceOverview({ approvalScope: "pending" }, settings);
    saveStoredEmployeeWageRate({
      employeeId: workerId,
      hourlyRate: 14500,
      effectiveFrom: "2026-01-01",
      reason: "F2 hold cap"
    });

    const token = peekReparseMarker("wage-rate");

    expect(token).not.toBeNull();

    blockEntryWrites();

    for (let round = 0; round < 3; round += 1) {
      const held = await listPerformanceOverview({ approvalScope: "pending" }, settings);

      expect(held.syncIssues.some((issue) => issue.kind === "persist-failed")).toBe(true);
      expect(peekReparseMarker("wage-rate")).toBe(token);
    }

    const released = await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(peekReparseMarker("wage-rate")).toBeNull();
    expect(
      released.syncIssues.some((issue) => issue.message.includes("재분석 표시는 정리했으니"))
    ).toBe(true);
  });

  it("leaves approved rows and their amounts untouched across a failed and then successful re-read", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
    const workerId = findHolidayWorkerId(fixture.workers.holiday.employeeCode);

    // Only the holiday row is approved: the file stays in the pending folder, so the same overview
    // shows one settled row next to two that are still open.
    const holidayEntry = detail.entries.find(
      (entry) =>
        entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
    );

    if (!holidayEntry) {
      throw new Error("휴일 근무 행을 찾지 못했습니다.");
    }

    const approval = await approvePerformanceFile(
      { fileId: detail.id, entryId: holidayEntry.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    if (!approval.ok) {
      throw new Error(`${approval.errorCode}: ${approval.message}`);
    }

    const readApprovedRows = async () => {
      const overview = await listPerformanceOverview(
        { approvalScope: "pending", scheduleMonth: "2026-03" },
        settings
      );

      return overview.groups
        .flatMap((group) => group.rows)
        .filter((row) => row.approvalStatus === "approved")
        .map((row) => ({
          rowId: row.rowId,
          hourlyRate: row.entry.hourlyRate ?? null,
          totalWorkMinutes: row.entry.totalWorkMinutes
        }))
        .sort((left, right) => left.rowId.localeCompare(right.rowId));
    };

    const approvedBefore = await readApprovedRows();

    expect(approvedBefore).toHaveLength(1);
    expect(approvedBefore[0]?.hourlyRate).toBe(13200);

    saveStoredEmployeeWageRate({
      employeeId: workerId,
      hourlyRate: 14500,
      effectiveFrom: "2026-01-01",
      reason: "F2 approved rows unchanged"
    });

    blockEntryWrites();
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);
    allowEntryWrites();

    const approvedAfter = await readApprovedRows();

    expect(approvedAfter).toEqual(approvedBefore);
  });
});


// F7: approvals written before source signatures existed are compared field by field, alerts
// included. Closing a wage line raises a missing-wage error on a row whose source workbook never
// moved, and that alone used to send those approvals back to review - a half-applied T-2, which
// already keeps the wage itself out of the comparison.
describe("performance-management-service · legacy approvals and wage-derived alerts", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetPerformanceOverviewMarkerHoldForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  // Makes the stored approvals look like the ones taken before v0.4.20: their snapshot carries no
  // source signature, so the equivalence check falls back to the full field comparison.
  const stripSourceSignaturesFromApprovalSnapshots = () => {
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    const rows = database
      .prepare("SELECT id, snapshot_json FROM performance_approvals")
      .all() as Array<{ id: string; snapshot_json: string }>;
    const update = database.prepare(
      "UPDATE performance_approvals SET snapshot_json = ? WHERE id = ?"
    );

    rows.forEach((row) => {
      const snapshot = JSON.parse(row.snapshot_json);

      delete snapshot.entry.sourceSignature;
      update.run(JSON.stringify(snapshot), row.id);
    });

    return rows.length;
  };

  const approveAllButSubstitute = async (
    fixture: Awaited<ReturnType<typeof prepareReturnedScheduleFixture>>,
    detail: NonNullable<ReturnType<typeof getStoredPerformanceFileDetail>>
  ) => {
    // Two of the three rows: the file stays in 승인대기 partly approved, which is the shape F7 is
    // about, and no auto-archive runs.
    const targets = detail.entries.filter((entry) => entry.section !== "substitute");

    for (const entry of targets) {
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

      if (!result.ok) {
        throw new Error(`${result.errorCode}: ${result.message}`);
      }
    }

    return targets;
  };

  const readRows = async (fixture: Awaited<ReturnType<typeof prepareReturnedScheduleFixture>>) => {
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

    return { overview, rows: overview.groups.flatMap((group) => group.rows) };
  };

  it("keeps a legacy approval approved when a closed wage line only raises a missing-wage alert", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    await approveAllButSubstitute(fixture, detail);

    expect(stripSourceSignaturesFromApprovalSnapshots()).toBe(2);

    const before = await readRows(fixture);
    const approvedWagesBefore = before.rows
      .filter((row) => row.approvalStatus === "approved")
      .map((row) => [row.logicalKey, row.entry.hourlyRate] as const)
      .sort((left, right) => left[0].localeCompare(right[0]));

    expect(approvedWagesBefore).toHaveLength(2);
    expect(approvedWagesBefore.every(([, wage]) => typeof wage === "number")).toBe(true);

    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    // No wage line covers the work dates any more: every row is re-read with a missing-wage error.
    database.prepare(`
      UPDATE wage_rates
      SET effective_from = '2026-03-21',
          effective_to = NULL
    `).run();
    markWageRateReparseRequired();

    const after = await readRows(fixture);
    const approvedRows = after.rows.filter((row) => row.approvalStatus === "approved");

    expect(approvedRows).toHaveLength(2);
    expect(after.overview.needsReapprovalCount).toBe(0);
    expect(approvedRows.every((row) => row.needsReapproval === false)).toBe(true);
    expect(
      approvedRows
        .map((row) => [row.logicalKey, row.entry.hourlyRate] as const)
        .sort((left, right) => left[0].localeCompare(right[0]))
    ).toEqual(approvedWagesBefore);
    expect(
      approvedRows.every((row) =>
        row.entry.alerts.every((alert) => !alert.message.includes("시급"))
      )
    ).toBe(true);

    // The operator is not left blind: the row still waiting for approval carries the error.
    const pendingRow = after.rows.find((row) => row.approvalStatus === "pending");

    expect(
      pendingRow?.entry.alerts.some((alert) =>
        alert.message.includes("적용 시급을 찾지 못했습니다.")
      )
    ).toBe(true);
  });

  it("still sends a legacy approval back to review when the source workbook changes", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    await approveAllButSubstitute(fixture, detail);

    expect(stripSourceSignaturesFromApprovalSnapshots()).toBe(2);

    await restageReturnedScheduleFixture(fixture);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fixture.filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BE34").value = 2;
    await workbook.xlsx.writeFile(fixture.filePath);

    const after = await readRows(fixture);
    const overtimeRow = after.rows.find((row) => row.entry.section === "overtime");

    expect(after.overview.needsReapprovalCount).toBe(1);
    expect(overtimeRow?.approvalStatus).toBe("approved");
    expect(overtimeRow?.needsReapproval).toBe(true);
  });
});

// F1: the pending view called a row "완료" as soon as it had been approved in the current cycle,
// even when the workbook had changed again since - the same card could read 완료 3 / 재검토 1 and
// still offer 확정. The 완료 pill now means "approved and still unchanged".
describe("performance-management-service · reapproval completion follows the current rows (F1)", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetPerformanceOverviewMarkerHoldForTest();
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

  // 승인완료본 하나 + 그 위에 올라온 정정본(전 행 재승인 완료). 정정본은 승인완료 형제본이 있어
  // 자동 보관되지 않고 승인대기에 남는다.
  const prepareFullyReapprovedPendingFile = async () => {
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

    expect(getStoredPerformanceFileDetail(secondDetail.id)?.directoryType).toBe("pending");

    return { fixture, secondDetail };
  };

  const readPendingOverview = async (
    fixture: Awaited<ReturnType<typeof prepareReturnedScheduleFixture>>
  ) =>
    listPerformanceOverview(
      {
        approvalScope: "pending",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

  it("should send a re-approved row back to 재검토 when its workbook changed again", async () => {
    const { fixture, secondDetail } = await prepareFullyReapprovedPendingFile();

    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 3);

    const editedDetail = await syncPreparedReturnedSchedule(fixture);

    expect(editedDetail.id).toBe(secondDetail.id);

    const overview = await readPendingOverview(fixture);
    const rows = overview.groups.flatMap((group) => group.rows);
    const overtimeRow = rows.find((row) => row.entry.section === "overtime");

    expect(overtimeRow?.reapprovalStatus).toBe("pending");
    expect(overtimeRow?.needsReapproval).toBe(true);
    expect(overview.reapprovalFiles).toHaveLength(1);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      reapprovalCompletedCount: 2,
      reapprovalPendingCount: 1,
      needsReapprovalCount: 1,
      canFinalize: false
    });
  });

  // T-2: a wage change alone must never cost an approved row its approval, nor its amount.
  it("should keep re-approved rows finalizable after only the wage changed", async () => {
    const { fixture, secondDetail } = await prepareFullyReapprovedPendingFile();
    const amountsBefore = listApprovedAllowanceCalculationResults()
      .map((record) => `${record.entryId}:${record.hourlyRate}:${record.snapshot.totalAllowanceAmount}`)
      .sort();
    const storedWagesBefore = (getStoredPerformanceFileDetail(secondDetail.id)?.entries ?? [])
      .map((entry) => entry.hourlyRate ?? 0)
      .sort((left, right) => left - right);
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    database.prepare("UPDATE wage_rates SET hourly_rate = hourly_rate + 3000").run();
    markWageRateReparseRequired();

    const overview = await readPendingOverview(fixture);
    const rows = overview.groups.flatMap((group) => group.rows);

    // The re-read really happened: the stored rows now carry the new wage. What must not move is the
    // approval - and the amount it paid.
    expect(
      (getStoredPerformanceFileDetail(secondDetail.id)?.entries ?? [])
        .map((entry) => entry.hourlyRate ?? 0)
        .sort((left, right) => left - right)
    ).toEqual(storedWagesBefore.map((wage) => wage + 3000));
    expect(rows.every((row) => row.reapprovalStatus === "completed")).toBe(true);
    expect(overview.needsReapprovalCount).toBe(0);
    expect(overview.reapprovalFiles[0]).toMatchObject({
      reapprovalCompletedCount: 3,
      reapprovalPendingCount: 0,
      needsReapprovalCount: 0,
      canFinalize: true
    });

    const finalizeResult = await finalizeReapprovedPerformanceFile(
      { fileId: secondDetail.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(finalizeResult.ok).toBe(true);
    expect(
      listApprovedAllowanceCalculationResults()
        .map((record) => `${record.entryId}:${record.hourlyRate}:${record.snapshot.totalAllowanceAmount}`)
        .sort()
    ).toEqual(amountsBefore);
  });

  // The finalize gate refuses a row that gained a blocking non-wage error after it was approved.
  // The screen has to say the same thing, and it has to keep that error visible - it is shown from
  // the approval snapshot, which only knows the alerts the row had when it was approved.
  it("should mark a row 재검토 and show the error when it fell outside the employment period", async () => {
    const { fixture, secondDetail } = await prepareFullyReapprovedPendingFile();

    const overtimeEntry = secondDetail.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toBeDefined();

    const person = listStoredEmployees().find(
      (employee) => employee.employeeCode === overtimeEntry!.employeeCode
    );

    expect(person).toBeDefined();

    const dayAfterWork = new Date(`${overtimeEntry!.workDate}T00:00:00Z`);

    dayAfterWork.setUTCDate(dayAfterWork.getUTCDate() + 1);

    saveStoredEmployee({
      id: person!.id,
      employeeCode: person!.employeeCode,
      name: person!.name,
      employmentType: person!.employmentType,
      status: "active",
      hireDate: dayAfterWork.toISOString().slice(0, 10)
    });

    // Same workbook, new mtime: the rows come back equivalent and only the employment period moved.
    await restageReturnedScheduleFixture(fixture);
    await writeOvertimeEndHour(fixture.filePath, 2);

    const rereadDetail = await syncPreparedReturnedSchedule(fixture);

    expect(rereadDetail.id).toBe(secondDetail.id);

    const overview = await readPendingOverview(fixture);
    const rows = overview.groups.flatMap((group) => group.rows);
    const overtimeRow = rows.find((row) => row.entry.section === "overtime");

    expect(overtimeRow).toBeDefined();
    // The pill agrees with the finalize gate instead of promising a completion the server refuses.
    expect(overtimeRow!.reapprovalStatus).toBe("pending");
    // And the reason is on the row the operator is looking at.
    expect(
      overtimeRow!.entry.alerts.some(
        (alert) => alert.severity === "error" && alert.message.includes("고용 기간")
      )
    ).toBe(true);

    const summary = overview.reapprovalFiles.find((file) => file.fileId === rereadDetail.id);

    expect(summary).toBeDefined();
    expect(summary!.canFinalize).toBe(false);
  });

});
