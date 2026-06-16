// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDensityMode } from "./useDensityMode";

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

const DensityProbe = () => {
  const { mode, toggle } = useDensityMode();

  return (
    <button data-mode={mode} onClick={toggle} type="button">
      {mode}
    </button>
  );
};

beforeEach(() => {
  window.localStorage.clear();
  document.body.classList.remove("density-compact");
});

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

describe("useDensityMode", () => {
  it("should default to comfortable and not mark the body compact", async () => {
    const { container } = await renderComponent(<DensityProbe />);

    expect(container.querySelector("button")?.dataset.mode).toBe("comfortable");
    expect(document.body.classList.contains("density-compact")).toBe(false);
  });

  it("should toggle to compact, mark the body, and persist the choice", async () => {
    const { container } = await renderComponent(<DensityProbe />);

    await act(async () => {
      container.querySelector("button")?.click();
    });

    expect(container.querySelector("button")?.dataset.mode).toBe("compact");
    expect(document.body.classList.contains("density-compact")).toBe(true);
    expect(window.localStorage.getItem("shiftmgmt.density-mode")).toBe("compact");
  });

  it("should restore a stored compact preference on mount", async () => {
    window.localStorage.setItem("shiftmgmt.density-mode", "compact");

    const { container } = await renderComponent(<DensityProbe />);

    expect(container.querySelector("button")?.dataset.mode).toBe("compact");
    expect(document.body.classList.contains("density-compact")).toBe(true);
  });
});
