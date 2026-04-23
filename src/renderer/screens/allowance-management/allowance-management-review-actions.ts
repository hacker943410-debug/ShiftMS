import type { ReactNode } from "react";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type { AllowanceApprovalRecord } from "@shared/domain/allowance-workflow";
import type { AllowanceBridge, PerformanceBridge } from "@shared/bridge/contracts";

import { showActionResultDialog } from "../../components/action-result-dialog";
import type { QuestionDialogOptions, QuestionDialogResult } from "../../components/QuestionDialog";

type AskQuestion = (options: QuestionDialogOptions) => Promise<QuestionDialogResult>;

type ReviewActionsBridge = Pick<
  AllowanceBridge,
  "exportAllowanceDocuments" | "reviewAllowanceCalculations"
> &
  Pick<PerformanceBridge, "listPerformanceOverview">;

export interface AllowanceReviewActionRequest {
  calculationIds: string[];
  decision: AllowanceApprovalRecord["decision"];
  scopeLabel: string;
  syncPerformanceSiteReject?: boolean;
}

interface AllowanceReviewRequest extends AllowanceReviewActionRequest {
  comment?: string;
  skipApprovedFileCheck?: boolean;
}

interface CreateAllowanceManagementReviewActionsInput {
  askQuestion: AskQuestion;
  bridge: ReviewActionsBridge;
  buildDocumentExportCompletionDescription: (record: AllowanceDocumentExportRecord) => ReactNode;
  exportableResults: AllowanceCalculationResultRecord[];
  focusOverviewKeywordInput: () => void;
  formatDocumentOutputFormatLabel: (
    outputFormat: AllowanceDocumentExportRecord["outputFormat"]
  ) => string;
  getErrorMessage: (error: unknown) => string;
  incrementRefreshKey: () => void;
  results: AllowanceCalculationResultRecord[];
  setActionError: (message: string | null) => void;
  setActionMessage: (message: string | null) => void;
  setIsProcessing: (value: boolean) => void;
  setProcessingKey: (value: string | null) => void;
}

