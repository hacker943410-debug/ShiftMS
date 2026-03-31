import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { nativeImage } from "electron";

import type { AllowanceRateAxis } from "../../shared/domain/allowance-rate-matrix";
import { getSession } from "./auth-service";
import { listStoredOperationUsers } from "./operations-storage-service";

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
  primaryMultiplier: number;
  primaryAmount: number;
  overtimeMinutes: number;
  overtimeMultiplier: number;
  overtimeAmount: number;
  nightMinutes: number;
  nightMultiplier: number;
  nightAmount: number;
  summaryCategory: "substitute" | "overtime" | "legalHoliday";
  businessCategoryLabel: string;
  earlyPayoutDate?: string;
  substituteAmount: number;
  summaryOvertimeAmount: number;
  holidayAmount: number;
}

interface AllowanceRateGuideLine {
  kind: "detail" | "applied" | "formula";
  text: string;
}

interface AllowanceRateGuideEntry {
  label: string;
  lines: AllowanceRateGuideLine[];
  sequence: number;
}

interface PdfSiteSummary {
  department: string;
  employeeCount: number;
  holidayAmount: number;
  overtimeAmount: number;
  substituteAmount: number;
  totalAmount: number;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveAttachmentRateGuideColumns = (entries: AllowanceRateGuideEntry[]) => {
  const totalLineCount = entries.reduce((sum, entry) => sum + entry.lines.length, 0);

  if (entries.length >= 5 || totalLineCount >= 24) {
    return 3;
  }

  if (entries.length >= 3 || totalLineCount >= 12) {
    return 2;
  }

  return 1;
};

const renderAttachmentRateGuideHtml = (entries: AllowanceRateGuideEntry[]) => `
  <div class="attachment-rate-guide" style="--guide-columns: ${resolveAttachmentRateGuideColumns(entries)}">
    <h2>적용 요율 설명</h2>
    <div class="attachment-rate-guide-grid">
      ${entries
        .map(
          (entry) => `
            <section class="attachment-rate-entry">
              <div class="attachment-rate-entry-title">${entry.sequence}. ${escapeHtml(entry.label)}</div>
              <div class="attachment-rate-entry-body">
                ${entry.lines
                  .map(
                    (line) =>
                      `<div class="attachment-rate-line attachment-rate-line-${line.kind}">${escapeHtml(
                        line.text
                      )}</div>`
                  )
                  .join("")}
              </div>
            </section>
          `
        )
        .join("")}
    </div>
  </div>
`;

export const renderAttachmentRateGuideHtmlForTest = (entries: AllowanceRateGuideEntry[]) =>
  renderAttachmentRateGuideHtml(entries);

const formatRateMultiplierLabel = (value: number) => {
  if (!Number.isFinite(value)) {
    return "x0";
  }

  const normalizedValue = Number.isInteger(value) ? value.toLocaleString("ko-KR") : value.toFixed(1);

  return `x${normalizedValue}`;
};

const formatOptionalAmountLabel = (
  amount: number,
  formatCurrencyLabel: (amount: number) => string
) => (amount > 0 ? formatCurrencyLabel(amount) : "-");

const renderAttachmentOneTableHtml = (input: {
  rows: PdfExportRow[];
  holidayNamesByDate: ReadonlyMap<string, string>;
  formatCurrencyLabel: (amount: number) => string;
  formatDate: (value: string) => string;
  formatHoursLabel: (minutes: number) => string;
  summaryCategoryOrder: Record<string, number>;
  allowanceAxisLabels: Record<AllowanceRateAxis, string>;
}) => {
  const totalSummary = {
    totalWorkMinutes: input.rows.reduce(
      (sum, row) => sum + row.calculation.snapshot.breakdown.totalWorkMinutes,
      0
    ),
    primaryMinutes: input.rows.reduce((sum, row) => sum + row.primaryMinutes, 0),
    primaryAmount: input.rows.reduce((sum, row) => sum + row.primaryAmount, 0),
    overtimeMinutes: input.rows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
    overtimeAmount: input.rows.reduce((sum, row) => sum + row.overtimeAmount, 0),
    nightMinutes: input.rows.reduce((sum, row) => sum + row.nightMinutes, 0),
    nightAmount: input.rows.reduce((sum, row) => sum + row.nightAmount, 0),
    totalAllowanceAmount: input.rows.reduce(
      (sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount,
      0
    )
  };
  const rowsHtml = input.rows
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
      const primaryAmount = section.rows.reduce((sum, row) => sum + row.primaryAmount, 0);
      const overtimeMinutes = section.rows.reduce((sum, row) => sum + row.overtimeMinutes, 0);
      const overtimeAmount = section.rows.reduce((sum, row) => sum + row.overtimeAmount, 0);
      const nightMinutes = section.rows.reduce((sum, row) => sum + row.nightMinutes, 0);
      const nightAmount = section.rows.reduce((sum, row) => sum + row.nightAmount, 0);
      const totalAllowanceAmount = section.rows.reduce(
        (sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount,
        0
      );

      const detailRows = section.rows
        .map((row) => {
          sectionIndex += 1;
          const holidayName = input.holidayNamesByDate.get(row.workDate);
          const workDateClassName = holidayName
            ? "center attachment-date-cell holiday-highlight"
            : "center attachment-date-cell";
          const workTypeDivisionLabel = holidayName ?? "평일";

          return `
            <tr>
              <td class="center">${sectionIndex}</td>
              <td class="center">${escapeHtml(row.employeeCode || "-")}</td>
              <td class="center">${escapeHtml(row.employeeName)}</td>
              <td class="center">${escapeHtml(row.department)}</td>
              <td class="center">${escapeHtml(row.businessCategoryLabel)}</td>
              <td class="${workDateClassName}">${escapeHtml(input.formatDate(row.workDate))}</td>
              <td class="center">${escapeHtml(workTypeDivisionLabel)}</td>
              <td class="center">${escapeHtml(input.formatHoursLabel(row.calculation.snapshot.breakdown.totalWorkMinutes))}</td>
              <td class="center">${escapeHtml(input.formatHoursLabel(row.primaryMinutes))}</td>
              <td class="center">${escapeHtml(formatRateMultiplierLabel(row.primaryMultiplier))}</td>
              <td class="number">${formatOptionalAmountLabel(row.primaryAmount, input.formatCurrencyLabel)}</td>
              <td class="center">${escapeHtml(input.formatHoursLabel(row.overtimeMinutes))}</td>
              <td class="center">${escapeHtml(formatRateMultiplierLabel(row.overtimeMultiplier))}</td>
              <td class="number">${formatOptionalAmountLabel(row.overtimeAmount, input.formatCurrencyLabel)}</td>
              <td class="center">${escapeHtml(input.formatHoursLabel(row.nightMinutes))}</td>
              <td class="center">${escapeHtml(formatRateMultiplierLabel(row.nightMultiplier))}</td>
              <td class="number">${formatOptionalAmountLabel(row.nightAmount, input.formatCurrencyLabel)}</td>
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
          <td class="center">${escapeHtml(section.label)} 소계</td>
          <td class="center">-</td>
          <td class="center">${escapeHtml(section.label)}</td>
          <td class="center">-</td>
          <td class="center">-</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(totalWorkMinutes))}</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(primaryMinutes))}</td>
          <td class="center">-</td>
          <td class="number">${formatOptionalAmountLabel(primaryAmount, input.formatCurrencyLabel)}</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(overtimeMinutes))}</td>
          <td class="center">-</td>
          <td class="number">${formatOptionalAmountLabel(overtimeAmount, input.formatCurrencyLabel)}</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(nightMinutes))}</td>
          <td class="center">-</td>
          <td class="number">${formatOptionalAmountLabel(nightAmount, input.formatCurrencyLabel)}</td>
          <td class="number">-</td>
          <td class="number">${input.formatCurrencyLabel(totalAllowanceAmount)}</td>
        </tr>`;
    })
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th rowspan="2">No</th><th rowspan="2">사번</th><th rowspan="2">이름</th><th rowspan="2">근무지</th><th rowspan="2">유형</th><th rowspan="2">근무일</th><th rowspan="2">유형구분</th><th rowspan="2">총 근무</th><th colspan="3">${input.allowanceAxisLabels.base}</th><th colspan="3">${input.allowanceAxisLabels.overtime}</th><th colspan="3">${input.allowanceAxisLabels.night}</th><th rowspan="2">시급</th><th rowspan="2">총 수당</th>
        </tr>
        <tr>
          <th>시간</th><th>요율</th><th>수당</th><th>시간</th><th>요율</th><th>수당</th><th>시간</th><th>요율</th><th>수당</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td class="center">총소계</td>
          <td class="center">-</td>
          <td class="center">전체 총소계</td>
          <td class="center">-</td>
          <td class="center">전체</td>
          <td class="center">-</td>
          <td class="center">-</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(totalSummary.totalWorkMinutes))}</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(totalSummary.primaryMinutes))}</td>
          <td class="center">-</td>
          <td class="number">${formatOptionalAmountLabel(totalSummary.primaryAmount, input.formatCurrencyLabel)}</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(totalSummary.overtimeMinutes))}</td>
          <td class="center">-</td>
          <td class="number">${formatOptionalAmountLabel(totalSummary.overtimeAmount, input.formatCurrencyLabel)}</td>
          <td class="center">${escapeHtml(input.formatHoursLabel(totalSummary.nightMinutes))}</td>
          <td class="center">-</td>
          <td class="number">${formatOptionalAmountLabel(totalSummary.nightAmount, input.formatCurrencyLabel)}</td>
          <td class="number">-</td>
          <td class="number">${input.formatCurrencyLabel(totalSummary.totalAllowanceAmount)}</td>
        </tr>
      </tbody>
    </table>
  `;
};

const renderAttachmentTwoTableHtml = (input: {
  rows: PdfExportRow[];
  formatCurrencyLabel: (amount: number) => string;
  formatDate: (value: string) => string;
  summaryCategoryOrder: Record<string, number>;
}) => {
  let runningIndex = 1;
  const groupedByDepartment = [...input.rows.reduce((accumulator, row) => {
    const departmentRows = accumulator.get(row.department) ?? [];
    departmentRows.push(row);
    accumulator.set(row.department, departmentRows);
    return accumulator;
  }, new Map<string, PdfExportRow[]>()).entries()];

  const rowsHtml = groupedByDepartment
    .map(([department, rows]) => {
      let departmentSubstitute = 0;
      let departmentOvertime = 0;
      let departmentHoliday = 0;
      let departmentTotal = 0;

      const detailRows = rows
        .sort(
          (left, right) =>
            (input.summaryCategoryOrder[
              left.substituteAmount > 0
                ? "substitute"
                : left.summaryOvertimeAmount > 0
                  ? "overtime"
                  : "legalHoliday"
            ] ?? 0) -
              (input.summaryCategoryOrder[
                right.substituteAmount > 0
                  ? "substitute"
                  : right.summaryOvertimeAmount > 0
                    ? "overtime"
                    : "legalHoliday"
              ] ?? 0) ||
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
              <td class="center">${escapeHtml(input.formatDate(row.workDate))}</td>
              <td class="center">${escapeHtml(row.employeeName)}</td>
              <td class="number">${formatOptionalAmountLabel(row.substituteAmount, input.formatCurrencyLabel)}</td>
              <td class="number">${formatOptionalAmountLabel(row.summaryOvertimeAmount, input.formatCurrencyLabel)}</td>
              <td class="number">${formatOptionalAmountLabel(row.holidayAmount, input.formatCurrencyLabel)}</td>
              <td class="number">${input.formatCurrencyLabel(row.calculation.snapshot.totalAllowanceAmount)}</td>
            </tr>
          `;
        })
        .join("");

      return `${detailRows}
        <tr class="subtotal-row">
          <td class="center">소계</td>
          <td colspan="3">${escapeHtml(department)} 소계</td>
          <td class="number">${formatOptionalAmountLabel(departmentSubstitute, input.formatCurrencyLabel)}</td>
          <td class="number">${formatOptionalAmountLabel(departmentOvertime, input.formatCurrencyLabel)}</td>
          <td class="number">${formatOptionalAmountLabel(departmentHoliday, input.formatCurrencyLabel)}</td>
          <td class="number">${input.formatCurrencyLabel(departmentTotal)}</td>
        </tr>`;
    })
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>No</th><th>근무지</th><th>근무일</th><th>이름</th><th>대체근로수당</th><th>연장근로수당</th><th>(공)휴일근로수당</th><th>계</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td class="center">총소계</td>
          <td colspan="3">전체 총소계</td>
          <td class="number">${formatOptionalAmountLabel(
            input.rows.reduce((sum, row) => sum + row.substituteAmount, 0),
            input.formatCurrencyLabel
          )}</td>
          <td class="number">${formatOptionalAmountLabel(
            input.rows.reduce((sum, row) => sum + row.summaryOvertimeAmount, 0),
            input.formatCurrencyLabel
          )}</td>
          <td class="number">${formatOptionalAmountLabel(
            input.rows.reduce((sum, row) => sum + row.holidayAmount, 0),
            input.formatCurrencyLabel
          )}</td>
          <td class="number">${input.formatCurrencyLabel(
            input.rows.reduce((sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount, 0)
          )}</td>
        </tr>
      </tbody>
    </table>
  `;
};

export const renderAttachmentOneTableHtmlForTest = renderAttachmentOneTableHtml;
export const renderAttachmentTwoTableHtmlForTest = renderAttachmentTwoTableHtml;

const buildNormalizedBrandLogoPng = (logoPath: string) => {
  const image = nativeImage.createFromPath(logoPath);

  if (image.isEmpty()) {
    return null;
  }

  const { width, height } = image.getSize();
  const bitmap = Buffer.from(image.toBitmap());

  if (bitmap.length !== width * height * 4) {
    return image.toPNG();
  }

  const readPixel = (x: number, y: number) => {
    const offset = (y * width + x) * 4;

    return {
      alpha: bitmap[offset + 3] ?? 255,
      blue: bitmap[offset] ?? 255,
      green: bitmap[offset + 1] ?? 255,
      red: bitmap[offset + 2] ?? 255
    };
  };

  const cornerPixels = [
    readPixel(0, 0),
    readPixel(width - 1, 0),
    readPixel(0, height - 1),
    readPixel(width - 1, height - 1)
  ];
  const backgroundColor = {
    blue: Math.round(cornerPixels.reduce((sum, pixel) => sum + pixel.blue, 0) / cornerPixels.length),
    green: Math.round(cornerPixels.reduce((sum, pixel) => sum + pixel.green, 0) / cornerPixels.length),
    red: Math.round(cornerPixels.reduce((sum, pixel) => sum + pixel.red, 0) / cornerPixels.length)
  };

  for (let offset = 0; offset <= bitmap.length - 4; offset += 4) {
    const blue = bitmap[offset] ?? 255;
    const green = bitmap[offset + 1] ?? 255;
    const red = bitmap[offset + 2] ?? 255;
    const alpha = bitmap[offset + 3] ?? 255;

    if (alpha === 0 || red < 220 || green < 220 || blue < 220) {
      continue;
    }

    const distance = Math.max(
      Math.abs(red - backgroundColor.red),
      Math.abs(green - backgroundColor.green),
      Math.abs(blue - backgroundColor.blue)
    );

    if (distance <= 6) {
      bitmap[offset] = 255;
      bitmap[offset + 1] = 255;
      bitmap[offset + 2] = 255;
      bitmap[offset + 3] = 0;
      continue;
    }

    if (distance <= 24) {
      bitmap[offset] = 255;
      bitmap[offset + 1] = 255;
      bitmap[offset + 2] = 255;
      bitmap[offset + 3] = 255;
    }
  }

  return nativeImage.createFromBitmap(bitmap, { height, scaleFactor: 1, width }).toPNG();
};

const resolveBrandLogoDataUrl = () => {
  const candidatePaths = [
    path.resolve(__dirname, "../../../dist/assets"),
    path.resolve(__dirname, "../../../src/renderer/assets"),
    path.resolve(process.cwd(), "dist", "assets"),
    path.resolve(process.cwd(), "src", "renderer", "assets")
  ];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    if (candidatePath.endsWith(".png")) {
      const normalizedPng = buildNormalizedBrandLogoPng(candidatePath);

      return normalizedPng ? `data:image/png;base64,${normalizedPng.toString("base64")}` : null;
    }

    const logoFileName = readdirSync(candidatePath).find((fileName) =>
      /^brand-logo-clean.*\.png$/i.test(fileName)
    );

    if (!logoFileName) {
      continue;
    }

    const normalizedPng = buildNormalizedBrandLogoPng(path.resolve(candidatePath, logoFileName));

    return normalizedPng ? `data:image/png;base64,${normalizedPng.toString("base64")}` : null;
  }

  return null;
};

const renderDocumentBrandLogo = (logoDataUrl: string | null) =>
  logoDataUrl
    ? `<div class="document-brand-logo"><img alt="회사 로고" src="${logoDataUrl}" /></div>`
    : "";

const renderProposalMetaTableHtml = (input: {
  authorExtension?: string;
  authorName: string;
  ownerDepartment: string;
  printedDate: string;
  workMonth: string;
}) => `
  <table class="proposal-meta">
    <colgroup>
      <col class="proposal-meta-key" />
      <col class="proposal-meta-value" />
      <col class="proposal-meta-key" />
      <col class="proposal-meta-value" />
      <col class="proposal-meta-approval" />
      <col class="proposal-meta-approval" />
      <col class="proposal-meta-approval" />
      <col class="proposal-meta-approval" />
    </colgroup>
    <tr>
      <th>문서번호</th>
      <td class="proposal-meta-value-cell">${escapeHtml(input.workMonth)}</td>
      <th>일자</th>
      <td class="proposal-meta-value-cell">${escapeHtml(input.printedDate)}</td>
      <th class="proposal-approval-head">팀 장</th>
      <th class="proposal-approval-head">본부장</th>
      <th class="proposal-approval-head">대 표</th>
      <th class="proposal-approval-head">부회장</th>
    </tr>
    <tr class="proposal-meta-detail-row">
      <th>작성부서</th>
      <td colspan="3" class="proposal-meta-value-cell">${escapeHtml(input.ownerDepartment)}</td>
      <td rowspan="2" class="proposal-approval-cell"><div class="proposal-approval-space"></div></td>
      <td rowspan="2" class="proposal-approval-cell"><div class="proposal-approval-space"></div></td>
      <td rowspan="2" class="proposal-approval-cell"><div class="proposal-approval-space"></div></td>
      <td rowspan="2" class="proposal-approval-cell"><div class="proposal-approval-space"></div></td>
    </tr>
    <tr class="proposal-meta-detail-row">
      <th class="proposal-meta-inline-head">작성자</th>
      <td class="proposal-meta-value-cell">${escapeHtml(input.authorName)} <span class="proposal-meta-stamp">(인)</span></td>
      <th class="proposal-meta-inline-head">내선번호</th>
      <td class="proposal-meta-value-cell">${input.authorExtension ? escapeHtml(input.authorExtension) : "&nbsp;"}</td>
    </tr>
  </table>
`;

const renderProposalHighlightCardHtml = (input: {
  earlyPayoutTotalAllowanceAmount: number;
  formatCurrencyLabel: (amount: number) => string;
  regularTotalAllowanceAmount: number;
  totalAllowanceAmount: number;
}) => `
  <div class="proposal-highlight-card">
    <span>총 지급 요청 금액</span>
    <strong>${escapeHtml(input.formatCurrencyLabel(input.totalAllowanceAmount))}</strong>
    <div class="proposal-highlight-breakdown">
      <div class="proposal-highlight-line">
        <span class="proposal-highlight-line-label">정규 지급</span>
        <em class="proposal-highlight-line-value">${escapeHtml(
          input.formatCurrencyLabel(input.regularTotalAllowanceAmount)
        )}</em>
      </div>
      <div class="proposal-highlight-line">
        <span class="proposal-highlight-line-label">퇴사자 선지급</span>
        <em class="proposal-highlight-line-value">${escapeHtml(
          input.formatCurrencyLabel(input.earlyPayoutTotalAllowanceAmount)
        )}</em>
      </div>
    </div>
  </div>
`;

const renderAttachmentOneTitleHtml = (input: {
  logoDataUrl: string | null;
  workMonthLabel: string;
}) => `
  <div class="attachment-title attachment-title-strip">
    <div class="attachment-title-copy">
      <h1>별첨1. ${escapeHtml(input.workMonthLabel)} 교대근무자 시간외근로수당 내역</h1>
    </div>
    ${renderDocumentBrandLogo(input.logoDataUrl)}
  </div>
`;

const renderAttachmentTwoTitleHtml = (input: {
  dateRangeLabel: string;
  logoDataUrl: string | null;
  workMonthLabel: string;
}) => `
  <div class="attachment-title attachment-title-strip">
    <div class="attachment-title-copy">
      <h1>별첨2. ${escapeHtml(input.workMonthLabel)} 수당 지급 현황</h1>
      <p class="subtle">${escapeHtml(input.dateRangeLabel)}</p>
    </div>
    ${renderDocumentBrandLogo(input.logoDataUrl)}
  </div>
`;

export const renderProposalMetaTableHtmlForTest = renderProposalMetaTableHtml;
export const renderProposalHighlightCardHtmlForTest = renderProposalHighlightCardHtml;
export const renderAttachmentOneTitleHtmlForTest = renderAttachmentOneTitleHtml;
export const renderAttachmentTwoTitleHtmlForTest = renderAttachmentTwoTitleHtml;

const buildProposalLayoutConfig = (input: {
  regularSiteCount: number;
  earlyPayoutSiteCount: number;
}) => {
  const mainPageClasses = ["proposal-document-page", "proposal-main-page"];
  const regularSectionClasses = ["proposal-section-block", "proposal-regular-section"];
  const earlyPayoutSectionClasses = ["proposal-section-block", "proposal-flow-section"];
  const footerSectionClasses = ["proposal-section-block", "proposal-footer-list", "proposal-flow-section"];
  const layoutLoadScore =
    input.regularSiteCount +
    input.earlyPayoutSiteCount +
    (input.earlyPayoutSiteCount > 0 ? 2 : 0);

  if (layoutLoadScore >= 11) {
    mainPageClasses.push("proposal-main-page-compact");
  }

  if (layoutLoadScore >= 15) {
    mainPageClasses.push("proposal-main-page-compressed");
  }

  const regularCompactThreshold = input.earlyPayoutSiteCount > 0 ? 7 : 9;
  const regularCompressedThreshold = input.earlyPayoutSiteCount > 0 ? 10 : 12;

  if (input.regularSiteCount >= regularCompactThreshold) {
    regularSectionClasses.push("proposal-table-compact");
  }

  if (input.regularSiteCount >= regularCompressedThreshold) {
    regularSectionClasses.push("proposal-table-compressed");
  }

  if (input.earlyPayoutSiteCount >= 4) {
    earlyPayoutSectionClasses.push("proposal-table-compact");
  }

  if (input.earlyPayoutSiteCount >= 7) {
    earlyPayoutSectionClasses.push("proposal-table-compressed");
  }

  return {
    mainPageClassName: mainPageClasses.join(" "),
    regularSectionClassName: regularSectionClasses.join(" "),
    earlyPayoutSectionClassName: earlyPayoutSectionClasses.join(" "),
    footerSectionClassName: footerSectionClasses.join(" ")
  };
};

export const buildProposalLayoutConfigForTest = (input: {
  regularSiteCount: number;
  earlyPayoutSiteCount: number;
}) => buildProposalLayoutConfig(input);

const documentBrandLogoCss = `
  .document-brand-logo {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 44px;
    min-width: 180px;
  }
  .document-brand-logo img {
    display: block;
    max-width: 180px;
    max-height: 44px;
    object-fit: contain;
  }
`;

const attachmentRateGuideCss = `
  .attachment-rate-guide {
    margin-top: 28px;
    padding-top: 8px;
  }
  .attachment-rate-guide h2 {
    margin: 0 0 12px;
    color: #1e335f;
    font-size: 13px;
    line-height: 1.35;
  }
  .attachment-rate-guide-grid {
    display: grid;
    grid-template-columns: repeat(var(--guide-columns, 1), minmax(0, 1fr));
    gap: 10px;
  }
  .attachment-rate-entry {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid #d8dfed;
    border-radius: 10px;
    background: #fbfcfe;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .attachment-rate-entry-title {
    display: block;
    margin-bottom: 8px;
    color: #1e335f;
    font-weight: 800;
  }
  .attachment-rate-entry-body {
    display: block;
  }
  .attachment-rate-line {
    display: block;
    line-height: 1.45;
    white-space: pre-wrap;
  }
  .attachment-rate-line + .attachment-rate-line {
    margin-top: 4px;
  }
  .attachment-rate-line-formula {
    padding-left: 8px;
    color: #41526d;
  }
`;

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
        font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
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

const buildPdfSiteSummaries = (rows: PdfExportRow[]): PdfSiteSummary[] =>
  [...rows.reduce((accumulator, row) => {
    const current = accumulator.get(row.department) ?? {
      department: row.department,
      employeeCodes: new Set<string>(),
      substituteAmount: 0,
      overtimeAmount: 0,
      holidayAmount: 0,
      totalAmount: 0
    };

    current.employeeCodes.add(`${row.employeeCode}:${row.employeeName}`);
    current.substituteAmount += row.substituteAmount;
    current.overtimeAmount += row.summaryOvertimeAmount;
    current.holidayAmount += row.holidayAmount;
    current.totalAmount += row.calculation.snapshot.totalAllowanceAmount;
    accumulator.set(row.department, current);

    return accumulator;
  }, new Map<string, {
    department: string;
    employeeCodes: Set<string>;
    substituteAmount: number;
    overtimeAmount: number;
    holidayAmount: number;
    totalAmount: number;
  }>()).values()]
    .map((row) => ({
      department: row.department,
      employeeCount: row.employeeCodes.size,
      holidayAmount: row.holidayAmount,
      overtimeAmount: row.overtimeAmount,
      substituteAmount: row.substituteAmount,
      totalAmount: row.totalAmount
    }))
    .sort((left, right) => right.totalAmount - left.totalAmount || left.department.localeCompare(right.department, "ko"));

const compactPdfSiteSummaries = (rows: PdfSiteSummary[], maxVisibleRows = 8) => {
  if (rows.length <= maxVisibleRows) {
    return rows;
  }

  const visibleRows = rows.slice(0, maxVisibleRows - 1);
  const remainingRows = rows.slice(maxVisibleRows - 1);

  visibleRows.push({
    department: `기타 ${remainingRows.length}개 근무지`,
    employeeCount: remainingRows.reduce((sum, row) => sum + row.employeeCount, 0),
    holidayAmount: remainingRows.reduce((sum, row) => sum + row.holidayAmount, 0),
    overtimeAmount: remainingRows.reduce((sum, row) => sum + row.overtimeAmount, 0),
    substituteAmount: remainingRows.reduce((sum, row) => sum + row.substituteAmount, 0),
    totalAmount: remainingRows.reduce((sum, row) => sum + row.totalAmount, 0)
  });

  return visibleRows;
};

const buildWorkTypeSegments = (input: {
  formatCurrencyLabel: (amount: number) => string;
  formatHoursLabel: (minutes: number) => string;
  rows: PdfExportRow[];
}) => {
  const totals: Record<
    "substitute" | "overtime" | "holiday",
    {
      amount: number;
      color: string;
      label: string;
      minutes: number;
    }
  > = {
    substitute: {
      amount: 0,
      color: "#5b88ff",
      label: "대체근무",
      minutes: 0
    },
    overtime: {
      amount: 0,
      color: "#ffb648",
      label: "연장근무",
      minutes: 0
    },
    holiday: {
      amount: 0,
      color: "#ff7f94",
      label: "법정근무",
      minutes: 0
    }
  };

  input.rows.forEach((row) => {
    const segmentKey =
      row.summaryCategory === "legalHoliday"
        ? "holiday"
        : row.summaryCategory === "substitute"
          ? "substitute"
          : "overtime";
    totals[segmentKey].amount += row.calculation.snapshot.totalAllowanceAmount;
    totals[segmentKey].minutes += row.calculation.snapshot.breakdown.totalWorkMinutes;
  });

  const grandTotalAmount = Object.values(totals).reduce((sum, row) => sum + row.amount, 0);
  const segments = Object.entries(totals).map(([key, row]) => ({
    amount: row.amount,
    color: row.color,
    formattedAmount: input.formatCurrencyLabel(row.amount),
    formattedMinutes: input.formatHoursLabel(row.minutes),
    key,
    label: row.label,
    minutes: row.minutes,
    percentage: grandTotalAmount > 0 ? Math.round((row.amount / grandTotalAmount) * 100) : 0
  }));

  const dominantSegment = [...segments].sort(
    (left, right) => right.amount - left.amount || left.label.localeCompare(right.label, "ko")
  )[0] ?? null;

  return {
    dominantSegment,
    grandTotalAmount,
    segments
  };
};

const buildDonutGradient = (
  segments: Array<{
    amount: number;
    color: string;
  }>,
  grandTotalAmount: number
) => {
  if (grandTotalAmount <= 0) {
    return "#d8dfef";
  }

  let currentAngle = 0;

  return `conic-gradient(${segments
    .map((segment) => {
      const segmentAngle = (segment.amount / grandTotalAmount) * 360;
      const startAngle = currentAngle;
      currentAngle += segmentAngle;

      return `${segment.color} ${startAngle}deg ${currentAngle}deg`;
    })
    .join(", ")})`;
};

export const writeAllowancePdfDocuments = async (input: {
  proposalPath: string;
  attachment1Path: string;
  attachment2Path: string;
  workMonth: string;
  rows: PdfExportRow[];
  holidayNamesByDate: ReadonlyMap<string, string>;
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
  rateGuideEntries: AllowanceRateGuideEntry[];
  allowanceAxisLabels: Record<AllowanceRateAxis, string>;
}) => {
  const brandLogoDataUrl = resolveBrandLogoDataUrl();
  const sessionResult = getSession();
  const currentSession = sessionResult.ok ? sessionResult.data : null;
  const currentOperationUser =
    currentSession?.loginId
      ? listStoredOperationUsers().find((user) => user.loginId === currentSession.loginId) ?? null
      : null;
  const regularRows = input.rows.filter((row) => !row.earlyPayoutDate);
  const earlyPayoutRows = input.rows.filter((row) => Boolean(row.earlyPayoutDate));
  const siteSummaries = buildPdfSiteSummaries(regularRows);
  const earlyPayoutSiteSummaries = buildPdfSiteSummaries(earlyPayoutRows);
  const chartSiteSummaries = compactPdfSiteSummaries(buildPdfSiteSummaries(input.rows));
  const workTypeSegments = buildWorkTypeSegments({
    formatCurrencyLabel: input.formatCurrencyLabel,
    formatHoursLabel: input.formatHoursLabel,
    rows: input.rows
  });
  const chartMaxAmount = chartSiteSummaries[0]?.totalAmount ?? 1;
  const employeeCount = new Set(input.rows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size;
  const printedDate = input.formatDate(new Date().toISOString().slice(0, 10));
  const nextPayrollMonthLabel = input.formatNextPayrollMonthLabel(input.workMonth);
  const donutGradient = buildDonutGradient(workTypeSegments.segments, workTypeSegments.grandTotalAmount);
  const proposalAuthorName =
    currentOperationUser?.displayName?.trim() ||
    currentSession?.displayName?.trim() ||
    "운영담당";
  const proposalAuthorExtension = currentOperationUser?.extensionNumber?.trim() || "";
  const proposalLayout = buildProposalLayoutConfig({
    regularSiteCount: siteSummaries.length,
    earlyPayoutSiteCount: earlyPayoutSiteSummaries.length
  });
  const proposalChartNote =
    "품의 제출용으로는 근무지별 지급액 순위를 가로 막대로, 근로유형별 구성 비중을 도넛으로 함께 제시하는 방식이 가장 빠르게 읽힙니다.";

  const proposalHtml = renderPdfPageShell({
    title: `${input.workMonth} 품의서`,
    pageSize: "A4 portrait",
    extraCss: `
      .proposal-document-page + .proposal-document-page {
        break-before: page;
        page-break-before: always;
      }
      .proposal-main-page > * + *,
      .proposal-chart-page > * + * {
        margin-top: 12px;
      }
      .proposal-main-page.proposal-main-page-compact > * + * {
        margin-top: 10px;
      }
      .proposal-main-page.proposal-main-page-compressed > * + * {
        margin-top: 8px;
      }
      .proposal-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(220px, 0.42fr);
        gap: 14px;
        align-items: stretch;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-hero {
        gap: 12px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-hero {
        gap: 10px;
      }
      .proposal-title-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .proposal-title-block {
        display: grid;
        gap: 6px;
      }
      .proposal-title-label {
        color: #6a7791;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
      }
      .proposal-title-main {
        color: #1c2f57;
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.05em;
      }
      .proposal-title-sub {
        color: #60708a;
        font-size: 12px;
      }
      ${documentBrandLogoCss}
      .proposal-meta {
        table-layout: fixed;
      }
      .proposal-meta col.proposal-meta-key {
        width: 10%;
      }
      .proposal-meta col.proposal-meta-value {
        width: 17%;
      }
      .proposal-meta col.proposal-meta-approval {
        width: 11.5%;
      }
      .proposal-meta th {
        width: 72px;
        background: #f1f5fb;
        color: #3c4f72;
      }
      .proposal-meta td, .proposal-meta th {
        padding: 7px 8px;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-meta td,
      .proposal-main-page.proposal-main-page-compact .proposal-meta th {
        padding: 6px 7px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-meta td,
      .proposal-main-page.proposal-main-page-compressed .proposal-meta th {
        padding: 5px 6px;
      }
      .proposal-meta .proposal-meta-value-cell {
        font-weight: 600;
      }
      .proposal-meta .proposal-meta-inline-head,
      .proposal-meta .proposal-approval-head {
        text-align: center;
        white-space: nowrap;
      }
      .proposal-meta .proposal-approval-cell {
        background: #ffffff;
      }
      .proposal-meta .proposal-meta-detail-row td,
      .proposal-meta .proposal-meta-detail-row th {
        padding-top: 9px;
        padding-bottom: 9px;
      }
      .proposal-meta .proposal-meta-stamp {
        display: inline-block;
        margin-left: 12px;
        color: #60708a;
        font-weight: 700;
      }
      .proposal-meta .proposal-approval-cell {
        padding: 0;
        vertical-align: top;
      }
      .proposal-approval-space {
        min-height: 76px;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-approval-space {
        min-height: 68px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-approval-space {
        min-height: 60px;
      }
      .proposal-copy {
        display: grid;
        gap: 10px;
        border: 1px solid #e2e8f3;
        border-radius: 18px;
        background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
        padding: 18px 20px;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-copy {
        gap: 8px;
        padding: 16px 18px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-copy {
        gap: 7px;
        padding: 14px 16px;
      }
      .proposal-copy h1 {
        margin: 0;
        color: #1d2f57;
        font-size: 20px;
        line-height: 1.35;
        letter-spacing: -0.03em;
      }
      .proposal-copy p {
        color: #41526d;
        line-height: 1.7;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-copy p {
        line-height: 1.55;
      }
      .proposal-copy .proposal-callout {
        border-left: 3px solid #4a79d8;
        background: #f5f8ff;
        padding: 12px 14px;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-copy .proposal-callout {
        padding: 10px 12px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-copy .proposal-callout {
        padding: 8px 10px;
      }
      .proposal-callout p + p {
        margin-top: 6px;
      }
      .proposal-highlight-card {
        display: grid;
        align-content: start;
        gap: 8px;
        border-radius: 18px;
        background: linear-gradient(180deg, #234384 0%, #1a3469 100%);
        color: #ffffff;
        padding: 18px;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-highlight-card {
        gap: 7px;
        padding: 16px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-highlight-card {
        gap: 6px;
        padding: 14px;
      }
      .proposal-highlight-card strong {
        font-size: 28px;
        line-height: 1.05;
        letter-spacing: -0.05em;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-highlight-card strong {
        font-size: 24px;
      }
      .proposal-highlight-card span {
        color: rgba(255, 255, 255, 0.76);
        font-size: 11px;
        font-weight: 800;
      }
      .proposal-highlight-card em {
        color: rgba(255, 255, 255, 0.82);
        font-size: 12px;
        font-style: normal;
        line-height: 1.5;
      }
      .proposal-highlight-breakdown {
        display: grid;
        gap: 8px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-highlight-breakdown {
        gap: 6px;
      }
      .proposal-highlight-line {
        display: grid;
        gap: 2px;
      }
      .proposal-highlight-line-label {
        color: rgba(255, 255, 255, 0.76);
        font-size: 11px;
        font-weight: 800;
      }
      .proposal-highlight-line-value {
        color: rgba(255, 255, 255, 0.92);
        font-size: 13px;
      }
      .proposal-section-block {
        display: block;
        page-break-inside: auto;
      }
      .proposal-section-block > .proposal-section-title {
        break-after: avoid-page;
        page-break-after: avoid;
      }
      .proposal-section-title {
        color: #1e335f;
        margin: 0 0 10px;
        font-size: 16px;
        font-weight: 800;
        line-height: 1.35;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-section-title {
        margin-bottom: 8px;
        font-size: 15px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-section-title {
        margin-bottom: 7px;
        font-size: 14px;
      }
      .proposal-regular-section table {
        table-layout: fixed;
      }
      .proposal-section-block table {
        box-shadow: inset 0 0 0 1px rgba(215, 223, 238, 0.72);
      }
      .proposal-section-block th {
        background: #f1f5fb;
      }
      .proposal-section-block td {
        padding: 8px;
      }
      .total-row td, .subtotal-row td {
        background: #eef3fb;
        font-weight: 700;
      }
      .proposal-flow-section {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .proposal-table-compact th,
      .proposal-table-compact td {
        padding: 6px 7px;
        font-size: 11px;
      }
      .proposal-table-compressed th,
      .proposal-table-compressed td {
        padding: 5px 6px;
        font-size: 10px;
      }
      .proposal-footer-list {
        page-break-inside: avoid;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-footer-list {
        font-size: 11px;
      }
      .proposal-footer-list p + p {
        margin-top: 8px;
      }
      .proposal-main-page.proposal-main-page-compact .proposal-footer-list p + p {
        margin-top: 6px;
      }
      .proposal-main-page.proposal-main-page-compressed .proposal-footer-list p + p {
        margin-top: 4px;
      }
      .proposal-chart-page {
        display: block;
      }
      .proposal-summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .proposal-summary-card {
        display: grid;
        gap: 6px;
        border: 1px solid #dce5f4;
        border-radius: 16px;
        background: linear-gradient(180deg, #fbfcff 0%, #f4f7fd 100%);
        padding: 14px 16px;
      }
      .proposal-summary-card span {
        color: #69809f;
        font-size: 11px;
        font-weight: 800;
      }
      .proposal-summary-card strong {
        color: #1f325a;
        font-size: 22px;
        line-height: 1.15;
      }
      .proposal-summary-card em {
        color: #60708a;
        font-size: 11px;
        font-style: normal;
      }
      .proposal-chart-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr);
        gap: 14px;
        align-items: start;
      }
      .proposal-chart-card {
        display: grid;
        gap: 12px;
        border: 1px solid #dce5f4;
        border-radius: 18px;
        background: linear-gradient(180deg, #ffffff 0%, #f7f9fd 100%);
        padding: 18px 20px;
        page-break-inside: avoid;
      }
      .proposal-chart-card-head h2 {
        margin: 0;
        color: #1e335f;
      }
      .proposal-chart-card-head h3 {
        margin: 0;
        color: #1e335f;
        font-size: 15px;
        line-height: 1.35;
      }
      .proposal-chart-card-head p {
        margin-top: 6px;
        color: #60708a;
      }
      .proposal-bar-list {
        display: grid;
        gap: 12px;
      }
      .proposal-bar-row {
        display: grid;
        gap: 6px;
      }
      .proposal-bar-copy {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: #34415d;
        font-size: 12px;
      }
      .proposal-bar-copy strong {
        color: #1f325a;
      }
      .proposal-bar-track {
        overflow: hidden;
        height: 10px;
        border-radius: 999px;
        background: #e8eef9;
      }
      .proposal-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #3758b0 0%, #8da2de 100%);
      }
      .proposal-donut-shell {
        display: grid;
        justify-items: center;
        gap: 14px;
      }
      .proposal-donut {
        position: relative;
        display: grid;
        width: 180px;
        height: 180px;
        place-items: center;
        border-radius: 50%;
        box-shadow: 0 16px 30px rgba(48, 71, 128, 0.12);
      }
      .proposal-donut::after {
        content: "";
        width: 118px;
        height: 118px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: inset 0 0 0 1px #edf1f9;
      }
      .proposal-donut-center {
        position: absolute;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: 4px;
      }
      .proposal-donut-center strong {
        color: #1f325a;
        font-size: 24px;
        line-height: 1.05;
      }
      .proposal-donut-center span {
        color: #697a95;
        font-size: 11px;
        font-weight: 700;
      }
      .proposal-donut-legend {
        display: grid;
        gap: 10px;
        width: 100%;
      }
      .proposal-donut-legend-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: #41526d;
        font-size: 12px;
      }
      .proposal-donut-legend-item strong {
        color: #1f325a;
      }
      .proposal-donut-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .proposal-donut-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .proposal-chart-note {
        color: #60708a;
        line-height: 1.65;
      }
    `,
    body: `
      <div class="${proposalLayout.mainPageClassName}">
        <div class="proposal-title-strip">
          <div class="proposal-title-block">
            <span class="proposal-title-label">ALLOWANCE APPROVAL REQUEST</span>
            <strong class="proposal-title-main">시간외 근로 수당 지급 품의서</strong>
            <span class="proposal-title-sub">${escapeHtml(input.formatMonthLabel(input.workMonth))} 기준 지급 승인 요청</span>
          </div>
          ${renderDocumentBrandLogo(brandLogoDataUrl)}
        </div>
        ${renderProposalMetaTableHtml({
          authorExtension: proposalAuthorExtension,
          authorName: proposalAuthorName,
          ownerDepartment: "DT사업1팀",
          printedDate,
          workMonth: input.workMonth
        })}
        <div class="proposal-hero">
          <div class="proposal-copy">
            <h2 class="proposal-section-title">1. 대상 기준 및 대상자</h2>
            <p>${escapeHtml(input.formatMonthLabel(input.workMonth))} 실적 승인 기준으로 연장근무, 대체근무, 휴일근무 발생분을 집계했습니다. 아래 기준과 대상자를 확인해 결재를 요청합니다.</p>
            <div class="proposal-callout">
              <p><strong>① 대상 기준</strong> : 월 근무계획 외 연장, 대체 근무를 수행한 자 또는 휴일근무를 수행한 자</p>
              <p><strong>② 당월 지급 대상자</strong> : ${employeeCount}명</p>
            </div>
          </div>
          ${renderProposalHighlightCardHtml({
            earlyPayoutTotalAllowanceAmount: input.earlyPayoutTotalAllowanceAmount,
            formatCurrencyLabel: input.formatCurrencyLabel,
            regularTotalAllowanceAmount: input.regularTotalAllowanceAmount,
            totalAllowanceAmount: input.totalAllowanceAmount
          })}
        </div>
        <section class="${proposalLayout.regularSectionClassName}">
          <h2 class="proposal-section-title">2. ${Number(input.workMonth.slice(5))}월 지급 요청 내역</h2>
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
        </section>
        <section class="${proposalLayout.earlyPayoutSectionClassName}">
          <h2 class="proposal-section-title">3. ${escapeHtml(nextPayrollMonthLabel)} 퇴사자 지급 내역</h2>
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
        </section>
        <section class="${proposalLayout.footerSectionClassName}">
          <p><span class="proposal-section-title">4. 지급 요청일</span> : ${escapeHtml(nextPayrollMonthLabel)} 급여일</p>
          <p><span class="proposal-section-title">5. 세부내역</span> : 별첨1, 별첨2 참조</p>
        </section>
      </div>
      <div class="proposal-document-page proposal-chart-page">
        <div class="proposal-title-strip">
          <div class="proposal-title-block">
            <span class="proposal-title-label">ALLOWANCE VISUAL SUMMARY</span>
            <strong class="proposal-title-main">수당 분포 요약 차트</strong>
            <span class="proposal-title-sub">${escapeHtml(input.formatMonthLabel(input.workMonth))} 지급액 기준</span>
          </div>
          ${renderDocumentBrandLogo(brandLogoDataUrl)}
        </div>

        <section class="proposal-section-block">
          <h2 class="proposal-section-title">6. 수당 분포 요약 차트</h2>
          <p class="proposal-chart-note">${escapeHtml(proposalChartNote)}</p>
        </section>

        <div class="proposal-summary-grid">
          <div class="proposal-summary-card">
            <span>총 지급 요청 금액</span>
            <strong>${escapeHtml(input.formatCurrencyLabel(input.totalAllowanceAmount))}</strong>
            <em>품의서 전체 합계</em>
          </div>
          <div class="proposal-summary-card">
            <span>정규 지급</span>
            <strong>${escapeHtml(input.formatCurrencyLabel(input.regularTotalAllowanceAmount))}</strong>
            <em>2번 항목 기준</em>
          </div>
          <div class="proposal-summary-card">
            <span>퇴사자 선지급</span>
            <strong>${escapeHtml(input.formatCurrencyLabel(input.earlyPayoutTotalAllowanceAmount))}</strong>
            <em>3번 항목 기준</em>
          </div>
          <div class="proposal-summary-card">
            <span>대상 인원</span>
            <strong>${employeeCount}명</strong>
            <em>문서 기준 산출 인원</em>
          </div>
        </div>

        <div class="proposal-chart-grid">
          <section class="proposal-chart-card">
            <div class="proposal-chart-card-head">
              <h3>6-1. 근무지별 지급액 분포</h3>
              <p>근무지별 총 지급액 순위를 가로 막대로 정리했습니다.</p>
            </div>
            <div class="proposal-bar-list">
              ${chartSiteSummaries
                .map(
                  (row) => `
                    <div class="proposal-bar-row">
                      <div class="proposal-bar-copy">
                        <strong>${escapeHtml(row.department)}</strong>
                        <span>${escapeHtml(input.formatCurrencyLabel(row.totalAmount))} · ${row.employeeCount}명</span>
                      </div>
                      <div class="proposal-bar-track">
                        <div class="proposal-bar-fill" style="width: ${Math.max(
                          (row.totalAmount / chartMaxAmount) * 100,
                          10
                        )}%"></div>
                      </div>
                    </div>
                  `
                )
                .join("")}
            </div>
          </section>

          <section class="proposal-chart-card">
            <div class="proposal-chart-card-head">
              <h3>6-2. 근로유형별 비중</h3>
              <p>근무유형별 지급액 구성 비중을 함께 표시했습니다.</p>
            </div>
            <div class="proposal-donut-shell">
              <div class="proposal-donut" style="background: ${donutGradient}">
                <div class="proposal-donut-center">
                  <strong>${escapeHtml(
                    workTypeSegments.dominantSegment
                      ? `${workTypeSegments.dominantSegment.percentage}%`
                      : "0%"
                  )}</strong>
                  <span>${escapeHtml(
                    workTypeSegments.dominantSegment?.label ?? "비중 없음"
                  )}</span>
                </div>
              </div>
              <div class="proposal-donut-legend">
                ${workTypeSegments.segments
                  .map(
                    (segment) => `
                      <div class="proposal-donut-legend-item">
                        <span class="proposal-donut-label">
                          <i class="proposal-donut-dot" style="background: ${segment.color}"></i>
                          <strong>${escapeHtml(segment.label)}</strong>
                        </span>
                        <span>${segment.percentage}% · ${escapeHtml(segment.formattedAmount)}</span>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          </section>
        </div>
      </div>
    `
  });

  const attachment1Html = renderPdfPageShell({
    title: `${input.workMonth} 별첨1`,
    pageSize: "A4 landscape",
    extraCss: `
      th, td { font-size: 10px; }
      ${documentBrandLogoCss}
      .attachment-title-strip {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }
      .attachment-title { margin-bottom: 0; }
      .attachment-title-copy {
        display: grid;
        gap: 4px;
      }
      .attachment-title h1 { font-size: 18px; }
      .subtotal-row td { background: #f4f6fb; font-weight: 700; }
      .attachment-date-cell.holiday-highlight {
        background: #fde7e7;
        color: #b42318;
        font-weight: 700;
      }
      ${attachmentRateGuideCss}
    `,
    body: `
      ${renderAttachmentOneTitleHtml({
        logoDataUrl: brandLogoDataUrl,
        workMonthLabel: input.formatMonthLabel(input.workMonth)
      })}
      ${renderAttachmentOneTableHtml({
        rows: input.rows,
        holidayNamesByDate: input.holidayNamesByDate,
        formatCurrencyLabel: input.formatCurrencyLabel,
        formatDate: input.formatDate,
        formatHoursLabel: input.formatHoursLabel,
        summaryCategoryOrder: input.summaryCategoryOrder,
        allowanceAxisLabels: input.allowanceAxisLabels
      })}
      ${renderAttachmentRateGuideHtml(input.rateGuideEntries)}
    `
  });

  const attachment2Html = renderPdfPageShell({
    title: `${input.workMonth} 별첨2`,
    pageSize: "A4 portrait",
    extraCss: `
      th, td { font-size: 10px; }
      ${documentBrandLogoCss}
      .attachment-title-strip {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }
      .attachment-title { margin-bottom: 0; }
      .attachment-title-copy {
        display: grid;
        gap: 4px;
      }
      .attachment-title h1 { font-size: 18px; }
      .subtotal-row td, .total-row td { background: #f4f6fb; font-weight: 700; }
    `,
    body: `
      ${renderAttachmentTwoTitleHtml({
        dateRangeLabel: input.formatProposalDateRange(input.workMonth),
        logoDataUrl: brandLogoDataUrl,
        workMonthLabel: input.formatMonthLabel(input.workMonth)
      })}
      ${renderAttachmentTwoTableHtml({
        rows: input.rows,
        formatCurrencyLabel: input.formatCurrencyLabel,
        formatDate: input.formatDate,
        summaryCategoryOrder: input.summaryCategoryOrder
      })}
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
