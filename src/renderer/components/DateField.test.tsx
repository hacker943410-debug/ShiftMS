// @vitest-environment jsdom

import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateField } from "./DateField";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(window as unknown as { appBridge: unknown }).appBridge = {
  listHolidayCalendars: vi.fn().mockResolvedValue({ ok: true, data: [] })
};

const renderComponent = async (element: ReactElement) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(element);
  });

  return container;
};

afterEach(async () => {
  await act(async () => {
    mountedRoots.splice(0).forEach((root) => {
      root.unmount();
    });
  });
  mountedContainers.splice(0).forEach((container) => {
    container.remove();
  });
});

const DateFieldProbe = ({ initial, min }: { initial: string; min?: string }) => {
  const [value, setValue] = useState(initial);

  return (
    <div>
      <DateField min={min} onChange={setValue} value={value} />
      <button data-testid="outside" type="button">
        미리보기
      </button>
      <output data-testid="committed">{value}</output>
    </div>
  );
};

const openPicker = async (container: HTMLElement) => {
  await act(async () => {
    container.querySelector<HTMLButtonElement>(".date-field-control")!.click();
  });
};

const findDayButton = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>(".date-field-day")).find(
    (button) => !button.classList.contains("is-muted") && button.textContent === label
  );

const clickDay = async (container: HTMLElement, label: string) => {
  const dayButton = findDayButton(container, label);

  expect(dayButton).toBeTruthy();

  await act(async () => {
    dayButton!.click();
  });
};

const committedValue = (container: HTMLElement) =>
  container.querySelector('[data-testid="committed"]')?.textContent;

describe("DateField", () => {
  it("should commit the picked day immediately without a confirm step", async () => {
    const container = await renderComponent(<DateFieldProbe initial="2026-07-29" />);

    await openPicker(container);
    await clickDay(container, "1");

    expect(committedValue(container)).toBe("2026-07-01");
    expect(container.querySelector(".date-field-popover")).toBeNull();
  });

  it("should keep the picked day when the user clicks somewhere else afterwards", async () => {
    const container = await renderComponent(<DateFieldProbe initial="2026-07-29" />);

    await openPicker(container);
    await clickDay(container, "1");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="outside"]')!
        .dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    });

    expect(committedValue(container)).toBe("2026-07-01");
    expect(container.querySelector(".date-field-value")?.textContent).toBe("2026-07-01");
  });

  it("should keep the current value when the popover is closed without picking a day", async () => {
    const container = await renderComponent(<DateFieldProbe initial="2026-07-29" />);

    await openPicker(container);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="outside"]')!
        .dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    });

    expect(committedValue(container)).toBe("2026-07-29");
  });

  it("should ignore days outside the allowed range", async () => {
    const container = await renderComponent(
      <DateFieldProbe initial="2026-07-29" min="2026-07-10" />
    );

    await openPicker(container);

    const blockedDay = findDayButton(container, "1");

    expect(blockedDay?.disabled).toBe(true);

    await act(async () => {
      blockedDay!.click();
    });

    expect(committedValue(container)).toBe("2026-07-29");
  });
});
