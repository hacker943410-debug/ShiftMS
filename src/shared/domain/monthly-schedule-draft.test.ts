import { describe, expect, it } from "vitest";

import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternTeamCapacity,
  ShiftPatternTeamCycleAssignment,
  ShiftPatternTeamIndex
} from "./model";
import {
  buildMonthlyScheduleDraft,
  getMonthlyScheduleDraftIssues
} from "./monthly-schedule-draft";

const createPattern = (
  steps: ShiftPatternRecord["steps"],
  options?: {
    teamCount?: number;
    teamIndexes?: ShiftPatternTeamIndex[];
    cycles?: ShiftPatternCycle[];
    teamCycleAssignments?: ShiftPatternTeamCycleAssignment[];
    teamCapacities?: ShiftPatternTeamCapacity[];
    poolEnabled?: boolean;
  }
): ShiftPatternRecord => ({
  id: "pattern-1",
  siteId: "site-1",
  name: "테스트 패턴",
  teamCount: options?.teamCount ?? 3,
  cycleLength: steps.length,
  patternCode: steps.map((step) => step.dutyCode).join(""),
  startIndexRule: "team-sequence",
  patternStartDate: "2026-04-01",
  status: "active",
  createdAt: "2026-03-12T00:00:00.000Z",
  steps,
  teamIndexes:
    options?.teamIndexes ??
    Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`,
      index
    })),
  cycles:
    options?.cycles ??
    [
      {
        id: "cycle-1",
        cycleKey: "cycle-1",
        name: "Cycle 1",
        order: 0,
        shiftCount: Math.max(
          new Set(
            steps.map((step) => step.dutyCode).filter((dutyCode) => dutyCode !== "X" && dutyCode !== "O")
          ).size,
          1
        ),
        cycleLength: steps.length,
        patternCode: steps.map((step) => step.dutyCode).join(""),
        patternStartDate: "2026-04-01",
        steps,
        teamIndexes:
          options?.teamIndexes ??
          Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
            teamLabel: `${String.fromCharCode(65 + index)}조`,
            index
          }))
      }
    ],
  teamCycleAssignments:
    options?.teamCycleAssignments ??
    Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`,
      cycleKey: "cycle-1"
    })),
  teamCapacities:
    options?.teamCapacities ??
    Array.from({ length: options?.teamCount ?? 3 }, (_, index) => ({
      teamLabel: `${String.fromCharCode(65 + index)}조`
    })),
  poolEnabled: options?.poolEnabled ?? false,
  poolBreakMinutes: 0
});

const createEmployee = (input: {
  id: string;
  employeeCode: string;
  name: string;
  hireDate?: string;
  currentShiftGroup?: string;
  status?: EmployeeRecord["status"];
  retireDate?: string;
  currentAssignmentStartDate?: string;
  currentAssignmentEndDate?: string;
}): EmployeeRecord => ({
  id: input.id,
  employeeCode: input.employeeCode,
  name: input.name,
  employmentType: "정규",
  status: input.status ?? "active",
  hireDate: input.hireDate,
  retireDate: input.retireDate,
  currentSiteId: "site-1",
  currentSiteName: "테스트 센터",
  currentShiftGroup: input.currentShiftGroup,
  currentAssignmentStartDate: input.currentAssignmentStartDate,
  currentAssignmentEndDate: input.currentAssignmentEndDate,
  createdAt: "2026-03-12T00:00:00.000Z"
});

