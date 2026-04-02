import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import { APP_DISPLAY_NAME } from "../../shared/config/app-brand";
import type {
  AllowanceDocumentExportInput,
  BridgeResult
} from "../../shared/bridge/contracts";
import type {
  AllowanceDocumentExportFormat,
  AllowanceDocumentExportRecord
} from "../../shared/domain/allowance-document";
import { allowanceRateVersionFixtures } from "../../shared/domain/allowance-rate-fixtures";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type {
  AllowanceCalculationStatus,
  AllowanceProposalPreview
} from "../../shared/domain/allowance-workflow";
import type { AllowanceRateVersion, DocumentTemplateVersion } from "../../shared/domain/model";
import {
  allowanceRateCategoryLabels,
  allowanceRateCategoryOrder,
  buildAllowanceRateTable,
  resolveAllowanceSummaryCategory,
  type AllowanceRateAxis,
  type AllowanceRateCategoryCode,
  type AllowanceSummaryCategory
} from "../../shared/domain/allowance-rate-matrix";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import {
  listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults
} from "./approved-allowance-calculation-service";
import { saveStoredAllowanceDocumentExport } from "./allowance-document-export-history-service";
import { writeAllowancePdfDocuments } from "./allowance-document-pdf-service";
import {
  resolveAttachmentOneTemplateFields,
  resolveAttachmentTwoTemplateFields,
  resolveProposalTemplateFields
} from "./document-template-profile-service";
import { resolveDocumentTemplateOutputFileName } from "./document-template-output-file-name-service";
import {
  listStoredHolidayCalendars,
  listStoredAllowanceRateVersions,
  resolveStoredDefaultDocumentTemplateVersion
} from "./operations-storage-service";

interface ResolvedAllowanceExportRow {
  calculation: AllowanceCalculationResultRecord;
  businessCategoryCode: AllowanceRateCategoryCode;
  businessCategoryLabel: string;
  summaryCategory: AllowanceSummaryCategory;
  earlyPayoutDate?: string;
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
  substituteAmount: number;
  summaryOvertimeAmount: number;
  holidayAmount: number;
}

interface AllowanceSiteSummary {
  department: string;
  substituteAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  totalAmount: number;
}

interface AllowanceProposalExportSections {
  regularRows: ResolvedAllowanceExportRow[];
  earlyPayoutRows: ResolvedAllowanceExportRow[];
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
}

interface ResolvedAllowanceDocumentContext {
  workMonth: string;
  results: AllowanceCalculationResultRecord[];
  exportRows: ResolvedAllowanceExportRow[];
  proposalSections: AllowanceProposalExportSections;
  totalAllowanceAmount: number;
  employeeCount: number;
  rateGuideEntries: AllowanceRateGuideEntry[];
  holidayNamesByDate: Map<string, string>;
}

interface ResolveAllowanceDocumentOptions {
  allowedStatuses?: AllowanceCalculationStatus[];
  statusErrorMessage?: string;
}

interface AllowanceRateGuideLine {
  kind: "detail" | "applied" | "formula";
  text: string;
}

interface AllowanceRateGuideEntry {
  categoryCode: AllowanceRateCategoryCode;
  label: string;
  lines: AllowanceRateGuideLine[];
  sequence: number;
}

interface AllowanceRateGuideVersionSource {
  effectiveFrom?: string;
  effectiveTo?: string;
  hideVersionLabelLine?: boolean;
  rateTableByCategory: Partial<
    Record<AllowanceRateCategoryCode, Record<AllowanceRateAxis, number>>
  >;
  sortKey: string;
  versionId: string;
  versionLabel: string;
}

const updatedProposalTemplateFileNames = new Set([
  "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
]);

const summaryCategoryOrder: Record<AllowanceSummaryCategory, number> = {
  substitute: 0,
  overtime: 1,
  legalHoliday: 2
};

const summaryCategoryLabel: Record<AllowanceSummaryCategory, string> = {
  substitute: "대체근무",
  overtime: "연장근무",
  legalHoliday: "법정휴일근무"
};

const allowanceRateGuideDescriptions: Record<AllowanceRateCategoryCode, string> = {
  "legal-holiday": "법정공휴일, 공휴일, 휴일근로로 분류된 근무에 적용됩니다.",
  "weekday-substitute": "평일에 발생한 대체근무에 적용됩니다.",
  "holiday-substitute": "휴일에 발생한 대체근무에 적용됩니다.",
  "weekday-overtime": "평일 연장근무에 적용됩니다.",
  "holiday-overtime": "휴일 연장근무 분류용 기준이며 현재는 별도 지급 없이 x0 기준을 사용합니다."
};

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook;
};

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const formatDate = (value: string) => value.replaceAll("-", ".");

const formatMonthLabel = (workMonth: string) => {
  const [year, month] = workMonth.split("-");
  return `${year}년 ${Number(month)}월`;
};

const formatNextPayrollMonthLabel = (workMonth: string) => {
  const [yearText, monthText] = workMonth.split("-");
  const baseDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  baseDate.setUTCMonth(baseDate.getUTCMonth() + 1);
  return `${baseDate.getUTCMonth() + 1}월`;
};

const formatDecimalHours = (minutes: number) => {
  const hours = minutes / 60;

  return Number(Number.isInteger(hours) ? hours : hours.toFixed(2));
};

const formatHoursLabel = (minutes: number) => `${formatDecimalHours(minutes)}h`;

const formatCurrencyLabel = (amount: number) => `₩${amount.toLocaleString("ko-KR")}`;

const formatPdfCurrencyLabel = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

const formatMultiplierText = (value: number) => {
  if (!Number.isFinite(value)) {
    return "x0";
  }

  const normalizedValue = Number.isInteger(value) ? value.toLocaleString("ko-KR") : value.toFixed(1);
  return `x${normalizedValue}`;
};

const formatAllowanceRateVersionLabel = (version: {
  versionLabel: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}) => {
  const formatDateLabel = (value?: string) => {
    if (!value) {
      return "미정";
    }

    const [year, month, day] = value.split("-");

    return `${year}.${Number(month)}.${Number(day)}`;
  };

  if (!version.effectiveFrom && !version.effectiveTo) {
    return version.versionLabel;
  }

  return `${version.versionLabel} (${formatDateLabel(version.effectiveFrom)} ~ ${formatDateLabel(
    version.effectiveTo
  )})`;
};

const formatAllowanceAppliedValues = (input: {
  baseMultiplier: number;
  nightMultiplier: number;
  overtimeMultiplier: number;
}) => [
  `기본 ${formatMultiplierText(input.baseMultiplier)}`,
  `연장 ${formatMultiplierText(input.overtimeMultiplier)}`,
  `야간 ${formatMultiplierText(input.nightMultiplier)}`
].join(" / ");