export const createAllowanceManagementReviewActions = (
  input: CreateAllowanceManagementReviewActionsInput
) => {
  const checkApprovedPerformanceFileExistsForSiteReject = async (calculationIds: string[]) => {
    const targetResults = input.results.filter((result) => calculationIds.includes(result.id));
    const fileIds = [...new Set(targetResults.map((result) => result.fileId).filter(Boolean))];
    const scheduleMonths = [
      ...new Set(targetResults.map((result) => result.workDate.slice(0, 7)).filter(Boolean))
    ];

    if (fileIds.length === 0 || scheduleMonths.length === 0) {
      return "missing" as const;
    }

    const approvedFileIds = new Set<string>();

    for (const scheduleMonth of scheduleMonths) {
      const overviewResult = await input.bridge.listPerformanceOverview({
        approvalScope: "approved",
        scheduleMonth
      });

      if (!overviewResult.ok) {
        input.setActionError(overviewResult.message);
        return "error" as const;
      }

      overviewResult.data.groups.forEach((group) => {
        group.rows.forEach((row) => {
          if (
            fileIds.includes(row.fileId) &&
            row.sourceDirectoryType === "approved" &&
            row.sourceFileExists
          ) {
            approvedFileIds.add(row.fileId);
          }
        });
      });
    }

    if (fileIds.every((fileId) => approvedFileIds.has(fileId))) {
      return "found" as const;
    }

    return "missing" as const;
  };

  const executeReviewCalculations = async (reviewRequest: AllowanceReviewRequest) => {
    input.setActionError(null);
    input.setActionMessage(null);
    input.setIsProcessing(true);
    const reviewProcessingKey = `review:${reviewRequest.decision}:${reviewRequest.calculationIds[0]}`;
    input.setProcessingKey(reviewProcessingKey);

    try {
      if (
        reviewRequest.decision === "rejected" &&
        reviewRequest.syncPerformanceSiteReject &&
        !reviewRequest.skipApprovedFileCheck
      ) {
        input.setActionMessage("승인완료 실적 파일을 확인하는 중입니다.");

        const approvedFileState = await checkApprovedPerformanceFileExistsForSiteReject(
          reviewRequest.calculationIds
        );

        if (approvedFileState === "error") {
          input.setActionMessage(null);
          return;
        }

        if (approvedFileState === "missing") {
          input.setActionMessage(null);
          input.setIsProcessing(false);
          input.setProcessingKey(null);

          const shouldContinue = await input.askQuestion({
            title: "승인완료 파일 없음",
            message: "현재 승인완료 폴더에 해당 실적 파일이 없습니다.",
            description: "그래도 근무지 반려와 재승인 표시를 계속 진행하시겠습니까?",
            confirmLabel: "계속 진행",
            confirmVariant: "danger"
          });

          if (!shouldContinue.confirmed) {
            input.focusOverviewKeywordInput();
            return;
          }

          input.setActionError(null);
          input.setActionMessage(null);
          input.setIsProcessing(true);
          input.setProcessingKey(reviewProcessingKey);
        }
      }

      input.setActionMessage(null);

      const result = await input.bridge.reviewAllowanceCalculations({
        calculationIds: reviewRequest.calculationIds,
        decision: reviewRequest.decision,
        comment: reviewRequest.comment,
        syncPerformanceSiteReject: reviewRequest.syncPerformanceSiteReject
      });

      if (!result.ok) {
        input.setActionError(result.message);
        return;
      }

      input.setActionMessage(
        `${reviewRequest.scopeLabel} ${
          reviewRequest.decision === "approved" ? "승인" : "반려"
        } ${result.data.length}건을 반영했습니다.`
      );
      input.incrementRefreshKey();
      await showActionResultDialog(input.askQuestion, {
        title: reviewRequest.decision === "approved" ? "수당 승인 완료" : "수당 반려 완료",
        message: `${reviewRequest.scopeLabel} ${
          reviewRequest.decision === "approved" ? "승인" : "반려"
        } ${result.data.length}건을 반영했습니다.`
      });
    } catch (error) {
      input.setActionMessage(null);
      input.setActionError(input.getErrorMessage(error));
    } finally {
      input.setIsProcessing(false);
      input.setProcessingKey(null);
    }
  };

  const handleReviewCalculations = async (reviewInput: AllowanceReviewActionRequest) => {
    const calculationIds = [...new Set(reviewInput.calculationIds)];

    if (calculationIds.length === 0) {
      input.setActionError(
        reviewInput.decision === "approved"
          ? "승인할 수당 산출 결과가 없습니다."
          : "반려할 수당 산출 결과가 없습니다."
      );
      return;
    }

    let comment: string | undefined;

    if (reviewInput.decision === "rejected") {
      if (reviewInput.syncPerformanceSiteReject) {
        const reasonResult = await input.askQuestion({
          title: "근무지 반려 사유 입력",
          message: "근무지 반려 사유를 입력해 주세요.",
          description: "입력한 사유는 수당 반려 이력과 실적 재승인 사유로 함께 남습니다.",
          confirmLabel: "다음",
          confirmVariant: "danger",
          input: {
            label: "근무지 반려 사유",
            multiline: true,
            placeholder: "근무지 반려 사유를 입력해 주세요."
          }
        });

        if (!reasonResult.confirmed) {
          input.focusOverviewKeywordInput();
          return;
        }

        comment = reasonResult.inputValue?.trim() || undefined;

        if (!comment) {
          input.setActionError("근무지 반려 사유를 입력해 주세요.");
          input.focusOverviewKeywordInput();
          return;
        }
      } else {
        const reasonResult = await input.askQuestion({
          title: "반려 사유 입력",
          message: "반려 사유를 입력해 주세요. 비워두면 사유 없이 저장합니다.",
          confirmLabel: "반려",
          confirmVariant: "danger",
          input: {
            label: "반려 사유",
            multiline: true,
            placeholder: "반려 사유를 입력해 주세요."
          }
        });

        if (!reasonResult.confirmed) {
          return;
        }

        comment = reasonResult.inputValue?.trim() || undefined;
      }
    }

    const confirmation = await input.askQuestion({
      title: reviewInput.decision === "approved" ? "근무지 승인 확인" : "근무지 반려 확인",
      message: `${reviewInput.scopeLabel} ${calculationIds.length}건을 ${
        reviewInput.decision === "approved" ? "승인" : "반려"
      }할까요?`,
      description: reviewInput.syncPerformanceSiteReject
        ? "근무지 수당을 반려하고 실적 재승인 흐름으로 되돌립니다."
        : undefined,
      confirmLabel: reviewInput.decision === "approved" ? "승인" : "반려",
      confirmVariant: reviewInput.decision === "approved" ? "primary" : "danger"
    });

    if (!confirmation.confirmed) {
      if (reviewInput.syncPerformanceSiteReject) {
        input.focusOverviewKeywordInput();
      }
      return;
    }

    await executeReviewCalculations({
      calculationIds,
      decision: reviewInput.decision,
      comment,
      scopeLabel: reviewInput.scopeLabel,
      syncPerformanceSiteReject: reviewInput.syncPerformanceSiteReject
    });
  };

  const handleExportDocuments = async (
    outputFormat: AllowanceDocumentExportRecord["outputFormat"]
  ) => {
    if (input.exportableResults.length === 0) {
      input.setActionError("출력할 승인 상태 수당이 없습니다.");
      return;
    }

    input.setActionError(null);
    input.setActionMessage(null);
    input.setIsProcessing(true);
    input.setProcessingKey(`export:${outputFormat}`);

    try {
      const result = await input.bridge.exportAllowanceDocuments({
        calculationIds: input.exportableResults.map((item) => item.id),
        outputFormat
      });

      if (!result.ok) {
        input.setActionError(result.message);
        return;
      }

      await input.askQuestion({
        title: "문서 출력 완료",
        message: `${result.data.workMonth} ${input.formatDocumentOutputFormatLabel(
          result.data.outputFormat
        )} 문서 출력이 완료되었습니다.`,
        description: input.buildDocumentExportCompletionDescription(result.data),
        confirmLabel: "확인",
        hideCancel: true
      });

      input.setActionMessage(
        `${result.data.workMonth} ${
          input.formatDocumentOutputFormatLabel(outputFormat)
        } 문서 출력이 완료되었습니다. 품의서/별첨1/별첨2 지정 경로에 저장했습니다.`
      );
      input.incrementRefreshKey();
    } catch (error) {
      input.setActionError(input.getErrorMessage(error));
    } finally {
      input.setIsProcessing(false);
      input.setProcessingKey(null);
    }
  };

  return {
    handleExportDocuments,
    handleReviewCalculations
  };
};
