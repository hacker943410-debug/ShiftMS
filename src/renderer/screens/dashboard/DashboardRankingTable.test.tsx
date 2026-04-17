// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardRankingTable } from "./DashboardRankingTable";

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

describe("DashboardRankingTable", () => {
  it("should render ranking rows and forward tab and export actions", async () => {
    const onSelectCategory = vi.fn();
    const onExport = vi.fn();
    const { container } = await renderComponent(
      <DashboardRankingTable
        activeCategory="overtime"
        exportingFormat={null}
        items={[
          {
            employeeName: "홍길동",
            siteName: "본관",
            minutes: 330,
            allowanceAmount: 125000
          }
        ]}
        onExport={onExport}
        onSelectCategory={onSelectCategory}
      />
    );

    expect(container.textContent).toContain("근무 유형별 상위 인원 (Top 10)");
    expect(container.textContent).toContain("홍길동");
    expect(container.textContent).toContain("5.5h");
    expect(container.textContent).toContain("125,000원");

    const legalHolidayTab = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("법정휴일")
    );
    const pdfButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("근무 유형별 상위 인원 PDF 내보내기")
    );
    const xlsxButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("근무 유형별 상위 인원 Excel 내보내기")
    );

    await act(async () => {
      legalHolidayTab?.click();
      pdfButton?.click();
      xlsxButton?.click();
    });

    expect(onSelectCategory).toHaveBeenCalledWith("legalHoliday");
    expect(onExport).toHaveBeenCalledWith("pdf");
    expect(onExport).toHaveBeenCalledWith("xlsx");
  });

  it("should render the active category empty message when no ranking rows exist", async () => {
    const { container } = await renderComponent(
      <DashboardRankingTable
        activeCategory="substitute"
        exportingFormat={null}
        items={[]}
        onExport={vi.fn()}
        onSelectCategory={vi.fn()}
      />
    );

    expect(container.textContent).toContain("대체근무 데이터가 없습니다.");
  });
});
