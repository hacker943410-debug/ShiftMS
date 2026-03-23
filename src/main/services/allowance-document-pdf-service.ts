import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AllowanceRateAxis } from "../../shared/domain/allowance-rate-matrix";

interface PdfExportRow {
  calculation: {
    snapshot: {
      totalAllowanceAmount: number;
      breakdown: {
        totalWorkMinutes: number;
      };
    };
  };
  employeeCode: string;
  employeeName: string;
  department: string;
  workDate: string;
  hourlyRate: number;
  primaryMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  summaryCategory: "substitute" | "overtime" | "legalHoliday";
  businessCategoryLabel: string;
  earlyPayoutDate?: string;
  substituteAmount: number;
  summaryOvertimeAmount: number;
  holidayAmount: number;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderPdfPageShell = (input: {
  title: string;
  body: string;
  pageSize?: "A4 portrait" | "A4 landscape";
  extraCss?: string;
}) => `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      @page {
        size: ${input.pageSize ?? "A4 portrait"};
        margin: 10mm;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #202533;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
        font-size: 12px;
        line-height: 1.45;
      }
      h1, h2, p { margin: 0; }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #cfd5e3;
        padding: 6px 8px;
        vertical-align: middle;
      }
      th {
        background: #eef2fa;
        color: #2c457f;
        font-weight: 700;
      }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      .number { text-align: right; white-space: nowrap; }
      .center { text-align: center; }
      .subtle { color: #68758d; }
      ${input.extraCss ?? ""}
    </style>
  </head>
  <body>${input.body}</body>
</html>`;

const createPdfDocument = async (input: {
  outputPath: string;
  html: string;
  landscape?: boolean;
}) => {
  if (!process.versions.electron) {
    throw new Error("PDF 출력은 Electron 앱 실행 환경에서만 지원합니다.");
  }

  const { BrowserWindow } = await import("electron");
  const browserWindow = new BrowserWindow({
    show: false,
    width: input.landscape ? 1600 : 1200,
    height: 1200,
    webPreferences: {
      sandbox: false
    }
  });
  const tempDir = mkdtempSync(path.resolve(tmpdir(), "shiftmgmt-allowance-pdf-"));
  const tempHtmlPath = path.resolve(tempDir, "document.html");

  try {
    writeFileSync(tempHtmlPath, input.html, "utf8");
    await browserWindow.loadFile(tempHtmlPath);

    const pdfBuffer = await Promise.race([
      browserWindow.webContents.printToPDF({
        landscape: input.landscape ?? false,
        printBackground: true,
        preferCSSPageSize: true
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("PDF 생성이 제한 시간 내에 완료되지 않았습니다."));
        }, 30000);
      })
    ]);

    writeFileSync(input.outputPath, pdfBuffer);
  } finally {
    if (!browserWindow.isDestroyed()) {
      browserWindow.destroy();
    }

    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
};

