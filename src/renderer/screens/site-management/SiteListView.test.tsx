// @vitest-environment jsdom

import { createRef } from "react";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteListView } from "./SiteListView";

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

const findButtons = (container: HTMLElement, selector: string) =>
  Array.from(container.querySelectorAll(selector)) as HTMLButtonElement[];

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
  const baseRow = {
    cycleSummaries: [
      {
        cycleKey: "cycle-1",
        name: "Cycle 1",
        patternStartDate: "2026-04-01",
        patternString: "DDAANN",
      },
    ],
    poolEnabled: true,
    shiftDefinitions: [
      {
        cycleName: "Cycle 1",
        label: "Day",
        timeRange: "07:00 - 19:00",
      },
    ],
    site: {
      customerName: "Client",
      id: "site-1",
      name: "Boramae",
      siteCode: "SITE-001",
      status: "active" as const,
    },
    teamStatusItems: [{ headcount: 2, label: "A" }],
    workType: "4-team 2-shift",
  };

  it("renders summary, admin actions, and forwards the detail action", async () => {
    const onOpenDetail = vi.fn();

    const { container } = await renderComponent(
      <SiteListView
        canManageSiteRegistration
        headingRef={createRef<HTMLHeadingElement>()}
        isLoading={false}
        onOpenDetail={onOpenDetail}
        onOpenPatternImport={vi.fn()}
        onOpenRegistration={vi.fn()}
        rows={[baseRow]}
        screenError={null}
        siteListSummary={{
          activeSites: 1,
          assignedEmployees: 2,
          poolSites: 1,
          totalSites: 1,
        }}
      />,
    );

    expect(container.textContent).toContain("Boramae");
    expect(container.textContent).toContain("4-team 2-shift");
    expect(
      findButtons(container, ".section-heading .button-row > button"),
    ).toHaveLength(2);

    await act(async () => {
      findButtons(container, ".site-action-stack button")[0]?.click();
    });

    expect(onOpenDetail).toHaveBeenCalledWith(baseRow);
  });

  it("renders loading and empty states", async () => {
    const { container: loadingContainer } = await renderComponent(
      <SiteListView
        canManageSiteRegistration
        headingRef={createRef<HTMLHeadingElement>()}
        isLoading
        onOpenDetail={vi.fn()}
        onOpenPatternImport={vi.fn()}
        onOpenRegistration={vi.fn()}
        rows={[]}
        screenError="load failed"
        siteListSummary={{
          activeSites: 0,
          assignedEmployees: 0,
          poolSites: 0,
          totalSites: 0,
        }}
      />,
    );

    expect(loadingContainer.textContent).toContain("load failed");

    const { container: emptyContainer } = await renderComponent(
      <SiteListView
        canManageSiteRegistration
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
          totalSites: 0,
        }}
      />,
    );

    expect(emptyContainer.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("hides registration controls without admin registration permission", async () => {
    const { container } = await renderComponent(
      <SiteListView
        canManageSiteRegistration={false}
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
          totalSites: 0,
        }}
      />,
    );

    expect(
      findButtons(container, ".section-heading .button-row > button"),
    ).toHaveLength(0);
    expect(container.querySelector(".site-field-note")?.textContent).toContain(
      "권한",
    );
  });
});
