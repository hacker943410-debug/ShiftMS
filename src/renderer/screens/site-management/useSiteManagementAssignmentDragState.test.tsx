// @vitest-environment jsdom

import { act, type DragEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSiteManagementAssignmentDragState } from "./useSiteManagementAssignmentDragState";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];
let latestState: ReturnType<typeof useSiteManagementAssignmentDragState> | null = null;

const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const cancelAnimationFrameSpy = vi.fn();
const requestAnimationFrameSpy = vi.fn<(callback: FrameRequestCallback) => number>();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HookHarness = () => {
  latestState = useSiteManagementAssignmentDragState();
  return null;
};

const renderHookHarness = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<HookHarness />);
  });

  if (!latestState) {
    throw new Error("assignment drag state hook did not initialize");
  }

  return latestState;
};

beforeEach(() => {
  requestAnimationFrameSpy.mockImplementation(() => 41);
  window.requestAnimationFrame = requestAnimationFrameSpy;
  window.cancelAnimationFrame = cancelAnimationFrameSpy;
});

afterEach(async () => {
  latestState = null;
  requestAnimationFrameSpy.mockReset();
  cancelAnimationFrameSpy.mockReset();
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;

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

describe("useSiteManagementAssignmentDragState", () => {
  it("should initialize without an active dragging employee", async () => {
    const state = await renderHookHarness();

    expect(state.draggingEmployeeId).toBeNull();
    expect(state.draggingEmployeeSourceTeam).toBeNull();
  });

  it("should start dragging and queue auto scroll only while dragging", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.handleAssignmentDragAutoScroll({
        clientX: 120,
        clientY: 240,
        target: document.body
      } as unknown as DragEvent<HTMLElement>);
    });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    await act(async () => {
      latestState?.handleStepTwoDragStart("emp-1", "A조");
    });

    expect(latestState).toMatchObject({
      draggingEmployeeId: "emp-1",
      draggingEmployeeSourceTeam: "A조"
    });

    await act(async () => {
      latestState?.handleAssignmentDragAutoScroll({
        clientX: 120,
        clientY: 240,
        target: document.body
      } as unknown as DragEvent<HTMLElement>);
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it("should clear dragging state and stop the queued auto scroll", async () => {
    const state = await renderHookHarness();

    await act(async () => {
      state.handleStepTwoDragStart("emp-9", "미배정");
    });

    await act(async () => {
      latestState?.handleAssignmentDragAutoScroll({
        clientX: 180,
        clientY: 300,
        target: document.body
      } as unknown as DragEvent<HTMLElement>);
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      latestState?.clearDraggingEmployee();
    });

    expect(latestState).toMatchObject({
      draggingEmployeeId: null,
      draggingEmployeeSourceTeam: null
    });
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(41);
  });
});
