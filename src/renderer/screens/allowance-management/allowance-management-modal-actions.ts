import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type { AllowanceBridge } from "@shared/bridge/contracts";

import { showActionResultDialog } from "../../components/action-result-dialog";
import type { QuestionDialogOptions, QuestionDialogResult } from "../../components/QuestionDialog";
import type {
  EarlyPayoutEditorState,
  ProposalPreviewModalState
} from "./useAllowanceManagementModalState";

type AskQuestion = (options: QuestionDialogOptions) => Promise<QuestionDialogResult>;

type ModalActionsBridge = Pick<
  AllowanceBridge,
  "approveAllowanceProposal" | "previewAllowanceProposal" | "setCalculationEarlyPayout"
>;

interface CreateAllowanceManagementModalActionsInput {
  askQuestion: AskQuestion;
  bridge: ModalActionsBridge;
  buildBackupCompletionDescription: (input: {
    baseDescription: string;
    warningMessages: string[];
  }) => string;
  closeEarlyPayoutEditor: () => void;
  closeProposalPreview: () => void;
  earlyPayoutEditor: EarlyPayoutEditorState | null;
  formatDateValue: (value?: string) => string;
  getErrorMessage: (error: unknown) => string;
  incrementRefreshKey: () => void;
  openDraftProposalPreview: (input: {
    calculationIds: string[];
    preview: ProposalPreviewModalState["preview"];
  }) => void;
  proposalCandidateResults: AllowanceCalculationResultRecord[];
  proposalComment: string;
  proposalPreviewModal: ProposalPreviewModalState | null;
  setActionError: (message: string | null) => void;
  setActionMessage: (message: string | null) => void;
  setIsProcessing: (value: boolean) => void;
  setProcessingKey: (value: string | null) => void;
  showProposalApprovalFailureDialog: (message: string) => Promise<void>;
}

