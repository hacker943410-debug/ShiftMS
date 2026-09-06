import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyPerformanceFileWatchEventToStorage,
  buildPerformanceFileDetailFromPath,
  resetPerformanceFileReadFailureLedgerForTest,
  syncApprovedPerformanceFilesToStorage,
  syncPendingPerformanceFilesToStorage
} from "./performance-file-intake-service";
import { restoreMissingMonthlySchedulesFromExportedPlans } from "./monthly-schedule-restore-service";
import { recoverPerformanceDataOnStartup } from "./performance-startup-recovery-service";
import {
  getPerformanceStartupRecoveryStatusSnapshot,
  resetPerformanceStartupRecoveryStatusForTest
} from "./performance-startup-recovery-status-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPendingPerformanceFiles,
  listStoredPerformanceFileDetails,
  resetPerformanceFileStorageForTest,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture,
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
import { deleteStoredEmployee, listStoredEmployees } from "./employee-storage-service";

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
    resetPerformanceFileReadFailureLedgerForTest();
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
      baseWorkMinutes: 660,
      overtimeMinutes: 0,
      nightMinutes: 0,
      breakMinutes: 60
    });
    expect(holidayEntry?.alerts[0]?.message).toContain("반영하지 않고 원 근무자");

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
    expect(restoredHolidayEntry?.baseWorkMinutes).toBe(660);
    expect(restoredHolidayEntry?.overtimeMinutes).toBe(0);
  });

  it("should restore missing monthly schedules using archived historical employees", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const retiredEmployee = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );

    if (!retiredEmployee) {
      throw new Error("테스트 퇴사 인력을 찾지 못했습니다.");
    }

    database
      .prepare(
        `
          UPDATE employees
          SET status = 'retired',
              retire_date = ?
          WHERE id = ?
        `
      )
      .run("2026-04-01", retiredEmployee.id);
    database
      .prepare(
        `
          UPDATE employee_site_assignments
          SET status = 'ended',
              end_date = ?
          WHERE employee_id = ?
        `
      )
      .run("2026-04-01", retiredEmployee.id);
    database
      .prepare(
        `
          UPDATE wage_rates
          SET effective_to = ?
          WHERE employee_id = ?
            AND effective_to IS NULL
        `
      )
      .run("2026-03-31", retiredEmployee.id);

    deleteStoredEmployee(retiredEmployee.id);

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
    const restoredHolidayEntry = restoredDetail?.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(summary.restoredScheduleCount).toBe(1);
    expect(restoredHolidayEntry).toMatchObject({
      employeeCode: fixture.workers.holiday.employeeCode,
      hourlyRate: 13200,
      totalWorkMinutes: 660,
      baseWorkMinutes: 660,
      overtimeMinutes: 0
    });
  });

  it("should restore missing monthly schedules using historical assignments after transfer", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const transferredEmployee = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );
    const otherSite = database
      .prepare(
        `
          SELECT id
          FROM sites
          WHERE name <> ?
          LIMIT 1
        `
      )
      .get(fixture.siteName) as { id: string } | undefined;

    if (!transferredEmployee || !otherSite) {
      throw new Error("테스트 직무이동 인력 또는 대상 근무지를 찾지 못했습니다.");
    }

    database
      .prepare(
        `
          UPDATE employee_site_assignments
          SET status = 'ended',
              end_date = ?
          WHERE employee_id = ?
            AND status = 'active'
        `
      )
      .run("2026-04-01", transferredEmployee.id);
    database
      .prepare(
        `
          INSERT INTO employee_site_assignments (
            id,
            employee_id,
            site_id,
            team_name,
            shift_group,
            sort_order,
            start_date,
            end_date,
            status,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        "transfer-after-performance-month",
        transferredEmployee.id,
        otherSite.id,
        null,
        "A조",
        0,
        "2026-04-01",
        null,
        "active",
        "2026-04-01T00:00:00.000Z"
      );

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
    const restoredHolidayEntry = restoredDetail?.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(summary.restoredScheduleCount).toBe(1);
    expect(restoredHolidayEntry).toMatchObject({
      employeeCode: fixture.workers.holiday.employeeCode,
      hourlyRate: 13200,
      totalWorkMinutes: 660,
      baseWorkMinutes: 660,
      overtimeMinutes: 0
    });
  });

  it("should restore shift times for a pattern that uses non-D/E/N duty codes (A/B/C 3교대)", async () => {
    // Regression for the duty-code mapping bug: the shift pattern uses A/B/C letters while the grid
    // encodes Day/Evening/Night positions. Restore must classify A/B/C by time, otherwise the
    // restored schedule items carry no shift time and holiday work computes to 0 minutes / 0 수당.
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1",
      useNonStandardPatternDutyCodes: true
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    // The fixture's first saveStoredShiftPattern seeds 보라매DC with a native-D/N default pattern
    // ("보라매 4조 2교대"), which restore's choosePattern would otherwise pick first — meaning the A/B/C
    // pattern would never be read and this test would pass on the seed alone. Deactivate the seed so
    // restore MUST use the A/B/C pattern, making the classification genuinely load-bearing.
    database
      .prepare("UPDATE shift_patterns SET status = 'inactive' WHERE name = ?")
      .run("보라매 4조 2교대");

    const missingScheduleDetail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });

    // Before restore: no schedule -> 0 minutes.
    expect(
      missingScheduleDetail?.entries.find((entry) => entry.section === "legal-holiday")?.totalWorkMinutes
    ).toBe(0);

    upsertPerformanceFileDetail(missingScheduleDetail!);

    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({
      scheduleExportDir: fixture.exportDir
    });
    const restoredDetail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });
    const restoredHolidayEntry = restoredDetail?.entries.find(
      (entry) => entry.section === "legal-holiday"
    );

    expect(summary.restoredScheduleCount).toBe(1);
    // With the seed deactivated, restore reads the A/B/C pattern and must classify A (06:00-18:00) to
    // the grid "D" position. No grid code is left unresolved (A->D, B->E, C->N all map by time).
    expect(summary.issueMessages.some((message) => message.includes("시간을 확인하지 못"))).toBe(false);
    // Day (A, 06:00-18:00) -> grid "D" -> 660 minutes, all base (법정휴일=전부 기본근로). Fails if A/B/C are not classified by time
    // (the holiday worker would carry no shift time and compute to 0).
    expect(restoredHolidayEntry?.totalWorkMinutes).toBe(660);
    expect(restoredHolidayEntry?.baseWorkMinutes).toBe(660);
    expect(restoredHolidayEntry?.overtimeMinutes).toBe(0);
  });

  it("skips workers whose grid position has no usable pattern time and surfaces an unresolved-duty warning", async () => {
    // 0.4.24 skip+warn contract: restore chooses 보라매DC's seeded 2교대 pattern ("보라매 4조 2교대",
    // DDNNXX), which has only Day/Night windows — the grid's Evening column has no usable pattern time.
    // The exported plan still schedules an Evening worker (나래, the substitute original at 2026-03-02).
    // Restore must NOT persist a 0-time row for that worker — it skips the worker, keeps restoring the
    // resolvable Day worker (partial restore), and surfaces a warning so the resulting 0-minute outcome
    // is visible, not silent.
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const missingScheduleDetail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });

    upsertPerformanceFileDetail(missingScheduleDetail!);

    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({
      scheduleExportDir: fixture.exportDir
    });

    // The Day worker is still resolvable, so a (partial) schedule is saved.
    expect(summary.restoredScheduleCount).toBe(1);
    // The unresolved Evening position is surfaced as a warning naming the grid code.
    expect(
      summary.issueMessages.some(
        (message) => message.includes("시간을 확인하지 못") && message.includes("E")
      )
    ).toBe(true);

    // The skipped Evening worker must have NO monthly_schedule_item (the prior code persisted a
    // 0-time row; the new code drops the worker entirely).
    const skippedEveningRows = database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM monthly_schedule_items
           JOIN employees ON employees.id = monthly_schedule_items.employee_id
          WHERE employees.employee_code = ?`
      )
      .get(fixture.workers.substituteOriginal.employeeCode) as { count: number };
    expect(skippedEveningRows.count).toBe(0);

    // The resolvable Day worker IS persisted (partial restore proceeds).
    const restoredDayRows = database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM monthly_schedule_items
           JOIN employees ON employees.id = monthly_schedule_items.employee_id
          WHERE employees.employee_code = ?`
      )
      .get(fixture.workers.holiday.employeeCode) as { count: number };
    expect(restoredDayRows.count).toBeGreaterThan(0);
  });

  it("keeps a partially-restored month eligible for re-restore and replaces (not duplicates) it once the pattern resolves", async () => {
    // Finding-1 contract: a partial restore must NOT permanently block re-restore at (site, month). It
    // stays eligible; a re-run REPLACES the same row (no duplicate); and once the pattern resolves the
    // missing position, the row flips to a full restore and drops out of the target set.
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const detail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });
    upsertPerformanceFileDetail(detail!);

    const readSchedules = () =>
      database
        .prepare("SELECT id, generated_by AS generatedBy FROM monthly_schedules")
        .all() as Array<{ id: string; generatedBy: string }>;

    // 1) First restore: seeded 2교대 (D/N) pattern leaves the Evening worker unresolved -> PARTIAL.
    const first = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(first.restoredScheduleCount).toBe(1);
    const afterFirst = readSchedules();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.generatedBy).toBe("system-restore-partial");
    const partialId = afterFirst[0]!.id;

    // 2) Re-restore while still partial: the cell is STILL a target (not permanently blocked), but the
    //    result is identical, so it is NOT re-saved (restoredScheduleCount 0 -> startup skips reparse
    //    churn) and the same single row is left untouched.
    const second = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(second.checkedScheduleCount).toBe(1);
    expect(second.restoredScheduleCount).toBe(0);
    const afterSecond = readSchedules();
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.id).toBe(partialId);
    expect(afterSecond[0]!.generatedBy).toBe("system-restore-partial");

    // 3) Admin fixes the pattern: deactivate the seeded D/N pattern so the D/E/N pattern resolves Evening.
    database.prepare("UPDATE shift_patterns SET status = 'inactive' WHERE name = ?").run("보라매 4조 2교대");
    const third = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(third.restoredScheduleCount).toBe(1);
    expect(third.issueMessages.some((message) => message.includes("시간을 확인하지 못"))).toBe(false);
    const afterThird = readSchedules();
    expect(afterThird).toHaveLength(1); // still no duplicate row
    expect(afterThird[0]!.id).toBe(partialId); // same row reused
    expect(afterThird[0]!.generatedBy).toBe("system-restore"); // flipped to a full restore
    // The previously-skipped Evening worker is now persisted.
    const eveningRows = database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM monthly_schedule_items
           JOIN employees ON employees.id = monthly_schedule_items.employee_id
          WHERE employees.employee_code = ?`
      )
      .get(fixture.workers.substituteOriginal.employeeCode) as { count: number };
    expect(eveningRows.count).toBeGreaterThan(0);

    // 4) Now fully restored -> the cell is excluded from the target set.
    const fourth = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(fourth.checkedScheduleCount).toBe(0);
  });

  it("re-restores a legacy 'system-restore' schedule that still carries null-time rows (0.4.23 upgrade self-heal)", async () => {
    // A schedule saved by 0.4.23 persisted unresolved workers as null-time rows under generatedBy
    // "system-restore". On upgrade, 0.4.24 must treat such an incomplete row as re-restorable (not
    // "done") and REPLACE it in place, dropping the bogus null-time rows.
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const detail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });
    upsertPerformanceFileDetail(detail!);

    // Seed a legacy-shaped row: run the 0.4.24 restore, then forge it into the 0.4.23 shape — flip the
    // marker to "system-restore" and add a null-time Evening row for the worker 0.4.24 would skip.
    await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    const legacy = database.prepare("SELECT id FROM monthly_schedules").get() as { id: string };
    database.prepare("UPDATE monthly_schedules SET generated_by = 'system-restore' WHERE id = ?").run(legacy.id);
    const eveningEmployeeId = (
      database
        .prepare("SELECT id FROM employees WHERE employee_code = ?")
        .get(fixture.workers.substituteOriginal.employeeCode) as { id: string }
    ).id;
    database
      .prepare(
        `INSERT INTO monthly_schedule_items
           (id, schedule_id, employee_id, team_label, sort_order, work_date, duty_code, start_time, end_time, break_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("legacy-null-evening", legacy.id, eveningEmployeeId, null, 0, "2026-03-02", "E", null, null, 60);

    // Re-restore: the legacy row is incomplete (null-time item) -> re-processed and replaced in place.
    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(summary.restoredScheduleCount).toBe(1);

    // No null-time rows survive, the row is replaced in place (same id), now correctly partial-marked.
    const nullTimeRows = database
      .prepare(
        "SELECT COUNT(*) AS count FROM monthly_schedule_items WHERE start_time IS NULL OR end_time IS NULL"
      )
      .get() as { count: number };
    expect(nullTimeRows.count).toBe(0);
    const rows = database
      .prepare("SELECT id, generated_by AS generatedBy FROM monthly_schedules")
      .all() as Array<{ id: string; generatedBy: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(legacy.id);
    expect(rows[0]!.generatedBy).toBe("system-restore-partial");
  });

  it("flips a stuck partial marker to full when the unresolved worker no longer appears in the export roster", async () => {
    // Idempotency must compare the marker, not just items: if the unresolved worker disappears, the
    // items are unchanged but the cell is now complete, so the marker must flip partial -> full instead
    // of staying stuck on 'system-restore-partial' (and a permanent re-restore target) forever.
    const fixture = await prepareReturnedScheduleFixture({ rootDir: testRoot, templateVariant: "sample1" });
    const database = getSqliteDatabase()!;
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    const detail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });
    upsertPerformanceFileDetail(detail!);

    const first = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(first.restoredScheduleCount).toBe(1);
    const partial = database
      .prepare("SELECT id, generated_by AS generatedBy FROM monthly_schedules")
      .get() as { id: string; generatedBy: string };
    expect(partial.generatedBy).toBe("system-restore-partial");

    // Rename the Evening worker so the export's name no longer resolves to an employee (simulates the
    // worker leaving the roster); the Evening column then yields no unresolved duty.
    database
      .prepare("UPDATE employees SET name = '근무자아님' WHERE employee_code = ?")
      .run(fixture.workers.substituteOriginal.employeeCode);

    const second = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(second.restoredScheduleCount).toBe(1); // re-saved to flip the marker (not idempotent-skipped)
    const afterSecond = database
      .prepare("SELECT id, generated_by AS generatedBy FROM monthly_schedules")
      .all() as Array<{ id: string; generatedBy: string }>;
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.id).toBe(partial.id);
    expect(afterSecond[0]!.generatedBy).toBe("system-restore");

    // Now complete -> no longer a re-restore target.
    const third = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(third.checkedScheduleCount).toBe(0);
  });

  it("re-restores a 'system-restore' row whose only item is a degenerate window (phantom 24h shift)", async () => {
    // isCompleteRestore must reject 0-item and degenerate (start===end) rows so a legacy/forged row that
    // would compute a phantom ~24h shift downstream is re-restored and repaired rather than judged done.
    const fixture = await prepareReturnedScheduleFixture({ rootDir: testRoot, templateVariant: "sample1" });
    const database = getSqliteDatabase()!;
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    const detail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });
    upsertPerformanceFileDetail(detail!);

    await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    const row = database.prepare("SELECT id FROM monthly_schedules").get() as { id: string };
    // Forge a complete-looking legacy row whose Day item is a degenerate 08:00-08:00 window.
    database.prepare("UPDATE monthly_schedules SET generated_by = 'system-restore' WHERE id = ?").run(row.id);
    database
      .prepare("UPDATE monthly_schedule_items SET start_time = '08:00', end_time = '08:00' WHERE schedule_id = ?")
      .run(row.id);

    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(summary.checkedScheduleCount).toBe(1); // degenerate row treated as incomplete, not "done"
    expect(summary.restoredScheduleCount).toBe(1); // re-processed and replaced

    // The degenerate window is gone; the Day worker carries the real pattern time.
    const degenerate = database
      .prepare("SELECT COUNT(*) AS count FROM monthly_schedule_items WHERE start_time = end_time")
      .get() as { count: number };
    expect(degenerate.count).toBe(0);
    const dayItem = database
      .prepare(
        `SELECT start_time AS startTime, end_time AS endTime
           FROM monthly_schedule_items
           JOIN employees ON employees.id = monthly_schedule_items.employee_id
          WHERE employees.employee_code = ?`
      )
      .get(fixture.workers.holiday.employeeCode) as { startTime: string; endTime: string };
    expect(dayItem.startTime).toBe("06:00");
    expect(dayItem.endTime).toBe("18:00");
  });

  it("re-restores to correct a partial row whose only drift is team/sort metadata", async () => {
    // The item signature includes teamLabel/sortOrder, so a row whose only corruption is that metadata
    // is detected and reconciled by a re-restore instead of being idempotent-skipped.
    const fixture = await prepareReturnedScheduleFixture({ rootDir: testRoot, templateVariant: "sample1" });
    const database = getSqliteDatabase()!;
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    const detail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });
    upsertPerformanceFileDetail(detail!);

    await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    const row = database.prepare("SELECT id FROM monthly_schedules").get() as { id: string };
    database
      .prepare("UPDATE monthly_schedule_items SET team_label = 'WRONG', sort_order = 99 WHERE schedule_id = ?")
      .run(row.id);

    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(summary.restoredScheduleCount).toBe(1); // metadata drift detected -> re-saved, not skipped
    const dayItem = database
      .prepare(
        `SELECT team_label AS teamLabel, sort_order AS sortOrder
           FROM monthly_schedule_items
           JOIN employees ON employees.id = monthly_schedule_items.employee_id
          WHERE employees.employee_code = ?`
      )
      .get(fixture.workers.holiday.employeeCode) as { teamLabel: string; sortOrder: number };
    expect(dayItem.teamLabel).toBe("A조");
    expect(dayItem.sortOrder).not.toBe(99);
  });

  it("self-heals a hidden retired worker's null-time row that the active-item view would mask as complete", async () => {
    // Completeness/signature are judged on RAW items: a 'system-restore' row whose only VISIBLE item is
    // a usable Day shift but which also holds a retired worker's null-time row (hidden by the retired
    // filter) must still be treated as incomplete and re-restored, dropping the hidden null row.
    const fixture = await prepareReturnedScheduleFixture({ rootDir: testRoot, templateVariant: "sample1" });
    const database = getSqliteDatabase()!;
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    const detail = await buildPerformanceFileDetailFromPath({
      filePath: fixture.filePath,
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      forceReparse: true
    });
    upsertPerformanceFileDetail(detail!);

    await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    const row = database.prepare("SELECT id FROM monthly_schedules").get() as { id: string };
    database.prepare("UPDATE monthly_schedules SET generated_by = 'system-restore' WHERE id = ?").run(row.id);

    // Retire the Evening worker and add their null-time row dated after the retire date, so the active
    // (retired-filtered) view hides it and the schedule's visible items look complete.
    database
      .prepare("UPDATE employees SET status = 'retired', retire_date = '2026-03-01' WHERE employee_code = ?")
      .run(fixture.workers.substituteOriginal.employeeCode);
    const retiredEmployeeId = (
      database
        .prepare("SELECT id FROM employees WHERE employee_code = ?")
        .get(fixture.workers.substituteOriginal.employeeCode) as { id: string }
    ).id;
    database
      .prepare(
        `INSERT INTO monthly_schedule_items
           (id, schedule_id, employee_id, team_label, sort_order, work_date, duty_code, start_time, end_time, break_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("hidden-retired-null", row.id, retiredEmployeeId, null, 0, "2026-03-02", "E", null, null, 60);

    // The raw-items check must still flag the schedule incomplete and re-restore + clean up the hidden row.
    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({ scheduleExportDir: fixture.exportDir });
    expect(summary.checkedScheduleCount).toBe(1); // not masked as "done" by the active-item view
    expect(summary.restoredScheduleCount).toBe(1);
    const nullTimeRows = database
      .prepare(
        "SELECT COUNT(*) AS count FROM monthly_schedule_items WHERE start_time IS NULL OR end_time IS NULL"
      )
      .get() as { count: number };
    expect(nullTimeRows.count).toBe(0);
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
    expect(updatedSnapshot.entry?.overtimeMinutes).toBe(0);
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

  it("should surface a startup recovery status when an exported schedule cannot be restored", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const approvedPath = path.resolve(fixture.approvedDir, fixture.fileName);

    // Reproduce the field condition: monthly schedules are gone AND the exported workbook that
    // restore would rebuild them from is missing from the deploy folder.
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    rmSync(fixture.exportDir, { recursive: true, force: true });
    await copyFile(fixture.filePath, approvedPath);

    const approvedDetail = await buildPerformanceFileDetailFromPath({
      filePath: approvedPath,
      settings: {
        pendingDir: fixture.pendingDir,
        approvedDir: fixture.approvedDir
      },
      forceReparse: true
    });

    if (!approvedDetail) {
      throw new Error("승인완료 테스트 파일 파싱 결과를 찾지 못했습니다.");
    }

    upsertPerformanceFileDetail({
      ...approvedDetail,
      status: "approved",
      approvedEntryCount: approvedDetail.entryCount ?? approvedDetail.entries.length
    });

    resetPerformanceStartupRecoveryStatusForTest();

    const recovery = await recoverPerformanceDataOnStartup({
      userDataPath: fixture.userDataPath
    });
    const status = getPerformanceStartupRecoveryStatusSnapshot();

    expect(recovery.monthlyScheduleRestore.restoredScheduleCount).toBe(0);
    expect(status.hasRun).toBe(true);
    // The (site, month) that could not be recovered must be surfaced (not silently left at 0 min).
    expect(status.skippedScheduleCount).toBeGreaterThan(0);
    expect(status.issues.length).toBeGreaterThan(0);
    expect(status.skippedScheduleCount).toBe(
      recovery.monthlyScheduleRestore.skippedScheduleCount
    );
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

  it("should keep the last analysis when a pending workbook can no longer be opened", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    expect(detail.entries).toHaveLength(3);

    // The bytes on disk are unreadable now - the same thing the app sees for a locked file, a
    // half-copied file or a share that went offline mid-read.
    writeFileSync(fixture.filePath, "이 파일은 더 이상 워크북이 아닙니다.");

    const issues = await syncPendingPerformanceFilesToStorage({
      settings,
      scheduleMonth: "2026-03"
    });
    const readFailureIssue = issues.find((issue) => issue.fileName === fixture.fileName);

    expect(readFailureIssue?.kind).toBe("read-failure");
    expect(readFailureIssue?.severity).toBe("warning");

    const kept = getStoredPerformanceFileDetail(detail.id);

    expect(kept?.entries).toHaveLength(3);
    expect(kept?.scheduleMonth).toBe("2026-03");
    expect(kept?.siteName).toBe(detail.siteName);
    expect(kept?.status).toBe("pending");
    expect(
      listStoredPerformanceFileDetails({
        directoryTypes: ["pending"],
        scheduleMonth: "2026-03"
      }).map((item) => item.id)
    ).toContain(detail.id);

    await restageReturnedScheduleFixture(fixture);
    await syncPendingPerformanceFilesToStorage({
      settings,
      scheduleMonth: "2026-03"
    });

    const recovered = getStoredPerformanceFileDetail(detail.id);

    expect(recovered?.entries).toHaveLength(3);
    expect(recovered?.status).toBe("pending");
  });

  it("should keep a rejected pending file rejected when its workbook cannot be opened", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    upsertPerformanceFileDetail({ ...detail, status: "rejected" });
    writeFileSync(fixture.filePath, "반려된 파일도 열리지 않는다.");

    await syncPendingPerformanceFilesToStorage({
      settings,
      scheduleMonth: "2026-03"
    });

    const kept = getStoredPerformanceFileDetail(detail.id);

    expect(kept?.status).toBe("rejected");
    expect(kept?.entries).toHaveLength(3);
    expect(kept?.scheduleMonth).toBe("2026-03");
  });

  it("should stop reopening a pending workbook that keeps failing, without losing its analysis", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    writeFileSync(fixture.filePath, "언제 열어도 실패하는 파일.");

    let lastIssueMessage = "";

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const issues = await syncPendingPerformanceFilesToStorage({
        settings,
        scheduleMonth: "2026-03"
      });

      lastIssueMessage = issues.find((issue) => issue.fileName === fixture.fileName)?.message ?? "";
    }

    expect(lastIssueMessage).toContain("여러 번");
    expect(getStoredPerformanceFileDetail(detail.id)?.entries).toHaveLength(3);
  });

  it("should report a format rejection as a parse verdict and not reopen the file every scan", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await syncPreparedReturnedSchedule(fixture);

    const unsupportedFileName = "2026_3_잘못된양식.xlsx";
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    await writeUnsupportedWorkbook(path.resolve(fixture.pendingDir, unsupportedFileName));

    const firstIssues = await syncPendingPerformanceFilesToStorage({
      settings,
      scheduleMonth: "2026-03"
    });
    const firstIssue = firstIssues.find((issue) => issue.fileName === unsupportedFileName);

    expect(firstIssue?.kind).toBe("parse");
    expect(firstIssue?.severity).toBe("error");

    // Reused, not opened again: the reuse branch re-reports the stored verdict without a kind.
    const secondIssues = await syncPendingPerformanceFilesToStorage({
      settings,
      scheduleMonth: "2026-03"
    });
    const secondIssue = secondIssues.find((issue) => issue.fileName === unsupportedFileName);

    expect(secondIssue).toBeDefined();
    expect(secondIssue?.kind).toBeUndefined();
  });

  it("should skip pruning pending rows when the pending folder cannot be listed", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    // Not "the folder is empty" but "the folder cannot be read" - the difference between deleting
    // every stored row and leaving them alone.
    rmSync(fixture.pendingDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    writeFileSync(fixture.pendingDir, "폴더가 아니다");

    const issues = await syncPendingPerformanceFilesToStorage({ settings });

    expect(getStoredPerformanceFileDetail(detail.id)?.entries).toHaveLength(3);
    expect(
      issues.some(
        (issue) => issue.severity === "warning" && issue.message.includes("목록 정리를 건너뛰었습니다")
      )
    ).toBe(true);
  });

  it("should keep an approved archive analysis when a forced refresh cannot open the file", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const approvedPath = path.resolve(fixture.approvedDir, fixture.fileName);
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    await copyFile(fixture.filePath, approvedPath);
    await syncApprovedPerformanceFilesToStorage({ settings });

    const archived = listStoredPerformanceFileDetails({ directoryTypes: ["approved"] })[0];

    expect(archived?.entries).toHaveLength(3);
    expect(archived?.status).toBe("approved");

    writeFileSync(approvedPath, "보관본을 더 이상 열 수 없다.");

    const issues = await syncApprovedPerformanceFilesToStorage({
      settings,
      forceReparse: true
    });

    expect(issues.find((issue) => issue.fileName === fixture.fileName)?.kind).toBe("read-failure");

    const kept = getStoredPerformanceFileDetail(archived!.id);

    expect(kept?.entries).toHaveLength(3);
    expect(kept?.status).toBe("approved");
    expect(kept?.scheduleMonth).toBe("2026-03");
    expect(kept?.siteName).toBe(archived?.siteName);
  });

  it("should recover an approved archive row that was frozen as an unread error", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const approvedPath = path.resolve(fixture.approvedDir, fixture.fileName);
    const settings = {
      pendingDir: fixture.pendingDir,
      approvedDir: fixture.approvedDir
    };

    await copyFile(fixture.filePath, approvedPath);
    await syncApprovedPerformanceFilesToStorage({ settings });

    const archived = listStoredPerformanceFileDetails({ directoryTypes: ["approved"] })[0];
    const database = getSqliteDatabase();

    if (!archived || !database) {
      throw new Error("승인완료 보관본을 준비하지 못했습니다.");
    }

    // What a version that overwrote the archive with a failed read left behind: the file's real
    // size and modified time on a row that knows nothing, so every later scan called it unchanged.
    database.prepare(`
      UPDATE performance_files
      SET status = 'error',
          template_kind = 'unknown',
          sheet_name = '',
          row_count = 0,
          column_count = 0,
          schedule_month = '',
          site_name = '',
          schedule_key = '',
          entry_count = 0,
          preview_json = '[]',
          error_message = 'EBUSY: resource busy or locked'
      WHERE id = ?
    `).run(archived.id);
    database.prepare("DELETE FROM performance_entries WHERE performance_file_id = ?").run(archived.id);

    await syncApprovedPerformanceFilesToStorage({ settings });

    const recovered = getStoredPerformanceFileDetail(archived.id);

    expect(recovered?.status).toBe("approved");
    expect(recovered?.entries).toHaveLength(3);
    expect(recovered?.scheduleMonth).toBe("2026-03");
  });
});
