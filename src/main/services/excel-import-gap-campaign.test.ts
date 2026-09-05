import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { reviewAllowanceCalculations } from "./allowance-approval-service";
import {
  approveAllowanceProposal,
  resetAllowanceProposalApprovalStateForTest
} from "./allowance-proposal-approval-service";
import {
  resetApprovedAllowanceCalculationStateForTest,
  runApprovedAllowanceCalculation
} from "./approved-allowance-calculation-service";
import {
  inspectDocumentTemplateImport,
  saveManagedDocumentTemplateVersion
} from "./document-template-management-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  getStoredPerformanceFileDetail,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import { saveStoredEmployee, resetEmployeeStorageForTest } from "./employee-storage-service";
import { restoreMissingMonthlySchedulesFromExportedPlans } from "./monthly-schedule-restore-service";
import {
  replaceStoredHolidayCalendar,
  resetOperationsStorageForTest,
  saveStoredDocumentTemplateVersion
} from "./operations-storage-service";
import { syncPendingPerformanceFilesToStorage } from "./performance-file-intake-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { analyzeSitePatternImport } from "./site-pattern-extraction-service";
import { listStoredSites } from "./site-storage-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import { previewWorkforceWageBulkUpdate } from "./workforce-wage-bulk-update-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "excel-import-gaps");
const allocatedTestRoots: string[] = [];

const createTestPaths = () => {
  const rootDir = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(rootDir);
  mkdirSync(rootDir, { recursive: true });

  return {
    rootDir,
    dbPath: path.resolve(rootDir, "excel-import-gaps.test.sqlite"),
    userDataPath: path.resolve(rootDir, "user-data")
  };
};

const writeUpdatedProposalWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("품의서");

  worksheet.getCell("A11").value = "제  목  :  스케쥴근무 시간외 근로 수당 지급의 건";
  worksheet.getCell("B18").value = "2. 4월 지급 요청 내역";
  await workbook.xlsx.writeFile(filePath);
};

const writeWageWorkbook = async (
  filePath: string,
  rows: Array<{ siteName: string; employeeName: string; hourlyRate: string }>
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("시급");

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    worksheet.getCell(`B${rowNumber}`).value = row.siteName;
    worksheet.getCell(`C${rowNumber}`).value = row.employeeName;
    worksheet.getCell(`D${rowNumber}`).value = row.hourlyRate;
  });

  await workbook.xlsx.writeFile(filePath);
};

const wageMapping = {
  siteNameColumn: "B",
  employeeNameColumn: "C",
  hourlyRateColumn: "D"
};

