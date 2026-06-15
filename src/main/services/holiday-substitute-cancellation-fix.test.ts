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

// 적대검증(2026-06-15)에서 잡힌 휴일 대체/크레딧 결함의 회귀 가드:
//  (A) 한 사람이 같은 휴일에 두 자리(직접근무 + 대체된 자리)면, 대체표 한 행이 '그 슬롯 하나'만
//      취소해 직접 근무한 자리는 살아남아야 한다(이름만으로 두 자리 모두 취소되면 수당 누락).
//  (B) 본표 정규칸이 None인데 변경후 근무자가 같은 날 대체표 대체자로도 인정되면, 휴일+대체
//      이중지급이 아니라 단건만 남아야 한다.
//  (C) 동명이인(같은 이름·다른 사번)이 같은 휴일에 함께 있으면, 대체표 한 행이 한 자리만 취소해
//      실제로 근무한 다른 동명이인은 수당을 받아야 한다.

const SCHEDULE_MONTH = "2026-03";
const SUBSTITUTE_DATE = "2026-03-01";
const testRoot = path.resolve(process.cwd(), "artifacts", "tests", `holiday-sub-fix-${process.pid}`);

const paintHoliday = (worksheet: ExcelJS.Worksheet, address: string) => {
  worksheet.getCell(address).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFD1D1" }
  } as ExcelJS.Fill;
};

interface EmployeeSeed {
  employeeCode: string;
  name: string;
  shiftGroup: string;
}

