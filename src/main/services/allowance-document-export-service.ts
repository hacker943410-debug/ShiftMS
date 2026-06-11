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
import {
  ALLOWANCE_DOCUMENT_OWNER_DEPARTMENT,
  buildAllowanceAttachmentOneTitle,
  buildAllowanceAttachmentTwoTitle,
  buildAllowanceProposalDocumentNumber
} from "../../shared/domain/allowance-document";
import { normalizeEmployeeRank } from "../../shared/domain/employee-rank";
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
import { applyWorkbookBrandLogo, fitWorksheetBrandLogoToRange } from "./document-brand-logo-service";
import { resolveDocumentTemplateSourcePathOrThrow } from "./document-template-source-path-service";
import { applyDocumentTemplateStyleSpec } from "./document-template-style-apply-service";
import {
  listStoredHolidayCalendars,
  listStoredAllowanceRateVersions,
  resolveStoredDefaultDocumentTemplateVersion
} from "./operations-storage-service";
import { listStoredEmployees } from "./employee-storage-service";
import { listStoredSites } from "./site-storage-service";
import { roundUpWon } from "../../shared/domain/rounding";

interface ResolvedAllowanceExportRow {
  calculation: AllowanceCalculationResultRecord;
  businessCategoryCode: AllowanceRateCategoryCode;
  businessCategoryLabel: string;
  summaryCategory: AllowanceSummaryCategory;
  earlyPayoutDate?: string;
  customerName?: string;
  employeeCode: string;
  employeeName: string;
  employeeRank?: string;
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
  totalAllowanceAmount: number;
}

interface AllowanceSiteSummary {
  customerName?: string;
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

interface SiteCustomerNameLookup {
  exact: Map<string, string | undefined>;
  loose: Map<string, string | undefined>;
}

const updatedProposalTemplateFileNames = new Set([
  "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx",
  "품의서_2026-04_수정본.xlsx"
]);

const compactAttachmentOneTemplateFileNames = new Set(["별첨1_2026-04_수정본.xlsx"]);

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
  applyWorkbookBrandLogo(workbook);

  return workbook;
};

const normalizeSiteCustomerLookupText = (value: unknown) => String(value ?? "").trim();

const normalizeSiteCustomerLookupKey = (value: unknown) =>
  normalizeSiteCustomerLookupText(value)
    .replace(/[\s_\-()/\\[\]{}.:]+/g, "")
    .toUpperCase();

const buildSiteCustomerNameLookup = (): SiteCustomerNameLookup => {
  const exact = new Map<string, string | undefined>();
  const looseCandidates = new Map<string, Set<string>>();

  listStoredSites({ includeDeleted: true }).forEach((site) => {
    const exactKey = normalizeSiteCustomerLookupText(site.name);

    if (!exactKey) {
      return;
    }

    const customerName = site.customerName?.trim() || undefined;
    exact.set(exactKey, customerName);

    const looseKey = normalizeSiteCustomerLookupKey(site.name);

    if (!looseKey) {
      return;
    }

    const bucket = looseCandidates.get(looseKey) ?? new Set<string>();
    bucket.add(customerName ?? "");
    looseCandidates.set(looseKey, bucket);
  });

  const loose = new Map<string, string | undefined>();

  looseCandidates.forEach((bucket, lookupKey) => {
    if (bucket.size !== 1) {
      return;
    }

    const [value] = Array.from(bucket);
    loose.set(lookupKey, value || undefined);
  });

  return {
    exact,
    loose
  };
};

const resolveSiteCustomerName = (lookup: SiteCustomerNameLookup, siteName: string) => {
  const exactKey = normalizeSiteCustomerLookupText(siteName);

  if (exactKey && lookup.exact.has(exactKey)) {
    return lookup.exact.get(exactKey);
  }

  const looseKey = normalizeSiteCustomerLookupKey(siteName);
  return looseKey ? lookup.loose.get(looseKey) : undefined;
};

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
const toBlankCellValue = (value: number) => (value > 0 ? value : null);
const attachmentOneHourlyRateNumFmt = "#,##0.00원";

const isBlankCellValue = (value: ExcelJS.CellValue) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim().length === 0);

const assertAttachmentOneRequiredCells = (worksheet: ExcelJS.Worksheet, rowNumber: number) => {
  const requiredCells = [
    ["A", "순번"],
    ["C", "직원명"],
    ["E", "근무지"],
    ["F", "근무구분"],
    ["G", "근무날짜"],
    ["H", "근무시간"],
    ["S", "수당금액"]
  ] as const;
  const missingLabel = requiredCells.find(([column]) =>
    isBlankCellValue(worksheet.getCell(`${column}${rowNumber}`).value)
  )?.[1];

  if (missingLabel) {
    throw new Error(`별첨1 ${rowNumber}행의 ${missingLabel} 값이 비어 있어 문서 출력을 중단했습니다.`);
  }
};

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

const clearCellRangeFormatting = (
  worksheet: ExcelJS.Worksheet,
  input: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  }
) => {
  if (input.startRow > input.endRow || input.startColumn > input.endColumn) {
    return;
  }

  unmergeCellsInRange(worksheet, input);

  for (let rowNumber = input.startRow; rowNumber <= input.endRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    for (let columnNumber = input.startColumn; columnNumber <= input.endColumn; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.value = null;
      cell.style = {};
    }
  }
};

const removeNonPrimaryWorksheets = (workbook: ExcelJS.Workbook, primaryWorksheet: ExcelJS.Worksheet) => {
  [...workbook.worksheets].forEach((worksheet) => {
    if (worksheet.id !== primaryWorksheet.id) {
      workbook.removeWorksheet(worksheet.id);
    }
  });
};

interface CapturedWorksheetRowStyle {
  cells: Partial<ExcelJS.Style>[];
  height?: number;
}

interface CapturedWorksheetBlock {
  columnCount: number;
  merges: Array<{
    endColumn: number;
    endRowOffset: number;
    startColumn: number;
    startRowOffset: number;
  }>;
  rows: Array<{
    cells: Array<{
      style: Partial<ExcelJS.Style>;
      value: ExcelJS.CellValue;
    }>;
    height?: number;
  }>;
}

const cloneWorksheetStyle = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const captureWorksheetRowStyle = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnCount: number
): CapturedWorksheetRowStyle => ({
  cells: Array.from({ length: columnCount }, (_, index) =>
    cloneWorksheetStyle(worksheet.getRow(rowNumber).getCell(index + 1).style ?? {})
  ),
  height: worksheet.getRow(rowNumber).height
});

const applyCapturedWorksheetRowStyle = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  rowStyle: CapturedWorksheetRowStyle
) => {
  const row = worksheet.getRow(rowNumber);

  if (typeof rowStyle.height === "number") {
    row.height = rowStyle.height;
  }
  rowStyle.cells.forEach((style, index) => {
    row.getCell(index + 1).style = cloneWorksheetStyle(style);
  });
};

const captureWorksheetRowStyleRange = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  columnCount: number
) =>
  new Map(
    Array.from({ length: endRow - startRow + 1 }, (_, index) => {
      const rowNumber = startRow + index;
      return [rowNumber, captureWorksheetRowStyle(worksheet, rowNumber, columnCount)] as const;
    })
  );

const captureWorksheetBlock = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  columnCount: number
): CapturedWorksheetBlock => {
  const merges: CapturedWorksheetBlock["merges"] = [];

  ((worksheet.model.merges ?? []) as string[]).forEach((rangeText) => {
    const range = parseCellRange(rangeText);

    if (
      !range ||
      range.startRow < startRow ||
      range.endRow > endRow ||
      range.startColumn < 1 ||
      range.endColumn > columnCount
    ) {
      return;
    }

    merges.push({
      startRowOffset: range.startRow - startRow,
      endRowOffset: range.endRow - startRow,
      startColumn: range.startColumn,
      endColumn: range.endColumn
    });
  });

  return {
    columnCount,
    merges,
    rows: Array.from({ length: endRow - startRow + 1 }, (_, rowIndex) => {
      const row = worksheet.getRow(startRow + rowIndex);

      return {
        height: row.height,
        cells: Array.from({ length: columnCount }, (_, columnIndex) => {
          const cell = row.getCell(columnIndex + 1);

          return {
            style: cloneWorksheetStyle(cell.style ?? {}),
            value: cloneWorksheetStyle(cell.value ?? null)
          };
        })
      };
    })
  };
};

const applyCapturedWorksheetBlock = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  block: CapturedWorksheetBlock
) => {
  block.rows.forEach((capturedRow, rowIndex) => {
    const row = worksheet.getRow(startRow + rowIndex);

    (row as unknown as { height?: number }).height = capturedRow.height;
    capturedRow.cells.forEach((capturedCell, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.style = cloneWorksheetStyle(capturedCell.style);
      cell.value = cloneWorksheetStyle(capturedCell.value);
    });
  });

  block.merges.forEach((merge) => {
    mergeCellsByCoordinateWithContext(
      worksheet,
      startRow + merge.startRowOffset,
      merge.startColumn,
      startRow + merge.endRowOffset,
      merge.endColumn,
      {
        documentKind: "Excel 양식",
        feature: "템플릿 블록 복원",
        section: "캡처한 원본 행 병합 복원"
      }
    );
  });
};

const columnLabelToNumber = (columnLabel: string) =>
  columnLabel
    .toUpperCase()
    .split("")
    .reduce((sum, character) => sum * 26 + character.charCodeAt(0) - 64, 0);

const columnNumberToLabel = (columnNumber: number) => {
  let current = columnNumber;
  let label = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label || "A";
};

const parseCellAddress = (address: string) => {
  const matched = address.match(/^([A-Z]+)(\d+)$/i);

  if (!matched) {
    return null;
  }

  return {
    column: columnLabelToNumber(matched[1]!),
    row: Number(matched[2]!)
  };
};

const parseCellRange = (range: string) => {
  const [startAddress, endAddress = startAddress] = range.split(":");
  const start = parseCellAddress(startAddress ?? "");
  const end = parseCellAddress(endAddress ?? "");

  if (!start || !end) {
    return null;
  }

  return {
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column),
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row)
  };
};

const toCellRangeText = (range: {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}) => {
  const startAddress = `${columnNumberToLabel(range.startColumn)}${range.startRow}`;
  const endAddress = `${columnNumberToLabel(range.endColumn)}${range.endRow}`;

  return startAddress === endAddress ? startAddress : `${startAddress}:${endAddress}`;
};

