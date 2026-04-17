// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDashboardFilterState } from "./useDashboardFilterState";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
const setSelectedMonth = vi.fn();
const setSelectedSiteId = vi.fn();
let latestState: ReturnType<typeof useDashboardFilterState> | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HookHarness = () => {
  latestState = useDashboardFilterState({
    allOptionValue: "all",
    selectedMonth: "2026-04",
    selectedSiteId: "site-1",
    setSelectedMonth,
    setSelectedSiteId
  });
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
    throw new Error("dashboard filter state hook did not initialize");
  }

  return latestState;
};

afterEach(async () => {
  latestState = null;
  setSelectedMonth.mockReset();
  setSelectedSiteId.mockReset();

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

describe("useDashboardFilterState", () => {
  it("should initialize from workflow month and site", async () => {
    const state = await renderHookHarness();

    expect(state.draftFilters.year).toBe("2026");
    expect(state.draftFilters.month).toBe("04");
    expect(state.draftFilters.siteId).toBe("site-1");
    expect(state.appliedFilters.siteId).toBe("site-1");
  });

  it("should update single-period filters and workflow month", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.applyDraftValueChange("year", "2025");
    });

    expect(latestState?.draftFilters.year).toBe("2025");
    expect(latestState?.draftFilters.startYearMonth).toBe("2025-04");
    expect(setSelectedMonth).toHaveBeenLastCalledWith("2025-04");
  });

  it("should switch to range mode and clear workflow month when the range diverges", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.applyDraftValueChange("endYearMonth", "2026-05");
    });

    expect(latestState?.draftFilters.periodMode).toBe("range");
    expect(latestState?.appliedFilters.endYearMonth).toBe("2026-05");
    expect(setSelectedMonth).toHaveBeenLastCalledWith("");
  });

  it("should reset workflow site when all sites are selected", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.applyDraftValueChange("siteId", "all");
    });

    expect(latestState?.draftFilters.siteId).toBe("all");
    expect(latestState?.draftFilters.employeeName).toBe("all");
    expect(setSelectedSiteId).toHaveBeenLastCalledWith("");
  });
});
