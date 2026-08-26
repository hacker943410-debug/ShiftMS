import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runApprovedAllowanceCalculationForApproval } from "./approved-allowance-calculation-service";
import { listStoredHolidayCalendars } from "./operations-storage-service";
import {
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
import {
  buildMonthlyScheduleDraft,
  shouldUseHolidayTimes
} from "../../shared/domain/monthly-schedule-draft";
import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternStep
} from "../../shared/domain/model";

// 적대 검증용 임시 테스트.
// 조사자 주장: "휴일/평일은 요일이 아니라 공휴일 달력 + split 설정으로만 결정된다".
// 여기서는 토·일(주말) 경로가 달력과 무관하게 존재하는지를 확인한다. 소스 수정 없음.

const testRoot = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  `boramae-weekend-${process.pid}`
);

const FRIDAY = "2026-09-25";
const SATURDAY = "2026-09-26";
const SUNDAY = "2026-09-27";

const createStep = (): ShiftPatternStep =>
  ({
    id: "step-1",
    stepIndex: 0,
    dutyCode: "D",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    holidayStartTime: "09:00",
    holidayEndTime: "21:00",
    holidayBreakMinutes: 90
  }) as ShiftPatternStep;

const createPattern = (
  holidayTimeMode: "unified" | "split",
  weekdayPublicHolidayAsHoliday = true
): ShiftPatternRecord => {
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
    weekdayPublicHolidayAsHoliday,
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

const draftFor = (
  pattern: ShiftPatternRecord,
  publicHolidayDates: Set<string>,
  workDate: string
) =>
  buildMonthlyScheduleDraft({
    scheduleMonth: "2026-09",
    pattern,
    employees,
    publicHolidayDates
  }).find((item) => item.workDate === workDate);

const createApproval = (approvalId: string, workDate: string) => {
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
    workType: "overtime",
    section: "overtime",
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

beforeEach(() => {
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  mkdirSync(testRoot, { recursive: true });
  initializeSqliteStorage({ dbPath: path.resolve(testRoot, "crosscheck.sqlite") });
});

afterEach(() => {
  resetSqliteStorageForTest();
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("적대검증: 주말(토·일) 경로는 공휴일 달력과 무관하다", () => {
  it("E. 요일 확인 + 달력이 비어 있어도 토·일은 휴일 근무시간이 나온다 (split)", () => {
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    [FRIDAY, SATURDAY, SUNDAY].forEach((date) => {
      const [y, m, d] = date.split("-").map(Number);
      console.log(`[E] ${date} = ${dayNames[new Date(y!, m! - 1, d!).getDay()]}요일`);
    });

    // 달력을 완전히 비운 채로(EMPTY) 조사자 시나리오를 그대로 재현
    const empty = new Set<string>();
    const split = createPattern("split");

    const fri = draftFor(split, empty, FRIDAY);
    const sat = draftFor(split, empty, SATURDAY);
    const sun = draftFor(split, empty, SUNDAY);

    console.log("[E] split + 달력비움 금요일:", JSON.stringify(fri));
    console.log("[E] split + 달력비움 토요일:", JSON.stringify(sat));
    console.log("[E] split + 달력비움 일요일:", JSON.stringify(sun));

    // 조사자 주장대로라면 셋 다 09:00~18:00 이어야 한다. 실제는 토·일만 휴일 시간.
    expect(fri).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
    expect(sat).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
    expect(sun).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
  });

  it("F. 토요일에 평일 시간이 나오는 유일한 이유는 unified 이며, 달력을 채워도 안 고쳐진다", () => {
    const unified = createPattern("unified");

    const satNoCal = draftFor(unified, new Set<string>(), SATURDAY);
    // 달력에 토요일을 공휴일로 등록해도 unified 면 여전히 평일 시간
    const satWithCal = draftFor(unified, new Set<string>([SATURDAY]), SATURDAY);

    console.log("[F] unified + 달력비움 토요일:", JSON.stringify(satNoCal));
    console.log("[F] unified + 달력에 토요일 등록:", JSON.stringify(satWithCal));

    expect(satNoCal).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
    expect(satWithCal).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
  });

  it("G. '평일 공휴일을 휴일로' 토글을 꺼도 토·일은 휴일 시간이다", () => {
    const cycleOff = {
      holidayTimeMode: "split" as const,
      weekdayPublicHolidayAsHoliday: false
    };

    const satResult = shouldUseHolidayTimes(cycleOff, SATURDAY, new Set<string>());
    const friWithCal = shouldUseHolidayTimes(cycleOff, FRIDAY, new Set<string>([FRIDAY]));

    console.log("[G] 토글 off, 토요일, 달력비움 → 휴일시간?", satResult);
    console.log("[G] 토글 off, 금요일, 달력에 등록 → 휴일시간?", friWithCal);

    expect(satResult).toBe(true);
    expect(friWithCal).toBe(false);
  });

  it("H. 그런데 수당 계산 쪽은 토요일을 휴일로 안 본다 (두 축의 정의가 다름)", async () => {
    const result = await runApprovedAllowanceCalculationForApproval(
      createApproval("approval-saturday", SATURDAY)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const seeded = listStoredHolidayCalendars(2026)[0]?.items.map((item) => item.holidayDate) ?? [];

    console.log("[H] 2026 시드 달력:", JSON.stringify(seeded));
    console.log(
      "[H] 토요일 연장근무 수당 분류:",
      result.data.snapshot.businessCategoryCode,
      "/",
      result.data.snapshot.businessCategoryLabel,
      "/ holidayMinutes =",
      result.data.snapshot.breakdown.holidayMinutes,
      "/ 합계 =",
      result.data.snapshot.totalAllowanceAmount
    );

    // 근무표 초안은 토요일을 휴일로 보는데, 수당은 평일로 본다.
    expect(result.data.snapshot.businessCategoryCode).toBe("weekday-overtime");
    expect(result.data.snapshot.breakdown.holidayMinutes).toBe(0);
  });
});
