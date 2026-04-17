// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteTimeRangePicker } from "./SiteTimeRangePicker";

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

const selectOptionFromShell = async (shell: Element, optionText: string) => {
  const control = shell.querySelector(".app-select-control") as HTMLButtonElement | null;

  expect(control).toBeTruthy();

  await act(async () => {
    control?.click();
  });

  const optionButton = Array.from(shell.querySelectorAll(".app-select-option")).find((button) =>
    button.textContent?.includes(optionText)
  ) as HTMLButtonElement | undefined;

  expect(optionButton).toBeTruthy();

  await act(async () => {
    optionButton?.click();
  });
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

describe("SiteTimeRangePicker", () => {
  it("should render the fallback time range preview when value is blank", async () => {
    const { container } = await renderComponent(
      <SiteTimeRangePicker fallbackValue="09:00 - 18:00" onChange={vi.fn()} value="" />
    );

    expect(container.textContent).toContain("시작");
    expect(container.textContent).toContain("종료");
    expect(container.textContent).toContain("09:00 - 18:00");
  });

  it("should build the next time range as individual parts change", async () => {
    const onChange = vi.fn();
    const Harness = () => {
      const [value, setValue] = useState("09:00 - 18:00");

      return (
        <SiteTimeRangePicker
          fallbackValue="09:00 - 18:00"
          onChange={(nextValue) => {
            setValue(nextValue);
            onChange(nextValue);
          }}
          value={value}
        />
      );
    };
    const { container } = await renderComponent(
      <Harness />
    );

    const shells = Array.from(container.querySelectorAll(".site-time-part-shell"));

    expect(shells).toHaveLength(4);

    await selectOptionFromShell(shells[0]!, "08");
    await selectOptionFromShell(shells[1]!, "15");
    await selectOptionFromShell(shells[2]!, "17");
    await selectOptionFromShell(shells[3]!, "45");

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith("08:15 - 17:45");
  });
});
