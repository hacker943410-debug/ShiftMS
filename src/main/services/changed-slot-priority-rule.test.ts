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
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

// Covers both sides of the 변경후 우선 규칙 effective date, on one identical workbook:
//   - before the date -> the old rule (변경전 칸의 사람에게 크레딧) stays byte-for-byte as it was,
//     which is what keeps already-approved past pay from moving.
//   - on/after the date -> whoever is written into 변경후 is the actual worker, regardless of
//     what 변경전 says. Two long-standing holes close with it: 변경전 = "BP(...)" used to drop the
//     substitute silently, and 변경전 = "None_A3" used to credit a ghost worker.
//
// The workbook is produced by the real exporter and fed through the real intake path, so the
// column addresses below are the ones an operator actually types into.

const SITE_NAME = "변경후규칙국사";
const SCHEDULE_MONTH = "2026-03";
const testRoot = path.resolve(process.cwd(), "artifacts", "tests", `changed-slot-rule-${process.pid}`);

const HOLIDAY_FILL_ARGB = "FFFFD1D1";

// NOTE: `cell.fill = ...` mutates the STYLE OBJECT SHARED with sibling cells in ExcelJS, which
// repaints the whole column. Assigning a fresh `cell.style` object keeps the paint per cell.
const paintCell = (worksheet: ExcelJS.Worksheet, address: string, argb: string) => {
  const cell = worksheet.getCell(address);
  cell.style = {
    ...cell.style,
    fill: {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb }
    } as ExcelJS.Fill
  };
};

const paintHoliday = (worksheet: ExcelJS.Worksheet, address: string) =>
  paintCell(worksheet, address, HOLIDAY_FILL_ARGB);

const paintPlainWeekday = (worksheet: ExcelJS.Worksheet, address: string) =>
  paintCell(worksheet, address, "FFFFFFFF");

