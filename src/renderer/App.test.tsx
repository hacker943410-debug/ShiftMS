// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthSession } from "@shared/domain/model";

import { App } from "./App";

vi.mock("./components/DashboardShell", () => ({
  DashboardShell: () => <div>dashboard-shell</div>
}));

vi.mock("./components/LoginScreen", () => ({
  LoginScreen: () => <div>login-screen</div>
}));

vi.mock("./components/PasswordChangeScreen", () => ({
  PasswordChangeScreen: () => <div>password-change-screen</div>
}));

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const baseSession: AuthSession = {
  userId: "user-1",
  loginId: "admin",
  role: "admin",
  displayName: "관리자",
  expiresAt: "2099-01-01T00:00:00.000Z",
  sessionToken: "session-token",
  passwordChangeRequired: false
};

const renderApp = async (input: {
  dismissUpdateNotice?: ReturnType<typeof vi.fn>;
  getUpdateState: () => Promise<unknown>;
}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const dismissUpdateNotice =
    input.dismissUpdateNotice ??
    vi.fn(async () => ({
      ok: true,
      data: {
        enabled: true,
        status: "idle",
        currentVersion: "0.4.4",
        availableManifest: null,
        releaseNotesToShow: null
      }
    }));

  mountedContainers.push(container);
  mountedRoots.push(root);

  Object.assign(window, {
    appBridge: {
      getAppVersion: vi.fn(async () => "0.4.4"),
      getAppHealth: vi.fn(async () => ({
        ok: true,
        data: {
          appVersion: "0.4.4",
          environment: "production",
          databaseConfigured: true,
          pendingDirectoryConfigured: true,
          approvedDirectoryConfigured: true,
          sessionPolicy: {
            persistence: "runtime-only",
            restoreOnRestart: false,
            renewOnAuthenticatedAccess: true,
            durationHours: 8
          }
        }
      })),
      getSession: vi.fn(async () => ({
        ok: true,
        data: baseSession
      })),
      getAccountRecoveryAvailability: vi.fn(async () => ({
        ok: true,
        data: {
          configured: false,
          adminLoginId: "admin"
        }
      })),
      recoverAdminAccount: vi.fn(async () => ({
        ok: true,
        data: {
          adminLoginId: "admin",
          temporaryPassword: "Temp-1234567890abcdef!A1",
          backupPath: "C:\\ShiftMgmt\\backup.sqlite",
          recoveredAt: "2026-05-07T09:00:00.000Z"
        }
      })),
      getUpdateState: vi.fn(input.getUpdateState),
      checkForAppUpdate: vi.fn(async () => ({
        ok: true,
        data: {
          enabled: true,
          status: "idle",
          currentVersion: "0.4.4",
          availableManifest: null,
          releaseNotesToShow: null
        }
      })),
      downloadAppUpdate: vi.fn(async () => ({
        ok: true,
        data: {
          enabled: true,
          status: "downloaded",
          currentVersion: "0.4.4",
          targetVersion: "0.4.5",
          availableManifest: null,
          releaseNotesToShow: null
        }
      })),
      installDownloadedUpdate: vi.fn(async () => ({
        ok: true,
        data: {
          enabled: true,
          status: "downloaded",
          currentVersion: "0.4.4",
          targetVersion: "0.4.5",
          availableManifest: null,
          releaseNotesToShow: null
        }
      })),
      dismissUpdateNotice
    }
  });

  await act(async () => {
    root.render(<App />);
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return {
    container,
    dismissUpdateNotice
  };
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

  vi.restoreAllMocks();
});

describe("App", () => {
  it("opens the update modal when a new version is available", async () => {
    const { container, dismissUpdateNotice } = await renderApp({
      getUpdateState: async () => ({
        ok: true,
        data: {
          enabled: true,
          status: "available",
          currentVersion: "0.4.4",
          targetVersion: "0.4.5",
          required: false,
          headline: "0.4.5 업데이트",
          availableManifest: {
            version: "0.4.5",
            required: false,
            headline: "0.4.5 업데이트",
            summary: "주요 기능을 보강했습니다.",
            notes: ["패치 항목"],
            requiresDbBackup: false,
            publishedAt: "2026-04-23T00:00:00.000Z"
          },
          releaseNotesToShow: null
        }
      })
    });

    expect(container.textContent).toContain("0.4.5 업데이트");
    expect(container.textContent).toContain("대상 버전 0.4.5");

    const laterButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "나중에"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      laterButton?.click();
    });

    expect(dismissUpdateNotice).toHaveBeenCalledWith("0.4.5");
  });

  it("opens the release notes modal after boot, navigates all versions, and marks them as read", async () => {
    const { container, dismissUpdateNotice } = await renderApp({
      getUpdateState: async () => ({
        ok: true,
        data: {
          enabled: true,
          status: "idle",
          currentVersion: "0.4.4",
          availableManifest: null,
          releaseNotesToShow: {
            fromVersion: "0.4.2",
            toVersion: "0.4.4",
            manifests: [
              {
                version: "0.4.3",
                required: false,
                headline: "0.4.3 패치노트",
                notes: ["조별 Index UI 보강"],
                requiresDbBackup: false,
                publishedAt: "2026-04-22T00:00:00.000Z"
              },
              {
                version: "0.4.4",
                required: false,
                headline: "0.4.4 패치노트",
                notes: ["복원 진단 보강"],
                requiresDbBackup: false,
                publishedAt: "2026-04-23T00:00:00.000Z"
              }
            ]
          }
        }
      })
    });

    expect(container.textContent).toContain("업데이트 변경 내용 확인");
    expect(container.textContent).toContain("0.4.3 패치노트");
    expect(container.textContent).toContain("조별 Index UI 보강");

    const nextButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "다음"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      nextButton?.click();
    });

    expect(container.textContent).toContain("0.4.4 패치노트");
    expect(container.textContent).toContain("복원 진단 보강");

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "마침"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      confirmButton?.click();
    });

    expect(dismissUpdateNotice).toHaveBeenCalledWith("0.4.4");
  });
});
