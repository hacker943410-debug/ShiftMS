import { describe, expect, it } from "vitest";

import type { EmployeeRecord, ShiftPatternRecord } from "./model";
import { buildMonthlyScheduleDraft } from "./monthly-schedule-draft";
import { resolveShiftPatternForMonth } from "./shift-pattern-version";

// 근무조 패턴 지시서 9장의 필수 시험.
// 패턴 회전이 조별 시작 위치·날짜 경계·설정 버전에 걸쳐 어긋나지 않는지 실제 근무표 생성기로 확인한다.

const DAY_STEP = { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 };
const NIGHT_STEP = { stepIndex: 0, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 60 };
const OFF_STEP = { stepIndex: 0, dutyCode: "X", breakMinutes: 0 };

// "주주주휴휴휴" 같은 표기를 근무표 단계 배열로 바꾼다.
const buildSteps = (patternString: string): ShiftPatternRecord["steps"] =>
  Array.from(patternString).map((token, stepIndex) => {
    const base = token === "주" ? DAY_STEP : token === "야" ? NIGHT_STEP : OFF_STEP;

    return { ...base, id: `step-${stepIndex}`, stepIndex };
  });

const createPattern = ({
  effectiveFrom,
  id = "pattern-1",
  patternStartDate,
  patternString,
  teamStartIndexes
}: {
  effectiveFrom?: string;
  id?: string;
  patternStartDate: string;
  patternString: string;
  teamStartIndexes: Array<[string, number]>;
}): ShiftPatternRecord => {
  const steps = buildSteps(patternString);
  const teamIndexes = teamStartIndexes.map(([teamLabel, index]) => ({ teamLabel, index }));

  return {
    id,
    siteId: "site-1",
    name: `패턴 ${id}`,
    teamCount: teamIndexes.length,
    cycleLength: steps.length,
    patternCode: steps.map((step) => step.dutyCode).join(""),
    startIndexRule: "manual-seed",
    patternStartDate,
    effectiveFrom: effectiveFrom ?? patternStartDate,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    steps,
    teamIndexes,
    cycles: [
      {
        id: `${id}-cycle-1`,
        cycleKey: "cycle-1",
        name: "Cycle 1",
        order: 0,
        shiftCount: patternString.includes("야") ? 2 : 1,
        cycleLength: steps.length,
        patternCode: steps.map((step) => step.dutyCode).join(""),
        patternStartDate,
        steps,
        teamIndexes
      }
    ],
    teamCycleAssignments: teamIndexes.map((item) => ({
      teamLabel: item.teamLabel,
      cycleKey: "cycle-1"
    })),
    teamCapacities: teamIndexes.map((item) => ({ teamLabel: item.teamLabel })),
    teamSettings: [],
    poolEnabled: false,
    poolBreakMinutes: 0
  };
};

const createEmployees = (teamLabels: string[]): EmployeeRecord[] =>
  teamLabels.map((teamLabel, index) => ({
    id: `emp-${index}`,
    employeeCode: `E-${String(index + 1).padStart(3, "0")}`,
    name: `${teamLabel} 담당`,
    employmentType: "정규",
    status: "active" as const,
    currentSiteId: "site-1",
    currentSiteName: "테스트 센터",
    currentShiftGroup: teamLabel,
    createdAt: "2026-01-01T00:00:00.000Z"
  }));

// 조별로 날짜 순서대로 근무 기호를 뽑는다(주/야/휴).
const readDutyStringsByTeam = ({
  employees,
  pattern,
  scheduleMonth
}: {
  employees: EmployeeRecord[];
  pattern: ShiftPatternRecord;
  scheduleMonth: string;
}) => {
  const items = buildMonthlyScheduleDraft({ scheduleMonth, pattern, employees });
  const byTeam = new Map<string, Array<{ workDate: string; symbol: string }>>();

  items.forEach((item) => {
    const symbol = item.dutyCode === "D" ? "주" : item.dutyCode === "N" ? "야" : "휴";
    const teamLabel = item.teamLabel ?? "";
    const current = byTeam.get(teamLabel) ?? [];

    current.push({ workDate: item.workDate, symbol });
    byTeam.set(teamLabel, current);
  });

  return new Map(
    Array.from(byTeam.entries()).map(([teamLabel, entries]) => [
      teamLabel,
      entries
        .slice()
        .sort((left, right) => left.workDate.localeCompare(right.workDate))
        .map((entry) => entry.symbol)
        .join("")
    ])
  );
};

