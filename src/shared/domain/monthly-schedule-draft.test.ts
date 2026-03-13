import { describe, expect, it } from "vitest";

import type { EmployeeRecord, ShiftPatternRecord, ShiftPatternTeamIndex } from "./model";
import {
  buildMonthlyScheduleDraft,
  getMonthlyScheduleDraftIssues
} from "./monthly-schedule-draft";

const createPattern = (
  steps: ShiftPatternRecord["steps"],
  options?: {
    teamCount?: number;
    teamIndexes?: ShiftPatternTeamIndex[];
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
    }))
});

const createEmployee = (input: {
  id: string;
  employeeCode: string;
  name: string;
  currentShiftGroup?: string;
}): EmployeeRecord => ({
  id: input.id,
  employeeCode: input.employeeCode,
  name: input.name,
  employmentType: "정규",
  status: "active",
  currentSiteId: "site-1",
  currentSiteName: "테스트 센터",
  currentShiftGroup: input.currentShiftGroup,
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
});
