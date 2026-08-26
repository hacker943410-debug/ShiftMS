import { describe, expect, it } from "vitest";

import {
  buildMonthlyScheduleDraft,
  shouldUseHolidayTimes
} from "./monthly-schedule-draft";
import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternStep
} from "./model";

// 적대 검증용 임시 테스트. 조사자가 2026-09-25(금)만 써서 건드리지 않은 분기를 친다.
// 소스 수정 없음. 읽기 전용 진단.

const SATURDAY = "2026-09-26"; // 토요일. 시드 달력에 없음
const SUNDAY = "2026-09-27"; // 일요일. 시드 달력에 없음
const FRIDAY_HOLIDAY = "2026-09-25"; // 조사자가 쓴 평일 공휴일 가정 날짜

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

const createPattern = (
  holidayTimeMode: "unified" | "split",
  stepOverrides?: Partial<ShiftPatternStep>,
  cycleOverrides?: Partial<ShiftPatternCycle>
): ShiftPatternRecord => {
  const step = createStep(stepOverrides);
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
    teamIndexes: [{ teamLabel: "A조", index: 0 }],
    ...cycleOverrides
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
  workDate: string,
  publicHolidayDates: Set<string>
) =>
  buildMonthlyScheduleDraft({
    scheduleMonth: "2026-09",
    pattern,
    employees,
    publicHolidayDates
  }).find((item) => item.workDate === workDate);

describe("적대 검증: 조사자가 안 친 분기", () => {
  it("E1. 토·일은 공휴일 달력이 완전히 비어 있어도 휴일 근무시간이 나온다", () => {
    const empty = new Set<string>();
    const sat = draftFor(createPattern("split"), SATURDAY, empty);
    const sun = draftFor(createPattern("split"), SUNDAY, empty);

    console.log("[E1] split + 달력 완전 비움 + 토요일:", JSON.stringify(sat));
    console.log("[E1] split + 달력 완전 비움 + 일요일:", JSON.stringify(sun));
    console.log(
      "[E1] shouldUseHolidayTimes(split, 토, 빈달력) =",
      shouldUseHolidayTimes(
        { holidayTimeMode: "split", weekdayPublicHolidayAsHoliday: true },
        SATURDAY,
        empty
      )
    );

    // 조사자 주장("split이어도 달력에 없으면 평일 근무시간")은 토·일에 대해 거짓이다.
    expect(sat).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
    expect(sun).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
  });

  it("E2. split이고 달력에도 있는데 휴일 시간칸이 비면 조용히 평일 시간으로 폴백한다", () => {
    const withHoliday = new Set<string>([FRIDAY_HOLIDAY]);
    const noHolidayTimes = createPattern("split", {
      holidayStartTime: undefined,
      holidayEndTime: undefined,
      holidayBreakMinutes: undefined
    });

    const fri = draftFor(noHolidayTimes, FRIDAY_HOLIDAY, withHoliday);
    const sat = draftFor(noHolidayTimes, SATURDAY, new Set<string>());

    console.log("[E2] split + 달력등록 + 휴일시간칸 빔 (금):", JSON.stringify(fri));
    console.log("[E2] split + 휴일시간칸 빔 (토):", JSON.stringify(sat));

    // 달력도 맞고 split도 켰는데 평일 시간(09:00~18:00/60분)이 나온다 → 제3의 원인.
    expect(fri).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
    expect(sat).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
  });

  it("E3. split이고 달력에도 있는데 '평일 공휴일도 휴일로' 토글이 꺼져 있으면 평일 시간", () => {
    const withHoliday = new Set<string>([FRIDAY_HOLIDAY]);
    const toggledOff = createPattern("split", undefined, {
      weekdayPublicHolidayAsHoliday: false
    });

    const fri = draftFor(toggledOff, FRIDAY_HOLIDAY, withHoliday);
    const sat = draftFor(toggledOff, SATURDAY, withHoliday);

    console.log("[E3] split + 달력등록 + 토글 false (금, 평일공휴일):", JSON.stringify(fri));
    console.log("[E3] split + 토글 false (토):", JSON.stringify(sat));

    expect(fri).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
    // 토요일은 토글과 무관하게 휴일 시간
    expect(sat).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
  });

  it("E4. unified면 토·일에도 평일 시간 (unified가 최우선 관문인 건 사실)", () => {
    const withHoliday = new Set<string>([FRIDAY_HOLIDAY, SATURDAY, SUNDAY]);
    const sat = draftFor(createPattern("unified"), SATURDAY, withHoliday);

    console.log("[E4] unified + 달력에 토요일까지 등록:", JSON.stringify(sat));

    expect(sat).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
  });
});