describe("excel-import gap campaign — 양식 등록 가드", () => {
  afterEach(() => {
    resetOperationsStorageForTest();
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      try {
        rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Ignore transient Windows file locks during test teardown.
      }
    });
  });

  it("blocks inspection for a missing file and an unsupported extension", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    await expect(
      inspectDocumentTemplateImport({
        templateType: "proposal",
        sourcePath: path.resolve(paths.rootDir, "없는파일.xlsx")
      })
    ).rejects.toThrow(/찾을 수 없습니다/);

    const textPath = path.resolve(paths.rootDir, "양식아님.txt");
    writeFileSync(textPath, "not excel");

    await expect(
      inspectDocumentTemplateImport({ templateType: "proposal", sourcePath: textPath })
    ).rejects.toThrow(/형식만 지원/);
  });

  it("fails inspection for an unsupported schedule workbook and refuses to save it", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const brokenPath = path.resolve(paths.rootDir, "근무표아님.xlsx");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("교대 근무 계획표");
    worksheet.getCell("A1").value = "구조가 다른 파일";
    await workbook.xlsx.writeFile(brokenPath);

    const inspection = await inspectDocumentTemplateImport({
      templateType: "schedule",
      sourcePath: brokenPath
    });

    expect(inspection.canProceed).toBe(false);
    expect(inspection.inspectionWarnings.some((warning) => warning.includes("근무표"))).toBe(true);

    expect(() =>
      saveManagedDocumentTemplateVersion(
        {
          templateType: "schedule",
          versionLabel: "구조 불량 근무표",
          sourcePath: brokenPath,
          profileSchemaVersion: "2",
          profile: inspection.profile,
          validation: inspection
        },
        { userDataPath: paths.userDataPath }
      )
    ).toThrow(/구조 확인을 통과한 양식만/);
  });

  it("accepts attachment templates without structural checks", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const attachmentPath = path.resolve(paths.rootDir, "아무별첨.xlsx");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("자유형식").getCell("C7").value = "임의 내용";
    await workbook.xlsx.writeFile(attachmentPath);

    const inspection = await inspectDocumentTemplateImport({
      templateType: "attachment1",
      sourcePath: attachmentPath
    });

    expect(inspection.canProceed).toBe(true);
  });

  it("rejects a managed file name with a non-Excel extension", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const proposalPath = path.resolve(paths.rootDir, "신형품의서.xlsx");
    await writeUpdatedProposalWorkbook(proposalPath);

    const inspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: proposalPath
    });

    expect(() =>
      saveManagedDocumentTemplateVersion(
        {
          templateType: "proposal",
          versionLabel: "확장자 검사",
          sourcePath: proposalPath,
          managedFileName: "잘못된확장자.csv",
          profileSchemaVersion: "2",
          profile: inspection.profile,
          validation: inspection
        },
        { userDataPath: paths.userDataPath }
      )
    ).toThrow(/확장자만 사용할 수 있습니다/);
  });

  it("blocks two templates from claiming the same managed file name", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const firstPath = path.resolve(paths.rootDir, "품의서1.xlsx");
    const secondPath = path.resolve(paths.rootDir, "품의서2.xlsx");
    await writeUpdatedProposalWorkbook(firstPath);
    await writeUpdatedProposalWorkbook(secondPath);

    const firstInspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: firstPath
    });

    saveManagedDocumentTemplateVersion(
      {
        templateType: "proposal",
        versionLabel: "중복 파일명 1",
        sourcePath: firstPath,
        managedFileName: "공유이름.xlsx",
        profileSchemaVersion: "2",
        profile: firstInspection.profile,
        validation: firstInspection
      },
      { userDataPath: paths.userDataPath }
    );

    const secondInspection = await inspectDocumentTemplateImport({
      templateType: "proposal",
      sourcePath: secondPath
    });

    expect(() =>
      saveManagedDocumentTemplateVersion(
        {
          templateType: "proposal",
          versionLabel: "중복 파일명 2",
          sourcePath: secondPath,
          managedFileName: "공유이름.xlsx",
          profileSchemaVersion: "2",
          profile: secondInspection.profile,
          validation: secondInspection
        },
        { userDataPath: paths.userDataPath }
      )
    ).toThrow(/같은 파일명이 이미 등록/);
  });
});

