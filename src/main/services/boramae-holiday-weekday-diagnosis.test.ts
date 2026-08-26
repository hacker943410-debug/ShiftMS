import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runApprovedAllowanceCalculationForApproval } from "./approved-allowance-calculation-service";
import {
  listStoredHolidayCalendars,
  saveStoredHolidayItem
} from "./operations-storage-service";
import {
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import { buildMonthlyScheduleDraft } from "../../shared/domain/monthly-schedule-draft";
import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternStep
} from "../../shared/domain/model";

// 진단용 임시 테스트 (보라매DC: 휴일 근무인데 평일 근무시간으로 추출)
// 목적 = 휴일/평일 분기가 무엇으로 결정되는지 실행 증거로 확인. 소스 수정 없음.

const testRoot = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  `boramae-holiday-${process.pid}`
);

// 2026-09-25 = 금요일(평일). 시드 공휴일 달력에는 없는 날짜다.
const WEEKDAY_PUBLIC_HOLIDAY = "2026-09-25";

const createApproval = (
  approvalId: string,
  workDate: string,
  workType: "overtime" | "holiday" = "overtime"
) => {
  const entry = {
    id: `entry-${approvalId}`,
    performanceFileId: "file-1",
    logicalKey: `보라매DC|${workDate}|EMP-001`,
    scheduleMonth: workDate.slice(0, 7),
    scheduleKey: "보라매DC|2026-09",
    siteName: "보라매DC",
    employeeCode: "EMP-001",
    employeeName: "김철수",
    workDate,
    workType,
    section: workType === "holiday" ? "legal-holiday" : "overtime",
    dutyCode: "D",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    totalWorkMinutes: 480,
    baseWorkMinutes: 0,
    overtimeMinutes: 480,
    nightMinutes: 0,
    sourceRowNumber: 34,
    sortOrder: 1,
    alerts: [],
    status: "approved",
    hourlyRate: 13000,
    employeeRank: "사원"
  };

  return {
    id: approvalId,
    fileId: "file-1",
    decision: "approved",
    processedAt: "2026-10-01T00:00:00.000Z",
    processedBy: "admin",
    snapshotJson: JSON.stringify({
      fileId: "file-1",
      fileName: "보라매DC_2026-09.xlsx",
      filePath: "C:/tmp/보라매DC_2026-09.xlsx",
      scheduleMonth: "2026-09",
      siteName: "보라매DC",
      scheduleKey: "보라매DC|2026-09",
      templateKind: "schedule",
      templateVariant: "sample1",
      sheetName: "교대 근무 계획표",
      duplicateKey: `dup-${approvalId}`,
      receivedAt: "2026-09-30T00:00:00.000Z",
      entry
    })
  };
};

const createStep = (overrides?: Partial<ShiftPatternStep>): ShiftPatternStep =>
  ({
    id: "step-1",
    stepIndex: 0,
    dutyCode: "D",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    holidayStartTime: "09:00",
    holidayEndTime: "21:00",
    holidayBreakMinutes: 90,
    ...overrides
  }) as ShiftPatternStep;

const createPattern = (holidayTimeMode: "unified" | "split"): ShiftPatternRecord => {
  const step = createStep();
  const cycle = {
    id: "cycle-1",
    cycleKey: "cycle-1",
    name: "주간 사이클",
    order: 0,
    shiftCount: 1,
    cycleLength: 1,
    patternCode: "D",
    patternStartDate: "2026-09-01",
    holidayTimeMode,
    weekdayPublicHolidayAsHoliday: true,
    steps: [step],
    teamIndexes: [{ teamLabel: "A조", index: 0 }]
  } as ShiftPatternCycle;

  return {
    id: "pattern-boramae",
    siteId: "site-boramae",
    name: "보라매DC 패턴",
    teamCount: 1,
    cycleLength: 1,
    patternCode: "D",
    startIndexRule: "team-sequence",
    patternStartDate: "2026-09-01",
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    steps: [step],
    teamIndexes: [{ teamLabel: "A조", index: 0 }],
    cycles: [cycle],
    teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
    teamCapacities: [{ teamLabel: "A조" }],
    teamSettings: [],
    poolEnabled: false,
    poolBreakMinutes: 0
  } as ShiftPatternRecord;
};