const formatAllowanceFormulaLines = (input: {
  baseMultiplier: number;
  nightMultiplier: number;
  overtimeMultiplier: number;
  prefix?: string;
}) => [
  `${input.prefix ?? ""}계산식 1: 기본수당 = 시급 x 기본시간 ${formatMultiplierText(input.baseMultiplier)}`,
  `${input.prefix ?? ""}계산식 2: 연장수당 = 시급 x 연장시간 ${formatMultiplierText(
    input.overtimeMultiplier
  )}`,
  `${input.prefix ?? ""}계산식 3: 야간수당 = 시급 x 야간시간 ${formatMultiplierText(input.nightMultiplier)}`
];

const shouldHideAllowanceRateVersionLine = (versionLabel: string) =>
  versionLabel.startsWith("Access 실적 이관 ");

const formatProposalDateRange = (workMonth: string) => {
  const [yearText, monthText] = workMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  return `${year}.${month}.1 ~ ${month}.${endDate.getUTCDate()}`;
};

const resolveHolidayNamesByWorkMonth = (workMonth: string) => {
  const year = Number(workMonth.slice(0, 4));

  return listStoredHolidayCalendars(year).reduce((map, calendar) => {
    calendar.items.forEach((item) => {
      const holidayName = item.name.trim() || "공휴일";
      const holidayLabel =
        item.isSubstitute && !holidayName.startsWith("대체공휴일")
          ? `대체공휴일(${holidayName})`
          : holidayName;

      map.set(item.holidayDate, holidayLabel);
    });

    return map;
  }, new Map<string, string>());
};

const toNullableCellValue = (value: number) => (value > 0 ? value : "-");

const getLineByCode = (
  result: AllowanceCalculationResultRecord,
  allowanceCode: string
) => result.snapshot.lines.find((line) => line.allowanceCode === allowanceCode) ?? null;

const resolveBusinessCategoryCode = (
  result: AllowanceCalculationResultRecord
): AllowanceRateCategoryCode => {
  if (typeof result.snapshot.businessCategoryCode === "string") {
    return result.snapshot.businessCategoryCode as AllowanceRateCategoryCode;
  }

  if (result.snapshot.breakdown.substituteMinutes > 0) {
    return "weekday-substitute";
  }

  if (result.snapshot.breakdown.holidayMinutes > 0) {
    return "legal-holiday";
  }

  return "weekday-overtime";
};

const clearCellRange = (
  worksheet: ExcelJS.Worksheet,
  input: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  }
) => {
  for (let rowNumber = input.startRow; rowNumber <= input.endRow; rowNumber += 1) {
    for (let columnNumber = input.startColumn; columnNumber <= input.endColumn; columnNumber += 1) {
      worksheet.getRow(rowNumber).getCell(columnNumber).value = null;
    }
  }
};

const resolveTemplate = (templateType: DocumentTemplateVersion["templateType"]) => {
  const template = resolveStoredDefaultDocumentTemplateVersion(templateType);

  if (!template) {
    throw new Error(`${templateType} 양식 버전을 찾을 수 없습니다.`);
  }

  return template;
};

const createKnownAllowanceRateVersionIndex = (versions: AllowanceRateVersion[]) => {
  const versionIndex = new Map<string, AllowanceRateVersion>();

  allowanceRateVersionFixtures.forEach((version) => {
    versionIndex.set(version.id, version);
  });
  versions.forEach((version) => {
    versionIndex.set(version.id, version);
  });

  return versionIndex;
};

const resolveAllowanceRateGuideVersionSources = (
  results: AllowanceCalculationResultRecord[],
  historyResults: AllowanceCalculationResultRecord[],
  versions: AllowanceRateVersion[]
): AllowanceRateGuideVersionSource[] => {
  const versionIndex = createKnownAllowanceRateVersionIndex(versions);
  const uniqueRateVersionIds = [...new Set(results.map((result) => result.rateVersionId))];

  return uniqueRateVersionIds
    .map((versionId) => {
      const matchedVersion = versionIndex.get(versionId);
      const referencedResults = historyResults.filter((result) => result.rateVersionId === versionId);
      const representativeResult =
        referencedResults[0] ?? results.find((result) => result.rateVersionId === versionId) ?? null;
      const rateTableByCategory: Partial<
        Record<AllowanceRateCategoryCode, Record<AllowanceRateAxis, number>>
      > = matchedVersion ? { ...buildAllowanceRateTable(matchedVersion) } : {};

      referencedResults.forEach((result) => {
        const categoryCode = resolveBusinessCategoryCode(result);
        const existingRate = rateTableByCategory[categoryCode] ?? {
          base: 0,
          overtime: 0,
          night: 0
        };

        rateTableByCategory[categoryCode] = {
          base: getLineByCode(result, "base")?.multiplier ?? existingRate.base,
          overtime: getLineByCode(result, "overtime")?.multiplier ?? existingRate.overtime,
          night: getLineByCode(result, "night")?.multiplier ?? existingRate.night
        };
      });

      return {
        effectiveFrom: matchedVersion?.effectiveFrom,
        effectiveTo: matchedVersion?.effectiveTo,
        hideVersionLabelLine: shouldHideAllowanceRateVersionLine(
          matchedVersion?.versionLabel ?? representativeResult?.rateVersionLabel ?? versionId
        ),
        rateTableByCategory,
        sortKey:
          matchedVersion?.effectiveFrom ??
          representativeResult?.workDate ??
          representativeResult?.snapshot.createdAt ??
          "",
        versionId,
        versionLabel: matchedVersion?.versionLabel ?? representativeResult?.rateVersionLabel ?? versionId
      } satisfies AllowanceRateGuideVersionSource;
    })
    .sort(
      (left, right) =>
        left.sortKey.localeCompare(right.sortKey) || left.versionLabel.localeCompare(right.versionLabel)
    );
};

const buildAllowanceRateGuideEntries = (
  results: AllowanceCalculationResultRecord[],
  options?: {
    historyResults?: AllowanceCalculationResultRecord[];
    knownVersions?: AllowanceRateVersion[];
  }
): AllowanceRateGuideEntry[] => {
  const storedVersions = options?.knownVersions ?? listStoredAllowanceRateVersions();
  const historyResults = options?.historyResults ?? listAllowanceCalculationHistory();
  const versionSources = resolveAllowanceRateGuideVersionSources(
    results,
    historyResults,
    storedVersions
  );

  return allowanceRateCategoryOrder.map((categoryCode, index) => {
    const lines: AllowanceRateGuideLine[] = [
      {
        kind: "detail",
        text:
          versionSources.length > 1
            ? `${allowanceRateGuideDescriptions[categoryCode]} 적용된 요율 버전별 계산식을 함께 표기합니다.`
            : allowanceRateGuideDescriptions[categoryCode]
      }
    ];

    versionSources.forEach((source, versionIndex) => {
      const rate = source.rateTableByCategory[categoryCode];
      const versionLabel = formatAllowanceRateVersionLabel(source);
      const lineSuffix = versionSources.length > 1 ? ` ${versionIndex + 1}` : "";
      const formulaPrefix = versionSources.length > 1 ? `[${source.versionLabel}] ` : "";

      if (!source.hideVersionLabelLine) {
        lines.push({
          kind: "applied",
          text: `적용 요율${lineSuffix}: ${versionLabel}`
        });
      }

      if (rate) {
        lines.push({
          kind: "applied",
          text: `적용 배수${lineSuffix}: ${formatAllowanceAppliedValues({
            baseMultiplier: rate.base,
            nightMultiplier: rate.night,
            overtimeMultiplier: rate.overtime
          })}`
        });
        formatAllowanceFormulaLines({
          baseMultiplier: rate.base,
          nightMultiplier: rate.night,
          overtimeMultiplier: rate.overtime,
          prefix: formulaPrefix
        }).forEach((formulaLine) => {
          lines.push({
            kind: "formula",
            text: formulaLine
          });
        });
        return;
      }

      lines.push({
        kind: "applied",
        text: `적용 배수${lineSuffix}: 해당 분류의 계산 이력을 찾지 못했습니다.`
      });
      [
        `${formulaPrefix}계산식 1: 기본수당 = 시급 x 기본시간 x 적용배수 확인 필요`,
        `${formulaPrefix}계산식 2: 연장수당 = 시급 x 연장시간 x 적용배수 확인 필요`,
        `${formulaPrefix}계산식 3: 야간수당 = 시급 x 야간시간 x 적용배수 확인 필요`
      ].forEach((formulaLine) => {
        lines.push({
          kind: "formula",
          text: formulaLine
        });
      });
    });

    return {
      categoryCode,
      label: allowanceRateCategoryLabels[categoryCode],
      lines,
      sequence: index + 1
    };
  });
};