describe("excel-import gap campaign — 시급 일괄 등록 가드", () => {
  afterEach(() => {
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      try {
        rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Ignore transient Windows file locks during test teardown.
      }
    });
  });

  it("rejects malformed effective dates, missing files, and unsupported extensions", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const filePath = path.resolve(paths.rootDir, "시급.xlsx");
    await writeWageWorkbook(filePath, [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "13,600" }
    ]);

    await expect(
      previewWorkforceWageBulkUpdate({
        filePath,
        effectiveFrom: "2026/04/01",
        mapping: wageMapping
      })
    ).rejects.toThrow(/YYYY-MM-DD/);

    await expect(
      previewWorkforceWageBulkUpdate({
        filePath: path.resolve(paths.rootDir, "없는시급파일.xlsx"),
        effectiveFrom: "2026-04-01",
        mapping: wageMapping
      })
    ).rejects.toThrow(/찾을 수 없습니다/);

    const csvPath = path.resolve(paths.rootDir, "시급.csv");
    writeFileSync(csvPath, "보라매DC,김현우,13600");

    await expect(
      previewWorkforceWageBulkUpdate({
        filePath: csvPath,
        effectiveFrom: "2026-04-01",
        mapping: wageMapping
      })
    ).rejects.toThrow(/형식만 지원/);
  });

  it("classifies the four previously untested row statuses", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const site = listStoredSites().find((item) => item.name === "보라매DC");

    expect(site).toBeDefined();

    saveStoredEmployee({
      employeeCode: "GAP-RETIRED",
      name: "은퇴검사",
      rank: "사원",
      employmentType: "정규",
      status: "retired",
      hireDate: "2020-01-01",
      // A retired person carries a retire date (R10 #1); the row must still count as retired.
      retireDate: "2025-12-31",
      siteId: site!.id,
      shiftGroup: "A조",
      hourlyRate: 12000
    });
    ["GAP-DUP-1", "GAP-DUP-2"].forEach((employeeCode) => {
      saveStoredEmployee({
        employeeCode,
        name: "동명검사",
        rank: "사원",
        employmentType: "정규",
        status: "active",
        hireDate: "2020-01-01",
        siteId: site!.id,
        shiftGroup: "A조",
        hourlyRate: 12000
      });
    });

    const filePath = path.resolve(paths.rootDir, "시급상태검사.xlsx");
    await writeWageWorkbook(filePath, [
      { siteName: "보라매DC", employeeName: "", hourlyRate: "13,600" },
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "14,000원" },
      { siteName: "보라매DC", employeeName: "동명검사", hourlyRate: "13,000" },
      { siteName: "보라매DC", employeeName: "은퇴검사", hourlyRate: "13,000" },
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "0" }
    ]);

    const preview = await previewWorkforceWageBulkUpdate({
      filePath,
      effectiveFrom: "2026-04-01",
      mapping: wageMapping
    });

    expect(preview.rows[0]?.status).toBe("missing-required-value");
    // "14,000원" — comma and 원 suffix are stripped before validation.
    expect(preview.rows[1]?.status).toBe("ready");
    expect(preview.rows[2]?.status).toBe("ambiguous-employee");
    expect(preview.rows[3]?.status).toBe("employee-retired");
    // Zero is not a valid hourly rate even though it parses as a number.
    expect(preview.rows[4]?.status).toBe("invalid-hourly-rate");

    // 소급 인상을 위해 지난 날짜로도 일괄 적용할 수 있어야 한다 — 단 입사일(김현우 2023-03-01)
    // 이후여야 한다(T-23). 입사일 이전 날짜는 파일을 실패시키지 않고 그 사람만 따로 뺀다.
    const backdatedPath = path.resolve(paths.rootDir, "시급소급적용.xlsx");
    await writeWageWorkbook(backdatedPath, [
      { siteName: "보라매DC", employeeName: "김현우", hourlyRate: "15,000" }
    ]);

    const backdatedPreview = await previewWorkforceWageBulkUpdate({
      filePath: backdatedPath,
      effectiveFrom: "2023-06-01",
      mapping: wageMapping
    });
    const beforeHirePreview = await previewWorkforceWageBulkUpdate({
      filePath: backdatedPath,
      effectiveFrom: "2000-01-01",
      mapping: wageMapping
    });

    expect(backdatedPreview.rows[0]?.status).toBe("ready");
    expect(beforeHirePreview.rows[0]?.status).toBe("employee-not-hired-yet");
    expect(beforeHirePreview.rows[0]?.note).toContain("입사일(2023-03-01)");
  });
});

