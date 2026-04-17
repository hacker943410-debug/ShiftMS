// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllowanceHistoryPanel } from "./AllowanceHistoryPanel";

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

const sampleCalculation = {
  earlyPayoutDate: "2026-04-20",
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
      { allowanceCode: "base" as const, amount: 45000, multiplier: 1, workMinutes: 120 },
      { allowanceCode: "overtime" as const, amount: 50000, multiplier: 1.5, workMinutes: 90 },
      { allowanceCode: "night" as const, amount: 30000, multiplier: 1.5, workMinutes: 60 }
    ],
    totalAllowanceAmount: 125000
  },
  status: "proposal-approved" as const,
  workDate: "2026-04-14",
  workType: "overtime" as const
};

const sampleProposalRecord = {
  approvedAt: "2026-04-18T10:00:00.000Z",
  approvedBy: "admin",
  approvedByName: "결재자",
  backupSummary: {
    accessBackupPath: "C:/backup/access.accdb",
    createdAt: "2026-04-18T10:05:00.000Z",
    excelBackupPath: "C:/backup/source.xlsx",
    jsonBackupPath: "C:/backup/data.json",
    warningMessages: []
  },
  calculationCount: 1,
  calculationIds: ["calc-1"],
  comment: "최종 승인",
  earlyPayoutTotalAllowanceAmount: 0,
  employeeCount: 1,
  exportRecordId: "export-1",
  id: "proposal-1",
  outputFormat: "pdf" as const,
  previewSnapshot: {
    calculationCount: 1,
    earlyPayoutSiteSummaries: [],
    earlyPayoutTotalAllowanceAmount: 0,
    employeeCount: 1,
    generatedAt: "2026-04-18T10:00:00.000Z",
    regularSiteSummaries: [],
    regularTotalAllowanceAmount: 125000,
    rows: [],
    totalAllowanceAmount: 125000,
    workMonth: "2026-04"
  },
  regularTotalAllowanceAmount: 125000,
  totalAllowanceAmount: 125000,
  workMonth: "2026-04"
};

const baseProps = {
  allowanceStatusClassNameByCode: {
    approved: "allowance-status-pill approved",
    pending: "allowance-status-pill pending",
    rejected: "allowance-status-pill rejected",
    "proposal-approved": "allowance-status-pill proposal-approved"
  },
  detailIcon: <span>detail</span>,
  expandedDetailIds: ["calc-1"],
  expandedSiteNames: ["본관"],
  formatCurrencyValue: (value: number) => `${value.toLocaleString("ko-KR")}원`,
  formatDateTimeValue: (value?: string) => value ?? "-",
  formatDateValue: (value?: string) => value ?? "-",
  formatHoursValue: (minutes: number) => `${minutes / 60}h`,
  getBreakdownSummaryValue: () => "4.5h / 2h / 1.5h / 1h",
  getWorkTypeValue: () => "overtime" as const,
  historyGroups: [
    {
      baseWorkMinutes: 120,
      nightMinutes: 60,
      overtimeMinutes: 90,
      rows: [
        {
          calculation: sampleCalculation,
          latestExportedAt: "2026-04-18T09:00:00.000Z",
          latestOutputFormat: "pdf" as const,
          latestReviewComment: "확인 완료",
          latestReviewedAt: "2026-04-17T02:03:04.000Z",
          latestReviewedByName: "관리자",
          proposalApproval: {
            approvedAt: "2026-04-18T10:00:00.000Z",
            approvedByName: "결재자"
          },
          registeredAt: "2026-04-17T01:02:03.000Z",
          rowId: "calc-1"
        }
      ],
      siteName: "본관",
      totalAllowanceAmount: 125000,
      totalWorkMinutes: 270
    }
  ] as never,
  isLoading: false,
  onOpenProposalApprovalRecord: vi.fn(),
  onToggleExpandedDetail: vi.fn(),
  onToggleExpandedSite: vi.fn(),
  proposalApprovals: [sampleProposalRecord] as never,
  statusLabelByCode: {
    approved: "승인",
    pending: "검토대기",
    rejected: "반려",
    "proposal-approved": "품의승인"
  },
  workTypeLabelByType: {
    holiday: "휴일근무",
    overtime: "연장근무",
    substitute: "대체근무"
  },
  workTypePillClassNameByType: {
    holiday: "performance-section-pill legal-holiday",
    overtime: "performance-section-pill overtime",
    substitute: "performance-section-pill substitute"
  }
};

describe("AllowanceHistoryPanel", () => {
  it("should render history rows and forward expand and preview actions", async () => {
    const props = {
      ...baseProps,
      onOpenProposalApprovalRecord: vi.fn(),
      onToggleExpandedDetail: vi.fn(),
      onToggleExpandedSite: vi.fn()
    };
    const { container } = await renderComponent(<AllowanceHistoryPanel {...props} />);

    expect(container.textContent).toContain("품의 이력");
    expect(container.textContent).toContain("품의 승인 기록");
    expect(container.textContent).toContain("홍길동");
    expect(container.textContent).toContain("수당 산출 상세");
    expect(container.textContent).toContain("PDF");

    const expandButton = container.querySelector(".allowance-expand-button") as HTMLButtonElement | null;
    const detailButton = container.querySelector(
      ".allowance-row-action-button"
    ) as HTMLButtonElement | null;
    const previewButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim().includes("미리보기")
    );

    await act(async () => {
      expandButton?.click();
      detailButton?.click();
      previewButton?.click();
    });

    expect(props.onToggleExpandedSite).toHaveBeenCalledWith("본관");
    expect(props.onToggleExpandedDetail).toHaveBeenCalledWith("calc-1");
    expect(props.onOpenProposalApprovalRecord).toHaveBeenCalledWith(sampleProposalRecord);
  });

  it("should render loading states for both tables", async () => {
    const { container } = await renderComponent(
      <AllowanceHistoryPanel
        {...baseProps}
        expandedDetailIds={[]}
        expandedSiteNames={[]}
        historyGroups={[] as never}
        isLoading
        proposalApprovals={[] as never}
      />
    );

    expect(container.textContent).toContain("품의 이력을 불러오는 중입니다.");
    expect(container.textContent).toContain("품의 승인 기록을 불러오는 중입니다.");
  });
});