const doCellRangesIntersect = (
  left: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  },
  right: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  }
) =>
  left.startRow <= right.endRow &&
  left.endRow >= right.startRow &&
  left.startColumn <= right.endColumn &&
  left.endColumn >= right.startColumn;

interface MergeCellsDiagnosticContext {
  documentKind: string;
  feature: string;
  section: string;
}

const formatDiagnosticCellValue = (value: ExcelJS.CellValue) => {
  if (value === null || value === undefined) {
    return "빈 셀";
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }

    if ("result" in value) {
      return String(value.result ?? "수식 결과 없음");
    }

    return JSON.stringify(value);
  }

  return String(value);
};

const collectMergeConflicts = (worksheet: ExcelJS.Worksheet, targetRange: ReturnType<typeof parseCellRange>) => {
  if (!targetRange) {
    return {
      mergedMasters: [],
      mergedRanges: []
    };
  }

  const mergedRanges = new Set<string>();
  const mergedMasters = new Set<string>();

  ((worksheet.model.merges ?? []) as string[]).forEach((rangeText) => {
    const parsedRange = parseCellRange(rangeText);

    if (parsedRange && doCellRangesIntersect(parsedRange, targetRange)) {
      mergedRanges.add(rangeText);
    }
  });

  for (let rowNumber = targetRange.startRow; rowNumber <= targetRange.endRow; rowNumber += 1) {
    for (
      let columnNumber = targetRange.startColumn;
      columnNumber <= targetRange.endColumn;
      columnNumber += 1
    ) {
      const cell = worksheet.getCell(rowNumber, columnNumber);

      if (cell.isMerged) {
        mergedMasters.add(`${cell.address}->${cell.master?.address ?? cell.address}`);
      }
    }
  }

  return {
    mergedMasters: [...mergedMasters],
    mergedRanges: [...mergedRanges]
  };
};

const createMergeCellsDiagnosticError = (
  worksheet: ExcelJS.Worksheet,
  rangeText: string,
  context: MergeCellsDiagnosticContext,
  error: unknown
) => {
  const originalMessage = error instanceof Error ? error.message : String(error);
  const targetRange = parseCellRange(rangeText);
  const conflicts = collectMergeConflicts(worksheet, targetRange);
  const targetStartCell = targetRange
    ? worksheet.getCell(targetRange.startRow, targetRange.startColumn)
    : null;
  const targetCellValue = targetStartCell ? formatDiagnosticCellValue(targetStartCell.value) : "확인 불가";
  const existingMergeSummary =
    conflicts.mergedRanges.length > 0
      ? conflicts.mergedRanges.join(", ")
      : "model.merges에는 겹치는 병합 범위가 없음";
  const mergedMasterSummary =
    conflicts.mergedMasters.length > 0
      ? conflicts.mergedMasters.join(", ")
      : "대상 셀에서 병합 master를 찾지 못함";

  return new Error(
    [
      "Excel 문서 출력 실패: 셀 병합 범위가 겹칩니다.",
      `문서: ${context.documentKind} / 시트: ${worksheet.name}`,
      `기능: ${context.feature}`,
      `처리 구간: ${context.section}`,
      `병합하려던 범위: ${rangeText}`,
      `대상 시작 셀 값: ${targetCellValue}`,
      `이미 병합된 범위: ${existingMergeSummary}`,
      `병합된 대상 셀: ${mergedMasterSummary}`,
      "쉬운 예시: B12:C12가 이미 병합된 상태에서 B12:C14처럼 같은 셀을 포함하는 범위를 다시 병합하면 ExcelJS가 중단합니다.",
      "확인할 곳: 승인된 품의서/별첨 Excel 양식에서 위 범위 주변의 기존 병합을 해제하거나, 행 추가 후 병합 정리 범위가 누락됐는지 확인하세요.",
      `원본 오류: ${originalMessage}`
    ].join("\n")
  );
};

const mergeCellsWithContext = (
  worksheet: ExcelJS.Worksheet,
  rangeText: string,
  context: MergeCellsDiagnosticContext
) => {
  try {
    worksheet.mergeCells(rangeText);
  } catch (error) {
    throw createMergeCellsDiagnosticError(worksheet, rangeText, context, error);
  }
};

const mergeCellsByCoordinateWithContext = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  startColumn: number,
  endRow: number,
  endColumn: number,
  context: MergeCellsDiagnosticContext
) =>
  mergeCellsWithContext(
    worksheet,
    toCellRangeText({ startRow, startColumn, endRow, endColumn }),
    context
  );

export const mergeCellsWithContextForTest = mergeCellsWithContext;

const unmergeCellsInRange = (
  worksheet: ExcelJS.Worksheet,
  input: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  }
) => {
  const merges = [...((worksheet.model.merges ?? []) as string[])];

  merges.forEach((range) => {
    const parsed = parseCellRange(range);

    if (!parsed) {
      return;
    }

    if (!doCellRangesIntersect(parsed, input)) {
      return;
    }

    try {
      worksheet.unMergeCells(range);
    } catch {
      // ExcelJS can report an already-unmerged range after row splices.
    }
  });

  const mergedCellAddresses = new Set<string>();

  for (let rowNumber = input.startRow; rowNumber <= input.endRow; rowNumber += 1) {
    for (let columnNumber = input.startColumn; columnNumber <= input.endColumn; columnNumber += 1) {
      const cell = worksheet.getCell(rowNumber, columnNumber);

      if (cell.isMerged) {
        mergedCellAddresses.add(cell.master?.address ?? cell.address);
      }
    }
  }

  mergedCellAddresses.forEach((address) => {
    try {
      worksheet.unMergeCells(address);
    } catch {
      // The merge may already have been released by an overlapping range.
    }
  });
};

export const unmergeCellsInRangeForTest = unmergeCellsInRange;

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

const allowanceDocumentOutputLabels = {
  proposal: "품의서",
  attachment1: "별첨1",
  attachment2: "별첨2"
} as const;

const parseAllowanceDocumentWorkMonth = (workMonth: string) => {
  const matched = /^(\d{4})-(\d{2})$/.exec(workMonth);

  if (!matched) {
    throw new Error(`문서 출력 근무월 형식이 올바르지 않습니다: ${workMonth}`);
  }

  return {
    year: matched[1],
    month: matched[2]
  };
};

export const resolveAllowanceDocumentOutputTarget = (input: {
  baseDir: string;
  workMonth: string;
  documentKind: keyof typeof allowanceDocumentOutputLabels;
  outputFormat: AllowanceDocumentExportFormat;
}) => {
  const { year, month } = parseAllowanceDocumentWorkMonth(input.workMonth);
  const directoryPath = path.resolve(input.baseDir, `${year}년`, `${month}월`);
  const extension = input.outputFormat === "pdf" ? "pdf" : "xlsx";
  const fileName = `${year}_${month}_${allowanceDocumentOutputLabels[input.documentKind]}.${extension}`;

  return {
    directoryPath,
    fileName,
    outputPath: resolveUniqueOutputPath(directoryPath, fileName)
  };
};

const toDocumentMoneyAmount = (amount: number) => (amount > 0 ? roundUpWon(amount) : 0);

const buildAllowanceDocumentExportFailureMessage = (
  error: unknown,
  attemptedOutputPaths: string[]
) => {
  const reason = error instanceof Error ? error.message : "알 수 없는 오류";
  const outputPathHint =
    attemptedOutputPaths.length > 0
      ? `\n시도한 저장 경로:\n${attemptedOutputPaths.map((item) => `- ${item}`).join("\n")}`
      : "";
  const normalizedReason = reason.toLowerCase();

  if (
    normalizedReason.includes("enoent") ||
    normalizedReason.includes("no such file") ||
    normalizedReason.includes("찾을 수")
  ) {
    return `품의서/별첨 출력에 필요한 양식 파일 또는 저장 폴더를 찾지 못했습니다.${outputPathHint}\n원인: ${reason}`;
  }

  if (normalizedReason.includes("pdf")) {
    return `PDF 문서 생성 중 오류가 발생했습니다.${outputPathHint}\n원인: ${reason}`;
  }

  return `품의서/별첨 문서 출력 중 오류가 발생했습니다.${outputPathHint}\n원인: ${reason}`;
};

const buildSiteSummaries = (rows: ResolvedAllowanceExportRow[]): AllowanceSiteSummary[] =>
  [...rows.reduce((accumulator, row) => {
    const current = accumulator.get(row.department) ?? {
      customerName: row.customerName,
      department: row.department,
      substituteAmount: 0,
      overtimeAmount: 0,
      holidayAmount: 0,
      totalAmount: 0
    };

    current.customerName = current.customerName || row.customerName;
    current.substituteAmount += row.substituteAmount;
    current.overtimeAmount += row.summaryOvertimeAmount;
    current.holidayAmount += row.holidayAmount;
    current.totalAmount += row.totalAllowanceAmount;
    accumulator.set(row.department, current);

    return accumulator;
  }, new Map<string, AllowanceSiteSummary>()).values()].sort(
    (left, right) =>
      (left.customerName || "").localeCompare(right.customerName || "", "ko") ||
      left.department.localeCompare(right.department, "ko")
  );

const splitProposalExportSections = (
  rows: ResolvedAllowanceExportRow[]
): AllowanceProposalExportSections => {
  const regularRows = rows.filter((row) => !row.earlyPayoutDate);
  const earlyPayoutRows = rows.filter((row) => Boolean(row.earlyPayoutDate));

  return {
    regularRows,
    earlyPayoutRows,
    regularTotalAllowanceAmount: regularRows.reduce(
      (sum, row) => sum + row.totalAllowanceAmount,
      0
    ),
    earlyPayoutTotalAllowanceAmount: earlyPayoutRows.reduce(
      (sum, row) => sum + row.totalAllowanceAmount,
      0
    )
  };
};

