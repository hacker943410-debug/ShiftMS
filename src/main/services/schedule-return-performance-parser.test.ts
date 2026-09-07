import { randomUUID } from "node:crypto";
import { copyFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import { buildAllowanceRateTable } from "../../shared/domain/allowance-rate-matrix";
import { createAllowanceCalculationSnapshot } from "../../shared/domain/allowance-service";
import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import {
  deleteStoredEmployee,
  listStoredEmployees,
  saveStoredEmployee
} from "./employee-storage-service";
import {
  closeStoredEmployeeAssignment,
  listStoredEmployeeAssignments,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate
} from "./employee-history-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { arePerformanceEntriesEquivalent } from "./performance-approval-resolution-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} from "./performance-test-helpers";
import { parseReturnedSchedulePerformanceFile } from "./schedule-return-performance-parser";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "schedule-return-performance-parser");

const addCalendarDays = (date: string, days: number) => {
  const shifted = new Date(`${date}T00:00:00Z`);

  shifted.setUTCDate(shifted.getUTCDate() + days);

  return shifted.toISOString().slice(0, 10);
};

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

const getSiteIdByName = (siteName: string) => {
  const site = listStoredSites().find((item) => item.name === siteName);

  if (!site) {
    throw new Error(`테스트 근무지를 찾지 못했습니다: ${siteName}`);
  }

  return site.id;
};

const getEmployeeByCode = (employeeCode: string) => {
  const employee = listStoredEmployees().find((item) => item.employeeCode === employeeCode);

  if (!employee || !employee.currentSiteId) {
    throw new Error(`테스트 직원을 찾지 못했습니다: ${employeeCode}`);
  }

  return { id: employee.id, siteId: employee.currentSiteId };
};

// 근무지 설정 2단계(조직 구성)에서 시작일을 넣어 조를 옮기는 경로. 옛 배정은 그 날짜로 끊기고
// 새 배정이 그 날부터 시작하므로 기간이 겹치지 않는다.
const moveEmployeeToTeam = (employeeCode: string, shiftGroup: string, startDate: string) => {
  const employee = getEmployeeByCode(employeeCode);

  saveStoredEmployeeAssignment({
    employeeId: employee.id,
    siteId: employee.siteId,
    shiftGroup,
    startDate
  });
};

const calculateTestAllowanceAmount = (entry: PerformanceEntryRecord) => {
  const rateVersion = allowanceRateVersionFixtures[0]!;
  const snapshot = createAllowanceCalculationSnapshot({
    calculationId: `calculation-${entry.id}`,
    performanceApprovalId: `approval-${entry.id}`,
    calculationVersion: 1,
    createdAt: "2026-03-31T00:00:00+09:00",
    approvedSnapshot: {
      performanceFileId: entry.performanceFileId,
      performanceEntryId: entry.id,
      approvalStatus: "approved",
      approvedAt: "2026-03-31T00:00:00+09:00",
      approvedBy: "tester",
      holidayCalendarId: "holiday-calendar-2026",
      allowanceRateVersionId: rateVersion.id,
      sourceFileChecksum: "test"
    },
    workDate: entry.workDate,
    timeRange: {
      startTime: entry.startTime ?? "",
      endTime: entry.endTime ?? "",
      breakMinutes: entry.breakMinutes
    },
    hourlyRate: entry.hourlyRate ?? 0,
    isHoliday: entry.workType === "holiday",
    workType: entry.workType,
    rateTable: buildAllowanceRateTable(rateVersion)
  });

  return snapshot.totalAllowanceAmount;
};

