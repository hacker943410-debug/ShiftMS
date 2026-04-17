// @vitest-environment jsdom

import { createRef } from "react";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteListView } from "./SiteListView";

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
  Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));

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

describe("SiteListView", () => {
  it("should render the summary and forward list actions", async () => {
    const onOpenDetail = vi.fn();
    const onOpenPatternImport = vi.fn();
    const onOpenRegistration = vi.fn();
    const row = {
      cycleSummaries: [
        {
          cycleKey: "cycle-1",
          name: "Cycle 1",
          patternStartDate: "2026-04-01",
          patternString: "주주주야야야휴휴"
        }
      ],
      poolEnabled: true,
      shiftDefinitions: [
        {
          cycleName: "Cycle 1",
          label: "주간",
          timeRange: "07:00 - 19:00"
        }
      ],
      site: {
        customerName: "고객사A",
        id: "site-1",
        name: "본관",
        siteCode: "SITE-001",
        status: "active" as const
      },
      teamStatusItems: [{ headcount: 2, label: "A조" }],
      workType: "4조 2교대"
    };

    const { container } = await renderComponent(
      <SiteListView
        headingRef={createRef<HTMLHeadingElement>()}
        isLoading={false}
        onOpenDetail={onOpenDetail}
        onOpenPatternImport={onOpenPatternImport}
        onOpenRegistration={onOpenRegistration}
        rows={[row]}
        screenError={null}
        siteListSummary={{
          activeSites: 1,
          assignedEmployees: 2,
          poolSites: 1,
          totalSites: 1
        }}
      />
    );

    expect(container.textContent).toContain("근무지 관리");
    expect(container.textContent).toContain("본관");
    expect(container.textContent).toContain("4조 2교대");
    expect(container.textContent).toContain("총 2명 배정");

    await act(async () => {
      findButtonByText(container, "패턴 적용된 근무지 추가")?.click();
      findButtonByText(container, "근무지 등록")?.click();
      findButtonByText(container, "상세 보기")?.click();
    });

    expect(onOpenPatternImport).toHaveBeenCalledTimes(1);
    expect(onOpenRegistration).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledWith(row);
  });

  it("should render loading and empty states", async () => {
    const { container: loadingContainer } = await renderComponent(
      <SiteListView
        headingRef={createRef<HTMLHeadingElement>()}
        isLoading
        onOpenDetail={vi.fn()}
        onOpenPatternImport={vi.fn()}
        onOpenRegistration={vi.fn()}
        rows={[]}
        screenError="오류"
        siteListSummary={{
          activeSites: 0,
          assignedEmployees: 0,
          poolSites: 0,
          totalSites: 0
        }}
      />
    );

    expect(loadingContainer.textContent).toContain("근무지 정보를 불러오는 중입니다.");
    expect(loadingContainer.textContent).toContain("오류");

    const { container: emptyContainer } = await renderComponent(
      <SiteListView
        headingRef={createRef<HTMLHeadingElement>()}
        isLoading={false}
        onOpenDetail={vi.fn()}
        onOpenPatternImport={vi.fn()}
        onOpenRegistration={vi.fn()}
        rows={[]}
        screenError={null}
        siteListSummary={{
          activeSites: 0,
          assignedEmployees: 0,
          poolSites: 0,
          totalSites: 0
        }}
      />
    );

    expect(emptyContainer.textContent).toContain("등록된 근무지가 없습니다.");
  });
});