describe("excel-import gap campaign — 실적 파서 가드", () => {
  const fixtureRoots: string[] = [];

  afterEach(() => {
    resetOperationsStorageForTest();
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
    fixtureRoots.splice(0).forEach((rootDir) => resetPreparedReturnedScheduleRoot(rootDir));
  });

  const rewriteReturnedWorkbook = async (
    filePath: string,
    update: (worksheet: ExcelJS.Worksheet) => void
  ) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    update(worksheet);
    await workbook.xlsx.writeFile(filePath);
  };

  it("drops a holiday row whose date cell lost the pink fill (with pink control row)", async () => {
    const rootDir = path.resolve(testRootBase, "parser-pink-loss");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });

    await rewriteReturnedWorkbook(fixture.filePath, (worksheet) => {
      // 2026-03-02: valid holiday content but NO pink fill — must vanish silently.
      worksheet.getCell("Y13").value = "2026-03-02";
      worksheet.getCell("Z13").value = "홍길동";
      worksheet.getCell("AL13").value = fixture.workers.holidayReplacement.name;
      // 2026-03-03: identical content WITH pink fill — control row, must be credited.
      worksheet.getCell("Y14").value = "2026-03-03";
      worksheet.getCell("Y14").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFD1D1" }
      };
      worksheet.getCell("Z14").value = "홍길동";
      worksheet.getCell("AL14").value = fixture.workers.holidayReplacement.name;
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const holidayEntries = detail.entries.filter((entry) => entry.section === "legal-holiday");

    expect(holidayEntries.some((entry) => entry.workDate === "2026-03-02")).toBe(false);
    expect(holidayEntries.some((entry) => entry.workDate === "2026-03-03")).toBe(true);
  }, 30_000);

  it("creates a zero-minute entry with a warning for out-of-range overtime clock values", async () => {
    const rootDir = path.resolve(testRootBase, "parser-bad-clock");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });

    await rewriteReturnedWorkbook(fixture.filePath, (worksheet) => {
      worksheet.getCell("BA35").value = "2026-03-05";
      worksheet.getCell("BC35").value = 25;
      worksheet.getCell("BD35").value = 0;
      worksheet.getCell("BE35").value = 27;
      worksheet.getCell("BF35").value = 0;
      worksheet.getCell("BG35").value = fixture.workers.overtime.name;
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const badClockEntry = detail.entries.find(
      (entry) => entry.section === "overtime" && entry.workDate === "2026-03-05"
    );

    expect(badClockEntry).toBeDefined();
    expect(badClockEntry?.totalWorkMinutes).toBe(0);
    expect(
      badClockEntry?.alerts.some((alert) => alert.message.includes("올바르지 않습니다"))
    ).toBe(true);
  }, 30_000);

  it("ignores Excel lock files and non-Excel files, and errors on unknown grid layouts", async () => {
    const rootDir = path.resolve(testRootBase, "parser-junk-files");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });

    writeFileSync(path.resolve(fixture.pendingDir, "~$2026_3_잠금.xlsx"), "lock");
    writeFileSync(path.resolve(fixture.pendingDir, "2026_3_메모.txt"), "memo");

    const unknownLayoutPath = path.resolve(fixture.pendingDir, "2026_3_무양식.xlsx");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("교대 근무 계획표").getCell("A1").value = "앵커 없음";
    await workbook.xlsx.writeFile(unknownLayoutPath);

    const issues = await syncPendingPerformanceFilesToStorage({
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
      scheduleMonth: "2026-03"
    });

    expect(
      issues.some(
        (issue) => issue.fileName.includes("잠금") || issue.fileName.includes("메모")
      )
    ).toBe(false);
    expect(
      issues.some((issue) => issue.message.includes("지원하지 않는 근무표 템플릿"))
    ).toBe(true);
  }, 30_000);
});

