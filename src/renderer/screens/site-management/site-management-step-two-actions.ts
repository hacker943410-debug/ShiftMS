import type { QuestionDialogOptions, QuestionDialogResult } from "../../components/QuestionDialog";

import type {
  EmployeeAssignmentCloseInput,
  EmployeeAssignmentInput,
  WorkforceBridge
} from "@shared/bridge/contracts";
import { formatEmployeeDisplayName } from "@shared/domain/employment-type";
import type { EmployeeRecord } from "@shared/domain/model";
import type { PendingSiteAssignmentLike } from "./site-management-selectors";
import { normalizeTeamLabel } from "../../../shared/domain/team-label";
import { showActionResultDialog } from "../../components/action-result-dialog";

type AskQuestion = (options: QuestionDialogOptions) => Promise<QuestionDialogResult>;
type AssignmentMoveDirection = "up" | "down";

type SiteManagementStepTwoBridge = Pick<
  WorkforceBridge,
  | "closeEmployeeAssignment"
  | "listEmployeeAssignments"
  | "reorderEmployeeAssignment"
  | "saveEmployeeAssignment"
>;

interface CreateSiteManagementStepTwoActionsInput {
  askQuestion: AskQuestion;
  assignedByTeam: Map<string, EmployeeRecord[]>;
  assignmentStartDate: string;
  bridge: SiteManagementStepTwoBridge;
  clearDraggingEmployee: () => void;
  configuredTeamCapacities: Map<string, number | undefined>;
  draftSiteId?: string;
  draftSiteName: string;
  ensureSiteReadyForAssignments: () => Promise<string | null>;
  getErrorMessage: (error: unknown) => string;
  handleBackToList: () => void;
  incrementRefreshKey: () => void;
  pendingAssignmentMap: Map<string, PendingSiteAssignmentLike>;
  pendingAssignments: PendingSiteAssignmentLike[];
  setAssigningEmployeeId: (value: string | null) => void;
  setEmployees: (updater: (current: EmployeeRecord[]) => EmployeeRecord[]) => void;
  setIsCompletingSite: (value: boolean) => void;
  setPendingAssignments: (
    updater: (current: PendingSiteAssignmentLike[]) => PendingSiteAssignmentLike[]
  ) => void;
  setStepTwoError: (message: string | null) => void;
  stopDragAutoScroll: () => void;
}

const buildAssignmentInput = (
  employeeId: string,
  siteId: string,
  startDate: string,
  teamLabel: string,
  sortOrder?: number
): EmployeeAssignmentInput => ({
  employeeId,
  shiftGroup: teamLabel,
  siteId,
  sortOrder,
  startDate,
  teamName: teamLabel
});

const buildAssignmentCloseInput = (
  assignmentId: string,
  endDate: string
): EmployeeAssignmentCloseInput => ({
  assignmentId,
  endDate
});

const getResolvedSortOrder = (
  employee: Pick<EmployeeRecord, "currentAssignmentOrder">,
  pendingAssignment?: Pick<PendingSiteAssignmentLike, "sortOrder">
) => {
  if (typeof pendingAssignment?.sortOrder === "number" && Number.isFinite(pendingAssignment.sortOrder)) {
    return pendingAssignment.sortOrder;
  }

  if (
    typeof employee.currentAssignmentOrder === "number" &&
    Number.isFinite(employee.currentAssignmentOrder)
  ) {
    return employee.currentAssignmentOrder;
  }

  return Number.MAX_SAFE_INTEGER;
};

const normalizePendingAssignments = (assignments: PendingSiteAssignmentLike[]) => {
  const byTeam = new Map<string, PendingSiteAssignmentLike[]>();

  assignments.forEach((assignment) => {
    const current = byTeam.get(assignment.teamLabel) ?? [];
    current.push(assignment);
    byTeam.set(assignment.teamLabel, current);
  });

  const normalizedAssignments: PendingSiteAssignmentLike[] = [];

  byTeam.forEach((teamAssignments) => {
    teamAssignments
      .slice()
      .sort((left, right) => {
        const leftSortOrder =
          typeof left.sortOrder === "number" && Number.isFinite(left.sortOrder)
            ? left.sortOrder
            : Number.MAX_SAFE_INTEGER;
        const rightSortOrder =
          typeof right.sortOrder === "number" && Number.isFinite(right.sortOrder)
            ? right.sortOrder
            : Number.MAX_SAFE_INTEGER;

        if (leftSortOrder !== rightSortOrder) {
          return leftSortOrder - rightSortOrder;
        }

        return left.employeeId.localeCompare(right.employeeId, "ko-KR", {
          numeric: true
        });
      })
      .forEach((assignment, index) => {
        normalizedAssignments.push({
          ...assignment,
          sortOrder: index
        });
      });
  });

  return normalizedAssignments;
};

