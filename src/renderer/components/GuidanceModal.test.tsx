// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuidanceModal } from "./GuidanceModal";
import type { GuidanceConfig } from "../contexts/app-workflow-context";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const baseConfig: GuidanceConfig = {
  title: "지금은 근무지 반려를 할 수 없습니다",
  why: "이 근무지 실적이 지금 승인완료 상태로 보관돼 있지 않습니다.",
  steps: [
    { title: "실적 관리 화면 열기", description: "왼쪽 메뉴의 실적 관리로 이동하세요." },
    { title: "승인완료 확인", description: "해당 월을 승인완료로 조회하세요." }
  ],
  notes: ["※ 파일을 탐색기로 직접 옮기지 마세요."],
  navigation: { label: "실적 관리로 이동", route: "performance" }
};

const renderModal = async (
  config: GuidanceConfig,
  handlers: {
    onNavigate?: (route: string, params?: unknown) => void;
    onClose?: () => void;
  } = {}
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(
      <GuidanceModal
        config={config}
        onClose={handlers.onClose ?? (() => {})}
        onNavigate={handlers.onNavigate ?? (() => {})}
      />
    );
  });

  return { container };
};

const findButtonByText = (container: HTMLElement, text: string) =>
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

describe("GuidanceModal", () => {
  it("renders the title, the why-it-is-blocked callout, and the numbered steps", async () => {
    const { container } = await renderModal(baseConfig);

    expect(container.textContent).toContain("지금은 근무지 반려를 할 수 없습니다");
    expect(container.querySelector(".guidance-why-box")?.textContent).toContain(
      "승인완료 상태로 보관돼 있지 않습니다"
    );
    expect(container.textContent).toContain("실적 관리 화면 열기");
    expect(container.textContent).toContain("승인완료 확인");
    expect(container.querySelectorAll(".guide-step-card")).toHaveLength(2);
    expect(container.textContent).toContain("※ 파일을 탐색기로 직접 옮기지 마세요.");
  });

  it("navigates with the configured route then closes when the action button is clicked", async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { container } = await renderModal(baseConfig, { onNavigate, onClose });

    const navButton = findButtonByText(container, "실적 관리로 이동");
    await act(async () => {
      navButton?.click();
    });

    expect(onNavigate).toHaveBeenCalledWith("performance", undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes (without navigating) when the 닫기 button is clicked", async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { container } = await renderModal(baseConfig, { onNavigate, onClose });

    const closeButton = findButtonByText(container, "닫기");
    await act(async () => {
      closeButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("closes when Escape is pressed on the overlay", async () => {
    const onClose = vi.fn();
    const { container } = await renderModal(baseConfig, { onClose });

    const overlay = container.querySelector(".modal-overlay") as HTMLDivElement;
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a single close button (no navigation) when no navigation is configured", async () => {
    const onClose = vi.fn();
    const withoutNavigation: GuidanceConfig = {
      title: baseConfig.title,
      why: baseConfig.why,
      steps: baseConfig.steps,
      notes: baseConfig.notes
    };
    const { container } = await renderModal(withoutNavigation, { onClose });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent?.trim()).toBe("닫기");

    await act(async () => {
      buttons[0]?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes dialog accessibility attributes", async () => {
    const { container } = await renderModal(baseConfig);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog?.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(container.querySelector("h3")?.id).toBe(labelledBy);
  });
});
