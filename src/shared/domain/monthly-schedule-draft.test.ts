import { describe, expect, it } from "vitest";

import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternTeamCapacity,
  ShiftPatternTeamCycleAssignment,
  ShiftPatternTeamIndex,
  ShiftPatternTeamSetting
} from "./model";
import {
  buildMonthlyScheduleDraft,
  getMonthlyScheduleDraftIssues,
  resolveStepTimesForDate,
  shouldUseHolidayTimes
} from "./monthly-schedule-draft";

const createPattern = (
  steps: ShiftPatternRecord["steps"],
  options?: {
    teamCount?: number;
    teamIndexes?: ShiftPatternTeamIndex[];
    cycles?: ShiftPatternCycle[];
    teamCycleAssignments?: ShiftPatternTeamCycleAssignment[];
    teamCapacities?: ShiftPatternTeamCapacity[];
    teamSettings?: ShiftPatternTeamSetting[];
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
  teamSettings: options?.teamSettings ?? [],
  poolEnabled: options?.poolEnabled ?? false,
  poolBreakMinutes: 0
});

const createEmployee = (input: {
  id: string;
  employeeCode: string;
  employmentType?: string;
  name: string;
  hireDate?: string;
  currentAssignmentOrder?: number;
  currentShiftGroup?: string;
  status?: EmployeeRecord["status"];
  retireDate?: string;
  currentAssignmentStartDate?: string;
  currentAssignmentEndDate?: string;
}): EmployeeRecord => ({
  id: input.id,
  employeeCode: input.employeeCode,
  name: input.name,
  employmentType: input.employmentType ?? "정규",
  status: input.status ?? "active",
  hireDate: input.hireDate,
  retireDate: input.retireDate,
  currentSiteId: "site-1",
  currentSiteName: "테스트 센터",
  currentAssignmentOrder: input.currentAssignmentOrder,
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
    expect(items[1]).toMatchObject({
      dutyCode: "N",
      startTime: "22:00",
      endTime: "06:00",
      breakMinutes: 60
    });
    expect(items[2]).toMatchObject({
      dutyCode: "E",
      startTime: "14:00",
      endTime: "22:00",
      breakMinutes: 30
    });
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

  // T-23: a person moved to this site mid-month is drafted here from the day the assignment
  // starts, not from the 1st. The hire date stays the floor for rows that predate the rule.
  it("should start the draft on the later of the hire date and the assignment start", () => {
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
    const draftFor = (scheduleMonth: string, employee: EmployeeRecord) =>
      buildMonthlyScheduleDraft({ scheduleMonth, pattern, employees: [employee] });
    const hasWorkDate = (items: ReturnType<typeof draftFor>, workDate: string) =>
      items.some((item) => item.workDate === workDate);

    const transferred = createEmployee({
      id: "employee-1",
      employeeCode: "EMP-001",
      name: "홍길동",
      currentShiftGroup: "A조",
      hireDate: "2026-03-01",
      currentAssignmentStartDate: "2026-03-15"
    });
    const transferredMarch = draftFor("2026-03", transferred);

    expect(draftFor("2026-02", transferred)).toHaveLength(0);
    expect(hasWorkDate(transferredMarch, "2026-03-01")).toBe(false);
    expect(hasWorkDate(transferredMarch, "2026-03-14")).toBe(false);
    expect(hasWorkDate(transferredMarch, "2026-03-15")).toBe(true);
    expect(hasWorkDate(transferredMarch, "2026-03-31")).toBe(true);

    // Legacy row: the assignment was saved before the "not before the hire date" rule.
    const legacy = createEmployee({
      id: "employee-2",
      employeeCode: "EMP-002",
      name: "김철수",
      currentShiftGroup: "A조",
      hireDate: "2026-03-10",
      currentAssignmentStartDate: "2026-03-01"
    });
    const legacyMarch = draftFor("2026-03", legacy);

    expect(hasWorkDate(legacyMarch, "2026-03-09")).toBe(false);
    expect(hasWorkDate(legacyMarch, "2026-03-10")).toBe(true);

    // No hire date on record (old data): the assignment start is the only floor.
    const undated = createEmployee({
      id: "employee-3",
      employeeCode: "EMP-003",
      name: "이영희",
      currentShiftGroup: "A조",
      currentAssignmentStartDate: "2026-03-20"
    });
    const undatedMarch = draftFor("2026-03", undated);

    expect(hasWorkDate(undatedMarch, "2026-03-19")).toBe(false);
    expect(hasWorkDate(undatedMarch, "2026-03-20")).toBe(true);
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

  it("should preserve assignment order within the same team", () => {
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
        employeeCode: "EMP-002",
        name: "이수민",
        currentAssignmentOrder: 1,
        currentShiftGroup: "A조"
      }),
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-001",
        name: "홍길동",
        currentAssignmentOrder: 0,
        currentShiftGroup: "A조"
      })
    ];

    const firstDayItems = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    }).filter((item) => item.workDate === "2026-04-01");

    expect(firstDayItems.map((item) => item.employeeCode)).toEqual(["EMP-001", "EMP-002"]);
    expect(firstDayItems.map((item) => item.sortOrder)).toEqual([0, 1]);
  });

  it("should format BP employees for schedule display names while keeping their employee code", () => {
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
        employeeCode: "BP-0001",
        employmentType: "BP",
        name: "외부인력",
        currentShiftGroup: "A조"
      })
    ];

    const firstItem = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern,
      employees
    })[0];

    expect(firstItem?.employeeCode).toBe("BP-0001");
    expect(firstItem?.employeeName).toBe("BP(외부인력)");
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

  it("should keep generation byte-identical when a cycle is unified even if holiday fields are present", () => {
    // 평·휴를 켜지 않은(unified) 사이클은 step에 휴일 칸이 들어 있어도 토·일에 평일 시간을 그대로 써야 한다(기존 동작 보존).
    const step = {
      id: "step-1",
      stepIndex: 0,
      dutyCode: "D",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const pattern = createPattern([step], {
      teamCount: 1,
      teamIndexes: [{ teamLabel: "A조", index: 0 }],
      teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
      teamCapacities: [{ teamLabel: "A조" }]
    });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" })
    ];

    const items = buildMonthlyScheduleDraft({ scheduleMonth: "2026-04", pattern, employees });
    const saturday = items.find((item) => item.workDate === "2026-04-04");

    // 2026-04-04 = 토요일이지만 unified 사이클이라 평일 시간 유지
    expect(saturday).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
  });

  it("should apply holiday times on weekends for a 평·휴 split cycle", () => {
    const step = {
      id: "step-1",
      stepIndex: 0,
      dutyCode: "D",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const pattern = createPattern([step], {
      teamCount: 1,
      teamIndexes: [{ teamLabel: "A조", index: 0 }],
      teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
      teamCapacities: [{ teamLabel: "A조" }],
      cycles: [
        {
          id: "cycle-1",
          cycleKey: "cycle-1",
          name: "주간 사이클",
          order: 0,
          shiftCount: 1,
          cycleLength: 1,
          patternCode: "D",
          patternStartDate: "2026-04-01",
          holidayTimeMode: "split",
          weekdayPublicHolidayAsHoliday: false,
          steps: [step],
          teamIndexes: [{ teamLabel: "A조", index: 0 }]
        }
      ]
    });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" })
    ];

    const items = buildMonthlyScheduleDraft({ scheduleMonth: "2026-04", pattern, employees });
    const wednesday = items.find((item) => item.workDate === "2026-04-01"); // 평일(수)
    const saturday = items.find((item) => item.workDate === "2026-04-04"); // 토
    const sunday = items.find((item) => item.workDate === "2026-04-05"); // 일

    expect(wednesday).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
    expect(saturday).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
    expect(sunday).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
  });

  it("should honor the weekday-public-holiday toggle for a 평·휴 split cycle", () => {
    const step = {
      id: "step-1",
      stepIndex: 0,
      dutyCode: "D",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const buildPattern = (weekdayPublicHolidayAsHoliday: boolean) =>
      createPattern([step], {
        teamCount: 1,
        teamIndexes: [{ teamLabel: "A조", index: 0 }],
        teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
        teamCapacities: [{ teamLabel: "A조" }],
        cycles: [
          {
            id: "cycle-1",
            cycleKey: "cycle-1",
            name: "주간 사이클",
            order: 0,
            shiftCount: 1,
            cycleLength: 1,
            patternCode: "D",
            patternStartDate: "2026-04-01",
            holidayTimeMode: "split",
            weekdayPublicHolidayAsHoliday,
            steps: [step],
            teamIndexes: [{ teamLabel: "A조", index: 0 }]
          }
        ]
      });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" })
    ];
    // 2026-04-01(수)을 공휴일로 가정
    const publicHolidayDates = new Set<string>(["2026-04-01"]);

    const asHoliday = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: buildPattern(true),
      employees,
      publicHolidayDates
    }).find((item) => item.workDate === "2026-04-01");
    const asWeekday = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: buildPattern(false),
      employees,
      publicHolidayDates
    }).find((item) => item.workDate === "2026-04-01");

    // 토글 ON → 휴일 시간, 토글 OFF → 평일 시간
    expect(asHoliday).toMatchObject({ startTime: "09:00", endTime: "21:00", breakMinutes: 90 });
    expect(asWeekday).toMatchObject({ startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
  });

  it("shouldUseHolidayTimes classifies day types correctly", () => {
    const unified = { holidayTimeMode: "unified" as const };
    const split = { holidayTimeMode: "split" as const, weekdayPublicHolidayAsHoliday: true };
    const splitNoPublic = { holidayTimeMode: "split" as const, weekdayPublicHolidayAsHoliday: false };
    const holidays = new Set<string>(["2026-04-01"]); // 수요일 공휴일

    // unified는 언제나 false
    expect(shouldUseHolidayTimes(unified, "2026-04-04", holidays)).toBe(false);
    // split: 토·일은 항상 true
    expect(shouldUseHolidayTimes(split, "2026-04-04", holidays)).toBe(true); // 토
    expect(shouldUseHolidayTimes(split, "2026-04-05", holidays)).toBe(true); // 일
    // split: 평일 비공휴일은 false
    expect(shouldUseHolidayTimes(split, "2026-04-02", holidays)).toBe(false); // 목, 비공휴일
    // split: 평일 공휴일은 토글에 따름
    expect(shouldUseHolidayTimes(split, "2026-04-01", holidays)).toBe(true);
    expect(shouldUseHolidayTimes(splitNoPublic, "2026-04-01", holidays)).toBe(false);
  });

  it("resolveStepTimesForDate falls back to weekday times when holiday cells are empty", () => {
    const full = {
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      holidayStartTime: "09:00",
      holidayEndTime: "21:00",
      holidayBreakMinutes: 90
    };
    const partial = { startTime: "09:00", endTime: "18:00", breakMinutes: 60 };

    expect(resolveStepTimesForDate(full, false)).toEqual({
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    });
    expect(resolveStepTimesForDate(full, true)).toEqual({
      startTime: "09:00",
      endTime: "21:00",
      breakMinutes: 90
    });
    // 휴일 칸이 비면 평일 칸으로 폴백
    expect(resolveStepTimesForDate(partial, true)).toEqual({
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    });
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

  it("should keep pool teams out of the draft until a cycle is assigned, then generate them", () => {
    const steps: ShiftPatternRecord["steps"] = [
      { id: "step-1", stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
      { id: "step-2", stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
    ];
    const poolTeamSettings: ShiftPatternTeamSetting[] = [
      { teamLabel: "A조", workType: "ROTATING", isActive: true, sortOrder: 0 },
      { teamLabel: "Pool", workType: "POOL", isActive: true, sortOrder: 1 }
    ];
    const cycle: ShiftPatternCycle = {
      id: "cycle-1",
      cycleKey: "cycle-1",
      name: "Cycle 1",
      order: 0,
      shiftCount: 1,
      cycleLength: 2,
      patternCode: "DX",
      patternStartDate: "2026-04-01",
      steps,
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "Pool", index: 1 }
      ]
    };
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" }),
      createEmployee({ id: "e2", employeeCode: "EMP-002", name: "박수빈", currentShiftGroup: "Pool" })
    ];
    const unassignedPoolPattern = createPattern(steps, {
      teamCount: 1,
      cycles: [cycle],
      teamCycleAssignments: [{ teamLabel: "A조", cycleKey: "cycle-1" }],
      teamSettings: poolTeamSettings
    });
    const assignedPoolPattern = createPattern(steps, {
      teamCount: 1,
      cycles: [cycle],
      teamCycleAssignments: [
        { teamLabel: "A조", cycleKey: "cycle-1" },
        { teamLabel: "Pool", cycleKey: "cycle-1" }
      ],
      teamSettings: poolTeamSettings
    });

    const withoutPool = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: unassignedPoolPattern,
      employees
    });
    const withPool = buildMonthlyScheduleDraft({
      scheduleMonth: "2026-04",
      pattern: assignedPoolPattern,
      employees
    });

    // Cycle 배정 전에는 기존과 동일하게 Pool 인원이 근무표에 나오지 않는다.
    expect(withoutPool.some((item) => item.employeeCode === "EMP-002")).toBe(false);
    expect(
      getMonthlyScheduleDraftIssues({
        scheduleMonth: "2026-04",
        pattern: unassignedPoolPattern,
        employees
      })
    ).toHaveLength(0);

    // Cycle을 배정하면 다른 조와 똑같이 생성된다.
    const poolItems = withPool.filter((item) => item.employeeCode === "EMP-002");

    expect(poolItems.length).toBeGreaterThan(0);
    expect(poolItems.find((item) => item.workDate === "2026-04-01")?.dutyCode).toBe("O");
    expect(poolItems.find((item) => item.workDate === "2026-04-02")?.dutyCode).toBe("D");
  });

  it("should drop employees of a deactivated team from the draft", () => {
    const steps: ShiftPatternRecord["steps"] = [
      { id: "step-1", stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }
    ];
    const pattern = createPattern(steps, {
      teamCount: 2,
      teamSettings: [
        { teamLabel: "A조", workType: "ROTATING", isActive: true, sortOrder: 0 },
        { teamLabel: "B조", workType: "ROTATING", isActive: false, sortOrder: 1 }
      ]
    });
    const employees = [
      createEmployee({ id: "e1", employeeCode: "EMP-001", name: "김현우", currentShiftGroup: "A조" }),
      createEmployee({ id: "e2", employeeCode: "EMP-002", name: "박수빈", currentShiftGroup: "B조" })
    ];

    const items = buildMonthlyScheduleDraft({ scheduleMonth: "2026-04", pattern, employees });

    expect(items.some((item) => item.employeeCode === "EMP-001")).toBe(true);
    expect(items.some((item) => item.employeeCode === "EMP-002")).toBe(false);
  });
});
