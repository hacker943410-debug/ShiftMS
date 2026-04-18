// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllowanceHeroPanel } from "./AllowanceHeroPanel";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderComponent = async (element: ReactElement) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(element);
  });

  return { container };
};

const openSelectAndChoose = async (container: HTMLElement, controlIndex: number, optionText: string) => {
  const control = container.querySelectorAll(".app-select-control")[controlIndex] as
    | HTMLButtonElement
    | undefined;

  if (!control) {
    throw new Error(`Select control ${controlIndex} not found`);
  }

  await act(async () => {
    control.click();
  });

  const option = Array.from(container.querySelectorAll(".app-select-option")).find((button) =>
    button.textContent?.includes(optionText)
  ) as HTMLButtonElement | undefined;

  if (!option) {
    throw new Error(`Option ${optionText} not found`);
  }

  await act(async () => {
    option.click();
  });
};

const baseProps = {
  actionError: null,
  actionMessage: null,
  availableYears: ["2026", "2025"],
  canManageAllowanceApprovals: true,
  calculatedEmployeeCount: 3,
  displayedRateVersionLabel: "2026-04 기본",
  documentExportsCount: 2,
  exportableResultsCount: 2,
  historyCurrentStatus: "all" as const,
  historyEmployee: "all",
  historyEmployeeOptions: ["홍길동", "김철수"],
  historyMonth: "",
  historySite: "all",
  historySiteOptions: ["본관", "별관"],
  historyStatus: "all" as const,
  historyWorkType: "all" as const,
  historyYear: "all",
  isProcessing: false,
  onExportDocuments: vi.fn(),
  onHistoryCurrentStatusChange: vi.fn(),
  onHistoryEmployeeChange: vi.fn(),
  onHistoryMonthChange: vi.fn(),
  onHistoryReset: vi.fn(),
  onHistorySiteChange: vi.fn(),
  onHistoryStatusChange: vi.fn(),
  onHistoryWorkTypeChange: vi.fn(),
  onHistoryYearChange: vi.fn(),
  onOpenProposalGuide: vi.fn(),
  onOpenProposalPreview: vi.fn(),
  onOverviewMonthChange: vi.fn(),
  onOverviewReset: vi.fn(),
  onOverviewSiteChange: vi.fn(),
  onOverviewYearChange: vi.fn(),
  onViewModeChange: vi.fn(),
  overviewMonth: "",
  overviewSite: "all",
  overviewSiteOptions: ["본관", "별관"],
  overviewYear: "all",
  processingKey: null,
  proposalApprovalsCount: 1,
  proposalCandidateResultsCount: 1,
  resultsCount: 4,
  screenError: null,
  viewMode: "overview" as const,
  visibleStatusSummary: {
    approved: 1,
    pending: 2,
    rejected: 1,
    "proposal-approved": 0
  }
};

afterEach(async () => {
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

describe("AllowanceHeroPanel", () => {
  it("should forward overview filters and primary actions", async () => {
    const props = {
      ...baseProps,
      onExportDocuments: vi.fn(),
      onOpenProposalGuide: vi.fn(),
      onOpenProposalPreview: vi.fn(),
      onOverviewMonthChange: vi.fn(),
      onOverviewReset: vi.fn(),
      onOverviewSiteChange: vi.fn(),
      onOverviewYearChange: vi.fn(),
      onViewModeChange: vi.fn()
    };
    const { container } = await renderComponent(<AllowanceHeroPanel {...props} />);

    await openSelectAndChoose(container, 0, "2026");
    await openSelectAndChoose(container, 1, "4월");
    await openSelectAndChoose(container, 2, "본관");

    const actionButtons = Array.from(
      container.querySelectorAll(".allowance-export-button")
    ) as HTMLButtonElement[];
    const viewTabs = Array.from(
      container.querySelectorAll(".allowance-view-tab")
    ) as HTMLButtonElement[];
    const resetButton = container.querySelector(".allowance-reset-button") as HTMLButtonElement | null;

    await act(async () => {
      actionButtons[0]?.click();
      actionButtons[1]?.click();
      actionButtons[2]?.click();
      actionButtons[3]?.click();
      viewTabs[1]?.click();
      resetButton?.click();
    });

    expect(props.onOverviewYearChange).toHaveBeenCalledWith("2026");
    expect(props.onOverviewMonthChange).toHaveBeenCalledWith("04");
    expect(props.onOverviewSiteChange).toHaveBeenCalledWith("본관");
    expect(props.onOpenProposalGuide).toHaveBeenCalledTimes(1);
    expect(props.onOpenProposalPreview).toHaveBeenCalledTimes(1);
    expect(props.onExportDocuments).toHaveBeenNthCalledWith(1, "pdf");
    expect(props.onExportDocuments).toHaveBeenNthCalledWith(2, "xlsx");
    expect(props.onViewModeChange).toHaveBeenCalledWith("history");
    expect(props.onOverviewReset).toHaveBeenCalledTimes(1);
  });

  it("should forward history filters", async () => {
    const props = {
      ...baseProps,
      historyCurrentStatus: "active" as const,
      historyEmployee: "홍길동",
      historyMonth: "04",
      historySite: "본관",
      historyStatus: "approved" as const,
      historyWorkType: "overtime" as const,
      historyYear: "2026",
      onHistoryCurrentStatusChange: vi.fn(),
      onHistoryEmployeeChange: vi.fn(),
      onHistoryMonthChange: vi.fn(),
      onHistoryReset: vi.fn(),
      onHistorySiteChange: vi.fn(),
      onHistoryStatusChange: vi.fn(),
      onHistoryWorkTypeChange: vi.fn(),
      onHistoryYearChange: vi.fn(),
      viewMode: "history" as const
    };
    const { container } = await renderComponent(<AllowanceHeroPanel {...props} />);

    await openSelectAndChoose(container, 0, "별관");
    await openSelectAndChoose(container, 1, "2025");
    await openSelectAndChoose(container, 2, "5월");
    await openSelectAndChoose(container, 3, "휴일근무");
    await openSelectAndChoose(container, 4, "반려");
    await openSelectAndChoose(container, 5, "퇴사");
    await openSelectAndChoose(container, 6, "김철수");

    const resetButton = container.querySelector(".allowance-reset-button") as HTMLButtonElement | null;

    await act(async () => {
      resetButton?.click();
    });

    expect(props.onHistorySiteChange).toHaveBeenCalledWith("별관");
    expect(props.onHistoryYearChange).toHaveBeenCalledWith("2025");
    expect(props.onHistoryMonthChange).toHaveBeenCalledWith("05");
    expect(props.onHistoryWorkTypeChange).toHaveBeenCalledWith("holiday");
    expect(props.onHistoryStatusChange).toHaveBeenCalledWith("rejected");
    expect(props.onHistoryCurrentStatusChange).toHaveBeenCalledWith("retired");
    expect(props.onHistoryEmployeeChange).toHaveBeenCalledWith("김철수");
    expect(props.onHistoryReset).toHaveBeenCalledTimes(1);
  });

  it("should hide proposal approval launch without approval permission", async () => {
    const { container } = await renderComponent(
      <AllowanceHeroPanel {...baseProps} canManageAllowanceApprovals={false} />
    );

    const actionButtons = Array.from(
      container.querySelectorAll(".allowance-export-button")
    ) as HTMLButtonElement[];

    expect(actionButtons).toHaveLength(3);
  });
});
