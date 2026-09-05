import { existsSync, renameSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { isReparseMonthCovered, peekReparseMarker } from "./app-settings-storage-service";
import { listApprovedAllowanceCalculationResults } from "./approved-allowance-calculation-service";
import { saveStoredEmployeeWageRate } from "./employee-history-service";
import { listStoredEmployees, saveStoredEmployee } from "./employee-storage-service";
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
import { listStoredSites } from "./site-storage-service";
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

    saveStoredEmployeeWageRate({
      employeeId: worker.id,
      hourlyRate: 14500,
      effectiveFrom: "2026-01-01",
      reason: "T-12 test"
    });
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    // Unchanged file, no marker: the stored rows are reused and still carry the old wage.
    expect(holidayWage()).toBe(13200);

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
    expect(holidayWage()).toBe(14500);

    // ...and, being month-scoped, recorded the month against the marker instead of spending it:
    // the next overview of the same month reuses the rows (a wage saved now stays out of them).
    const token = peekReparseMarker("employee-master");

    expect(token).not.toBeNull();
    expect(isReparseMonthCovered("employee-master", token!, "2026-03")).toBe(true);

    saveStoredEmployeeWageRate({
      employeeId: worker.id,
      hourlyRate: 15000,
      effectiveFrom: "2026-01-01",
      reason: "T-12 test, second save"
    });
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayWage()).toBe(14500);
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

    // The same month is not read again for this token: a wage saved now stays out of the rows.
    setWage(15000);
    await listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-03" }, settings);

    expect(holidayWage()).toBe(14500);
    expect(peekReparseMarker("employee-master")).toBe(token);

    // A full-period overview reads every month and spends the marker.
    await listPerformanceOverview({ approvalScope: "pending" }, settings);

    expect(holidayWage()).toBe(15000);
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
