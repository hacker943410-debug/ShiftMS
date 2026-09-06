import {
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction
} from "react";

import type { SiteView } from "./useSiteManagementStepState";

interface UseSiteManagementRegistrationFlowInput<DetailRow, PendingAssignment> {
  clearDraggingEmployee: () => void;
  // Drops a pending team-work-type notice that no completion dialog took, so a stale notice
  // cannot resurface on a later site's dialog.
  clearPatternSaveNotice?: () => void;
  resetRegistrationViewState: () => void;
  setDeleteError: Dispatch<SetStateAction<string | null>>;
  setDetailSiteId: Dispatch<SetStateAction<string | null>>;
  setDetailSnapshot: Dispatch<SetStateAction<DetailRow | null>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setIsTeamCapacityDirty: Dispatch<SetStateAction<boolean>>;
  setPendingAssignments: Dispatch<SetStateAction<PendingAssignment[]>>;
  setStepTwoError: Dispatch<SetStateAction<string | null>>;
  setView: Dispatch<SetStateAction<SiteView>>;
  view: SiteView;
}

export const useSiteManagementRegistrationFlow = <DetailRow, PendingAssignment>(
  input: UseSiteManagementRegistrationFlowInput<DetailRow, PendingAssignment>
) => {
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shouldRestoreListFocusRef = useRef(false);

  const markShouldRestoreListFocus = () => {
    shouldRestoreListFocusRef.current = true;
  };

  const handleBackToList = () => {
    input.clearPatternSaveNotice?.();
    markShouldRestoreListFocus();
    input.setDetailSiteId(null);
    input.setDetailSnapshot(null);
    input.setView("list");
  };

  const resetRegistrationState = () => {
    // Defensive: today every wizard entry point reaches the list through handleBackToList first,
    // so this clear is a spare gate rather than the primary one.
    input.clearPatternSaveNotice?.();
    input.setDetailSiteId(null);
    input.setDetailSnapshot(null);
    input.setFormError(null);
    input.setStepTwoError(null);
    input.setDeleteError(null);
    input.clearDraggingEmployee();
    input.setIsTeamCapacityDirty(false);
    input.setPendingAssignments([]);
    input.resetRegistrationViewState();
  };

  useLayoutEffect(() => {
    if (input.view !== "list" || !shouldRestoreListFocusRef.current) {
      return;
    }

    shouldRestoreListFocusRef.current = false;
    const frame = requestAnimationFrame(() => {
      listHeadingRef.current?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [input.view]);

  return {
    handleBackToList,
    listHeadingRef,
    markShouldRestoreListFocus,
    resetRegistrationState
  };
};
