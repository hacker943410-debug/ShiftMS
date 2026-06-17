// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllowanceOverviewChartsPanel } from "./AllowanceOverviewChartsPanel";

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

describe("AllowanceOverviewChartsPanel", () => {
  it("should render chart summaries and forward interaction callbacks", async () => {
    const onActiveDonutTypeChange = vi.fn();
    const onDistributionHoverChange = vi.fn();
    const onDonutPointerMove = vi.fn();
    const onToggleDistributionExpanded = vi.fn();

    const { container } = await renderComponent(
      <AllowanceOverviewChartsPanel
        activeDonutSegment={{
          amount: 120000,
          color: "#ffb648",
          label: "연장근무",
          minutes: 360,
          percentage: 60,
          type: "overtime"
        }}
        activeDonutType="overtime"
        formatCurrencyValue={(value) => `${value.toLocaleString("ko-KR")}원`}
        hoveredDistributionSite="본관"
        isLoading={false}
        isOverviewDistributionExpanded={false}
        onActiveDonutTypeChange={onActiveDonutTypeChange}
        onDistributionHoverChange={onDistributionHoverChange}
        onDonutPointerMove={onDonutPointerMove}
        onToggleDistributionExpanded={onToggleDistributionExpanded}
        siteDistribution={[
          {
            amount: 120000,
            employeeCount: 3,
            ratio: 1,
            siteName: "본관",
            totalWorkMinutes: 360
          }
        ]}
        totalAllowanceAmount={120000}
        visibleResultsCount={4}
        workTypeDistribution={{
          dominantType: "overtime",
          dominantRatio: 60,
          grandTotalAmount: 200000,
          segments: [
            {
              amount: 40000,
              color: "#5b88ff",
              label: "대체근무",
              minutes: 120,
              percentage: 20,
              type: "substitute"
            },
            {
              amount: 120000,
              color: "#ffb648",
              label: "연장근무",
              minutes: 360,
              percentage: 60,
              type: "overtime"
            },
            {
              amount: 40000,
              color: "#ff7f94",
              label: "휴일근무",
              minutes: 90,
              percentage: 20,
              type: "holiday"
            }
          ],
          totals: {
            holiday: { amount: 40000, minutes: 90 },
            overtime: { amount: 120000, minutes: 360 },
            substitute: { amount: 40000, minutes: 120 }
          }
        }}
      />
    );

    expect(container.textContent).toContain("사업장별 수당 분포");
    expect(container.textContent).toContain("본관");
    expect(container.textContent).toContain("전체 수당 합계");
    expect(container.textContent).toContain("연장근무 60%");

    const distributionItem = container.querySelector(".allowance-distribution-item") as HTMLDivElement;
    const donut = container.querySelector(".allowance-donut-chart") as HTMLDivElement;
    const legendItem = Array.from(container.querySelectorAll(".allowance-legend-item")).find((item) =>
      item.textContent?.includes("연장근무")
    ) as HTMLButtonElement | undefined;
    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "좌측 펼치기"
    ) as HTMLButtonElement | undefined;

    expect(distributionItem).toBeTruthy();
    expect(donut).toBeTruthy();
    expect(legendItem).toBeTruthy();
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      distributionItem.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      distributionItem.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      donut.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      donut.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      legendItem?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      legendItem?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      toggleButton?.click();
    });

    expect(onDistributionHoverChange).toHaveBeenNthCalledWith(1, "본관");
    expect(onDistributionHoverChange).toHaveBeenNthCalledWith(2, null);
    expect(onDonutPointerMove).toHaveBeenCalledTimes(1);
    expect(onActiveDonutTypeChange).toHaveBeenCalledWith("overtime");
    expect(onActiveDonutTypeChange).toHaveBeenCalledWith(null);
    expect(onToggleDistributionExpanded).toHaveBeenCalledTimes(1);
  });

  it("should expose the donut and legend to keyboard and screen readers", async () => {
    const onActiveDonutTypeChange = vi.fn();

    const { container } = await renderComponent(
      <AllowanceOverviewChartsPanel
        activeDonutSegment={null}
        activeDonutType={null}
        formatCurrencyValue={(value) => `${value.toLocaleString("ko-KR")}원`}
        hoveredDistributionSite={null}
        isLoading={false}
        isOverviewDistributionExpanded={false}
        onActiveDonutTypeChange={onActiveDonutTypeChange}
        onDistributionHoverChange={vi.fn()}
        onDonutPointerMove={vi.fn()}
        onToggleDistributionExpanded={vi.fn()}
        siteDistribution={[]}
        totalAllowanceAmount={200000}
        visibleResultsCount={4}
        workTypeDistribution={{
          dominantType: "overtime",
          dominantRatio: 60,
          grandTotalAmount: 200000,
          segments: [
            { amount: 40000, color: "#5b88ff", label: "대체근무", minutes: 120, percentage: 20, type: "substitute" },
            { amount: 120000, color: "#ffb648", label: "연장근무", minutes: 360, percentage: 60, type: "overtime" },
            { amount: 40000, color: "#ff7f94", label: "휴일근무", minutes: 90, percentage: 20, type: "holiday" }
          ],
          totals: {
            holiday: { amount: 40000, minutes: 90 },
            overtime: { amount: 120000, minutes: 360 },
            substitute: { amount: 40000, minutes: 120 }
          }
        }}
      />
    );

    const donut = container.querySelector(".allowance-donut-chart") as HTMLDivElement;
    expect(donut.getAttribute("role")).toBe("img");
    expect(donut.getAttribute("aria-label")).toContain("연장근무 60%");

    const legendButtons = Array.from(
      container.querySelectorAll("button.allowance-legend-item")
    ) as HTMLButtonElement[];
    expect(legendButtons.length).toBe(3);

    const overtimeButton = legendButtons.find((button) =>
      button.textContent?.includes("연장근무")
    );
    // 키보드/스크린리더 사용자가 시간·금액 상세까지 읽을 수 있도록 버튼 접근명에 포함.
    expect(overtimeButton?.getAttribute("aria-label")).toContain("연장근무 60%");
    expect(overtimeButton?.getAttribute("aria-label")).toContain("120,000원");

    await act(async () => {
      overtimeButton?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(onActiveDonutTypeChange).toHaveBeenCalledWith("overtime");

    await act(async () => {
      overtimeButton?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onActiveDonutTypeChange).toHaveBeenCalledWith(null);
  });

  it("should render empty states when there is no chart data", async () => {
    const { container } = await renderComponent(
      <AllowanceOverviewChartsPanel
        activeDonutSegment={null}
        activeDonutType={null}
        formatCurrencyValue={(value) => `${value.toLocaleString("ko-KR")}원`}
        hoveredDistributionSite={null}
        isLoading={false}
        isOverviewDistributionExpanded
        onActiveDonutTypeChange={vi.fn()}
        onDistributionHoverChange={vi.fn()}
        onDonutPointerMove={vi.fn()}
        onToggleDistributionExpanded={vi.fn()}
        siteDistribution={[]}
        totalAllowanceAmount={0}
        visibleResultsCount={0}
        workTypeDistribution={{
          dominantType: "overtime",
          dominantRatio: 0,
          grandTotalAmount: 0,
          segments: [],
          totals: {
            holiday: { amount: 0, minutes: 0 },
            overtime: { amount: 0, minutes: 0 },
            substitute: { amount: 0, minutes: 0 }
          }
        }}
      />
    );

    expect(container.textContent).toContain("표시할 산출 결과가 없습니다.");
    expect(container.textContent).toContain("비중을 표시할 수당 결과가 없습니다.");
    expect(container.textContent).toContain("기본 보기");
  });
});