export const createAllowanceManagementModalActions = (
  input: CreateAllowanceManagementModalActionsInput
) => {
  const handleSaveEarlyPayout = async () => {
    if (!input.earlyPayoutEditor?.value) {
      input.setActionError("선지급 날짜를 선택해 주세요.");
      return;
    }

    const shouldSave = await input.askQuestion({
      title: "선지급 처리 확인",
      message: `${input.earlyPayoutEditor.employeeName} 실적을 ${input.formatDateValue(
        input.earlyPayoutEditor.value
      )} 기준으로 선지급 처리할까요?`,
      confirmLabel: "처리",
      confirmVariant: "primary"
    });

    if (!shouldSave.confirmed) {
      return;
    }

    input.setActionError(null);
    input.setActionMessage(null);
    input.setIsProcessing(true);
    input.setProcessingKey(`early-payout:${input.earlyPayoutEditor.calculationId}`);

    try {
      const result = await input.bridge.setCalculationEarlyPayout({
        calculationId: input.earlyPayoutEditor.calculationId,
        earlyPayoutDate: input.earlyPayoutEditor.value
      });

      if (!result.ok) {
        input.setActionError(result.message);
        return;
      }

      input.setActionMessage(
        `${input.earlyPayoutEditor.employeeName} 실적에 선지급 ${input.formatDateValue(
          input.earlyPayoutEditor.value
        )}을 반영했습니다.`
      );
      input.closeEarlyPayoutEditor();
      input.incrementRefreshKey();
      await showActionResultDialog(input.askQuestion, {
        title: "선지급 처리 완료",
        message: `${input.earlyPayoutEditor.employeeName} 실적에 선지급 ${input.formatDateValue(
          input.earlyPayoutEditor.value
        )}을 반영했습니다.`
      });
    } catch (error) {
      input.setActionError(input.getErrorMessage(error));
    } finally {
      input.setIsProcessing(false);
      input.setProcessingKey(null);
    }
  };

  const handleClearEarlyPayout = async () => {
    if (!input.earlyPayoutEditor) {
      return;
    }

    const shouldClear = await input.askQuestion({
      title: "선지급 취소 확인",
      message: `${input.earlyPayoutEditor.employeeName} 실적의 선지급 설정을 취소할까요?`,
      confirmLabel: "취소",
      confirmVariant: "danger"
    });

    if (!shouldClear.confirmed) {
      return;
    }

    input.setActionError(null);
    input.setActionMessage(null);
    input.setIsProcessing(true);
    input.setProcessingKey(`early-payout:${input.earlyPayoutEditor.calculationId}`);

    try {
      const result = await input.bridge.setCalculationEarlyPayout({
        calculationId: input.earlyPayoutEditor.calculationId,
        earlyPayoutDate: null
      });

      if (!result.ok) {
        input.setActionError(result.message);
        return;
      }

      input.setActionMessage(
        `${input.earlyPayoutEditor.employeeName} 실적의 선지급 상태를 취소했습니다.`
      );
      input.closeEarlyPayoutEditor();
      input.incrementRefreshKey();
      await showActionResultDialog(input.askQuestion, {
        title: "선지급 취소 완료",
        message: `${input.earlyPayoutEditor.employeeName} 실적의 선지급 상태를 취소했습니다.`
      });
    } catch (error) {
      input.setActionError(input.getErrorMessage(error));
    } finally {
      input.setIsProcessing(false);
      input.setProcessingKey(null);
    }
  };

  const handleOpenProposalPreview = async () => {
    if (input.proposalCandidateResults.length === 0) {
      input.setActionError("품의 승인할 승인 상태 수당이 없습니다.");
      return;
    }

    input.setActionError(null);
    input.setActionMessage(null);
    input.setIsProcessing(true);
    input.setProcessingKey("proposal-preview");

    try {
      const result = await input.bridge.previewAllowanceProposal({
        calculationIds: input.proposalCandidateResults.map((item) => item.id)
      });

      if (!result.ok) {
        input.setActionError(result.message);
        return;
      }

      input.openDraftProposalPreview({
        calculationIds: input.proposalCandidateResults.map((item) => item.id),
        preview: result.data
      });
    } catch (error) {
      input.setActionError(input.getErrorMessage(error));
    } finally {
      input.setIsProcessing(false);
      input.setProcessingKey(null);
    }
  };

  const handleApproveProposal = async () => {
    if (!input.proposalPreviewModal || input.proposalPreviewModal.mode !== "draft") {
      return;
    }

    const shouldProceed = await input.askQuestion({
      title: "품의 승인 확인",
      message: `${input.proposalPreviewModal.preview.workMonth} 승인 건 ${input.proposalPreviewModal.preview.calculationCount}건을 품의 승인하고 업무를 마감할까요?`,
      confirmLabel: "품의 승인",
      confirmVariant: "primary"
    });

    if (!shouldProceed.confirmed) {
      return;
    }

    input.setActionError(null);
    input.setActionMessage(null);
    input.setIsProcessing(true);
    input.setProcessingKey("proposal-approve");

    try {
      const result = await input.bridge.approveAllowanceProposal({
        calculationIds: input.proposalPreviewModal.calculationIds,
        comment: input.proposalComment.trim() || undefined,
        outputFormat: "xlsx"
      });

      if (!result.ok) {
        input.setActionError(result.message);
        await input.showProposalApprovalFailureDialog(result.message);
        return;
      }

      input.closeProposalPreview();
      input.incrementRefreshKey();

      await input.askQuestion({
        title: "백업 완료",
        message: "백업 저장이 완료되었습니다.",
        description: input.buildBackupCompletionDescription({
          baseDescription: `${result.data.workMonth} 품의 승인 Excel 문서 출력과 자동 백업을 저장했습니다.`,
          warningMessages: result.data.backupSummary.warningMessages
        }),
        confirmLabel: "확인",
        hideCancel: true
      });

      input.setActionMessage(`${result.data.workMonth} 품의 승인을 완료했습니다.`);
    } catch (error) {
      const message = input.getErrorMessage(error);
      input.setActionError(message);
      await input.showProposalApprovalFailureDialog(message);
    } finally {
      input.setIsProcessing(false);
      input.setProcessingKey(null);
    }
  };

  return {
    handleApproveProposal,
    handleClearEarlyPayout,
    handleOpenProposalPreview,
    handleSaveEarlyPayout
  };
};