const mapPreviewSiteSummaries = (rows: AllowanceSiteSummary[]) =>
  rows.map((row) => ({
    customerName: row.customerName,
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

type ExcelCellBorder = NonNullable<ExcelJS.Cell["border"]>;
type ExcelCellBorderSide = NonNullable<ExcelCellBorder["left"]>;
type ExcelCellAlignment = NonNullable<ExcelJS.Cell["alignment"]>;

const pickBorderSide = (...sides: Array<ExcelCellBorderSide | undefined>) => {
  const matched = sides.find((side) => Boolean(side?.style));

  return matched ? cloneWorksheetStyle(matched) : undefined;
};

const createCellBorder = (input: {
  bottom?: ExcelCellBorderSide;
  left?: ExcelCellBorderSide;
  right?: ExcelCellBorderSide;
  top?: ExcelCellBorderSide;
}): Partial<ExcelCellBorder> => {
  const border: Partial<ExcelCellBorder> = {};

  if (input.left) {
    border.left = cloneWorksheetStyle(input.left);
  }
  if (input.right) {
    border.right = cloneWorksheetStyle(input.right);
  }
  if (input.top) {
    border.top = cloneWorksheetStyle(input.top);
  }
  if (input.bottom) {
    border.bottom = cloneWorksheetStyle(input.bottom);
  }

  return border;
};

const createCenteredCellAlignment = (cell: ExcelJS.Cell): Partial<ExcelCellAlignment> => ({
  ...cloneWorksheetStyle(cell.alignment ?? {}),
  horizontal: "center",
  vertical: "middle"
});

const applyProposalSummaryLabelStyle = (
  cell: ExcelJS.Cell,
  border: Partial<ExcelCellBorder>,
  alignment: Partial<ExcelCellAlignment>
) => {
  cell.border = {
    ...cloneWorksheetStyle(cell.border ?? {}),
    ...border
  };
  cell.alignment = {
    ...cloneWorksheetStyle(cell.alignment ?? {}),
    ...alignment,
    horizontal: "center",
    vertical: "middle"
  };
};

const captureProposalSiteSummaryLabelStyle = (worksheet: ExcelJS.Worksheet, rowNumber: number) => {
  const row = worksheet.getRow(rowNumber);
  const customerStartCell = row.getCell(2);
  const customerEndCell = row.getCell(3);
  const siteCell = row.getCell(4);

  return {
    alignment: createCenteredCellAlignment(siteCell),
    customerBorder: createCellBorder({
      left: pickBorderSide(customerStartCell.border?.left, customerEndCell.border?.left),
      right: pickBorderSide(customerEndCell.border?.right, siteCell.border?.right),
      top: pickBorderSide(
        customerStartCell.border?.top,
        customerEndCell.border?.top,
        siteCell.border?.top
      ),
      bottom: pickBorderSide(
        siteCell.border?.bottom,
        customerEndCell.border?.bottom,
        customerStartCell.border?.bottom
      )
    }),
    mergedSiteBorder: createCellBorder({
      left: pickBorderSide(
        customerStartCell.border?.left,
        customerEndCell.border?.left,
        siteCell.border?.left
      ),
      right: pickBorderSide(
        siteCell.border?.right,
        customerEndCell.border?.right,
        customerStartCell.border?.right
      ),
      top: pickBorderSide(
        customerStartCell.border?.top,
        customerEndCell.border?.top,
        siteCell.border?.top
      ),
      bottom: pickBorderSide(
        siteCell.border?.bottom,
        customerEndCell.border?.bottom,
        customerStartCell.border?.bottom
      )
    }),
    siteCellBorder: createCellBorder({
      left: pickBorderSide(
        siteCell.border?.left,
        customerEndCell.border?.right,
        customerStartCell.border?.right
      ),
      right: pickBorderSide(
        siteCell.border?.right,
        customerEndCell.border?.right,
        customerStartCell.border?.right
      ),
      top: pickBorderSide(
        siteCell.border?.top,
        customerEndCell.border?.top,
        customerStartCell.border?.top
      ),
      bottom: pickBorderSide(
        siteCell.border?.bottom,
        customerEndCell.border?.bottom,
        customerStartCell.border?.bottom
      )
    })
  };
};

const captureProposalCustomerGroupLabelStyle = (
  worksheet: ExcelJS.Worksheet,
  startRowNumber: number,
  endRowNumber: number
) => {
  const startRow = worksheet.getRow(startRowNumber);
  const endRow = worksheet.getRow(endRowNumber);
  const startCell = startRow.getCell(2);
  const startEndCell = startRow.getCell(3);
  const endCell = endRow.getCell(2);
  const endEndCell = endRow.getCell(3);

  return {
    alignment: createCenteredCellAlignment(startCell),
    border: createCellBorder({
      left: pickBorderSide(startCell.border?.left, endCell.border?.left),
      right: pickBorderSide(startEndCell.border?.right, startCell.border?.right, endEndCell.border?.right),
      top: pickBorderSide(startCell.border?.top, startEndCell.border?.top),
      bottom: pickBorderSide(endCell.border?.bottom, endEndCell.border?.bottom, startCell.border?.bottom)
    })
  };
};

const setProposalSiteSummaryLabel = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  summary: Pick<AllowanceSiteSummary, "customerName" | "department">
) => {
  const customerName = summary.customerName?.trim();
  const labelStyle = captureProposalSiteSummaryLabelStyle(worksheet, rowNumber);

  if (customerName) {
    mergeCellsWithContext(worksheet, `B${rowNumber}:C${rowNumber}`, {
      documentKind: "품의서 Excel",
      feature: "고객사/단위 사업 조직 요약",
      section: "고객사명 행 단위 병합"
    });
    worksheet.getCell(`B${rowNumber}`).value = customerName;
    worksheet.getCell(`D${rowNumber}`).value = summary.department;
    applyProposalSummaryLabelStyle(
      worksheet.getCell(`B${rowNumber}`),
      labelStyle.customerBorder,
      labelStyle.alignment
    );
    applyProposalSummaryLabelStyle(
      worksheet.getCell(`D${rowNumber}`),
      labelStyle.siteCellBorder,
      labelStyle.alignment
    );
    return;
  }

  mergeCellsWithContext(worksheet, `B${rowNumber}:D${rowNumber}`, {
    documentKind: "품의서 Excel",
    feature: "고객사/단위 사업 조직 요약",
    section: "고객사명 없는 단위 조직 행 병합"
  });
  worksheet.getCell(`B${rowNumber}`).value = summary.department;
  applyProposalSummaryLabelStyle(
    worksheet.getCell(`B${rowNumber}`),
    labelStyle.mergedSiteBorder,
    labelStyle.alignment
  );
};

const mergeProposalCustomerSummaryCells = (
  worksheet: ExcelJS.Worksheet,
  summaries: AllowanceSiteSummary[],
  startRow: number
) => {
  let groupStartIndex = 0;

  while (groupStartIndex < summaries.length) {
    const customerName = summaries[groupStartIndex]?.customerName?.trim();

    if (!customerName) {
      groupStartIndex += 1;
      continue;
    }

    let groupEndIndex = groupStartIndex;

    while (
      groupEndIndex + 1 < summaries.length &&
      summaries[groupEndIndex + 1]?.customerName?.trim() === customerName
    ) {
      groupEndIndex += 1;
    }

    if (groupEndIndex > groupStartIndex) {
      const startRowNumber = startRow + groupStartIndex;
      const endRowNumber = startRow + groupEndIndex;
      const labelStyle = captureProposalCustomerGroupLabelStyle(
        worksheet,
        startRowNumber,
        endRowNumber
      );

      unmergeCellsInRange(worksheet, {
        startRow: startRowNumber,
        endRow: endRowNumber,
        startColumn: 2,
        endColumn: 3
      });

      mergeCellsWithContext(worksheet, `B${startRowNumber}:C${endRowNumber}`, {
        documentKind: "품의서 Excel",
        feature: "고객사/단위 사업 조직 요약",
        section: "동일 고객사 연속 행 세로 병합"
      });
      worksheet.getCell(`B${startRowNumber}`).value = customerName;
      applyProposalSummaryLabelStyle(
        worksheet.getCell(`B${startRowNumber}`),
        labelStyle.border,
        labelStyle.alignment
      );
    }

    groupStartIndex = groupEndIndex + 1;
  }
};

const syncUpdatedProposalSiteSummaryRows = (
  worksheet: ExcelJS.Worksheet,
  input: {
    detailStartRow: number;
    templateDetailCapacity: number;
    summaries: AllowanceSiteSummary[];
    totalAmount: number;
  }
) => {
  const renderedSummaries =
    input.summaries.length > 0
      ? input.summaries
      : [
          {
            customerName: "",
            department: "해당 없음",
            substituteAmount: 0,
            overtimeAmount: 0,
            holidayAmount: 0,
            totalAmount: 0
          }
        ];
  const detailRowCount = renderedSummaries.length;
  const rowCountDelta = detailRowCount - input.templateDetailCapacity;
  const originalTotalRowNumber = input.detailStartRow + input.templateDetailCapacity;

  unmergeCellsInRange(worksheet, {
    startRow: input.detailStartRow,
    endRow: originalTotalRowNumber,
    startColumn: 2,
    endColumn: 4
  });

  if (rowCountDelta > 0) {
    worksheet.spliceRows(
      originalTotalRowNumber,
      0,
      ...Array.from({ length: rowCountDelta }, () => [])
    );

    for (let index = 0; index < rowCountDelta; index += 1) {
      cloneRowStyle(
        worksheet,
        input.detailStartRow + input.templateDetailCapacity - 1,
        originalTotalRowNumber + index,
        8
      );
    }
  }

  if (rowCountDelta < 0) {
    worksheet.spliceRows(input.detailStartRow + detailRowCount, Math.abs(rowCountDelta));
  }

  const totalRowNumber = input.detailStartRow + detailRowCount;

  unmergeCellsInRange(worksheet, {
    startRow: input.detailStartRow,
    endRow: totalRowNumber,
    startColumn: 2,
    endColumn: 4
  });
  clearCellRange(worksheet, {
    startRow: input.detailStartRow,
    endRow: totalRowNumber,
    startColumn: 2,
    endColumn: 8
  });

  renderedSummaries.forEach((summary, index) => {
    const rowNumber = input.detailStartRow + index;
    const sourceRowNumber =
      input.detailStartRow + Math.min(index, Math.max(input.templateDetailCapacity - 1, 0));

    cloneRowStyle(worksheet, sourceRowNumber, rowNumber, 8);
    setProposalSiteSummaryLabel(worksheet, rowNumber, summary);
    worksheet.getCell(`E${rowNumber}`).value = toNullableCellValue(summary.substituteAmount);
    worksheet.getCell(`F${rowNumber}`).value = toNullableCellValue(summary.overtimeAmount);
    worksheet.getCell(`G${rowNumber}`).value = toNullableCellValue(summary.holidayAmount);
    worksheet.getCell(`H${rowNumber}`).value = toNullableCellValue(summary.totalAmount);
  });
  mergeProposalCustomerSummaryCells(worksheet, renderedSummaries, input.detailStartRow);

  mergeCellsWithContext(worksheet, `B${totalRowNumber}:D${totalRowNumber}`, {
    documentKind: "품의서 Excel",
    feature: "고객사/단위 사업 조직 요약",
    section: "요약 합계 행 병합"
  });
  worksheet.getCell(`B${totalRowNumber}`).value = "합 계";
  worksheet.getCell(`E${totalRowNumber}`).value = toNullableCellValue(
    renderedSummaries.reduce((sum, row) => sum + row.substituteAmount, 0)
  );
  worksheet.getCell(`F${totalRowNumber}`).value = toNullableCellValue(
    renderedSummaries.reduce((sum, row) => sum + row.overtimeAmount, 0)
  );
  worksheet.getCell(`G${totalRowNumber}`).value = toNullableCellValue(
    renderedSummaries.reduce((sum, row) => sum + row.holidayAmount, 0)
  );
  worksheet.getCell(`H${totalRowNumber}`).value = input.totalAmount;

  return {
    totalRowNumber,
    rowCountDelta,
    detailRowCount
  };
};

const syncUpdatedProposalEarlyPayoutRows = (
  worksheet: ExcelJS.Worksheet,
  detailStartRow: number,
  siteSummaries: AllowanceSiteSummary[],
  totalAmount: number,
  templateDetailCapacity = 2
) =>
  syncUpdatedProposalSiteSummaryRows(worksheet, {
    detailStartRow,
    templateDetailCapacity,
    summaries: siteSummaries,
    totalAmount
  });

const syncUpdatedProposalEarlyPayoutHeaderRows = (
  worksheet: ExcelJS.Worksheet,
  detailStartRow: number
) => {
  const headerTopRowNumber = detailStartRow - 2;
  const headerBottomRowNumber = detailStartRow - 1;

  unmergeCellsInRange(worksheet, {
    startRow: Math.max(1, headerTopRowNumber - 1),
    endRow: headerBottomRowNumber,
    startColumn: 2,
    endColumn: 8
  });

  mergeCellsWithContext(worksheet, `B${headerTopRowNumber}:D${headerBottomRowNumber}`, {
    documentKind: "품의서 Excel",
    feature: "선지급 요약 헤더",
    section: "단위 사업 조직 헤더 병합"
  });
  mergeCellsWithContext(worksheet, `E${headerTopRowNumber}:G${headerTopRowNumber}`, {
    documentKind: "품의서 Excel",
    feature: "선지급 요약 헤더",
    section: "시간외근로수당 상단 헤더 병합"
  });
  mergeCellsWithContext(worksheet, `H${headerTopRowNumber}:H${headerBottomRowNumber}`, {
    documentKind: "품의서 Excel",
    feature: "선지급 요약 헤더",
    section: "계 헤더 병합"
  });

  worksheet.getCell(`B${headerTopRowNumber}`).value = "단위 사업 조직";
  worksheet.getCell(`E${headerTopRowNumber}`).value = "시간외근로수당";
  worksheet.getCell(`E${headerBottomRowNumber}`).value = "대체근로수당";
  worksheet.getCell(`F${headerBottomRowNumber}`).value = "연장근로수당";
  worksheet.getCell(`G${headerBottomRowNumber}`).value = "(공)휴일근로수당";
  worksheet.getCell(`H${headerTopRowNumber}`).value = "계";
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

const syncCompactProposalGrandTotalRow = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  totalAmount: number
) => {
  const rowStyle = captureWorksheetRowStyle(worksheet, rowNumber, 8);

  clearCellRangeFormatting(worksheet, {
    startRow: rowNumber,
    endRow: rowNumber,
    startColumn: 2,
    endColumn: 8
  });
  applyCapturedWorksheetRowStyle(worksheet, rowNumber, rowStyle);
  mergeCellsWithContext(worksheet, `B${rowNumber}:G${rowNumber}`, {
    documentKind: "품의서 Excel",
    feature: "품의서 총 합계",
    section: "총 합계 라벨 행 병합"
  });
  worksheet.getCell(`B${rowNumber}`).value = "총 합계";
  worksheet.getCell(`H${rowNumber}`).value = totalAmount;
};

const blackProposalFontColor = { argb: "FF000000" } as ExcelJS.Color;
const mediumProposalBorderSide = { style: "medium", color: { indexed: 64 } } as ExcelCellBorderSide;
const mediumProposalCellBorder = {
  bottom: mediumProposalBorderSide,
  left: mediumProposalBorderSide,
  right: mediumProposalBorderSide,
  top: mediumProposalBorderSide
} satisfies Partial<ExcelCellBorder>;

const withBlackProposalFont = (font: Partial<ExcelJS.Font> | undefined) => ({
  ...cloneWorksheetStyle(font ?? {}),
  color: blackProposalFontColor
});

const setCellFontColorBlack = (cell: ExcelJS.Cell) => {
  const value = cell.value;

  if (value && typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    cell.value = {
      richText: value.richText.map((item) => ({
        ...item,
        font: withBlackProposalFont(item.font)
      }))
    };
  }

  cell.font = withBlackProposalFont(cell.font);
};

const applyMediumProposalBorder = (cell: ExcelJS.Cell) => {
  cell.border = cloneWorksheetStyle(mediumProposalCellBorder);
};

const syncUpdatedProposalFixedVisuals = (
  worksheet: ExcelJS.Worksheet,
  input: {
    grandTotalRowNumber: number | null;
  }
) => {
  fitWorksheetBrandLogoToRange(worksheet, {
    startColumn: 1,
    startRow: 1,
    endColumn: 3,
    endRow: 1
  });
  ["A7", "C7"].forEach((cellAddress) => {
    setCellFontColorBlack(worksheet.getCell(cellAddress));
  });

  if (input.grandTotalRowNumber === null) {
    return;
  }

  const labelCell = worksheet.getCell(`B${input.grandTotalRowNumber}`);
  const amountCell = worksheet.getCell(`H${input.grandTotalRowNumber}`);

  setCellFontColorBlack(labelCell);
  setCellFontColorBlack(amountCell);
  for (let columnNumber = 2; columnNumber <= 8; columnNumber += 1) {
    applyMediumProposalBorder(worksheet.getCell(input.grandTotalRowNumber, columnNumber));
  }
};

const syncCompactProposalFooterRows = (
  worksheet: ExcelJS.Worksheet,
  grandTotalRowNumber: number,
  nextPayrollMonthLabel: string
) => {
  const footerStartRow = grandTotalRowNumber + 2;

  clearCellRange(worksheet, {
    startRow: footerStartRow,
    endRow: Math.max(footerStartRow + 1, worksheet.rowCount),
    startColumn: 2,
    endColumn: 8
  });
  worksheet.getCell(`B${footerStartRow}`).value = `4. 지급 요청일 : ${nextPayrollMonthLabel} 급여일`;
  worksheet.getCell(`B${footerStartRow + 1}`).value =
    "5. 세부내역 : 별첨1. DT사업1팀 스케줄근무자 시간외근로수당 내역 참조   [끝].";
  syncUpdatedProposalTitleFonts(worksheet, [`B${footerStartRow}`, `B${footerStartRow + 1}`]);
};

const isCompactProposalWorksheet = (worksheet: ExcelJS.Worksheet) =>
  String(worksheet.getCell("B30").value ?? "").trim() === "총 합계" ||
  String(worksheet.getCell("B24").value ?? "").includes("퇴사자 조기 지급");

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
  const createGuideFill = (argb: string): ExcelJS.Fill => ({
    type: "pattern",
    pattern: "solid",
    fgColor: { argb }
  });
  const createGuideBorder = (isSectionBreak: boolean): Partial<ExcelJS.Borders> => ({
    left: { style: "medium", color: { argb: "FF000000" } },
    right: { style: "medium", color: { argb: "FF000000" } },
    top: { style: isSectionBreak ? "medium" : "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } }
  });
  const applyRateGuideRowStyle = (
    rowNumber: number,
    value: ExcelJS.CellValue,
    input: {
      fill: ExcelJS.Fill;
      font?: Partial<ExcelJS.Font>;
      height?: number;
      isSectionBreak?: boolean;
    }
  ) => {
    clearCellRangeFormatting(worksheet, {
      startRow: rowNumber,
      endRow: rowNumber,
      startColumn: 1,
      endColumn: 19
    });
    try {
      worksheet.unMergeCells(`A${rowNumber}:S${rowNumber}`);
    } catch {
      // The target range is usually unmerged in the source template.
    }
    mergeCellsWithContext(worksheet, `A${rowNumber}:S${rowNumber}`, {
      documentKind: "별첨1 Excel",
      feature: "수당 요율 안내",
      section: "요율 안내 행 전체 병합"
    });
    worksheet.getCell(`A${rowNumber}`).value = value;
    worksheet.getCell(`A${rowNumber}`).alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true
    };
    worksheet.getCell(`A${rowNumber}`).border = createGuideBorder(Boolean(input.isSectionBreak));
    worksheet.getCell(`A${rowNumber}`).fill = input.fill;
    worksheet.getCell(`A${rowNumber}`).font = {
      ...worksheet.getCell(`A${rowNumber}`).font,
      size: 10,
      ...input.font
    };
    if (input.height) {
      worksheet.getRow(rowNumber).height = input.height;
    }
  };

  let nextRowNumber = startRow;

  entries.forEach((entry, entryIndex) => {
    const titleRowNumber = nextRowNumber;
    applyRateGuideRowStyle(
      titleRowNumber,
      `${entry.sequence}. ${entry.label}`,
      {
        fill: createGuideFill("FFD0D0D0"),
        font: {
          bold: true
        },
        isSectionBreak: entryIndex === 0,
        height: 22
      },
    );
    nextRowNumber += 1;
    entry.lines.forEach((line) => {
      applyRateGuideRowStyle(
        nextRowNumber,
        line.text,
        {
          fill:
            line.kind === "formula"
              ? createGuideFill("FFE8EEF9")
              : line.kind === "applied"
                ? createGuideFill("FFF4F4F4")
                : createGuideFill("FFF9F9F9"),
          font:
            line.kind === "formula"
              ? {
                  color: { argb: "FF41526D" }
                }
              : undefined,
          height: 20
        }
      );
      nextRowNumber += 1;
    });
    if (entryIndex < entries.length - 1) {
      clearCellRangeFormatting(worksheet, {
        startRow: nextRowNumber,
        endRow: nextRowNumber,
        startColumn: 1,
        endColumn: 19
      });
      worksheet.getRow(nextRowNumber).height = 12;
      nextRowNumber += 1;
    }
  });

  return nextRowNumber - 1;
};

const hasUpdatedProposalFieldLayout = (
  template: Pick<DocumentTemplateVersion, "profile" | "validation">
) => {
  const fields = resolveProposalTemplateFields(template);

  return (
    fields.sheetName === "품의서" &&
    fields.workMonthCell === "C5" &&
    fields.printedDateCell === "E5" &&
    fields.documentTitleCell === "A11" &&
    fields.summaryIntroCell === "C12" &&
    fields.scopeCell === "B15" &&
    fields.targetHeadcountCell === "B16" &&
    fields.sectionTitleCell === "B18" &&
    fields.dataStartRow === 21
  );
};

const isUpdatedProposalTemplate = (template: DocumentTemplateVersion) =>
  updatedProposalTemplateFileNames.has(
    path.basename(resolveDocumentTemplateSourcePathOrThrow(template))
  ) || hasUpdatedProposalFieldLayout(template);

const resolveExportRows = (
  results: AllowanceCalculationResultRecord[]
): ResolvedAllowanceExportRow[] => {
  const customerNameBySiteName = buildSiteCustomerNameLookup();
  const employeeRankByCode = new Map(
    listStoredEmployees()
      .filter((employee) => employee.rank)
      .map((employee) => [employee.employeeCode, employee.rank])
  );

  return results
    .map((result) => {
      const baseLine = getLineByCode(result, "base");
      const overtimeLine = getLineByCode(result, "overtime");
      const nightLine = getLineByCode(result, "night");
      const businessCategoryCode = resolveBusinessCategoryCode(result);
      const summaryCategory = resolveAllowanceSummaryCategory(businessCategoryCode);
      const primaryLine = baseLine ?? null;
      const department = result.siteName?.trim() || "미분류";
      const employeeName = result.employeeName?.trim() || "미상";
      const employeeRank =
        normalizeEmployeeRank(result.employeeRank) ??
        employeeRankByCode.get(result.employeeCode.trim());
      const workDate = result.workDate?.trim() || "미지정";
      const totalAllowanceAmount = toDocumentMoneyAmount(result.snapshot.totalAllowanceAmount);

      return {
        calculation: result,
        businessCategoryCode,
        businessCategoryLabel: summaryCategoryLabel[summaryCategory],
        summaryCategory,
        earlyPayoutDate: result.earlyPayoutDate,
        customerName: resolveSiteCustomerName(customerNameBySiteName, department),
        employeeCode: result.employeeCode,
        employeeName,
        employeeRank,
        department,
        workDate,
        hourlyRate: result.hourlyRate,
        primaryMinutes: primaryLine?.workMinutes ?? 0,
        primaryMultiplier: primaryLine?.multiplier ?? 0,
        primaryAmount: toDocumentMoneyAmount(primaryLine?.amount ?? 0),
        overtimeMinutes: overtimeLine?.workMinutes ?? 0,
        overtimeMultiplier: overtimeLine?.multiplier ?? 0,
        overtimeAmount: toDocumentMoneyAmount(overtimeLine?.amount ?? 0),
        nightMinutes: nightLine?.workMinutes ?? 0,
        nightMultiplier: nightLine?.multiplier ?? 0,
        nightAmount: toDocumentMoneyAmount(nightLine?.amount ?? 0),
        substituteAmount:
          summaryCategory === "substitute" ? totalAllowanceAmount : 0,
        summaryOvertimeAmount:
          summaryCategory === "overtime" ? totalAllowanceAmount : 0,
        holidayAmount:
          summaryCategory === "legalHoliday" ? totalAllowanceAmount : 0,
        totalAllowanceAmount
      };
    })
    .sort(
      (left, right) =>
        left.department.localeCompare(right.department, "ko") ||
        summaryCategoryOrder[left.summaryCategory] - summaryCategoryOrder[right.summaryCategory] ||
        left.workDate.localeCompare(right.workDate) ||
        left.employeeName.localeCompare(right.employeeName, "ko")
    );
};

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
          (sum, row) => sum + row.totalAllowanceAmount,
          0
        )
      };
    })
    .filter((section) => section.rows.length > 0);

