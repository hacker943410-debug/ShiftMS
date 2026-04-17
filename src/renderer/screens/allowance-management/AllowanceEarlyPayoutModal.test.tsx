// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllowanceEarlyPayoutModal } from "./AllowanceEarlyPayoutModal";

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
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text
  ) ??
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.trim().includes(text)
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
});

const baseProps = {
  editor: {
    calculationId: "calc-1",
    employeeName: "홍길동",
    siteName: "본관",
    value: "2026-04-20"
  },
  isProcessing: false,
  onClear: vi.fn(),
  onClose: vi.fn(),
  onSave: vi.fn(),
  onValueChange: vi.fn(),
  processingKey: null
};

describe("AllowanceEarlyPayoutModal", () => {
  it("should render draft state and forward close and save actions", async () => {
    const props = {
      ...baseProps,
      onClose: vi.fn(),
      onSave: vi.fn()
    };
    const { container } = await renderComponent(<AllowanceEarlyPayoutModal {...props} />);

    expect(container.textContent).toContain("퇴직자 선지급 설정");
    expect(container.textContent).toContain("선지급 미승인");
    expect(container.textContent).toContain("홍길동 / 본관");
    expect(container.textContent).toContain("2026-04-20");

    await act(async () => {
      findButtonByText(container, "취소")?.click();
      findButtonByText(container, "선지급")?.click();
    });

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("should render approved state and forward clear action", async () => {
    const props = {
      ...baseProps,
      editor: {
        ...baseProps.editor,
        existingValue: "2026-04-20"
      },
      onClear: vi.fn()
    };
    const { container } = await renderComponent(<AllowanceEarlyPayoutModal {...props} />);

    expect(container.textContent).toContain("선지급 승인");
    const approveButton = findButtonByText(container, "선지급 승인") as
      | HTMLButtonElement
      | undefined;
    expect(approveButton).toBeTruthy();
    expect(approveButton?.disabled).toBe(true);

    await act(async () => {
      findButtonByText(container, "선지급 취소")?.click();
    });

    expect(props.onClear).toHaveBeenCalledTimes(1);
  });
});
