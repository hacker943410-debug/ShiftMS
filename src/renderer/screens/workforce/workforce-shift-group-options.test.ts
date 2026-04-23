import { describe, expect, it } from "vitest";

import type { EmployeeRecord, ShiftPatternRecord } from "@shared/domain/model";

import { getAvailableShiftGroups } from "./workforce-shift-group-options";

const createPattern = (overrides?: Partial<ShiftPatternRecord>): ShiftPatternRecord =>
  ({
    createdAt: "2026-04-23T09:00:00.000Z",
    cycleLength: 4,
    cycles: [],
    id: "pattern-1",
    name: "기본 패턴",
    patternCode: "111휴",
    patternStartDate: "2026-04-01",
    poolBreakMinutes: 60,
    poolEnabled: false,
    siteId: "site-1",
    startIndexRule: "manual",
    status: "active",
    steps: [],
    teamCapacities: [],
    teamCount: 3,
    teamCycleAssignments: [],
    teamIndexes: [],
    ...overrides
  }) as ShiftPatternRecord;

const createEmployee = (overrides?: Partial<EmployeeRecord>): EmployeeRecord =>
  ({
    createdAt: "2026-04-23T09:00:00.000Z",
    currentShiftGroup: "A조",
    currentSiteId: "site-1",
    employeeCode: "EMP-001",
    employmentType: "정규",
    id: "employee-1",
    name: "홍길동",
    status: "active",
    ...overrides
  }) as EmployeeRecord;

describe("workforce-shift-group-options", () => {
  it("should keep groups available until their configured headcount is fully occupied", () => {
    const pattern = createPattern({
      teamCapacities: [
        { teamLabel: "A조", maxHeadcount: 3 },
        { teamLabel: "B조", maxHeadcount: 1 },
        { teamLabel: "C조", maxHeadcount: 2 }
      ]
    });
    const employees = [
      createEmployee({ id: "employee-1", currentShiftGroup: "A조" }),
      createEmployee({ id: "employee-2", employeeCode: "EMP-002", currentShiftGroup: "A조" }),
      createEmployee({ id: "employee-3", employeeCode: "EMP-003", currentShiftGroup: "B조" }),
      createEmployee({ id: "employee-4", employeeCode: "EMP-004", currentShiftGroup: "C조" })
    ];

    expect(getAvailableShiftGroups("site-1", [pattern], employees)).toEqual(["A조", "C조"]);
  });

  it("should return all configured groups when headcount limits are not set", () => {
    const pattern = createPattern();
    const employees = [
      createEmployee({ id: "employee-1", currentShiftGroup: "A조" }),
      createEmployee({ id: "employee-2", employeeCode: "EMP-002", currentShiftGroup: "B조" }),
      createEmployee({ id: "employee-3", employeeCode: "EMP-003", currentShiftGroup: "C조" })
    ];

    expect(getAvailableShiftGroups("site-1", [pattern], employees)).toEqual([
      "A조",
      "B조",
      "C조"
    ]);
  });
});