const sortCompactAttachmentOneRows = (rows: ResolvedAllowanceExportRow[]) =>
  [...rows].sort(
    (left, right) =>
      summaryCategoryOrder[left.summaryCategory] - summaryCategoryOrder[right.summaryCategory] ||
      left.employeeCode.localeCompare(right.employeeCode, "ko") ||
      left.workDate.localeCompare(right.workDate) ||
      left.employeeName.localeCompare(right.employeeName, "ko") ||
      left.department.localeCompare(right.department, "ko")
  );

const calculateAttachmentOneTotals = (rows: ResolvedAllowanceExportRow[]) => ({
  totalWorkMinutes: rows.reduce(
    (sum, row) => sum + row.calculation.snapshot.breakdown.totalWorkMinutes,
    0
  ),
  primaryMinutes: rows.reduce((sum, row) => sum + row.primaryMinutes, 0),
  primaryAmount: rows.reduce((sum, row) => sum + row.primaryAmount, 0),
  overtimeMinutes: rows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
  overtimeAmount: rows.reduce((sum, row) => sum + row.overtimeAmount, 0),
  nightMinutes: rows.reduce((sum, row) => sum + row.nightMinutes, 0),
  nightAmount: rows.reduce((sum, row) => sum + row.nightAmount, 0),
  totalAllowanceAmount: rows.reduce((sum, row) => sum + row.totalAllowanceAmount, 0)
});

