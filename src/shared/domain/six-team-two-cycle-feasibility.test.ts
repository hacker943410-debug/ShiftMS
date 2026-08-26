// 운영자가 쓰는 실제 근무표(SK AX CloudZ L1 Support, 2026년 10월)를 근무 묶음 2개로
// 그대로 재현할 수 있는지 확인한다. 근무표 이미지에서 6명 31일치를 그대로 옮겨 기대값으로 삼고,
// 근무표 생성기가 같은 표를 만들어 내는지 하루 단위로 대조한다.
//
//   G1 = A(정혜진) · C(이상우) · E(박준하)   /   G2 = B(고성은) · D(김영서) · F(이동희)
//   WT1 = 주간교대(08:00~20:00), WT2 = 야간교대(20:00~08:00), OFF = 순환휴무
import { describe, expect, it } from "vitest";

import { buildMonthlyScheduleDraft } from "./monthly-schedule-draft";
import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternStep
} from "./model";

// 근무표에서 읽은 2026년 10월 1일(목)~31일(토) 실제 근무. D=WT1, N=WT2, X=OFF.
const ACTUAL_OCTOBER: Record<string, string> = {
  A조: "XXXDDDXXXDDDXXXDDDXXXDDDXXXDDDX",
  B조: "DDDXXXDDDXXXDDDXXXDDDXXXDDDXXXD",
  C조: "XXXDDDXXXNNNXXXDDDXXXNNNXXXDDDX",
  D조: "DDDXXXNNNXXXDDDXXXNNNXXXDDDXXXN",
  E조: "XXXNNNXXXDDDXXXNNNXXXDDDXXXNNNX",
  F조: "NNNXXXDDDXXXNNNXXXDDDXXXNNNXXXD"
};

const TIMES: Record<string, { startTime?: string; endTime?: string; breakMinutes: number }> = {
  D: { startTime: "08:00", endTime: "20:00", breakMinutes: 60 },
  N: { startTime: "20:00", endTime: "08:00", breakMinutes: 60 },
  X: { startTime: undefined, endTime: undefined, breakMinutes: 0 }
};

const buildSteps = (patternCode: string): ShiftPatternStep[] =>
  patternCode.split("").map((dutyCode, stepIndex) => ({
    id: `step-${stepIndex}-${dutyCode}`,
    stepIndex,
    dutyCode,
    ...TIMES[dutyCode]!
  }));

const buildCycle = (
  cycleKey: string,
  patternCode: string,
  teams: Array<{ label: string; startIndex: number }>,
  order: number
): ShiftPatternCycle => ({
  id: cycleKey,
  cycleKey,
  name: cycleKey,
  order,
  shiftCount: patternCode.includes("N") ? 2 : 1,
  cycleLength: patternCode.length,
  patternCode,
  patternStartDate: "2026-10-01",
  steps: buildSteps(patternCode),
  teamIndexes: teams.map((team) => ({ teamLabel: team.label, index: team.startIndex }))
});

const buildPattern = (cycles: ShiftPatternCycle[]): ShiftPatternRecord => ({
  id: "pattern-cloudz",
  siteId: "site-1",
  name: "CloudZ L1 6조 2묶음",
  teamCount: 6,
  cycleLength: 12,
  patternCode: cycles[0]!.patternCode,
  startIndexRule: "manual",
  patternStartDate: "2026-10-01",
  status: "active",
  steps: cycles[0]!.steps,
  teamIndexes: cycles.flatMap((cycle) => cycle.teamIndexes),
  cycles,
  teamCycleAssignments: cycles.flatMap((cycle) =>
    cycle.teamIndexes.map((team) => ({ teamLabel: team.teamLabel, cycleKey: cycle.cycleKey }))
  ),
  teamCapacities: [],
  teamSettings: [],
  poolEnabled: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z"
});

const buildEmployees = (teamLabels: string[]): EmployeeRecord[] =>
  teamLabels.map((teamLabel, index) => ({
    id: `emp-${index}`,
    employeeCode: `EMP-${index}`,
    name: `${teamLabel}원`,
    employmentType: "정규직",
    status: "active",
    currentSiteId: "site-1",
    currentShiftGroup: teamLabel,
    currentAssignmentOrder: index,
    createdAt: "2026-10-01T00:00:00.000Z"
  })) as EmployeeRecord[];