afterEach(() => {
  resetSqliteStorageForTest();
  resetMonthlyScheduleStorageForTest();
  resetPerformanceFileStorageForTest();
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const prepareReturnedWorkbook = async (changedSlotPriorityEffectiveFrom: string) => {
  const rootDir = testRoot;
  const dbPath = path.resolve(rootDir, "changed-slot-rule.test.sqlite");
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
      migrationFilePath: "",
      changedSlotPriorityEffectiveFrom
    },
    { userDataPath }
  );

  const site = saveStoredSite({
    siteCode: "SITE-CSR",
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

  const roster: Array<[string, string]> = [
    ["EMP-01", "김철수"],
    ["EMP-02", "박영수"],
    ["EMP-03", "정대만"],
    ["EMP-04", "한소희"],
    ["EMP-05", "이민호"],
    ["EMP-06", "최유리"],
    ["EMP-07", "강동원"],
    ["EMP-08", "서지훈"],
    ["EMP-09", "박서준"],
    ["EMP-10", "윤아름"],
    ["EMP-11", "한지민"],
    ["EMP-12", "오세훈"],
    ["EMP-13", "임수정"]
  ];
  roster.forEach(([employeeCode, name]) =>
    saveStoredEmployee({
      employeeCode,
      name,
      rank: "사원",
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: site.id,
      shiftGroup: "A조",
      hourlyRate: 13000
    })
  );

  const template = listStoredDocumentTemplateVersions("schedule").find(
    (item) => item.versionLabel === "근무표 양식 1"
  );

  if (!template) {
    throw new Error("근무표 양식 1 템플릿을 찾지 못했습니다.");
  }

  // One item on another date so the D duty-code time fallback has a slot time to read.
  const schedule = saveStoredMonthlySchedule({
    siteId: site.id,
    scheduleMonth: SCHEDULE_MONTH,
    patternId: pattern.id,
    generatedBy: "admin",
    templateVersionId: template.id,
    items: [
      {
        employeeCode: "EMP-01",
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

  // sample1 본표: 날짜 Y12.., D 정규 Z/AA/AB/AC, D 변경 AL/AM/AN/AO
  // ── 휴일 행 1 (2026-03-01) ────────────────────────────────────────────────
  worksheet.getCell("Y12").value = "2026-03-01";
  paintHoliday(worksheet, "Y12");
  // A. 변경전 = 실명(김철수) + 변경후 = 다른 실명(박영수) ← the reported input
  worksheet.getCell("Z12").value = "김철수";
  worksheet.getCell("AL12").value = "박영수";
  // B. 변경전 = 홍길동(가상) + 변경후 = 정대만
  worksheet.getCell("AA12").value = "홍길동";
  worksheet.getCell("AM12").value = "정대만";
  // C. 변경전 = 빈칸 + 변경후 = 한소희
  worksheet.getCell("AB12").value = "";
  worksheet.getCell("AN12").value = "한소희";
  // D. 변경전 = '-' + 변경후 = 이민호
  worksheet.getCell("AC12").value = "-";
  worksheet.getCell("AO12").value = "이민호";

  // ── 평일 행 (2026-03-02, 분홍칠 없음) ─────────────────────────────────────
  worksheet.getCell("Y13").value = "2026-03-02";
  paintPlainWeekday(worksheet, "Y13");
  worksheet.getCell("Z13").value = "윤아름";
  worksheet.getCell("AL13").value = "한지민";

  // ── 휴일 행 2 (2026-03-03) — 빈슬롯 표기에 꼬리가 붙은 경우 ───────────────
  worksheet.getCell("Y14").value = "2026-03-03";
  paintHoliday(worksheet, "Y14");
  // K. 변경전 = "None_A3"(정확히 None이 아님) + 변경후 = 임수정
  worksheet.getCell("Z14").value = "None_A3";
  worksheet.getCell("AL14").value = "임수정";

  // ── 휴일 행 3 (2026-03-04) ───────────────────────────────────────────────
  worksheet.getCell("Y15").value = "2026-03-04";
  paintHoliday(worksheet, "Y15");
  // E. 변경전 = None + 변경후 = 최유리
  worksheet.getCell("Z15").value = "None";
  worksheet.getCell("AL15").value = "최유리";
  // F. 변경전 = BP(...) + 변경후 = 강동원
  worksheet.getCell("AA15").value = "BP(김영희)";
  worksheet.getCell("AM15").value = "강동원";
  // G. 변경전 = 실명(서지훈) + 변경후 = None
  worksheet.getCell("AB15").value = "서지훈";
  worksheet.getCell("AN15").value = "None";
  // H. 변경전 = 실명(박서준) + 변경후 = BP
  worksheet.getCell("AC15").value = "박서준";
  worksheet.getCell("AO15").value = "BP";

  // ── 휴일 행 4 (2026-03-05) + 대체표 대조군 ────────────────────────────────
  worksheet.getCell("Y16").value = "2026-03-05";
  paintHoliday(worksheet, "Y16");
  // J. 본표에도 한지민 -> 오세훈, 대체표에도 같은 내용을 적은 경우(이중계산 감시).
  worksheet.getCell("Z16").value = "한지민";
  worksheet.getCell("AL16").value = "오세훈";
  // 대체표(sample1): 날짜 BA, 원근무자 BC, 대체자 BE, 사유 BG, 증빙 BJ (행 11~26)
  worksheet.getCell("BA11").value = "2026-03-05";
  worksheet.getCell("BC11").value = "한지민";
  worksheet.getCell("BE11").value = "오세훈";
  worksheet.getCell("BG11").value = "휴일대체";
  worksheet.getCell("BJ11").value = "증빙1";

  await workbook.xlsx.writeFile(returnedPath);

  const detail = await buildPerformanceFileDetailFromPath({
    filePath: returnedPath,
    settings: { pendingDir, approvedDir },
    forceReparse: true
  });
  const entries = detail?.entries ?? [];

  return {
    entries,
    at: (workDate: string) => entries.filter((entry) => entry.workDate === workDate),
    nameAt: (workDate: string) =>
      entries.filter((entry) => entry.workDate === workDate).map((entry) => entry.employeeName)
  };
};

describe("변경후 우선 규칙 — 적용 시작일 이전(옛 규칙 유지)", () => {
  it(
    "credits the 변경전 worker and ignores 변경후, exactly as before",
    async () => {
      // Work dates are 2026-03-xx, the effective date is later, so nothing may change.
      const { at, nameAt } = await prepareReturnedWorkbook("2026-07-01");

      // A. 변경전 실명 + 변경후 실명 -> 변경전(김철수) credited, 박영수 dropped.
      const kim = at("2026-03-01").filter((entry) => entry.employeeName === "김철수");
      expect(kim).toHaveLength(1);
      expect(kim[0].section).toBe("legal-holiday");
      expect(kim[0].workType).toBe("holiday");
      expect(kim[0].totalWorkMinutes).toBeGreaterThan(0);
      expect(nameAt("2026-03-01")).not.toContain("박영수");
      expect(kim[0].alerts.map((alert) => alert.message)).toContain(
        "03-01 변경후 박영수은(는) 변경후 우선 적용 시작일 이전 근무라 반영하지 않고 원 근무자 김철수(으)로 처리했습니다."
      );

      // B~D. 홍길동/빈칸/'-' paths keep crediting the 변경후 worker, with the same notes.
      expect(nameAt("2026-03-01")).toContain("정대만");
      expect(nameAt("2026-03-01")).toContain("한소희");
      expect(nameAt("2026-03-01")).toContain("이민호");
      expect(nameAt("2026-03-01")).not.toContain("홍길동");
      expect(
        at("2026-03-01").find((entry) => entry.employeeName === "정대만")?.note
      ).toContain("홍길동 기준 법정휴일근로");
      expect(
        at("2026-03-01").find((entry) => entry.employeeName === "한소희")?.note
      ).toContain("빈 근무열 기준 법정휴일근로");

      // K. "None_A3" is not exactly "None", so it used to be read as a person's name.
      expect(nameAt("2026-03-03")).toContain("None_A3");
      expect(nameAt("2026-03-03")).not.toContain("임수정");

      // E. 변경전 None + 변경후 실명 -> 변경후 credited.
      expect(nameAt("2026-03-04")).toContain("최유리");
      // F. 변경전 BP -> the substitute vanishes with no alert at all.
      expect(nameAt("2026-03-04")).not.toContain("강동원");
      // G/H. 변경후 None/BP -> the whole slot is skipped.
      expect(nameAt("2026-03-04")).not.toContain("서지훈");
      expect(nameAt("2026-03-04")).not.toContain("박서준");

      // I. Weekday rows produce nothing from this grid at all.
      expect(at("2026-03-02")).toHaveLength(0);

      // J. 대체표 wins: the 본표 original is cancelled and one substitute entry remains.
      const day5 = at("2026-03-05");
      expect(day5.filter((entry) => entry.employeeName === "한지민")).toHaveLength(0);
      const oh = day5.filter((entry) => entry.employeeName === "오세훈");
      expect(oh).toHaveLength(1);
      expect(oh[0].section).toBe("substitute");
      expect(oh[0].note).toContain("원 근무자 한지민");
    },
    120000
  );
});

describe("변경후 우선 규칙 — 적용 시작일 이후", () => {
  it(
    "credits whoever is written into 변경후, whatever 변경전 says",
    async () => {
      const { at, nameAt } = await prepareReturnedWorkbook("2026-03-01");

      // A. The reported case: 변경후(박영수) is now the worker, 김철수 is not credited.
      const park = at("2026-03-01").filter((entry) => entry.employeeName === "박영수");
      expect(park).toHaveLength(1);
      expect(park[0].section).toBe("legal-holiday");
      expect(park[0].workType).toBe("holiday");
      expect(park[0].totalWorkMinutes).toBeGreaterThan(0);
      expect(park[0].note).toContain("원 근무자 김철수 대신 투입");
      expect(nameAt("2026-03-01")).not.toContain("김철수");
      // The "not reflected" warning only belongs on the old rule.
      expect(
        at("2026-03-01").flatMap((entry) => entry.alerts.map((alert) => alert.message))
      ).not.toContain(
        "03-01 변경후 박영수은(는) 변경후 우선 적용 시작일 이전 근무라 반영하지 않고 원 근무자 김철수(으)로 처리했습니다."
      );

      // B~D. The paths that already worked are untouched, notes included.
      expect(nameAt("2026-03-01")).toContain("정대만");
      expect(nameAt("2026-03-01")).toContain("한소희");
      expect(nameAt("2026-03-01")).toContain("이민호");
      expect(
        at("2026-03-01").find((entry) => entry.employeeName === "정대만")?.note
      ).toContain("홍길동 기준 법정휴일근로");

      // K. The ghost worker is gone and the real substitute is credited instead.
      expect(nameAt("2026-03-03")).not.toContain("None_A3");
      expect(nameAt("2026-03-03")).toContain("임수정");

      // E. Unchanged.
      expect(nameAt("2026-03-04")).toContain("최유리");
      // F. The BP hole is closed — the substitute no longer disappears.
      expect(nameAt("2026-03-04")).toContain("강동원");
      // G/H. 변경후 = None/BP still means "nobody worked this slot".
      expect(nameAt("2026-03-04")).not.toContain("서지훈");
      expect(nameAt("2026-03-04")).not.toContain("박서준");

      // I. Weekday rows are still out of scope for this grid.
      expect(at("2026-03-02")).toHaveLength(0);

      // J. Still exactly one entry — writing it in both places must not pay twice.
      const day5 = at("2026-03-05");
      expect(day5.filter((entry) => entry.employeeName === "한지민")).toHaveLength(0);
      const oh = day5.filter((entry) => entry.employeeName === "오세훈");
      expect(oh).toHaveLength(1);
      expect(oh[0].section).toBe("substitute");
      expect(oh[0].note).toContain("원 근무자 한지민");
    },
    120000
  );
});
