// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authSessionPolicy } from "@shared/config/auth-session-policy";

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
}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  const handleSubmit = vi.fn<
    (value: { currentPassword: string; nextPassword: string }) => Promise<void>
  >(async () => undefined);
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
          passwordChangeRequired: true
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
  it("should render the bootstrap credentials file path when provided", async () => {
    const { container } = await renderPasswordChangeScreen({
      bootstrapCredentialsFilePath: "C:\\ShiftMgmt\\data\\bootstrap-credentials.json"
    });

    expect(container.textContent).toContain("bootstrap-credentials.json");
  });

  it("should render the runtime-only session policy hint", async () => {
    const { container } = await renderPasswordChangeScreen();

    expect(container.textContent).toContain(`8${"\uC2DC\uAC04"}`);
    expect(container.textContent).toContain("\uB2E4\uC2DC \uB85C\uADF8\uC778");
  });

  it("should block submit when the confirmation does not match", async () => {
    const { container, handleSubmit } = await renderPasswordChangeScreen();
    const inputs = container.querySelectorAll("input");
    const currentPasswordInput = inputs.item(0) as HTMLInputElement | null;
    const nextPasswordInput = inputs.item(1) as HTMLInputElement | null;
    const nextPasswordConfirmationInput = inputs.item(2) as HTMLInputElement | null;
    const submitButton = container.querySelector("button.primary-button") as HTMLButtonElement | null;

    await act(async () => {
      setInputValue(currentPasswordInput, "admin1234");
      setInputValue(nextPasswordInput, "AdminChanged123!");
      setInputValue(nextPasswordConfirmationInput, "AdminChanged999!");
      submitButton?.click();
    });

    expect(container.textContent).toContain(
      "\uC0C8 \uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
    );
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