export const buildAllowanceRateGuideEntriesForTest = (input: {
  results: AllowanceCalculationResultRecord[];
  historyResults?: AllowanceCalculationResultRecord[];
  knownVersions?: AllowanceRateVersion[];
}) => buildAllowanceRateGuideEntries(input.results, input);

const resolveUniqueOutputPath = (directoryPath: string, fileName: string) => {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let currentPath = path.resolve(directoryPath, fileName);
  let duplicateIndex = 1;

  while (existsSync(currentPath)) {
    currentPath = path.resolve(
      directoryPath,
      `${baseName}_dup${String(duplicateIndex).padStart(2, "0")}${extension}`
    );
    duplicateIndex += 1;
  }

  return currentPath;
};

const resolveOutputFileNameByFormat = (
  fileName: string,
  outputFormat: AllowanceDocumentExportFormat
) => {
  if (outputFormat === "xlsx") {
    return fileName;
  }

  return `${path.basename(fileName, path.extname(fileName))}.pdf`;
};

const buildSiteSummaries = (rows: ResolvedAllowanceExportRow[]): AllowanceSiteSummary[] =>
  [...rows.reduce((accumulator, row) => {
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
  }, new Map<string, AllowanceSiteSummary>()).values()].sort(
    (left, right) => right.totalAmount - left.totalAmount || left.department.localeCompare(right.department, "ko")
  );

const compactProposalSiteSummaries = (
  siteSummaries: AllowanceSiteSummary[],
  maxVisibleRows = 11
) => {
  if (siteSummaries.length <= maxVisibleRows) {
    return siteSummaries;
  }

  const visibleRows = siteSummaries.slice(0, maxVisibleRows - 1);
  const remainingRows = siteSummaries.slice(maxVisibleRows - 1);
  visibleRows.push({
    department: `기타 ${remainingRows.length}개 근무지`,
    substituteAmount: remainingRows.reduce((sum, row) => sum + row.substituteAmount, 0),
    overtimeAmount: remainingRows.reduce((sum, row) => sum + row.overtimeAmount, 0),
    holidayAmount: remainingRows.reduce((sum, row) => sum + row.holidayAmount, 0),
    totalAmount: remainingRows.reduce((sum, row) => sum + row.totalAmount, 0)
  });

  return visibleRows;
};

