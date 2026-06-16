// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogDismiss } from "./useDialogDismiss";

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

const DialogProbe = ({
  autoFocus,
  onDismiss
}: {
  autoFocus?: boolean;
  onDismiss?: () => void;
}) => {
  const { dialogRef, onKeyDown } = useDialogDismiss<HTMLDivElement>({ autoFocus, onDismiss });

  return (
    <div data-testid="dialog" onKeyDown={onKeyDown} ref={dialogRef} role="dialog" tabIndex={-1}>
      <button type="button">닫기</button>
    </div>
  );
};

const pressEscape = (target: Element) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" })
  );
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

describe("useDialogDismiss", () => {
  it("should call onDismiss when Escape is pressed", async () => {
    const onDismiss = vi.fn();
    const { container } = await renderComponent(<DialogProbe onDismiss={onDismiss} />);

    const dialog = container.querySelector('[data-testid="dialog"]');

    await act(async () => {
      if (dialog) {
        pressEscape(dialog);
      }
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should ignore Escape when no onDismiss is provided", async () => {
    const { container } = await renderComponent(<DialogProbe />);

    const dialog = container.querySelector('[data-testid="dialog"]');

    await act(async () => {
      if (dialog) {
        // 닫기 동작이 없을 때 Esc 를 눌러도 예외가 발생하지 않아야 한다.
        expect(() => pressEscape(dialog)).not.toThrow();
      }
    });
  });

  it("should move focus to the dialog when autoFocus is enabled", async () => {
    const { container } = await renderComponent(<DialogProbe onDismiss={vi.fn()} />);

    const dialog = container.querySelector('[data-testid="dialog"]');

    expect(document.activeElement).toBe(dialog);
  });

  it("should keep focus untouched when autoFocus is disabled", async () => {
    const { container } = await renderComponent(
      <DialogProbe autoFocus={false} onDismiss={vi.fn()} />
    );

    const dialog = container.querySelector('[data-testid="dialog"]');

    expect(document.activeElement).not.toBe(dialog);
  });
});
