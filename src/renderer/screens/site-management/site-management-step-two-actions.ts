import type { QuestionDialogOptions, QuestionDialogResult } from "../../components/QuestionDialog";

import type { EmployeeAssignmentCloseInput, EmployeeAssignmentInput, WorkforceBridge } from "@shared/bridge/contracts";
import type { EmployeeRecord } from "@shared/domain/model";
import type { PendingSiteAssignmentLike } from "./site-management-selectors";
import { normalizeTeamLabel } from "../../../shared/domain/team-label";
import { showActionResultDialog } from "../../components/action-result-dialog";

type AskQuestion = (options: QuestionDialogOptions) => Promise<QuestionDialogResult>;

type SiteManagementStepTwoBridge = Pick<
  WorkforceBridge,
  "closeEmployeeAssignment" | "listEmployeeAssignments" | "saveEmployeeAssignment"
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
  teamLabel: string
): EmployeeAssignmentInput => ({
  employeeId,
  shiftGroup: teamLabel,
  siteId,
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
            assignment.teamLabel
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
      message: `적용 일자가 ${input.assignmentStartDate}가 맞습니까?\n${employee.name}님을 ${targetTeam}로 배정하시겠습니까?`,
      confirmLabel: "배정",
      confirmVariant: "primary"
    });

    if (!confirmed.confirmed) {
      input.clearDraggingEmployee();
      return;
    }

    if (!input.draftSiteId) {
      input.setPendingAssignments((current) => [
        ...current.filter((item) => item.employeeId !== employee.id),
        { employeeId: employee.id, startDate: input.assignmentStartDate, teamLabel: targetTeam }
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
        buildAssignmentInput(employee.id, targetSiteId, input.assignmentStartDate, targetTeam)
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
        message: `${employee.name}님을 ${targetTeam}로 배정했습니다.`,
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
        message: `해제 일자가 ${input.assignmentStartDate}가 맞습니까?\n${employee.name}님의 ${currentDraftTeamLabel ?? "현재"} 배정을 해제하시겠습니까?`,
        confirmLabel: "해제",
        confirmVariant: "danger"
      });

      if (!confirmed.confirmed) {
        input.clearDraggingEmployee();
        return;
      }

      input.setPendingAssignments((current) => current.filter((item) => item.employeeId !== employee.id));
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
        message: `해제 일자가 ${resolvedEndDate}가 맞습니까?\n${employee.name}님의 ${currentDraftTeamLabel ?? "현재"} 배정을 해제하시겠습니까?`,
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
        message: `${employee.name}님의 배정을 해제했습니다.`,
        description: `해지일: ${resolvedEndDate}`
      });
    } catch (error) {
      input.setStepTwoError(input.getErrorMessage(error));
    } finally {
      input.setAssigningEmployeeId(null);
      input.clearDraggingEmployee();
    }
  };

  return {
    handleAssignEmployee,
    handleCompleteStepTwo,
    handleUnassignEmployee
  };
};
