import type { SiteManagementDraftLike } from "./site-management-actions";

type SiteView = "list" | "step1" | "step2";
type DraftSetter<Draft> = (value: Draft | ((current: Draft) => Draft)) => void;

interface CreateSiteManagementStepOneActionsInput<
  Draft extends SiteManagementDraftLike,
  PresetRow
> {
  buildDraftFromRow: (row: PresetRow) => Draft;
  closePatternPresetModal: () => void;
  createDateInputValue: () => string;
  draftSiteId?: string;
  getPatternStartDate: (row: PresetRow) => string | undefined;
  persistDraft: () => Promise<boolean>;
  selectedPatternPresetRow: PresetRow | null;
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

  const handleReviewOrSave = () => {
    if (input.draftSiteId) {
      void input.persistDraft();
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
