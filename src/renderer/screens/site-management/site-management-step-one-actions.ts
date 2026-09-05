import type { SiteManagementDraftLike } from "./site-management-actions";

type SiteView = "list" | "step1" | "step2";
type DraftSetter<Draft> = (value: Draft | ((current: Draft) => Draft)) => void;

interface CreateSiteManagementStepOneActionsInput<
  Draft extends SiteManagementDraftLike,
  PresetRow
> {
  askQuestion: (options: {
    confirmLabel?: string;
    hideCancel?: boolean;
    message: string;
    title: string;
  }) => Promise<{ confirmed: boolean }>;
  buildDraftFromRow: (row: PresetRow) => Draft;
  closePatternPresetModal: () => void;
  createDateInputValue: () => string;
  draftSiteId?: string;
  getPatternStartDate: (row: PresetRow) => string | undefined;
  persistDraft: () => Promise<boolean>;
  selectedPatternPresetRow: PresetRow | null;
  // The notice a save that changed a team's work type left behind, taken once for the dialog.
  takePatternSaveNotice?: () => string | undefined;
  setAssignmentStartDate: (value: string) => void;
  setDraft: DraftSetter<Draft>;
  setFormError: (value: string | null) => void;
  setView: (value: SiteView) => void;
  validateDraftForm: () => boolean;
}

export const createSiteManagementStepOneActions = <
  Draft extends SiteManagementDraftLike,
  PresetRow
>(
  input: CreateSiteManagementStepOneActionsInput<Draft, PresetRow>
) => {
  const applyPatternPreset = () => {
    if (!input.selectedPatternPresetRow) {
      return;
    }

    const sourceDraft = input.buildDraftFromRow(input.selectedPatternPresetRow);

    input.setDraft((current) => ({
      ...sourceDraft,
      customerName: current.customerName,
      name: current.name,
      patternId: current.patternId,
      siteCode: current.siteCode,
      siteId: current.siteId,
      status: current.status
    }));
    input.setAssignmentStartDate(
      input.getPatternStartDate(input.selectedPatternPresetRow) ?? input.createDateInputValue()
    );
    input.setFormError(null);
    input.closePatternPresetModal();
  };

  const handleGoNext = async () => {
    if (!input.draftSiteId) {
      if (input.validateDraftForm()) {
        input.setView("step2");
      }

      return;
    }

    const saved = await input.persistDraft();

    if (saved) {
      input.setView("step2");
    }
  };

  const handleReviewOrSave = async () => {
    if (input.draftSiteId) {
      const saved = await input.persistDraft();

      if (saved) {
        const notice = input.takePatternSaveNotice?.();

        await input.askQuestion({
          confirmLabel: "확인",
          hideCancel: true,
          message: notice ? `1단계 설정이 적용되었습니다.\n${notice}` : "1단계 설정이 적용되었습니다.",
          title: "적용 완료"
        });
      }

      return;
    }

    input.validateDraftForm();
  };

  return {
    applyPatternPreset,
    handleGoNext,
    handleReviewOrSave
  };
};
