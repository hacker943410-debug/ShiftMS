// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EChartPanelHandle } from "../../components/EChartPanel";
import {
  DashboardMetricCard,
  DashboardRatioChart,
  DashboardSiteChart,
  DashboardTrendChart
} from "./DashboardSummaryPanels";

vi.mock("../../components/EChartPanel", () => ({
  EChartPanel: ({ className }: { className?: string }) => (
    <div className={className} data-testid="echart-panel" />
  )
}));

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

describe("DashboardSummaryPanels", () => {
  it("should render metric card content", async () => {
    const { container } = await renderComponent(
      <DashboardMetricCard
        metric={{
          label: "총 지급수당",
          value: "1,230,000원",
          changeText: "전월 대비 +5.1%",
          changeTone: "is-up",
          tone: "money"
        }}
      />
    );

    expect(container.textContent).toContain("총 지급수당");
    expect(container.textContent).toContain("1,230,000원");
    expect(container.textContent).toContain("전월 대비 +5.1%");
  });

  it("should render trend chart header and forward export actions", async () => {
    const onExport = vi.fn();
    const { container } = await renderComponent(
      <DashboardTrendChart
        chartRef={createRef<EChartPanelHandle>()}
        exportingFormat={null}
        items={[
          {
            label: "2026.03",
            overtimeAmount: 100000,
            substituteAmount: 50000,
            legalHolidayAmount: 25000
          }
        ]}
        onExport={onExport}
        title="월별 수당 추이"
      />
    );

    expect(container.textContent).toContain("월별 수당 추이");
    expect(container.querySelector("[data-testid='echart-panel']")).not.toBeNull();

    const buttons = Array.from(container.querySelectorAll("button"));
    const pdfButton = buttons.find((button) =>
      button.getAttribute("aria-label")?.includes("월별 수당 추이 PDF 내보내기")
    );
    const xlsxButton = buttons.find((button) =>
      button.getAttribute("aria-label")?.includes("월별 수당 추이 Excel 내보내기")
    );

    await act(async () => {
      pdfButton?.click();
      xlsxButton?.click();
    });

    expect(onExport).toHaveBeenCalledWith("pdf");
    expect(onExport).toHaveBeenCalledWith("xlsx");
  });

  it("should render site and ratio chart headers", async () => {
    const onExport = vi.fn();
    const { container } = await renderComponent(
      <div>
        <DashboardSiteChart
          chartRef={createRef<EChartPanelHandle>()}
          exportingFormat={null}
          items={[
            {
              siteName: "본관",
              overtimeAmount: 100000,
              substituteAmount: 50000,
              legalHolidayAmount: 25000,
              totalAmount: 175000
            }
          ]}
          onExport={onExport}
        />
        <DashboardRatioChart
          chartRef={createRef<EChartPanelHandle>()}
          exportingFormat={null}
          items={[
            { category: "overtime", label: "연장수당", amount: 100000 },
            { category: "substitute", label: "대체수당", amount: 50000 }
          ]}
          onExport={onExport}
          totalAmount={150000}
        />
      </div>
    );

    expect(container.textContent).toContain("근무지별 수당 현황");
    expect(container.textContent).toContain("전사 수당 유형 비율");

    const buttons = Array.from(container.querySelectorAll("button"));
    const sitePdfButton = buttons.find((button) =>
      button.getAttribute("aria-label")?.includes("근무지별 수당 현황 PDF 내보내기")
    );
    const ratioPdfButton = buttons.find((button) =>
      button.getAttribute("aria-label")?.includes("전사 수당 유형 비율 PDF 내보내기")
    );

    await act(async () => {
      sitePdfButton?.click();
      ratioPdfButton?.click();
    });

    expect(onExport).toHaveBeenCalledWith("pdf");
  });
});
