import { describe, expect, it, vi } from "vitest";

import { buildMonthlyScheduleDraft } from "@shared/domain/monthly-schedule-draft";
import type { EmployeeRecord, ShiftPatternRecord } from "@shared/domain/model";

import { buildSiteCycleInputs, type SiteManagementDraftLike } from "./site-management-actions";
import { buildSitePatternCyclePreviews } from "./site-management-selectors";
import type { SitePatternCyclePreviewLike } from "./site-management-selectors";
import {
  buildSimulationHolidayYears,
  buildSiteSimulationCells,
  buildSiteSimulationMetrics,
  calculateWorkingHours,
  loadSiteSimulationHolidayMap
} from "./site-pattern-simulation";

const createCyclePreview = (
  overrides?: Partial<SitePatternCyclePreviewLike>
): SitePatternCyclePreviewLike => ({
  breakMinutes: 60,
  cycleKey: "cycle-1",
  cycleLabels: ["주간", "야간", "휴무"],
  invalidTokens: [],
  name: "Cycle 1",
  patternStartDate: "2026-04-01",
  patternString: "주야휴",
  shiftCards: [
    { breakMinutes: 60, label: "주간", timeRange: "09:00 - 18:00" },
    { breakMinutes: 60, label: "야간", timeRange: "18:00 - 09:00" }
  ],
  shiftCount: 2,
  shiftLabels: ["주간", "야간"],
  shiftTimes: ["09:00 - 18:00", "18:00 - 09:00"],
  teamIndexes: [0, 1],
  ...overrides
});

const createPatternDraft = (patternString: string, teamIndexes: number[]) => ({
  customerName: "고객사",
  cycles: [
    {
      breakMinutes: "60",
      cycleKey: "cycle-1",
      name: "Cycle 1",
      patternStartDate: "2026-04-01",
      patternString,
      shiftCount: "3",
      shiftTimes: ["06:00 - 14:00", "14:00 - 22:00", "22:00 - 06:00"],
      teamIndexes
    }
  ],
  cycleCount: "1",
  name: "테스트 근무지",
  poolBreakMinutes: "60",
  poolEnabled: false,
  poolTimeRange: "09:00 - 18:00",
  siteCode: "SITE-001",
  status: "active",
  teamCapacities: ["", "", "", ""],
  teamCount: "4",
  teamCycleAssignments: ["cycle-1", "cycle-1", "cycle-1", "cycle-1"]
} satisfies SiteManagementDraftLike);

const createAlignmentPattern = (
  patternString: string,
  teamIndexes: number[]
): ShiftPatternRecord => {
  const draft = createPatternDraft(patternString, teamIndexes);
  const cyclePreviews = buildSitePatternCyclePreviews({
    cycleCount: 1,
    cycleDrafts: draft.cycles,
    fallbackDate: "2026-04-01",
    fallbackTimeRanges: ["06:00 - 14:00", "14:00 - 22:00", "22:00 - 06:00"],
    teamCount: 4
  });
  const cycleInputs = buildSiteCycleInputs({
    cyclePreviews,
    draft,
    teamLabels: ["A조", "B조", "C조", "D조"]
  });
  const primaryCycle = cycleInputs[0]!;

  return {
    createdAt: "2026-04-01T00:00:00.000Z",
    cycleLength: primaryCycle.steps.length,
    cycles: cycleInputs.map((cycle, index) => ({
      cycleKey: cycle.cycleKey,
      cycleLength: cycle.steps.length,
      id: `cycle-${index + 1}`,
      name: cycle.name,
      order: cycle.order,
      patternCode: cycle.patternCode,
      patternStartDate: cycle.patternStartDate,
      patternString: cycle.patternString,
      shiftCount: cycle.shiftCount,
      steps: cycle.steps.map((step, stepIndex) => ({
        ...step,
        id: `${cycle.cycleKey}-step-${stepIndex + 1}`
      })),
      teamIndexes: cycle.teamIndexes
    })),
    id: "pattern-1",
    name: "테스트 패턴",
    patternCode: primaryCycle.patternCode,
    patternStartDate: primaryCycle.patternStartDate,
    poolBreakMinutes: 0,
    poolEnabled: false,
    siteId: "site-1",
    startIndexRule: "manual-seed",
    status: "active",
    steps: primaryCycle.steps.map((step, stepIndex) => ({
      ...step,
      id: `legacy-step-${stepIndex + 1}`
    })),
    teamCapacities: [
      { teamLabel: "A조" },
      { teamLabel: "B조" },
      { teamLabel: "C조" },
      { teamLabel: "D조" }
    ],
    teamCount: 4,
    teamCycleAssignments: [
      { cycleKey: "cycle-1", teamLabel: "A조" },
      { cycleKey: "cycle-1", teamLabel: "B조" },
      { cycleKey: "cycle-1", teamLabel: "C조" },
      { cycleKey: "cycle-1", teamLabel: "D조" }
    ],
    teamIndexes: primaryCycle.teamIndexes
  };
};

