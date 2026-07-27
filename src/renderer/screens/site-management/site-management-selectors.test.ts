import { describe, expect, it } from "vitest";

import type { EmployeeRecord, ShiftPatternRecord, SiteNameOptionRecord, SiteRecord } from "@shared/domain/model";

import {
  buildActiveTeamLabels,
  buildAssignedEmployeesByTeam,
  buildFilteredPoolEmployees,
  buildPatternPresetSiteOptions,
  buildPatternPresetRows,
  buildRows,
  buildSitePatternCyclePreviews,
  buildSitePatternCycleAssignments,
  buildSitePatternSimulationModels,
  buildSitePatternSimulationTimeline,
  buildSitePatternStepSetupModels,
  buildSiteAssignmentTeamColumns,
  buildSiteDetailModels,
  buildSiteListSummary,
  buildSiteNameSelectValues,
  buildCycleDraftShiftValues
} from "./site-management-selectors";

const sites = [
  {
    createdAt: "2026-04-01T09:00:00.000Z",
    customerName: "고객사A",
    id: "site-1",
    name: "본관",
    siteCode: "SITE-001",
    status: "active",
    timezone: "Asia/Seoul"
  },
  {
    createdAt: "2026-04-01T09:00:00.000Z",
    customerName: "고객사B",
    id: "site-2",
    name: "별관",
    siteCode: "SITE-002",
    status: "inactive",
    timezone: "Asia/Seoul"
  }
] as SiteRecord[];