const splitProposalExportSections = (
  rows: ResolvedAllowanceExportRow[]
): AllowanceProposalExportSections => {
  const regularRows = rows.filter((row) => !row.earlyPayoutDate);
  const earlyPayoutRows = rows.filter((row) => Boolean(row.earlyPayoutDate));

  return {
    regularRows,
    earlyPayoutRows,
    regularTotalAllowanceAmount: regularRows.reduce(
      (sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount,
      0
    ),
    earlyPayoutTotalAllowanceAmount: earlyPayoutRows.reduce(
      (sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount,
      0
    )
  };
};

const mapPreviewSiteSummaries = (rows: AllowanceSiteSummary[]) =>
  rows.map((row) => ({
    siteName: row.department,
    substituteAmount: row.substituteAmount,
    overtimeAmount: row.overtimeAmount,
    holidayAmount: row.holidayAmount,
    totalAmount: row.totalAmount
  }));

const cloneRowStyle = (
  worksheet: ExcelJS.Worksheet,
  sourceRowNumber: number,
  targetRowNumber: number,
  endColumn: number
) => {
  const sourceRow = worksheet.getRow(sourceRowNumber);
  const targetRow = worksheet.getRow(targetRowNumber);

  targetRow.height = sourceRow.height;

  for (let columnNumber = 1; columnNumber <= endColumn; columnNumber += 1) {
    const sourceCell = sourceRow.getCell(columnNumber);
    const targetCell = targetRow.getCell(columnNumber);
    targetCell.style = JSON.parse(JSON.stringify(sourceCell.style ?? {}));
  }
};

const syncUpdatedProposalEarlyPayoutRows = (
  worksheet: ExcelJS.Worksheet,
  siteSummaries: AllowanceSiteSummary[],
  totalAmount: number
) => {
  const detailStartRow = 37;
  const templateDetailCapacity = 2;
  const extraRowCount = Math.max(siteSummaries.length - templateDetailCapacity, 0);

  if (extraRowCount > 0) {
    worksheet.spliceRows(39, 0, ...Array.from({ length: extraRowCount }, () => []));

    for (let index = 0; index < extraRowCount; index += 1) {
      cloneRowStyle(worksheet, 38, 39 + index, 8);
    }
  }

  const totalRowNumber = detailStartRow + Math.max(siteSummaries.length, templateDetailCapacity);

  clearCellRange(worksheet, {
    startRow: detailStartRow,
    endRow: totalRowNumber,
    startColumn: 2,
    endColumn: 8
  });

  ["B37:C37", "B38:C38"].forEach((range) => {
    try {
      worksheet.unMergeCells(range);
    } catch {
      // The workbook can already be unmerged after a previous clone step.
    }
  });

  if (siteSummaries.length === 0) {
    worksheet.getCell("D37").value = "해당 없음";
  } else {
    siteSummaries.forEach((summary, index) => {
      const rowNumber = detailStartRow + index;
      worksheet.getCell(`B${rowNumber}`).value = "교대근무";
      worksheet.getCell(`C${rowNumber}`).value = "운영";
      worksheet.getCell(`D${rowNumber}`).value = summary.department;
      worksheet.getCell(`E${rowNumber}`).value = toNullableCellValue(summary.substituteAmount);
      worksheet.getCell(`F${rowNumber}`).value = toNullableCellValue(summary.overtimeAmount);
      worksheet.getCell(`G${rowNumber}`).value = toNullableCellValue(summary.holidayAmount);
      worksheet.getCell(`H${rowNumber}`).value = summary.totalAmount;
    });
  }

  worksheet.getCell(`B${totalRowNumber}`).value = "합 계";
  worksheet.getCell(`H${totalRowNumber}`).value = totalAmount;

  return totalRowNumber;
};

const syncUpdatedProposalFooterRows = (
  worksheet: ExcelJS.Worksheet,
  totalRowNumber: number,
  nextPayrollMonthLabel: string
) => {
  const footerStartRow = totalRowNumber + 2;

  clearCellRange(worksheet, {
    startRow: 41,
    endRow: Math.max(footerStartRow + 1, 42),
    startColumn: 2,
    endColumn: 8
  });

  worksheet.getCell(`B${footerStartRow}`).value = `4. 지급 요청일 : ${nextPayrollMonthLabel} 급여일`;
  worksheet.getCell(`B${footerStartRow + 1}`).value =
    "5. 세부내역 : 별첨1. DT사업1팀 스케줄근무자 시간외근로수당 내역 참조   [끝].";
  syncUpdatedProposalTitleFonts(worksheet, [`B${footerStartRow}`, `B${footerStartRow + 1}`]);
};

const syncUpdatedProposalTitleFonts = (worksheet: ExcelJS.Worksheet, cells: string[]) => {
  const referenceFont = worksheet.getCell("B18").font ?? {
    bold: true,
    size: 11
  };

  cells.forEach((cellAddress) => {
    worksheet.getCell(cellAddress).font = {
      ...referenceFont,
      bold: true,
      size: referenceFont.size ?? 11
    };
  });
};

const writeAttachmentOneRateGuide = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  entries: AllowanceRateGuideEntry[]
) => {
  const applyRateGuideRowStyle = (
    rowNumber: number,
    value: ExcelJS.CellValue,
    font?: Partial<ExcelJS.Font>,
    height?: number
  ) => {
    try {
      worksheet.unMergeCells(`A${rowNumber}:S${rowNumber}`);
    } catch {
      // The target range is usually unmerged in the source template.
    }
    worksheet.mergeCells(`A${rowNumber}:S${rowNumber}`);
    worksheet.getCell(`A${rowNumber}`).value = value;
    worksheet.getCell(`A${rowNumber}`).alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true
    };
    worksheet.getCell(`A${rowNumber}`).font = {
      ...worksheet.getCell(`A${rowNumber}`).font,
      size: 10,
      ...font
    };
    if (height) {
      worksheet.getRow(rowNumber).height = height;
    }
  };

  let nextRowNumber = startRow;

  entries.forEach((entry) => {
    const titleRowNumber = nextRowNumber;
    applyRateGuideRowStyle(
      titleRowNumber,
      `${entry.sequence}. ${entry.label}`,
      {
        bold: true
      },
      22
    );
    nextRowNumber += 1;
    entry.lines.forEach((line) => {
      applyRateGuideRowStyle(
        nextRowNumber,
        line.text,
        line.kind === "formula"
          ? {
              color: { argb: "FF41526D" }
            }
          : undefined,
        20
      );
      nextRowNumber += 1;
    });
    for (let gapIndex = 0; gapIndex < 3; gapIndex += 1) {
      const blankRowNumber = nextRowNumber;
      worksheet.getRow(blankRowNumber).height = 18;
      nextRowNumber += 1;
    }
  });
};

const isUpdatedProposalTemplate = (template: DocumentTemplateVersion) =>
  updatedProposalTemplateFileNames.has(path.basename(template.sourcePath));

const resolveExportRows = (
  results: AllowanceCalculationResultRecord[]
): ResolvedAllowanceExportRow[] =>
  results
    .map((result) => {
      const baseLine = getLineByCode(result, "base");
      const overtimeLine = getLineByCode(result, "overtime");
      const nightLine = getLineByCode(result, "night");
      const primaryLine = baseLine ?? overtimeLine ?? nightLine;
      const businessCategoryCode = resolveBusinessCategoryCode(result);
      const summaryCategory = resolveAllowanceSummaryCategory(businessCategoryCode);

      return {
        calculation: result,
        businessCategoryCode,
        businessCategoryLabel: summaryCategoryLabel[summaryCategory],
        summaryCategory,
        earlyPayoutDate: result.earlyPayoutDate,
        employeeCode: result.employeeCode,
        employeeName: result.employeeName,
        department: result.siteName || "미분류",
        workDate: result.workDate,
        hourlyRate: result.hourlyRate,
        primaryMinutes: primaryLine?.workMinutes ?? 0,
        primaryMultiplier: primaryLine?.multiplier ?? 0,
        primaryAmount: primaryLine?.amount ?? 0,
        overtimeMinutes: overtimeLine?.workMinutes ?? 0,
        overtimeMultiplier: overtimeLine?.multiplier ?? 0,
        overtimeAmount: overtimeLine?.amount ?? 0,
        nightMinutes: nightLine?.workMinutes ?? 0,
        nightMultiplier: nightLine?.multiplier ?? 0,
        nightAmount: nightLine?.amount ?? 0,
        substituteAmount:
          summaryCategory === "substitute" ? result.snapshot.totalAllowanceAmount : 0,
        summaryOvertimeAmount:
          summaryCategory === "overtime" ? result.snapshot.totalAllowanceAmount : 0,
        holidayAmount:
          summaryCategory === "legalHoliday" ? result.snapshot.totalAllowanceAmount : 0
      };
    })
    .sort(
      (left, right) =>
        left.department.localeCompare(right.department, "ko") ||
        summaryCategoryOrder[left.summaryCategory] - summaryCategoryOrder[right.summaryCategory] ||
        left.workDate.localeCompare(right.workDate) ||
        left.employeeName.localeCompare(right.employeeName, "ko")
    );

const buildAttachmentOneSections = (rows: ResolvedAllowanceExportRow[]) =>
  (Object.keys(summaryCategoryOrder) as AllowanceSummaryCategory[])
    .map((summaryCategory) => {
      const sectionRows = rows
        .filter((row) => row.summaryCategory === summaryCategory)
        .sort(
          (left, right) =>
            left.department.localeCompare(right.department, "ko") ||
            left.workDate.localeCompare(right.workDate) ||
            left.employeeName.localeCompare(right.employeeName, "ko")
        );

      return {
        summaryCategory,
        label: summaryCategoryLabel[summaryCategory],
        rows: sectionRows,
        totalWorkMinutes: sectionRows.reduce(
          (sum, row) => sum + row.calculation.snapshot.breakdown.totalWorkMinutes,
          0
        ),
        primaryMinutes: sectionRows.reduce((sum, row) => sum + row.primaryMinutes, 0),
        primaryAmount: sectionRows.reduce((sum, row) => sum + row.primaryAmount, 0),
        overtimeMinutes: sectionRows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
        overtimeAmount: sectionRows.reduce((sum, row) => sum + row.overtimeAmount, 0),
        nightMinutes: sectionRows.reduce((sum, row) => sum + row.nightMinutes, 0),
        nightAmount: sectionRows.reduce((sum, row) => sum + row.nightAmount, 0),
        totalAllowanceAmount: sectionRows.reduce(
          (sum, row) => sum + row.calculation.snapshot.totalAllowanceAmount,
          0
        )
      };
    })
    .filter((section) => section.rows.length > 0);

const writeLegacyProposalWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
}) => {
  const workbook = await readWorkbook(input.template.sourcePath);
  const fields = resolveProposalTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];
  const sections = splitProposalExportSections(input.rows);
  const siteSummaries = buildSiteSummaries(sections.regularRows);
  const employeeCount = new Set(input.rows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size;
  const today = formatDate(new Date().toISOString().slice(0, 10));

  worksheet.getCell(fields.workMonthCell).value = input.workMonth;
  worksheet.getCell(fields.printedDateCell).value = today;
  worksheet.getCell(fields.ownerDepartmentCell).value = "교대근무 운영";
  worksheet.getCell(fields.systemNameCell).value = `${APP_DISPLAY_NAME} 자동생성`;
  worksheet.getCell(fields.documentTitleCell).value =
    `제  목  :  ${formatMonthLabel(input.workMonth)} 교대근무 시간외근로 수당 지급 품의`;
  worksheet.getCell(fields.summaryIntroCell).value =
    `${formatMonthLabel(input.workMonth)} 승인 완료 수당 ${input.rows.length}건의 지급 승인을 요청드립니다.`;
  worksheet.getCell(fields.scopeCell).value =
    `① 지급 범위 : ${formatMonthLabel(input.workMonth)} 승인 완료 교대근무 수당`;
  worksheet.getCell(fields.targetHeadcountCell).value =
    `② 대  상  자 : 승인 건수 ${input.rows.length}건 / 대상 인원 ${employeeCount}명`;
  worksheet.getCell(fields.sectionTitleCell).value =
    `2. ${input.workMonth.slice(5)}월 교대근무 사이트별 지급 요청 내역`;
  clearCellRange(worksheet, {
    startRow: fields.dataStartRow,
    endRow: Math.max(worksheet.rowCount, fields.dataStartRow + 23),
    startColumn: 2,
    endColumn: 8
  });

  siteSummaries.forEach((summary, index) => {
    const rowNumber = fields.dataStartRow + index;
    worksheet.getCell(`B${rowNumber}`).value = "교대근무";
    worksheet.getCell(`C${rowNumber}`).value = "운영";
    worksheet.getCell(`D${rowNumber}`).value = summary.department;
    worksheet.getCell(`E${rowNumber}`).value = toNullableCellValue(summary.substituteAmount);
    worksheet.getCell(`F${rowNumber}`).value = toNullableCellValue(summary.overtimeAmount);
    worksheet.getCell(`G${rowNumber}`).value = toNullableCellValue(summary.holidayAmount);
    worksheet.getCell(`H${rowNumber}`).value = summary.totalAmount;
  });

  const totalRowNumber = fields.dataStartRow + siteSummaries.length;
  worksheet.getCell(`B${totalRowNumber}`).value = "합계";
  worksheet.getCell(`C${totalRowNumber}`).value = "합계";
  worksheet.getCell(`D${totalRowNumber}`).value = "합계";
  worksheet.getCell(`E${totalRowNumber}`).value = toNullableCellValue(
    siteSummaries.reduce((sum, item) => sum + item.substituteAmount, 0)
  );
  worksheet.getCell(`F${totalRowNumber}`).value = toNullableCellValue(
    siteSummaries.reduce((sum, item) => sum + item.overtimeAmount, 0)
  );
  worksheet.getCell(`G${totalRowNumber}`).value = toNullableCellValue(
    siteSummaries.reduce((sum, item) => sum + item.holidayAmount, 0)
  );
  worksheet.getCell(`H${totalRowNumber}`).value = input.regularTotalAllowanceAmount;
  if (sections.earlyPayoutRows.length > 0) {
    worksheet.getCell(`B${totalRowNumber + 2}`).value =
      `퇴사자 선지급 별도 합계 : ${formatCurrencyLabel(input.earlyPayoutTotalAllowanceAmount)}`;
  }

  await workbook.xlsx.writeFile(input.outputPath);
};

const writeUpdatedProposalWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
}) => {
  const workbook = await readWorkbook(input.template.sourcePath);
  const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0];
  const sections = splitProposalExportSections(input.rows);
  const siteSummaries = compactProposalSiteSummaries(buildSiteSummaries(sections.regularRows));
  const earlyPayoutSiteSummaries = buildSiteSummaries(sections.earlyPayoutRows);
  const employeeCount = new Set(input.rows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size;
  const [yearText, monthText] = input.workMonth.split("-");
  const monthLabel = `${yearText}년 ${Number(monthText)}월`;
  const printedDate = formatDate(new Date().toISOString().slice(0, 10));
  const nextPayrollMonthLabel = formatNextPayrollMonthLabel(input.workMonth);

  worksheet.getCell("C5").value = input.workMonth;
  worksheet.getCell("E5").value = printedDate;
  worksheet.getCell("A11").value = "제  목  :  DT사업1팀 스케쥴근무 시간외 근로 수당 지급 품의";
  worksheet.getCell("C12").value =
    `${monthLabel}에 발생한 스케쥴근무자의 시간외 근로 수당 지급 승인을 요청드립니다.`;
  worksheet.getCell("B14").value = "1. 대상 기준 및 대상자";
  worksheet.getCell("B15").value =
    " ① 대상 기준 : 월근무계획외 연장, 대체 근무을 수행한 자 또는 휴일근무를 수행한 자";
  worksheet.getCell("B16").value = ` ② 당월 지급 대상자 :  ${employeeCount}명`;
  worksheet.getCell("B18").value = `2. ${Number(monthText)}월 지급 요청 내역`;
  worksheet.getCell("B34").value = `3. ${nextPayrollMonthLabel} 퇴사자 지급 내역`;
  syncUpdatedProposalTitleFonts(worksheet, ["B14", "B18", "B34"]);

  clearCellRange(worksheet, {
    startRow: 21,
    endRow: 32,
    startColumn: 2,
    endColumn: 8
  });
  clearCellRange(worksheet, {
    startRow: 37,
    endRow: 39,
    startColumn: 2,
    endColumn: 8
  });

  siteSummaries.forEach((summary, index) => {
    const rowNumber = 21 + index;
    worksheet.getCell(`B${rowNumber}`).value = "교대근무";
    worksheet.getCell(`C${rowNumber}`).value = "운영";
    worksheet.getCell(`D${rowNumber}`).value = summary.department;
    worksheet.getCell(`E${rowNumber}`).value = toNullableCellValue(summary.substituteAmount);
    worksheet.getCell(`F${rowNumber}`).value = toNullableCellValue(summary.overtimeAmount);
    worksheet.getCell(`G${rowNumber}`).value = toNullableCellValue(summary.holidayAmount);
    worksheet.getCell(`H${rowNumber}`).value = summary.totalAmount;
  });

  worksheet.getCell("B32").value = "합 계";
  worksheet.getCell("E32").value = toNullableCellValue(
    siteSummaries.reduce((sum, row) => sum + row.substituteAmount, 0)
  );
  worksheet.getCell("F32").value = toNullableCellValue(
    siteSummaries.reduce((sum, row) => sum + row.overtimeAmount, 0)
  );
  worksheet.getCell("G32").value = toNullableCellValue(
    siteSummaries.reduce((sum, row) => sum + row.holidayAmount, 0)
  );
  worksheet.getCell("H32").value = input.regularTotalAllowanceAmount;
  const earlyPayoutTotalRowNumber = syncUpdatedProposalEarlyPayoutRows(
    worksheet,
    earlyPayoutSiteSummaries,
    input.earlyPayoutTotalAllowanceAmount
  );
  syncUpdatedProposalFooterRows(worksheet, earlyPayoutTotalRowNumber, nextPayrollMonthLabel);

  await workbook.xlsx.writeFile(input.outputPath);
};

const writeProposalWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
}) => {
  if (isUpdatedProposalTemplate(input.template)) {
    await writeUpdatedProposalWorkbook(input);
    return;
  }

  await writeLegacyProposalWorkbook(input);
};

const writeAttachmentOneWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rateGuideEntries: AllowanceRateGuideEntry[];
  rows: ResolvedAllowanceExportRow[];
}) => {
  const workbook = await readWorkbook(input.template.sourcePath);
  const fields = resolveAttachmentOneTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];
  const sections = buildAttachmentOneSections(input.rows);
  const rateGuideRowCount = input.rateGuideEntries.reduce(
    (sum, entry) => sum + 1 + entry.lines.length + 3,
    0
  );

  worksheet.getCell(fields.titleCell).value =
    `별첨1. ${formatMonthLabel(input.workMonth)} 교대근무자 시간외근로수당 내역`;
  clearCellRange(worksheet, {
    startRow: fields.dataStartRow,
    endRow: Math.max(
      worksheet.rowCount,
      fields.dataStartRow + input.rows.length + sections.length + Math.max(24, rateGuideRowCount + 8)
    ),
    startColumn: 1,
    endColumn: 19
  });

  let currentRow = fields.dataStartRow;
  let runningIndex = 1;

  sections.forEach((section) => {
    section.rows.forEach((row) => {
      worksheet.getCell(`A${currentRow}`).value = runningIndex;
      worksheet.getCell(`B${currentRow}`).value = row.employeeCode;
      worksheet.getCell(`C${currentRow}`).value = row.employeeName;
      worksheet.getCell(`D${currentRow}`).value = "-";
      worksheet.getCell(`E${currentRow}`).value = row.department;
      worksheet.getCell(`F${currentRow}`).value = row.businessCategoryLabel;
      worksheet.getCell(`G${currentRow}`).value = formatDate(row.workDate);
      worksheet.getCell(`H${currentRow}`).value = Number(
        formatDecimalHours(row.calculation.snapshot.breakdown.totalWorkMinutes)
      );
      worksheet.getCell(`I${currentRow}`).value = toNullableCellValue(
        row.primaryMinutes > 0 ? Number(formatDecimalHours(row.primaryMinutes)) : 0
      );
      worksheet.getCell(`J${currentRow}`).value = toNullableCellValue(row.primaryMultiplier);
      worksheet.getCell(`K${currentRow}`).value = toNullableCellValue(row.primaryAmount);
      worksheet.getCell(`L${currentRow}`).value = toNullableCellValue(
        row.overtimeMinutes > 0 ? Number(formatDecimalHours(row.overtimeMinutes)) : 0
      );
      worksheet.getCell(`M${currentRow}`).value = toNullableCellValue(row.overtimeMultiplier);
      worksheet.getCell(`N${currentRow}`).value = toNullableCellValue(row.overtimeAmount);
      worksheet.getCell(`O${currentRow}`).value = toNullableCellValue(
        row.nightMinutes > 0 ? Number(formatDecimalHours(row.nightMinutes)) : 0
      );
      worksheet.getCell(`P${currentRow}`).value = toNullableCellValue(row.nightMultiplier);
      worksheet.getCell(`Q${currentRow}`).value = toNullableCellValue(row.nightAmount);
      worksheet.getCell(`R${currentRow}`).value = toNullableCellValue(row.hourlyRate);
      worksheet.getCell(`S${currentRow}`).value = row.calculation.snapshot.totalAllowanceAmount;
      currentRow += 1;
      runningIndex += 1;
    });

    worksheet.getCell(`A${currentRow}`).value = "-";
    worksheet.getCell(`B${currentRow}`).value = "-";
    worksheet.getCell(`C${currentRow}`).value = `${section.label} 소계`;
    worksheet.getCell(`D${currentRow}`).value = "-";
    worksheet.getCell(`E${currentRow}`).value = "-";
    worksheet.getCell(`F${currentRow}`).value = section.label;
    worksheet.getCell(`G${currentRow}`).value = "-";
    worksheet.getCell(`H${currentRow}`).value = toNullableCellValue(
      section.totalWorkMinutes > 0 ? Number(formatDecimalHours(section.totalWorkMinutes)) : 0
    );
    worksheet.getCell(`I${currentRow}`).value = toNullableCellValue(
      section.primaryMinutes > 0 ? Number(formatDecimalHours(section.primaryMinutes)) : 0
    );
    worksheet.getCell(`J${currentRow}`).value = "-";
    worksheet.getCell(`K${currentRow}`).value = toNullableCellValue(section.primaryAmount);
    worksheet.getCell(`L${currentRow}`).value = toNullableCellValue(
      section.overtimeMinutes > 0 ? Number(formatDecimalHours(section.overtimeMinutes)) : 0
    );
    worksheet.getCell(`M${currentRow}`).value = "-";
    worksheet.getCell(`N${currentRow}`).value = toNullableCellValue(section.overtimeAmount);
    worksheet.getCell(`O${currentRow}`).value = toNullableCellValue(
      section.nightMinutes > 0 ? Number(formatDecimalHours(section.nightMinutes)) : 0
    );
    worksheet.getCell(`P${currentRow}`).value = "-";
    worksheet.getCell(`Q${currentRow}`).value = toNullableCellValue(section.nightAmount);
    worksheet.getCell(`R${currentRow}`).value = "-";
    worksheet.getCell(`S${currentRow}`).value = section.totalAllowanceAmount;
    worksheet.getRow(currentRow).font = {
      ...worksheet.getRow(currentRow).font,
      bold: true
    };
    currentRow += 1;
  });

  for (let spacerRowNumber = currentRow + 1; spacerRowNumber <= currentRow + 5; spacerRowNumber += 1) {
    worksheet.getRow(spacerRowNumber).height = 18;
  }

  writeAttachmentOneRateGuide(worksheet, currentRow + 6, input.rateGuideEntries);

  await workbook.xlsx.writeFile(input.outputPath);
};

const writeAttachmentTwoWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
  totalAllowanceAmount: number;
}) => {
  const workbook = await readWorkbook(input.template.sourcePath);
  const fields = resolveAttachmentTwoTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];
  const groupedByDepartment = [...input.rows.reduce((accumulator, row) => {
    const departmentRows = accumulator.get(row.department) ?? [];
    departmentRows.push(row);
    accumulator.set(row.department, departmentRows);
    return accumulator;
  }, new Map<string, ResolvedAllowanceExportRow[]>()).entries()];

  worksheet.getCell(fields.titleCell).value =
    `월간 교대근무 직원의 연장근로 수당 지급 현황 ${input.workMonth.replace("-", "")}`;
  worksheet.getCell(fields.dateRangeCell).value = formatProposalDateRange(input.workMonth);
  clearCellRange(worksheet, {
    startRow: fields.dataStartRow,
    endRow: Math.max(worksheet.rowCount, 86),
    startColumn: 1,
    endColumn: 7
  });

  let currentRow = fields.dataStartRow;
  let runningIndex = 1;

  groupedByDepartment.forEach(([department, rows]) => {
    let departmentSubstitute = 0;
    let departmentOvertime = 0;
    let departmentHoliday = 0;
    let departmentTotal = 0;

    rows.forEach((row) => {
      worksheet.getCell(`A${currentRow}`).value = runningIndex;
      worksheet.getCell(`B${currentRow}`).value = department;
      worksheet.getCell(`C${currentRow}`).value = row.employeeName;
      worksheet.getCell(`D${currentRow}`).value = toNullableCellValue(row.substituteAmount);
      worksheet.getCell(`E${currentRow}`).value = toNullableCellValue(row.summaryOvertimeAmount);
      worksheet.getCell(`F${currentRow}`).value = toNullableCellValue(row.holidayAmount);
      worksheet.getCell(`G${currentRow}`).value = row.calculation.snapshot.totalAllowanceAmount;

      departmentSubstitute += row.substituteAmount;
      departmentOvertime += row.summaryOvertimeAmount;
      departmentHoliday += row.holidayAmount;
      departmentTotal += row.calculation.snapshot.totalAllowanceAmount;
      currentRow += 1;
      runningIndex += 1;
    });

    worksheet.getCell(`A${currentRow}`).value = "소   계";
    worksheet.getCell(`B${currentRow}`).value = "소   계";
    worksheet.getCell(`C${currentRow}`).value = "소   계";
    worksheet.getCell(`D${currentRow}`).value = toNullableCellValue(departmentSubstitute);
    worksheet.getCell(`E${currentRow}`).value = toNullableCellValue(departmentOvertime);
    worksheet.getCell(`F${currentRow}`).value = toNullableCellValue(departmentHoliday);
    worksheet.getCell(`G${currentRow}`).value = departmentTotal;
    currentRow += 1;
  });

  worksheet.getCell(`A${currentRow}`).value = "합   계";
  worksheet.getCell(`B${currentRow}`).value = "합   계";
  worksheet.getCell(`C${currentRow}`).value = "합   계";
  worksheet.getCell(`D${currentRow}`).value = toNullableCellValue(
    input.rows.reduce((sum, row) => sum + row.substituteAmount, 0)
  );
  worksheet.getCell(`E${currentRow}`).value = toNullableCellValue(
    input.rows.reduce((sum, row) => sum + row.summaryOvertimeAmount, 0)
  );
  worksheet.getCell(`F${currentRow}`).value = toNullableCellValue(
    input.rows.reduce((sum, row) => sum + row.holidayAmount, 0)
  );
  worksheet.getCell(`G${currentRow}`).value = input.totalAllowanceAmount;

  await workbook.xlsx.writeFile(input.outputPath);
};

const resolveExportResults = (
  input: Pick<AllowanceDocumentExportInput, "calculationIds">,
  options?: ResolveAllowanceDocumentOptions
) => {
  if (input.calculationIds.length === 0) {
    throw new Error("문서로 출력할 수당 계산 결과가 없습니다.");
  }

  const calculationIdSet = new Set(input.calculationIds);
  const historyById = new Map(
    listAllowanceCalculationHistory().map((item) => [item.id, item] as const)
  );
  const latestResults = listApprovedAllowanceCalculationResults();
  const results = latestResults.filter((item) => calculationIdSet.has(item.id));

  if (results.length !== calculationIdSet.size) {
    const historyResults = [...calculationIdSet]
      .map((id) => historyById.get(id))
      .filter((item): item is AllowanceCalculationResultRecord => Boolean(item));

    if (historyResults.length !== calculationIdSet.size) {
      throw new Error(
        "일부 수당 계산 결과를 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
      );
    }

    const workMonths = [...new Set(historyResults.map((item) => item.workDate.slice(0, 7)))];

    if (workMonths.length !== 1) {
      throw new Error(
        "품의 신청은 동일한 계산월 결과만 함께 출력할 수 있습니다. 계산월 필터를 먼저 맞춰 주세요."
      );
    }

    return {
      workMonth: workMonths[0] as string,
      results: historyResults
    };
  }

  const workMonths = [...new Set(results.map((item) => item.workDate.slice(0, 7)))];

  if (workMonths.length !== 1) {
    throw new Error("품의 신청은 동일한 계산월 결과만 함께 출력할 수 있습니다. 계산월 필터를 먼저 맞춰 주세요.");
  }

  const allowedStatuses = options?.allowedStatuses ?? ["approved", "proposal-approved"];
  const allowedStatusSet = new Set<AllowanceCalculationStatus>(allowedStatuses);
  const invalidStatusRows = results.filter((item) => !allowedStatusSet.has(item.status));

  if (invalidStatusRows.length > 0) {
    throw new Error(
      options?.statusErrorMessage ?? "승인된 수당만 문서로 출력할 수 있습니다. 먼저 수당 승인을 진행해 주세요."
    );
  }

  return {
    workMonth: workMonths[0] as string,
    results
  };
};

