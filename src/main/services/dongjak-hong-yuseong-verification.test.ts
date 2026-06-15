import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import { saveStoredEmployee } from "./employee-storage-service";
import { buildPerformanceFileDetailFromPath } from "./performance-file-intake-service";
import {
  resetPerformanceFileStorageForTest,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import { restoreMissingMonthlySchedulesFromExportedPlans } from "./monthly-schedule-restore-service";
import {
  resetMonthlyScheduleStorageForTest,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { listStoredDocumentTemplateVersions } from "./operations-storage-service";
import { exportMonthlySchedulePlan } from "./schedule-plan-export-service";
import { saveStoredSite } from "./site-storage-service";
import {
  listStoredShiftPatterns,
  saveStoredShiftPattern
} from "./shift-pattern-storage-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import { calculateRoundedAllowanceLineAmounts } from "../../shared/domain/allowance-service";

// 실데이터 end-to-end 검증: SKB동작국사(A/B/C 5조3교대) 치환 슬롯 "홍길동 → 유성".
//
// 과거 버그(0.4.21 이전, [[v0421-open-issues]]): 근무패턴이 D/E/N이 아닌 A/B/C 코드를 쓰는
// 동작국사에서, 근무표가 사라져 복원되면 그리드 D/E/N 위치에 시간이 매핑되지 않아 치환 슬롯
// 유성의 실적이 0분·0원으로 누락됐다. 0.4.23(듀티코드 시간대 분류) + 0.4.24 하드닝으로 A/B/C를
// 시간대로 분류해 그리드 E(저녁) 위치를 복원하도록 고쳤다.
//
// 이 테스트는 mock 없이 실제 production 서비스(사이트/직원/패턴/스케줄 저장 → 실제 export →
// 실제 복원 → 실제 파서 → 실제 수당 계산식)로 그 시나리오를 그대로 재현하고, 치환 실적이
// 0분이 아니라 420분/양수 원으로 산출됨을 단언한다.

const SITE_NAME = "동작국사";
const SCHEDULE_MONTH = "2026-03";
const HOLIDAY_DATE = "2026-03-01"; // 삼일절 (법정공휴일) — export가 휴일 배경색을 칠한다.
const SUBSTITUTE_DATE = "2026-03-02"; // 평일 치환(대체) 근무일.

// 직원 시급(원/시) — saveStoredEmployee 반환 레코드는 시급을 echo하지 않으므로(시급은
// resolveHourlyRate(workDate)로 해석) 수당 환산용으로 설정값을 상수로 고정해 둔다.
const YUSEONG_HOURLY_RATE = 12900;
const HOLIDAY_HOURLY_RATE = 13200;

const testRoot = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  `dongjak-hong-yuseong-${process.pid}`
);

const formatWon = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

afterEach(() => {
  resetSqliteStorageForTest();
  resetMonthlyScheduleStorageForTest();
  resetPerformanceFileStorageForTest();
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("동작국사 홍길동→유성 치환 슬롯 실데이터 검증", () => {
  it("A/B/C 패턴 근무표가 사라졌다 복원돼도 유성의 치환 실적이 0분이 아니라 420분·양수 원으로 산출된다", async () => {
    const rootDir = testRoot;
    const dbPath = path.resolve(rootDir, "dongjak.test.sqlite");
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

    // 1) 실제 사이트 "동작국사" 생성.
    const site = saveStoredSite({
      siteCode: "SITE-DJ",
      name: SITE_NAME,
      customerName: "SK broadband",
      status: "active",
      timezone: "Asia/Seoul"
    });

    // 2) 실제 A/B/C 근무패턴(동작국사 특성: 그리드는 D/E/N 위치, 패턴은 A/B/C 코드).
    //    A=06:00-18:00(주간) / B=14:00-22:00(저녁) / C=18:00-06:00(야간) / X=휴무.
    const pattern = saveStoredShiftPattern({
      siteId: site.id,
      name: "동작국사 A조 3교대",
      teamCount: 4,
      patternCode: "ABCX",
      startIndexRule: "team-sequence",
      patternStartDate: "2024-01-01",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "A", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "B", startTime: "14:00", endTime: "22:00", breakMinutes: 60 },
        { stepIndex: 2, dutyCode: "C", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: Array.from({ length: 4 }, (_, index) => ({
        teamLabel: `${String.fromCharCode(65 + index)}조`,
        index
      })),
      poolEnabled: false,
      poolBreakMinutes: 0
    });

    // 동작국사에는 내가 만든 A/B/C 패턴만 존재해야 복원이 그것을 강제로 쓴다(시드는 보라매DC 전용).
    const sitePatterns = listStoredShiftPatterns(site.id).filter(
      (item) => item.status === "active"
    );
    expect(sitePatterns).toHaveLength(1);
    expect(sitePatterns[0]?.name).toBe("동작국사 A조 3교대");

    // 3) 실제 직원: 한가람(휴일 주간), 홍길동(치환 원슬롯·저녁 B/E), 유성(실투입 대체자).
    const makeEmployee = (input: {
      employeeCode: string;
      name: string;
      shiftGroup: string;
      hourlyRate: number;
    }) =>
      saveStoredEmployee({
        employeeCode: input.employeeCode,
        name: input.name,
        rank: "사원",
        employmentType: "정규",
        status: "active",
        hireDate: "2024-01-01",
        siteId: site.id,
        shiftGroup: input.shiftGroup,
        hourlyRate: input.hourlyRate
      });

    const holidayWorker = makeEmployee({
      employeeCode: "EMP-DJ-HOLIDAY",
      name: "한가람",
      shiftGroup: "A조",
      hourlyRate: HOLIDAY_HOURLY_RATE
    });
    const hong = makeEmployee({
      employeeCode: "EMP-DJ-HONG",
      name: "홍길동",
      shiftGroup: "B조",
      hourlyRate: 12800
    });
    const yuseong = makeEmployee({
      employeeCode: "EMP-DJ-YUSEONG",
      name: "유성",
      shiftGroup: "C조",
      hourlyRate: YUSEONG_HOURLY_RATE
    });

    const template = listStoredDocumentTemplateVersions("schedule").find(
      (item) => item.versionLabel === "근무표 양식 1"
    );

    if (!template) {
      throw new Error("근무표 양식 1 템플릿을 찾지 못했습니다.");
    }

    // 4) 실제 월간 근무표 저장: 한가람(휴일 D/주간 06-18), 홍길동(치환 원슬롯 E/저녁 14-22).
    //    item.dutyCode 는 그리드 코드(D/E/N), 패턴은 A/B/C — 복원이 시간대로 매핑해야 한다.
    const schedule = saveStoredMonthlySchedule({
      siteId: site.id,
      scheduleMonth: SCHEDULE_MONTH,
      patternId: pattern.id,
      generatedBy: "admin",
      templateVersionId: template.id,
      items: [
        {
          employeeCode: holidayWorker.employeeCode,
          teamLabel: "A조",
          workDate: HOLIDAY_DATE,
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          employeeCode: hong.employeeCode,
          teamLabel: "B조",
          workDate: SUBSTITUTE_DATE,
          dutyCode: "E",
          startTime: "14:00",
          endTime: "22:00",
          breakMinutes: 60
        }
      ]
    });

    // 5) 실제 export로 배포 근무표(.xlsx) 생성 — 여기서 삼일절 휴일 배경색이 칠해진다.
    const exported = await exportMonthlySchedulePlan({
      scheduleId: schedule.id,
      userDataPath,
      outputDir: exportDir
    });

    if (!exported) {
      throw new Error("근무표 export에 실패했습니다.");
    }

    // 6) 배포본을 복사해 "회신된 근무표"를 만들고, 치환(대체) 행을 주입한다.
    //    sample1(근무표 양식 1) 레이아웃: BA=날짜, BC=원근무자, BE=대체근무자, BG=사유, BJ=증적.
    const returnedPath = path.resolve(pendingDir, exported.outputFileName);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported.outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

    worksheet.getCell("BA11").value = SUBSTITUTE_DATE;
    worksheet.getCell("BC11").value = hong.name; // 홍길동(원래 배정자)
    worksheet.getCell("BE11").value = yuseong.name; // 유성(실제 대체 투입자)
    worksheet.getCell("BG11").value = "교육";
    worksheet.getCell("BJ11").value = "대체증적";

    await workbook.xlsx.writeFile(returnedPath);

    const parseSettings = { pendingDir, approvedDir };

    // 7) 근무표가 사라진 상태를 재현(라이브 DB는 monthly_schedules 0행) 후 복원 전 파싱.
    const database = getSqliteDatabase()!;
    database.prepare("DELETE FROM monthly_schedule_items").run();
    database.prepare("DELETE FROM monthly_schedules").run();

    const beforeDetail = await buildPerformanceFileDetailFromPath({
      filePath: returnedPath,
      settings: parseSettings,
      forceReparse: true
    });
    const beforeSubstitute = beforeDetail?.entries.find((entry) => entry.section === "substitute");
    const beforeHoliday = beforeDetail?.entries.find((entry) => entry.section === "legal-holiday");

    // 버그 상태: 근무표가 없으니 치환/휴일 모두 0분.
    expect(beforeSubstitute?.totalWorkMinutes ?? 0).toBe(0);
    expect(beforeHoliday?.totalWorkMinutes ?? 0).toBe(0);

    // 복원이 (site,월) 대상을 알 수 있도록 실적 상세를 적재.
    upsertPerformanceFileDetail(beforeDetail!);

    // 8) 실제 복원 실행 — 배포본의 A/B/C 패턴을 시간대로 분류해 그리드 D/E/N을 복원.
    const summary = await restoreMissingMonthlySchedulesFromExportedPlans({
      scheduleExportDir: exportDir
    });

    expect(summary.restoredScheduleCount).toBe(1);
    // E(저녁) 위치가 B(14:00-22:00)로 정상 분류되면 미해결 경고가 없어야 한다.
    expect(summary.issueMessages.some((message) => message.includes("시간을 확인하지 못"))).toBe(
      false
    );

    // 9) 복원 후 재파싱 — 유성 치환 실적/한가람 휴일 실적 확인.
    const afterDetail = await buildPerformanceFileDetailFromPath({
      filePath: returnedPath,
      settings: parseSettings,
      forceReparse: true
    });
    const afterSubstitute = afterDetail?.entries.find((entry) => entry.section === "substitute");
    const afterHoliday = afterDetail?.entries.find((entry) => entry.section === "legal-holiday");

    // 핵심 단언: 유성의 치환 실적이 0분이 아니라 420분(14:00-22:00 − 60분 휴게).
    expect(afterSubstitute).toBeDefined();
    expect(afterSubstitute?.employeeName).toBe("유성");
    expect(afterSubstitute?.workType).toBe("substitute");
    expect(afterSubstitute?.workDate).toBe(SUBSTITUTE_DATE);
    expect(afterSubstitute?.totalWorkMinutes).toBe(420);
    expect(afterSubstitute?.baseWorkMinutes).toBe(420);
    expect(afterSubstitute?.reason).toBe("교육");
    expect(afterSubstitute?.evidence).toBe("대체증적");

    // 휴일 주간(한가람, 삼일절 06-18) = 660분 전부 기본근로.
    // 법정휴일 직접근무는 주간/야간/연장으로 쪼개지 않고 모두 기본근로시간으로 처리한다.
    expect(afterHoliday?.totalWorkMinutes).toBe(660);
    expect(afterHoliday?.baseWorkMinutes).toBe(660);
    expect(afterHoliday?.overtimeMinutes).toBe(0);
    expect(afterHoliday?.nightMinutes).toBe(0);

    // 10) 실제 수당 계산식으로 "원" 산출 — 분이 양수이므로 원도 양수.
    //     배율은 일반 대체/공휴일 환산 예시(대체 1.5x, 공휴일 기본 1.5x + 연장 2.0x).
    const substituteWon = calculateRoundedAllowanceLineAmounts(YUSEONG_HOURLY_RATE, [
      { workMinutes: afterSubstitute!.baseWorkMinutes, multiplier: 1.5 }
    ]).totalAmount;
    const holidayWon = calculateRoundedAllowanceLineAmounts(HOLIDAY_HOURLY_RATE, [
      { workMinutes: afterHoliday!.baseWorkMinutes, multiplier: 1.5 }
    ]).totalAmount;

    expect(substituteWon).toBeGreaterThan(0);
    expect(holidayWon).toBeGreaterThan(0);

    console.log(
      [
        "",
        "==================== 동작국사 홍길동→유성 치환 슬롯 실검증 ====================",
        `사이트: ${SITE_NAME} / 월: ${SCHEDULE_MONTH} / 패턴: ${pattern.patternCode} (A/B/C, 그리드 D/E/N)`,
        "",
        "[복원 전 — 근무표 사라진 상태(버그 재현)]",
        `  · 유성 치환 실적 : ${beforeSubstitute?.totalWorkMinutes ?? 0}분`,
        `  · 한가람 휴일 실적: ${beforeHoliday?.totalWorkMinutes ?? 0}분`,
        "",
        "[복원 후 — A/B/C→D/E/N 시간대 분류 성공]",
        `  · 복원 스케줄 수  : ${summary.restoredScheduleCount}건, 미해결 경고: ${
          summary.issueMessages.length
        }건`,
        `  · 유성 치환 실적  : ${afterSubstitute?.totalWorkMinutes}분 (홍길동 B/저녁 14:00-22:00 슬롯 크레딧)`,
        `      └ 수당(시급 ${YUSEONG_HOURLY_RATE.toLocaleString("ko-KR")}원 × 420분 × 1.5 ÷ 60) = ${formatWon(
          substituteWon
        )}`,
        `  · 한가람 휴일 실적: ${afterHoliday?.totalWorkMinutes}분 (전부 기본근로)`,
        `      └ 수당(기본 660×1.5) = ${formatWon(holidayWon)}`,
        "===============================================================================",
        ""
      ].join("\n")
    );
  });
});