const prepareReturnedWorkbook = async (employees: EmployeeSeed[]) => {
  const rootDir = testRoot;
  const dbPath = path.resolve(rootDir, "holiday-sub-fix.test.sqlite");
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
    siteCode: "SITE-HSF",
    name: `휴일대체수정검증국사-${process.pid}`,
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

  employees.forEach((employee) =>
    saveStoredEmployee({
      employeeCode: employee.employeeCode,
      name: employee.name,
      rank: "사원",
      employmentType: "정규",
      status: "active",
      hireDate: "2024-01-01",
      siteId: site.id,
      shiftGroup: employee.shiftGroup,
      hourlyRate: 13000
    })
  );

  const template = listStoredDocumentTemplateVersions("schedule").find(
    (item) => item.versionLabel === "근무표 양식 1"
  );
  if (!template) {
    throw new Error("근무표 양식 1 템플릿을 찾지 못했습니다.");
  }

  // 시간 폴백용 D 항목(비휴일). 휴일 D 슬롯은 이 dutyCode 시간을 끌어와 0분이 아니게 된다.
  const schedule = saveStoredMonthlySchedule({
    siteId: site.id,
    scheduleMonth: SCHEDULE_MONTH,
    patternId: pattern.id,
    generatedBy: "admin",
    templateVersionId: template.id,
    items: [
      {
        employeeCode: employees[0]?.employeeCode ?? "EMP-FALLBACK",
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

  const parse = async () => {
    await workbook.xlsx.writeFile(returnedPath);
    const detail = await buildPerformanceFileDetailFromPath({
      filePath: returnedPath,
      settings: { pendingDir, approvedDir },
      forceReparse: true
    });
    return detail?.entries ?? [];
  };

  return { worksheet, parse };
};

afterEach(() => {
  resetSqliteStorageForTest();
  resetMonthlyScheduleStorageForTest();
  resetPerformanceFileStorageForTest();
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("휴일 대체/크레딧 결함 회귀 가드 (적대검증 2026-06-15)", () => {
  it("(A) 한 사람이 같은 휴일에 두 자리면, 대체된 자리만 취소되고 직접 근무한 자리는 살아남는다", async () => {
    const { worksheet, parse } = await prepareReturnedWorkbook([
      { employeeCode: "EMP-YH", name: "김영희", shiftGroup: "A조" },
      { employeeCode: "EMP-CS", name: "김철수", shiftGroup: "B조" }
    ]);

    // 휴일 03-01. D정규 슬롯0=Z, 슬롯1=AA / D변경 슬롯0=AL, 슬롯1=AM.
    worksheet.getCell("Y12").value = SUBSTITUTE_DATE;
    paintHoliday(worksheet, "Y12");
    // 슬롯0: 김영희 직접근무(변경 없음).
    worksheet.getCell("Z12").value = "김영희";
    // 슬롯1: 김영희가 원근무자였으나 김철수로 대체됨(변경후=김철수로 그 자리를 명시).
    worksheet.getCell("AA12").value = "김영희";
    worksheet.getCell("AM12").value = "김철수";

    // 대체표: 휴일 03-01 김영희→김철수 한 행.
    worksheet.getCell("BA11").value = SUBSTITUTE_DATE;
    worksheet.getCell("BC11").value = "김영희";
    worksheet.getCell("BE11").value = "김철수";
    worksheet.getCell("BG11").value = "휴일대체";
    worksheet.getCell("BJ11").value = "증빙1";

    const entries = await parse();
    const holiday = entries.filter((e) => e.section === "legal-holiday");
    const substitute = entries.filter((e) => e.section === "substitute");

    // 김영희는 직접 근무한 슬롯0 하나가 살아남아야 한다(둘 다 취소되어 0이 되면 안 됨).
    const yh = holiday.filter((e) => e.workDate === SUBSTITUTE_DATE && e.employeeName === "김영희");
    expect(yh).toHaveLength(1);
    // 살아남은 자리는 대체된 슬롯1이 아니라 직접근무 슬롯0이어야 한다.
    expect(yh[0]?.id.includes(":D:0")).toBe(true);

    // 대체자 김철수는 대체 실적 1건.
    const csSub = substitute.filter(
      (e) => e.workDate === SUBSTITUTE_DATE && e.employeeName === "김철수"
    );
    expect(csSub).toHaveLength(1);

    // 김철수는 휴일+대체로 이중 계산되지 않는다.
    expect(
      holiday.some((e) => e.workDate === SUBSTITUTE_DATE && e.employeeName === "김철수")
    ).toBe(false);
  });

  it("(B) None 자리 직접근무자가 같은 날 다른 사람을 대체해도, 두 건 모두 남고(조용한 누락 없음) 시간이 겹치면 충돌 경고로 드러난다", async () => {
    // 한 사람(김철수)이 같은 휴일에 (1) 비어있던(None) 자리를 직접 메워 일하고, (2) 다른 사람
    // (박민수)의 자리를 대체했다. 두 건은 별개 근무이므로 조용히 하나를 지우면 안 된다(과거의
    // '이름만으로 합쳐 지우기'는 직접근무 몫을 누락시켜 과소지급을 냈다). 두 건을 모두 남기고,
    // 시간이 겹치는 물리적 불가능(이중지급 위험)은 시간충돌 검증이 경고로 드러내 담당자가 판단한다.
    const { worksheet, parse } = await prepareReturnedWorkbook([
      { employeeCode: "EMP-CS", name: "김철수", shiftGroup: "A조" },
      { employeeCode: "EMP-PM", name: "박민수", shiftGroup: "B조" }
    ]);

    // 휴일 03-01.
    worksheet.getCell("Y12").value = SUBSTITUTE_DATE;
    paintHoliday(worksheet, "Y12");
    // 슬롯0: 정규=None, 변경후=김철수 → 김철수가 빈 자리를 직접 메워 근무(휴일 크레딧).
    worksheet.getCell("Z12").value = "None";
    worksheet.getCell("AL12").value = "김철수";
    // 슬롯1: 정규=박민수(대체표에서 김철수로 대체될 다른 사람).
    worksheet.getCell("AA12").value = "박민수";

    // 대체표: 휴일 03-01 박민수→김철수.
    worksheet.getCell("BA11").value = SUBSTITUTE_DATE;
    worksheet.getCell("BC11").value = "박민수";
    worksheet.getCell("BE11").value = "김철수";
    worksheet.getCell("BG11").value = "휴일대체";
    worksheet.getCell("BJ11").value = "증빙1";

    const entries = await parse();
    const onDate = entries.filter((e) => e.workDate === SUBSTITUTE_DATE);

    // 김철수의 두 건(직접 휴일근무 + 대체)이 모두 남는다 — 조용한 누락이 없어야 한다.
    const cs = onDate.filter((e) => e.employeeName === "김철수");
    expect(cs).toHaveLength(2);
    expect(cs.some((e) => e.section === "legal-holiday")).toBe(true);
    expect(cs.some((e) => e.section === "substitute")).toBe(true);

    // 두 건이 같은 시간대로 겹치므로 양쪽에 중복 충돌 경고가 달려 담당자에게 드러난다
    // (조용한 이중지급이 아니라 사람이 검토해 판단하도록).
    expect(cs.every((e) => e.alerts.some((alert) => alert.message.includes("중복")))).toBe(true);

    // 대체된 원근무자 박민수는 휴일 실적이 없어야 한다(대체로 빠짐 — 슬롯 단위 취소).
    expect(
      onDate.some((e) => e.employeeName === "박민수" && e.section === "legal-holiday")
    ).toBe(false);
  });

  it("(C) 동명이인이 같은 휴일에 함께 있으면, 대체된 한 자리만 취소되고 직접 근무한 동명이인은 수당을 받는다", async () => {
    const { worksheet, parse } = await prepareReturnedWorkbook([
      { employeeCode: "EMP-MS1", name: "김민수", shiftGroup: "A조" },
      { employeeCode: "EMP-MS2", name: "김민수", shiftGroup: "B조" },
      { employeeCode: "EMP-DC", name: "이대체", shiftGroup: "A조" }
    ]);

    // 휴일 03-01. 같은 이름 김민수가 두 자리(슬롯0, 슬롯1)에 있다.
    worksheet.getCell("Y12").value = SUBSTITUTE_DATE;
    paintHoliday(worksheet, "Y12");
    worksheet.getCell("Z12").value = "김민수";
    worksheet.getCell("AA12").value = "김민수";

    // 대체표: 휴일 03-01 김민수→이대체 한 행(둘 중 한 자리만 대체).
    worksheet.getCell("BA11").value = SUBSTITUTE_DATE;
    worksheet.getCell("BC11").value = "김민수";
    worksheet.getCell("BE11").value = "이대체";
    worksheet.getCell("BG11").value = "휴일대체";
    worksheet.getCell("BJ11").value = "증빙1";

    const entries = await parse();
    const holiday = entries.filter((e) => e.section === "legal-holiday");
    const substitute = entries.filter((e) => e.section === "substitute");

    // 김민수 휴일 실적은 정확히 1건(직접 근무한 동명이인) — 둘 다 취소되어 0이 되면 안 됨.
    const ms = holiday.filter((e) => e.workDate === SUBSTITUTE_DATE && e.employeeName === "김민수");
    expect(ms).toHaveLength(1);

    // 대체자 이대체는 대체 실적 1건.
    const dc = substitute.filter(
      (e) => e.workDate === SUBSTITUTE_DATE && e.employeeName === "이대체"
    );
    expect(dc).toHaveLength(1);
  });
});
