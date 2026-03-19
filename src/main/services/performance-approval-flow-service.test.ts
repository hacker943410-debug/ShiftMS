import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { approvePerformanceFile } from "./performance-approval-flow-service";
import {
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
import { resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "performance-approval-flow");

describe("performance-approval-flow-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should approve a single row while keeping the file pending until all rows are processed", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
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

    const pendingItems = await listPendingPerformanceFiles();

    expect(pendingItems).toHaveLength(1);
    expect(pendingItems[0]?.approvedEntryCount).toBe(1);
  });

  it("should archive the file and mark it effective after every parsed row is approved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
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
    expect(archivedDetail?.filePath).toContain(path.resolve(fixture.approvedDir, "2026-03"));
    expect(existsSync(archivedDetail?.filePath ?? "")).toBe(true);
  });

  it("should keep the previous approval as history and switch effectiveness to the latest re-approved file", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
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

    await restageReturnedScheduleFixture(fixture, { withHolidayWarning: true });

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
    expect(firstApproved?.isEffective).toBe(false);
    expect(secondApproved?.status).toBe("approved");
    expect(secondApproved?.isEffective).toBe(true);
  });
});
