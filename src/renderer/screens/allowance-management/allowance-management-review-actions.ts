import type { ReactNode } from "react";

import type { AllowanceDocumentExportRecord } from "@shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "@shared/domain/allowance-service";
import type { AllowanceApprovalRecord } from "@shared/domain/allowance-workflow";
import type { AllowanceBridge, PerformanceBridge } from "@shared/bridge/contracts";

import { showActionResultDialog } from "../../components/action-result-dialog";
import type { QuestionDialogOptions, QuestionDialogResult } from "../../components/QuestionDialog";
import type { GuidanceConfig } from "../../contexts/app-workflow-context";

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
  showGuidance?: (config: GuidanceConfig) => void;
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

          // The matching performance file is not actually sitting in 승인완료 right now (it was sent
          // back to 승인대기, or the workbook was moved). 근무지 반려 only rewinds a 승인완료 file, so
          // pressing on here does nothing useful and can leave the records tangled. Guide the operator
          // to fix the real cause instead of silently letting them "proceed anyway".
          if (input.showGuidance) {
            input.showGuidance({
              title: "지금은 근무지 반려를 할 수 없습니다",
              why: "이 근무지 실적이 지금 '승인완료' 상태로 보관돼 있지 않습니다. (승인대기로 돌아갔거나 실적 파일이 옮겨졌습니다.) '근무지 반려'는 승인완료된 실적을 되돌리는 기능이라, 이 상태에서 진행하면 아무 변화가 없거나 기록이 더 꼬일 수 있습니다.",
              steps: [
                {
                  title: "실적 관리 화면 열기",
                  description: "왼쪽 메뉴의 '실적 관리'로 이동해 이 근무지·해당 월의 현재 상태를 확인하세요."
                },
                {
                  title: "'승인완료'에 있는지 확인",
                  description: "해당 월을 '승인완료'로 조회해 이 근무지 실적이 실제로 승인완료로 보관돼 있는지 확인하세요. 보이지 않으면 아직 승인완료가 아닙니다."
                },
                {
                  title: "승인대기에 있으면 먼저 마무리",
                  description: "실적이 '승인대기'에 있다면 거기서 먼저 승인(또는 재승인)으로 마무리한 뒤, 다시 수당 관리로 돌아와 근무지 반려를 진행하세요."
                }
              ],
              notes: [
                "※ 실적 파일을 탐색기(파일 관리자)로 직접 옮기지 마세요. 모든 이동은 앱 안에서만 하셔야 기록이 꼬이지 않습니다."
              ],
              navigation: { label: "실적 관리로 이동", route: "performance" }
            });
            input.focusOverviewKeywordInput();
            return;
          }

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
        await input.askQuestion({
          title: "문서 출력 실패",
          message: `${input.formatDocumentOutputFormatLabel(outputFormat)} 문서 출력에 실패했습니다.`,
          description: result.message,
          confirmLabel: "확인",
          hideCancel: true
        });
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
      const errorMessage = input.getErrorMessage(error);
      input.setActionError(errorMessage);
      await input.askQuestion({
        title: "문서 출력 실패",
        message: `${input.formatDocumentOutputFormatLabel(outputFormat)} 문서 출력에 실패했습니다.`,
        description: errorMessage,
        confirmLabel: "확인",
        hideCancel: true
      });
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
