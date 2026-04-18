// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthSession } from "@shared/domain/model";
import { canAccessRoute } from "@shared/domain/authorization";

import { AppWorkflowProvider } from "../contexts/app-workflow-context";
import { appRoutes } from "../route-config";
import { DashboardShell } from "./DashboardShell";

vi.mock("../screens/DashboardScreen", () => ({
  DashboardScreen: () => <div>dashboard-screen</div>
}));

vi.mock("../screens/WorkforceManagementScreen", () => ({
  WorkforceManagementScreen: () => <div>workforce-screen</div>
}));

vi.mock("../screens/SiteManagementScreen", () => ({
  SiteManagementScreen: () => <div>site-screen</div>
}));

vi.mock("../screens/ScheduleManagementScreen", () => ({
  ScheduleManagementScreen: () => <div>schedule-screen</div>
}));

vi.mock("../screens/PerformanceManagementScreen", () => ({
  PerformanceManagementScreen: () => <div>performance-screen</div>
}));

vi.mock("../screens/AllowanceManagementScreen", () => ({
  AllowanceManagementScreen: () => <div>allowance-screen</div>
}));

vi.mock("../screens/ShiftPatternManagementScreen", () => ({
  ShiftPatternManagementScreen: () => <div>operations-screen</div>
}));

vi.mock("../screens/AccessHistoryScreen", () => ({
  AccessHistoryScreen: () => <div>access-history-screen</div>
}));

vi.mock("../guides/route-guides", () => ({
  getRouteGuide: () => null
}));

vi.mock("./GuideFlowModal", () => ({
  GuideFlowModal: () => null
}));

const STORAGE_KEY = "shiftmgmt.app-workflow.v1";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const createSession = (role: AuthSession["role"]): AuthSession => ({
  userId: `user-${role}`,
  loginId: role,
  role,
  displayName: `${role}-display`,
  expiresAt: "2099-01-01T00:00:00.000Z",
  sessionToken: `${role}-token`,
  passwordChangeRequired: false
});

const renderDashboardShell = async (
  role: AuthSession["role"],
  options?: { activeRoute?: string }
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const recordAccessLog = vi.fn(async () => ({ ok: true }));

  mountedContainers.push(container);
  mountedRoots.push(root);

  if (options?.activeRoute) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeRoute: options.activeRoute,
        selectedSiteId: "",
        selectedMonth: "2026-04"
      })
    );
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  Object.assign(window, {
    appBridge: {
      recordAccessLog
    }
  });

  await act(async () => {
    root.render(
      <AppWorkflowProvider>
        <DashboardShell
          appVersion="0.3.2"
          health={null}
          onSignOut={async () => undefined}
          session={createSession(role)}
        />
      </AppWorkflowProvider>
    );
  });

  await act(async () => {
    await Promise.resolve();
  });

  return { container, recordAccessLog };
};

const readVisibleRouteLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".route-button span")).map((node) =>
    node.textContent?.trim()
  );

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

  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("DashboardShell", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn()
    });
  });

  it("shows every route for admins", async () => {
    const { container } = await renderDashboardShell("admin");

    expect(readVisibleRouteLabels(container)).toEqual(
      appRoutes.map((route) => route.menuLabel)
    );
  });

  it("hides admin-only routes for planners and falls back to the first visible route", async () => {
    const { container, recordAccessLog } = await renderDashboardShell("planner", {
      activeRoute: "operations"
    });

    expect(readVisibleRouteLabels(container)).toEqual(
      appRoutes
        .filter((route) => canAccessRoute("planner", route.key))
        .map((route) => route.menuLabel)
    );
    expect(container.querySelector(".top-strip-title h2")?.textContent).toBe(
      appRoutes[0]?.menuLabel
    );
    expect(recordAccessLog).toHaveBeenCalledWith(
      expect.objectContaining({
        routeKey: "dashboard"
      })
    );
  });

  it("hides admin-only routes for reviewers", async () => {
    const { container } = await renderDashboardShell("reviewer");

    expect(readVisibleRouteLabels(container)).toEqual(
      appRoutes
        .filter((route) => canAccessRoute("reviewer", route.key))
        .map((route) => route.menuLabel)
    );
  });
});
