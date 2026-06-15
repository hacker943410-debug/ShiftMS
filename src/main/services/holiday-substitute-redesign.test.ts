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

// 휴일 대체근무 재설계 회귀:
//  (1) 휴일(본표 분홍칸)에 본표 원근무자가 있고 우측 대체표에 실명 대체자가 들어오면,
//      본표 원근무자는 자동 취소되고 대체자 1건만 남는다(이중계산 차단).
//  (2) 본표 변경후 칸이 BP면 변경전 근무자는 근무하지 않은 것으로 보고 스킵한다.
//  (3) 평일(비휴일) 대체는 기존 동작 그대로 — 취소 없이 대체자 실적이 생성된다.

const SITE_NAME = "휴일대체검증국사";
const SCHEDULE_MONTH = "2026-03";
const testRoot = path.resolve(process.cwd(), "artifacts", "tests", `holiday-sub-${process.pid}`);

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

describe("휴일 대체근무 재설계 — 이중계산 차단 / 변경후 BP 스킵 / 평일 불변", () => {
  it("휴일 대체표 실명 대체자는 본표 원근무자를 취소하고 단건만 남기며, 변경후 BP는 스킵, 평일 대체는 불변", async () => {
    const rootDir = testRoot;
    const dbPath = path.resolve(rootDir, "holiday-sub.test.sqlite");
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
      siteCode: "SITE-HS",
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
    makeEmployee("EMP-YH", "김영희", "B조");

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );
    if (!template) {
      throw new Error("근무표 양식 1 템플릿을 찾지 못했습니다.");
    }

    // 시간 폴백용 D 항목(비휴일 03-20). 듀티 폴백이 날짜 무관 같은 dutyCode를 끌어옴.
    const schedule = saveStoredMonthlySchedule({
      siteId: site.id,
      scheduleMonth: SCHEDULE_MONTH,
      patternId: pattern.id,
      generatedBy: "admin",
      templateVersionId: template.id,
      items: [
        {
          employeeCode: "EMP-YH",
          teamLabel: "B조",
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

    // 본표(sample1): 날짜 Y12.., D정규 Z, D변경 AL
    // (1) 휴일 03-01: 본표 D정규=김영희(원근무자). 대체표에 김영희→김철수 실명 대체.
    worksheet.getCell("Y12").value = "2026-03-01";
    paintHoliday(worksheet, "Y12");
    worksheet.getCell("Z12").value = "김영희";

    // (2) 휴일 03-08: 본표 D정규=김철수, D변경=BP(...) → 변경전(김철수) 스킵 기대.
    worksheet.getCell("Y13").value = "2026-03-08";
    paintHoliday(worksheet, "Y13");
    worksheet.getCell("Z13").value = "김철수";
    worksheet.getCell("AL13").value = "BP(김영희)";

    // 대체표(sample1): 날짜 BA, 원근무자 BC, 대체자 BE, 사유 BG, 증빙 BJ (행 11~26)
    // 행11: 휴일(03-01) 대체 — 김영희(원) → 김철수(대체)
    worksheet.getCell("BA11").value = "2026-03-01";
    worksheet.getCell("BC11").value = "김영희";
    worksheet.getCell("BE11").value = "김철수";
    worksheet.getCell("BG11").value = "휴일대체";
    worksheet.getCell("BJ11").value = "증빙1";
    // 행12: 평일(03-20) 대체 — 김영희(원) → 김철수(대체). 취소 없이 대체 실적 유지 기대.
    worksheet.getCell("BA12").value = "2026-03-20";
    worksheet.getCell("BC12").value = "김영희";
    worksheet.getCell("BE12").value = "김철수";
    worksheet.getCell("BG12").value = "평일대체";
    worksheet.getCell("BJ12").value = "증빙2";

    await workbook.xlsx.writeFile(returnedPath);

    const detail = await buildPerformanceFileDetailFromPath({
      filePath: returnedPath,
      settings: { pendingDir, approvedDir },
      forceReparse: true
    });
    const entries = detail?.entries ?? [];
    const holiday = entries.filter((e) => e.section === "legal-holiday");
    const substitute = entries.filter((e) => e.section === "substitute");

    // (1) 이중계산 차단: 03-01 본표 원근무자 김영희는 취소되어 휴일 실적이 없어야 함.
    expect(holiday.some((e) => e.workDate === "2026-03-01" && e.employeeName === "김영희")).toBe(
      false
    );
    // 대체자 김철수는 03-01 대체 실적 1건만.
    const cs0301 = substitute.filter(
      (e) => e.workDate === "2026-03-01" && e.employeeName === "김철수"
    );
    expect(cs0301).toHaveLength(1);

    // (2) 변경후 BP: 03-08 본표 변경전(김철수)은 스킵 → 그 날 휴일 실적 없음.
    expect(holiday.some((e) => e.workDate === "2026-03-08")).toBe(false);

    // (3) 평일 대체 불변: 03-20 김철수 대체 실적이 그대로 생성됨.
    const cs0320 = substitute.filter(
      (e) => e.workDate === "2026-03-20" && e.employeeName === "김철수"
    );
    expect(cs0320).toHaveLength(1);

    // 김철수는 03-01에 휴일+대체로 두 번 잡히지 않는다(단건).
    const cs0301All = entries.filter(
      (e) => e.workDate === "2026-03-01" && e.employeeName === "김철수"
    );
    expect(cs0301All).toHaveLength(1);
  });
});