describe("excel-import gap campaign — 근무표 복구·패턴 한도", () => {
  const fixtureRoots: string[] = [];

  afterEach(() => {
    resetOperationsStorageForTest();
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
    fixtureRoots.splice(0).forEach((rootDir) => resetPreparedReturnedScheduleRoot(rootDir));
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      try {
        rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Ignore transient Windows file locks during test teardown.
      }
    });
  });

  const rewriteExportedPlan = async (
    exportedPath: string,
    update: (worksheet: ExcelJS.Worksheet) => void
  ) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exportedPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    update(worksheet);
    await workbook.xlsx.writeFile(exportedPath);
  };

  const listRestoredItemCodes = () => {
    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("SQLite storage is not initialized.");
    }

    return (
      database
        .prepare(
          `SELECT e.employee_code AS employeeCode
           FROM monthly_schedule_items i
           JOIN employees e ON e.id = i.employee_id`
        )
        .all() as Array<{ employeeCode: string }>
    ).map((row) => row.employeeCode);
  };

  it("restore reads only 변경전 columns — a name in 변경후 must be ignored", async () => {
    const rootDir = path.resolve(testRootBase, "restore-changed-column");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });

    // Plant a registered employee's name into a changed(변경후) D column of the
    // distributed original. Restore must not credit it.
    await rewriteExportedPlan(fixture.exportedPath, (worksheet) => {
      worksheet.getCell("AL13").value = fixture.workers.holidayReplacement.name;
    });

    const database = getSqliteDatabase()!;
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    await syncPreparedReturnedSchedule(fixture);

    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({
      scheduleExportDir: fixture.exportDir
    });
    const restoredCodes = listRestoredItemCodes();

    expect(summary.restoredScheduleCount).toBe(1);
    expect(restoredCodes).toContain(fixture.workers.holiday.employeeCode);
    expect(restoredCodes).not.toContain(fixture.workers.holidayReplacement.employeeCode);
  }, 30_000);

  it("restore drops a grid name that matches two different employees", async () => {
    const rootDir = path.resolve(testRootBase, "restore-ambiguous-name");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });
    const site = listStoredSites().find((item) => item.name === fixture.siteName);

    expect(site).toBeDefined();

    ["GAP-AMB-1", "GAP-AMB-2"].forEach((employeeCode) => {
      saveStoredEmployee({
        employeeCode,
        name: "겹침이",
        rank: "사원",
        employmentType: "정규",
        status: "active",
        hireDate: "2020-01-01",
        siteId: site!.id,
        shiftGroup: "A조",
        hourlyRate: 12000
      });
    });
    // Positive control: a unique registered name planted the same way MUST be
    // restored — proving the ambiguous name is dropped by ambiguity, not by the
    // cells never being read.
    saveStoredEmployee({
      employeeCode: "GAP-UNI",
      name: "유일이",
      rank: "사원",
      employmentType: "정규",
      status: "active",
      hireDate: "2020-01-01",
      siteId: site!.id,
      shiftGroup: "A조",
      hourlyRate: 12000
    });

    await rewriteExportedPlan(fixture.exportedPath, (worksheet) => {
      // Regular(변경전) D column on 2026-03-03 and 2026-03-04.
      worksheet.getCell("Z14").value = "겹침이";
      worksheet.getCell("Z15").value = "유일이";
    });

    const database = getSqliteDatabase()!;
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();
    await syncPreparedReturnedSchedule(fixture);

    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({
      scheduleExportDir: fixture.exportDir
    });
    const restoredCodes = listRestoredItemCodes();

    expect(summary.restoredScheduleCount).toBe(1);
    expect(restoredCodes).toContain(fixture.workers.holiday.employeeCode);
    expect(restoredCodes).not.toContain("GAP-AMB-1");
    expect(restoredCodes).not.toContain("GAP-AMB-2");
  }, 30_000);

  it("refuses auto-apply when more than 4 cycles are detected", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("과거근무표");
    worksheet.getCell("A1").value = "날짜";

    for (let dayIndex = 0; dayIndex < 60; dayIndex += 1) {
      worksheet.getRow(1).getCell(2 + dayIndex).value = new Date(Date.UTC(2026, 0, 1 + dayIndex));
    }

    // Five workers with five different cycle lengths → five detected groups.
    for (let workerIndex = 0; workerIndex < 5; workerIndex += 1) {
      const cycleLength = 8 + workerIndex;
      const rowNumber = 4 + workerIndex;

      worksheet.getRow(rowNumber).getCell(1).value = `주기근무자${workerIndex + 1}`;
      for (let dayIndex = 0; dayIndex < 60; dayIndex += 1) {
        const position = dayIndex % cycleLength;
        worksheet.getRow(rowNumber).getCell(2 + dayIndex).value =
          position === 0 ? "D" : position === 1 ? "N" : "휴";
      }
    }

    const filePath = path.resolve(paths.rootDir, "pattern-5cycles.xlsx");
    await workbook.xlsx.writeFile(filePath);

    await expect(analyzeSitePatternImport({ filePath })).rejects.toThrow(/4개를 초과/);
  }, 30_000);

  it("refuses auto-apply when a cycle carries more than 6 working codes", async () => {
    const paths = createTestPaths();

    initializeSqliteStorage({ dbPath: paths.dbPath });

    const cycle = ["가", "나", "다", "라", "마", "바", "사", "휴"];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("과거근무표");
    worksheet.getCell("A1").value = "날짜";

    for (let dayIndex = 0; dayIndex < 48; dayIndex += 1) {
      worksheet.getRow(1).getCell(2 + dayIndex).value = new Date(Date.UTC(2026, 0, 1 + dayIndex));
    }

    worksheet.getRow(4).getCell(1).value = "다코드근무자";
    for (let dayIndex = 0; dayIndex < 48; dayIndex += 1) {
      worksheet.getRow(4).getCell(2 + dayIndex).value = cycle[dayIndex % cycle.length];
    }

    const filePath = path.resolve(paths.rootDir, "pattern-7codes.xlsx");
    await workbook.xlsx.writeFile(filePath);

    await expect(analyzeSitePatternImport({ filePath })).rejects.toThrow(/6개를 초과/);
  }, 30_000);
});

