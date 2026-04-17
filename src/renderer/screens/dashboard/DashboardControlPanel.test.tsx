// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardControlPanel } from "./DashboardControlPanel";

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
  allOptionValue: "all",
  availableYears: ["2026", "2025"],
  draftFilters: {
    periodMode: "single" as const,
    year: "2026",
    month: "all",
    startYearMonth: "2026-01",
    endYearMonth: "2026-04",
    siteId: "all",
    employeeName: "all"
  },
  employeeOptions: ["all", "홍길동", "김영희"],
  exportDisabled: false,
  exportingFormat: null as "xlsx" | "pdf" | null,
  notices: [] as Array<{ message: string; title: string }>,
  onEmployeeNameChange: vi.fn(),
  onEndYearMonthChange: vi.fn(),
  onExportDashboardReport: vi.fn(),
  onMonthChange: vi.fn(),
  onPeriodModeChange: vi.fn(),
  onSiteIdChange: vi.fn(),
  onStartYearMonthChange: vi.fn(),
  onYearChange: vi.fn(),
  siteOptions: [
    { id: "all", label: "전체" },
    { id: "site-1", label: "본관" }
  ]
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

describe("DashboardControlPanel", () => {
  it("should render header controls and forward single-period filters", async () => {
    const props = {
      ...baseProps,
      onEmployeeNameChange: vi.fn(),
      onExportDashboardReport: vi.fn(),
      onMonthChange: vi.fn(),
      onPeriodModeChange: vi.fn(),
      onSiteIdChange: vi.fn(),
      onYearChange: vi.fn()
    };
    const { container } = await renderComponent(<DashboardControlPanel {...props} />);

    expect(container.textContent).toContain("교대근무 및 수당 관리 시스템 - 대시보드");
    expect(container.textContent).toContain("전체 내보내기");

    await selectOption(container, 0, "기간 직접 지정");
    await selectOption(container, 1, "2025");
    await selectOption(container, 2, "4월");
    await selectOption(container, 3, "본관");
    await selectOption(container, 4, "홍길동");

    const buttons = Array.from(container.querySelectorAll("button"));
    const pdfButton = buttons.find((button) =>
      button.getAttribute("aria-label")?.includes("대시보드 전체 PDF 내보내기")
    );
    const xlsxButton = buttons.find((button) =>
      button.getAttribute("aria-label")?.includes("대시보드 전체 Excel 내보내기")
    );

    await act(async () => {
      pdfButton?.click();
      xlsxButton?.click();
    });

    expect(props.onPeriodModeChange).toHaveBeenCalledWith("range");
    expect(props.onYearChange).toHaveBeenCalledWith("2025");
    expect(props.onMonthChange).toHaveBeenCalledWith("04");
    expect(props.onSiteIdChange).toHaveBeenCalledWith("site-1");
    expect(props.onEmployeeNameChange).toHaveBeenCalledWith("홍길동");
    expect(props.onExportDashboardReport).toHaveBeenNthCalledWith(1, "pdf");
    expect(props.onExportDashboardReport).toHaveBeenNthCalledWith(2, "xlsx");
  });

  it("should render range controls and notices", async () => {
    const props = {
      ...baseProps,
      draftFilters: {
        ...baseProps.draftFilters,
        periodMode: "range" as const
      },
      notices: [
        {
          title: "샘플 데이터 표시 중",
          message: "실데이터가 없어 샘플 데이터를 표시 중입니다."
        },
        {
          title: "대시보드 내보내기 완료",
          message: "대시보드 전체를 report.xlsx로 저장했습니다."
        }
      ]
    };
    const { container } = await renderComponent(<DashboardControlPanel {...props} />);

    expect(container.textContent).toContain("시작 월");
    expect(container.textContent).toContain("종료 월");
    expect(container.textContent).toContain("샘플 데이터 표시 중");
    expect(container.textContent).toContain("report.xlsx");
  });
});
