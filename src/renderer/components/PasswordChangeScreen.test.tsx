// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ADMIN_BOOTSTRAP_PASSWORD,
  getPasswordPolicyErrorMessage
} from "@shared/config/auth-password-policy";
import { authSessionPolicy } from "@shared/config/auth-session-policy";
import type { AuthSession } from "@shared/domain/model";

import { PasswordChangeScreen } from "./PasswordChangeScreen";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

const setInputValue = (input: HTMLInputElement | null, value: string) => {
  if (!input) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderPasswordChangeScreen = async (input?: {
  bootstrapCredentialsFilePath?: string | null;
  session?: Partial<AuthSession>;
}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  const handleSubmit = vi.fn<
    (value: { currentPassword: string; nextPassword: string }) => Promise<boolean>
  >(async () => true);
  const handleSignOut = vi.fn<() => Promise<void>>(async () => undefined);

  await act(async () => {
    root.render(
      <PasswordChangeScreen
        bootstrapCredentialsFilePath={input?.bootstrapCredentialsFilePath ?? null}
        errorMessage={null}
        isSubmitting={false}
        onSignOut={handleSignOut}
        onSubmit={handleSubmit}
        sessionPolicy={authSessionPolicy}
        session={{
          userId: "user-admin",
          loginId: "admin",
          role: "admin",
          displayName: "\uAD00\uB9AC\uC790",
          expiresAt: "2026-04-18T10:00:00+09:00",
          sessionToken: "session-token",
          passwordChangeRequired: true,
          ...input?.session
        }}
      />
    );
  });

  return { container, handleSubmit, handleSignOut };
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

describe("PasswordChangeScreen", () => {
  it("should prompt the admin to change the password without revealing the initial one", async () => {
    const { container } = await renderPasswordChangeScreen();

    expect(container.textContent).toContain("지금 반드시 새 비밀번호로 변경");
    // 초기 비밀번호 값을 화면에 노출하지 않는다.
    expect(container.textContent).not.toContain(DEFAULT_ADMIN_BOOTSTRAP_PASSWORD);
  });

  it("should render the bootstrap credentials file path for non-admin sessions", async () => {
    const { container } = await renderPasswordChangeScreen({
      bootstrapCredentialsFilePath: "C:\\ShiftMgmt\\data\\bootstrap-credentials.json",
      session: {
        userId: "user-operator",
        loginId: "operator",
        role: "operator",
        displayName: "사용자"
      }
    });

    expect(container.textContent).toContain("bootstrap-credentials.json");
  });

  it("should render the runtime-only session policy hint", async () => {
    const { container } = await renderPasswordChangeScreen();

    expect(container.textContent).toContain(`8${"\uC2DC\uAC04"}`);
    expect(container.textContent).toContain("\uB2E4\uC2DC \uB85C\uADF8\uC778");
  });

  it("should update the password policy checklist in real time", async () => {
    const { container } = await renderPasswordChangeScreen();
    const inputs = container.querySelectorAll("input");
    const nextPasswordInput = inputs.item(1) as HTMLInputElement | null;

    await act(async () => {
      setInputValue(nextPasswordInput, "Admin1234!");
    });

    expect(container.querySelectorAll(".password-policy-list li")).toHaveLength(5);
    expect(
      container.querySelector('[data-rule-key="uppercase"]')?.className
    ).toContain("is-met");
    expect(
      container.querySelector('[data-rule-key="lowercase"]')?.className
    ).toContain("is-met");
    expect(container.querySelector('[data-rule-key="number"]')?.className).toContain("is-met");
    expect(container.querySelector('[data-rule-key="special"]')?.className).toContain("is-met");
  });

  it("should block submit when the confirmation does not match", async () => {
    const { container, handleSubmit } = await renderPasswordChangeScreen();
    const inputs = container.querySelectorAll("input");
    const currentPasswordInput = inputs.item(0) as HTMLInputElement | null;
    const nextPasswordInput = inputs.item(1) as HTMLInputElement | null;
    const nextPasswordConfirmationInput = inputs.item(2) as HTMLInputElement | null;
    const submitButton = container.querySelector("button.primary-button") as HTMLButtonElement | null;

    await act(async () => {
      setInputValue(currentPasswordInput, DEFAULT_ADMIN_BOOTSTRAP_PASSWORD);
      setInputValue(nextPasswordInput, "AdminChanged123!");
      setInputValue(nextPasswordConfirmationInput, "AdminChanged999!");
      submitButton?.click();
    });

    expect(container.textContent).toContain(
      "\uC0C8\uB85C\uC6B4 \uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
    );
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("should block submit when the new password does not satisfy the policy", async () => {
    const { container, handleSubmit } = await renderPasswordChangeScreen();
    const inputs = container.querySelectorAll("input");
    const currentPasswordInput = inputs.item(0) as HTMLInputElement | null;
    const nextPasswordInput = inputs.item(1) as HTMLInputElement | null;
    const nextPasswordConfirmationInput = inputs.item(2) as HTMLInputElement | null;
    const submitButton = container.querySelector("button.primary-button") as HTMLButtonElement | null;

    await act(async () => {
      setInputValue(currentPasswordInput, DEFAULT_ADMIN_BOOTSTRAP_PASSWORD);
      setInputValue(nextPasswordInput, "admin1234!");
      setInputValue(nextPasswordConfirmationInput, "admin1234!");
      submitButton?.click();
    });

    expect(container.textContent).toContain(getPasswordPolicyErrorMessage("새로운 비밀번호"));
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
