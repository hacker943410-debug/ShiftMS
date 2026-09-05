import { describe, expect, it, vi } from "vitest";

import {
  buildProposalLayoutConfigForTest,
  renderAttachmentOneTitleHtmlForTest,
  renderAttachmentTwoTitleHtmlForTest,
  renderAttachmentRateGuideHtmlForTest,
  renderAttachmentOneTableHtmlForTest,
  renderAttachmentTwoTableHtmlForTest,
  renderProposalHighlightCardHtmlForTest,
  renderProposalMetaTableHtmlForTest,
  resolvePdfPrintedDate
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
            text: "적용 배수: 기본 x1.5 / 연장 x2 / 야간 x0.5"
          },
          {
            kind: "formula",
            text: "계산식 1: 기본수당 = 시급 x 기본시간 x1.5"
          },
          {
            kind: "formula",
            text: "계산식 2: 연장수당 = 시급 x 연장시간 x2"
          },
          {
            kind: "formula",
            text: "계산식 3: 야간수당 = 시급 x 야간시간 x0.5"
          }
        ],
        label: "법정공휴일",
        sequence: 1
      }
    ]);

    expect(html).toContain('<section class="attachment-rate-entry">');
    expect(html).toContain('style="--guide-columns: 1"');
    expect(html).toContain('class="attachment-rate-guide-grid"');
    expect(html).toContain('<div class="attachment-rate-entry-title">1. 법정공휴일</div>');
    expect((html.match(/attachment-rate-line attachment-rate-line-/g) ?? []).length).toBe(6);
    expect((html.match(/attachment-rate-line-formula/g) ?? []).length).toBe(3);
    expect(html).toContain("적용 요율: 2026.3-테스트 (2026.3.1 ~ 미정)");
    expect(html).toContain("적용 배수: 기본 x1.5 / 연장 x2 / 야간 x0.5");
    expect(html).toContain("계산식 3: 야간수당 = 시급 x 야간시간 x0.5");
  });

  it("renders attachment1 rate guide with multi-column layout when entries grow", () => {
    const html = renderAttachmentRateGuideHtmlForTest(
      Array.from({ length: 5 }, (_, index) => ({
        label: `테스트 ${index + 1}`,
        sequence: index + 1,
        lines: [
          { kind: "detail" as const, text: "설명 1" },
          { kind: "applied" as const, text: "설명 2" },
          { kind: "applied" as const, text: "설명 3" },
          { kind: "formula" as const, text: "설명 4" },
          { kind: "formula" as const, text: "설명 5" }
        ]
      }))
    );

    expect(html).toContain('style="--guide-columns: 3"');
    expect(html).toContain('class="attachment-rate-guide-grid"');
  });

  it("renders proposal meta table with one-line author and extension fields plus blank approval cells", () => {
    const html = renderProposalMetaTableHtmlForTest({
      authorExtension: "7251",
      authorName: "운영담당",
      ownerDepartment: "DT사업1팀",
      printedDate: "2026.03.30",
      workMonth: "2026-02"
    });

    expect(html).toContain("작성자");
    expect(html).toContain("(인)");
    expect(html).toContain(">2026-03<");
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
      workMonth: "2026-03"
    });

    expect(html).toContain("별첨1. DT사업1팀 교대근무자 시간외근로수당 내역 (2026년 3월)");
    expect(html).not.toContain("상단 컬럼은 페이지마다 반복됩니다.");
  });

  it("renders attachment1 table with compact type labels, merged subtotals, and continuous numbering", () => {
    const html = renderAttachmentOneTableHtmlForTest({
      rows: [
        {
          calculation: {
            snapshot: {
              totalAllowanceAmount: 27000,
              breakdown: {
                totalWorkMinutes: 180
              }
            }
          },
          employeeCode: "E001",
          employeeName: "김민수",
          department: "서울센터",
          workDate: "2026-03-04",
          hourlyRate: 15000,
          primaryMinutes: 180,
          primaryMultiplier: 1.5,
          primaryAmount: 27000,
          overtimeMinutes: 0,
          overtimeMultiplier: 0,
          overtimeAmount: 0,
          nightMinutes: 0,
          nightMultiplier: 0,
          nightAmount: 0,
          summaryCategory: "substitute",
          businessCategoryLabel: "평일 대체근무",
          substituteAmount: 27000,
          summaryOvertimeAmount: 0,
          holidayAmount: 0
        },
        {
          calculation: {
            snapshot: {
              totalAllowanceAmount: 62500,
              breakdown: {
                totalWorkMinutes: 600
              }
            }
          },
          employeeCode: "E001",
          employeeName: "홍길동",
          department: "서울센터",
          workDate: "2026-03-01",
          hourlyRate: 15000,
          primaryMinutes: 480,
          primaryMultiplier: 1.5,
          primaryAmount: 180000,
          overtimeMinutes: 60,
          overtimeMultiplier: 2,
          overtimeAmount: 30000,
          nightMinutes: 60,
          nightMultiplier: 2.5,
          nightAmount: 37500,
          summaryCategory: "legalHoliday",
          businessCategoryLabel: "법정공휴일",
          substituteAmount: 0,
          summaryOvertimeAmount: 0,
          holidayAmount: 62500
        }
      ],
      holidayNamesByDate: new Map([["2026-03-01", "대체공휴일(삼일절)"]]),
      formatCurrencyLabel: (amount) => `${amount.toLocaleString("ko-KR")}원`,
      formatDate: (value) => value.replaceAll("-", "."),
      formatHoursLabel: (minutes) => `${minutes / 60}h`,
      summaryCategoryOrder: {
        substitute: 0,
        overtime: 1,
        legalHoliday: 2
      },
      allowanceAxisLabels: {
        base: "기본",
        overtime: "연장",
        night: "야간"
      }
    });

    expect(html).toContain('<th colspan="3">기본</th>');
    expect(html).toContain('<th colspan="3">연장</th>');
    expect(html).toContain('<th colspan="3">야간</th>');
    expect(html).toContain('<th rowspan="2">유형구분</th>');
    expect(html).toContain('<td class="center">1</td>');
    expect(html).toContain('<td class="center">2</td>');
    expect(html).toContain('class="center attachment-date-cell holiday-highlight"');
    expect(html).toContain(">대체근무<");
    expect(html).toContain(">휴일근무<");
    expect(html).toContain("attachment-type-division-note");
    expect(html).toContain(">대체공휴일<");
    expect(html).toContain(">(삼일절)<");
    expect(html).toContain(">x1.5<");
    expect(html).toContain(">x2<");
    expect(html).toContain(">x2.5<");
    expect(html).toContain("15,000.00원");
    expect(html).toContain("27,000원");
    expect(html).toContain("180,000원");
    expect(html).toContain("30,000원");
    expect(html).toContain("37,500원");
    expect(html).toContain("62,500원");
    expect(html).toContain('<tr class="total-row">');
    // 8 identity columns: No / 사번 / 이름 / 직급 / 근무지 / 유형 / 근무일 / 유형구분.
    expect(html).toContain('<td class="center subtotal-label" colspan="8">소계</td>');
    expect(html).toContain('<td class="center total-label" colspan="8">총 소계</td>');
    expect(html).not.toContain("전체 총소계");
  });

  it("renders attachment2 title with the company logo slot on the right", () => {
    const html = renderAttachmentTwoTitleHtmlForTest({
      dateRangeLabel: "2026.03.01 ~ 2026.03.31",
      logoDataUrl: "data:image/png;base64,test",
      workMonth: "2026-03"
    });

    expect(html).toContain("별첨2. 월간 DT사업1팀 교대근무 직원의 연장근로 수당 지급 현황 202603");
    expect(html).toContain("2026.03.01 ~ 2026.03.31");
    expect(html).toContain('class="document-brand-logo"');
  });

  it("renders attachment2 table with centered work date, employee values, and grand subtotal", () => {
    const html = renderAttachmentTwoTableHtmlForTest({
      rows: [
        {
          calculation: {
            snapshot: {
              totalAllowanceAmount: 46000,
              breakdown: {
                totalWorkMinutes: 540
              }
            }
          },
          employeeCode: "E002",
          employeeName: "김철수",
          department: "부산센터",
          workDate: "2026-03-02",
          hourlyRate: 14000,
          primaryMinutes: 420,
          primaryMultiplier: 1,
          primaryAmount: 12000,
          overtimeMinutes: 120,
          overtimeMultiplier: 1.5,
          overtimeAmount: 34000,
          nightMinutes: 0,
          nightMultiplier: 0,
          nightAmount: 0,
          summaryCategory: "overtime",
          businessCategoryLabel: "평일 연장근무",
          substituteAmount: 12000,
          summaryOvertimeAmount: 34000,
          holidayAmount: 0
        }
      ],
      formatCurrencyLabel: (amount) => `${amount.toLocaleString("ko-KR")}원`,
      formatDate: (value) => value.replaceAll("-", "."),
      summaryCategoryOrder: {
        substitute: 0,
        overtime: 1,
        legalHoliday: 2
      }
    });

    expect(html).toContain("<th>근무일</th>");
    expect(html).toContain('<td class="center">2026.03.02</td>');
    expect(html).toContain('<td class="center">김철수</td>');
    expect(html).toContain("12,000원");
    expect(html).toContain("46,000원");
    expect(html).toContain('<tr class="total-row">');
    expect(html).toContain("전체 총소계");
  });

  // T-21: half past midnight local time is still yesterday in UTC.
  it("prints the local calendar date just after midnight, and keeps a date the export passed in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 0, 30));

    try {
      expect(resolvePdfPrintedDate()).toBe("2026-09-05");
      expect(resolvePdfPrintedDate("2026-09-04")).toBe("2026-09-04");
    } finally {
      vi.useRealTimers();
    }
  });
});