describe("shift pattern rotation rules", () => {
  it("should run 주주주휴휴휴 with A조 offset 0 and B조 offset 3", () => {
    const pattern = createPattern({
      patternStartDate: "2026-04-01",
      patternString: "주주주휴휴휴",
      teamStartIndexes: [
        ["A조", 0],
        ["B조", 3]
      ]
    });

    const dutyByTeam = readDutyStringsByTeam({
      employees: createEmployees(["A조", "B조"]),
      pattern,
      scheduleMonth: "2026-04"
    });

    expect(dutyByTeam.get("A조")?.slice(0, 12)).toBe("주주주휴휴휴주주주휴휴휴");
    expect(dutyByTeam.get("B조")?.slice(0, 12)).toBe("휴휴휴주주주휴휴휴주주주");
  });

  it("should keep one day team, one night team and two off teams every date", () => {
    const pattern = createPattern({
      patternStartDate: "2026-04-01",
      patternString: "주주주휴휴휴야야야휴휴휴",
      teamStartIndexes: [
        ["C조", 0],
        ["D조", 3],
        ["E조", 6],
        ["F조", 9]
      ]
    });
    const employees = createEmployees(["C조", "D조", "E조", "F조"]);
    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    const countsByDate = new Map<string, { day: number; night: number; off: number }>();

    items.forEach((item) => {
      const current = countsByDate.get(item.workDate) ?? { day: 0, night: 0, off: 0 };

      if (item.dutyCode === "D") {
        current.day += 1;
      } else if (item.dutyCode === "N") {
        current.night += 1;
      } else {
        current.off += 1;
      }

      countsByDate.set(item.workDate, current);
    });

    expect(countsByDate.size).toBe(30);

    for (const [workDate, counts] of countsByDate) {
      expect({ workDate, ...counts }).toEqual({ workDate, day: 1, night: 1, off: 2 });
    }
  });

  it("should carry the rotation across a month end, a year end and a leap day", () => {
    const pattern = createPattern({
      patternStartDate: "2026-04-01",
      patternString: "주주주휴휴휴",
      teamStartIndexes: [["A조", 0]]
    });
    const employees = createEmployees(["A조"]);

    // 2026-04-30 은 시작일에서 29일 뒤 → 29 % 6 = 5 → 휴, 이어지는 5월 1일은 30 % 6 = 0 → 주.
    const april = readDutyStringsByTeam({ employees, pattern, scheduleMonth: "2026-04" });
    const may = readDutyStringsByTeam({ employees, pattern, scheduleMonth: "2026-05" });

    expect(april.get("A조")?.slice(-1)).toBe("휴");
    expect(may.get("A조")?.slice(0, 1)).toBe("주");

    // 연말 → 다음 해로 넘어가도 한 칸씩만 움직인다.
    const december = readDutyStringsByTeam({ employees, pattern, scheduleMonth: "2026-12" });
    const january = readDutyStringsByTeam({ employees, pattern, scheduleMonth: "2027-01" });
    const continuous = `${december.get("A조") ?? ""}${january.get("A조") ?? ""}`;

    expect(continuous).toContain("주주주휴휴휴주주주휴휴휴");

    // 윤년 2월은 29일이 나오고, 3월 1일로 이어진다.
    const leapPattern = createPattern({
      patternStartDate: "2028-01-01",
      patternString: "주주주휴휴휴",
      teamStartIndexes: [["A조", 0]]
    });
    const february = readDutyStringsByTeam({
      employees,
      pattern: leapPattern,
      scheduleMonth: "2028-02"
    });

    expect(february.get("A조")).toHaveLength(29);
  });

  it("should apply the pattern from the start date and stay aligned before it (negative modulo)", () => {
    const pattern = createPattern({
      patternStartDate: "2026-04-01",
      patternString: "주주주휴휴휴",
      teamStartIndexes: [["A조", 0]]
    });
    const employees = createEmployees(["A조"]);

    // 시작일 당일은 패턴의 첫 칸.
    const april = readDutyStringsByTeam({ employees, pattern, scheduleMonth: "2026-04" });

    expect(april.get("A조")?.slice(0, 1)).toBe("주");

    // 시작일 이전도 음수 나머지 없이 이어진다. 3월 31일은 -1 → 5번째 칸(휴).
    const march = readDutyStringsByTeam({ employees, pattern, scheduleMonth: "2026-03" });

    expect(march.get("A조")).toHaveLength(31);
    expect(march.get("A조")?.slice(-1)).toBe("휴");
    expect(march.get("A조")?.includes("주주주휴휴휴")).toBe(true);
  });

  it("should stay aligned over a long range", () => {
    const pattern = createPattern({
      patternStartDate: "2026-04-01",
      patternString: "주주주휴휴휴야야야휴휴휴",
      teamStartIndexes: [["A조", 0]]
    });
    const employees = createEmployees(["A조"]);

    // 시작일에서 정확히 365일 뒤. 365 % 12 = 5 → 여섯 번째 칸(휴).
    const later = readDutyStringsByTeam({ employees, pattern, scheduleMonth: "2027-04" });

    expect(later.get("A조")?.slice(0, 1)).toBe("휴");
  });

  it("should keep past months on the old version after a new version starts", () => {
    const first = createPattern({
      id: "v1",
      effectiveFrom: "2026-01-01",
      patternStartDate: "2026-01-01",
      patternString: "주주주휴휴휴",
      teamStartIndexes: [["A조", 0]]
    });
    const second = createPattern({
      id: "v2",
      effectiveFrom: "2026-08-01",
      patternStartDate: "2026-08-01",
      patternString: "주주주휴휴휴야야야휴휴휴",
      teamStartIndexes: [["A조", 0]]
    });
    const patterns = [first, second];
    const employees = createEmployees(["A조"]);

    const julyPattern = resolveShiftPatternForMonth(patterns, "2026-07");
    const augustPattern = resolveShiftPatternForMonth(patterns, "2026-08");

    expect(julyPattern?.id).toBe("v1");
    expect(augustPattern?.id).toBe("v2");

    // 지난 달은 예전 규칙 그대로 6일 주기(야간 없음), 새 달부터 12일 주기가 된다.
    const july = readDutyStringsByTeam({
      employees,
      pattern: julyPattern!,
      scheduleMonth: "2026-07"
    });
    const august = readDutyStringsByTeam({
      employees,
      pattern: augustPattern!,
      scheduleMonth: "2026-08"
    });
    const julyDuties = july.get("A조") ?? "";

    expect(julyDuties).toHaveLength(31);
    expect(julyDuties).not.toContain("야");
    // 6일마다 같은 근무가 돌아온다.
    expect(
      Array.from(julyDuties).every(
        (symbol, index) => index < 6 || symbol === julyDuties[index - 6]
      )
    ).toBe(true);

    // 8월 1일이 새 규칙의 시작일이라 패턴 첫 칸부터 시작한다.
    expect(august.get("A조")?.slice(0, 12)).toBe("주주주휴휴휴야야야휴휴휴");
  });
});
