// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllowanceOverviewResultsPanel } from "./AllowanceOverviewResultsPanel";

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

const sampleResult = {
  earlyPayoutDate: "2026-04-20",
  employeeName: "홍길동",
  fileName: "allowance.xlsx",
  hourlyRate: 15000,
  id: "calc-1",
  rateVersionLabel: "2026-04 기본",
  siteName: "본관",
  snapshot: {
    breakdown: {
      baseWorkMinutes: 120,
      nightMinutes: 60,
      overtimeMinutes: 90,
      totalWorkMinutes: 270
    },
    businessCategoryLabel: "연장근무",
    createdAt: "2026-04-17T01:02:03.000Z",
    lines: [
      { allowanceCode: "base" as const, amount: 45000, multiplier: 1, workMinutes: 120 },
      { allowanceCode: "overtime" as const, amount: 50000, multiplier: 1.5, workMinutes: 90 },
      { allowanceCode: "night" as const, amount: 30000, multiplier: 1.5, workMinutes: 60 }
    ],
    totalAllowanceAmount: 125000
  },
  status: "pending" as const,
  workDate: "2026-04-14",
  workType: "overtime" as const
};

const baseProps = {
  allowanceStatusClassNameByCode: {
    approved: "allowance-status-pill approved",
    pending: "allowance-status-pill pending",
    rejected: "allowance-status-pill rejected",
    "proposal-approved": "allowance-status-pill proposal-approved"
  },
  canManageAllowanceApprovals: true,
  detailIcon: <span>detail</span>,
  earlyPayoutIcon: <span>payout</span>,
  expandedDetailIds: [] as string[],
  expandedSiteNames: [] as string[],
  formatCurrencyValue: (value: number) => `${value.toLocaleString("ko-KR")}원`,
  formatDateTimeValue: (value?: string) => value ?? "-",
  formatDateValue: (value?: string) => value ?? "-",
  formatHoursValue: (minutes: number) => `${minutes / 60}h`,
  getBreakdownSummaryValue: () => "4.5h / 2h / 1.5h / 1h",
  getWorkTypeValue: () => "overtime" as const,
  isLoading: false,
  isOverviewDetailExpanded: false,
  isOverviewDistributionExpanded: false,
  isProcessing: false,
  latestApprovalByCalculationId: new Map([
    [
      "calc-1",
      {
        calculationId: "calc-1",
        comment: "승인 완료",
        decision: "approved",
        id: "approval-1",
        processedAt: "2026-04-17T02:03:04.000Z",
        processedByName: "관리자",
        siteName: "본관",
        workMonth: "2026-04"
      }
    ]
  ]) as never,
  latestProposalApprovalByCalculationId: new Map() as never,
  onOpenEarlyPayoutEditor: vi.fn(),
  onOverviewKeywordChange: vi.fn(),
  onReviewCalculations: vi.fn(),
  onToggleExpandedDetail: vi.fn(),
  onToggleExpandedSite: vi.fn(),
  onToggleOverviewLayoutMode: vi.fn(),
  overviewGroups: [
    {
      approvedCount: 0,
      baseWorkMinutes: 120,
      nightMinutes: 60,
      overtimeMinutes: 90,
      pendingCount: 1,
      proposalApprovedCount: 0,
      rejectedCount: 0,
      rows: [sampleResult],
      siteName: "본관",
      totalAllowanceAmount: 125000,
      totalWorkMinutes: 270
    }
  ] as never,
  overviewKeyword: "",
  overviewKeywordInputRef: { current: null },
  processingKey: null,
  statusLabelByCode: {
    approved: "승인",
    pending: "검토대기",
    rejected: "반려",
    "proposal-approved": "품의승인"
  },
  workTypeLabelByType: {
    holiday: "휴일근무",
    overtime: "연장근무",
    substitute: "대체근무"
  },
  workTypePillClassNameByType: {
    holiday: "performance-section-pill legal-holiday",
    overtime: "performance-section-pill overtime",
    substitute: "performance-section-pill substitute"
  }
};

describe("AllowanceOverviewResultsPanel", () => {
  it("should forward summary search and layout actions", async () => {
    const props = {
      ...baseProps,
      isOverviewDistributionExpanded: true,
      onOverviewKeywordChange: vi.fn(),
      onToggleOverviewLayoutMode: vi.fn()
    };
    const { container } = await renderComponent(<AllowanceOverviewResultsPanel {...props} />);

    const input = container.querySelector("input");
    const toggleButton = container.querySelector(".ghost-button.compact-button") as HTMLButtonElement | null;

    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Search input not found");
    }

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(input, "홍");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      toggleButton?.click();
    });

    expect(props.onOverviewKeywordChange).toHaveBeenCalledWith("홍");
    expect(props.onToggleOverviewLayoutMode).toHaveBeenCalledTimes(1);
  });

  it("should forward grouped row actions when approval permission exists", async () => {
    const props = {
      ...baseProps,
      expandedDetailIds: ["calc-1"],
      expandedSiteNames: ["본관"],
      onOpenEarlyPayoutEditor: vi.fn(),
      onReviewCalculations: vi.fn(),
      onToggleExpandedDetail: vi.fn(),
      onToggleExpandedSite: vi.fn()
    };
    const { container } = await renderComponent(<AllowanceOverviewResultsPanel {...props} />);

    const siteExpandButton = container.querySelector(".allowance-expand-button") as HTMLButtonElement | null;
    const iconButtons = Array.from(
      container.querySelectorAll(".allowance-row-action-button")
    ) as HTMLButtonElement[];
    const approveButtons = Array.from(
      container.querySelectorAll(".allowance-row-action-text.approve")
    ) as HTMLButtonElement[];
    const rejectButton = container.querySelector(
      ".allowance-row-action-text.reject"
    ) as HTMLButtonElement | null;

    expect(siteExpandButton).toBeTruthy();
    expect(iconButtons).toHaveLength(2);
    expect(approveButtons).toHaveLength(2);
    expect(rejectButton).toBeTruthy();

    await act(async () => {
      siteExpandButton?.click();
      iconButtons[0]?.click();
      iconButtons[1]?.click();
      approveButtons[0]?.click();
      rejectButton?.click();
      approveButtons[1]?.click();
    });

    expect(props.onToggleExpandedSite).toHaveBeenCalledWith("본관");
    expect(props.onToggleExpandedDetail).toHaveBeenCalledWith("calc-1");
    expect(props.onOpenEarlyPayoutEditor).toHaveBeenCalledWith(sampleResult);
    expect(props.onReviewCalculations).toHaveBeenNthCalledWith(1, {
      calculationIds: ["calc-1"],
      decision: "approved",
      scopeLabel: "본관 근무지"
    });
    expect(props.onReviewCalculations).toHaveBeenNthCalledWith(2, {
      calculationIds: ["calc-1"],
      decision: "rejected",
      scopeLabel: "본관 근무지",
      syncPerformanceSiteReject: true
    });
    expect(props.onReviewCalculations).toHaveBeenNthCalledWith(3, {
      calculationIds: ["calc-1"],
      decision: "approved",
      scopeLabel: "홍길동 수당"
    });
  });

  it("should hide approval actions without approval permission", async () => {
    const { container } = await renderComponent(
      <AllowanceOverviewResultsPanel
        {...baseProps}
        canManageAllowanceApprovals={false}
        expandedSiteNames={["본관"]}
      />
    );

    expect(container.textContent).toContain("수당 승인 권한 필요");
    expect(container.querySelector(".allowance-row-action-text.approve")).toBeNull();
    expect(container.querySelector(".allowance-row-action-text.reject")).toBeNull();
  });
});
