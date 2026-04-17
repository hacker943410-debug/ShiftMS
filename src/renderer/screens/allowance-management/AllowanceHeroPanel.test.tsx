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

const findButtonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text
  ) ??
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.trim().includes(text)
  );

const selectOption = async (container: HTMLElement, index: number, optionText: string) => {
  const control = container.querySelectorAll(".app-select-control")[index] as HTMLButtonElement | undefined;

  if (!control) {
    throw new Error(`Select control ${index} not found`);
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
  calculatedEmployeeCount: 3,
  displayedRateVersionLabel: "2026-04 기본",
  documentExportsCount: 2,
  exportableResultsCount: 2,
  historyCurrentStatus: "all" as const,
  historyEmployee: "all",
  historyEmployeeOptions: ["홍길동", "김철수"],
  historyMonth: "",
  historySite: "all",
  historySiteOptions: ["본관", "남관"],
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
  overviewSiteOptions: ["본관", "남관"],
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
  it("should render overview actions and forward overview filter changes", async () => {
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

    expect(container.textContent).toContain("수당 관리");
    expect(container.textContent).toContain("산출 4건");
    expect(container.textContent).toContain("적용 요율 2026-04 기본");

    await selectOption(container, 0, "2026년");
    await selectOption(container, 1, "4월");
    await selectOption(container, 2, "본관");

    await act(async () => {
      findButtonByText(container, "품의 승인 가이드")?.click();
      findButtonByText(container, "품의 승인")?.click();
      findButtonByText(container, "PDF 출력")?.click();
      findButtonByText(container, "Excel 출력")?.click();
      findButtonByText(container, "품의 이력")?.click();
      findButtonByText(container, "초기화")?.click();
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

  it("should render history filters and forward history changes", async () => {
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

    expect(container.textContent).toContain("직원명");
    expect(container.textContent).toContain("품의 이력 1건");

    await selectOption(container, 0, "남관");
    await selectOption(container, 1, "2025년");
    await selectOption(container, 2, "5월");
    await selectOption(container, 3, "휴일근무");
    await selectOption(container, 4, "반려");
    await selectOption(container, 5, "퇴사");
    await selectOption(container, 6, "김철수");

    await act(async () => {
      findButtonByText(container, "초기화")?.click();
    });

    expect(props.onHistorySiteChange).toHaveBeenCalledWith("남관");
    expect(props.onHistoryYearChange).toHaveBeenCalledWith("2025");
    expect(props.onHistoryMonthChange).toHaveBeenCalledWith("05");
    expect(props.onHistoryWorkTypeChange).toHaveBeenCalledWith("holiday");
    expect(props.onHistoryStatusChange).toHaveBeenCalledWith("rejected");
    expect(props.onHistoryCurrentStatusChange).toHaveBeenCalledWith("retired");
    expect(props.onHistoryEmployeeChange).toHaveBeenCalledWith("김철수");
    expect(props.onHistoryReset).toHaveBeenCalledTimes(1);
  });
});
