import type { QuestionDialogOptions, QuestionDialogResult } from "../../components/QuestionDialog";

import type {
  LocalFileSelection,
  OperationsBridge,
  SitePatternImportAnalysis,
  WorkforceBridge
} from "@shared/bridge/contracts";
import type { SiteRecord } from "@shared/domain/model";

import { showActionResultDialog } from "../../components/action-result-dialog";
import type { SiteManagementDraftLike } from "./site-management-actions";
import type { SiteViewRow } from "./site-management-selectors";

type AskQuestion = (options: QuestionDialogOptions) => Promise<QuestionDialogResult>;
type SiteView = "list" | "step1" | "step2";
type PatternImportPreviewTab = "analysis" | "groups" | "mismatches" | "data";
type DraftSetter<Draft> = (value: Draft | ((current: Draft) => Draft)) => void;

type SiteManagementInteractionBridge = Pick<
  OperationsBridge,
  "analyzeSitePatternImport" | "selectSpreadsheetFile"
> &
  Pick<WorkforceBridge, "deleteSite">;

interface CreateSiteManagementInteractionActionsInput<Draft extends SiteManagementDraftLike> {
  askQuestion: AskQuestion;
  bridge: SiteManagementInteractionBridge;
  buildDraftFromPatternImportAnalysis: (
    analysis: SitePatternImportAnalysis,
    siteCode: string
  ) => Draft;
  buildDraftFromRow: (row: SiteViewRow) => Draft;
  buildNextAutoSiteCode: (sites: SiteRecord[]) => string;
  createDateInputValue: () => string;
  createInitialDraft: (siteCode?: string) => Draft;
  detailRow: SiteViewRow | null;
  getErrorMessage: (error: unknown) => string;
  incrementRefreshKey: () => void;
  markShouldRestoreListFocus: () => void;
  patternImportAnalysis: SitePatternImportAnalysis | null;
  patternImportFile: LocalFileSelection | null;
  resetRegistrationState: () => void;
  rows: SiteViewRow[];
  setAssignmentStartDate: (value: string) => void;
  setDeleteError: (value: string | null) => void;
  setDetailSiteId: (value: string | null) => void;
  setDetailSnapshot: (value: SiteViewRow | null) => void;
  setDraft: DraftSetter<Draft>;
  setIsAnalyzingPatternImport: (value: boolean) => void;
  setIsDeletingSite: (value: boolean) => void;
  setPatternImportAnalysis: (value: SitePatternImportAnalysis | null) => void;
  setPatternImportCopyStatus: (value: string | null) => void;
  setPatternImportError: (value: string | null) => void;
  setPatternImportFile: (value: LocalFileSelection | null) => void;
  setPatternImportPreviewTab: (value: PatternImportPreviewTab) => void;
  setShowPatternImportModal: (value: boolean) => void;
  setView: (value: SiteView) => void;
  setWorkflowSiteId: (value: string) => void;
  sites: SiteRecord[];
  writeClipboardText: (value: string) => Promise<void>;
}

const resetPatternImportPreview = <Draft extends SiteManagementDraftLike>(
  input: CreateSiteManagementInteractionActionsInput<Draft>
) => {
  input.setPatternImportError(null);
  input.setPatternImportFile(null);
  input.setPatternImportAnalysis(null);
  input.setPatternImportPreviewTab("analysis");
  input.setPatternImportCopyStatus(null);
};

export const createSiteManagementInteractionActions = <
  Draft extends SiteManagementDraftLike
