import { describe, expect, it, vi } from "vitest";

import type { EmployeeRecord, EmployeeSiteAssignment } from "@shared/domain/model";

import { createSiteManagementStepTwoActions } from "./site-management-step-two-actions";

const createEmployee = (overrides?: Partial<EmployeeRecord>): EmployeeRecord => ({
  createdAt: "2026-04-01T00:00:00.000Z",
  employeeCode: "EMP-001",
  employmentType: "staff",
  id: "employee-1",
  name: "홍길동",
  status: "active",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...overrides
});

const createAssignment = (
  overrides?: Partial<EmployeeSiteAssignment>
): EmployeeSiteAssignment => ({
  createdAt: "2026-04-01T00:00:00.000Z",
  employeeId: "employee-1",
  id: "assignment-1",
  siteId: "site-1",
  startDate: "2026-04-01",
  status: "active",
  ...overrides
});

const createHarness = (overrides?: {
  assignedByTeam?: Map<string, EmployeeRecord[]>;
  assignmentStartDate?: string;
  draftSiteId?: string;
  draftSiteName?: string;
  employees?: EmployeeRecord[];
  pendingAssignmentMap?: Map<
    string,
    { employeeId: string; sortOrder?: number; teamLabel: string; startDate: string }
  >;
  pendingAssignments?: Array<{
    employeeId: string;
    sortOrder?: number;
    teamLabel: string;
    startDate: string;
  }>;
}) => {
  let employees = overrides?.employees ?? [createEmployee()];
  let pendingAssignments = overrides?.pendingAssignments ?? [];
  let assigningEmployeeId: string | null = null;
  let isCompletingSite = false;
  let stepTwoError: string | null = null;
  let refreshCount = 0;
  let backToListCount = 0;
  let clearDraggingCount = 0;
  let stopDragCount = 0;

  const askQuestion = vi.fn(async () => ({ confirmed: true }));
  const bridge = {
    closeEmployeeAssignment: vi.fn(),
    listEmployeeAssignments: vi.fn(),
    reorderEmployeeAssignment: vi.fn(),
    saveEmployeeAssignment: vi.fn()
  };

  const actions = createSiteManagementStepTwoActions({
    askQuestion,
    assignedByTeam: overrides?.assignedByTeam ?? new Map(),
    assignmentStartDate: overrides?.assignmentStartDate ?? "2026-04-10",
    bridge,
    clearDraggingEmployee: () => {
      clearDraggingCount += 1;
    },
    configuredTeamCapacities: new Map(),
    draftSiteId: overrides?.draftSiteId,
    draftSiteName: overrides?.draftSiteName ?? "본관",
    ensureSiteReadyForAssignments: vi.fn(async () => overrides?.draftSiteId ?? null),
    getErrorMessage: (error) => (error instanceof Error ? error.message : "오류"),
    handleBackToList: () => {
      backToListCount += 1;
    },
    incrementRefreshKey: () => {
      refreshCount += 1;
    },
    pendingAssignmentMap: overrides?.pendingAssignmentMap ?? new Map(),
    pendingAssignments,
    setAssigningEmployeeId: (value) => {
      assigningEmployeeId = value;
    },
    setEmployees: (updater) => {
      employees = updater(employees);
    },
    setIsCompletingSite: (value) => {
      isCompletingSite = value;
    },
    setPendingAssignments: (updater) => {
      pendingAssignments = updater(pendingAssignments);
    },
    setStepTwoError: (message) => {
      stepTwoError = message;
    },
    stopDragAutoScroll: () => {
      stopDragCount += 1;
    }
  });

  return {
    actions,
    askQuestion,
    bridge,
    getState: () => ({
      assigningEmployeeId,
      backToListCount,
      clearDraggingCount,
      employees,
      isCompletingSite,
      pendingAssignments,
      refreshCount,
      stepTwoError,
      stopDragCount
    })
  };
};

