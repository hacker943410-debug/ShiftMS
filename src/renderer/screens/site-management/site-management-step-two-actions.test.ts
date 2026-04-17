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
  pendingAssignmentMap?: Map<string, { employeeId: string; teamLabel: string; startDate: string }>;
  pendingAssignments?: Array<{ employeeId: string; teamLabel: string; startDate: string }>;
}) => {
  let employees = [createEmployee()];
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
      { employeeId: "employee-1", startDate: "2026-04-10", teamLabel: "A조" }
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

  it("should reject unassigning before the active assignment start date", async () => {
    const harness = createHarness({
      assignmentStartDate: "2026-04-01",
      draftSiteId: "site-1"
    });
    harness.bridge.listEmployeeAssignments.mockResolvedValue({
      ok: true,
      data: [createAssignment({ startDate: "2026-04-05" })]
    });

    await harness.actions.handleUnassignEmployee(
      createEmployee({ currentShiftGroup: "A조", currentSiteId: "site-1" })
    );

    expect(harness.getState().stepTwoError).toBe(
      "배정 해제일은 현재 배정 시작일 이후여야 합니다."
    );
    expect(harness.bridge.closeEmployeeAssignment).not.toHaveBeenCalled();
    expect(harness.getState().clearDraggingCount).toBe(1);
  });

  it("should complete step two by saving all pending assignments", async () => {
    const harness = createHarness({
      draftSiteId: "site-1",
      pendingAssignments: [
        { employeeId: "employee-1", startDate: "2026-04-10", teamLabel: "A조" },
        { employeeId: "employee-2", startDate: "2026-04-11", teamLabel: "B조" }
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
});
