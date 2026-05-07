import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { saveStoredEmployee } from "./employee-storage-service";
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
      totalWorkMinutes: 660
    });

    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      workType: "substitute",
      reason: "교육",
      evidence: "대체증적"
    });

    expect(overtimeEntry).toMatchObject({
      employeeName: fixture.workers.overtime.name,
      workType: "overtime",
      startTime: "20:00",
      endTime: "01:00",
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

  it("should parse Hong Gil-dong with None actual worker and replacement as substitute work", async () => {
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
    const holidayEntry = parsed.entries.find((entry) => entry.section === "legal-holiday");
    const substituteEntry = parsed.entries.find((entry) => entry.section === "substitute");

    expect(holidayEntry).toBeUndefined();
    expect(substituteEntry).toMatchObject({
      employeeName: fixture.workers.substituteReplacement.name,
      workDate: "2026-03-01",
      workType: "substitute",
      dutyCode: "D",
      totalWorkMinutes: 660,
      baseWorkMinutes: 480,
      overtimeMinutes: 180,
      note: "원 근무자 홍길동"
    });
    expect(substituteEntry?.alerts).toEqual([]);
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
