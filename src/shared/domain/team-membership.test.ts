import { describe, expect, it } from "vitest";

import type { EmployeeSiteAssignment, ShiftPatternRecord } from "./model";
import {
  getTeamWorkTypeFromPattern,
  resolveTeamMembershipOnDate,
  resolveTeamWorkTypeOnDate
} from "./team-membership";

const createAssignment = (
  overrides: Partial<EmployeeSiteAssignment> & Pick<EmployeeSiteAssignment, "id" | "startDate">
): EmployeeSiteAssignment => ({
  createdAt: "2026-06-01T00:00:00.000Z",
  employeeId: "emp-1",
  siteId: "site-1",
  status: "active",
  ...overrides
});

const createPattern = (
  teamSettings: ShiftPatternRecord["teamSettings"],
  overrides?: Partial<ShiftPatternRecord>
): ShiftPatternRecord => ({
  createdAt: "2026-06-01T00:00:00.000Z",
  cycleLength: 2,
  cycles: [],
  id: "pattern-1",
  name: "테스트 패턴",
  patternCode: "DX",
  poolEnabled: false,
  siteId: "site-1",
  startIndexRule: "manual-seed",
  status: "active",
  steps: [],
  teamCapacities: [],
  teamCount: 3,
  teamCycleAssignments: [],
  teamIndexes: [],
  teamSettings,
  ...overrides
});

describe("team-membership", () => {
  it("should pick the assignment that covers the target date and treat the end date as exclusive", () => {
    const assignments = [
      createAssignment({
        id: "assign-july",
        shiftGroup: "A조",
        startDate: "2026-07-01",
        endDate: "2026-08-01",
        status: "ended"
      }),
      createAssignment({ id: "assign-august", shiftGroup: "C조", startDate: "2026-08-01" })
    ];

    expect(resolveTeamMembershipOnDate(assignments, "2026-07-15")?.teamLabel).toBe("A조");
    expect(resolveTeamMembershipOnDate(assignments, "2026-07-31")?.teamLabel).toBe("A조");
    expect(resolveTeamMembershipOnDate(assignments, "2026-08-01")?.teamLabel).toBe("C조");
    expect(resolveTeamMembershipOnDate(assignments, "2026-06-30")).toBeUndefined();
    expect(resolveTeamMembershipOnDate(assignments, "invalid")).toBeUndefined();
  });

  it("should read the work type from the site pattern team settings", () => {
    const pattern = createPattern([
      { teamLabel: "A조", workType: "FIXED_DAY", isActive: true, sortOrder: 0 },
      { teamLabel: "C조", workType: "ROTATING", isActive: true, sortOrder: 1 }
    ]);

    expect(getTeamWorkTypeFromPattern(pattern, "A조")).toBe("FIXED_DAY");
    expect(getTeamWorkTypeFromPattern(pattern, "A")).toBe("FIXED_DAY");
    expect(getTeamWorkTypeFromPattern(pattern, "B조")).toBeUndefined();
    expect(getTeamWorkTypeFromPattern(undefined, "A조")).toBeUndefined();
  });

  it("should judge august work by the august team even when the employee moved teams", () => {
    const assignments = [
      createAssignment({
        id: "assign-july",
        shiftGroup: "A조",
        startDate: "2026-07-01",
        endDate: "2026-08-01",
        status: "ended"
      }),
      createAssignment({ id: "assign-august", shiftGroup: "C조", startDate: "2026-08-01" })
    ];
    const patterns = [
      createPattern([
        { teamLabel: "A조", workType: "FIXED_DAY", isActive: true, sortOrder: 0 },
        { teamLabel: "C조", workType: "ROTATING", isActive: true, sortOrder: 1 }
      ])
    ];

    const july = resolveTeamWorkTypeOnDate({ assignments, patterns, workDate: "2026-07-10" });
    const august = resolveTeamWorkTypeOnDate({ assignments, patterns, workDate: "2026-08-10" });

    expect(july).toMatchObject({ teamLabel: "A조", workType: "FIXED_DAY", source: "assignment-history" });
    expect(august).toMatchObject({ teamLabel: "C조", workType: "ROTATING", source: "assignment-history" });
  });

  it("should fall back to the current team and then to label defaults", () => {
    const currentTeamOnly = resolveTeamWorkTypeOnDate({
      assignments: [],
      currentTeamLabel: "Pool",
      workDate: "2026-08-10"
    });
    const nothingKnown = resolveTeamWorkTypeOnDate({ workDate: "2026-08-10" });

    expect(currentTeamOnly).toMatchObject({
      teamLabel: "Pool",
      workType: "POOL",
      source: "current-team"
    });
    expect(nothingKnown).toMatchObject({ workType: "ROTATING", source: "default" });
  });

  it("should ignore inactive patterns and prefer the newest active pattern of the site", () => {
    const assignments = [createAssignment({ id: "assign-1", shiftGroup: "A조", startDate: "2026-01-01" })];
    const patterns = [
      createPattern([{ teamLabel: "A조", workType: "ROTATING", isActive: true, sortOrder: 0 }], {
        id: "pattern-old",
        status: "inactive",
        updatedAt: "2026-07-01T00:00:00.000Z"
      }),
      createPattern([{ teamLabel: "A조", workType: "FIXED_DAY", isActive: true, sortOrder: 0 }], {
        id: "pattern-new",
        updatedAt: "2026-06-01T00:00:00.000Z"
      })
    ];

    expect(resolveTeamWorkTypeOnDate({ assignments, patterns, workDate: "2026-08-10" }).workType).toBe(
      "FIXED_DAY"
    );
  });
});