const writeAttachmentOneDetailRow = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  row: ResolvedAllowanceExportRow,
  runningIndex: number,
  rowStyle: CapturedWorksheetRowStyle
) => {
  applyCapturedWorksheetRowStyle(worksheet, rowNumber, rowStyle);
  worksheet.getCell(`A${rowNumber}`).value = runningIndex;
  worksheet.getCell(`B${rowNumber}`).value = row.employeeCode;
  worksheet.getCell(`C${rowNumber}`).value = row.employeeName;
  worksheet.getCell(`D${rowNumber}`).value = row.employeeRank ?? "-";
  worksheet.getCell(`E${rowNumber}`).value = row.department;
  worksheet.getCell(`F${rowNumber}`).value = row.businessCategoryLabel;
  worksheet.getCell(`G${rowNumber}`).value = formatDate(row.workDate);
  worksheet.getCell(`H${rowNumber}`).value = Number(
    formatDecimalHours(row.calculation.snapshot.breakdown.totalWorkMinutes)
  );
  worksheet.getCell(`I${rowNumber}`).value = toBlankCellValue(
    row.primaryMinutes > 0 ? Number(formatDecimalHours(row.primaryMinutes)) : 0
  );
  worksheet.getCell(`J${rowNumber}`).value = toBlankCellValue(row.primaryMultiplier);
  worksheet.getCell(`K${rowNumber}`).value = toBlankCellValue(row.primaryAmount);
  worksheet.getCell(`L${rowNumber}`).value = toBlankCellValue(
    row.overtimeMinutes > 0 ? Number(formatDecimalHours(row.overtimeMinutes)) : 0
  );
  worksheet.getCell(`M${rowNumber}`).value = toBlankCellValue(row.overtimeMultiplier);
  worksheet.getCell(`N${rowNumber}`).value = toBlankCellValue(row.overtimeAmount);
  worksheet.getCell(`O${rowNumber}`).value = toBlankCellValue(
    row.nightMinutes > 0 ? Number(formatDecimalHours(row.nightMinutes)) : 0
  );
  worksheet.getCell(`P${rowNumber}`).value = toBlankCellValue(row.nightMultiplier);
  worksheet.getCell(`Q${rowNumber}`).value = toBlankCellValue(row.nightAmount);
  worksheet.getCell(`R${rowNumber}`).value = toBlankCellValue(row.hourlyRate);
  worksheet.getCell(`R${rowNumber}`).numFmt = attachmentOneHourlyRateNumFmt;
  worksheet.getCell(`S${rowNumber}`).value = row.totalAllowanceAmount;
  assertAttachmentOneRequiredCells(worksheet, rowNumber);
};

const writeAttachmentOneEmptyDetailRow = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  rowStyle: CapturedWorksheetRowStyle
) => {
  applyCapturedWorksheetRowStyle(worksheet, rowNumber, rowStyle);
  worksheet.getCell(`A${rowNumber}`).value = "-";
  worksheet.getCell(`B${rowNumber}`).value = "-";
  worksheet.getCell(`C${rowNumber}`).value = "해당 없음";
  worksheet.getCell(`D${rowNumber}`).value = "-";
  worksheet.getCell(`E${rowNumber}`).value = "-";
  worksheet.getCell(`F${rowNumber}`).value = "-";
  worksheet.getCell(`G${rowNumber}`).value = "-";
  worksheet.getCell(`H${rowNumber}`).value = null;
  worksheet.getCell(`I${rowNumber}`).value = null;
  worksheet.getCell(`J${rowNumber}`).value = null;
  worksheet.getCell(`K${rowNumber}`).value = null;
  worksheet.getCell(`L${rowNumber}`).value = null;
  worksheet.getCell(`M${rowNumber}`).value = null;
  worksheet.getCell(`N${rowNumber}`).value = null;
  worksheet.getCell(`O${rowNumber}`).value = null;
  worksheet.getCell(`P${rowNumber}`).value = null;
  worksheet.getCell(`Q${rowNumber}`).value = null;
  worksheet.getCell(`R${rowNumber}`).value = null;
  worksheet.getCell(`S${rowNumber}`).value = null;
};

