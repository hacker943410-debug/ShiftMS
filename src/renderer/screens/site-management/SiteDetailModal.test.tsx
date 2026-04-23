// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteDetailModal } from "./SiteDetailModal";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const findButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
const findButtonByText = (container: HTMLElement, text: string) =>
  findButtons(container).find((button) => button.textContent?.includes(text));

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

const baseProps = {
  deleteError: null,
  detailCycleCards: [
    {
      cycleKey: "cycle-1",
      cycleLength: 6,
      name: "Cycle 1",
      patternStartDate: "2026-04-01",
      patternString: "DDAANN",
      shiftCount: 2,
      shiftDefinitions: [
        {
          breakMinutes: 60,
          dutyCode: "D",
          label: "Day",
          timeRange: "07:00 - 19:00",
        },
      ],
      teams: [
        {
          headcount: 2,
          maxHeadcount: 3,
          teamIndex: 0,
          teamLabel: "A",
        },
      ],
    },
  ],
  detailRow: {
    pattern: {
      poolBreakMinutes: 60,
      poolEnabled: true,
      poolEndTime: "18:00",
      poolStartTime: "09:00",
    },
    site: {
      customerName: "Client",
      name: "Boramae",
      siteCode: "SITE-001",
      status: "active" as const,
    },
    teamStatusItems: [{ headcount: 2, label: "A" }],
    workType: "4-team 2-shift",
  },
  detailTeamIndexes: [{ index: 0, teamLabel: "A" }],
  detailTotalAssignedHeadcount: 2,
  isDeletingSite: false,
  onOpenAssignment: vi.fn(),
  onClose: vi.fn(),
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onOpenSchedule: vi.fn(),
};

describe("SiteDetailModal", () => {
  it("renders site details and forwards actions when registration permission exists", async () => {
    const onClose = vi.fn();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    const onOpenAssignment = vi.fn();
    const onOpenSchedule = vi.fn();

    const { container } = await renderComponent(
      <SiteDetailModal
        {...baseProps}
        canManageSiteRegistration
        onClose={onClose}
        onDelete={onDelete}
        onEdit={onEdit}
        onOpenAssignment={onOpenAssignment}
        onOpenSchedule={onOpenSchedule}
      />,
    );

    expect(container.textContent).toContain("Boramae");
    expect(container.textContent).toContain("4-team 2-shift");
    expect(findButtonByText(container, "근무지 삭제")).toBeTruthy();
    expect(findButtonByText(container, "근무표 배포")).toBeTruthy();
    expect(findButtonByText(container, "수정")).toBeTruthy();
    expect(findButtonByText(container, "닫기")).toBeTruthy();
    expect(findButtonByText(container, "2명")).toBeTruthy();

    await act(async () => {
      const deleteButton = findButtonByText(container, "근무지 삭제");
      const scheduleButton = findButtonByText(container, "근무표 배포");
      const editButton = findButtonByText(container, "수정");
      const closeButton = findButtonByText(container, "닫기");
      const summaryTeamButton = findButtonByText(container, "2명");
      const cycleTeamButton = findButtons(container).find((button) =>
        button.textContent?.includes("조별 Index 0"),
      );
      deleteButton?.click();
      scheduleButton?.click();
      editButton?.click();
      closeButton?.click();
      summaryTeamButton?.click();
      cycleTeamButton?.click();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onOpenAssignment).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides edit and delete actions without admin registration permission", async () => {
    const { container } = await renderComponent(
      <SiteDetailModal {...baseProps} canManageSiteRegistration={false} />,
    );

    expect(findButtonByText(container, "근무지 삭제")).toBeFalsy();
    expect(findButtonByText(container, "수정")).toBeFalsy();
    expect(findButtonByText(container, "근무표 배포")).toBeTruthy();
    expect(findButtonByText(container, "닫기")).toBeTruthy();
  });

  it("does not render when the detail row is missing", async () => {
    const { container } = await renderComponent(
      <SiteDetailModal
        {...baseProps}
        canManageSiteRegistration
        detailRow={null}
      />,
    );

    expect(container.textContent).toBe("");
  });
});
