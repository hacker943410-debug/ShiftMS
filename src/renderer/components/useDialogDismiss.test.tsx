// @vitest-environment jsdom

import { act, useState } from "react";
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
      <button data-testid="first" type="button">
        처음
      </button>
      <button data-testid="last" type="button">
        닫기
      </button>
    </div>
  );
};

const RestorationProbe = () => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        data-testid="trigger"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        열기
      </button>
      {open ? (
        <DialogProbe
          onDismiss={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

const pressKey = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init })
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
        pressKey(dialog, "Escape");
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
        expect(() => pressKey(dialog, "Escape")).not.toThrow();
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

  it("should trap Tab focus within the dialog", async () => {
    const { container } = await renderComponent(<DialogProbe onDismiss={vi.fn()} />);

    const dialog = container.querySelector('[data-testid="dialog"]') as HTMLElement;
    const first = container.querySelector('[data-testid="first"]') as HTMLButtonElement;
    const last = container.querySelector('[data-testid="last"]') as HTMLButtonElement;

    // 마지막 요소에서 Tab → 첫 요소로 순환.
    await act(async () => {
      last.focus();
      pressKey(last, "Tab");
    });
    expect(document.activeElement).toBe(first);

    // 첫 요소에서 Shift+Tab → 마지막 요소로 순환.
    await act(async () => {
      first.focus();
      pressKey(first, "Tab", { shiftKey: true });
    });
    expect(document.activeElement).toBe(last);

    // 트랩이 동작하므로 포커스는 항상 모달 안에 머문다.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("should restore focus to the opener when the dialog closes", async () => {
    const { container } = await renderComponent(<RestorationProbe />);

    const trigger = container.querySelector('[data-testid="trigger"]') as HTMLButtonElement;

    await act(async () => {
      trigger.focus();
      trigger.click();
    });

    const dialog = container.querySelector('[data-testid="dialog"]');
    expect(document.activeElement).toBe(dialog);

    await act(async () => {
      if (dialog) {
        pressKey(dialog, "Escape");
      }
    });

    // 모달이 닫히면 모달을 열었던 버튼으로 포커스가 되돌아온다.
    expect(container.querySelector('[data-testid="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
