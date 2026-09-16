// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WageRateRecord } from "../../../shared/domain/model";
import { WageHistoryTable } from "./WageHistoryTable";
import type { WageHistoryIssue } from "./wage-rate-timeline";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WageHistoryTable", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  const renderTable = (props: React.ComponentProps<typeof WageHistoryTable>) => {
    act(() => {
      root!.render(<WageHistoryTable {...props} />);
    });
  };

  const sampleRates: WageRateRecord[] = [
    {
      id: "rate-1",
      employeeId: "emp-1",
      employeeCode: "EMP-001",
      employeeName: "김현우",
      hourlyRate: 15000,
      effectiveFrom: "2026-04-01",
      reason: "정기 인상",
      createdAt: "2026-04-01T00:00:00.000Z"
    },
    {
      id: "rate-2",
      employeeId: "emp-1",
      employeeCode: "EMP-001",
      employeeName: "김현우",
      hourlyRate: 14000,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-03-31",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ];

  it("should render six table headers and correct span labels for active and closed rows", () => {
    renderTable({
      wageRates: sampleRates,
      onCorrect: vi.fn(),
      onDelete: vi.fn()
    });

    const headers = Array.from(container!.querySelectorAll("th")).map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      "적용 시작일",
      "적용 종료일",
      "통상시급",
      "변경 사유",
      "상태·문제",
      "관리"
    ]);

    const rows = container!.querySelectorAll("tbody tr.wage-history-row");
    expect(rows).toHaveLength(2);

    const firstRowCells = Array.from(rows[0]!.querySelectorAll("td")).map((td) => td.textContent?.trim());
    expect(firstRowCells[0]).toBe("2026.04.01");
    expect(firstRowCells[1]).toBe("계속");
    expect(firstRowCells[2]).toBe("15,000원");
    expect(firstRowCells[3]).toBe("정기 인상");

    const secondRowCells = Array.from(rows[1]!.querySelectorAll("td")).map((td) => td.textContent?.trim());
    expect(secondRowCells[0]).toBe("2026.01.01");
    expect(secondRowCells[1]).toBe("2026.03.31");
    expect(secondRowCells[2]).toBe("14,000원");
    expect(secondRowCells[3]).toBe("-");
  });

  it("should display '정상' when no issues exist and display multiple issue messages when issues are present", () => {
    const issues: WageHistoryIssue[] = [
      {
        id: "issue-1",
        rateId: "rate-2",
        code: "range-overlap",
        kind: "overlap",
        causeKey: "cause-1",
        message: "앞선 이력과 기간이 겹칩니다."
      },
      {
        id: "issue-2",
        rateId: "rate-2",
        code: "range-gap",
        kind: "gap",
        causeKey: "cause-2",
        message: "다음 이력과 공백이 있습니다."
      }
    ];

    renderTable({
      wageRates: sampleRates,
      issues,
      onCorrect: vi.fn(),
      onDelete: vi.fn()
    });

    const rows = container!.querySelectorAll("tbody tr.wage-history-row");
    const firstRowIssuesCell = rows[0]!.querySelector(".wage-history-cell-issues");
    expect(firstRowIssuesCell?.textContent?.trim()).toBe("정상");

    const secondRowIssuesCell = rows[1]!.querySelector(".wage-history-cell-issues");
    const issueTags = Array.from(secondRowIssuesCell!.querySelectorAll(".wage-history-issue-tag")).map(
      (tag) => tag.textContent?.trim()
    );
    expect(issueTags).toEqual([
      "앞선 이력과 기간이 겹칩니다.",
      "다음 이력과 공백이 있습니다."
    ]);
  });

  it("should trigger onCorrect and onDelete callbacks with target rate and accessible button labels", () => {
    const onCorrect = vi.fn();
    const onDelete = vi.fn();

    renderTable({
      wageRates: sampleRates,
      onCorrect,
      onDelete
    });

    const correctButtons = container!.querySelectorAll<HTMLButtonElement>("button[aria-label$='정정']");
    const deleteButtons = container!.querySelectorAll<HTMLButtonElement>("button[aria-label$='삭제']");

    expect(correctButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);

    expect(correctButtons[0]?.getAttribute("aria-label")).toBe("2026-04-01 정정");
    expect(deleteButtons[0]?.getAttribute("aria-label")).toBe("2026-04-01 삭제");

    act(() => {
      correctButtons[0]?.click();
    });
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(sampleRates[0]);

    act(() => {
      deleteButtons[1]?.click();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(sampleRates[1]);
  });

  it("should handle loading, empty state, and disabled buttons accessibility correctly", () => {
    renderTable({
      wageRates: [],
      loading: true,
      onCorrect: vi.fn(),
      onDelete: vi.fn()
    });

    expect(container!.textContent).toContain("시급변경이력을 불러오는 중입니다.");

    renderTable({
      wageRates: [],
      loading: false,
      onCorrect: vi.fn(),
      onDelete: vi.fn()
    });

    expect(container!.textContent).toContain("등록된 시급변경이력이 없습니다.");

    renderTable({
      wageRates: sampleRates,
      disabled: true,
      onCorrect: vi.fn(),
      onDelete: vi.fn()
    });

    const buttons = Array.from(container!.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.disabled).toBe(true);
    });
  });
});
