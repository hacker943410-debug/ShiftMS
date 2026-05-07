import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getPerformanceFileDetail,
  getPendingPerformanceFileDetail,
  listPerformanceFiles,
  listPendingPerformanceFiles
} from "./performance-queue-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  getStoredPerformanceFileDetail,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import { syncPendingPerformanceFilesToStorage } from "./performance-file-intake-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "performance-queue");

describe("performance-queue-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should list queued returned schedule files with month and site metadata", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);

    const items = await listPendingPerformanceFiles();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      fileName: fixture.fileName,
      templateKind: "schedule-plan",
      status: "pending",
      scheduleMonth: "2026-03",
      siteName: "보라매DC",
      entryCount: 3,
      approvedEntryCount: 0
    });
  });

  it("should resolve queued file detail by the generated file id", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1",
      withHolidayWarning: true
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const queuedDetail = await getPendingPerformanceFileDetail(detail.id);

    expect(queuedDetail).not.toBeNull();
    expect(queuedDetail?.id).toBe(detail.id);
    expect(queuedDetail?.entries).toHaveLength(3);
    expect(queuedDetail?.entries.some((entry) => entry.section === "legal-holiday")).toBe(true);
    expect(queuedDetail?.entries.some((entry) => entry.section === "substitute")).toBe(true);
    expect(queuedDetail?.entries.some((entry) => entry.section === "overtime")).toBe(true);
  });

  it("should map approved lookup to approvedDir/YYYY-MM and parse archived files", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
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

    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();

    const approvedItems = await listPerformanceFiles(
      {
        status: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(approvedItems).toHaveLength(1);
    expect(approvedItems[0]).toMatchObject({
      fileName: fixture.fileName,
      status: "approved",
      scheduleMonth: "2026-03",
      siteName: "보라매DC",
      entryCount: 3,
      approvedEntryCount: 3
    });

    const approvedDetail = await getPerformanceFileDetail(
      {
        fileId: approvedItems[0]!.id,
        status: "approved",
        scheduleMonth: "2026-03"
      },
      {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    );

    expect(approvedDetail).not.toBeNull();
    expect(approvedDetail?.directoryType).toBe("approved");
    expect(approvedDetail?.entries).toHaveLength(3);
    expect(approvedDetail?.entries.every((entry) => entry.status === "approved")).toBe(true);
  });

  it("should recover a stale pending row even when a legacy approved status was left behind", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    database!.prepare(`
      UPDATE performance_files
      SET status = 'approved',
          schedule_month = '',
          site_name = '',
          schedule_key = '',
          entry_count = 0,
          approved_entry_count = 0,
          warning_count = 0,
          preview_json = '[]'
      WHERE id = ?
    `).run(detail.id);
    database!.prepare(`
      DELETE FROM performance_entries
      WHERE performance_file_id = ?
    `).run(detail.id);

    const issues = await syncPendingPerformanceFilesToStorage({
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      scheduleMonth: "2026-03"
    });
    const refreshed = getStoredPerformanceFileDetail(detail.id);

    expect(issues).toHaveLength(0);
    expect(refreshed?.directoryType).toBe("pending");
    expect(refreshed?.status).toBe("pending");
    expect(refreshed?.scheduleMonth).toBe("2026-03");
    expect(refreshed?.siteName).toBe("보라매DC");
    expect(refreshed?.entries).toHaveLength(3);
  });
});
