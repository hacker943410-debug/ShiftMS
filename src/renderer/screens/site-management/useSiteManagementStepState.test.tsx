// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useSiteManagementStepState } from "./useSiteManagementStepState";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
let latestState: ReturnType<typeof useSiteManagementStepState> | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HookHarness = () => {
  latestState = useSiteManagementStepState(() => "2026-04-20");
  return null;
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
    throw new Error("step state hook did not initialize");
  }

  return latestState;
};

afterEach(async () => {
  latestState = null;

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

describe("useSiteManagementStepState", () => {
  it("should initialize registration step state with defaults", async () => {
    const state = await renderHookHarness();

    expect(state).toMatchObject({
      assignmentStartDate: "2026-04-20",
      draggingTeamLabel: null,
      poolKeyword: "",
      poolScope: "all",
      selectedPatternPresetSiteId: "",
      showPatternPresetModal: false,
      simulationMonthIndex: 0,
      view: "list"
    });
  });

  it("should open and close pattern preset modal with selected site id", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.openPatternPresetModal("site-3");
    });

    expect(latestState).toMatchObject({
      selectedPatternPresetSiteId: "site-3",
      showPatternPresetModal: true
    });

    await act(async () => {
      latestState?.closePatternPresetModal();
    });

    expect(latestState?.showPatternPresetModal).toBe(false);
  });

  it("should reset registration view state without changing assignment date or pool filters", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setAssignmentStartDate("2026-04-25");
      state.setDraggingTeamLabel("A조");
      state.setPoolKeyword("홍길동");
      state.setPoolScope("other-site");
      state.setSelectedPatternPresetSiteId("site-9");
      state.setSimulationMonthIndex(2);
      state.setShowPatternPresetModal(true);
    });

    await act(async () => {
      latestState?.resetRegistrationViewState();
    });

    expect(latestState).toMatchObject({
      assignmentStartDate: "2026-04-25",
      draggingTeamLabel: null,
      poolKeyword: "홍길동",
      poolScope: "other-site",
      selectedPatternPresetSiteId: "",
      showPatternPresetModal: false,
      simulationMonthIndex: 0
    });
  });
});