const employees = [
  {
    id: "e1",
    employeeCode: "EMP-001",
    name: "김철수",
    rank: "사원",
    employmentType: "정규",
    status: "active",
    hireDate: "2024-01-01",
    currentShiftGroup: "A조",
    currentSiteId: "site-boramae"
  } as unknown as EmployeeRecord
];

beforeEach(() => {
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  mkdirSync(testRoot, { recursive: true });
  initializeSqliteStorage({ dbPath: path.resolve(testRoot, "diagnosis.sqlite") });
});

afterEach(() => {
  resetSqliteStorageForTest();
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("보라매DC 휴일→평일 추출 진단", () => {
  it("A. 기본 공휴일 달력 시드 내용 (전역)", () => {
    const calendars2026 = listStoredHolidayCalendars(2026);
    const dates2026 = calendars2026.flatMap((calendar) =>
      calendar.items.map((item) => item.holidayDate)
    );

    console.log("[A] 2026 달력 수:", calendars2026.length);
    console.log("[A] 2026 공휴일 목록:", JSON.stringify(dates2026));
    console.log("[A] 2025 달력 수:", listStoredHolidayCalendars(2025).length);
    console.log("[A] 2027 달력 수:", listStoredHolidayCalendars(2027).length);

    expect(dates2026).toEqual(["2026-01-01", "2026-03-01", "2026-05-05"]);
    expect(dates2026).not.toContain(WEEKDAY_PUBLIC_HOLIDAY);
    expect(listStoredHolidayCalendars(2025)).toHaveLength(0);
    expect(listStoredHolidayCalendars(2027)).toHaveLength(0);
  });

  it("B. 같은 근무·같은 시간인데 달력에 날짜가 없으면 평일(weekday-overtime)로 계산된다", async () => {
    // B-1) 달력에 2026-09-25 없음 → 평일
    const before = await runApprovedAllowanceCalculationForApproval(
      createApproval("approval-no-calendar", WEEKDAY_PUBLIC_HOLIDAY)
    );
    expect(before.ok).toBe(true);
    if (!before.ok) {
      return;
    }

    console.log(
      "[B-1] 달력 미등록:",
      before.data.snapshot.businessCategoryCode,
      "/",
      before.data.snapshot.businessCategoryLabel,
      "/ breakdown =",
      JSON.stringify(before.data.snapshot.breakdown),
      "/ lines =",
      JSON.stringify(before.data.snapshot.lines),
      "/ 합계 =",
      before.data.snapshot.totalAllowanceAmount
    );

    // B-2) 달력에 등록한 뒤 '새 승인 건'을 계산 → 휴일
    saveStoredHolidayItem({
      year: 2026,
      holidayDate: WEEKDAY_PUBLIC_HOLIDAY,
      name: "추석"
    });

    const after = await runApprovedAllowanceCalculationForApproval(
      createApproval("approval-with-calendar", WEEKDAY_PUBLIC_HOLIDAY)
    );
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }

    console.log(
      "[B-2] 달력 등록후:",
      after.data.snapshot.businessCategoryCode,
      "/",
      after.data.snapshot.businessCategoryLabel,
      "/ breakdown =",
      JSON.stringify(after.data.snapshot.breakdown),
      "/ lines =",
      JSON.stringify(after.data.snapshot.lines),
      "/ 합계 =",
      after.data.snapshot.totalAllowanceAmount
    );

    expect(before.data.snapshot.businessCategoryCode).toBe("weekday-overtime");
    expect(after.data.snapshot.businessCategoryCode).toBe("holiday-overtime");
    expect(before.data.snapshot.breakdown.holidayMinutes).toBe(0);
    expect(after.data.snapshot.breakdown.holidayMinutes).toBe(480);
    // 평일 판정 = 156,000원(480분 × 1.5배). 휴일 판정 = 0원 —
    // 기본 요율표의 '휴_연장근로수당'(holiday-overtime) 배율이 base/overtime/night 모두 0이라
    // 달력을 고치면 오히려 금액이 사라진다(요율 설정 공백).
    expect(before.data.snapshot.totalAllowanceAmount).toBe(156000);
    expect(after.data.snapshot.totalAllowanceAmount).toBe(0);
    expect(after.data.snapshot.lines).toHaveLength(0);

    // B-3) 이미 계산된 승인 건은 달력을 고쳐도 그대로 평일로 남는다(재계산 없음)
    const reRun = await runApprovedAllowanceCalculationForApproval(
      createApproval("approval-no-calendar", WEEKDAY_PUBLIC_HOLIDAY)
    );
    expect(reRun.ok).toBe(true);
    if (!reRun.ok) {
      return;
    }

    console.log(
      "[B-3] 달력 고친 뒤 같은 승인건 재실행:",
      reRun.data.snapshot.businessCategoryCode,
      "/ 합계 =",
      reRun.data.snapshot.totalAllowanceAmount,
      "/ 계산id 동일 =",
      reRun.data.id === before.data.id
    );

    expect(reRun.data.snapshot.businessCategoryCode).toBe("weekday-overtime");
    expect(reRun.data.id).toBe(before.data.id);
  });

  it("D. 그리드 분홍칠로 뽑힌 행(workType=holiday)은 달력과 무관하게 법정공휴일로 계산된다", async () => {
    const result = await runApprovedAllowanceCalculationForApproval(
      createApproval("approval-holiday-section", WEEKDAY_PUBLIC_HOLIDAY, "holiday")
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    console.log(
      "[D] 달력 미등록 + workType=holiday:",
      result.data.snapshot.businessCategoryCode,
      "/",
      result.data.snapshot.businessCategoryLabel,
      "/ breakdown =",
      JSON.stringify(result.data.snapshot.breakdown),
      "/ lines =",
      JSON.stringify(result.data.snapshot.lines),
      "/ 합계 =",
      result.data.snapshot.totalAllowanceAmount
    );

    // 달력에 없는 날짜인데도 법정공휴일로 분류된다 → 분홍칠(파서)과 달력(계산)은 독립된 두 스위치.
    expect(listStoredHolidayCalendars(2026)[0]?.items.map((item) => item.holidayDate)).not.toContain(
      WEEKDAY_PUBLIC_HOLIDAY
    );
    expect(result.data.snapshot.businessCategoryCode).toBe("legal-holiday");
    expect(result.data.snapshot.totalAllowanceAmount).toBe(156000);
  });

  it("C. 근무지 패턴이 '평·휴 통합(unified)'이면 공휴일에도 평일 근무시간이 나온다", () => {
    const publicHolidayDates = new Set<string>([WEEKDAY_PUBLIC_HOLIDAY]);

    const unified = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-09",
      pattern: createPattern("unified"),
      employees,
      publicHolidayDates
    }).find((item) => item.workDate === WEEKDAY_PUBLIC_HOLIDAY);

    const split = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-09",
      pattern: createPattern("split"),
      employees,
      publicHolidayDates
    }).find((item) => item.workDate === WEEKDAY_PUBLIC_HOLIDAY);

    const splitNoCalendar = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-09",
      pattern: createPattern("split"),
      employees,
      publicHolidayDates: new Set<string>()
    }).find((item) => item.workDate === WEEKDAY_PUBLIC_HOLIDAY);

    console.log("[C] unified(통합) 근무시간:", JSON.stringify(unified));
    console.log("[C] split(분리)+달력등록 근무시간:", JSON.stringify(split));
    console.log("[C] split(분리)+달력누락 근무시간:", JSON.stringify(splitNoCalendar));

    expect(unified).toMatchObject({
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    });
    expect(split).toMatchObject({
      startTime: "09:00",
      endTime: "21:00",
      breakMinutes: 90
    });
    // 분리로 켜져 있어도 달력에 공휴일이 없으면 평일 시간으로 떨어진다.
    expect(splitNoCalendar).toMatchObject({
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    });
  });
});