const movePendingAssignment = (
  assignments: PendingSiteAssignmentLike[],
  employeeId: string,
  teamLabel: string,
  direction: AssignmentMoveDirection
) => {
  const normalizedAssignments = normalizePendingAssignments(assignments);
  const teamAssignments = normalizedAssignments
    .filter((assignment) => assignment.teamLabel === teamLabel)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  const currentIndex = teamAssignments.findIndex((assignment) => assignment.employeeId === employeeId);

  if (currentIndex < 0) {
    return normalizedAssignments;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= teamAssignments.length) {
    return normalizedAssignments;
  }

  const reorderedTeamAssignments = teamAssignments.slice();
  const [movedAssignment] = reorderedTeamAssignments.splice(currentIndex, 1);

  reorderedTeamAssignments.splice(targetIndex, 0, movedAssignment!);

  const otherAssignments = normalizedAssignments.filter((assignment) => assignment.teamLabel !== teamLabel);

  return normalizePendingAssignments([
    ...otherAssignments,
    ...reorderedTeamAssignments.map((assignment, index) => ({
      ...assignment,
      sortOrder: index
    }))
  ]);
};

export const createSiteManagementStepTwoActions = (
  input: CreateSiteManagementStepTwoActionsInput
) => {
  const handleCompleteStepTwo = async () => {
    input.setStepTwoError(null);
    input.setIsCompletingSite(true);

    try {
      const targetSiteId = await input.ensureSiteReadyForAssignments();

      if (!targetSiteId) {
        return;
      }

      for (const assignment of input.pendingAssignments) {
        input.setAssigningEmployeeId(assignment.employeeId);

        const result = await input.bridge.saveEmployeeAssignment(
          buildAssignmentInput(
            assignment.employeeId,
            targetSiteId,
            assignment.startDate,
            assignment.teamLabel,
            assignment.sortOrder
          )
        );

        if (!result.ok) {
          input.setStepTwoError(result.message);
          return;
        }
      }

      input.setPendingAssignments(() => []);
      input.incrementRefreshKey();
      await showActionResultDialog(input.askQuestion, {
        title: "배정 저장 완료",
        message: `${input.draftSiteName || "근무지"} 인원 배정을 저장했습니다.`,
        description:
          input.pendingAssignments.length > 0
            ? `반영 인원: ${input.pendingAssignments.length}명`
            : "변경된 배정이 없습니다."
      });
      input.handleBackToList();
    } catch (error) {
      input.setStepTwoError(input.getErrorMessage(error));
    } finally {
      input.setAssigningEmployeeId(null);
      input.setIsCompletingSite(false);
    }
  };

  const handleAssignEmployee = async (employee: EmployeeRecord, targetTeam: string) => {
    const employeeDisplayName = formatEmployeeDisplayName(employee);

    if (!input.assignmentStartDate) {
      input.setStepTwoError("적용 일자를 입력해야 합니다.");
      return;
    }

    const currentDraftTeam =
      input.pendingAssignmentMap.get(employee.id)?.teamLabel ??
      (employee.currentSiteId === input.draftSiteId
        ? normalizeTeamLabel(employee.currentShiftGroup)
        : undefined);

    if (currentDraftTeam === targetTeam) {
      input.clearDraggingEmployee();
      return;
    }

    const maxHeadcount = input.configuredTeamCapacities.get(targetTeam);
    const occupiedCount = (input.assignedByTeam.get(targetTeam) ?? []).filter(
      (assignedEmployee) => assignedEmployee.id !== employee.id
    ).length;

    if (maxHeadcount && occupiedCount >= maxHeadcount) {
      input.setStepTwoError(`${targetTeam} 정원(${maxHeadcount}명)이 이미 가득 차 있습니다.`);
      input.clearDraggingEmployee();
      return;
    }

    input.stopDragAutoScroll();

    const confirmed = await input.askQuestion({
      title: "직원 배정 확인",
      message: `적용 일자가 ${input.assignmentStartDate}가 맞습니까?\n${employeeDisplayName}님을 ${targetTeam}로 배정하시겠습니까?`,
      confirmLabel: "배정",
      confirmVariant: "primary"
    });

    if (!confirmed.confirmed) {
      input.clearDraggingEmployee();
      return;
    }

    if (!input.draftSiteId) {
      input.setPendingAssignments((current) => [
        ...normalizePendingAssignments(
          [
            ...current.filter((item) => item.employeeId !== employee.id),
            {
              employeeId: employee.id,
              sortOrder: (input.assignedByTeam.get(targetTeam) ?? []).filter(
                (assignedEmployee) => assignedEmployee.id !== employee.id
              ).length,
              startDate: input.assignmentStartDate,
              teamLabel: targetTeam
            }
          ]
        )
      ]);
      input.setStepTwoError(null);
      input.clearDraggingEmployee();
      return;
    }

    const targetSiteId = await input.ensureSiteReadyForAssignments();

    if (!targetSiteId) {
      input.clearDraggingEmployee();
      return;
    }

    input.setStepTwoError(null);
    input.setAssigningEmployeeId(employee.id);

    try {
      const result = await input.bridge.saveEmployeeAssignment(
        buildAssignmentInput(
          employee.id,
          targetSiteId,
          input.assignmentStartDate,
          targetTeam,
          (input.assignedByTeam.get(targetTeam) ?? []).filter(
            (assignedEmployee) => assignedEmployee.id !== employee.id
          ).length
        )
      );

      if (!result.ok) {
        input.setStepTwoError(result.message);
        return;
      }

      input.setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                currentAssignmentEndDate: undefined,
                currentAssignmentOrder: (input.assignedByTeam.get(targetTeam) ?? []).filter(
                  (assignedEmployee) => assignedEmployee.id !== employee.id
                ).length,
                currentAssignmentStartDate: input.assignmentStartDate,
                currentShiftGroup: normalizeTeamLabel(targetTeam) ?? targetTeam,
                currentSiteId: targetSiteId,
                currentSiteName: input.draftSiteName.trim() || item.currentSiteName
              }
            : item
        )
      );
      input.incrementRefreshKey();
      await showActionResultDialog(input.askQuestion, {
        title: "직원 배정 완료",
        message: `${employeeDisplayName}님을 ${targetTeam}로 배정했습니다.`,
        description: `적용일: ${input.assignmentStartDate}`
      });
    } catch (error) {
      input.setStepTwoError(input.getErrorMessage(error));
    } finally {
      input.setAssigningEmployeeId(null);
      input.clearDraggingEmployee();
    }
  };

  const handleUnassignEmployee = async (employee: EmployeeRecord) => {
    const employeeDisplayName = formatEmployeeDisplayName(employee);
    const pendingDraftAssignment = input.pendingAssignmentMap.get(employee.id);
    const hasCurrentSiteAssignment = employee.currentSiteId === input.draftSiteId;
    const currentDraftTeam =
      pendingDraftAssignment?.teamLabel ??
      (hasCurrentSiteAssignment ? normalizeTeamLabel(employee.currentShiftGroup) : undefined);
    const currentDraftTeamLabel =
      currentDraftTeam ?? (hasCurrentSiteAssignment ? "미지정 근무조" : undefined);

    if (!pendingDraftAssignment && !hasCurrentSiteAssignment) {
      input.clearDraggingEmployee();
      return;
    }

    if (!input.assignmentStartDate) {
      input.setStepTwoError("적용 일자를 입력해야 합니다.");
      input.clearDraggingEmployee();
      return;
    }

    input.stopDragAutoScroll();

    if (!input.draftSiteId) {
      const confirmed = await input.askQuestion({
        title: "직원 배정 해제 확인",
        message: `해제 일자가 ${input.assignmentStartDate}가 맞습니까?\n${employeeDisplayName}님의 ${currentDraftTeamLabel ?? "현재"} 배정을 해제하시겠습니까?`,
        confirmLabel: "해제",
        confirmVariant: "danger"
      });

      if (!confirmed.confirmed) {
        input.clearDraggingEmployee();
        return;
      }

      input.setPendingAssignments((current) =>
        normalizePendingAssignments(current.filter((item) => item.employeeId !== employee.id))
      );
      input.setStepTwoError(null);
      input.clearDraggingEmployee();
      return;
    }

    input.setAssigningEmployeeId(employee.id);

    try {
      const assignmentsResult = await input.bridge.listEmployeeAssignments(employee.id);

      if (!assignmentsResult.ok) {
        input.setStepTwoError(assignmentsResult.message);
        return;
      }

      const activeAssignment = assignmentsResult.data.find(
        (assignment) => assignment.status === "active" && assignment.siteId === input.draftSiteId
      );

      if (!activeAssignment) {
        input.setStepTwoError("해제할 현재 배정 정보를 찾을 수 없습니다.");
        return;
      }

      const resolvedEndDate =
        input.assignmentStartDate < activeAssignment.startDate
          ? activeAssignment.startDate
          : input.assignmentStartDate;
      const confirmed = await input.askQuestion({
        title: "직원 배정 해제 확인",
        message: `해제 일자가 ${resolvedEndDate}가 맞습니까?\n${employeeDisplayName}님의 ${currentDraftTeamLabel ?? "현재"} 배정을 해제하시겠습니까?`,
        confirmLabel: "해제",
        confirmVariant: "danger"
      });

      if (!confirmed.confirmed) {
        return;
      }

      const closeResult = await input.bridge.closeEmployeeAssignment(
        buildAssignmentCloseInput(activeAssignment.id, resolvedEndDate)
      );

      if (!closeResult.ok) {
        input.setStepTwoError(closeResult.message);
        return;
      }

      input.setStepTwoError(null);
      input.setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                currentAssignmentEndDate: resolvedEndDate,
                currentAssignmentStartDate: undefined,
                currentShiftGroup: undefined,
                currentSiteId: undefined,
                currentSiteName: undefined
              }
            : item
        )
      );
      input.incrementRefreshKey();
      await showActionResultDialog(input.askQuestion, {
        title: "직원 배정 해제 완료",
        message: `${employeeDisplayName}님의 배정을 해제했습니다.`,
        description: `해지일: ${resolvedEndDate}`
      });
    } catch (error) {
      input.setStepTwoError(input.getErrorMessage(error));
    } finally {
      input.setAssigningEmployeeId(null);
      input.clearDraggingEmployee();
    }
  };

  const handleMoveEmployee = async (
    employee: EmployeeRecord,
    teamLabel: string,
    direction: AssignmentMoveDirection
  ) => {
    const employeeDisplayName = formatEmployeeDisplayName(employee);
    const normalizedTeamLabel = normalizeTeamLabel(teamLabel) ?? teamLabel;

    if (!input.draftSiteId) {
      input.setPendingAssignments((current) =>
        movePendingAssignment(current, employee.id, normalizedTeamLabel, direction)
      );
      input.setStepTwoError(null);
      await showActionResultDialog(input.askQuestion, {
        title: "배정 순서 적용 완료",
        message: `${employeeDisplayName}님의 ${normalizedTeamLabel} 순서를 변경했습니다.`
      });
      return;
    }

    input.setAssigningEmployeeId(employee.id);

    try {
      const assignmentsResult = await input.bridge.listEmployeeAssignments(employee.id);

      if (!assignmentsResult.ok) {
        input.setStepTwoError(assignmentsResult.message);
        return;
      }

      const activeAssignment = assignmentsResult.data.find(
        (assignment) =>
          assignment.status === "active" &&
          assignment.siteId === input.draftSiteId &&
          normalizeTeamLabel(assignment.shiftGroup) === normalizedTeamLabel
      );

      if (!activeAssignment) {
        input.setStepTwoError("순서를 변경할 현재 배정 정보를 찾을 수 없습니다.");
        return;
      }

      const reorderResult = await input.bridge.reorderEmployeeAssignment({
        assignmentId: activeAssignment.id,
        direction
      });

      if (!reorderResult.ok) {
        input.setStepTwoError(reorderResult.message);
        return;
      }

      const nextOrderByEmployeeId = new Map(
        reorderResult.data.map((assignment) => [assignment.employeeId, assignment.sortOrder ?? 0])
      );

      input.setEmployees((current) =>
        current.map((item) =>
          item.currentSiteId === input.draftSiteId &&
          normalizeTeamLabel(item.currentShiftGroup) === normalizedTeamLabel
            ? {
                ...item,
                currentAssignmentOrder: nextOrderByEmployeeId.get(item.id) ?? item.currentAssignmentOrder
              }
            : item
        )
      );
      input.incrementRefreshKey();
      input.setStepTwoError(null);
      await showActionResultDialog(input.askQuestion, {
        title: "배정 순서 적용 완료",
        message: `${employeeDisplayName}님의 ${normalizedTeamLabel} 순서를 변경했습니다.`
      });
    } catch (error) {
      input.setStepTwoError(input.getErrorMessage(error));
    } finally {
      input.setAssigningEmployeeId(null);
    }
  };

  return {
    handleAssignEmployee,
    handleCompleteStepTwo,
    handleMoveEmployee,
    handleUnassignEmployee
  };
};
