// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useAllowanceManagementViewState } from "./useAllowanceManagementViewState";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
let latestState: ReturnType<typeof useAllowanceManagementViewState> | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HookHarness = () => {
  latestState = useAllowanceManagementViewState();
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
    throw new Error("view state hook did not initialize");
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

describe("useAllowanceManagementViewState", () => {
  it("should reset overview filters to defaults", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setOverviewYear("2026");
      state.setOverviewMonth("04");
      state.setOverviewSite("본관");
      state.setOverviewKeyword("홍길동");
    });

    expect(latestState?.overviewYear).toBe("2026");
    expect(latestState?.overviewMonth).toBe("04");
    expect(latestState?.overviewSite).toBe("본관");
    expect(latestState?.overviewKeyword).toBe("홍길동");

    await act(async () => {
      latestState?.resetOverviewFilters();
    });

    expect(latestState?.overviewYear).toBe("all");
    expect(latestState?.overviewMonth).toBe("");
    expect(latestState?.overviewSite).toBe("all");
    expect(latestState?.overviewKeyword).toBe("");
  });

  it("should reset history filters to defaults", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.setHistoryYear("2026");
      state.setHistoryMonth("04");
      state.setHistorySite("본관");
      state.setHistoryWorkType("holiday");
      state.setHistoryStatus("proposal-approved");
      state.setHistoryCurrentStatus("retired");
      state.setHistoryEmployee("김영희");
    });

    await act(async () => {
      latestState?.resetHistoryFilters();
    });

    expect(latestState?.historyYear).toBe("all");
    expect(latestState?.historyMonth).toBe("");
    expect(latestState?.historySite).toBe("all");
    expect(latestState?.historyWorkType).toBe("all");
    expect(latestState?.historyStatus).toBe("all");
    expect(latestState?.historyCurrentStatus).toBe("all");
    expect(latestState?.historyEmployee).toBe("all");
  });

  it("should toggle expanded overview and history rows independently", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.toggleExpandedSite("overview", "본관");
      state.toggleExpandedDetail("overview", "row-1");
      state.toggleExpandedSite("history", "별관");
      state.toggleExpandedDetail("history", "row-2");
    });

    expect(latestState?.expandedOverviewSites).toEqual(["본관"]);
    expect(latestState?.expandedOverviewDetails).toEqual(["row-1"]);
    expect(latestState?.expandedHistorySites).toEqual(["별관"]);
    expect(latestState?.expandedHistoryDetails).toEqual(["row-2"]);

    await act(async () => {
      latestState?.toggleExpandedSite("overview", "본관");
      latestState?.toggleExpandedDetail("history", "row-2");
    });

    expect(latestState?.expandedOverviewSites).toEqual([]);
    expect(latestState?.expandedHistoryDetails).toEqual([]);
  });

  it("should toggle overview layout modes and keep hovered donut state", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.toggleOverviewLayoutMode("distribution-expanded");
      state.setHoveredDistributionSite("본관");
      state.setActiveDonutType("overtime");
    });

    expect(latestState?.overviewLayoutMode).toBe("distribution-expanded");
    expect(latestState?.hoveredDistributionSite).toBe("본관");
    expect(latestState?.activeDonutType).toBe("overtime");

    await act(async () => {
      latestState?.toggleOverviewLayoutMode("distribution-expanded");
    });

    expect(latestState?.overviewLayoutMode).toBe("split");
  });

  it("should update and expose the current view mode", async () => {
    const state = await renderHookHarness();

    expect(state.viewMode).toBe("overview");

    await act(async () => {
      state.setViewMode("history");
    });

    expect(latestState?.viewMode).toBe("history");
  });
});
