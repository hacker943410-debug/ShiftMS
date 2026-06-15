import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import { saveStoredEmployee } from "./employee-storage-service";
import { buildPerformanceFileDetailFromPath } from "./performance-file-intake-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { listStoredDocumentTemplateVersions } from "./operations-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import { saveStoredSite } from "./site-storage-service";
import { saveStoredShiftPattern } from "./shift-pattern-storage-service";
import {
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

// 요건 1 회귀: 휴일 그리드에서 변경전(정규)=None인 자리라도, 변경후(변경)에 실제 근무자가 있으면
// 그 변경후 근무자를 빈칸과 동일하게 파싱해야 한다. (None이 다른 자리 파싱을 막지 않아야 함)

const SITE_NAME = "None자리검증국사";
const SCHEDULE_MONTH = "2026-03";
const testRoot = path.resolve(process.cwd(), "artifacts", "tests", `none-regular-${process.pid}`);

const paintHoliday = (worksheet: ExcelJS.Worksheet, address: string) => {
  worksheet.getCell(address).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFD1D1" }
  } as ExcelJS.Fill;
};

afterEach(() => {
  resetSqliteStorageForTest();
  resetMonthlyScheduleStorageForTest();
  resetPerformanceFileStorageForTest();
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("요건1 — 변경전 None은 빈칸처럼 변경후 근무자를 살린다", () => {
  it("같은 휴일 행에서 변경전 None+변경후 실명 / 빈칸+변경후 실명 / 실명 단독이 모두 파싱된다", async () => {
    const rootDir = testRoot;
    const dbPath = path.resolve(rootDir, "none.test.sqlite");
    const pendingDir = path.resolve(rootDir, "imports", "pending");
    const approvedDir = path.resolve(rootDir, "imports", "approved");
    const exportDir = path.resolve(rootDir, "exports");
    const userDataPath = path.resolve(rootDir, "user-data");

    rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    [pendingDir, approvedDir, exportDir, userDataPath].forEach((dir) =>
      mkdirSync(dir, { recursive: true })
    );

    initializeSqliteStorage({ dbPath });
    resetMonthlyScheduleStorageForTest();
    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir,
        approvedDir,
        scheduleExportDir: exportDir,
        allowanceProposalExportDir: path.resolve(rootDir, "exports", "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(rootDir, "exports", "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(rootDir, "exports", "allowance", "attachment2"),
        databaseBackupDir: path.resolve(rootDir, "backups"),
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath: ""
      },
      { userDataPath }
    );

    const site = saveStoredSite({
      siteCode: "SITE-NR",
      name: SITE_NAME,
      customerName: "테스트",
      status: "active",
      timezone: "Asia/Seoul"
    });

    const pattern = saveStoredShiftPattern({
      siteId: site.id,
      name: "주야 2교대",
      teamCount: 2,
      patternCode: "DNX",
      startIndexRule: "team-sequence",
      patternStartDate: "2024-01-01",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "N", startTime: "22:00", endTime: "06:00", breakMinutes: 60 },
        { stepIndex: 2, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      poolEnabled: false,
      poolBreakMinutes: 0
    });

    const makeEmployee = (employeeCode: string, name: string, shiftGroup: string) =>
      saveStoredEmployee({
        employeeCode,
        name,
        rank: "사원",
        employmentType: "정규",
        status: "active",
        hireDate: "2024-01-01",
        siteId: site.id,
        shiftGroup,
        hourlyRate: 13000
      });

    makeEmployee("EMP-CS", "김철수", "A조");
    makeEmployee("EMP-PY", "박영수", "A조");
    makeEmployee("EMP-JD", "정대만", "A조");

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    if (!template) {
      throw new Error("근무표 양식 1 템플릿을 찾지 못했습니다.");
    }

    const schedule = saveStoredMonthlySchedule({
      siteId: site.id,
      scheduleMonth: SCHEDULE_MONTH,
      patternId: pattern.id,
      generatedBy: "admin",
      templateVersionId: template.id,
      items: [
        {
          employeeCode: "EMP-CS",
          teamLabel: "A조",
          workDate: "2026-03-25",
          dutyCode: "D",
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ]
    });

    const exported = await exportMonthlySchedulePlan({
      scheduleId: schedule.id,
      userDataPath,
      outputDir: exportDir
    });
    if (!exported) {
      throw new Error("근무표 export 실패");
    }

    const returnedPath = path.resolve(pendingDir, exported.outputFileName);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    // 휴일 03-01. D정규 Z/AA/AB, D변경 AL/AM/AN.
    worksheet.getCell("Y12").value = "2026-03-01";
    paintHoliday(worksheet, "Y12");
    // slot0: 변경전 None + 변경후 김철수  → 김철수 파싱 기대(핵심)
    worksheet.getCell("Z12").value = "None";
    worksheet.getCell("AL12").value = "김철수";
    // slot1: 변경전 빈칸 + 변경후 박영수 → 박영수 파싱(대조)
    worksheet.getCell("AA12").value = "";
    worksheet.getCell("AM12").value = "박영수";
    // slot2: 변경전 정대만(실명) 단독 → 정대만 파싱(독립성)
    worksheet.getCell("AB12").value = "정대만";

    await workbook.xlsx.writeFile(returnedPath);

    const detail = await buildPerformanceFileDetailFromPath({
      filePath: returnedPath,
      settings: { pendingDir, approvedDir },
      forceReparse: true
    });
    const holiday = (detail?.entries ?? []).filter((e) => e.section === "legal-holiday");
    const names = new Set(
      holiday.filter((e) => e.workDate === "2026-03-01").map((e) => e.employeeName)
    );

    // 핵심: 변경전 None이어도 변경후 김철수가 파싱돼야 한다.
    expect(names.has("김철수")).toBe(true);
    // 대조/독립성: 빈칸+박영수, 실명 단독 정대만도 그대로.
    expect(names.has("박영수")).toBe(true);
    expect(names.has("정대만")).toBe(true);
  });
});