const buildResolvedAllowanceDocumentContext = (
  input: Pick<AllowanceDocumentExportInput, "calculationIds">,
  options?: ResolveAllowanceDocumentOptions
): ResolvedAllowanceDocumentContext => {
  const { workMonth, results } = resolveExportResults(input, options);
  const exportRows = resolveExportRows(results);
  const proposalSections = splitProposalExportSections(exportRows);

  return {
    workMonth,
    results,
    exportRows,
    proposalSections,
    totalAllowanceAmount: results.reduce((sum, item) => sum + item.snapshot.totalAllowanceAmount, 0),
    employeeCount: new Set(exportRows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size,
    rateGuideEntries: buildAllowanceRateGuideEntries(results),
    holidayNamesByDate: resolveHolidayNamesByWorkMonth(workMonth)
  };
};

export const buildAllowanceProposalPreview = (input: {
  calculationIds: string[];
}): AllowanceProposalPreview => {
  const context = buildResolvedAllowanceDocumentContext(input, {
    allowedStatuses: ["approved"],
    statusErrorMessage: "품의 승인 대상에는 승인된 수당만 포함할 수 있습니다."
  });

  return {
    workMonth: context.workMonth,
    generatedAt: new Date().toISOString(),
    calculationCount: context.results.length,
    employeeCount: context.employeeCount,
    totalAllowanceAmount: context.totalAllowanceAmount,
    regularTotalAllowanceAmount: context.proposalSections.regularTotalAllowanceAmount,
    earlyPayoutTotalAllowanceAmount: context.proposalSections.earlyPayoutTotalAllowanceAmount,
    rows: context.exportRows.map((row) => ({
      calculationId: row.calculation.id,
      siteName: row.department,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      workDate: row.workDate,
      workType: row.calculation.workType,
      businessCategoryLabel: row.businessCategoryLabel,
      totalWorkMinutes: row.calculation.snapshot.breakdown.totalWorkMinutes,
      totalAllowanceAmount: row.calculation.snapshot.totalAllowanceAmount,
      earlyPayoutDate: row.earlyPayoutDate
    })),
    regularSiteSummaries: mapPreviewSiteSummaries(
      compactProposalSiteSummaries(buildSiteSummaries(context.proposalSections.regularRows))
    ),
    earlyPayoutSiteSummaries: mapPreviewSiteSummaries(
      buildSiteSummaries(context.proposalSections.earlyPayoutRows)
    )
  };
};

export const exportAllowanceDocuments = async (
  input: AllowanceDocumentExportInput,
  context: {
    userDataPath: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<AllowanceDocumentExportRecord>> => {
  try {
    const resolvedContext = buildResolvedAllowanceDocumentContext(input, {
      allowedStatuses: ["approved", "proposal-approved"],
      statusErrorMessage: "승인된 수당만 문서로 출력할 수 있습니다. 먼저 수당 승인을 진행해 주세요."
    });
    const settings = getStoredAppSettingsSnapshot(context);
    const proposalOutputDir = path.resolve(settings.allowanceProposalExportDir);
    const attachment1OutputDir = path.resolve(settings.allowanceAttachment1ExportDir);
    const attachment2OutputDir = path.resolve(settings.allowanceAttachment2ExportDir);
    const proposalTemplate = resolveTemplate("proposal");
    const attachment1Template = resolveTemplate("attachment1");
    const attachment2Template = resolveTemplate("attachment2");
    const outputFormat = input.outputFormat ?? "xlsx";

    mkdirSync(proposalOutputDir, { recursive: true });
    mkdirSync(attachment1OutputDir, { recursive: true });
    mkdirSync(attachment2OutputDir, { recursive: true });

    const proposalFileName = resolveOutputFileNameByFormat(
      resolveDocumentTemplateOutputFileName({
        templateType: "proposal",
        pattern: proposalTemplate.outputFileNamePattern,
        tokens: {
          workMonth: resolvedContext.workMonth,
          templateVersion: proposalTemplate.versionLabel
        }
      }),
      outputFormat
    );
    const attachment1FileName = resolveOutputFileNameByFormat(
      resolveDocumentTemplateOutputFileName({
        templateType: "attachment1",
        pattern: attachment1Template.outputFileNamePattern,
        tokens: {
          workMonth: resolvedContext.workMonth,
          templateVersion: attachment1Template.versionLabel
        }
      }),
      outputFormat
    );
    const attachment2FileName = resolveOutputFileNameByFormat(
      resolveDocumentTemplateOutputFileName({
        templateType: "attachment2",
        pattern: attachment2Template.outputFileNamePattern,
        tokens: {
          workMonth: resolvedContext.workMonth,
          templateVersion: attachment2Template.versionLabel
        }
      }),
      outputFormat
    );
    const proposalPath = resolveUniqueOutputPath(proposalOutputDir, proposalFileName);
    const attachment1Path = resolveUniqueOutputPath(attachment1OutputDir, attachment1FileName);
    const attachment2Path = resolveUniqueOutputPath(attachment2OutputDir, attachment2FileName);

    if (outputFormat === "pdf") {
      await writeAllowancePdfDocuments({
        proposalPath,
        attachment1Path,
        attachment2Path,
        workMonth: resolvedContext.workMonth,
        rows: resolvedContext.exportRows,
        totalAllowanceAmount: resolvedContext.totalAllowanceAmount,
        regularTotalAllowanceAmount: resolvedContext.proposalSections.regularTotalAllowanceAmount,
        earlyPayoutTotalAllowanceAmount:
          resolvedContext.proposalSections.earlyPayoutTotalAllowanceAmount,
        formatDate,
        formatMonthLabel,
        formatProposalDateRange,
        formatCurrencyLabel: formatPdfCurrencyLabel,
        formatHoursLabel,
        formatNextPayrollMonthLabel,
        summaryCategoryOrder,
        rateGuideEntries: resolvedContext.rateGuideEntries,
        holidayNamesByDate: resolvedContext.holidayNamesByDate,
        allowanceAxisLabels: {
          base: "기본",
          overtime: "연장",
          night: "야간"
        } satisfies Record<AllowanceRateAxis, string>
      });
    } else {
      await writeProposalWorkbook({
        template: proposalTemplate,
        outputPath: proposalPath,
        workMonth: resolvedContext.workMonth,
        rows: resolvedContext.exportRows,
        regularTotalAllowanceAmount: resolvedContext.proposalSections.regularTotalAllowanceAmount,
        earlyPayoutTotalAllowanceAmount:
          resolvedContext.proposalSections.earlyPayoutTotalAllowanceAmount
      });
      await writeAttachmentOneWorkbook({
        template: attachment1Template,
        outputPath: attachment1Path,
        workMonth: resolvedContext.workMonth,
        rateGuideEntries: resolvedContext.rateGuideEntries,
        rows: resolvedContext.exportRows
      });
      await writeAttachmentTwoWorkbook({
        template: attachment2Template,
        outputPath: attachment2Path,
        workMonth: resolvedContext.workMonth,
        rows: resolvedContext.exportRows,
        totalAllowanceAmount: resolvedContext.totalAllowanceAmount
      });
    }

    return {
      ok: true,
      data: saveStoredAllowanceDocumentExport({
        workMonth: resolvedContext.workMonth,
        outputFormat,
        calculationIds: resolvedContext.results.map((item) => item.id),
        calculationCount: resolvedContext.results.length,
        employeeCount: resolvedContext.employeeCount,
        totalAllowanceAmount: resolvedContext.totalAllowanceAmount,
        proposalTemplateVersionId: proposalTemplate.id,
        attachment1TemplateVersionId: attachment1Template.id,
        attachment2TemplateVersionId: attachment2Template.id,
        proposalFileName: path.basename(proposalPath),
        proposalPath,
        attachment1FileName: path.basename(attachment1Path),
        attachment1Path,
        attachment2FileName: path.basename(attachment2Path),
        attachment2Path,
        exportedAt: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_DOCUMENT_EXPORT_FAILED",
      message: error instanceof Error ? error.message : "수당 문서 출력 중 오류가 발생했습니다."
    };
  }
};