describe("monthly-schedule-draft", () => {
  it("should generate a two-shift draft using team offsets", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "N",
        startTime: "18:00",
        endTime: "06:00",
        breakMinutes: 90
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "N",
        startTime: "18:00",
        endTime: "06:00",
        breakMinutes: 90
      },
      {
        id: "step-5",
        stepIndex: 4,
        dutyCode: "X",
        breakMinutes: 0
      },
      {
        id: "step-6",
        stepIndex: 5,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(items).toHaveLength(60);
    expect(
      items
        .filter((item) => item.employeeCode === "EMP-001")
        .slice(0, 6)
        .map((item) => item.dutyCode)
    ).toEqual(["D", "D", "N", "N", "O", "O"]);
    expect(
      items
        .filter((item) => item.employeeCode === "EMP-002")
        .slice(0, 4)
        .map((item) => item.dutyCode)
    ).toEqual(["D", "N", "N", "O"]);
  });

  it("should remap custom three-shift duty codes to export-compatible codes", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "A",
        startTime: "06:00",
        endTime: "14:00",
        breakMinutes: 30
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "B",
        startTime: "14:00",
        endTime: "22:00",
        breakMinutes: 30
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "C",
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: 60
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      }),
      createEmployee({
        id: "employee-3",
        employeeCode: "EMP-003",
        name: "박정호",
        currentShiftGroup: "C조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.dutyCode)).toEqual(["D", "E", "N"]);
    expect(firstDayItems[1]?.startTime).toBe("14:00");
    expect(firstDayItems[2]?.endTime).toBe("06:00");
  });

  it("should preserve canonical three-shift slot meanings when cycle order is mixed", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "A",
        startTime: "06:00",
        endTime: "14:00",
        breakMinutes: 30
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "C",
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: 60
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "B",
        startTime: "14:00",
        endTime: "22:00",
        breakMinutes: 30
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    })
      .filter((item) => item.employeeCode === "EMP-001")
      .slice(0, 4);

    expect(items.map((item) => item.dutyCode)).toEqual(["D", "N", "E", "O"]);
  });

  it("should honor saved team indexes when calculating cycle offsets", () => {
    const pattern = createPattern(
      [
        {
          id: "step-1",
          stepIndex: 0,
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          id: "step-2",
          stepIndex: 1,
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        },
        {
          id: "step-3",
          stepIndex: 2,
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        },
        {
          id: "step-4",
          stepIndex: 3,
          dutyCode: "N",
          startTime: "18:00",
          endTime: "06:00",
          breakMinutes: 90
        },
        {
          id: "step-5",
          stepIndex: 4,
          dutyCode: "X",
          breakMinutes: 0
        },
        {
          id: "step-6",
          stepIndex: 5,
          dutyCode: "X",
          breakMinutes: 0
        }
      ],
      {
        teamCount: 4,
        teamIndexes: [
          { teamLabel: "A조", index: 0 },
          { teamLabel: "B조", index: 2 },
          { teamLabel: "C조", index: 4 },
          { teamLabel: "D조", index: 1 }
        ]
      }
    );
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.dutyCode)).toEqual(["D", "N"]);
  });

  it("should roll retired employees out from the retirement date", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "X",
        breakMinutes: 0
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조",
        status: "retired",
        retireDate: "2026-04-15"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "B조"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(items.some((item) => item.employeeCode === "EMP-001" && item.workDate === "2026-04-14")).toBe(true);
    expect(items.some((item) => item.employeeCode === "EMP-001" && item.workDate === "2026-04-15")).toBe(false);
    expect(items.some((item) => item.employeeCode === "EMP-001" && item.workDate === "2026-04-30")).toBe(false);
    expect(items.some((item) => item.employeeCode === "EMP-002" && item.workDate === "2026-04-30")).toBe(true);
  });

  it("should exclude days before the hire date when building a draft", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "08:00",
        endTime: "20:00",
        breakMinutes: 60
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "홍길동",
        currentShiftGroup: "A조",
        hireDate: "2026-03-01",
        currentAssignmentStartDate: "2026-03-15"
      })
    ];

    const februaryItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-02",
      pattern,
      employees
    });
    const marchItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-03",
      pattern,
      employees
    });

    expect(februaryItems).toHaveLength(0);
    expect(marchItems.some((item) => item.workDate === "2026-03-01")).toBe(true);
    expect(marchItems.some((item) => item.workDate === "2026-03-10")).toBe(true);
  });

  it("should use cycle-specific patterns based on team assignments", () => {
    const cycleOneSteps: ShiftPatternRecord["steps"] = [
      {
        id: "cycle-1-step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      },
      {
        id: "cycle-1-step-2",
        stepIndex: 1,
        dutyCode: "X",
        breakMinutes: 0
      }
    ];
    const cycleTwoSteps: ShiftPatternRecord["steps"] = [
      {
        id: "cycle-2-step-1",
        stepIndex: 0,
        dutyCode: "N",
        startTime: "18:00",
        endTime: "06:00",
        breakMinutes: 90
      },
      {
        id: "cycle-2-step-2",
        stepIndex: 1,
        dutyCode: "X",
        breakMinutes: 0
      }
    ];
    const pattern = createPattern(cycleOneSteps, {
      teamCount: 4,
      cycles: [
        {
          id: "cycle-1",
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 1,
          cycleLength: cycleOneSteps.length,
          patternCode: "DX",
          patternStartDate: "2026-04-01",
          steps: cycleOneSteps,
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 }
          ]
        },
        {
          id: "cycle-2",
          cycleKey: "cycle-2",
          name: "Cycle 2",
          order: 1,
          shiftCount: 1,
          cycleLength: cycleTwoSteps.length,
          patternCode: "NX",
          patternStartDate: "2026-04-01",
          steps: cycleTwoSteps,
          teamIndexes: [
            { teamLabel: "C조", index: 0 },
            { teamLabel: "D조", index: 1 }
          ]
        }
      ],
      teamCycleAssignments: [
        { teamLabel: "A조", cycleKey: "cycle-1" },
        { teamLabel: "B조", cycleKey: "cycle-1" },
        { teamLabel: "C조", cycleKey: "cycle-2" },
        { teamLabel: "D조", cycleKey: "cycle-2" }
      ]
    });
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentShiftGroup: "C조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.dutyCode)).toEqual(["D", "N"]);
    expect(firstDayItems[0]?.startTime).toBe("06:00");
    expect(firstDayItems[1]?.startTime).toBe("18:00");
  });

  it("should exclude pool employees from generated schedules", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "D",
        startTime: "06:00",
        endTime: "18:00",
        breakMinutes: 60
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "박수빈",
        currentShiftGroup: "Pool"
      })
    ];

    const items = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(items.some((item) => item.employeeCode === "EMP-001")).toBe(true);
    expect(items.some((item) => item.employeeCode === "EMP-002")).toBe(false);
  });

  it("should report draft issues for missing shift groups and unsupported duty counts", () => {
    const pattern = createPattern([
      {
        id: "step-1",
        stepIndex: 0,
        dutyCode: "A",
        startTime: "06:00",
        endTime: "12:00",
        breakMinutes: 30
      },
      {
        id: "step-2",
        stepIndex: 1,
        dutyCode: "B",
        startTime: "12:00",
        endTime: "18:00",
        breakMinutes: 30
      },
      {
        id: "step-3",
        stepIndex: 2,
        dutyCode: "C",
        startTime: "18:00",
        endTime: "00:00",
        breakMinutes: 30
      },
      {
        id: "step-4",
        stepIndex: 3,
        dutyCode: "D",
        startTime: "00:00",
        endTime: "06:00",
        breakMinutes: 30
      }
    ]);
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우"
      })
    ];

    const issues = getMonthlyScheduleDraftIssues({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "missing-shift-group",
      "unsupported-duty-count"
    ]);
  });

  it("should report missing cycle assignments for regular teams only", () => {
    const pattern = createPattern(
      [
        {
          id: "step-1",
          stepIndex: 0,
          dutyCode: "D",
          startTime: "06:00",
          endTime: "18:00",
          breakMinutes: 60
        }
      ],
      {
        teamCount: 2,
        teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }]
      }
    );
    const employees = [
      createEmployee({
        id: "employee-1",
        employeeCode: "EMP-001",
        name: "김현우",
        currentShiftGroup: "B조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "박수빈",
        currentShiftGroup: "Pool"
      })
    ];

    const issues = getMonthlyScheduleDraftIssues({
      scheduleMonth: "2026-04",
      pattern,
      employees
    });

    expect(issues.map((issue) => issue.code)).toContain("missing-cycle-assignment");
  });
});