describe("site-management-step-two-actions", () => {
  it("should stage a pending assignment when the site is not saved yet", async () => {
    const harness = createHarness();

    await harness.actions.handleAssignEmployee(createEmployee(), "A조");

    expect(harness.askQuestion).toHaveBeenCalledTimes(1);
    expect(harness.getState().pendingAssignments).toEqual([
      { employeeId: "employee-1", sortOrder: 0, startDate: "2026-04-10", teamLabel: "A조" }
    ]);
    expect(harness.getState().stepTwoError).toBeNull();
    expect(harness.getState().clearDraggingCount).toBe(1);
  });

  it("should assign an employee through the bridge for a saved site", async () => {
    const harness = createHarness({
      draftSiteId: "site-1",
      draftSiteName: "본관"
    });
    harness.bridge.saveEmployeeAssignment.mockResolvedValue({
      ok: true,
      data: createAssignment()
    });

    await harness.actions.handleAssignEmployee(createEmployee(), "A조");

    expect(harness.bridge.saveEmployeeAssignment).toHaveBeenCalledWith({
      employeeId: "employee-1",
      shiftGroup: "A조",
      siteId: "site-1",
      sortOrder: 0,
      startDate: "2026-04-10",
      teamName: "A조"
    });
    expect(harness.getState().employees[0]).toMatchObject({
      currentAssignmentEndDate: undefined,
      currentAssignmentStartDate: "2026-04-10",
      currentShiftGroup: "A조",
      currentSiteId: "site-1",
      currentSiteName: "본관"
    });
    expect(harness.getState().refreshCount).toBe(1);
    expect(harness.getState().clearDraggingCount).toBe(1);
  });

  it("should close an assignment using the active assignment start date when needed", async () => {
    const harness = createHarness({
      assignmentStartDate: "2026-04-01",
      draftSiteId: "site-1"
    });
    harness.bridge.listEmployeeAssignments.mockResolvedValue({
      ok: true,
      data: [createAssignment({ startDate: "2026-04-05" })]
    });
    harness.bridge.closeEmployeeAssignment.mockResolvedValue({
      ok: true,
      data: createAssignment({ endDate: "2026-04-05", startDate: "2026-04-05", status: "ended" })
    });

    await harness.actions.handleUnassignEmployee(
      createEmployee({ currentShiftGroup: "A조", currentSiteId: "site-1" })
    );

    expect(harness.askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "해제 일자가 2026-04-05가 맞습니까?\n홍길동님의 A조 배정을 해제하시겠습니까?"
      })
    );
    expect(harness.bridge.closeEmployeeAssignment).toHaveBeenCalledWith({
      assignmentId: "assignment-1",
      endDate: "2026-04-05"
    });
    expect(harness.getState().stepTwoError).toBeNull();
    expect(harness.getState().clearDraggingCount).toBe(1);
  });

  it("should unassign an active site assignment even when the shift group is missing", async () => {
    const harness = createHarness({
      assignmentStartDate: "2026-04-10",
      draftSiteId: "site-1"
    });
    harness.bridge.listEmployeeAssignments.mockResolvedValue({
      ok: true,
      data: [createAssignment({ startDate: "2026-04-01" })]
    });
    harness.bridge.closeEmployeeAssignment.mockResolvedValue({
      ok: true,
      data: createAssignment({ endDate: "2026-04-10", status: "ended" })
    });

    await harness.actions.handleUnassignEmployee(
      createEmployee({ currentShiftGroup: undefined, currentSiteId: "site-1" })
    );

    expect(harness.askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "해제 일자가 2026-04-10가 맞습니까?\n홍길동님의 미지정 근무조 배정을 해제하시겠습니까?"
      })
    );
    expect(harness.bridge.closeEmployeeAssignment).toHaveBeenCalledWith({
      assignmentId: "assignment-1",
      endDate: "2026-04-10"
    });
    expect(harness.getState().employees[0]).toMatchObject({
      currentAssignmentEndDate: "2026-04-10",
      currentAssignmentStartDate: undefined,
      currentShiftGroup: undefined,
      currentSiteId: undefined,
      currentSiteName: undefined
    });
  });

  it("should complete step two by saving all pending assignments", async () => {
    const harness = createHarness({
      draftSiteId: "site-1",
      pendingAssignments: [
        { employeeId: "employee-1", sortOrder: 0, startDate: "2026-04-10", teamLabel: "A조" },
        { employeeId: "employee-2", sortOrder: 0, startDate: "2026-04-11", teamLabel: "B조" }
      ]
    });
    harness.bridge.saveEmployeeAssignment.mockResolvedValue({
      ok: true,
      data: createAssignment()
    });

    await harness.actions.handleCompleteStepTwo();

    expect(harness.bridge.saveEmployeeAssignment).toHaveBeenCalledTimes(2);
    expect(harness.getState().pendingAssignments).toEqual([]);
    expect(harness.getState().refreshCount).toBe(1);
    expect(harness.getState().backToListCount).toBe(1);
    expect(harness.getState().assigningEmployeeId).toBeNull();
    expect(harness.getState().isCompletingSite).toBe(false);
  });

  it("should reorder pending assignments before the site is saved", async () => {
    const harness = createHarness({
      pendingAssignments: [
        { employeeId: "employee-1", sortOrder: 0, startDate: "2026-04-10", teamLabel: "A조" },
        { employeeId: "employee-2", sortOrder: 1, startDate: "2026-04-10", teamLabel: "A조" }
      ]
    });

    await harness.actions.handleMoveEmployee(
      createEmployee({ id: "employee-2", employeeCode: "EMP-002", name: "이수민" }),
      "A조",
      "up"
    );

    expect(harness.getState().pendingAssignments).toEqual([
      { employeeId: "employee-2", sortOrder: 0, startDate: "2026-04-10", teamLabel: "A조" },
      { employeeId: "employee-1", sortOrder: 1, startDate: "2026-04-10", teamLabel: "A조" }
    ]);
  });

  it("should reorder saved assignments through the bridge and update local employee order", async () => {
    const harness = createHarness({
      assignedByTeam: new Map([
        [
          "A조",
          [
            createEmployee({
              id: "employee-1",
              currentAssignmentOrder: 0,
              currentShiftGroup: "A조",
              currentSiteId: "site-1"
            }),
            createEmployee({
              id: "employee-2",
              employeeCode: "EMP-002",
              name: "이수민",
              currentAssignmentOrder: 1,
              currentShiftGroup: "A조",
              currentSiteId: "site-1"
            })
          ]
        ]
      ]),
      draftSiteId: "site-1",
      employees: [
        createEmployee({
          id: "employee-1",
          currentAssignmentOrder: 0,
          currentShiftGroup: "A조",
          currentSiteId: "site-1"
        }),
        createEmployee({
          id: "employee-2",
          employeeCode: "EMP-002",
          name: "이수민",
          currentAssignmentOrder: 1,
          currentShiftGroup: "A조",
          currentSiteId: "site-1"
        })
      ]
    });
    harness.bridge.listEmployeeAssignments.mockResolvedValue({
      ok: true,
      data: [
        createAssignment({
          employeeId: "employee-2",
          id: "assignment-2",
          shiftGroup: "A조",
          sortOrder: 1
        })
      ]
    });
    harness.bridge.reorderEmployeeAssignment.mockResolvedValue({
      ok: true,
      data: [
        createAssignment({
          employeeId: "employee-2",
          id: "assignment-2",
          shiftGroup: "A조",
          sortOrder: 0
        }),
        createAssignment({
          employeeId: "employee-1",
          shiftGroup: "A조",
          sortOrder: 1
        })
      ]
    });

    await harness.actions.handleMoveEmployee(
      createEmployee({
        id: "employee-2",
        employeeCode: "EMP-002",
        name: "이수민",
        currentAssignmentOrder: 1,
        currentShiftGroup: "A조",
        currentSiteId: "site-1"
      }),
      "A조",
      "up"
    );

    expect(harness.bridge.reorderEmployeeAssignment).toHaveBeenCalledWith({
      assignmentId: "assignment-2",
      direction: "up"
    });
    expect(harness.getState().employees.find((employee) => employee.id === "employee-2"))
      .toMatchObject({
        currentAssignmentOrder: 0
      });
    expect(harness.getState().employees.find((employee) => employee.id === "employee-1"))
      .toMatchObject({
        currentAssignmentOrder: 1
      });
    expect(harness.getState().refreshCount).toBe(1);
  });
});
