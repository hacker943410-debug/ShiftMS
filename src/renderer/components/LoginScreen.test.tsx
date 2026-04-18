// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authSessionPolicy } from "@shared/config/auth-session-policy";

import { LoginScreen } from "./LoginScreen";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderLoginScreen = async (input?: { bootstrapCredentialsFilePath?: string | null }) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  const handleSubmit = vi.fn<(value: { loginId: string; password: string }) => Promise<void>>(
    async () => undefined
  );

  await act(async () => {
    root.render(
      <LoginScreen
        appVersion="0.3.2"
        bootstrapCredentialsFilePath={input?.bootstrapCredentialsFilePath ?? null}
        demoAccounts={[
          { label: "Admin", loginId: "admin" },
          { label: "Operator", loginId: "operator" },
          { label: "Reviewer", loginId: "reviewer" }
        ]}
        errorMessage={null}
        isSubmitting={false}
        onSubmit={handleSubmit}
        sessionPolicy={authSessionPolicy}
      />
    );
  });

  return { container };
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

  it("should only fill the login id when a quick account button is selected", async () => {
    const { container } = await renderLoginScreen();
    const adminButton = container.querySelector(".demo-account") as HTMLButtonElement | null;
    const inputs = container.querySelectorAll("input");
    const loginIdInput = inputs.item(0) as HTMLInputElement | null;
    const passwordInput = inputs.item(1) as HTMLInputElement | null;

    await act(async () => {
      adminButton?.click();
    });

    expect(loginIdInput?.value).toBe("admin");
    expect(passwordInput?.value).toBe("");
  });

  it("should render every configured quick account button", async () => {
    const { container } = await renderLoginScreen();

    expect(container.querySelectorAll(".demo-account")).toHaveLength(3);
    expect(container.textContent).toContain("reviewer");
  });

  it("should render the bootstrap credentials file path when provided", async () => {
    const { container } = await renderLoginScreen({
      bootstrapCredentialsFilePath: "C:\\ShiftMgmt\\data\\bootstrap-credentials.json"
    });

    expect(container.textContent).toContain("bootstrap-credentials.json");
  });

  it("should render the runtime-only session policy hint", async () => {
    const { container } = await renderLoginScreen();

    expect(container.textContent).toContain(`8${"\uC2DC\uAC04"}`);
    expect(container.textContent).toContain("\uB2E4\uC2DC \uB85C\uADF8\uC778");
  });
});
