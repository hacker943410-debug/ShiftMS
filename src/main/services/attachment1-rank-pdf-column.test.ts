import { describe, expect, it } from "vitest";

import { renderAttachmentOneTableHtmlForTest } from "./allowance-document-pdf-service";

// Adversarial check for the "별첨1 직급 누락" report.
// The investigator concluded the blank 직급 can only come from missing master data,
// and explicitly left the PDF output unverified. This test drives the PDF renderer
// with a row whose 직급 IS populated, and checks whether it reaches the document.
const buildRow = (overrides: Record<string, unknown>) => ({
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
  employeeRank: "부장",
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
  holidayAmount: 0,
  ...overrides
});

const renderPdfAttachmentOne = (rows: unknown[]) =>
  renderAttachmentOneTableHtmlForTest({
    rows,
    holidayNamesByDate: new Map<string, string>(),
    formatCurrencyLabel: (amount: number) => `${amount.toLocaleString("ko-KR")}원`,
    formatDate: (value: string) => value.replaceAll("-", "."),
    formatHoursLabel: (minutes: number) => `${minutes / 60}h`,
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
  } as never);

// The rank cell is the one immediately after the name cell, so read it positionally
// rather than by value — "-" also appears in the rate columns of the subtotal rows.
const readRankCellFor = (html: string, employeeName: string) =>
  html.match(
    new RegExp(`attachment-name-cell">${employeeName}</td>\\s*<td class="center">([^<]*)</td>`)
  )?.[1];

const readHeaderLabels = (html: string) => {
  const headerRow = html.split("<thead>")[1]?.split("</thead>")[0] ?? "";

  return [...headerRow.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1].trim());
};

// The Excel 별첨1 has always had a 직급 column (D). The PDF one had none, so a PDF export
// dropped every rank regardless of the data — the whole report was blank there.
describe("별첨1 직급 - PDF 표", () => {
  it("carries a 직급 column next to 이름, like the Excel 별첨1", () => {
    const html = renderPdfAttachmentOne([
      buildRow({ employeeRank: "부장" }),
      buildRow({ employeeCode: "E002", employeeName: "홍길동", employeeRank: "과장" })
    ]);

    const headerLabels = readHeaderLabels(html);

    expect(headerLabels).toContain("직급");
    expect(headerLabels.indexOf("직급")).toBe(headerLabels.indexOf("이름") + 1);
    expect(headerLabels).toContain("사번");
    expect(html).toContain("부장");
    expect(html).toContain("과장");
  });

  it("renders '-' when the rank is missing or outside the allowed vocabulary", () => {
    const html = renderPdfAttachmentOne([
      buildRow({ employeeRank: undefined }),
      buildRow({ employeeCode: "E002", employeeName: "홍길동", employeeRank: "선임" })
    ]);

    expect(readRankCellFor(html, "김민수")).toBe("-");
    // "선임" is outside 사원/대리/과장/차장/부장, so it is dropped the same way a blank is.
    expect(readRankCellFor(html, "홍길동")).toBe("-");
    expect(html).not.toContain("선임");
  });

  it("reads employeeRank — a filled rank and a blank one no longer render identically", () => {
    const withRank = renderPdfAttachmentOne([buildRow({ employeeRank: "부장" })]);
    const withoutRank = renderPdfAttachmentOne([buildRow({ employeeRank: undefined })]);

    expect(withRank).not.toBe(withoutRank);
    expect(withRank).toContain("부장");
    expect(withoutRank).not.toContain("부장");
  });

  it("keeps the 소계 label spanning the identity columns after the new column", () => {
    const html = renderPdfAttachmentOne([buildRow({})]);

    // No 직급 column would leave colspan=7 and shift every subtotal number one cell left.
    expect(html).toContain('colspan="8">소계');
    expect(html).toContain('colspan="8">총 소계');
  });
});