describe("excel-import gap campaign — 승인 흐름 후속", () => {
  const fixtureRoots: string[] = [];

  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetAllowanceProposalApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetOperationsStorageForTest();
    resetEmployeeStorageForTest();
    resetSqliteStorageForTest();
    fixtureRoots.splice(0).forEach((rootDir) => resetPreparedReturnedScheduleRoot(rootDir));
  });

  const approveAllEntries = async (
    fixture: Awaited<ReturnType<typeof prepareReturnedScheduleFixture>>,
    detail: NonNullable<ReturnType<typeof getStoredPerformanceFileDetail>>
  ) => {
    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        { fileId: detail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }
  };

  it("holds the auto-archive when a registered holiday has no rows at all", async () => {
    const rootDir = path.resolve(testRootBase, "holiday-gap-hold");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });
    const detail = await syncPreparedReturnedSchedule(fixture);

    // 2026-03-15 is a registered holiday, but the file carries no row on that date —
    // the pink marking was probably lost, so moving to 승인완료 must be held.
    replaceStoredHolidayCalendar({
      year: 2026,
      items: [{ holidayDate: "2026-03-15", name: "검증용 공휴일", isSubstitute: false }]
    });

    await approveAllEntries(fixture, detail);

    const after = getStoredPerformanceFileDetail(detail.id);

    expect(after?.approvedEntryCount).toBe(detail.entries.length);
    expect(after?.status).toBe("pending");
    expect(after?.directoryType).toBe("pending");
  }, 30_000);

  it("archives normally when the registered holiday date is accounted for by any row", async () => {
    const rootDir = path.resolve(testRootBase, "holiday-gap-accounted");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });
    const detail = await syncPreparedReturnedSchedule(fixture);

    // 2026-03-02 is covered by the substitute row, so the guard must NOT hold.
    replaceStoredHolidayCalendar({
      year: 2026,
      items: [{ holidayDate: "2026-03-02", name: "검증용 공휴일", isSubstitute: false }]
    });

    await approveAllEntries(fixture, detail);

    const after = getStoredPerformanceFileDetail(detail.id);

    expect(after?.status).toBe("approved");
  }, 30_000);

  it("blocks reapproval of an entry whose allowance passed proposal approval", async () => {
    const rootDir = path.resolve(testRootBase, "proposal-locked");
    fixtureRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });
    const detail = await syncPreparedReturnedSchedule(fixture);

    saveStoredDocumentTemplateVersion({
      templateType: "proposal",
      versionLabel: "품의서 잠금검사",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment1",
      versionLabel: "별첨1 잠금검사",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment2",
      versionLabel: "별첨2 잠금검사",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
      status: "approved",
      isDefault: true
    });

    await approveAllEntries(fixture, detail);

    const calculationIds: string[] = [];

    for (const entry of detail.entries) {
      const calculation = await runApprovedAllowanceCalculation({ entryId: entry.id });

      expect(calculation.ok).toBe(true);
      if (calculation.ok) {
        calculationIds.push(calculation.data.id);
      }
    }

    const reviewResult = await reviewAllowanceCalculations(
      { calculationIds, decision: "approved" },
      testAdminSession
    );

    expect(reviewResult.ok).toBe(true);

    const proposalResult = await approveAllowanceProposal(
      { calculationIds, comment: "잠금 검사", outputFormat: "xlsx" },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(proposalResult.ok).toBe(true);

    const retry = await approvePerformanceFile(
      { fileId: detail.id, entryId: detail.entries[0]!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(retry.ok).toBe(false);
    if (!retry.ok) {
      expect(retry.message).toContain("품의승인 완료 수당은 재승인으로 변경할 수 없습니다");
    }
  }, 60_000);
});
