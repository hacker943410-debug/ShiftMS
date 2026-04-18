// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllowanceProposalPreviewModal } from "./AllowanceProposalPreviewModal";

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

const baseModal = {
  calculationIds: ["calc-1"],
  mode: "draft" as const,
  preview: {
    calculationCount: 1,
    earlyPayoutSiteSummaries: [],
    earlyPayoutTotalAllowanceAmount: 0,
    employeeCount: 1,
    generatedAt: "2026-04-18T10:00:00.000Z",
    regularSiteSummaries: [
      {
        customerName: "고객사A",
        holidayAmount: 0,
        overtimeAmount: 125000,
        siteName: "본관",
        substituteAmount: 0,
        totalAmount: 125000
      }
    ],
    regularTotalAllowanceAmount: 125000,
    rows: [
      {
        businessCategoryLabel: "연장근무",
        calculationId: "calc-1",
        customerName: "고객사A",
        employeeCode: "E-01",
        employeeName: "홍길동",
        siteName: "본관",
        totalAllowanceAmount: 125000,
        totalWorkMinutes: 270,
        workDate: "2026-04-14",
        workType: "overtime" as const
      }
    ],
    totalAllowanceAmount: 125000,
    workMonth: "2026-04"
  }
};

const baseProps = {
  canApproveProposal: true,
  formatCurrencyValue: (value: number) => `${value.toLocaleString("ko-KR")}원`,
  formatDateTimeValue: (value?: string) => value ?? "-",
  formatDateValue: (value?: string) => value ?? "-",
  formatHoursValue: (minutes: number) => `${minutes / 60}h`,
  getWorkTypeValue: () => "overtime" as const,
  isProcessing: false,
  modal: baseModal,
  onApprove: vi.fn(),
  onClose: vi.fn(),
  onCommentChange: vi.fn(),
  onOpenGuide: vi.fn(),
  processingKey: null,
  proposalComment: "",
  workTypeLabelByType: {
    holiday: "휴일근무",
    overtime: "연장근무",
    substitute: "대체근무"
  }
};

describe("AllowanceProposalPreviewModal", () => {
  it("should render draft preview and forward guide, comment, close, approve actions", async () => {
    const props = {
      ...baseProps,
      onApprove: vi.fn(),
      onClose: vi.fn(),
      onCommentChange: vi.fn(),
      onOpenGuide: vi.fn()
    };
    const { container } = await renderComponent(<AllowanceProposalPreviewModal {...props} />);

    expect(container.textContent).toContain("품의 승인 미리보기");
    expect(container.textContent).toContain("총 승인 금액");
    expect(container.textContent).toContain("홍길동");
    expect(container.textContent).toContain("연장근무");

    const textarea = container.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Textarea not found");
    }

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setValue?.call(textarea, "메모");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      findButtonByText(container, "가이드 보기")?.click();
      findButtonByText(container, "닫기")?.click();
      findButtonByText(container, "최종 품의 승인")?.click();
    });

    expect(props.onCommentChange).toHaveBeenCalledWith("메모");
    expect(props.onOpenGuide).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onApprove).toHaveBeenCalledTimes(1);
  });

  it("should render history mode comment without approve action", async () => {
    const { container } = await renderComponent(
      <AllowanceProposalPreviewModal
        {...baseProps}
        modal={{
          ...baseModal,
          mode: "history",
          record: {
            comment: "최종 승인 메모"
          }
        } as never}
      />
    );

    expect(container.textContent).toContain("품의 승인 상세");
    expect(container.textContent).toContain("승인 메모");
    expect(container.textContent).toContain("최종 승인 메모");
    expect(findButtonByText(container, "최종 품의 승인")).toBeUndefined();
  });

  it("should hide the draft approve action without approval permission", async () => {
    const { container } = await renderComponent(
      <AllowanceProposalPreviewModal {...baseProps} canApproveProposal={false} />
    );

    expect(findButtonByText(container, "최종 품의 승인")).toBeUndefined();
  });
});