export const writeAllowancePdfDocuments = async (input: {
  proposalPath: string;
  attachment1Path: string;
  attachment2Path: string;
  workMonth: string;
  rows: PdfExportRow[];
  totalAllowanceAmount: number;
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
  formatDate: (value: string) => string;
  formatMonthLabel: (workMonth: string) => string;
  formatProposalDateRange: (workMonth: string) => string;
  formatCurrencyLabel: (amount: number) => string;
  formatHoursLabel: (minutes: number) => string;
  formatNextPayrollMonthLabel: (workMonth: string) => string;
  summaryCategoryOrder: Record<string, number>;
  allowanceAxisLabels: Record<AllowanceRateAxis, string>;
}) => {
  const regularRows = input.rows.filter((row) => !row.earlyPayoutDate);
  const earlyPayoutRows = input.rows.filter((row) => Boolean(row.earlyPayoutDate));
  const siteSummaries = [...regularRows.reduce((accumulator, row) => {
    const current = accumulator.get(row.department) ?? {
      department: row.department,
      substituteAmount: 0,
      overtimeAmount: 0,
      holidayAmount: 0,
      totalAmount: 0
    };

    current.substituteAmount += row.substituteAmount;
    current.overtimeAmount += row.summaryOvertimeAmount;
    current.holidayAmount += row.holidayAmount;
    current.totalAmount += row.calculation.snapshot.totalAllowanceAmount;
    accumulator.set(row.department, current);

    return accumulator;
  }, new Map<string, { department: string; substituteAmount: number; overtimeAmount: number; holidayAmount: number; totalAmount: number }>()).values()].sort(
    (left, right) => right.totalAmount - left.totalAmount || left.department.localeCompare(right.department, "ko")
  );
  const earlyPayoutSiteSummaries = [...earlyPayoutRows.reduce((accumulator, row) => {
    const current = accumulator.get(row.department) ?? {
      department: row.department,
      substituteAmount: 0,
      overtimeAmount: 0,
      holidayAmount: 0,
      totalAmount: 0
    };

    current.substituteAmount += row.substituteAmount;
    current.overtimeAmount += row.summaryOvertimeAmount;
    current.holidayAmount += row.holidayAmount;
    current.totalAmount += row.calculation.snapshot.totalAllowanceAmount;
    accumulator.set(row.department, current);

    return accumulator;
  }, new Map<string, { department: string; substituteAmount: number; overtimeAmount: number; holidayAmount: number; totalAmount: number }>()).values()].sort(
    (left, right) => right.totalAmount - left.totalAmount || left.department.localeCompare(right.department, "ko")
  );

  const employeeCount = new Set(input.rows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size;
  const printedDate = input.formatDate(new Date().toISOString().slice(0, 10));
  const nextPayrollMonthLabel = input.formatNextPayrollMonthLabel(input.workMonth);
  const proposalScale = siteSummaries.length > 14 ? 0.84 : siteSummaries.length > 10 ? 0.92 : 1;

  const proposalHtml = renderPdfPageShell({
    title: `${input.workMonth} 품의서`,
    pageSize: "A4 portrait",
    extraCss: `
      .proposal-page { --proposal-scale: ${proposalScale}; }
      .proposal-meta th, .proposal-meta td,
      .proposal-copy p, .proposal-section h2, .proposal-section td, .proposal-section th, .proposal-foot p {
        font-size: calc(12px * var(--proposal-scale));
      }
      .proposal-copy h1 {
        margin-bottom: 10px;
        font-size: calc(18px * var(--proposal-scale));
      }
      .proposal-section, .proposal-copy, .proposal-foot { margin-top: calc(14px * var(--proposal-scale)); }
      .proposal-title-strip {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        font-weight: 700;
      }
      .total-row td, .subtotal-row td {
        background: #f4f6fb;
        font-weight: 700;
      }
    `,
    body: `
      <div class="proposal-page">
        <div class="proposal-title-strip"><span>품의</span><span>보고</span></div>
        <table class="proposal-meta">
          <tr>
            <th>문서번호</th><td>${escapeHtml(input.workMonth)}</td>
            <th>일자</th><td>${escapeHtml(printedDate)}</td>
            <th>팀 장</th><th>본부장</th><th>대 표</th><th>부회장</th>
          </tr>
          <tr>
            <th>작성부서</th><td colspan="3">DT사업1팀</td>
            <th>합의</th><td class="center">/</td><td class="center">/</td><td class="center">/</td>
          </tr>
        </table>
        <div class="proposal-copy">
          <h1>제  목  :  DT사업1팀 스케쥴근무 시간외 근로 수당 지급 품의</h1>
          <p>${escapeHtml(input.formatMonthLabel(input.workMonth))}에 발생한 스케쥴근무자의 시간외 근로 수당 지급 승인을 요청드립니다.</p>
          <p><strong>1. 대상 기준 및 대상자</strong></p>
          <p>① 대상 기준 : 월근무계획외 연장, 대체 근무를 수행한 자 또는 휴일근무를 수행한 자</p>
          <p>② 당월 지급 대상자 : ${employeeCount}명</p>
        </div>
        <div class="proposal-section">
          <h2>2. ${Number(input.workMonth.slice(5))}월 지급 요청 내역</h2>
          <table>
            <thead>
              <tr>
                <th>단위 사업</th><th>조직</th><th>근무지</th><th>대체근로수당</th><th>연장근로수당</th><th>(공)휴일근로수당</th><th>계</th>
              </tr>
            </thead>
            <tbody>
              ${siteSummaries.map((row) => `
                <tr>
                  <td class="center">교대근무</td>
                  <td class="center">운영</td>
                  <td>${escapeHtml(row.department)}</td>
                  <td class="number">${row.substituteAmount > 0 ? input.formatCurrencyLabel(row.substituteAmount) : "-"}</td>
                  <td class="number">${row.overtimeAmount > 0 ? input.formatCurrencyLabel(row.overtimeAmount) : "-"}</td>
                  <td class="number">${row.holidayAmount > 0 ? input.formatCurrencyLabel(row.holidayAmount) : "-"}</td>
                  <td class="number">${input.formatCurrencyLabel(row.totalAmount)}</td>
                </tr>
              `).join("")}
              <tr class="total-row">
                <td class="center" colspan="3">합 계</td>
                <td class="number">${siteSummaries.reduce((sum, row) => sum + row.substituteAmount, 0) > 0 ? input.formatCurrencyLabel(siteSummaries.reduce((sum, row) => sum + row.substituteAmount, 0)) : "-"}</td>
                <td class="number">${siteSummaries.reduce((sum, row) => sum + row.overtimeAmount, 0) > 0 ? input.formatCurrencyLabel(siteSummaries.reduce((sum, row) => sum + row.overtimeAmount, 0)) : "-"}</td>
                <td class="number">${siteSummaries.reduce((sum, row) => sum + row.holidayAmount, 0) > 0 ? input.formatCurrencyLabel(siteSummaries.reduce((sum, row) => sum + row.holidayAmount, 0)) : "-"}</td>
                <td class="number">${input.formatCurrencyLabel(input.regularTotalAllowanceAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="proposal-foot">
          <p><strong>3. ${escapeHtml(nextPayrollMonthLabel)} 퇴사자 지급 내역</strong></p>
          ${
            earlyPayoutSiteSummaries.length > 0
              ? `<table>
                  <thead>
                    <tr>
                      <th>단위 사업</th><th>조직</th><th>근무지</th><th>대체근로수당</th><th>연장근로수당</th><th>(공)휴일근로수당</th><th>계</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${earlyPayoutSiteSummaries
                      .map(
                        (row) => `
                          <tr>
                            <td class="center">교대근무</td>
                            <td class="center">운영</td>
                            <td>${escapeHtml(row.department)}</td>
                            <td class="number">${row.substituteAmount > 0 ? input.formatCurrencyLabel(row.substituteAmount) : "-"}</td>
                            <td class="number">${row.overtimeAmount > 0 ? input.formatCurrencyLabel(row.overtimeAmount) : "-"}</td>
                            <td class="number">${row.holidayAmount > 0 ? input.formatCurrencyLabel(row.holidayAmount) : "-"}</td>
                            <td class="number">${input.formatCurrencyLabel(row.totalAmount)}</td>
                          </tr>
                        `
                      )
                      .join("")}
                    <tr class="total-row">
                      <td class="center" colspan="3">합 계</td>
                      <td class="number">${earlyPayoutSiteSummaries.reduce((sum, row) => sum + row.substituteAmount, 0) > 0 ? input.formatCurrencyLabel(earlyPayoutSiteSummaries.reduce((sum, row) => sum + row.substituteAmount, 0)) : "-"}</td>
                      <td class="number">${earlyPayoutSiteSummaries.reduce((sum, row) => sum + row.overtimeAmount, 0) > 0 ? input.formatCurrencyLabel(earlyPayoutSiteSummaries.reduce((sum, row) => sum + row.overtimeAmount, 0)) : "-"}</td>
                      <td class="number">${earlyPayoutSiteSummaries.reduce((sum, row) => sum + row.holidayAmount, 0) > 0 ? input.formatCurrencyLabel(earlyPayoutSiteSummaries.reduce((sum, row) => sum + row.holidayAmount, 0)) : "-"}</td>
                      <td class="number">${input.formatCurrencyLabel(input.earlyPayoutTotalAllowanceAmount)}</td>
                    </tr>
                  </tbody>
                </table>`
              : `<p>해당 없음</p>`
          }
          <p><strong>4. 지급 요청일</strong> : ${escapeHtml(nextPayrollMonthLabel)} 급여일</p>
          <p><strong>5. 세부내역</strong> : 별첨1, 별첨2 참조</p>
        </div>
      </div>
    `
  });

  const attachment1Rows = input.rows
    .sort(
      (left, right) =>
        input.summaryCategoryOrder[left.summaryCategory] -
          input.summaryCategoryOrder[right.summaryCategory] ||
        left.department.localeCompare(right.department, "ko") ||
        left.workDate.localeCompare(right.workDate) ||
        left.employeeName.localeCompare(right.employeeName, "ko")
    )
    .reduce(
      (accumulator, row) => {
        const currentSection =
          accumulator.sections.find((section) => section.category === row.summaryCategory) ??
          (() => {
            const section = {
              category: row.summaryCategory,
              label: row.businessCategoryLabel,
              rows: [] as PdfExportRow[]
            };
            accumulator.sections.push(section);
            return section;
          })();

        currentSection.rows.push(row);
        return accumulator;
      },
      { sections: [] as Array<{ category: PdfExportRow["summaryCategory"]; label: string; rows: PdfExportRow[] }> }
    )
    .sections
    .map((section) => {
      let sectionIndex = 0;
      const totalWorkMinutes = section.rows.reduce(
        (sum, row) => sum + row.calculation.snapshot.breakdown.totalWorkMinutes,
        0
      );
      const primaryMinutes = section.rows.reduce((sum, row) => sum + row.primaryMinutes, 0);
      const overtimeMinutes = section.rows.reduce((sum, row) => sum + row.overtimeMinutes, 0);
      const nightMinutes = section.rows.reduce((sum, row) => sum + row.nightMinutes, 0);
      const totalAllowanceAmount = section.rows.reduce(
        (sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount,
        0
      );

      const detailRows = section.rows
        .map((row) => {
          sectionIndex += 1;
          return `
            <tr>
              <td class="center">${sectionIndex}</td>
              <td class="center">${escapeHtml(row.employeeCode || "-")}</td>
              <td>${escapeHtml(row.employeeName)}</td>
              <td>${escapeHtml(row.department)}</td>
              <td class="center">${escapeHtml(row.businessCategoryLabel)}</td>
              <td class="center">${escapeHtml(input.formatDate(row.workDate))}</td>
              <td class="number">${escapeHtml(input.formatHoursLabel(row.calculation.snapshot.breakdown.totalWorkMinutes))}</td>
              <td class="number">${escapeHtml(input.formatHoursLabel(row.primaryMinutes))}</td>
              <td class="number">${escapeHtml(input.formatHoursLabel(row.overtimeMinutes))}</td>
              <td class="number">${escapeHtml(input.formatHoursLabel(row.nightMinutes))}</td>
              <td class="number">${input.formatCurrencyLabel(row.hourlyRate)}</td>
              <td class="number">${input.formatCurrencyLabel(row.calculation.snapshot.totalAllowanceAmount)}</td>
            </tr>
          `;
        })
        .join("");

      return `${detailRows}
        <tr class="subtotal-row">
          <td class="center">소계</td>
          <td class="center">-</td>
          <td>${escapeHtml(section.label)} 소계</td>
          <td>-</td>
          <td class="center">${escapeHtml(section.label)}</td>
          <td class="center">-</td>
          <td class="number">${escapeHtml(input.formatHoursLabel(totalWorkMinutes))}</td>
          <td class="number">${escapeHtml(input.formatHoursLabel(primaryMinutes))}</td>
          <td class="number">${escapeHtml(input.formatHoursLabel(overtimeMinutes))}</td>
          <td class="number">${escapeHtml(input.formatHoursLabel(nightMinutes))}</td>
          <td class="number">-</td>
          <td class="number">${input.formatCurrencyLabel(totalAllowanceAmount)}</td>
        </tr>`;
    })
    .join("");

  const attachment1Html = renderPdfPageShell({
    title: `${input.workMonth} 별첨1`,
    pageSize: "A4 landscape",
    extraCss: "th, td { font-size: 10px; } .attachment-title { margin-bottom: 12px; } .attachment-title h1 { font-size: 18px; } .subtotal-row td { background: #f4f6fb; font-weight: 700; }",
    body: `
      <div class="attachment-title">
        <h1>별첨1. ${escapeHtml(input.formatMonthLabel(input.workMonth))} 교대근무자 시간외근로수당 내역</h1>
        <p class="subtle">상단 컬럼은 페이지마다 반복됩니다.</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>No</th><th>사번</th><th>이름</th><th>근무지</th><th>유형</th><th>근무일</th><th>총 근무</th><th>${input.allowanceAxisLabels.base}</th><th>${input.allowanceAxisLabels.overtime}</th><th>${input.allowanceAxisLabels.night}</th><th>시급</th><th>총 수당</th>
          </tr>
        </thead>
        <tbody>${attachment1Rows}</tbody>
      </table>
    `
  });

  let runningIndex = 1;
  const groupedByDepartment = [...input.rows.reduce((accumulator, row) => {
    const departmentRows = accumulator.get(row.department) ?? [];
    departmentRows.push(row);
    accumulator.set(row.department, departmentRows);
    return accumulator;
  }, new Map<string, PdfExportRow[]>()).entries()];
  const attachment2Rows = groupedByDepartment
    .map(([department, rows]) => {
      let departmentSubstitute = 0;
      let departmentOvertime = 0;
      let departmentHoliday = 0;
      let departmentTotal = 0;

      const detailRows = rows
        .sort(
          (left, right) =>
            (input.summaryCategoryOrder[left.substituteAmount > 0 ? "substitute" : left.summaryOvertimeAmount > 0 ? "overtime" : "legalHoliday"] ?? 0) -
              (input.summaryCategoryOrder[right.substituteAmount > 0 ? "substitute" : right.summaryOvertimeAmount > 0 ? "overtime" : "legalHoliday"] ?? 0) ||
            left.workDate.localeCompare(right.workDate) ||
            left.employeeName.localeCompare(right.employeeName, "ko")
        )
        .map((row) => {
          departmentSubstitute += row.substituteAmount;
          departmentOvertime += row.summaryOvertimeAmount;
          departmentHoliday += row.holidayAmount;
          departmentTotal += row.calculation.snapshot.totalAllowanceAmount;
          const currentIndex = runningIndex;
          runningIndex += 1;
          return `
            <tr>
              <td class="center">${currentIndex}</td>
              <td>${escapeHtml(department)}</td>
              <td>${escapeHtml(row.employeeName)}</td>
              <td class="number">${row.substituteAmount > 0 ? input.formatCurrencyLabel(row.substituteAmount) : "-"}</td>
              <td class="number">${row.summaryOvertimeAmount > 0 ? input.formatCurrencyLabel(row.summaryOvertimeAmount) : "-"}</td>
              <td class="number">${row.holidayAmount > 0 ? input.formatCurrencyLabel(row.holidayAmount) : "-"}</td>
              <td class="number">${input.formatCurrencyLabel(row.calculation.snapshot.totalAllowanceAmount)}</td>
            </tr>
          `;
        })
        .join("");

      return `${detailRows}
        <tr class="subtotal-row">
          <td class="center">소계</td>
          <td colspan="2">${escapeHtml(department)} 소계</td>
          <td class="number">${departmentSubstitute > 0 ? input.formatCurrencyLabel(departmentSubstitute) : "-"}</td>
          <td class="number">${departmentOvertime > 0 ? input.formatCurrencyLabel(departmentOvertime) : "-"}</td>
          <td class="number">${departmentHoliday > 0 ? input.formatCurrencyLabel(departmentHoliday) : "-"}</td>
          <td class="number">${input.formatCurrencyLabel(departmentTotal)}</td>
        </tr>`;
    })
    .join("");

  const attachment2Html = renderPdfPageShell({
    title: `${input.workMonth} 별첨2`,
    pageSize: "A4 portrait",
    extraCss: ".attachment-title { margin-bottom: 12px; } .attachment-title h1 { font-size: 18px; } .subtotal-row td, .total-row td { background: #f4f6fb; font-weight: 700; }",
    body: `
      <div class="attachment-title">
        <h1>별첨2. ${escapeHtml(input.formatMonthLabel(input.workMonth))} 수당 지급 현황</h1>
        <p class="subtle">${escapeHtml(input.formatProposalDateRange(input.workMonth))}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>No</th><th>근무지</th><th>이름</th><th>대체근로수당</th><th>연장근로수당</th><th>(공)휴일근로수당</th><th>계</th>
          </tr>
        </thead>
        <tbody>
          ${attachment2Rows}
          <tr class="total-row">
            <td class="center">합계</td>
            <td colspan="2">전체 합계</td>
            <td class="number">${input.rows.reduce((sum, row) => sum + row.substituteAmount, 0) > 0 ? input.formatCurrencyLabel(input.rows.reduce((sum, row) => sum + row.substituteAmount, 0)) : "-"}</td>
            <td class="number">${input.rows.reduce((sum, row) => sum + row.summaryOvertimeAmount, 0) > 0 ? input.formatCurrencyLabel(input.rows.reduce((sum, row) => sum + row.summaryOvertimeAmount, 0)) : "-"}</td>
            <td class="number">${input.rows.reduce((sum, row) => sum + row.holidayAmount, 0) > 0 ? input.formatCurrencyLabel(input.rows.reduce((sum, row) => sum + row.holidayAmount, 0)) : "-"}</td>
            <td class="number">${input.formatCurrencyLabel(input.totalAllowanceAmount)}</td>
          </tr>
        </tbody>
      </table>
    `
  });

  await createPdfDocument({
    outputPath: input.proposalPath,
    html: proposalHtml
  });
  await createPdfDocument({
    outputPath: input.attachment1Path,
    html: attachment1Html,
    landscape: true
  });
  await createPdfDocument({
    outputPath: input.attachment2Path,
    html: attachment2Html
  });
};
