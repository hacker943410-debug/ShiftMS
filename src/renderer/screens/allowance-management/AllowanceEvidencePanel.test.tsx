// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AllowanceEvidencePanel } from "./AllowanceEvidencePanel";

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

const baseResult = {
  employeeName: "홍길동",
  fileName: "allowance.xlsx",
  hourlyRate: 15000,
  id: "calc-1",
  rateVersionLabel: "2026-04 기본",
  siteName: "본관",
  snapshot: {
    breakdown: {
      baseWorkMinutes: 120,
      nightMinutes: 60,
      overtimeMinutes: 90,
      totalWorkMinutes: 270
    },
    businessCategoryLabel: "연장근무",
    createdAt: "2026-04-17T01:02:03.000Z",
    lines: [
      { allowanceCode: "night" as const, amount: 30000, multiplier: 1.5, workMinutes: 60 },
      { allowanceCode: "base" as const, amount: 45000, multiplier: 1, workMinutes: 120 },
      { allowanceCode: "overtime" as const, amount: 50000, multiplier: 1.5, workMinutes: 90 }
    ],
    totalAllowanceAmount: 125000
  },
  status: "approved" as const,
  workDate: "2026-04-14"
} as const;

describe("AllowanceEvidencePanel", () => {
  it("should render reviewed evidence details and ledger rows", async () => {
    const { container } = await renderComponent(
      <AllowanceEvidencePanel
        formatCurrencyValue={(value) => `${value.toLocaleString("ko-KR")}원`}
        formatDateTimeValue={(value) => value ?? "-"}
        formatDateValue={(value) => value ?? "-"}
        formatHoursValue={(minutes) => `${minutes / 60}h`}
        result={baseResult as never}
        reviewComment="확인 완료"
        reviewedAt="2026-04-17T02:03:04.000Z"
        reviewedByName="관리자"
        statusLabelByCode={{
          approved: "승인",
          pending: "검토대기",
          rejected: "반려",
          "proposal-approved": "품의승인"
        }}
      />
    );

    expect(container.textContent).toContain("수당 산출 상세");
    expect(container.textContent).toContain("홍길동 · 본관 · 2026-04-14 · 산출 파일 allowance.xlsx");
    expect(container.textContent).toContain("적용 요율 2026-04 기본 · 승인 · 관리자 · 2026-04-17T02:03:04.000Z · 확인 완료");
    expect(container.textContent).toContain("기본");
    expect(container.textContent).toContain("연장");
    expect(container.textContent).toContain("야간");
    expect(container.textContent).toContain("총 금액");
  });

  it("should render proposal-approved status detail", async () => {
    const { container } = await renderComponent(
      <AllowanceEvidencePanel
        formatCurrencyValue={(value) => `${value.toLocaleString("ko-KR")}원`}
        formatDateTimeValue={(value) => value ?? "-"}
        formatDateValue={(value) => value ?? "-"}
        formatHoursValue={(minutes) => `${minutes / 60}h`}
        proposalApproval={{
          approvedAt: "2026-04-18T10:00:00.000Z",
          approvedByName: "결재자"
        } as never}
        result={{ ...baseResult, status: "proposal-approved" } as never}
        statusLabelByCode={{
          approved: "승인",
          pending: "검토대기",
          rejected: "반려",
          "proposal-approved": "품의승인"
        }}
      />
    );

    expect(container.textContent).toContain("품의 승인 · 결재자 · 2026-04-18T10:00:00.000Z");
    expect(container.textContent).toContain("품의승인");
  });
});
