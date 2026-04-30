// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OperationsReleaseHistorySection } from "./OperationsReleaseHistorySection";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderSection = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  Object.assign(window, {
    appBridge: {
      listReleaseHistory: vi.fn(async () => ({
        ok: true,
        data: [
          {
            version: "0.4.8",
            required: false,
            headline: "0.4.8 패치이력 게시판 전환",
            summary: "패치이력을 게시판 목록과 상세 보기로 분리했습니다.",
            notes: ["게시판 목록"],
            sections: [
              {
                title: "패치이력 게시판",
                items: [
                  {
                    title: "게시판 목록",
                    detail: "Patch Note 0.4.8 항목을 클릭해 상세 내용을 확인합니다."
                  }
                ]
              }
            ],
            requiresDbBackup: false,
            publishedAt: "2026-04-30T00:00:00.000Z"
          }
        ]
      }))
    }
  });

  await act(async () => {
    root.render(<OperationsReleaseHistorySection />);
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return container;
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

  vi.restoreAllMocks();
});

describe("OperationsReleaseHistorySection", () => {
  it("shows release notes as board posts and opens the selected detail page", async () => {
    const container = await renderSection();

    expect(container.textContent).toContain("Patch Note 0.4.8");
    expect(container.textContent).not.toContain("Patch Note 0.4.8 항목을 클릭해 상세 내용을 확인합니다.");

    const postButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Patch Note 0.4.8"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      postButton?.click();
    });

    expect(container.textContent).toContain("0.4.8 패치이력 게시판 전환");
    expect(container.textContent).toContain("Patch Note 0.4.8 항목을 클릭해 상세 내용을 확인합니다.");

    const backButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "목록으로"
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      backButton?.click();
    });

    expect(container.textContent).toContain("Patch Note 0.4.8");
    expect(container.textContent).not.toContain("Patch Note 0.4.8 항목을 클릭해 상세 내용을 확인합니다.");
  });
});
