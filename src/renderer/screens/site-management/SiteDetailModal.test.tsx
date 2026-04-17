// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteDetailModal } from "./SiteDetailModal";

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

describe("SiteDetailModal", () => {
  it("should render saved site details and forward action buttons", async () => {
    const onClose = vi.fn();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    const onOpenSchedule = vi.fn();
    const { container } = await renderComponent(
      <SiteDetailModal
        deleteError={null}
        detailCycleCards={[
          {
            cycleKey: "cycle-1",
            cycleLength: 6,
            name: "Cycle 1",
            patternStartDate: "2026-04-01",
            patternString: "주주야야휴휴",
            shiftCount: 2,
            shiftDefinitions: [
              {
                breakMinutes: 60,
                dutyCode: "D",
                label: "주간",
                timeRange: "07:00 - 19:00"
              }
            ],
            teams: [
              {
                headcount: 2,
                maxHeadcount: 3,
                teamIndex: 0,
                teamLabel: "A조"
              }
            ]
          }
        ]}
        detailRow={{
          pattern: {
            poolBreakMinutes: 60,
            poolEnabled: true,
            poolEndTime: "18:00",
            poolStartTime: "09:00"
          },
          site: {
            customerName: "고객사A",
            name: "본관",
            siteCode: "SITE-001",
            status: "active"
          },
          teamStatusItems: [{ headcount: 2, label: "A조" }],
          workType: "4조 2교대"
        }}
        detailTeamIndexes={[{ index: 0, teamLabel: "A조" }]}
        detailTotalAssignedHeadcount={2}
        isDeletingSite={false}
        onClose={onClose}
        onDelete={onDelete}
        onEdit={onEdit}
        onOpenSchedule={onOpenSchedule}
      />
    );

    expect(container.textContent).toContain("본관");
    expect(container.textContent).toContain("4조 2교대");
    expect(container.textContent).toContain("Pool 운영");
    expect(container.textContent).toContain("조별 Index 0");

    await act(async () => {
      findButtonByText(container, "근무지 삭제")?.click();
      findButtonByText(container, "근무표 배포")?.click();
      findButtonByText(container, "수정")?.click();
      findButtonByText(container, "닫기")?.click();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should not render when the detail row is missing", async () => {
    const { container } = await renderComponent(
      <SiteDetailModal
        deleteError={null}
        detailCycleCards={[]}
        detailRow={null}
        detailTeamIndexes={[]}
        detailTotalAssignedHeadcount={0}
        isDeletingSite={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onOpenSchedule={vi.fn()}
      />
    );

    expect(container.textContent).toBe("");
  });
});