>(
  input: CreateSiteManagementInteractionActionsInput<Draft>
) => {
  const openPatternImportModal = () => {
    resetPatternImportPreview(input);
    input.setShowPatternImportModal(true);
  };

  const handleSelectPatternImportFile = async () => {
    input.setPatternImportError(null);

    try {
      const result = await input.bridge.selectSpreadsheetFile({
        buttonLabel: "가져오기",
        title: "패턴 산출 Excel 파일 선택"
      });

      if (!result.ok) {
        input.setPatternImportError(result.message);
        return;
      }

      input.setPatternImportFile(result.data);
      input.setPatternImportAnalysis(null);
      input.setPatternImportPreviewTab("analysis");
      input.setPatternImportCopyStatus(null);
    } catch (error) {
      input.setPatternImportError(input.getErrorMessage(error));
    }
  };

  const handleAnalyzePatternImport = async () => {
    if (!input.patternImportFile) {
      input.setPatternImportError("패턴 산출 Excel 파일을 먼저 가져와야 합니다.");
      return;
    }

    input.setPatternImportError(null);
    input.setIsAnalyzingPatternImport(true);

    try {
      const result = await input.bridge.analyzeSitePatternImport({
        filePath: input.patternImportFile.filePath
      });

      if (!result.ok) {
        input.setPatternImportError(result.message);
        return;
      }

      input.setPatternImportAnalysis(result.data);
    } catch (error) {
      input.setPatternImportError(input.getErrorMessage(error));
    } finally {
      input.setIsAnalyzingPatternImport(false);
    }
  };

  const handleCopyPatternImportAnalysisReport = async () => {
    if (!input.patternImportAnalysis) {
      return;
    }

    try {
      await input.writeClipboardText(input.patternImportAnalysis.analysisReport);
      input.setPatternImportCopyStatus("분석 결과 텍스트를 클립보드에 복사했습니다.");
    } catch {
      input.setPatternImportCopyStatus("클립보드 복사에 실패했습니다.");
    }
  };

  const handleApplyPatternImportToDraft = async () => {
    if (!input.patternImportAnalysis) {
      return;
    }

    const siteCode = input.buildNextAutoSiteCode(input.sites);

    input.resetRegistrationState();
    input.setDraft(input.buildDraftFromPatternImportAnalysis(input.patternImportAnalysis, siteCode));
    input.setAssignmentStartDate(
      input.patternImportAnalysis.suggestion.cycles[0]?.patternStartDate ??
        input.createDateInputValue()
    );
    input.setPatternImportError(null);
    input.setShowPatternImportModal(false);
    input.setView("step1");
    await showActionResultDialog(input.askQuestion, {
      title: "패턴 분석 반영 완료",
      message: "분석 결과를 근무지 등록/수정 1단계 초안에 반영했습니다."
    });
  };

  const openRegistration = (siteId?: string) => {
    input.resetRegistrationState();

    if (!siteId) {
      input.setDraft(input.createInitialDraft(input.buildNextAutoSiteCode(input.sites)));
      input.setAssignmentStartDate(input.createDateInputValue());
      input.setView("step1");
      return;
    }

    const targetRow = input.rows.find((row) => row.site.id === siteId);

    if (!targetRow) {
      return;
    }

    input.setWorkflowSiteId(targetRow.site.id);
    input.setDraft(input.buildDraftFromRow(targetRow));
    input.setAssignmentStartDate(
      targetRow.pattern?.patternStartDate ?? input.createDateInputValue()
    );
    input.setView("step1");
  };

  const openRegistrationFromDetail = () => {
    if (!input.detailRow) {
      return;
    }

    input.resetRegistrationState();
    input.setWorkflowSiteId(input.detailRow.site.id);
    input.setDraft(input.buildDraftFromRow(input.detailRow));
    input.setAssignmentStartDate(
      input.detailRow.pattern?.patternStartDate ?? input.createDateInputValue()
    );
    input.setView("step1");
  };

  const openDetailModal = (row: SiteViewRow) => {
    input.setWorkflowSiteId(row.site.id);
    input.setDetailSiteId(row.site.id);
    input.setDetailSnapshot(row);
  };

  const closeDetailModal = () => {
    input.setDetailSiteId(null);
    input.setDetailSnapshot(null);
    input.setDeleteError(null);
  };

  const handleDeleteSite = async () => {
    if (!input.detailRow) {
      return;
    }

    input.setDeleteError(null);
    input.setIsDeletingSite(true);

    try {
      const result = await input.bridge.deleteSite({
        siteId: input.detailRow.site.id
      });

      if (!result.ok) {
        input.setDeleteError(result.message);
        return;
      }

      input.markShouldRestoreListFocus();
      input.setWorkflowSiteId("");
      input.setDetailSiteId(null);
      input.setDetailSnapshot(null);
      input.incrementRefreshKey();
      await showActionResultDialog(input.askQuestion, {
        title: "근무지 삭제 완료",
        message: `${input.detailRow.site.name} 근무지를 삭제했습니다.`
      });
    } catch (error) {
      input.setDeleteError(input.getErrorMessage(error));
    } finally {
      input.setIsDeletingSite(false);
    }
  };

  const handleRequestDeleteSite = async () => {
    if (!input.detailRow) {
      return;
    }

    input.setDeleteError(null);

    const confirmed = await input.askQuestion({
      confirmLabel: "삭제",
      confirmVariant: "danger",
      description: `${input.detailRow.site.name}\n이미 실적에 반영된 데이터와 이력은 보존되고, 근무지 목록에서만 제거됩니다.`,
      message: "근무지 삭제를 할 경우 영구 삭제됩니다. 괜찮으시겠습니까?",
      title: "근무지 삭제 확인"
    });

    if (!confirmed.confirmed) {
      return;
    }

    await handleDeleteSite();
  };

  return {
    closeDetailModal,
    handleAnalyzePatternImport,
    handleApplyPatternImportToDraft,
    handleCopyPatternImportAnalysisReport,
    handleRequestDeleteSite,
    handleSelectPatternImportFile,
    openDetailModal,
    openPatternImportModal,
    openRegistration,
    openRegistrationFromDetail
  };
};