const createTeamEmployees = (): EmployeeRecord[] =>
  ["A조", "B조", "C조", "D조"].map((teamLabel, index) => ({
    createdAt: "2026-04-01T00:00:00.000Z",
    currentShiftGroup: teamLabel,
    currentSiteId: "site-1",
    employeeCode: `EMP-00${index + 1}`,
    employmentType: "정규직",
    id: `employee-${index + 1}`,
    name: `${teamLabel} 구성원`,
    status: "active"
  }));

describe("site-pattern-simulation", () => {
  it("should collect unique simulation holiday years in timeline order", () => {
    const years = buildSimulationHolidayYears([
      { date: new Date(2026, 11, 1), key: "2026-11" },
      { date: new Date(2027, 0, 1), key: "2027-0" },
      { date: new Date(2027, 1, 1), key: "2027-1" }
    ]);

    expect(years).toEqual([2026, 2027]);
  });

  it("should merge holiday calendars and ignore failed year lookups", async () => {
    const listHolidayCalendars = vi.fn(async (year?: number) => {
      if (year === 2026) {
        return {
          ok: true,
          data: [
            {
              items: [
                { holidayDate: "2026-04-05", name: "식목일" },
                { holidayDate: "2026-05-05", name: "어린이날" }
              ]
            }
          ]
        };
      }

      return {
        ok: false,
        data: []
      };
    });

    const holidayMap = await loadSiteSimulationHolidayMap({
      listHolidayCalendars,
      simulationMonths: [
        { date: new Date(2026, 3, 1), key: "2026-3" },
        { date: new Date(2027, 0, 1), key: "2027-0" }
      ]
    });

    expect(listHolidayCalendars).toHaveBeenCalledTimes(2);
    expect(listHolidayCalendars).toHaveBeenNthCalledWith(1, 2026);
    expect(listHolidayCalendars).toHaveBeenNthCalledWith(2, 2027);
    expect(Array.from(holidayMap.entries())).toEqual([
      ["2026-04-05", "식목일"],
      ["2026-05-05", "어린이날"]
    ]);
  });

  it("should calculate overnight working hours after break deduction", () => {
    expect(calculateWorkingHours("19:00 - 07:00", 60)).toBe(11);
  });

  it("should build simulation cells from cycle previews and holiday map", () => {
    const cells = buildSiteSimulationCells({
      cyclePreviews: [createCyclePreview()],
      fallbackDate: "2026-04-01",
      getShiftTone: (label) => `tone-${label}`,
      holidayNameByDate: new Map([["2026-04-01", "창립기념일"]]),
      monthDate: new Date(2026, 3, 1),
      teamCycleAssignments: ["cycle-1", "cycle-1"],
      teamLabels: ["A조", "B조"]
    });

    const firstDay = cells.find((cell) => cell.date === "2026-04-01");
    const secondDay = cells.find((cell) => cell.date === "2026-04-02");

    expect(firstDay).toMatchObject({
      dayLabel: "1",
      holidayName: "창립기념일",
      isCurrentMonth: true,
      isHoliday: true
    });
    expect(firstDay?.assignments).toEqual([
      {
        cycleKey: "cycle-1",
        cycleName: "Cycle 1",
        dutyLabel: "주간",
        teamLabel: "A조",
        tone: "tone-주간"
      },
      {
        cycleKey: "cycle-1",
        cycleName: "Cycle 1",
        dutyLabel: "야간",
        teamLabel: "B조",
        tone: "tone-야간"
      }
    ]);
    expect(secondDay?.assignments).toEqual([
      {
        cycleKey: "cycle-1",
        cycleName: "Cycle 1",
        dutyLabel: "야간",
        teamLabel: "A조",
        tone: "tone-야간"
      },
      {
        cycleKey: "cycle-1",
        cycleName: "Cycle 1",
        dutyLabel: "휴무",
        teamLabel: "B조",
        tone: "tone-휴무"
      }
    ]);
  });

  it("should build monthly simulation metrics per cycle", () => {
    const metrics = buildSiteSimulationMetrics(
      [
        {
          assignments: [
            {
              cycleKey: "cycle-1",
              cycleName: "Cycle 1",
              dutyLabel: "주간",
              teamLabel: "A조",
              tone: "day"
            }
          ],
          date: "2026-04-01",
          dayLabel: "1",
          isCurrentMonth: true,
          isHoliday: false,
          isToday: false,
          key: "2026-04-01"
        },
        {
          assignments: [
            {
              cycleKey: "cycle-1",
              cycleName: "Cycle 1",
              dutyLabel: "주간",
              teamLabel: "A조",
              tone: "day"
            }
          ],
          date: "2026-04-02",
          dayLabel: "2",
          isCurrentMonth: true,
          isHoliday: false,
          isToday: false,
          key: "2026-04-02"
        }
      ],
      [
        createCyclePreview({
          cycleLabels: ["주간"],
          shiftCards: [{ breakMinutes: 60, label: "주간", timeRange: "09:00 - 18:00" }],
          shiftCount: 1,
          shiftLabels: ["주간"],
          shiftTimes: ["09:00 - 18:00"],
          teamIndexes: [0]
        })
      ]
    );

    expect(metrics).toEqual([
      {
        cycleKey: "cycle-1",
        cycleName: "Cycle 1",
        items: [
          {
            label: "월간 1인 실근무시간",
            note: "총 18시간 - 휴게 2시간",
            value: "16시간"
          },
          { label: "주간 1인 환산", value: "56시간" },
          { label: "일평균 1인 실근무", value: "8.0시간" },
          { label: "월간 1인 근무일수", value: "2회" },
          { label: "월간 1인 휴무일수", value: "0회" }
        ]
      }
    ]);
  });

  it("should keep a four-team three-shift simulation aligned with the saved schedule draft", () => {
    const cyclePreviews = buildSitePatternCyclePreviews({
      cycleCount: 1,
      cycleDrafts: createPatternDraft("123휴", [0, 1, 2, 3]).cycles,
      fallbackDate: "2026-04-01",
      fallbackTimeRanges: ["06:00 - 14:00", "14:00 - 22:00", "22:00 - 06:00"],
      teamCount: 4
    });
    const simulationCell = buildSiteSimulationCells({
      cyclePreviews,
      fallbackDate: "2026-04-01",
      getShiftTone: (label) => label,
      holidayNameByDate: new Map(),
      monthDate: new Date(2026, 3, 1),
      teamCycleAssignments: ["cycle-1", "cycle-1", "cycle-1", "cycle-1"],
      teamLabels: ["A조", "B조", "C조", "D조"]
    }).find((cell) => cell.date === "2026-04-01");
    const draftItems = buildMonthlyScheduleDraft({
      employees: createTeamEmployees(),
      pattern: createAlignmentPattern("123휴", [0, 1, 2, 3]),
      scheduleMonth: "2026-04"
    }).filter((item) => item.workDate === "2026-04-01");

    expect(simulationCell?.assignments.map((item) => `${item.teamLabel}:${item.dutyLabel}`)).toEqual([
      "A조:1근",
      "B조:2근",
      "C조:3근",
      "D조:휴무"
    ]);
    expect(draftItems.map((item) => `${item.teamLabel}:${item.dutyCode}`)).toEqual([
      "A조:D",
      "B조:E",
      "C조:N",
      "D조:O"
    ]);
  });

  it("should preserve mixed 1근/2근/3근 ordering between simulation and saved schedule draft", () => {
    const cyclePreviews = buildSitePatternCyclePreviews({
      cycleCount: 1,
      cycleDrafts: createPatternDraft("132휴", [0, 1, 2, 3]).cycles,
      fallbackDate: "2026-04-01",
      fallbackTimeRanges: ["06:00 - 14:00", "14:00 - 22:00", "22:00 - 06:00"],
      teamCount: 4
    });
    const simulationCell = buildSiteSimulationCells({
      cyclePreviews,
      fallbackDate: "2026-04-01",
      getShiftTone: (label) => label,
      holidayNameByDate: new Map(),
      monthDate: new Date(2026, 3, 1),
      teamCycleAssignments: ["cycle-1", "cycle-1", "cycle-1", "cycle-1"],
      teamLabels: ["A조", "B조", "C조", "D조"]
    }).find((cell) => cell.date === "2026-04-01");
    const draftItems = buildMonthlyScheduleDraft({
      employees: createTeamEmployees(),
      pattern: createAlignmentPattern("132휴", [0, 1, 2, 3]),
      scheduleMonth: "2026-04"
    }).filter((item) => item.workDate === "2026-04-01");

    expect(simulationCell?.assignments.map((item) => `${item.teamLabel}:${item.dutyLabel}`)).toEqual([
      "A조:1근",
      "B조:3근",
      "C조:2근",
      "D조:휴무"
    ]);
    expect(draftItems.map((item) => `${item.teamLabel}:${item.dutyCode}`)).toEqual([
      "A조:D",
      "B조:N",
      "C조:E",
      "D조:O"
    ]);
  });
});
