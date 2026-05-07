// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authSessionPolicy } from "@shared/config/auth-session-policy";
import { DEFAULT_ADMIN_BOOTSTRAP_PASSWORD } from "@shared/config/auth-password-policy";

import { LoginScreen } from "./LoginScreen";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderLoginScreen = async (input?: {
  bootstrapCredentialsFilePath?: string | null;
  recoveryConfigured?: boolean;
}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  const handleSubmit = vi.fn<(value: { loginId: string; password: string }) => Promise<void>>(
    async () => undefined
  );
  const handleRecover = vi.fn<(value: { recoveryKey: string }) => Promise<{
    adminLoginId: string;
    temporaryPassword: string;
    backupPath: string;
    recoveredAt: string;
  }>>(async () => ({
    adminLoginId: "admin",
    temporaryPassword: "Temp-1234567890abcdef!A1",
    backupPath: "C:\\ShiftMgmt\\data\\account-recovery-backups\\backup.sqlite",
    recoveredAt: "2026-05-07T09:00:00.000Z"
  }));

  await act(async () => {
    root.render(
      <LoginScreen
        appVersion="0.3.2"
        bootstrapCredentialsFilePath={input?.bootstrapCredentialsFilePath ?? null}
        errorMessage={null}
        isSubmitting={false}
        onRecoverAccount={handleRecover}
        onSubmit={handleSubmit}
        recoveryAvailability={{
          configured: input?.recoveryConfigured === true,
          adminLoginId: "admin",
          issuedAt: input?.recoveryConfigured === true ? "2026-05-07T09:00:00.000Z" : undefined
        }}
        sessionPolicy={authSessionPolicy}
      />
    );
  });

  return { container, handleRecover };
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

describe("LoginScreen", () => {
  it("should render blank login credentials by default", async () => {
    const { container } = await renderLoginScreen();
    const inputs = container.querySelectorAll("input");
    const loginIdInput = inputs.item(0) as HTMLInputElement | null;
    const passwordInput = inputs.item(1) as HTMLInputElement | null;

    expect(loginIdInput?.value).toBe("");
    expect(passwordInput?.value).toBe("");
  });

  it("should not render quick account shortcuts", async () => {
    const { container } = await renderLoginScreen();

    expect(container.querySelectorAll(".demo-account")).toHaveLength(0);
  });

  it("should render the admin bootstrap password hint", async () => {
    const { container } = await renderLoginScreen();

    expect(container.textContent).toContain(
      `관리자 초기 비밀번호는 ${DEFAULT_ADMIN_BOOTSTRAP_PASSWORD}입니다.`
    );
  });

  it("should render the bootstrap credentials file path when provided", async () => {
    const { container } = await renderLoginScreen({
      bootstrapCredentialsFilePath: "C:\\ShiftMgmt\\data\\bootstrap-credentials.json"
    });

    expect(container.textContent).toContain("설치별 추가 계정 초기 비밀번호");
    expect(container.textContent).toContain("bootstrap-credentials.json");
  });

  it("should render the runtime-only session policy hint", async () => {
    const { container } = await renderLoginScreen();

    expect(container.textContent).toContain(`8${"\uC2DC\uAC04"}`);
    expect(container.textContent).toContain("\uB2E4\uC2DC \uB85C\uADF8\uC778");
  });

  it("should open the account recovery modal", async () => {
    const { container } = await renderLoginScreen();
    const recoveryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "계정복구"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      recoveryButton?.click();
    });

    expect(container.textContent).toContain("아직 발급된 계정복구키가 없습니다.");
  });

  it("should submit the configured account recovery key", async () => {
    const { container, handleRecover } = await renderLoginScreen({
      recoveryConfigured: true
    });
    const recoveryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "계정복구"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      recoveryButton?.click();
    });

    const keyInput = Array.from(container.querySelectorAll("input")).find(
      (input) => input.placeholder === "SMR-XXXX-XXXX-..."
    ) as HTMLInputElement | undefined;

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      valueSetter?.call(keyInput, "SMR-1111-2222");
      keyInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const recoverSubmitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "복구 실행"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      recoverSubmitButton?.click();
    });

    expect(handleRecover).toHaveBeenCalledWith({
      recoveryKey: "SMR-1111-2222"
    });
    expect(container.textContent).toContain("admin 계정 복구가 완료되었습니다.");
    expect(
      Array.from(container.querySelectorAll("input")).some(
        (input) => input.value === "Temp-1234567890abcdef!A1"
      )
    ).toBe(true);
  });
});
