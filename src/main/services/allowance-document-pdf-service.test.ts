import { describe, expect, it } from "vitest";

import {
  buildProposalLayoutConfigForTest,
  renderAttachmentOneTitleHtmlForTest,
  renderAttachmentRateGuideHtmlForTest,
  renderProposalHighlightCardHtmlForTest,
  renderProposalMetaTableHtmlForTest
} from "./allowance-document-pdf-service";

describe("allowance-document-pdf-service", () => {
  it("renders attachment1 rate guide with separate block lines for applied values and formulas", () => {
    const html = renderAttachmentRateGuideHtmlForTest([
      {
        lines: [
          {
            kind: "detail",
            text: "법정공휴일, 공휴일, 휴일근로로 분류된 근무에 적용됩니다."
          },
          {
            kind: "applied",
            text: "적용 요율: 2026.3-테스트 (2026.3.1 ~ 미정)"
          },
          {
            kind: "applied",
            text: "적용 배수: 기본 1.5배 / 연장 2배 / 야간 0.5배"
          },
          {
            kind: "formula",
            text: "계산식 1: 기본수당 = 시급 x 기본시간 x 1.5배"
          },
          {
            kind: "formula",
            text: "계산식 2: 연장수당 = 시급 x 연장시간 x 2배"
          },
          {
            kind: "formula",
            text: "계산식 3: 야간수당 = 시급 x 야간시간 x 0.5배"
          }
        ],
        label: "법정공휴일",
        sequence: 1
      }
    ]);

    expect(html).toContain('<section class="attachment-rate-entry">');
    expect(html).toContain('<div class="attachment-rate-entry-title">1. 법정공휴일</div>');
    expect((html.match(/attachment-rate-line attachment-rate-line-/g) ?? []).length).toBe(6);
    expect((html.match(/attachment-rate-line-formula/g) ?? []).length).toBe(3);
    expect(html).toContain("적용 요율: 2026.3-테스트 (2026.3.1 ~ 미정)");
    expect(html).toContain("적용 배수: 기본 1.5배 / 연장 2배 / 야간 0.5배");
    expect(html).toContain("계산식 3: 야간수당 = 시급 x 야간시간 x 0.5배");
  });

  it("renders proposal meta table with one-line author and extension fields plus blank approval cells", () => {
    const html = renderProposalMetaTableHtmlForTest({
      authorExtension: "7251",
      authorName: "운영담당",
      ownerDepartment: "DT사업1팀",
      printedDate: "2026.03.30",
      workMonth: "2026-03"
    });

    expect(html).toContain("작성자");
    expect(html).toContain("(인)");
    expect(html).toContain("내선번호");
    expect(html).toContain("운영담당 <span");
    expect(html).toContain(">7251<");
    expect(html).toContain('class="proposal-approval-cell"');
    expect(html).not.toContain("proposal-meta-inline-label");
  });

  it("renders proposal highlight card with line-separated regular and early payout values", () => {
    const html = renderProposalHighlightCardHtmlForTest({
      earlyPayoutTotalAllowanceAmount: 210000,
      formatCurrencyLabel: (amount) => `₩${amount.toLocaleString("ko-KR")}`,
      regularTotalAllowanceAmount: 409650,
      totalAllowanceAmount: 619650
    });

    expect((html.match(/proposal-highlight-line"/g) ?? []).length).toBe(2);
    expect(html).toContain("정규 지급");
    expect(html).toContain("퇴사자 선지급");
    expect(html).not.toContain(" / ");
  });

  it("builds proposal layout classes without forcing the early payout section onto a new page", () => {
    const layout = buildProposalLayoutConfigForTest({
      regularSiteCount: 14,
      earlyPayoutSiteCount: 2
    });

    expect(layout.mainPageClassName).toContain("proposal-main-page-compact");
    expect(layout.mainPageClassName).toContain("proposal-main-page-compressed");
    expect(layout.regularSectionClassName).toContain("proposal-table-compact");
    expect(layout.regularSectionClassName).toContain("proposal-table-compressed");
    expect(layout.earlyPayoutSectionClassName).toContain("proposal-flow-section");
    expect(layout.earlyPayoutSectionClassName).not.toContain("early-payout-section");
    expect(layout.footerSectionClassName).toContain("proposal-flow-section");
  });

  it("renders attachment1 title without the repeated-column note", () => {
    const html = renderAttachmentOneTitleHtmlForTest({
      logoDataUrl: null,
      workMonthLabel: "2026년 3월"
    });

    expect(html).toContain("별첨1. 2026년 3월 교대근무자 시간외근로수당 내역");
    expect(html).not.toContain("상단 컬럼은 페이지마다 반복됩니다.");
  });
});