describe("schedule-return-performance-parser", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should parse template2 returned workbooks using the shifted row sections", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample2"
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-sample2"
    });
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");

    expect(parsed.templateVariant).toBe("sample2");
    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe("보라매DC");
    expect(parsed.entries).toHaveLength(3);

    expect(holidayEntry).toMatchObject({
      employeeName: fixture.workers.holiday.name,
      workType: "holiday",
      dutyCode: "D",
      teamLabel: "A조",
      totalWorkMinutes: 660
    });

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      workType: "substitute",
      teamLabel: "B조",
      reason: "교육",
      evidence: "대체증적"
    });

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      workType: "overtime",
      startTime: "20:00",
      endTime: "01:00",
      employeeRank: "사원",
      teamLabel: "D조",
      breakMinutes: 30,
      totalWorkMinutes: 270,
      overtimeMinutes: 120,
      nightMinutes: 150
    });
    expect(parsed.previewRows[0]?.["근로유형"]).toBe("법정휴일근무");
  });

  it("should parse Hong Gil-dong placeholder with a changed worker as legal holiday work", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("Z12").value = "홍길동";
      worksheet.getCell("AL12").value = fixture.workers.holidayReplacement.name;
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = "홍길동";
      worksheet.getCell("BE11").value = fixture.workers.substituteReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-hong-holiday"
    });
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");

    expect(holidayEntry).toMatchObject({
      employeeName: fixture.workers.holidayReplacement.name,
      workType: "holiday",
      dutyCode: "D",
      totalWorkMinutes: 660,
      note: "홍길동 기준 법정휴일근로"
    });
    expect(holidayEntry?.alerts.some((alert) => alert.message.includes("홍길동"))).toBe(false);
    expect(
      parsed.entries.some(
        (entry) => entry.section === "substitute" && entry.note === "원 근무자 홍길동"
      )
    ).toBe(false);
  });

  it("should keep worksheet site name when a returned file has a duplicate name suffix", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const duplicatePath = path.resolve(fixture.pendingDir, `2026_3_${fixture.siteName}_1.xlsx`);

    await copyFile(fixture.filePath, duplicatePath);
    await updateReturnedWorkbook(duplicatePath, (worksheet) => {
      worksheet.getCell("W6").value = new Date(2023, 11, 1);
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: duplicatePath,
      fileId: "schedule-return-duplicate-name-suffix"
    });

    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should parse site-first file names while using the worksheet site name", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const returnedPath = path.resolve(
      fixture.pendingDir,
      `${fixture.siteName}_2026-03_${fixture.siteName}_4조_2교대.xlsx`
    );

    await copyFile(fixture.filePath, returnedPath);
    await updateReturnedWorkbook(returnedPath, (worksheet) => {
      worksheet.getCell("W6").value = new Date(2023, 11, 1);
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: returnedPath,
      fileId: "schedule-return-site-first-file-name"
    });

    expect(parsed.scheduleMonth).toBe("2026-03");
    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should normalize duplicate suffixes from the worksheet site name", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("C3").value = `${fixture.siteName}_dup01`;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-worksheet-site-duplicate-suffix"
    });

    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should use the worksheet site name when the file name does not contain identity metadata", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const returnedPath = path.resolve(fixture.pendingDir, "returned-schedule.xlsx");

    await copyFile(fixture.filePath, returnedPath);
    await updateReturnedWorkbook(returnedPath, (worksheet) => {
      worksheet.getCell("C3").value = `${fixture.siteName}_dup01`;
      worksheet.getCell("W6").value = new Date(2026, 2, 1);
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: returnedPath,
      fileId: "schedule-return-worksheet-site-fallback"
    });

    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  it("should preserve bare trailing digits in parsed site names", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const siteNameWithDigit = `${fixture.siteName}1`;
    const returnedPath = path.resolve(fixture.pendingDir, `2026_3_${siteNameWithDigit}.xlsx`);

    await copyFile(fixture.filePath, returnedPath);
    await updateReturnedWorkbook(returnedPath, (worksheet) => {
      worksheet.getCell("C3").value = siteNameWithDigit;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: returnedPath,
      fileId: "schedule-return-bare-digit-site-name"
    });

    expect(parsed.siteName).toBe(siteNameWithDigit);
    expect(parsed.scheduleKey).toBe(`2026-03:${siteNameWithDigit.replace(/\s+/g, "").toLowerCase()}`);
  });

  it("should prefer the parsed file site name when the worksheet site name was edited", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("C3").value = "잘못된근무지";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-edited-worksheet-site-name"
    });

    expect(parsed.siteName).toBe(fixture.siteName);
    expect(parsed.scheduleKey).toBe(fixture.scheduleKey);
  });

  // 근무표는 찾았는데 그 날 근무의 시간 칸이 비어 있는 경우 - 근무 설정에 그 근무의 시작·종료
  // 시각을 채우지 않은 채 근무표를 만들면 이렇게 된다. 이미 저장돼 있던 실적 시각이 0분으로
  // 덮이는데, 예전에는 알림이 하나도 없었다: 운영자는 0:00만 보고 이유를 알 수 없었고, 0원짜리
  // 줄을 그대로 승인할 수도 있었다. 오류여야 승인(validateApprovalEntry)이 거절한다.
  it("should flag a schedule row that carries no work time instead of silently zeroing it", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("UPDATE monthly_schedule_items SET start_time = NULL, end_time = NULL").run();

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-blank-schedule-time"
    });

    const scheduleRows = parsed.entries.filter(
      (entry) => entry.section === "legal-holiday" || entry.section === "substitute"
    );

    expect(scheduleRows.length).toBeGreaterThan(0);

    for (const row of scheduleRows) {
      expect(row.totalWorkMinutes).toBe(0);

      const alert = row.alerts.find((item) => item.reasonCode === "schedule-work-time-missing");

      expect(alert?.severity).toBe("error");
      expect(alert?.message).toContain("근무지 설정의 근무시간");
    }

    // 연장근무는 엑셀 칸에서 직접 시각을 읽으므로 근무표와 무관하다.
    const overtimeRow = parsed.entries.find((entry) => entry.section === "overtime");

    expect(overtimeRow?.startTime).toBeTruthy();
    expect(
      overtimeRow?.alerts.some((item) => item.reasonCode === "schedule-work-time-missing")
    ).toBe(false);
  });

  // 근무표 저장본 자체가 없을 때는 기존 안내가 이미 붙는다. 두 알림이 겹쳐 뜨면 안 된다.
  it("should not add the blank-work-time alert when the schedule itself is missing", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-missing-schedule-no-double-alert"
    });

    const scheduleRows = parsed.entries.filter(
      (entry) => entry.section === "legal-holiday" || entry.section === "substitute"
    );

    expect(scheduleRows.length).toBeGreaterThan(0);
    expect(
      scheduleRows.every((row) =>
        row.alerts.some((item) => item.message.includes("월간 근무표 저장본이 없어"))
      )
    ).toBe(true);
    expect(
      scheduleRows.some((row) =>
        row.alerts.some((item) => item.reasonCode === "schedule-work-time-missing")
      )
    ).toBe(false);
  });

  it("should change the holiday source signature when the stored schedule source changes", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const firstParsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-source-signature-before"
    });
    const firstHolidayEntry = firstParsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );
    const database = getSqliteDatabase()!;

    database
      .prepare(
        `
          UPDATE monthly_schedule_items
          SET start_time = ?, end_time = ?, break_minutes = ?
          WHERE work_date = ?
            AND duty_code = ?
        `
      )
      .run("07:00", "19:00", 90, "2026-03-01", "D");

    const secondParsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-source-signature-after"
    });
    const secondHolidayEntry = secondParsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(firstHolidayEntry?.sourceSignature).toBeTruthy();
    expect(secondHolidayEntry?.sourceSignature).toBeTruthy();
    expect(secondHolidayEntry?.sourceSignature).not.toBe(firstHolidayEntry?.sourceSignature);
    // Counter-test for the display-only reduction below: a real schedule time edit must STILL
    // send the approved row back to review.
    expect(arePerformanceEntriesEquivalent(firstHolidayEntry!, secondHolidayEntry!)).toBe(false);
  });

  // G9: reordering the members of a team, or renaming the team, rewrites the monthly schedule rows.
  // Those fields are display-only for a legal-holiday row, yet they travelled into the raw source
  // signature, so an untouched workbook sent every approved holiday row back to review the moment
  // the operator tidied up a team. The signature itself is never rewritten (that would flip every
  // stored approval at once) - the equivalence check reduces both sides before comparing.
  it("should keep a holiday row equivalent when only schedule display fields moved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const firstParsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-display-drift-before"
    });
    const firstHolidayEntry = firstParsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );
    const database = getSqliteDatabase()!;

    database
      .prepare(
        `
          UPDATE monthly_schedule_items
          SET sort_order = COALESCE(sort_order, 0) + 100,
              team_label = 'Z조'
          WHERE employee_id IN (SELECT id FROM employees WHERE employee_code = ?)
        `
      )
      .run(fixture.workers.holiday.employeeCode);

    const secondParsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-display-drift-after"
    });
    const secondHolidayEntry = secondParsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(firstHolidayEntry).toBeTruthy();
    expect(secondHolidayEntry).toBeTruthy();
    expect(secondHolidayEntry?.teamLabel).toBe("Z조");
    expect(secondHolidayEntry?.totalWorkMinutes).toBe(firstHolidayEntry?.totalWorkMinutes);
    // The raw signature really does differ - nothing rewrites what was stored.
    expect(secondHolidayEntry?.sourceSignature).not.toBe(firstHolidayEntry?.sourceSignature);
    // ...and the approval still stands.
    expect(arePerformanceEntriesEquivalent(firstHolidayEntry!, secondHolidayEntry!)).toBe(true);
  });

  it("should use the returned duty column time before the replacement worker own schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const schedule = database
      .prepare(
        `
          SELECT id
          FROM monthly_schedules
          WHERE schedule_month = ?
            AND site_id = ?
          LIMIT 1
        `
      )
      .get("2026-03", getSiteIdByName(fixture.siteName)) as { id: string } | undefined;
    const eveningReferenceEmployee = database
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(fixture.workers.substituteOriginal.employeeCode) as { id: string } | undefined;
    const replacementEmployee = database
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(fixture.workers.holidayReplacement.employeeCode) as { id: string } | undefined;

    if (!schedule || !eveningReferenceEmployee || !replacementEmployee) {
      throw new Error("테스트 근무표 또는 인력 정보를 찾지 못했습니다.");
    }

    database
      .prepare(
        `
          INSERT INTO monthly_schedule_items (
            id,
            schedule_id,
            employee_id,
            team_label,
            sort_order,
            work_date,
            duty_code,
            start_time,
            end_time,
            break_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        randomUUID(),
        schedule.id,
        eveningReferenceEmployee.id,
        "B조",
        10,
        "2026-03-01",
        "E",
        "14:00",
        "22:00",
        60
      );
    database
      .prepare(
        `
          INSERT INTO monthly_schedule_items (
            id,
            schedule_id,
            employee_id,
            team_label,
            sort_order,
            work_date,
            duty_code,
            start_time,
            end_time,
            break_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        randomUUID(),
        schedule.id,
        replacementEmployee.id,
        "C조",
        11,
        "2026-03-01",
        "N",
        "18:00",
        "06:00",
        90
      );

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("AD12").value = "홍길동";
      worksheet.getCell("AP12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-duty-column-before-worker-schedule"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.note === "홍길동 기준 법정휴일근로" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(holidayEntry).toMatchObject({
      dutyCode: "E",
      startTime: "14:00",
      endTime: "22:00",
      breakMinutes: 60
    });
  });

  it("should use the duty code slot time for an unscheduled changed worker on a holiday row", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database
      .prepare(
        `
          UPDATE monthly_schedule_items
          SET work_date = ?
          WHERE work_date = ?
            AND duty_code = ?
        `
      )
      .run("2026-03-31", "2026-03-01", "D");

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("Z12").value = "홍길동";
      worksheet.getCell("AL12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-holiday-duty-code-only-slot-time"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holidayReplacement.name &&
        entry.note === "홍길동 기준 법정휴일근로"
    );

    expect(holidayEntry).toMatchObject({
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00",
      breakMinutes: 60,
      totalWorkMinutes: 660
    });
    expect(calculateTestAllowanceAmount(holidayEntry!)).toBeGreaterThan(0);
  });

  it("should fall back to the duty-code slot time for a real holiday worker missing from the schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample2"
    });
    const database = getSqliteDatabase()!;
    const holidayEmployee = database
      .prepare(`SELECT id FROM employees WHERE employee_code = ? LIMIT 1`)
      .get(fixture.workers.holiday.employeeCode) as { id: string } | undefined;

    if (!holidayEmployee) {
      throw new Error("테스트 휴일 투입자 정보를 찾지 못했습니다.");
    }

    // Move the real holiday worker's own schedule rows off the holiday date so they can no longer be
    // resolved by name on 2026-03-01, while the D-duty slot time still exists (any-date fallback).
    database
      .prepare(
        `UPDATE monthly_schedule_items SET work_date = ? WHERE work_date = ? AND employee_id = ?`
      )
      .run("2026-03-31", "2026-03-01", holidayEmployee.id);

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-holiday-real-worker-duty-fallback"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
    );

    // Old code resolved the schedule only by worker name → null → 0 minutes; the duty-code fallback
    // now sources the fixed slot time even though the worker is absent from the (partial) schedule.
    expect(holidayEntry).toMatchObject({
      dutyCode: "D",
      totalWorkMinutes: 660
    });
    expect(
      holidayEntry?.alerts.some((alert) => alert.message.includes("개인 근무표 기준을 찾지 못해"))
    ).toBe(true);
    expect(calculateTestAllowanceAmount(holidayEntry!)).toBeGreaterThan(0);
  });

  it("should warn when falling back to the replacement worker own schedule", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;
    const schedule = database
      .prepare(
        `
          SELECT id
          FROM monthly_schedules
          WHERE schedule_month = ?
            AND site_id = ?
          LIMIT 1
        `
      )
      .get("2026-03", getSiteIdByName(fixture.siteName)) as { id: string } | undefined;
    const replacementEmployee = database
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(fixture.workers.holidayReplacement.employeeCode) as { id: string } | undefined;

    if (!schedule || !replacementEmployee) {
      throw new Error("테스트 근무표 또는 대체 투입자 정보를 찾지 못했습니다.");
    }

    database
      .prepare(
        `
          DELETE FROM monthly_schedule_items
          WHERE duty_code = ?
        `
      )
      .run("E");

    database
      .prepare(
        `
          INSERT INTO monthly_schedule_items (
            id,
            schedule_id,
            employee_id,
            team_label,
            sort_order,
            work_date,
            duty_code,
            start_time,
            end_time,
            break_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        randomUUID(),
        schedule.id,
        replacementEmployee.id,
        "C조",
        11,
        "2026-03-01",
        "N",
        "18:00",
        "06:00",
        90
      );

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("AD12").value = "홍길동";
      worksheet.getCell("AP12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-worker-schedule-fallback-alert"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.note === "홍길동 기준 법정휴일근로" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(holidayEntry).toMatchObject({
      dutyCode: "N",
      startTime: "18:00",
      endTime: "06:00",
      breakMinutes: 90
    });
    expect(
      holidayEntry?.alerts.some((alert) =>
        alert.message.includes("근무열 기준을 찾지 못해 투입자 원래 근무시간을 사용했습니다")
      )
    ).toBe(true);
  });

  it("should skip BP workers that are shown only for schedule visibility", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BG34").value = "BP(외부인력)";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-bp-skip"
    });

    expect(parsed.entries.some((entry) => entry.employeeName === "BP(외부인력)")).toBe(false);
    expect(parsed.entries.some((entry) => entry.section === "overtime")).toBe(false);
    expect(parsed.entries).toHaveLength(2);
  });

  it("should skip a Hong Gil-dong duty slot when the actual worker is explicitly None", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("Z12").value = "홍길동";
      worksheet.getCell("AL12").value = "None";
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = "홍길동";
      worksheet.getCell("BE11").value = fixture.workers.substituteReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-hong-substitute"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.workDate === "2026-03-01" &&
        entry.note === "홍길동 기준 법정휴일근로"
    );
    const substituteEntry = parsed.entries.find(
      (entry) =>
        entry.section === "substitute" &&
        entry.workDate === "2026-03-01" &&
        entry.note === "원 근무자 홍길동"
    );

    expect(holidayEntry).toBeUndefined();
    expect(substituteEntry).toBeUndefined();
  });

  it("should use the duty code slot time for an empty original substitute slot", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      expect(worksheet.getCell("AA12").value).toBe("-");
      worksheet.getCell("AM12").value = fixture.workers.substituteReplacement.name;
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = "-";
      worksheet.getCell("BE11").value = fixture.workers.substituteReplacement.name;
      worksheet.getCell("BG11").value = "빈 슬롯 대체";
      worksheet.getCell("BJ11").value = "운영자 변경";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-empty-slot-substitute-duty-time"
    });
    const substituteEntry = parsed.entries.find(
      (entry) =>
        entry.section === "substitute" &&
        entry.employeeName === fixture.workers.substituteReplacement.name &&
        entry.workDate === "2026-03-01"
    );

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      workDate: "2026-03-01",
      workType: "substitute",
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00",
      breakMinutes: 60,
      totalWorkMinutes: 660,
      baseWorkMinutes: 480,
      overtimeMinutes: 180,
      reason: "빈 슬롯 대체",
      evidence: "운영자 변경",
      note: "원 근무자 -"
    });
    expect(calculateTestAllowanceAmount(substituteEntry!)).toBeGreaterThan(0);
  });

  it("should skip legal holiday work for a real scheduled worker when the actual worker is explicitly None", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("AL12").value = "None";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-real-worker-none-changed-cell"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(holidayEntry).toBeUndefined();
  });

  it("should skip legal holiday work when the returned change table marks the actual worker as None", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BA11").value = "2026-03-01";
      worksheet.getCell("BC11").value = fixture.workers.holiday.name;
      worksheet.getCell("BE11").value = "None";
      worksheet.getCell("BG11").value = "법정휴일 근무 취소";
      worksheet.getCell("BJ11").value = "운영자 확인";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-real-worker-none-change-table"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );
    const substituteEntry = parsed.entries.find(
      (entry) =>
        entry.section === "substitute" &&
        entry.workDate === "2026-03-01" &&
        entry.note === `원 근무자 ${fixture.workers.holiday.name}`
    );

    expect(holidayEntry).toBeUndefined();
    expect(substituteEntry).toBeUndefined();
  });

  it("should parse a manually filled empty duty slot on a holiday row", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      expect(worksheet.getCell("AA12").value).toBe("-");
      worksheet.getCell("AA12").value = "홍길동";
      worksheet.getCell("AM12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-manual-empty-duty-slot"
    });
    const manualEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.workDate === "2026-03-01" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(manualEntry).toMatchObject({
      employeeName: fixture.workers.holidayReplacement.name,
      workDate: "2026-03-01",
      workType: "holiday",
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00"
    });
    expect(manualEntry?.logicalKey.endsWith(":holiday:12:D:1")).toBe(true);
  });

  it("should parse an after-only worker in an empty holiday duty slot", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      expect(worksheet.getCell("AA12").value).toBe("-");
      worksheet.getCell("AM12").value = fixture.workers.holidayReplacement.name;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-after-only-empty-duty-slot"
    });
    const manualEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.workDate === "2026-03-01" &&
        entry.employeeName === fixture.workers.holidayReplacement.name
    );

    expect(manualEntry).toMatchObject({
      employeeName: fixture.workers.holidayReplacement.name,
      workDate: "2026-03-01",
      workType: "holiday",
      dutyCode: "D",
      startTime: "06:00",
      endTime: "18:00"
    });
    expect(manualEntry?.logicalKey.endsWith(":holiday:12:D:1")).toBe(true);
  });

  it("should keep rows visible with row alerts when the stored monthly schedule is missing", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const database = getSqliteDatabase()!;

    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-missing-stored-schedule"
    });

    expect(parsed.alerts.some((alert) => alert.message.includes("월간 근무표 저장본을 찾지 못했습니다"))).toBe(
      true
    );
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      workType: "overtime",
      section: "overtime",
      totalWorkMinutes: 270
    });
    expect(holidayEntry).toMatchObject({
      workType: "holiday",
      section: "legal-holiday",
      totalWorkMinutes: 0
    });
    expect(substituteEntry).toMatchObject({
      workType: "substitute",
      section: "substitute",
      totalWorkMinutes: 0
    });
    expect(
      [holidayEntry, substituteEntry].every((entry) =>
        entry?.alerts.some(
          (alert) =>
            alert.severity === "error" &&
            alert.message.includes("월간 근무표 저장본이 없어 근무시간을 산출할 수 없습니다")
        )
      )
    ).toBe(true);
  });

  it("should calculate past performance for an archived retired employee", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const retiredEmployee = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );
    const database = getSqliteDatabase()!;

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

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-archived-retired-worker"
    });
    const holidayEntry = parsed.entries.find(
      (entry) =>
        entry.section === "legal-holiday" &&
        entry.employeeName === fixture.workers.holiday.name
    );

    expect(holidayEntry).toMatchObject({
      employeeCode: fixture.workers.holiday.employeeCode,
      hourlyRate: 13200,
      totalWorkMinutes: 660,
      baseWorkMinutes: 660,
      overtimeMinutes: 0
    });
    expect(
      holidayEntry?.alerts.some(
        (alert) =>
          alert.severity === "error" &&
          (alert.message.includes("인력 정보를 찾지 못했습니다") ||
            alert.message.includes("시급"))
      )
    ).toBe(false);
  });

  // T-1: the wage on a row is the line in force on its WORK DATE, read at parse time. A wage saved
  // later changes nothing already parsed; parsing again reads the new line, with inclusive bounds.
  it("stamps the wage in force on the work date, and only a new parse picks up a wage saved later", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const first = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-wage-on-work-date-1"
    });
    const findHolidayEntry = (entries: typeof first.entries) =>
      entries.find(
        (entry) =>
          entry.section === "legal-holiday" && entry.employeeName === fixture.workers.holiday.name
      );
    const firstEntry = findHolidayEntry(first.entries);

    if (!firstEntry) {
      throw new Error("휴일 근무 행을 찾지 못했습니다.");
    }

    expect(firstEntry.hourlyRate).toBe(13200);

    const worker = listStoredEmployees({ includeDeleted: true } as never).find(
      (employee) => employee.employeeCode === fixture.workers.holiday.employeeCode
    );

    if (!worker) {
      throw new Error("휴일 근무자를 찾지 못했습니다.");
    }

    const addDays = (isoDate: string, days: number) => {
      const date = new Date(`${isoDate}T00:00:00Z`);

      date.setUTCDate(date.getUTCDate() + days);

      return date.toISOString().slice(0, 10);
    };

    // A line starting ON the work date applies to it (inclusive start).
    saveStoredEmployeeWageRate({
      employeeId: worker.id,
      hourlyRate: 14500,
      effectiveFrom: firstEntry.workDate,
      reason: "T-1 test"
    });

    // Nothing already parsed moved.
    expect(firstEntry.hourlyRate).toBe(13200);

    const second = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-wage-on-work-date-2"
    });

    expect(findHolidayEntry(second.entries)?.hourlyRate).toBe(14500);

    // A line starting the day AFTER the work date does not apply to it.
    saveStoredEmployeeWageRate({
      employeeId: worker.id,
      hourlyRate: 15500,
      effectiveFrom: addDays(firstEntry.workDate, 1),
      reason: "T-1 test"
    });

    const third = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-wage-on-work-date-3"
    });

    expect(findHolidayEntry(third.entries)?.hourlyRate).toBe(14500);
  });

  it("should keep Pool substitute workers in history without making them payable", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BE11").value = `${fixture.workers.substituteReplacement.name}(P)`;
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-substitute"
    });
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      employeeCode: fixture.workers.substituteReplacement.employeeCode,
      workType: "substitute",
      isPoolWorker: true
    });
    expect(substituteEntry?.note).toContain("Pool 대체근무");
    expect(substituteEntry?.note).toContain("수당 미지급");
    expect(substituteEntry?.note).toContain(
      `원본 표기 ${fixture.workers.substituteReplacement.name}(P)`
    );
    expect(substituteEntry?.alerts).toEqual([]);
  });

  it("should resolve same-name workers by site before applying employee-code based checks", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const otherSite = listStoredSites().find((site) => site.name !== fixture.siteName);

    if (!otherSite) {
      throw new Error("동명이인 테스트용 다른 근무지를 찾지 못했습니다.");
    }

    saveStoredEmployee({
      employeeCode: "EMP-PF-T1-O-SAME-NAME",
      name: fixture.workers.overtime.name,
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: otherSite.id,
      shiftGroup: "A조",
      hourlyRate: 15100
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-same-name-different-site"
    });
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      employeeCode: fixture.workers.overtime.employeeCode
    });
    expect(
      overtimeEntry?.alerts.some((alert) => alert.message.includes("동명이인"))
    ).toBe(false);
  });

  // R10 #3: with two same-name people at the same site, the hire and retire dates decide which one
  // a row lands on - and only when neither is available does the parser fall back to both.
  it("narrows same-name candidates by their employment period, and falls back to all of them when none is available", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const site = listStoredSites().find((item) => item.name === fixture.siteName);

    if (!site) {
      throw new Error("동명이인 테스트용 근무지를 찾지 못했습니다.");
    }

    const parseOvertime = async (fileId: string) =>
      (await parseReturnedSchedulePerformanceFile({ filePath: fixture.filePath, fileId })).entries.find(
        (entry) => entry.section === "overtime"
      );
    const isAmbiguous = (entry: PerformanceEntryRecord | undefined) =>
      entry?.alerts.some((alert) => alert.message.includes("동명이인")) ?? false;
    const twin = saveStoredEmployee({
      employeeCode: "EMP-PF-T1-O-TWIN",
      name: fixture.workers.overtime.name,
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: site.id,
      shiftGroup: "D조",
      hourlyRate: 15100
    });
    const original = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.overtime.employeeCode
    );

    if (!original) {
      throw new Error("연장 근무자를 찾지 못했습니다.");
    }

    // Both available at the same site on the work date: the name alone cannot decide.
    const bothAvailable = await parseOvertime("same-name-both-available");

    expect(bothAvailable?.employeeCode).toBe("");
    expect(isAmbiguous(bothAvailable)).toBe(true);

    const workDate = bothAvailable?.workDate ?? "";
    const dayAfterWork = addCalendarDays(workDate, 1);
    const setTwinHireDate = (hireDate: string) =>
      saveStoredEmployee({
        id: twin.id,
        employeeCode: twin.employeeCode,
        name: twin.name,
        employmentType: "정규",
        status: "active",
        hireDate
      });

    // The twin hired after the work date drops out; the row lands on the original, at their wage.
    setTwinHireDate(dayAfterWork);

    const twinHiredLater = await parseOvertime("same-name-twin-hired-later");

    expect(twinHiredLater?.employeeCode).toBe(fixture.workers.overtime.employeeCode);
    expect(twinHiredLater?.hourlyRate).toBe(14100);
    expect(isAmbiguous(twinHiredLater)).toBe(false);

    // The original retired on the work date instead: the row lands on the twin, at the twin's wage.
    setTwinHireDate("2024-01-01");
    saveStoredEmployee({
      id: original.id,
      employeeCode: original.employeeCode,
      name: original.name,
      employmentType: original.employmentType,
      status: "retired",
      hireDate: "2024-01-01",
      retireDate: workDate
    });

    const originalRetired = await parseOvertime("same-name-original-retired");

    expect(originalRetired?.employeeCode).toBe("EMP-PF-T1-O-TWIN");
    expect(originalRetired?.hourlyRate).toBe(15100);
    expect(isAmbiguous(originalRetired)).toBe(false);

    // Neither available: the parser falls back to both, and the name is ambiguous again.
    setTwinHireDate(dayAfterWork);

    const noneAvailable = await parseOvertime("same-name-none-available");

    expect(noneAvailable?.employeeCode).toBe("");
    expect(isAmbiguous(noneAvailable)).toBe(true);
  });

  // T-22: a row before the only match's hire date (or on/after their retire date) is still matched
  // so the screen names the person, but carries an error - work outside the employment period is
  // not approvable until the date on the person is corrected.
  it("flags a row outside the only match's employment period as an approval-blocking error, and still matches it", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const parseOvertime = async (fileId: string) =>
      (await parseReturnedSchedulePerformanceFile({ filePath: fixture.filePath, fileId })).entries.find(
        (entry) => entry.section === "overtime"
      );
    const original = listStoredEmployees().find(
      (employee) => employee.employeeCode === fixture.workers.overtime.employeeCode
    );

    if (!original) {
      throw new Error("연장 근무자를 찾지 못했습니다.");
    }

    const inPeriod = await parseOvertime("employment-period-inside");
    const workDate = inPeriod?.workDate ?? "";

    expect(inPeriod?.alerts).toEqual([]);

    saveStoredEmployee({
      id: original.id,
      employeeCode: original.employeeCode,
      name: original.name,
      employmentType: original.employmentType,
      status: "active",
      hireDate: addCalendarDays(workDate, 1)
    });

    const beforeHire = await parseOvertime("employment-period-before-hire");

    expect(beforeHire?.employeeCode).toBe(fixture.workers.overtime.employeeCode);
    expect(beforeHire?.hourlyRate).toBe(14100);
    expect(beforeHire?.alerts).toEqual([
      {
        severity: "error",
        reasonCode: "employment-period-violation",
        message: `${workDate} 근무는 ${original.name}(${original.employeeCode})의 입사일(${addCalendarDays(
          workDate,
          1
        )}) 이전입니다. 고용 기간 밖 근무는 승인할 수 없습니다. 입사일이 잘못됐다면 인력 관리에서 고치세요. 고치면 이 파일을 다시 읽습니다.`
      }
    ]);
    // The manual wage override clears wage alerts only; this one names no wage, so it stays.
    expect(beforeHire?.alerts[0]?.message.includes("시급")).toBe(false);

    saveStoredEmployee({
      id: original.id,
      employeeCode: original.employeeCode,
      name: original.name,
      employmentType: original.employmentType,
      status: "retired",
      hireDate: "2024-01-01",
      retireDate: workDate
    });

    const afterRetire = await parseOvertime("employment-period-after-retire");

    expect(afterRetire?.employeeCode).toBe(fixture.workers.overtime.employeeCode);
    expect(afterRetire?.hourlyRate).toBe(14100);
    expect(afterRetire?.alerts.map((alert) => alert.severity)).toEqual(["error"]);
    expect(afterRetire?.alerts[0]?.message).toContain(`퇴사 처리일(${workDate}) 당일이거나 그 뒤입니다`);
    expect(afterRetire?.alerts[0]?.message).toContain("승인할 수 없습니다");
  });

  it("should keep returned schedule workers available from the hire date", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const overtimeEmployeeCode = fixture.workers.overtime.employeeCode;
    const overtimeEmployee = getSqliteDatabase()!
      .prepare(
        `
          SELECT id
          FROM employees
          WHERE employee_code = ?
          LIMIT 1
        `
      )
      .get(overtimeEmployeeCode) as { id: string } | undefined;

    if (!overtimeEmployee) {
      throw new Error("테스트 인력 정보를 찾지 못했습니다.");
    }

    getSqliteDatabase()!
      .prepare(
        `
          UPDATE employee_site_assignments
          SET start_date = ?
          WHERE employee_id = ?
            AND status = 'active'
        `
      )
      .run("2026-03-15", overtimeEmployee.id);

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-hire-date-availability"
    });
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      employeeCode: overtimeEmployeeCode,
      hourlyRate: 14100
    });
    expect(
      overtimeEntry?.alerts.some((alert) => alert.message.includes("인력 정보를 찾지 못했습니다."))
    ).toBe(false);
  });

  it("should block same-name workers when the employee code cannot be resolved", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    saveStoredEmployee({
      employeeCode: "EMP-PF-T1-O-AMBIGUOUS",
      name: fixture.workers.overtime.name,
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: getSiteIdByName(fixture.siteName),
      shiftGroup: "A조",
      hourlyRate: 15100
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-same-name-same-site"
    });
    const overtimeEntry = parsed.entries.find((entry) => entry.section === "overtime");

    expect(overtimeEntry?.employeeCode).toBe("");
    expect(
      overtimeEntry?.alerts.some(
        (alert) => alert.severity === "error" && alert.message.includes("사번을 확정할 수 없습니다")
      )
    ).toBe(true);
  });

  it("should add error alerts when one employee code has overlapping work times", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BA35").value = "2026-03-03";
      worksheet.getCell("BC35").value = 22;
      worksheet.getCell("BD35").value = 0;
      worksheet.getCell("BE35").value = 23;
      worksheet.getCell("BF35").value = 0;
      worksheet.getCell("BG35").value = fixture.workers.overtime.name;
      worksheet.getCell("BH35").value = "추가복구";
      worksheet.getCell("BJ35").value = "추가증적";
    });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-overlap"
    });
    const overtimeEntries = parsed.entries.filter(
      (entry) =>
        entry.section === "overtime" &&
        entry.employeeCode === fixture.workers.overtime.employeeCode
    );

    expect(overtimeEntries).toHaveLength(2);
    expect(
      overtimeEntries.every((entry) =>
        entry.alerts.some(
          (alert) => alert.severity === "error" && alert.message.includes("근무시간이")
        )
      )
    ).toBe(true);
  });
  // G10: Pool 여부는 그 근무일에 유효했던 배정으로 정한다. 조를 옮겼다는 이유만으로 옛 조 시절
  // 대체근무가 소급해 "수당 미지급"이 되면, 운영자가 되돌릴 방법이 없어 돈을 영영 못 준다.
  it("should judge Pool by the assignment in force on the work date, not by the current team", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    // The substitute row is 2026-03-02; the move into Pool starts half a year later.
    moveEmployeeToTeam(fixture.workers.substituteReplacement.employeeCode, "Pool", "2026-09-01");

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-after-team-move"
    });
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(substituteEntry).toMatchObject({
      employeeCode: fixture.workers.substituteReplacement.employeeCode,
      workDate: "2026-03-02",
      isPoolWorker: false,
      substituteWorkType: "ROTATING",
      substituteAllowanceEligible: true
    });
    expect(substituteEntry?.note ?? "").not.toContain("Pool 대체근무");
    expect(substituteEntry?.note ?? "").not.toContain("수당 미지급");
  });

  // The Pool rule itself must stay alive: a row worked WHILE the person was in Pool is still
  // excluded, even after they later moved to a rotating team.
  it("should keep a substitute row non-payable while the person was in Pool on that work date", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "Pool"
    });

    moveEmployeeToTeam(fixture.workers.substituteReplacement.employeeCode, "C조", "2026-09-01");

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-before-team-move"
    });
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(substituteEntry).toMatchObject({
      isPoolWorker: true,
      substituteWorkType: "POOL",
      substituteAllowanceEligible: false,
      substituteAllowanceReasonCode: "POOL_SUBSTITUTE_EXCLUDED"
    });
    expect(substituteEntry?.note).toContain("수당 미지급");
  });

  // Fallback preserved: with no assignment covering the work date the current team decides, which
  // is what records carrying no usable assignment history used to answer.
  it("should fall back to the current team when no assignment covers the work date", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "Pool"
    });
    const employee = getEmployeeByCode(fixture.workers.substituteReplacement.employeeCode);
    const assignment = listStoredEmployeeAssignments(employee.id)[0];

    if (!assignment) {
      throw new Error("테스트 배정을 찾지 못했습니다.");
    }

    closeStoredEmployeeAssignment({ assignmentId: assignment.id, endDate: "2026-01-01" });

    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-uncovered-work-date"
    });
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(substituteEntry?.isPoolWorker).toBe(true);
    expect(substituteEntry?.substituteAllowanceReasonCode).toBe("POOL_SUBSTITUTE_EXCLUDED");
  });

  // Pins what a changed Pool judgement does to rows that are ALREADY approved. Reopening approved
  // rows in bulk would be worse than the underpayment this fix removes, so the answer is fixed
  // here rather than left to chance.
  it("should not reopen an approved legal-holiday row when only the Pool judgement moves", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const parsed = await parseReturnedSchedulePerformanceFile({
      filePath: fixture.filePath,
      fileId: "schedule-return-pool-reapproval"
    });
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    if (!holidayEntry || !substituteEntry) {
      throw new Error("비교용 실적 행을 찾지 못했습니다.");
    }

    expect(holidayEntry.sourceSignature).toBeTruthy();

    // Signed legal-holiday approval: Pool is a live employee-master readout there, never the
    // source, so a changed judgement leaves the approval standing.
    expect(
      arePerformanceEntriesEquivalent(holidayEntry, {
        ...holidayEntry,
        isPoolWorker: !holidayEntry.isPoolWorker
      })
    ).toBe(true);

    // A substitute row is the one section where Pool decides payment, so there it stays part of
    // the identity and a changed judgement does ask for review.
    expect(
      arePerformanceEntriesEquivalent(substituteEntry, {
        ...substituteEntry,
        isPoolWorker: !substituteEntry.isPoolWorker
      })
    ).toBe(false);

    // Known residual gap: an approval taken before source signatures existed falls back to the
    // full field comparison, where isPoolWorker still counts on every section.
    const legacyEntry = { ...holidayEntry, sourceSignature: undefined };

    expect(
      arePerformanceEntriesEquivalent(legacyEntry, {
        ...legacyEntry,
        isPoolWorker: !legacyEntry.isPoolWorker
      })
    ).toBe(false);
  });
});
