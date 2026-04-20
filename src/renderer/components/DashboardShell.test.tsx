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

const setInputValue = (input: HTMLInputElement | null, value: string) => {
  if (!input) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const renderDashboardShell = async (
  role: AuthSession["role"],
  options?: { activeRoute?: string }
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const recordAccessLog = vi.fn(async () => ({ ok: true }));
  const handleSignOut = vi.fn<() => Promise<void>>(async () => undefined);
  const handleChangePassword = vi.fn<
    (input: { currentPassword: string; nextPassword: string }) => Promise<boolean>
  >(async () => true);
  const handleClearPasswordChangeFeedback = vi.fn<() => void>(() => undefined);

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
          isChangingPassword={false}
          onChangePassword={handleChangePassword}
          onClearPasswordChangeFeedback={handleClearPasswordChangeFeedback}
          onSignOut={handleSignOut}
          passwordChangeError={null}
          session={createSession(role)}
        />
      </AppWorkflowProvider>
    );
  });

  await act(async () => {
    await Promise.resolve();
  });

  return {
    container,
    handleChangePassword,
    handleClearPasswordChangeFeedback,
    handleSignOut,
    recordAccessLog
  };
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

  it("opens the profile password change modal and submits a password update", async () => {
    const { container, handleChangePassword } = await renderDashboardShell("admin");
    const profileButton = container.querySelector(".profile-summary-button") as HTMLButtonElement | null;

    await act(async () => {
      profileButton?.click();
    });

    const changePasswordButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "비밀번호 변경"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      changePasswordButton?.click();
    });

    const passwordModal = container.querySelector(".password-change-modal");
    const inputs = passwordModal?.querySelectorAll("input");
    const currentPasswordInput = inputs?.item(0) as HTMLInputElement | null;
    const nextPasswordInput = inputs?.item(1) as HTMLInputElement | null;
    const nextPasswordConfirmationInput = inputs?.item(2) as HTMLInputElement | null;
    const submitButton = passwordModal?.querySelector(".primary-button") as HTMLButtonElement | null;

    await act(async () => {
      setInputValue(currentPasswordInput, "AdminChanged123!");
      setInputValue(nextPasswordInput, "AdminChanged456!");
      setInputValue(nextPasswordConfirmationInput, "AdminChanged456!");
      submitButton?.click();
    });

    expect(handleChangePassword).toHaveBeenCalledWith({
      currentPassword: "AdminChanged123!",
      nextPassword: "AdminChanged456!"
    });
    expect(container.textContent).toContain("비밀번호 변경이 완료되었습니다.");
  });
});