// 생성된 근무표를 조별 31자 문자열로 되돌린다. 휴무는 생성 과정에서 "O"가 되므로 "X"로 맞춘다.
const readMonthCodes = (
  items: ReturnType<typeof buildMonthlyScheduleDraft>,
  teamLabel: string
) =>
  items
    .filter((item) => item.teamLabel === teamLabel)
    .slice()
    .sort((left, right) => left.workDate.localeCompare(right.workDate))
    .map((item) => (item.dutyCode === "O" ? "X" : item.dutyCode))
    .join("");

const rotate = (code: string, offset: number) => code.slice(offset) + code.slice(0, offset);

// 근무 묶음 2개 구성. 한 묶음 안에서는 같은 패턴을 조마다 며칠씩 밀어 쓴다.
const DAY_CYCLE = "DDDXXX"; // 주간교대 6일
const NIGHT_CYCLE = "DDDXXXNNNXXX"; // 주야교대 12일

const buildTwoCyclePattern = () =>
  buildPattern([
    buildCycle(
      "cycle-1-주간",
      DAY_CYCLE,
      [
        { label: "B조", startIndex: 0 },
        { label: "A조", startIndex: 3 }
      ],
      1
    ),
    buildCycle(
      "cycle-2-주야",
      NIGHT_CYCLE,
      [
        { label: "D조", startIndex: 0 },
        { label: "E조", startIndex: 3 },
        { label: "F조", startIndex: 6 },
        { label: "C조", startIndex: 9 }
      ],
      2
    )
  ]);

describe("실제 10월 근무표를 근무 묶음 2개로 재현", () => {
  it("주간 두 조는 6일 패턴 하나를 3일 차이로 나눠 쓴 것이다", () => {
    expect(ACTUAL_OCTOBER.A조!.slice(0, 6)).toBe(rotate(DAY_CYCLE, 3));
    expect(ACTUAL_OCTOBER.B조!.slice(0, 6)).toBe(DAY_CYCLE);
  });

  it("주야 네 조는 12일 패턴 하나를 0·3·6·9일 차이로 나눠 쓴 것이다", () => {
    expect(ACTUAL_OCTOBER.D조!.slice(0, 12)).toBe(NIGHT_CYCLE);
    expect(ACTUAL_OCTOBER.E조!.slice(0, 12)).toBe(rotate(NIGHT_CYCLE, 3));
    expect(ACTUAL_OCTOBER.F조!.slice(0, 12)).toBe(rotate(NIGHT_CYCLE, 6));
    expect(ACTUAL_OCTOBER.C조!.slice(0, 12)).toBe(rotate(NIGHT_CYCLE, 9));
  });

  it("근무 묶음 2개로 만든 10월 근무표가 실제 근무표와 31일 전부 같다", () => {
    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-10",
      pattern: buildTwoCyclePattern(),
      employees: buildEmployees(["A조", "B조", "C조", "D조", "E조", "F조"])
    });

    Object.keys(ACTUAL_OCTOBER).forEach((teamLabel) => {
      expect(readMonthCodes(items, teamLabel), teamLabel).toBe(ACTUAL_OCTOBER[teamLabel]);
    });
  });

  it("근무 시간도 주간 08:00~20:00 · 야간 20:00~08:00 으로 붙는다", () => {
    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-10",
      pattern: buildTwoCyclePattern(),
      employees: buildEmployees(["A조", "B조", "C조", "D조", "E조", "F조"])
    });

    const firstDayOfD = items.find(
      (item) => item.teamLabel === "D조" && item.workDate === "2026-10-01"
    );
    const firstDayOfF = items.find(
      (item) => item.teamLabel === "F조" && item.workDate === "2026-10-01"
    );
    const restDayOfA = items.find(
      (item) => item.teamLabel === "A조" && item.workDate === "2026-10-01"
    );

    expect(firstDayOfD).toMatchObject({ startTime: "08:00", endTime: "20:00", breakMinutes: 60 });
    expect(firstDayOfF).toMatchObject({ startTime: "20:00", endTime: "08:00", breakMinutes: 60 });
    expect(restDayOfA).toMatchObject({ startTime: undefined, endTime: undefined, breakMinutes: 0 });
  });

  it("이 구성에서는 야간이 빈 날이 하루도 없다", () => {
    const nightlessDays: number[] = [];

    for (let day = 0; day < 31; day += 1) {
      const nightCount = Object.values(ACTUAL_OCTOBER).filter((code) => code[day] === "N").length;

      if (nightCount === 0) {
        nightlessDays.push(day + 1);
      }
    }

    expect(nightlessDays).toEqual([]);
  });
});