const writeAttachmentOneSummaryRow = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  input: {
    label: "소   계" | "합   계";
    rowStyle: CapturedWorksheetRowStyle;
    totals: ReturnType<typeof calculateAttachmentOneTotals>;
  }
) => {
  applyCapturedWorksheetRowStyle(worksheet, rowNumber, input.rowStyle);
  worksheet.getCell(`A${rowNumber}`).value = "-";
  worksheet.getCell(`B${rowNumber}`).value = "-";
  worksheet.getCell(`C${rowNumber}`).value = input.label;
  worksheet.getCell(`D${rowNumber}`).value = "-";
  worksheet.getCell(`E${rowNumber}`).value = "-";
  worksheet.getCell(`F${rowNumber}`).value = input.label === "합   계" ? "합계" : "-";
  worksheet.getCell(`G${rowNumber}`).value = "-";
  worksheet.getCell(`H${rowNumber}`).value = toBlankCellValue(
    input.totals.totalWorkMinutes > 0 ? Number(formatDecimalHours(input.totals.totalWorkMinutes)) : 0
  );
  worksheet.getCell(`I${rowNumber}`).value = toBlankCellValue(
    input.totals.primaryMinutes > 0 ? Number(formatDecimalHours(input.totals.primaryMinutes)) : 0
  );
  worksheet.getCell(`J${rowNumber}`).value = "-";
  worksheet.getCell(`K${rowNumber}`).value = toBlankCellValue(input.totals.primaryAmount);
  worksheet.getCell(`L${rowNumber}`).value = toBlankCellValue(
    input.totals.overtimeMinutes > 0 ? Number(formatDecimalHours(input.totals.overtimeMinutes)) : 0
  );
  worksheet.getCell(`M${rowNumber}`).value = "-";
  worksheet.getCell(`N${rowNumber}`).value = toBlankCellValue(input.totals.overtimeAmount);
  worksheet.getCell(`O${rowNumber}`).value = toBlankCellValue(
    input.totals.nightMinutes > 0 ? Number(formatDecimalHours(input.totals.nightMinutes)) : 0
  );
  worksheet.getCell(`P${rowNumber}`).value = "-";
  worksheet.getCell(`Q${rowNumber}`).value = toBlankCellValue(input.totals.nightAmount);
  worksheet.getCell(`R${rowNumber}`).value = "-";
  worksheet.getCell(`S${rowNumber}`).value = input.totals.totalAllowanceAmount;
};

const writeProposalDecisionCheckboxes = (worksheet: ExcelJS.Worksheet) => {
  worksheet.getCell("A3").value = "☑ 품의";
  worksheet.getCell("C3").value = "☐ 보고";
};

const writeLegacyProposalWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
  regularTotalAllowanceAmount: number;
  earlyPayoutTotalAllowanceAmount: number;
}) => {
  const workbook = await readWorkbook(resolveDocumentTemplateSourcePathOrThrow(input.template));
  const fields = resolveProposalTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];
  const sections = splitProposalExportSections(input.rows);
  const siteSummaries = buildSiteSummaries(sections.regularRows);
  const employeeCount = new Set(input.rows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size;
  const today = formatDate(new Date().toISOString().slice(0, 10));
  const documentNumber = buildAllowanceProposalDocumentNumber({
    printedDate: today,
    fallbackWorkMonth: input.workMonth
  });

  writeProposalDecisionCheckboxes(worksheet);
  worksheet.getCell(fields.workMonthCell).value = documentNumber;
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
    worksheet.getCell(`B${rowNumber}`).value = summary.customerName?.trim() || "";
    worksheet.getCell(`C${rowNumber}`).value = "";
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

  applyDocumentTemplateStyleSpec({
    workbook,
    template: input.template
  });
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
  const workbook = await readWorkbook(resolveDocumentTemplateSourcePathOrThrow(input.template));
  const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0];
  const isCompactTemplate = isCompactProposalWorksheet(worksheet);
  const sections = splitProposalExportSections(input.rows);
  const siteSummaries = buildSiteSummaries(sections.regularRows);
  const earlyPayoutSiteSummaries = buildSiteSummaries(sections.earlyPayoutRows);
  const employeeCount = new Set(input.rows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size;
  const [yearText, monthText] = input.workMonth.split("-");
  const monthLabel = `${yearText}년 ${Number(monthText)}월`;
  const printedDate = formatDate(new Date().toISOString().slice(0, 10));
  const documentNumber = buildAllowanceProposalDocumentNumber({
    printedDate,
    fallbackWorkMonth: input.workMonth
  });
  const nextPayrollMonthLabel = formatNextPayrollMonthLabel(input.workMonth);
  let grandTotalRowNumber: number | null = null;

  writeProposalDecisionCheckboxes(worksheet);
  worksheet.getCell("C5").value = documentNumber;
  worksheet.getCell("E5").value = printedDate;
  worksheet.getCell("A11").value =
    `제  목  :  ${ALLOWANCE_DOCUMENT_OWNER_DEPARTMENT} 스케쥴근무 시간외 근로 수당 지급 품의`;
  worksheet.getCell("C12").value =
    `${monthLabel}에 발생한 스케쥴근무자의 시간외 근로 수당 지급 승인을 요청드립니다.`;
  worksheet.getCell("B14").value = "1. 대상 기준 및 대상자";
  worksheet.getCell("B15").value =
    " ① 대상 기준 : 월근무계획외 연장, 대체 근무을 수행한 자 또는 휴일근무를 수행한 자";
  worksheet.getCell("B16").value = ` ② 당월 지급 대상자 :  ${employeeCount}명`;
  worksheet.getCell("B18").value = `2. ${Number(monthText)}월 지급 요청 내역`;

  const regularTemplateDetailCapacity = isCompactTemplate ? 1 : 11;
  const regularSummarySync = syncUpdatedProposalSiteSummaryRows(worksheet, {
    detailStartRow: 21,
    templateDetailCapacity: regularTemplateDetailCapacity,
    summaries: siteSummaries,
    totalAmount: input.regularTotalAllowanceAmount
  });
  const regularTotalRowNumber = 21 + regularTemplateDetailCapacity + regularSummarySync.rowCountDelta;

  const earlyPayoutTitleRowNumber = regularTotalRowNumber + 2;
  const earlyPayoutDetailStartRowNumber = earlyPayoutTitleRowNumber + 3;

  worksheet.getCell(`B${earlyPayoutTitleRowNumber}`).value =
    `3. ${nextPayrollMonthLabel} 퇴사자${isCompactTemplate ? " 조기" : ""} 지급 내역`;
  syncUpdatedProposalTitleFonts(worksheet, ["B14", "B18", `B${earlyPayoutTitleRowNumber}`]);
  syncUpdatedProposalEarlyPayoutHeaderRows(worksheet, earlyPayoutDetailStartRowNumber);

  const earlyPayoutSummarySync = syncUpdatedProposalEarlyPayoutRows(
    worksheet,
    earlyPayoutDetailStartRowNumber,
    earlyPayoutSiteSummaries,
    input.earlyPayoutTotalAllowanceAmount,
    isCompactTemplate ? 1 : 2
  );
  const earlyPayoutTotalRowNumber = earlyPayoutSummarySync.totalRowNumber;

  if (isCompactTemplate) {
    grandTotalRowNumber = earlyPayoutTotalRowNumber + 2;
    syncCompactProposalGrandTotalRow(
      worksheet,
      grandTotalRowNumber,
      input.regularTotalAllowanceAmount + input.earlyPayoutTotalAllowanceAmount
    );
    syncCompactProposalFooterRows(worksheet, grandTotalRowNumber, nextPayrollMonthLabel);
  } else {
    syncUpdatedProposalFooterRows(worksheet, earlyPayoutTotalRowNumber, nextPayrollMonthLabel);
  }

  applyDocumentTemplateStyleSpec({
    workbook,
    template: input.template
  });
  syncUpdatedProposalFixedVisuals(worksheet, { grandTotalRowNumber });
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

const attachmentOneStaticGuideStartRow = 24;
const attachmentOneStaticGuideEndRow = 45;
const attachmentOneStaticGuideRowCount =
  attachmentOneStaticGuideEndRow - attachmentOneStaticGuideStartRow + 1;

const isCompactAttachmentOneWorksheet = (worksheet: ExcelJS.Worksheet) =>
  String(worksheet.getCell("A18").value ?? "").includes("퇴사자 조기 지급") ||
  String(worksheet.getCell("A24").value ?? "").includes("Sort");

const isCompactAttachmentOneTemplate = (sourcePath: string, worksheet: ExcelJS.Worksheet) =>
  compactAttachmentOneTemplateFileNames.has(path.basename(sourcePath)) ||
  isCompactAttachmentOneWorksheet(worksheet);

const writeAttachmentOneHeaderRows = (
  worksheet: ExcelJS.Worksheet,
  topRowNumber: number,
  rowStyles: {
    bottom: CapturedWorksheetRowStyle;
    middle: CapturedWorksheetRowStyle;
    top: CapturedWorksheetRowStyle;
  }
) => {
  const middleRowNumber = topRowNumber + 1;
  const bottomRowNumber = topRowNumber + 2;

  applyCapturedWorksheetRowStyle(worksheet, topRowNumber, rowStyles.top);
  applyCapturedWorksheetRowStyle(worksheet, middleRowNumber, rowStyles.middle);
  applyCapturedWorksheetRowStyle(worksheet, bottomRowNumber, rowStyles.bottom);
  ["A", "B", "C", "D", "E", "F", "G", "H", "R", "S"].forEach((column) => {
    mergeCellsWithContext(worksheet, `${column}${topRowNumber}:${column}${bottomRowNumber}`, {
      documentKind: "별첨1 Excel",
      feature: "상세 내역 표 헤더",
      section: `${column}열 세로 헤더 병합`
    });
  });
  mergeCellsWithContext(worksheet, `I${topRowNumber}:Q${topRowNumber}`, {
    documentKind: "별첨1 Excel",
    feature: "상세 내역 표 헤더",
    section: "근로수당 현황 상단 헤더 병합"
  });
  mergeCellsWithContext(worksheet, `I${middleRowNumber}:K${middleRowNumber}`, {
    documentKind: "별첨1 Excel",
    feature: "상세 내역 표 헤더",
    section: "대체근로수당 중간 헤더 병합"
  });
  mergeCellsWithContext(worksheet, `L${middleRowNumber}:N${middleRowNumber}`, {
    documentKind: "별첨1 Excel",
    feature: "상세 내역 표 헤더",
    section: "연장근로수당 중간 헤더 병합"
  });
  mergeCellsWithContext(worksheet, `O${middleRowNumber}:Q${middleRowNumber}`, {
    documentKind: "별첨1 Excel",
    feature: "상세 내역 표 헤더",
    section: "휴일근로수당 중간 헤더 병합"
  });

  worksheet.getCell(`A${topRowNumber}`).value = "No.";
  worksheet.getCell(`B${topRowNumber}`).value = "사번";
  worksheet.getCell(`C${topRowNumber}`).value = "성명";
  worksheet.getCell(`D${topRowNumber}`).value = "직급";
  worksheet.getCell(`E${topRowNumber}`).value = "단위 조직";
  worksheet.getCell(`F${topRowNumber}`).value = "구분";
  worksheet.getCell(`G${topRowNumber}`).value = "근무 날짜";
  worksheet.getCell(`H${topRowNumber}`).value = "근무 시간";
  worksheet.getCell(`I${topRowNumber}`).value = "근로수당 현황";
  worksheet.getCell(`R${topRowNumber}`).value = "통상시급";
  worksheet.getCell(`S${topRowNumber}`).value = "지급 비용";
  worksheet.getCell(`I${middleRowNumber}`).value = "기본 근로수당";
  worksheet.getCell(`L${middleRowNumber}`).value = "연장 근로수당";
  worksheet.getCell(`O${middleRowNumber}`).value = "야간 근로수당";
  worksheet.getCell(`I${bottomRowNumber}`).value = "시간";
  worksheet.getCell(`J${bottomRowNumber}`).value = "요율";
  worksheet.getCell(`K${bottomRowNumber}`).value = "수당";
  worksheet.getCell(`L${bottomRowNumber}`).value = "시간";
  worksheet.getCell(`M${bottomRowNumber}`).value = "요율";
  worksheet.getCell(`N${bottomRowNumber}`).value = "수당";
  worksheet.getCell(`O${bottomRowNumber}`).value = "시간";
  worksheet.getCell(`P${bottomRowNumber}`).value = "요율";
  worksheet.getCell(`Q${bottomRowNumber}`).value = "수당";
};

const writeAttachmentOneStaticGuide = (
  worksheet: ExcelJS.Worksheet,
  startRowNumber: number,
  guideBlock: CapturedWorksheetBlock
) => {
  applyCapturedWorksheetBlock(worksheet, startRowNumber, guideBlock);
};

const writeCompactAttachmentOneWorkbook = async (input: {
  outputPath: string;
  template: DocumentTemplateVersion;
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
}) => {
  const regularRows = sortCompactAttachmentOneRows(input.rows.filter((row) => !row.earlyPayoutDate));
  const earlyPayoutRows = sortCompactAttachmentOneRows(input.rows.filter((row) => Boolean(row.earlyPayoutDate)));
  const regularDetailRows = regularRows.length > 0 ? regularRows : null;
  const earlyDetailRows = earlyPayoutRows.length > 0 ? earlyPayoutRows : null;
  const regularRenderedRowCount = Math.max(regularRows.length, 1);
  const earlyRenderedRowCount = Math.max(earlyPayoutRows.length, 1);
  const regularTemplateDetailCapacity = 10;
  const rowCountDelta = regularRenderedRowCount - regularTemplateDetailCapacity;
  const detailRowStyle = captureWorksheetRowStyle(input.worksheet, 5, 19);
  const subtotalRowStyle = captureWorksheetRowStyle(input.worksheet, 15, 19);
  const totalRowStyle = captureWorksheetRowStyle(input.worksheet, 16, 19);
  const earlyTitleRowStyle = captureWorksheetRowStyle(input.worksheet, 18, 19);
  const earlyHeaderRowStyles = {
    top: captureWorksheetRowStyle(input.worksheet, 19, 19),
    middle: captureWorksheetRowStyle(input.worksheet, 20, 19),
    bottom: captureWorksheetRowStyle(input.worksheet, 21, 19)
  };
  const earlyDetailRowStyle = captureWorksheetRowStyle(input.worksheet, 22, 19);
  const guideBlock = captureWorksheetBlock(
    input.worksheet,
    attachmentOneStaticGuideStartRow,
    attachmentOneStaticGuideEndRow,
    19
  );

  removeNonPrimaryWorksheets(input.workbook, input.worksheet);
  input.worksheet.getCell("A1").value = buildAllowanceAttachmentOneTitle(input.workMonth);

  if (rowCountDelta > 0) {
    input.worksheet.spliceRows(15, 0, ...Array.from({ length: rowCountDelta }, () => []));
  }
  if (rowCountDelta < 0) {
    input.worksheet.spliceRows(5 + regularRenderedRowCount, Math.abs(rowCountDelta));
  }

  clearCellRange(input.worksheet, {
    startRow: 5,
    endRow: 5 + regularRenderedRowCount + 1,
    startColumn: 1,
    endColumn: 19
  });

  if (regularDetailRows) {
    regularDetailRows.forEach((row, index) => {
      writeAttachmentOneDetailRow(input.worksheet, 5 + index, row, index + 1, detailRowStyle);
    });
  } else {
    writeAttachmentOneEmptyDetailRow(input.worksheet, 5, detailRowStyle);
  }

  const regularTotals = calculateAttachmentOneTotals(regularRows);
  const subtotalRowNumber = 5 + regularRenderedRowCount;
  const totalRowNumber = subtotalRowNumber + 1;
  writeAttachmentOneSummaryRow(input.worksheet, subtotalRowNumber, {
    label: "소   계",
    rowStyle: subtotalRowStyle,
    totals: regularTotals
  });
  writeAttachmentOneSummaryRow(input.worksheet, totalRowNumber, {
    label: "합   계",
    rowStyle: totalRowStyle,
    totals: regularTotals
  });

  const earlyTitleRowNumber = totalRowNumber + 2;
  const earlyHeaderTopRowNumber = earlyTitleRowNumber + 1;
  const earlyDetailStartRowNumber = earlyHeaderTopRowNumber + 3;
  const guideStartRowNumber = earlyDetailStartRowNumber + earlyRenderedRowCount + 2;
  const lastStaticGuideRowNumber = guideStartRowNumber + attachmentOneStaticGuideRowCount - 1;

  clearCellRangeFormatting(input.worksheet, {
    startRow: earlyTitleRowNumber,
    endRow: Math.max(input.worksheet.rowCount, lastStaticGuideRowNumber),
    startColumn: 1,
    endColumn: 19
  });
  applyCapturedWorksheetRowStyle(input.worksheet, earlyTitleRowNumber, earlyTitleRowStyle);
  input.worksheet.getCell(`A${earlyTitleRowNumber}`).value =
    `※ ${formatNextPayrollMonthLabel(input.workMonth)} 퇴사자 조기 지급 내역`;
  writeAttachmentOneHeaderRows(input.worksheet, earlyHeaderTopRowNumber, earlyHeaderRowStyles);

  if (earlyDetailRows) {
    earlyDetailRows.forEach((row, index) => {
      writeAttachmentOneDetailRow(
        input.worksheet,
        earlyDetailStartRowNumber + index,
        row,
        index + 1,
        earlyDetailRowStyle
      );
    });
  } else {
    writeAttachmentOneEmptyDetailRow(input.worksheet, earlyDetailStartRowNumber, earlyDetailRowStyle);
  }

  writeAttachmentOneStaticGuide(input.worksheet, guideStartRowNumber, guideBlock);
  clearCellRangeFormatting(input.worksheet, {
    startRow: lastStaticGuideRowNumber + 1,
    endRow: input.worksheet.rowCount,
    startColumn: 1,
    endColumn: 19
  });

  applyDocumentTemplateStyleSpec({
    workbook: input.workbook,
    template: input.template
  });
  await input.workbook.xlsx.writeFile(input.outputPath);
};

const writeAttachmentOneWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rateGuideEntries: AllowanceRateGuideEntry[];
  rows: ResolvedAllowanceExportRow[];
}) => {
  const templateSourcePath = resolveDocumentTemplateSourcePathOrThrow(input.template);
  const workbook = await readWorkbook(templateSourcePath);
  const fields = resolveAttachmentOneTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];

  if (isCompactAttachmentOneTemplate(templateSourcePath, worksheet)) {
    await writeCompactAttachmentOneWorkbook({
      outputPath: input.outputPath,
      template: input.template,
      workbook,
      worksheet,
      workMonth: input.workMonth,
      rows: input.rows
    });
    return;
  }

  const sections = buildAttachmentOneSections(input.rows);
  const detailRowStyle = captureWorksheetRowStyle(worksheet, fields.dataStartRow, 19);
  const subtotalRowStyle = captureWorksheetRowStyle(worksheet, 130, 19);
  const totalRowStyle = captureWorksheetRowStyle(worksheet, 131, 19);
  const rateGuideRowCount = input.rateGuideEntries.reduce(
    (sum, entry, index) => sum + 1 + entry.lines.length + (index < input.rateGuideEntries.length - 1 ? 1 : 0),
    0
  );

  worksheet.getCell(fields.titleCell).value = buildAllowanceAttachmentOneTitle(input.workMonth);
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
      worksheet.getCell(`D${currentRow}`).value = row.employeeRank ?? "-";
      worksheet.getCell(`E${currentRow}`).value = row.department;
      worksheet.getCell(`F${currentRow}`).value = row.businessCategoryLabel;
      worksheet.getCell(`G${currentRow}`).value = formatDate(row.workDate);
      worksheet.getCell(`H${currentRow}`).value = Number(
        formatDecimalHours(row.calculation.snapshot.breakdown.totalWorkMinutes)
      );
      worksheet.getCell(`I${currentRow}`).value = toBlankCellValue(
        row.primaryMinutes > 0 ? Number(formatDecimalHours(row.primaryMinutes)) : 0
      );
      worksheet.getCell(`J${currentRow}`).value = toBlankCellValue(row.primaryMultiplier);
      worksheet.getCell(`K${currentRow}`).value = toBlankCellValue(row.primaryAmount);
      worksheet.getCell(`L${currentRow}`).value = toBlankCellValue(
        row.overtimeMinutes > 0 ? Number(formatDecimalHours(row.overtimeMinutes)) : 0
      );
      worksheet.getCell(`M${currentRow}`).value = toBlankCellValue(row.overtimeMultiplier);
      worksheet.getCell(`N${currentRow}`).value = toBlankCellValue(row.overtimeAmount);
      worksheet.getCell(`O${currentRow}`).value = toBlankCellValue(
        row.nightMinutes > 0 ? Number(formatDecimalHours(row.nightMinutes)) : 0
      );
      worksheet.getCell(`P${currentRow}`).value = toBlankCellValue(row.nightMultiplier);
      worksheet.getCell(`Q${currentRow}`).value = toBlankCellValue(row.nightAmount);
      worksheet.getCell(`R${currentRow}`).value = toBlankCellValue(row.hourlyRate);
      worksheet.getCell(`R${currentRow}`).numFmt = attachmentOneHourlyRateNumFmt;
      worksheet.getCell(`S${currentRow}`).value = row.totalAllowanceAmount;
      applyCapturedWorksheetRowStyle(worksheet, currentRow, detailRowStyle);
      assertAttachmentOneRequiredCells(worksheet, currentRow);
      currentRow += 1;
      runningIndex += 1;
    });

    worksheet.getCell(`A${currentRow}`).value = "-";
    worksheet.getCell(`B${currentRow}`).value = "-";
    worksheet.getCell(`C${currentRow}`).value = "소   계";
    worksheet.getCell(`D${currentRow}`).value = "-";
    worksheet.getCell(`E${currentRow}`).value = "-";
    worksheet.getCell(`F${currentRow}`).value = "-";
    worksheet.getCell(`G${currentRow}`).value = "-";
    worksheet.getCell(`H${currentRow}`).value = toBlankCellValue(
      section.totalWorkMinutes > 0 ? Number(formatDecimalHours(section.totalWorkMinutes)) : 0
    );
    worksheet.getCell(`I${currentRow}`).value = toBlankCellValue(
      section.primaryMinutes > 0 ? Number(formatDecimalHours(section.primaryMinutes)) : 0
    );
    worksheet.getCell(`J${currentRow}`).value = "-";
    worksheet.getCell(`K${currentRow}`).value = toBlankCellValue(section.primaryAmount);
    worksheet.getCell(`L${currentRow}`).value = toBlankCellValue(
      section.overtimeMinutes > 0 ? Number(formatDecimalHours(section.overtimeMinutes)) : 0
    );
    worksheet.getCell(`M${currentRow}`).value = "-";
    worksheet.getCell(`N${currentRow}`).value = toBlankCellValue(section.overtimeAmount);
    worksheet.getCell(`O${currentRow}`).value = toBlankCellValue(
      section.nightMinutes > 0 ? Number(formatDecimalHours(section.nightMinutes)) : 0
    );
    worksheet.getCell(`P${currentRow}`).value = "-";
    worksheet.getCell(`Q${currentRow}`).value = toBlankCellValue(section.nightAmount);
    worksheet.getCell(`R${currentRow}`).value = "-";
    worksheet.getCell(`S${currentRow}`).value = section.totalAllowanceAmount;
    applyCapturedWorksheetRowStyle(worksheet, currentRow, subtotalRowStyle);
    currentRow += 1;
  });

  const grandTotalRowNumber = currentRow;
  worksheet.getCell(`A${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`B${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`C${grandTotalRowNumber}`).value = "합   계";
  worksheet.getCell(`D${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`E${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`F${grandTotalRowNumber}`).value = "합계";
  worksheet.getCell(`G${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`H${grandTotalRowNumber}`).value = toBlankCellValue(
    input.rows.reduce((sum, row) => sum + row.calculation.snapshot.breakdown.totalWorkMinutes, 0) > 0
      ? Number(
          formatDecimalHours(
            input.rows.reduce((sum, row) => sum + row.calculation.snapshot.breakdown.totalWorkMinutes, 0)
          )
        )
      : 0
  );
  worksheet.getCell(`I${grandTotalRowNumber}`).value = toBlankCellValue(
    input.rows.reduce((sum, row) => sum + row.primaryMinutes, 0) > 0
      ? Number(formatDecimalHours(input.rows.reduce((sum, row) => sum + row.primaryMinutes, 0)))
      : 0
  );
  worksheet.getCell(`J${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`K${grandTotalRowNumber}`).value = toBlankCellValue(
    input.rows.reduce((sum, row) => sum + row.primaryAmount, 0)
  );
  worksheet.getCell(`L${grandTotalRowNumber}`).value = toBlankCellValue(
    input.rows.reduce((sum, row) => sum + row.overtimeMinutes, 0) > 0
      ? Number(formatDecimalHours(input.rows.reduce((sum, row) => sum + row.overtimeMinutes, 0)))
      : 0
  );
  worksheet.getCell(`M${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`N${grandTotalRowNumber}`).value = toBlankCellValue(
    input.rows.reduce((sum, row) => sum + row.overtimeAmount, 0)
  );
  worksheet.getCell(`O${grandTotalRowNumber}`).value = toBlankCellValue(
    input.rows.reduce((sum, row) => sum + row.nightMinutes, 0) > 0
      ? Number(formatDecimalHours(input.rows.reduce((sum, row) => sum + row.nightMinutes, 0)))
      : 0
  );
  worksheet.getCell(`P${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`Q${grandTotalRowNumber}`).value = toBlankCellValue(
    input.rows.reduce((sum, row) => sum + row.nightAmount, 0)
  );
  worksheet.getCell(`R${grandTotalRowNumber}`).value = "-";
  worksheet.getCell(`S${grandTotalRowNumber}`).value = input.rows.reduce(
    (sum, row) => sum + row.totalAllowanceAmount,
    0
  );
  applyCapturedWorksheetRowStyle(worksheet, grandTotalRowNumber, totalRowStyle);
  currentRow += 1;

  for (let spacerRowNumber = currentRow + 1; spacerRowNumber <= currentRow + 5; spacerRowNumber += 1) {
    worksheet.getRow(spacerRowNumber).height = 18;
  }

  const rateGuideStartRow = currentRow + 6;
  const lastRateGuideRow = writeAttachmentOneRateGuide(
    worksheet,
    rateGuideStartRow,
    input.rateGuideEntries
  );
  clearCellRangeFormatting(worksheet, {
    startRow: currentRow,
    endRow: rateGuideStartRow - 1,
    startColumn: 1,
    endColumn: 19
  });
  clearCellRangeFormatting(worksheet, {
    startRow: lastRateGuideRow + 1,
    endRow: worksheet.rowCount,
    startColumn: 1,
    endColumn: 19
  });

  applyDocumentTemplateStyleSpec({
    workbook,
    template: input.template
  });
  await workbook.xlsx.writeFile(input.outputPath);
};

const writeAttachmentTwoWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
  totalAllowanceAmount: number;
}) => {
  const workbook = await readWorkbook(resolveDocumentTemplateSourcePathOrThrow(input.template));
  const fields = resolveAttachmentTwoTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];
  const detailRowStyle = captureWorksheetRowStyle(worksheet, fields.dataStartRow, 7);
  const subtotalRowStyle = captureWorksheetRowStyle(worksheet, 13, 7);
  const totalRowStyle = captureWorksheetRowStyle(worksheet, 86, 7);
  const groupedByDepartment = [...input.rows.reduce((accumulator, row) => {
    const departmentRows = accumulator.get(row.department) ?? [];
    departmentRows.push(row);
    accumulator.set(row.department, departmentRows);
    return accumulator;
  }, new Map<string, ResolvedAllowanceExportRow[]>()).entries()];

  worksheet.getCell(fields.titleCell).value = buildAllowanceAttachmentTwoTitle(input.workMonth);
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
      worksheet.getCell(`G${currentRow}`).value = row.totalAllowanceAmount;
      applyCapturedWorksheetRowStyle(worksheet, currentRow, detailRowStyle);

      departmentSubstitute += row.substituteAmount;
      departmentOvertime += row.summaryOvertimeAmount;
      departmentHoliday += row.holidayAmount;
      departmentTotal += row.totalAllowanceAmount;
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
    applyCapturedWorksheetRowStyle(worksheet, currentRow, subtotalRowStyle);
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
  applyCapturedWorksheetRowStyle(worksheet, currentRow, totalRowStyle);
  clearCellRangeFormatting(worksheet, {
    startRow: currentRow + 1,
    endRow: worksheet.rowCount,
    startColumn: 1,
    endColumn: 7
  });

  applyDocumentTemplateStyleSpec({
    workbook,
    template: input.template
  });
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
    totalAllowanceAmount: exportRows.reduce((sum, row) => sum + row.totalAllowanceAmount, 0),
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
      customerName: row.customerName,
      siteName: row.department,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      workDate: row.workDate,
      workType: row.calculation.workType,
      businessCategoryLabel: row.businessCategoryLabel,
      totalWorkMinutes: row.calculation.snapshot.breakdown.totalWorkMinutes,
      totalAllowanceAmount: row.totalAllowanceAmount,
      earlyPayoutDate: row.earlyPayoutDate
    })),
    regularSiteSummaries: mapPreviewSiteSummaries(
      buildSiteSummaries(context.proposalSections.regularRows)
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
  let attemptedOutputPaths: string[] = [];

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
    const proposalTarget = resolveAllowanceDocumentOutputTarget({
      baseDir: proposalOutputDir,
      workMonth: resolvedContext.workMonth,
      documentKind: "proposal",
      outputFormat
    });
    const attachment1Target = resolveAllowanceDocumentOutputTarget({
      baseDir: attachment1OutputDir,
      workMonth: resolvedContext.workMonth,
      documentKind: "attachment1",
      outputFormat
    });
    const attachment2Target = resolveAllowanceDocumentOutputTarget({
      baseDir: attachment2OutputDir,
      workMonth: resolvedContext.workMonth,
      documentKind: "attachment2",
      outputFormat
    });
    const proposalPath = proposalTarget.outputPath;
    const attachment1Path = attachment1Target.outputPath;
    const attachment2Path = attachment2Target.outputPath;

    attemptedOutputPaths = [proposalPath, attachment1Path, attachment2Path];
    [
      proposalTarget.directoryPath,
      attachment1Target.directoryPath,
      attachment2Target.directoryPath
    ].forEach((directoryPath) => {
      mkdirSync(directoryPath, { recursive: true });
    });

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
      message: buildAllowanceDocumentExportFailureMessage(error, attemptedOutputPaths)
    };
  }
};
