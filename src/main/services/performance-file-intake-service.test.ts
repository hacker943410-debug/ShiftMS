import { rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyPerformanceFileWatchEventToStorage
} from "./performance-file-intake-service";
import {
  getStoredPerformanceFileDetail,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule
} from "./performance-test-helpers";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "performance-file-intake");

describe("performance-file-intake-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should sync a returned schedule workbook into sqlite and parse per-entry rows", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1",
      withHolidayWarning: true
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const holidayEntry = detail.entries.find((entry) => entry.section === "legal-holiday");
    const substituteEntry = detail.entries.find((entry) => entry.section === "substitute");
    const overtimeEntry = detail.entries.find((entry) => entry.section === "overtime");

    expect(detail.templateKind).toBe("schedule-plan");
    expect(detail.templateVariant).toBe("sample1");
    expect(detail.status).toBe("pending");
    expect(detail.scheduleMonth).toBe("2026-03");
    expect(detail.siteName).toBe("보라매DC");
    expect(detail.entries).toHaveLength(3);

    expect(holidayEntry).toMatchObject({
      employeeName: fixture.workers.holiday.name,
      workDate: "2026-03-01",
      workType: "holiday",
      totalWorkMinutes: 660,
      baseWorkMinutes: 480,
      overtimeMinutes: 180,
      nightMinutes: 0,
      breakMinutes: 60
    });
    expect(holidayEntry?.alerts[0]?.message).toContain("법정대체휴일근무 중복");

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      workDate: "2026-03-02",
      workType: "substitute",
      totalWorkMinutes: 420,
      baseWorkMinutes: 420,
      overtimeMinutes: 0,
      nightMinutes: 0,
      reason: "교육",
      evidence: "대체증적"
    });

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      workDate: "2026-03-03",
      workType: "overtime",
      startTime: "20:00",
      endTime: "01:00",
      totalWorkMinutes: 240,
      baseWorkMinutes: 0,
      overtimeMinutes: 120,
      nightMinutes: 120,
      breakMinutes: 60,
      reason: "긴급복구",
      evidence: "연장증적"
    });
  });

  it("should remove the stored pending detail by file path when the watch remove event arrives", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    const detail = await syncPreparedReturnedSchedule(fixture);

    rmSync(fixture.filePath, { force: true });

    const issue = await applyPerformanceFileWatchEventToStorage({
      type: "file-removed",
      filePath: fixture.filePath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    });

    expect(issue).toBeNull();
    expect(getStoredPerformanceFileDetail(detail.id)).toBeNull();
  });
});