const activePattern = {
  createdAt: "2026-04-01T09:00:00.000Z",
  id: "pattern-active",
  name: "기본 패턴",
  siteId: "site-1",
  status: "active",
  teamCount: 2,
  cycleLength: 4,
  poolEnabled: true,
  poolStartTime: "09:00",
  poolEndTime: "18:00",
  poolBreakMinutes: 60,
  patternCode: "DNXX",
  patternStartDate: "2026-04-01",
  startIndexRule: "manual",
  steps: [],
  teamIndexes: [
    { teamLabel: "A조", index: 1 },
    { teamLabel: "B조", index: 0 }
  ],
  teamCapacities: [
    { teamLabel: "A조", maxHeadcount: 2 },
    { teamLabel: "B조", maxHeadcount: 3 }
  ],
  teamCycleAssignments: [
    { teamLabel: "A조", cycleKey: "cycle-1" },
    { teamLabel: "B조", cycleKey: "cycle-2" }
  ],
  teamSettings: [],
  cycles: [
    {
      id: "cycle-1-id",
      cycleKey: "cycle-1",
      name: "Cycle 1",
      order: 0,
      shiftCount: 2,
      cycleLength: 4,
      patternCode: "DNXX",
      patternStartDate: "2026-04-01",
      teamIndexes: [{ teamLabel: "A조", index: 1 }],
      steps: [
        { id: "cycle-1-step-1", stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
        { id: "cycle-1-step-2", stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 60 },
        { id: "cycle-1-step-3", stepIndex: 2, dutyCode: "X", startTime: "", endTime: "", breakMinutes: 0 },
        { id: "cycle-1-step-4", stepIndex: 3, dutyCode: "OFF", startTime: "", endTime: "", breakMinutes: 0 }
      ]
    },
    {
      id: "cycle-2-id",
      cycleKey: "cycle-2",
      name: "Cycle 2",
      order: 1,
      shiftCount: 2,
      cycleLength: 4,
      patternCode: "NDXX",
      patternStartDate: "2026-04-05",
      teamIndexes: [{ teamLabel: "B조", index: 0 }],
      steps: [
        { id: "cycle-2-step-1", stepIndex: 0, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 60 },
        { id: "cycle-2-step-2", stepIndex: 1, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
        { id: "cycle-2-step-3", stepIndex: 2, dutyCode: "X", startTime: "", endTime: "", breakMinutes: 0 },
        { id: "cycle-2-step-4", stepIndex: 3, dutyCode: "OFF", startTime: "", endTime: "", breakMinutes: 0 }
      ]
    }
  ]
} as ShiftPatternRecord;

const inactivePattern = {
  ...activePattern,
  id: "pattern-inactive",
  poolEnabled: false,
  status: "inactive"
} as ShiftPatternRecord;

const employees = [
  {
    createdAt: "2026-04-01T09:00:00.000Z",
    currentShiftGroup: "A조",
    currentSiteId: "site-1",
    employeeCode: "E-001",
    employmentType: "정규직",
    id: "emp-1",
    name: "김하나",
    status: "active"
  },
  {
    createdAt: "2026-04-01T09:00:00.000Z",
    currentShiftGroup: "B조",
    currentSiteId: "site-1",
    employeeCode: "E-002",
    employmentType: "정규직",
    id: "emp-2",
    name: "이둘",
    status: "active"
  },
  {
    createdAt: "2026-04-01T09:00:00.000Z",
    currentShiftGroup: "A조",
    currentSiteId: "site-2",
    employeeCode: "E-003",
    employmentType: "정규직",
    id: "emp-3",
    name: "박셋",
    status: "active"
  }
] as EmployeeRecord[];

describe("site-management-selectors", () => {
  it("should keep a custom site name at the top of the select options", () => {
    const options = [
      { createdAt: "2026-04-01T09:00:00.000Z", id: "option-1", name: "고객사A", usageCount: 1 },
      { createdAt: "2026-04-01T09:00:00.000Z", id: "option-2", name: "고객사B", usageCount: 1 }
    ] as SiteNameOptionRecord[];

    expect(buildSiteNameSelectValues(options, "고객사A")).toEqual(["고객사A", "고객사B"]);
    expect(buildSiteNameSelectValues(options, " 신규 고객사 ")).toEqual([
      "신규 고객사",
      "고객사A",
      "고객사B"
    ]);
  });

  it("should build site rows, list summary, and preset rows from the active pattern", () => {
    const rows = buildRows(sites, [inactivePattern, activePattern], employees);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.pattern?.id).toBe("pattern-active");
    expect(rows[0]?.workType).toBe("2조 / 2개 Cycle / Pool");
    expect(rows[0]?.cycleSummaries).toHaveLength(2);
    expect(rows[0]?.teamStatusItems).toEqual([
      { label: "A조", headcount: 1 },
      { label: "B조", headcount: 1 }
    ]);

    expect(buildSiteListSummary(rows)).toEqual({
      activeSites: 1,
      assignedEmployees: 3,
      poolSites: 1,
      totalSites: 2
    });

    expect(buildPatternPresetRows(rows, "site-1")).toEqual([]);
    expect(buildPatternPresetRows(rows)).toHaveLength(1);
  });

  it("should build detail models from a saved site row", () => {
    const [detailRow] = buildRows([sites[0] as SiteRecord], [activePattern], employees);
    const detailModels = buildSiteDetailModels(detailRow);

    expect(detailModels.detailTotalAssignedHeadcount).toBe(2);
    expect(detailModels.detailTeamIndexes).toEqual([
      { teamLabel: "A조", index: 1 },
      { teamLabel: "B조", index: 0 }
    ]);
    expect(detailModels.detailCycleCards).toHaveLength(2);
    expect(detailModels.detailCycleCards[0]?.teams).toEqual([
      { teamLabel: "A조", teamIndex: 1, headcount: 1, maxHeadcount: 2 }
    ]);
    expect(detailModels.detailCycleCards[1]?.teams).toEqual([
      { teamLabel: "B조", teamIndex: 0, headcount: 1, maxHeadcount: 3 }
    ]);
  });

  it("should prefer stored cycle pattern strings over reconstructed display strings", () => {
    const storedPattern = {
      ...activePattern,
      cycles: activePattern.cycles.map((cycle, index) => ({
        ...cycle,
        patternString: index === 0 ? "야휴휴휴" : "1주휴휴"
      }))
    } as ShiftPatternRecord;

    const [detailRow] = buildRows([sites[0] as SiteRecord], [storedPattern], employees);
    const detailModels = buildSiteDetailModels(detailRow);

    expect(detailRow.cycleSummaries.map((cycle) => cycle.patternString)).toEqual([
      "야휴휴휴",
      "1주휴휴"
    ]);
    expect(detailModels.detailCycleCards.map((cycle) => cycle.patternString)).toEqual([
      "야휴휴휴",
      "1주휴휴"
    ]);
  });

  it("should display three-shift definitions in canonical shift order for mixed duty codes", () => {
    const mixedPattern = {
      ...activePattern,
      teamCount: 1,
      teamIndexes: [{ teamLabel: "A조", index: 0 }],
      teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
      cycles: [
        {
          id: "mixed-cycle-1",
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 3,
          cycleLength: 4,
          patternCode: "ACBX",
          patternStartDate: "2026-04-01",
          teamIndexes: [{ teamLabel: "A조", index: 0 }],
          steps: [
            { id: "mixed-step-1", stepIndex: 0, dutyCode: "A", startTime: "06:00", endTime: "14:00", breakMinutes: 30 },
            { id: "mixed-step-2", stepIndex: 1, dutyCode: "C", startTime: "22:00", endTime: "06:00", breakMinutes: 60 },
            { id: "mixed-step-3", stepIndex: 2, dutyCode: "B", startTime: "14:00", endTime: "22:00", breakMinutes: 30 },
            { id: "mixed-step-4", stepIndex: 3, dutyCode: "X", startTime: "", endTime: "", breakMinutes: 0 }
          ]
        }
      ]
    } as ShiftPatternRecord;

    const [detailRow] = buildRows([sites[0] as SiteRecord], [mixedPattern], employees);

    expect(detailRow?.shiftDefinitions.map((item) => [item.dutyCode, item.label])).toEqual([
      ["A", "1근"],
      ["B", "2근"],
      ["C", "3근"]
    ]);
  });

  it("should build edit draft shift values in canonical slot order for mixed duty codes", () => {
    const cycle = {
      name: "Cycle 1",
      shiftCount: 3,
      steps: [
        { id: "mixed-step-1", stepIndex: 0, dutyCode: "A", startTime: "09:00", endTime: "15:00", breakMinutes: 30 },
        { id: "mixed-step-2", stepIndex: 1, dutyCode: "C", startTime: "21:00", endTime: "09:00", breakMinutes: 90 },
        { id: "mixed-step-3", stepIndex: 2, dutyCode: "B", startTime: "15:00", endTime: "21:00", breakMinutes: 30 },
        { id: "mixed-step-4", stepIndex: 3, dutyCode: "X", startTime: "", endTime: "", breakMinutes: 0 }
      ]
    };

    expect(buildCycleDraftShiftValues(cycle)).toEqual({
      shiftBreakMinutes: ["30", "30", "90"],
      shiftTimes: ["09:00 - 15:00", "15:00 - 21:00", "21:00 - 09:00"],
      // 휴일 칸은 저장된 값이 없으므로 빈 칸(= 평일과 동일)
      holidayShiftBreakMinutes: ["", "", ""],
      holidayShiftTimes: ["", "", ""]
    });
  });

  it("should build assignment board models with pending overrides and pool filtering", () => {
    const assignmentEmployees = [
      {
        createdAt: "2026-04-01T09:00:00.000Z",
        currentShiftGroup: "A조",
        currentSiteId: "site-1",
        employeeCode: "E-001",
        employmentType: "정규직",
        id: "emp-1",
        name: "김하나",
        status: "active"
      },
      {
        createdAt: "2026-04-01T09:00:00.000Z",
        currentShiftGroup: "특근조",
        currentSiteId: "site-1",
        employeeCode: "E-002",
        employmentType: "정규직",
        id: "emp-2",
        name: "이둘",
        status: "active"
      },
      {
        createdAt: "2026-04-01T09:00:00.000Z",
        currentShiftGroup: "B조",
        currentSiteId: "site-9",
        employeeCode: "E-003",
        employmentType: "정규직",
        id: "emp-3",
        name: "오셋",
        status: "active"
      },
      {
        createdAt: "2026-04-01T09:00:00.000Z",
        employeeCode: "E-004",
        employmentType: "정규직",
        id: "emp-4",
        name: "무소속",
        status: "active"
      }
    ] as EmployeeRecord[];
    const pendingAssignments = [
      { employeeId: "emp-3", startDate: "2026-04-10", teamLabel: "Pool" }
    ];
    const pendingAssignmentMap = new Map(
      pendingAssignments.map((assignment) => [assignment.employeeId, assignment])
    );
    const teamLabels = ["A조", "B조"];
    const activeLabels = buildActiveTeamLabels({
      employees: assignmentEmployees,
      pendingAssignments,
      poolEnabled: true,
      siteId: "site-1",
      teamLabels
    });

    expect(activeLabels).toEqual(["A조", "B조", "Pool", "특근조"]);

    const assignedByTeam = buildAssignedEmployeesByTeam({
      activeTeamLabels: activeLabels,
      employees: assignmentEmployees,
      pendingAssignmentMap,
      siteId: "site-1"
    });

    expect(assignedByTeam.get("A조")?.map((employee) => employee.id)).toEqual(["emp-1"]);
    expect(assignedByTeam.get("특근조")?.map((employee) => employee.id)).toEqual(["emp-2"]);
    expect(assignedByTeam.get("Pool")?.map((employee) => employee.id)).toEqual(["emp-3"]);

    expect(
      buildFilteredPoolEmployees({
        employees: assignmentEmployees,
        keyword: "",
        pendingAssignmentMap,
        poolScope: "all",
        siteId: "site-1"
      }).map((employee) => employee.id)
    ).toEqual(["emp-4"]);

    expect(
      buildFilteredPoolEmployees({
        employees: assignmentEmployees,
        keyword: "오",
        pendingAssignmentMap: new Map(),
        poolScope: "other-site",
        siteId: "site-1"
      }).map((employee) => employee.id)
    ).toEqual(["emp-3"]);

    const teamColumns = buildSiteAssignmentTeamColumns({
      activeTeamLabels: activeLabels,
      assignedByTeam,
      configuredTeamCapacities: new Map([
        ["A조", 1],
        ["B조", 2]
      ]),
      draggingEmployeeId: null,
      teamCapacities: ["1", "2"],
      teamLabels
    });

    expect(teamColumns[0]).toMatchObject({
      label: "A조",
      capacityValue: "1",
      isAtCapacity: true,
      isConfiguredTeam: true
    });
    expect(teamColumns[2]).toMatchObject({
      label: "Pool",
      displayLabel: "Pool 근무",
      isConfiguredTeam: false,
      isPoolGroup: true
    });
  });

  it("should build step1 cycle assignments and setup editor models", () => {
    const cyclePreviews = [
      {
        breakMinutes: 60,
        cycleKey: "cycle-1",
        cycleLabels: ["주", "야", "휴"],
        invalidTokens: [],
        name: "Cycle 1",
        patternStartDate: "2026-04-01",
        patternString: "주야휴",
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        shiftCards: [
          { breakMinutes: 60, label: "주간", timeRange: "07:00 - 19:00" },
          { breakMinutes: 60, label: "야간", timeRange: "19:00 - 07:00" }
        ],
        shiftCount: 2,
        shiftLabels: ["주간", "야간"],
        teamIndexes: [0, 1]
      },
      {
        breakMinutes: 45,
        cycleKey: "cycle-2",
        cycleLabels: ["1", "2", "휴"],
        invalidTokens: [],
        name: "Cycle 2",
        patternStartDate: "2026-04-05",
        patternString: "12휴",
        shiftTimes: ["06:00 - 14:00", "14:00 - 22:00"],
        shiftCards: [{ breakMinutes: 45, label: "1근", timeRange: "06:00 - 14:00" }],
        shiftCount: 2,
        shiftLabels: ["1근", "2근"],
        teamIndexes: [0, 1]
      }
    ];
    const cycleDrafts = [
      {
        breakMinutes: "60",
        cycleKey: "cycle-1",
        name: "Cycle 1",
        patternStartDate: "2026-04-01",
        patternString: "주야휴",
        shiftCount: "2",
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        teamIndexes: [1, 0]
      }
    ];

    const cycleAssignments = buildSitePatternCycleAssignments({
      createFallbackDraft: (cycleKey) => ({
        breakMinutes: "30",
        cycleKey,
        name: "Fallback",
        patternStartDate: "2026-04-05",
        patternString: "",
        shiftCount: "2",
        shiftTimes: [""],
        teamIndexes: [0, 1]
      }),
      cycleDrafts,
      cyclePreviews,
      teamCycleAssignments: ["cycle-1", "cycle-2"],
      teamLabels: ["A조", "B조"]
    });

    expect(cycleAssignments.map((item) => item.teams.map((team) => team.teamLabel))).toEqual([
      ["A조"],
      ["B조"]
    ]);
    expect(cycleAssignments[1]?.draftCycle.name).toBe("Fallback");

    const setupModels = buildSitePatternStepSetupModels({
      cycleAssignments,
      fallbackTimeRanges: ["07:00 - 19:00", "19:00 - 07:00", "09:00 - 17:00"],
      poolDailyHours: 8.5
    });

    expect(setupModels.assignedTeamCount).toBe(2);
    expect(setupModels.activeCycleCount).toBe(2);
    expect(setupModels.poolDailyHoursText).toBe("8.5");
    expect(setupModels.setupCycleAssignments).toEqual([
      { cycleKey: "cycle-1", name: "Cycle 1", patternString: "주야휴", teams: ["A조"] },
      { cycleKey: "cycle-2", name: "Cycle 2", patternString: "12휴", teams: ["B조"] }
    ]);
    expect(setupModels.advancedEditorCycles[1]).toMatchObject({
      assignedTeamLabels: ["B조"],
      fallbackShiftTimes: ["06:00 - 14:00", "19:00 - 07:00"]
    });
  });

  it("should build step1 simulation models and preset options", () => {
    const cycleAssignments = [
      {
        cycle: {
          breakMinutes: 60,
          cycleKey: "cycle-1",
          cycleLabels: ["주", "야", "휴"],
          invalidTokens: ["?", "?"],
          name: "Cycle 1",
          patternStartDate: "2026-04-01",
          patternString: "주야휴",
          shiftTimes: ["07:00 - 19:00"],
          shiftCards: [{ breakMinutes: 60, label: "주간", timeRange: "07:00 - 19:00" }],
          shiftCount: 1,
          shiftLabels: ["주간"],
          teamIndexes: [0]
        },
        draftCycle: {
          breakMinutes: "60",
          cycleKey: "cycle-1",
          name: "Cycle 1",
          patternStartDate: "2026-04-01",
          patternString: "주야휴",
          shiftCount: "1",
          shiftTimes: ["07:00 - 19:00"],
          teamIndexes: [0]
        },
        teams: [{ teamIndex: 0, teamLabel: "A조" }]
      }
    ];

    const simulationModels = buildSitePatternSimulationModels({
      cycleAssignments,
      formatMonthLabel: (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`,
      getHolidayNameSizeClass: (name) => (name ? "holiday-compact" : ""),
      getShiftTone: (label) => `tone-${label}`,
      simulationCells: [
        {
          assignments: [{ dutyLabel: "주간", teamLabel: "A조", tone: "day" }],
          date: "2026-04-01",
          dayLabel: "1",
          holidayName: "국경일",
          isCurrentMonth: true,
          isHoliday: true,
          isToday: false,
          key: "2026-04-01"
        }
      ],
      simulationMonthDate: new Date("2026-04-01T00:00:00.000Z")
    });

    expect(simulationModels.simulationMonthLabel).toBe("2026년 4월");
    expect(simulationModels.invalidCycleMessages).toEqual(["Cycle 1: ?"]);
    expect(simulationModels.simulationAssignmentSummaries).toEqual([
      {
        cycleKey: "cycle-1",
        cycleName: "Cycle 1",
        patternString: "주야휴",
        teams: ["A조"]
      }
    ]);
    expect(simulationModels.cycleShiftCards).toEqual([
      {
        breakMinutes: 60,
        cycleName: "Cycle 1",
        key: "cycle-1-주간",
        label: "주간",
        timeRange: "07:00 - 19:00",
        toneClassName: "tone-주간"
      }
    ]);
    expect(simulationModels.simulationPanelCells).toEqual([
      {
        assignments: [
          {
            dutyLabel: "주간",
            key: "2026-04-01-A조",
            teamLabel: "A조",
            toneClassName: "day"
          }
        ],
        date: "2026-04-01",
        dayLabel: "1",
        holidayClassName: "holiday-compact",
        holidayName: "국경일",
        isCurrentMonth: true,
        isHoliday: true,
        isToday: false,
        key: "2026-04-01"
      }
    ]);

    expect(buildPatternPresetSiteOptions(buildPatternPresetRows(buildRows(sites, [activePattern], employees)))).toEqual([
      { id: "site-1", name: "본관" }
    ]);
  });

  it("should build step1 cycle previews and simulation timeline", () => {
    const cyclePreviews = buildSitePatternCyclePreviews({
      cycleCount: 2,
      cycleDrafts: [
        {
          breakMinutes: "60",
          cycleKey: "cycle-1",
          name: "",
          patternStartDate: "2026-04-03",
          patternString: "주야휴",
          shiftCount: "2",
          shiftTimes: ["07:00 - 19:00"],
          teamIndexes: [1]
        }
      ],
      fallbackDate: "2026-04-01",
      fallbackTimeRanges: ["07:00 - 19:00", "19:00 - 07:00", "09:00 - 17:00"],
      teamCount: 2
    });

    expect(cyclePreviews).toEqual([
      {
        breakMinutes: 60,
        cycleKey: "cycle-1",
        cycleLabels: ["주간", "야간", "휴무"],
        invalidTokens: [],
        name: "Cycle 1",
        patternStartDate: "2026-04-03",
        patternString: "주야휴",
        shiftCards: [
          { breakMinutes: 60, label: "주간", timeRange: "07:00 - 19:00" },
          { breakMinutes: 60, label: "야간", timeRange: "19:00 - 07:00" }
        ],
        shiftCount: 2,
        shiftLabels: ["주간", "야간"],
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        teamIndexes: [1, 1]
      },
      {
        breakMinutes: 60,
        cycleKey: "cycle-2",
        cycleLabels: [],
        invalidTokens: [],
        name: "Cycle 2",
        patternStartDate: "2026-04-01",
        patternString: "",
        shiftCards: [
          { breakMinutes: 60, label: "주간", timeRange: "07:00 - 19:00" },
          { breakMinutes: 60, label: "야간", timeRange: "19:00 - 07:00" }
        ],
        shiftCount: 2,
        shiftLabels: ["주간", "야간"],
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        teamIndexes: [0, 1]
      }
    ]);

    expect(
      buildSitePatternSimulationTimeline({
        cyclePreviews,
        fallbackDate: "2026-04-01",
        simulationMonthIndex: 1
      })
    ).toEqual({
      simulationAnchorDate: "2026-04-01",
      simulationMonth: {
        date: new Date(2026, 4, 1),
        key: "2026-4"
      },
      simulationMonths: [
        { date: new Date(2026, 3, 1), key: "2026-3" },
        { date: new Date(2026, 4, 1), key: "2026-4" },
        { date: new Date(2026, 5, 1), key: "2026-5" }
      ]
    });
  });
});
