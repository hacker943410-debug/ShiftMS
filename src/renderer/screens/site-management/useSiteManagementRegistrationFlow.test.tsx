// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSiteManagementStepState } from "./useSiteManagementStepState";
import { useSiteManagementRegistrationFlow } from "./useSiteManagementRegistrationFlow";

interface DetailSnapshot {
  siteId: string;
}

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
let latestState:
  | (ReturnType<typeof useSiteManagementStepState> &
      ReturnType<typeof useSiteManagementRegistrationFlow<DetailSnapshot, string>> & {
        clearDraggingEmployeeCalls: number;
        deleteError: string | null;
        detailSiteId: string | null;
        detailSnapshot: DetailSnapshot | null;
        formError: string | null;
        isTeamCapacityDirty: boolean;
        pendingAssignments: string[];
        setDeleteError: (value: string | null) => void;
        setDetailSiteId: (value: string | null) => void;
        setDetailSnapshot: (value: DetailSnapshot | null) => void;
        setFormError: (value: string | null) => void;
        setIsTeamCapacityDirty: (value: boolean) => void;
        setPatternSaveNotice: (notice: string) => void;
        setPendingAssignments: (value: string[]) => void;
        setStepTwoError: (value: string | null) => void;
        stepTwoError: string | null;
        takePatternSaveNotice: () => string | undefined;
      })
  | null = null;

const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const cancelAnimationFrameSpy = vi.fn();
const requestAnimationFrameSpy = vi.fn<(callback: FrameRequestCallback) => number>();
const focusSpy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HookHarness = () => {
  const stepState = useSiteManagementStepState(() => "2026-04-20");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<DetailSnapshot | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isTeamCapacityDirty, setIsTeamCapacityDirty] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<string[]>([]);
  const [stepTwoError, setStepTwoError] = useState<string | null>(null);
  const clearDraggingEmployeeCallsRef = useRef(0);
  // Mirrors the screen's own notice ref so the harness can prove the leak is closed.
  const patternSaveNoticeRef = useRef<string | null>(null);
  const registrationFlow = useSiteManagementRegistrationFlow<DetailSnapshot, string>({
    clearDraggingEmployee: () => {
      clearDraggingEmployeeCallsRef.current += 1;
    },
    clearPatternSaveNotice: () => {
      patternSaveNoticeRef.current = null;
    },
    resetRegistrationViewState: stepState.resetRegistrationViewState,
    setDeleteError,
    setDetailSiteId,
    setDetailSnapshot,
    setFormError,
    setIsTeamCapacityDirty,
    setPendingAssignments,
    setStepTwoError,
    setView: stepState.setView,
    view: stepState.view
  });

  latestState = {
    ...stepState,
    ...registrationFlow,
    clearDraggingEmployeeCalls: clearDraggingEmployeeCallsRef.current,
    deleteError,
    detailSiteId,
    detailSnapshot,
    formError,
    isTeamCapacityDirty,
    pendingAssignments,
    setDeleteError,
    setDetailSiteId,
    setDetailSnapshot,
    setFormError,
    setIsTeamCapacityDirty,
    setPatternSaveNotice: (notice: string) => {
      patternSaveNoticeRef.current = notice;
    },
    setPendingAssignments,
    setStepTwoError,
    stepTwoError,
    takePatternSaveNotice: () => {
      const notice = patternSaveNoticeRef.current;

      patternSaveNoticeRef.current = null;
      return notice ?? undefined;
    }
  };

  return <h1 ref={registrationFlow.listHeadingRef}>근무지 목록</h1>;
};

const renderHookHarness = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<HookHarness />);
  });

  if (!latestState) {
    throw new Error("registration flow hook did not initialize");
  }

  return latestState;
};

beforeEach(() => {
  requestAnimationFrameSpy.mockImplementation((callback) => {
    callback(0);
    return 17;
  });
  window.requestAnimationFrame = requestAnimationFrameSpy;
  window.cancelAnimationFrame = cancelAnimationFrameSpy;
});

afterEach(async () => {
  latestState = null;
  requestAnimationFrameSpy.mockReset();
  cancelAnimationFrameSpy.mockReset();
  focusSpy.mockClear();
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;

  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();

    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
  }

  mountedContainers.splice(0).forEach((container) => {
    container.remove();
  });
});

describe("useSiteManagementRegistrationFlow", () => {
  it("should reset registration-local errors, pending assignments, and step view state", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setAssignmentStartDate("2026-04-25");
      state.setDraggingTeamLabel("A조");
      state.setSelectedPatternPresetSiteId("site-7");
      state.setSimulationMonthIndex(2);
      state.setShowPatternPresetModal(true);
      state.setPoolKeyword("홍길동");
      state.setPoolScope("other-site");
      state.setView("step2");
    });

    await act(async () => {
      latestState?.setDeleteError("삭제 오류");
      latestState?.setDetailSiteId("site-1");
      latestState?.setDetailSnapshot({ siteId: "site-1" });
      latestState?.setFormError("입력 오류");
      latestState?.setIsTeamCapacityDirty(true);
      latestState?.setPendingAssignments(["emp-1", "emp-2"]);
      latestState?.setStepTwoError("배정 오류");
    });

    await act(async () => {
      latestState?.resetRegistrationState();
    });

    expect(latestState).toMatchObject({
      assignmentStartDate: "2026-04-25",
      deleteError: null,
      detailSiteId: null,
      detailSnapshot: null,
      draggingTeamLabel: null,
      formError: null,
      isTeamCapacityDirty: false,
      pendingAssignments: [],
      poolKeyword: "홍길동",
      poolScope: "other-site",
      selectedPatternPresetSiteId: "",
      showPatternPresetModal: false,
      simulationMonthIndex: 0,
      stepTwoError: null,
      view: "step2"
    });
    expect(latestState?.clearDraggingEmployeeCalls).toBe(1);
  });

  it("should return to list view and restore focus to the list heading", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setView("step1");
      state.setDetailSiteId("site-3");
      state.setDetailSnapshot({ siteId: "site-3" });
    });

    await act(async () => {
      latestState?.handleBackToList();
    });

    expect(latestState).toMatchObject({
      detailSiteId: null,
      detailSnapshot: null,
      view: "list"
    });
    expect(requestAnimationFrameSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  it("should let a completion dialog take the pending team work type notice only once", async () => {
    const state = await renderHookHarness();

    state.setPatternSaveNotice("조 근무유형이 바뀌었습니다.");

    expect(state.takePatternSaveNotice()).toBe("조 근무유형이 바뀌었습니다.");
    expect(state.takePatternSaveNotice()).toBeUndefined();
  });

  it("should drop a leftover team work type notice when the registration wizard is reopened", async () => {
    const state = await renderHookHarness();

    state.setPatternSaveNotice("조 근무유형이 바뀌었습니다.");

    await act(async () => {
      latestState?.resetRegistrationState();
    });

    expect(state.takePatternSaveNotice()).toBeUndefined();
  });

  it("should drop a leftover team work type notice when returning to the list", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setView("step1");
    });

    state.setPatternSaveNotice("조 근무유형이 바뀌었습니다.");

    await act(async () => {
      latestState?.handleBackToList();
    });

    expect(state.takePatternSaveNotice()).toBeUndefined();
  });
});
