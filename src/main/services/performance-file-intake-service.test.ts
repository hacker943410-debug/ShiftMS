import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyPerformanceFileWatchEventToStorage,
  buildPerformanceFileDetailFromPath,
  syncApprovedPerformanceFilesToStorage,
  syncPendingPerformanceFilesToStorage
} from "./performance-file-intake-service";
import { restoreMissingMonthlySchedulesFromExportedPlans } from "./monthly-schedule-restore-service";
import { recoverPerformanceDataOnStartup } from "./performance-startup-recovery-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPendingPerformanceFiles,
  resetPerformanceFileStorageForTest,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule
} from "./performance-test-helpers";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  createPerformanceApprovalRecord,
  getPerformanceApprovalById,
  hasApprovedSnapshotMissingSourceSignature
} from "./performance-approval-service";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";
import { resolvePerformanceEntryApprovalState } from "./performance-approval-resolution-service";

const testRoot = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  `performance-file-intake-${process.pid}`
);

const updateReturnedWorkbook = async (
  filePath: string,
  update: (worksheet: ExcelJS.Worksheet) => void
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  update(worksheet);
  await workbook.xlsx.writeFile(filePath);
};

const writeUnsupportedWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();

  workbook.addWorksheet("잘못된 양식");
  await workbook.xlsx.writeFile(filePath);
};

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
    expect(detail.entries.every((entry) => entry.sourceSignature?.startsWith("returned-schedule-source:v1:"))).toBe(
      true
    );

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
      totalWorkMinutes: 270,
      baseWorkMinutes: 0,
      overtimeMinutes: 120,
      nightMinutes: 150,
      breakMinutes: 30,
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

  it("should backfill approved snapshots with source signatures when approved files are reparsed", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const approvedPath = path.resolve(fixture.approvedDir, fixture.fileName);

    await copyFile(fixture.filePath, approvedPath);

    const approvedDetail = await buildPerformanceFileDetailFromPath({
      filePath: approvedPath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    });
    const approvedEntry = approvedDetail?.entries.find((entry) => entry.section === "legal-holiday");

    if (!approvedDetail || !approvedEntry) {
      throw new Error("승인완료 테스트 파일 파싱 결과를 찾지 못했습니다.");
    }

    const legacySnapshotEntry = {
      ...approvedEntry,
      sourceSignature: undefined
    };
    const legacyApproval = createPerformanceApprovalRecord({
      fileId: approvedDetail.id,
      entry: approvedEntry,
      fileName: approvedDetail.fileName,
      processedBy: "admin",
      processedByName: "관리자",
      snapshotJson: JSON.stringify({
        fileId: approvedDetail.id,
        fileName: approvedDetail.fileName,
        filePath: approvedDetail.filePath,
        scheduleMonth: approvedDetail.scheduleMonth,
        siteName: approvedDetail.siteName,
        scheduleKey: approvedDetail.scheduleKey,
        templateKind: approvedDetail.templateKind,
        templateVariant: approvedDetail.templateVariant,
        sheetName: approvedDetail.sheetName,
        duplicateKey: approvedDetail.duplicateKey,
        receivedAt: approvedDetail.receivedAt,
        entry: legacySnapshotEntry
      })
    });

    expect(hasApprovedSnapshotMissingSourceSignature(approvedDetail.id)).toBe(true);

    const issues = await syncApprovedPerformanceFilesToStorage({
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    });

    expect(issues).toHaveLength(0);
    expect(hasApprovedSnapshotMissingSourceSignature(approvedDetail.id)).toBe(false);

    const updatedApproval = getPerformanceApprovalById(legacyApproval.id);
    const updatedSnapshot = JSON.parse(updatedApproval?.snapshotJson ?? "{}") as {
      entry?: { sourceSignature?: string };
    };

    expect(updatedSnapshot.entry?.sourceSignature).toBe(approvedEntry.sourceSignature);
  });

  it("should reparse unchanged approved files when legacy snapshots are missing source signatures", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const approvedPath = path.resolve(fixture.approvedDir, fixture.fileName);

    await copyFile(fixture.filePath, approvedPath);

    const approvedDetail = await buildPerformanceFileDetailFromPath({
      filePath: approvedPath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    });
    const approvedEntry = approvedDetail?.entries.find((entry) => entry.section === "legal-holiday");

    if (!approvedDetail || !approvedEntry) {
      throw new Error("승인완료 테스트 파일 파싱 결과를 찾지 못했습니다.");
    }

    upsertPerformanceFileDetail({
      ...approvedDetail,
      status: "approved",
      approvedEntryCount: approvedDetail.entryCount ?? approvedDetail.entries.length,
      entries: approvedDetail.entries.map((entry) => ({
        ...entry,
        sourceSignature: undefined
      }))
    });

    const legacyApproval = createPerformanceApprovalRecord({
      fileId: approvedDetail.id,
      entry: approvedEntry,
      fileName: approvedDetail.fileName,
      processedBy: "admin",
      processedByName: "관리자",
      snapshotJson: JSON.stringify({
        fileId: approvedDetail.id,
        fileName: approvedDetail.fileName,
        filePath: approvedDetail.filePath,
        scheduleMonth: approvedDetail.scheduleMonth,
        siteName: approvedDetail.siteName,
        scheduleKey: approvedDetail.scheduleKey,
        templateKind: approvedDetail.templateKind,
        templateVariant: approvedDetail.templateVariant,
        sheetName: approvedDetail.sheetName,
        duplicateKey: approvedDetail.duplicateKey,
        receivedAt: approvedDetail.receivedAt,
        entry: {
          ...approvedEntry,
          sourceSignature: undefined
        }
      })
    });

    await syncApprovedPerformanceFilesToStorage({
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    });

    const updatedApproval = getPerformanceApprovalById(legacyApproval.id);
    const updatedSnapshot = JSON.parse(updatedApproval?.snapshotJson ?? "{}") as {
      entry?: { sourceSignature?: string };
    };

    expect(updatedSnapshot.entry?.sourceSignature).toBe(approvedEntry.sourceSignature);
  });

  it("should restore missing monthly schedules from exported plans before reparsing returned files", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const missingScheduleDetail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      forceReparse: true
    });

    expect(missingScheduleDetail?.entries.find((entry) => entry.section === "legal-holiday")?.totalWorkMinutes).toBe(0);

    upsertPerformanceFileDetail(missingScheduleDetail!);

    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({
      scheduleExportDir: fixture.exportDir
    });
    const restoredDetail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      forceReparse: true
    });
    const restoredHolidayEntry = restoredDetail?.entries.find((entry) => entry.section === "legal-holiday");

    expect(summary.restoredScheduleCount).toBe(1);
    expect(restoredHolidayEntry?.totalWorkMinutes).toBe(660);
    expect(restoredHolidayEntry?.overtimeMinutes).toBe(180);
  });

  it("should backfill approved snapshot source signatures during startup recovery without navigation", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const approvedPath = path.resolve(fixture.approvedDir, fixture.fileName);

    await copyFile(fixture.filePath, approvedPath);

    const approvedDetail = await buildPerformanceFileDetailFromPath({
      filePath: approvedPath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      }
    });
    const approvedEntry = approvedDetail?.entries.find((entry) => entry.section === "legal-holiday");

    if (!approvedDetail || !approvedEntry) {
      throw new Error("승인완료 테스트 파일 파싱 결과를 찾지 못했습니다.");
    }

    upsertPerformanceFileDetail({
      ...approvedDetail,
      status: "approved",
      approvedEntryCount: approvedDetail.entryCount ?? approvedDetail.entries.length,
      entries: approvedDetail.entries.map((entry) => ({
        ...entry,
        sourceSignature: undefined
      }))
    });

    const legacyApproval = createPerformanceApprovalRecord({
      fileId: approvedDetail.id,
      entry: approvedEntry,
      fileName: approvedDetail.fileName,
      processedBy: "admin",
      processedByName: "관리자",
      snapshotJson: JSON.stringify({
        fileId: approvedDetail.id,
        fileName: approvedDetail.fileName,
        filePath: approvedDetail.filePath,
        scheduleMonth: approvedDetail.scheduleMonth,
        siteName: approvedDetail.siteName,
        scheduleKey: approvedDetail.scheduleKey,
        templateKind: approvedDetail.templateKind,
        templateVariant: approvedDetail.templateVariant,
        sheetName: approvedDetail.sheetName,
        duplicateKey: approvedDetail.duplicateKey,
        receivedAt: approvedDetail.receivedAt,
        entry: {
          ...approvedEntry,
          sourceSignature: undefined
        }
      })
    });

    await recoverPerformanceDataOnStartup({
      userDataPath: fixture.userDataPath
    });

    const updatedApproval = getPerformanceApprovalById(legacyApproval.id);
    const updatedSnapshot = JSON.parse(updatedApproval?.snapshotJson ?? "{}") as {
      entry?: { sourceSignature?: string };
    };

    expect(updatedSnapshot.entry?.sourceSignature).toBe(approvedEntry.sourceSignature);
  });

  it("should rebaseline approved holiday snapshots after restoring monthly schedules", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const approvedPath = path.resolve(fixture.approvedDir, fixture.fileName);

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    await copyFile(fixture.filePath, approvedPath);

    const missingScheduleApprovedDetail = await buildPerformanceFileDetailFromPath({
      filePath: approvedPath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      forceReparse: true
    });
    const zeroMinuteHolidayEntry = missingScheduleApprovedDetail?.entries.find(
      (entry) => entry.section === "legal-holiday"
    );

    if (!missingScheduleApprovedDetail || !zeroMinuteHolidayEntry) {
      throw new Error("스케줄 누락 승인완료 테스트 파일 파싱 결과를 찾지 못했습니다.");
    }

    expect(zeroMinuteHolidayEntry.totalWorkMinutes).toBe(0);

    upsertPerformanceFileDetail({
      ...missingScheduleApprovedDetail,
      status: "approved",
      approvedEntryCount:
        missingScheduleApprovedDetail.entryCount ?? missingScheduleApprovedDetail.entries.length
    });

    const legacyApproval = createPerformanceApprovalRecord({
      fileId: missingScheduleApprovedDetail.id,
      entry: zeroMinuteHolidayEntry,
      fileName: missingScheduleApprovedDetail.fileName,
      processedBy: "admin",
      processedByName: "관리자",
      snapshotJson: JSON.stringify({
        fileId: missingScheduleApprovedDetail.id,
        fileName: missingScheduleApprovedDetail.fileName,
        filePath: missingScheduleApprovedDetail.filePath,
        scheduleMonth: missingScheduleApprovedDetail.scheduleMonth,
        siteName: missingScheduleApprovedDetail.siteName,
        scheduleKey: missingScheduleApprovedDetail.scheduleKey,
        templateKind: missingScheduleApprovedDetail.templateKind,
        templateVariant: missingScheduleApprovedDetail.templateVariant,
        sheetName: missingScheduleApprovedDetail.sheetName,
        duplicateKey: missingScheduleApprovedDetail.duplicateKey,
        receivedAt: missingScheduleApprovedDetail.receivedAt,
        entry: zeroMinuteHolidayEntry
      })
    });

    const recovery = await recoverPerformanceDataOnStartup({
      userDataPath: fixture.userDataPath
    });
    const updatedApproval = getPerformanceApprovalById(legacyApproval.id);
    const updatedSnapshot = JSON.parse(updatedApproval?.snapshotJson ?? "{}") as {
      entry?: {
        totalWorkMinutes?: number;
        overtimeMinutes?: number;
        sourceSignature?: string;
      };
    };

    expect(recovery.monthlyScheduleRestore.restoredScheduleCount).toBe(1);
    expect(updatedSnapshot.entry?.totalWorkMinutes).toBe(660);
    expect(updatedSnapshot.entry?.overtimeMinutes).toBe(180);
    expect(updatedSnapshot.entry?.sourceSignature).toContain("\"scheduleItem\"");

    // Self-ignition guard: after restore corrects the minutes, the rebaselined
    // approval must stay approved (the migration must not re-trigger reapproval).
    const rebaselinedDetail = await buildPerformanceFileDetailFromPath({
      filePath: approvedPath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      forceReparse: true
    });
    const restoredHolidayEntry = rebaselinedDetail?.entries.find(
      (entry) => entry.section === "legal-holiday"
    );

    if (!restoredHolidayEntry) {
      throw new Error("복구 후 법정공휴일 항목을 찾지 못했습니다.");
    }

    expect(restoredHolidayEntry.totalWorkMinutes).toBe(660);

    const resolved = resolvePerformanceEntryApprovalState({
      entry: restoredHolidayEntry,
      latestApproval: updatedApproval ?? null
    });

    expect(resolved.needsReapproval).toBe(false);
    expect(resolved.satisfied).toBe(true);
  });

  it("should limit pending sync to the selected nested year and month folder", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const selectedMonthDir = path.resolve(fixture.pendingDir, "2026년", "3월");
    const otherMonthDir = path.resolve(fixture.pendingDir, "2026년", "4월");
    const selectedMonthPath = path.resolve(selectedMonthDir, fixture.fileName);
    const invalidOtherMonthPath = path.resolve(otherMonthDir, "2026_4_보라매DC.xlsx");
    const invalidWorkbook = new ExcelJS.Workbook();

    mkdirSync(selectedMonthDir, { recursive: true });
    mkdirSync(otherMonthDir, { recursive: true });
    renameSync(fixture.filePath, selectedMonthPath);
    invalidWorkbook.addWorksheet("잘못된 양식");
    await invalidWorkbook.xlsx.writeFile(invalidOtherMonthPath);

    const issues = await syncPendingPerformanceFilesToStorage({
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      scheduleMonth: "2026-03"
    });
    const queued = listStoredPendingPerformanceFiles();

    expect(issues).toHaveLength(0);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.scheduleMonth).toBe("2026-03");
    expect(queued[0]?.fileName).toBe(fixture.fileName);
  });

  it("should report an issue when a pending Excel file does not match the returned schedule format", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const selectedMonthDir = path.resolve(fixture.pendingDir, "2026년", "3월");
    const invalidFilePath = path.resolve(selectedMonthDir, "2026_3_잘못된양식.xlsx");
    const invalidWorkbook = new ExcelJS.Workbook();

    mkdirSync(selectedMonthDir, { recursive: true });
    invalidWorkbook.addWorksheet("잘못된 양식");
    await invalidWorkbook.xlsx.writeFile(invalidFilePath);

    const issues = await syncPendingPerformanceFilesToStorage({
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      scheduleMonth: "2026-03"
    });

    expect(issues.some((issue) => issue.filePath === invalidFilePath)).toBe(true);
    expect(issues.find((issue) => issue.filePath === invalidFilePath)?.message).toContain(
      "실적 파일 파싱 규격이 일치하지 않습니다"
    );
  });

  it("should reparse known changed files during full-period sync even after the new file limit is reached", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };
    const targetPath = fixture.filePath;

    await syncPendingPerformanceFilesToStorage({
      settings,
      scheduleMonth: "2026-03"
    });

    const initialQueued = listStoredPendingPerformanceFiles().find(
      (item) => item.fileName === fixture.fileName
    );
    const initialDetail = initialQueued
      ? getStoredPerformanceFileDetail(initialQueued.id)
      : null;

    expect(initialDetail?.entries.some((entry) => entry.logicalKey.endsWith(":holiday:12:D:1"))).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await updateReturnedWorkbook(targetPath, (worksheet) => {
      worksheet.getCell("AA12").value = "홍길동";
      worksheet.getCell("AM12").value = fixture.workers.holidayReplacement.name;
    });

    for (let index = 0; index < 20; index += 1) {
      await writeUnsupportedWorkbook(
        path.resolve(fixture.pendingDir, `2026_3_A${String(index).padStart(2, "0")}.xlsx`)
      );
    }

    await syncPendingPerformanceFilesToStorage({
      settings
    });

    const updatedQueued = listStoredPendingPerformanceFiles().find(
      (item) => item.fileName === fixture.fileName
    );
    const updatedDetail = updatedQueued
      ? getStoredPerformanceFileDetail(updatedQueued.id)
      : null;

    expect(
      updatedDetail?.entries.some(
        (entry) =>
          entry.logicalKey.endsWith(":holiday:12:D:1") &&
          entry.employeeName === fixture.workers.holidayReplacement.name
      )
    ).toBe(true);
  });

  it("should prune missing pending files during full-period sync even when new files exceed the parse limit", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    await syncPendingPerformanceFilesToStorage({
      settings,
      scheduleMonth: "2026-03"
    });

    const queued = listStoredPendingPerformanceFiles().find(
      (item) => item.fileName === fixture.fileName
    );

    expect(queued).toBeDefined();

    renameSync(fixture.filePath, path.resolve(fixture.rootDir, "removed-source.xlsx"));
    expect(existsSync(fixture.filePath)).toBe(false);

    for (let index = 0; index < 21; index += 1) {
      await writeUnsupportedWorkbook(
        path.resolve(fixture.pendingDir, `2026_3_B${String(index).padStart(2, "0")}.xlsx`)
      );
    }

    await syncPendingPerformanceFilesToStorage({
      settings
    });

    expect(getStoredPerformanceFileDetail(queued!.id)).toBeNull();
  });
});
