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
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} from "./performance-test-helpers";
import { parseReturnedSchedulePerformanceFile } from "./schedule-return-performance-parser";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "schedule-return-performance-parser");

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
      overtimeMinutes: 180
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
});
