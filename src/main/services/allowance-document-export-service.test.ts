import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { getAllowanceRateEntryCode } from "../../shared/domain/allowance-rate-matrix";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type { DocumentTemplateVersion } from "../../shared/domain/model";
import {
  buildAllowanceRateGuideEntriesForTest,
  exportAllowanceDocuments,
  mergeCellsWithContextForTest,
  realignWorksheetMergesToCellsForTest,
  resolveAllowanceDocumentOutputTarget,
  unmergeCellsInRangeForTest,
  writeUpdatedProposalWorkbookForTest
} from "./allowance-document-export-service";
import { getStoredAppSettingsSnapshot, saveStoredAppSettings } from "./app-settings-storage-service";
import { reviewAllowanceCalculations } from "./allowance-approval-service";
import {
  listStoredAllowanceDocumentExports,
  resetAllowanceDocumentExportHistoryForTest
} from "./allowance-document-export-history-service";
import {
  runApprovedAllowanceCalculation,
  setAllowanceCalculationEarlyPayout
} from "./approved-allowance-calculation-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  saveStoredAllowanceRateVersion,
  saveStoredDocumentTemplateVersion
} from "./operations-storage-service";
import { listStoredSites, saveStoredSite } from "./site-storage-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "allowance-document-export");
const exportDocumentTestTimeoutMs = 60000;

const updateReturnedWorkbook = async (
  filePath: string,
  update: (worksheet: ExcelJS.Worksheet) => void
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  update(worksheet);
  await workbook.xlsx.writeFile(filePath);
};

const createCustomRateItems = () => [
  { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "base"), multiplier: 1.9 },
  { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "overtime"), multiplier: 2.4 },
  { allowanceCode: getAllowanceRateEntryCode("legal-holiday", "night"), multiplier: 2.8 },
  { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "base"), multiplier: 1.3 },
  { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "overtime"), multiplier: 2.6 },
  { allowanceCode: getAllowanceRateEntryCode("weekday-substitute", "night"), multiplier: 3.1 },
  { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "base"), multiplier: 1.4 },
  { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "overtime"), multiplier: 2.7 },
  { allowanceCode: getAllowanceRateEntryCode("holiday-substitute", "night"), multiplier: 3.2 },
  { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "base"), multiplier: 0.2 },
  { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "overtime"), multiplier: 1.9 },
  { allowanceCode: getAllowanceRateEntryCode("weekday-overtime", "night"), multiplier: 2.4 },
  { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "base"), multiplier: 0.3 },
  { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "overtime"), multiplier: 0.7 },
  { allowanceCode: getAllowanceRateEntryCode("holiday-overtime", "night"), multiplier: 1.1 }
];

const createSyntheticCalculationResult = (input: {
  id: string;
  rateVersionId: string;
  rateVersionLabel: string;
  categoryCode:
    | "legal-holiday"
    | "weekday-substitute"
    | "holiday-substitute"
    | "weekday-overtime"
    | "holiday-overtime";
  base: number;
  overtime: number;
  night: number;
  workDate?: string;
}): AllowanceCalculationResultRecord => {
  const isHolidayCategory =
    input.categoryCode === "legal-holiday" || input.categoryCode === "holiday-substitute";
  const isSubstituteCategory =
    input.categoryCode === "weekday-substitute" || input.categoryCode === "holiday-substitute";
  const lines = [
    input.base > 0
      ? {
          allowanceCode: "base" as const,
          workMinutes: 60,
          multiplier: input.base,
          amount: 1000
        }
      : null,
    input.overtime > 0
      ? {
          allowanceCode: "overtime" as const,
          workMinutes: 60,
          multiplier: input.overtime,
          amount: 1000
        }
      : null,
    input.night > 0
      ? {
          allowanceCode: "night" as const,
          workMinutes: 60,
          multiplier: input.night,
          amount: 1000
        }
      : null
  ].filter(Boolean) as Array<{
    allowanceCode: "base" | "overtime" | "night";
    workMinutes: number;
    multiplier: number;
    amount: number;
  }>;

  return {
    id: input.id,
    fileId: "file-1",
    fileName: "inline.xlsx",
    entryId: `entry-${input.id}`,
    employeeCode: "E-001",
    employeeName: "홍길동",
    siteName: "판교NOC",
    workDate: input.workDate ?? "2024-10-01",
    workType: isSubstituteCategory ? "substitute" : isHolidayCategory ? "holiday" : "overtime",
    hourlyRate: 15000,
    rateVersionId: input.rateVersionId,
    rateVersionLabel: input.rateVersionLabel,
    status: "approved",
    signature: `sig-${input.id}`,
    snapshot: {
      id: `snapshot-${input.id}`,
      performanceApprovalId: `approval-${input.id}`,
      calculationVersion: 1,
      businessCategoryCode: input.categoryCode,
      businessCategoryLabel: input.categoryCode,
      breakdown: {
        totalWorkMinutes: 180,
        baseWorkMinutes: input.base > 0 ? 60 : 0,
        overtimeMinutes: input.overtime > 0 ? 60 : 0,
        nightMinutes: input.night > 0 ? 60 : 0,
        holidayMinutes: isHolidayCategory ? 180 : 0,
        substituteMinutes: isSubstituteCategory ? 180 : 0
      },
      lines,
      totalAllowanceAmount: 3000,
      createdAt: "2024-10-31T09:00:00+09:00"
    }
  };
};

const readCellText = (value: ExcelJS.CellValue | undefined | null) => {
  if (!value) {
    return "";
  }

  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join("");
  }

  return String(value);
};

const hasWorksheetText = (worksheet: ExcelJS.Worksheet | undefined, expected: string) => {
  if (!worksheet) {
    return false;
  }

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    for (let columnNumber = 1; columnNumber <= row.cellCount; columnNumber += 1) {
      if (readCellText(row.getCell(columnNumber).value).includes(expected)) {
        return true;
      }
    }
  }

  return false;
};

type WriteUpdatedProposalWorkbookInput = Parameters<typeof writeUpdatedProposalWorkbookForTest>[0];
type ProposalExportRowForTest = WriteUpdatedProposalWorkbookInput["rows"][number];

const createProposalTemplateStub = (sourcePath: string) =>
  ({
    id: "test-proposal-template",
    templateType: "proposal",
    versionLabel: "테스트 품의서",
    sourcePath,
    status: "approved",
    isDefault: true
  }) as unknown as DocumentTemplateVersion;

const createProposalExportRowForTest = (input: {
  department: string;
  customerName?: string;
  earlyPayoutDate?: string;
  amount?: number;
}): ProposalExportRowForTest => {
  const amount = input.amount ?? 22500;

  return {
    calculation: createSyntheticCalculationResult({
      id: `calc-${input.department}-${input.earlyPayoutDate ?? "regular"}`,
      rateVersionId: "rate-1",
      rateVersionLabel: "기본 요율",
      categoryCode: "weekday-overtime",
      base: 0,
      overtime: 1.5,
      night: 0
    }),
    businessCategoryCode: "weekday-overtime",
    businessCategoryLabel: "평일 연장",
    summaryCategory: "overtime",
    earlyPayoutDate: input.earlyPayoutDate,
    customerName: input.customerName ?? "SK텔레콤",
    employeeCode: "E-001",
    employeeName: "홍길동",
    department: input.department,
    workDate: "2026-05-02",
    hourlyRate: 15000,
    primaryMinutes: 0,
    primaryMultiplier: 0,
    primaryAmount: 0,
    overtimeMinutes: 60,
    overtimeMultiplier: 1.5,
    overtimeAmount: amount,
    nightMinutes: 0,
    nightMultiplier: 0,
    nightAmount: 0,
    substituteAmount: 0,
    summaryOvertimeAmount: amount,
    holidayAmount: 0,
    totalAllowanceAmount: amount
  };
};

const buildProposalExportRows = (regularSiteCount: number, earlyPayoutSiteCount: number) => [
  ...Array.from({ length: regularSiteCount }, (_, index) =>
    createProposalExportRowForTest({ department: `정규근무지${index + 1}` })
  ),
  ...Array.from({ length: earlyPayoutSiteCount }, (_, index) =>
    createProposalExportRowForTest({
      department: `선지급근무지${index + 1}`,
      earlyPayoutDate: `2026-06-${String(5 + index).padStart(2, "0")}`
    })
  )
];

const writeProposalRowsToTemplate = async (templatePath: string, input: {
  outputPath: string;
  regularSiteCount: number;
  earlyPayoutSiteCount: number;
}) => {
  const rows = buildProposalExportRows(input.regularSiteCount, input.earlyPayoutSiteCount);

  await writeUpdatedProposalWorkbookForTest({
    template: createProposalTemplateStub(templatePath),
    outputPath: input.outputPath,
    workMonth: "2026-05",
    rows,
    regularTotalAllowanceAmount: rows
      .filter((row) => !row.earlyPayoutDate)
      .reduce((sum, row) => sum + row.totalAllowanceAmount, 0),
    earlyPayoutTotalAllowanceAmount: rows
      .filter((row) => Boolean(row.earlyPayoutDate))
      .reduce((sum, row) => sum + row.totalAllowanceAmount, 0)
  });
};

const readWorkbookMerges = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0];

  return {
    worksheet,
    merges: new Set(((worksheet?.model.merges ?? []) as string[]).map(String))
  };
};

const findWorksheetRowContainingText = (worksheet: ExcelJS.Worksheet | undefined, expected: string) => {
  if (!worksheet) {
    return -1;
  }

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    for (let columnNumber = 1; columnNumber <= row.cellCount; columnNumber += 1) {
      if (readCellText(row.getCell(columnNumber).value).includes(expected)) {
        return rowNumber;
      }
    }
  }

  return -1;
};

const findLastWorksheetRowWithValue = (worksheet: ExcelJS.Worksheet | undefined) => {
  if (!worksheet) {
    return -1;
  }

  for (let rowNumber = worksheet.rowCount; rowNumber >= 1; rowNumber -= 1) {
    const row = worksheet.getRow(rowNumber);

    for (let columnNumber = 1; columnNumber <= row.cellCount; columnNumber += 1) {
      if (readCellText(row.getCell(columnNumber).value).trim().length > 0) {
        return rowNumber;
      }
    }
  }

  return -1;
};

const countBorderedCellsInRow = (
  worksheet: ExcelJS.Worksheet | undefined,
  rowNumber: number,
  columnCount: number
) => {
  if (!worksheet || rowNumber < 1) {
    return 0;
  }

  let borderedCellCount = 0;

  for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(columnNumber);
    const hasBorder = ["left", "right", "top", "bottom"].some((side) =>
      Boolean(cell.border?.[side as keyof ExcelJS.Borders]?.style)
    );

    if (hasBorder) {
      borderedCellCount += 1;
    }
  }

  return borderedCellCount;
};

const expectCenteredBorderedCell = (cell: ExcelJS.Cell | undefined) => {
  expect(cell?.alignment).toEqual(
    expect.objectContaining({
      horizontal: "center",
      vertical: "middle"
    })
  );
  expect(cell?.border?.left?.style).toBeTruthy();
  expect(cell?.border?.right?.style).toBeTruthy();
  expect(cell?.border?.top?.style).toBeTruthy();
  expect(cell?.border?.bottom?.style).toBeTruthy();
};

const readCellFillArgb = (worksheet: ExcelJS.Worksheet | undefined, cellAddress: string) => {
  const fill = worksheet?.getCell(cellAddress).fill;

  if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") {
    return "";
  }

  return fill.fgColor?.argb ?? "";
};

const readWorksheetImageBufferLength = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet | undefined
) => {
  const imageId = Number(worksheet?.getImages()[0]?.imageId ?? Number.NaN);

  if (!Number.isFinite(imageId)) {
    return 0;
  }

  const buffer = workbook.model.media?.[imageId]?.buffer as unknown as Uint8Array | undefined;

  return buffer?.byteLength ?? 0;
};

const readWorksheetFirstImageRange = (worksheet: ExcelJS.Worksheet | undefined) => {
  const image = worksheet?.getImages()[0];

  if (!image) {
    return null;
  }

  return {
    startColumn: image.range.tl.nativeCol,
    startColumnOffset: image.range.tl.nativeColOff,
    startRow: image.range.tl.nativeRow,
    startRowOffset: image.range.tl.nativeRowOff,
    endColumn: image.range.br?.nativeCol,
    endColumnOffset: image.range.br?.nativeColOff,
    endRow: image.range.br?.nativeRow,
    endRowOffset: image.range.br?.nativeRowOff
  };
};

const expectCellFontColorBlack = (cell: ExcelJS.Cell | undefined) => {
  expect(cell?.font?.color).toEqual({ argb: "FF000000" });

  const value = cell?.value;

  if (value && typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    value.richText.forEach((item) => {
      expect(item.font?.color).toEqual({ argb: "FF000000" });
    });
  }
};

const expectCellBorderMedium = (cell: ExcelJS.Cell | undefined) => {
  expect(cell?.border?.left?.style).toBe("medium");
  expect(cell?.border?.right?.style).toBe("medium");
  expect(cell?.border?.top?.style).toBe("medium");
  expect(cell?.border?.bottom?.style).toBe("medium");
};

const columnLabelToNumber = (columnLabel: string) =>
  columnLabel
    .toUpperCase()
    .split("")
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);

const parseCellAddress = (address: string) => {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);

  if (!match) {
    return null;
  }

  return {
    column: columnLabelToNumber(match[1]),
    row: Number(match[2])
  };
};

const readRelativeMerges = (
  worksheet: ExcelJS.Worksheet | undefined,
  input: {
    columnCount: number;
    endRow: number;
    startRow: number;
  }
) => {
  if (!worksheet) {
    return [];
  }

  const relativeMerges: string[] = [];

  ((worksheet.model.merges ?? []) as string[]).forEach((rangeText) => {
    const [startAddress, endAddress] = rangeText.split(":");
    const start = parseCellAddress(startAddress);
    const end = parseCellAddress(endAddress ?? startAddress);

    if (
      !start ||
      !end ||
      start.row < input.startRow ||
      end.row > input.endRow ||
      start.column < 1 ||
      end.column > input.columnCount
    ) {
      return;
    }

    relativeMerges.push(`${start.row - input.startRow}:${start.column}:${end.row - input.startRow}:${end.column}`);
  });

  return relativeMerges.sort();
};

const collectMergeSlaveKeys = (relativeMerges: string[]) => {
  const slaveKeys = new Set<string>();

  relativeMerges.forEach((merge) => {
    const [startRow, startColumn, endRow, endColumn] = merge.split(":").map(Number);

    for (let rowOffset = startRow; rowOffset <= endRow; rowOffset += 1) {
      for (let columnNumber = startColumn; columnNumber <= endColumn; columnNumber += 1) {
        if (rowOffset === startRow && columnNumber === startColumn) {
          continue;
        }

        slaveKeys.add(`${rowOffset}:${columnNumber}`);
      }
    }
  });

  return slaveKeys;
};

const normalizeCellStyle = (cell: ExcelJS.Cell) =>
  JSON.parse(
    JSON.stringify({
      alignment: cell.alignment ?? {},
      border: cell.border ?? {},
      fill: cell.fill ?? {},
      font: cell.font ?? {},
      numFmt: cell.numFmt ?? ""
    })
  );

const expectAttachmentOneStaticGuideToMatchSample = (
  sampleWorksheet: ExcelJS.Worksheet | undefined,
  generatedWorksheet: ExcelJS.Worksheet | undefined
) => {
  expect(sampleWorksheet).toBeDefined();
  expect(generatedWorksheet).toBeDefined();

  if (!sampleWorksheet || !generatedWorksheet) {
    return;
  }

  const sampleStartRow = 24;
  const sampleEndRow = 45;
  const generatedStartRow = findWorksheetRowContainingText(generatedWorksheet, "* Sort");
  const rowCount = sampleEndRow - sampleStartRow + 1;
  const sampleRelativeMerges = readRelativeMerges(sampleWorksheet, {
    columnCount: 19,
    endRow: sampleEndRow,
    startRow: sampleStartRow
  });
  const mergeSlaveKeys = collectMergeSlaveKeys(sampleRelativeMerges);

  expect(generatedStartRow).toBeGreaterThan(0);
  expect(sampleRelativeMerges).toEqual(
    readRelativeMerges(generatedWorksheet, {
      columnCount: 19,
      endRow: generatedStartRow + rowCount - 1,
      startRow: generatedStartRow
    })
  );

  for (let offset = 0; offset < rowCount; offset += 1) {
    const sampleRow = sampleWorksheet.getRow(sampleStartRow + offset);
    const generatedRow = generatedWorksheet.getRow(generatedStartRow + offset);

    expect(generatedRow.height).toBe(sampleRow.height);

    for (let columnNumber = 1; columnNumber <= 19; columnNumber += 1) {
      const sampleCell = sampleRow.getCell(columnNumber);
      const generatedCell = generatedRow.getCell(columnNumber);

      if (mergeSlaveKeys.has(`${offset}:${columnNumber}`)) {
        continue;
      }

      expect(generatedCell.value).toEqual(sampleCell.value);
      expect(normalizeCellStyle(generatedCell)).toEqual(normalizeCellStyle(sampleCell));
    }
  }
};

describe("allowance-document-export-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should resolve standard monthly output paths for pdf exports", () => {
    const outputRoot = path.resolve(testRoot, "pdf-root");

    expect(
      resolveAllowanceDocumentOutputTarget({
        baseDir: outputRoot,
        workMonth: "2026-03",
        documentKind: "attachment2",
        outputFormat: "pdf"
      })
    ).toMatchObject({
      directoryPath: path.resolve(outputRoot, "2026년", "03월"),
      fileName: "2026_03_별첨2.pdf",
      outputPath: path.resolve(outputRoot, "2026년", "03월", "2026_03_별첨2.pdf")
    });
  });

  it("should release merged cell masters even when worksheet model merge references are stale", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("품의서");

    worksheet.mergeCells("A1:B1");
    (worksheet.model as { merges?: string[] }).merges = [];

    expect(worksheet.getCell("B1").isMerged).toBe(true);

    expect(() =>
      unmergeCellsInRangeForTest(worksheet, {
        startRow: 1,
        endRow: 1,
        startColumn: 2,
        endColumn: 3
      })
    ).not.toThrow();
    expect(() => worksheet.mergeCells("B1:C1")).not.toThrow();
    expect(new Set(((worksheet.model.merges ?? []) as string[]).map(String)).has("B1:C1")).toBe(true);
  });

  it("realigns the merge registry with the post-splice cell layout", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("품의서");

    // Compact April-template shape: 2-row header band + a single-row total band.
    worksheet.mergeCells("B25:D26");
    worksheet.mergeCells("B28:D28");
    worksheet.getCell("B25").value = "단위 사업 조직";

    // Two inserted regular-detail rows shift both bands down by 2, but ExcelJS keeps
    // its merge registry at the old coordinates.
    worksheet.spliceRows(22, 0, [], []);
    worksheet.getCell("D28").border = { top: { style: "thin" } };

    realignWorksheetMergesToCellsForTest(worksheet);

    const merges = new Set(((worksheet.model.merges ?? []) as string[]).map(String));

    expect(merges.has("B27:D28")).toBe(true);
    expect(merges.has("B30:D30")).toBe(true);
    expect(merges.has("B25:D26")).toBe(false);
    expect(readCellText(worksheet.getCell("B27").value)).toBe("단위 사업 조직");
    // mergeCellsWithoutStyle must not reset slave styles while rebuilding the registry.
    expect(worksheet.getCell("D28").border?.top?.style).toBe("thin");

    // The exact 2026-05 incident sequence: release the header band, then re-merge it.
    unmergeCellsInRangeForTest(worksheet, {
      startRow: 26,
      endRow: 28,
      startColumn: 2,
      endColumn: 8
    });
    expect(() => worksheet.mergeCells("B27:D28")).not.toThrow();
  });

  it("reproduces the 2026-05 incident: 3 regular sites on the compact April template", async () => {
    mkdirSync(testRoot, { recursive: true });
    const outputPath = path.resolve(testRoot, "proposal-incident-2026-05.xlsx");

    await writeProposalRowsToTemplate(
      path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx"),
      { outputPath, regularSiteCount: 3, earlyPayoutSiteCount: 1 }
    );

    const { worksheet, merges } = await readWorkbookMerges(outputPath);

    // Regular total lands on row 24, early-payout title on 26, header band on 27-28.
    expect(merges.has("B24:D24")).toBe(true);
    expect(merges.has("B27:D28")).toBe(true);
    expect(merges.has("E27:G27")).toBe(true);
    expect(merges.has("H27:H28")).toBe(true);
    expect(readCellText(worksheet?.getCell("B26").value)).toContain("퇴사자 조기 지급");
    expect(readCellText(worksheet?.getCell("B27").value)).toBe("단위 사업 조직");
    expect(readCellText(worksheet?.getCell("B32").value)).toBe("총 합계");
    expect(merges.has("B32:G32")).toBe(true);
  });

  it("exports the compact template for any combination of site counts", async () => {
    mkdirSync(testRoot, { recursive: true });
    const templatePath = path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx");
    const combinations: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [3, 1],
      [3, 3],
      [7, 0],
      [7, 3]
    ];

    for (const [regularSiteCount, earlyPayoutSiteCount] of combinations) {
      const outputPath = path.resolve(
        testRoot,
        `proposal-matrix-${regularSiteCount}-${earlyPayoutSiteCount}.xlsx`
      );

      await writeProposalRowsToTemplate(templatePath, {
        outputPath,
        regularSiteCount,
        earlyPayoutSiteCount
      });

      const { worksheet } = await readWorkbookMerges(outputPath);
      const headerRowNumber = findWorksheetRowContainingText(worksheet, "퇴사자 조기 지급");

      expect(headerRowNumber, `${regularSiteCount}곳/${earlyPayoutSiteCount}곳`).toBeGreaterThan(0);
    }
  }, 30000);

  it("fills a legacy (구형) proposal template with updated content shifted one row down", async () => {
    mkdirSync(testRoot, { recursive: true });
    const templatePath = path.resolve(testRoot, "proposal-legacy-template.xlsx");
    const outputPath = path.resolve(testRoot, "proposal-legacy-output.xlsx");

    const templateWorkbook = new ExcelJS.Workbook();
    const templateWorksheet = templateWorkbook.addWorksheet("품의서");
    templateWorksheet.getCell("A12").value = "제  목  :  (양식)";
    templateWorksheet.getCell("B19").value = "2. 4월 지급 요청 내역";
    await templateWorkbook.xlsx.writeFile(templatePath);

    await writeProposalRowsToTemplate(templatePath, {
      outputPath,
      regularSiteCount: 3,
      earlyPayoutSiteCount: 1
    });

    const { worksheet, merges } = await readWorkbookMerges(outputPath);

    // All fixed anchors shift one row down: title 12, intro 13, section title 19,
    // regular details 22-24, regular total 25, early-payout header band 28-29.
    expect(readCellText(worksheet?.getCell("A12").value)).toContain("제  목");
    expect(readCellText(worksheet?.getCell("A11").value)).toBe("");
    expect(readCellText(worksheet?.getCell("B19").value)).toBe("2. 5월 지급 요청 내역");
    expect(readCellText(worksheet?.getCell("B18").value)).toBe("");
    expect(merges.has("B25:D25")).toBe(true);
    expect(readCellText(worksheet?.getCell("B27").value)).toContain("퇴사자 지급 내역");
    expect(merges.has("B28:D29")).toBe(true);
    expect(readCellText(worksheet?.getCell("B28").value)).toBe("단위 사업 조직");
    expect(merges.has("B31:D31")).toBe(true);
    expect(readCellText(worksheet?.getCell("B33").value)).toContain("4. 지급 요청일");
  });

  it("should explain which document feature caused an Excel merge conflict", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("품의서");

    worksheet.mergeCells("B12:C12");
    worksheet.getCell("B12").value = "SK telecom";

    expect(() =>
      mergeCellsWithContextForTest(worksheet, "B12:C14", {
        documentKind: "품의서 Excel",
        feature: "고객사/단위 사업 조직 요약",
        section: "동일 고객사 연속 행 세로 병합"
      })
    ).toThrowError(
      /Excel 문서 출력 실패: 셀 병합 범위가 겹칩니다\.[\s\S]*기능: 고객사\/단위 사업 조직 요약[\s\S]*처리 구간: 동일 고객사 연속 행 세로 병합[\s\S]*병합하려던 범위: B12:C14[\s\S]*이미 병합된 범위: B12:C12[\s\S]*쉬운 예시: B12:C12가 이미 병합된 상태에서 B12:C14/
    );
  });

  it(
    "should generate proposal, attachment1, and attachment2 files from an approved calculation",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);

      const proposalTemplate = saveStoredDocumentTemplateVersion({
        templateType: "proposal",
        versionLabel: "품의서 커스텀",
        sourcePath: path.resolve(
          process.cwd(),
          "양식샘플",
          "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
        ),
        status: "approved",
        isDefault: true,
        outputFileNamePattern: "결재품의_{workMonth}.xlsx",
        profileSchemaVersion: "2",
        profile: {
          kind: "proposal",
          primarySheetName: "품의서",
          editorSchemaVersion: "2",
          semanticZones: [],
          styleSpec: {
            fillColors: {
              documentTitleCell: "#EAF2FF"
            },
            fontSizes: {
              documentTitleCell: 16
            },
            horizontalAlignments: {
              documentTitleCell: "center"
            }
          },
          fieldMappings: {
            sheetName: "품의서",
            workMonthCell: "C5",
            printedDateCell: "E5",
            ownerDepartmentCell: "B16",
            systemNameCell: "A11",
            documentTitleCell: "A11",
            summaryIntroCell: "C12",
            scopeCell: "B15",
            targetHeadcountCell: "B16",
            sectionTitleCell: "B18",
            dataStartRow: "21"
          }
        }
      });
      const attachment1Template = saveStoredDocumentTemplateVersion({
        templateType: "attachment1",
        versionLabel: "별첨1 커스텀",
        sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_샘플.xlsx"),
        status: "approved",
        isDefault: true,
        outputFileNamePattern: "첨부1_{workMonth}.xlsx",
        profileSchemaVersion: "2",
        profile: {
          kind: "attachment1",
          primarySheetName: "별첨1",
          editorSchemaVersion: "2",
          semanticZones: [],
          styleSpec: {
            fillColors: {
              titleCell: "#F2F7FF"
            },
            fontColors: {
              titleCell: "#1F3F9E"
            }
          },
          fieldMappings: {
            sheetName: "별첨1",
            titleCell: "B2",
            dataStartRow: "8"
          }
        }
      });
      const attachment2Template = saveStoredDocumentTemplateVersion({
        templateType: "attachment2",
        versionLabel: "별첨2 커스텀",
        sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
        status: "approved",
        isDefault: true,
        outputFileNamePattern: "첨부2_{workMonth}.xlsx",
        profileSchemaVersion: "2",
        profile: {
          kind: "attachment2",
          primarySheetName: "별첨2",
          editorSchemaVersion: "2",
          semanticZones: [],
          styleSpec: {
            fillColors: {
              dateRangeCell: "#F2F7FF"
            },
            horizontalAlignments: {
              dateRangeCell: "center"
            },
            mergedRanges: {
              dateRangeCell: "F2:H2"
            }
          },
          fieldMappings: {
            sheetName: "별첨2",
            titleCell: "B2",
            dateRangeCell: "F2",
            dataStartRow: "9"
          }
        }
      });
      const appSettings = getStoredAppSettingsSnapshot({
        userDataPath: fixture.userDataPath
      });
      const proposalRoot = path.resolve(testRoot, "custom-output", "proposal");
      const attachment1Root = path.resolve(testRoot, "custom-output", "attachment1");
      const attachment2Root = path.resolve(testRoot, "custom-output", "attachment2");

      saveStoredAppSettings(
        {
          ...appSettings,
          allowanceProposalExportDir: proposalRoot,
          allowanceAttachment1ExportDir: attachment1Root,
          allowanceAttachment2ExportDir: attachment2Root
        },
        {
          userDataPath: fixture.userDataPath
        }
      );

      const overtimeTarget = detail.entries.find((entry) => entry.section === "overtime");
      const targetSite = listStoredSites({ includeDeleted: true }).find(
        (site) => site.name === overtimeTarget!.siteName
      );
      saveStoredSite({
        id: targetSite?.id,
        siteCode: targetSite?.siteCode ?? "SITE-DOC",
        name: overtimeTarget!.siteName,
        customerName: "SK telecom",
        status: targetSite?.status ?? "active",
        timezone: targetSite?.timezone ?? "Asia/Seoul"
      });
      saveStoredAllowanceRateVersion({
        year: Number(overtimeTarget!.workDate.slice(0, 4)),
        versionLabel: "2026.3-테스트",
        status: "active",
        effectiveFrom: `${overtimeTarget!.workDate.slice(0, 4)}-12-31`,
        items: createCustomRateItems()
      });

      for (const entry of detail.entries) {
        await approvePerformanceFile(
          {
            fileId: detail.id,
            entryId: entry.id
          },
          testAdminSession,
          {
            userDataPath: fixture.userDataPath
          }
        );
      }

      const calculation = await runApprovedAllowanceCalculation({
        entryId: overtimeTarget!.id
      });

      expect(calculation.ok).toBe(true);
      if (!calculation.ok) {
        return;
      }

      const allowanceApproval = await reviewAllowanceCalculations(
        {
          calculationIds: [calculation.data.id],
          decision: "approved"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      if (!allowanceApproval.ok) {
        throw new Error(allowanceApproval.message);
      }

      const exported = await exportAllowanceDocuments(
        {
          calculationIds: [calculation.data.id],
          outputFormat: "xlsx"
        },
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(exported.ok).toBe(true);
      if (!exported.ok) {
        return;
      }

      expect(existsSync(exported.data.proposalPath)).toBe(true);
      expect(existsSync(exported.data.attachment1Path)).toBe(true);
      expect(existsSync(exported.data.attachment2Path)).toBe(true);
      expect(exported.data.proposalPath).toBe(
        path.resolve(proposalRoot, "2026년", "03월", "2026_03_품의서.xlsx")
      );
      expect(exported.data.attachment1Path).toBe(
        path.resolve(attachment1Root, "2026년", "03월", "2026_03_별첨1.xlsx")
      );
      expect(exported.data.attachment2Path).toBe(
        path.resolve(attachment2Root, "2026년", "03월", "2026_03_별첨2.xlsx")
      );
      expect(exported.data.workMonth).toBe("2026-03");
      expect(exported.data.outputFormat).toBe("xlsx");
      expect(listStoredAllowanceDocumentExports()).toHaveLength(1);
      expect(exported.data.proposalTemplateVersionId).toBe(proposalTemplate.id);
      expect(exported.data.attachment1TemplateVersionId).toBe(attachment1Template.id);
      expect(exported.data.attachment2TemplateVersionId).toBe(attachment2Template.id);
      const expectedBrandLogoLength = readFileSync(
        path.resolve(process.cwd(), "src", "renderer", "assets", "brand-logo-clean.png")
      ).length;

      const attachment1Workbook = new ExcelJS.Workbook();
      await attachment1Workbook.xlsx.readFile(exported.data.attachment1Path);
      const attachment1Worksheet = attachment1Workbook.getWorksheet("별첨1");

      expect(String(attachment1Worksheet?.getCell("B2").value ?? "")).toContain("2026년 3월");
      expect(String(attachment1Worksheet?.getCell("B2").value ?? "")).toContain("DT사업1팀");
      expect(String(attachment1Worksheet?.getCell("B8").value ?? "")).toBeTruthy();
      expect(String(attachment1Worksheet?.getCell("C8").value ?? "")).toBeTruthy();
      expect(String(attachment1Worksheet?.getCell("D8").value ?? "")).toBe("사원");
      expect(String(attachment1Worksheet?.getCell("F8").value ?? "")).toBe("연장근무");
      expect(String(attachment1Worksheet?.getCell("K8").value ?? "")).toBe("");
      expect(Number(attachment1Worksheet?.getCell("N8").value ?? 0)).toBeGreaterThan(0);
      expect(typeof attachment1Worksheet?.getCell("R8").value).toBe("number");
      expect(attachment1Worksheet?.getCell("R8").numFmt?.replaceAll('"', "")).toBe("#,##0.00원");
      expect(Number(attachment1Worksheet?.getCell("S8").value ?? 0)).toBe(
        calculation.data.snapshot.totalAllowanceAmount
      );
      expect(String(attachment1Worksheet?.getCell("C9").value ?? "")).toBe("소   계");
      expect(String(attachment1Worksheet?.getCell("F9").value ?? "")).toBe("-");
      expect(hasWorksheetText(attachment1Worksheet, "1. 법정공휴일")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "적용 요율: 2026.3-테스트")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "적용 배수: 기본 x1.9 / 연장 x2.4 / 야간 x2.8")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "계산식 1: 기본수당 = 시급 x 기본시간 x1.9")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "계산식 2: 연장수당 = 시급 x 연장시간 x2.4")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "계산식 3: 야간수당 = 시급 x 야간시간 x2.8")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "법정공휴일")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "평_대체근로수당")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "휴_대체근로수당")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "평_연장근로수당")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "휴_연장근로수당")).toBe(true);
      const firstGuideRow = findWorksheetRowContainingText(attachment1Worksheet, "1. 법정공휴일");
      const firstGuideRateRow = findWorksheetRowContainingText(attachment1Worksheet, "적용 요율:");
      const firstGuideAppliedValueRow = findWorksheetRowContainingText(attachment1Worksheet, "적용 배수:");
      const firstGuideFormulaOneRow = findWorksheetRowContainingText(
        attachment1Worksheet,
        "계산식 1: 기본수당 = 시급 x 기본시간 x1.9"
      );
      const firstGuideFormulaThreeRow = findWorksheetRowContainingText(
        attachment1Worksheet,
        "계산식 3: 야간수당 = 시급 x 야간시간 x2.8"
      );
      const secondGuideRow = findWorksheetRowContainingText(attachment1Worksheet, "2. 평_대체근로수당");
      expect(firstGuideRow).toBeGreaterThan(0);
      expect(firstGuideRateRow).toBe(firstGuideRow + 2);
      expect(firstGuideAppliedValueRow).toBe(firstGuideRow + 3);
      expect(firstGuideFormulaOneRow).toBe(firstGuideRow + 4);
      expect(firstGuideFormulaThreeRow).toBe(firstGuideRow + 6);
      expect(secondGuideRow).toBe(firstGuideRow + 8);
      const attachment1LastContentRow = findLastWorksheetRowWithValue(attachment1Worksheet);
      const attachment1Merges = new Set(
        ((attachment1Worksheet?.model.merges ?? []) as string[]).map(String)
      );
      expect(attachment1LastContentRow).toBeGreaterThan(0);
      expect(String(attachment1Worksheet?.getCell("C10").value ?? "")).toBe("합   계");
      expect(readCellFillArgb(attachment1Worksheet, "A9")).toBe("FFD0D0D0");
      expect(readCellFillArgb(attachment1Worksheet, "A10")).toBe("FFA6A6A6");
      expect(readCellFillArgb(attachment1Worksheet, `A${firstGuideRow}`)).toBe("FFD0D0D0");
      expect(readCellFillArgb(attachment1Worksheet, `A${firstGuideRateRow}`)).toBe("FFF4F4F4");
      expect(readCellFillArgb(attachment1Worksheet, `A${firstGuideFormulaOneRow}`)).toBe("FFE8EEF9");
      expect(countBorderedCellsInRow(attachment1Worksheet, secondGuideRow - 1, 19)).toBe(0);
      expect(countBorderedCellsInRow(attachment1Worksheet, attachment1LastContentRow + 1, 19)).toBe(0);
      expect(countBorderedCellsInRow(attachment1Worksheet, attachment1Worksheet!.rowCount, 19)).toBe(0);
      expect(attachment1Merges.has("A130:J130")).toBe(false);
      expect(attachment1Merges.has("A131:J131")).toBe(false);
      expect(readWorksheetImageBufferLength(attachment1Workbook, attachment1Worksheet)).toBe(
        expectedBrandLogoLength
      );

      const proposalWorkbook = new ExcelJS.Workbook();
      await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
      const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");

      const proposalPrintedDate = String(proposalWorksheet?.getCell("E5").value ?? "");
      expect(String(proposalWorksheet?.getCell("C5").value ?? "")).toBe(
        proposalPrintedDate.split(".").slice(0, 2).join("-")
      );
      expect(String(proposalWorksheet?.getCell("A3").value ?? "")).toBe("☑ 품의");
      expect(String(proposalWorksheet?.getCell("C3").value ?? "")).toBe("☐ 보고");
      expect(readWorksheetFirstImageRange(proposalWorksheet)).toEqual({
        startColumn: 0,
        startColumnOffset: 0,
        startRow: 0,
        startRowOffset: 0,
        endColumn: 3,
        endColumnOffset: 0,
        endRow: 1,
        endRowOffset: 0
      });
      expectCellFontColorBlack(proposalWorksheet?.getCell("A7"));
      expectCellFontColorBlack(proposalWorksheet?.getCell("C7"));
      expect(String(proposalWorksheet?.getCell("B14").value ?? "")).toContain("1. 대상 기준 및 대상자");
      expect(String(proposalWorksheet?.getCell("B18").value ?? "")).toContain("3월 지급 요청 내역");
      expect(String(proposalWorksheet?.getCell("B21").value ?? "")).toBe("SK telecom");
      expect(String(proposalWorksheet?.getCell("D21").value ?? "")).toBe(overtimeTarget!.siteName);
      expectCenteredBorderedCell(proposalWorksheet?.getCell("B21"));
      expectCenteredBorderedCell(proposalWorksheet?.getCell("D21"));
      expect(Number(proposalWorksheet?.getCell("H22").value ?? 0)).toBe(
        calculation.data.snapshot.totalAllowanceAmount
      );
      expect(proposalWorksheet?.getCell("A11").fill).toEqual(
        expect.objectContaining({
          type: "pattern",
          pattern: "solid",
          fgColor: expect.objectContaining({ argb: "FFEAF2FF" })
        })
      );
      expect(proposalWorksheet?.getCell("A11").font).toEqual(
        expect.objectContaining({
          size: 16
        })
      );
      expect(proposalWorksheet?.getCell("A11").alignment).toEqual(
        expect.objectContaining({
          horizontal: "center"
        })
      );
      expect(readWorksheetImageBufferLength(proposalWorkbook, proposalWorksheet)).toBe(
        expectedBrandLogoLength
      );

      const attachment2Workbook = new ExcelJS.Workbook();
      await attachment2Workbook.xlsx.readFile(exported.data.attachment2Path);
      const attachment2Worksheet = attachment2Workbook.getWorksheet("별첨2");

      expect(String(attachment2Worksheet?.getCell("B2").value ?? "")).toContain("202603");
      expect(String(attachment2Worksheet?.getCell("B2").value ?? "")).toContain("DT사업1팀");
      expect(String(attachment2Worksheet?.getCell("F2").value ?? "")).toContain("2026.3.1");
      expect(attachment2Worksheet?.getCell("F2").fill).toEqual(
        expect.objectContaining({
          type: "pattern",
          pattern: "solid",
          fgColor: expect.objectContaining({ argb: "FFF2F7FF" })
        })
      );
      expect(attachment2Worksheet?.getCell("F2").alignment).toEqual(
        expect.objectContaining({
          horizontal: "center"
        })
      );
      expect(new Set(((attachment2Worksheet?.model.merges ?? []) as string[]).map(String)).has("F2:H2")).toBe(true);
      expect(String(attachment2Worksheet?.getCell("B9").value ?? "")).toBeTruthy();
      const attachment2LastContentRow = findLastWorksheetRowWithValue(attachment2Worksheet);
      const attachment2Merges = new Set(
        ((attachment2Worksheet?.model.merges ?? []) as string[]).map(String)
      );
      expect(attachment2LastContentRow).toBeGreaterThan(0);
      expect(readCellFillArgb(attachment2Worksheet, "A10")).toBe("FFD0D0D0");
      expect(readCellFillArgb(attachment2Worksheet, "A11")).toBe("FFA6A6A6");
      expect(countBorderedCellsInRow(attachment2Worksheet, attachment2LastContentRow + 1, 7)).toBe(0);
      expect(countBorderedCellsInRow(attachment2Worksheet, attachment2Worksheet!.rowCount, 7)).toBe(0);
      expect(attachment2Merges.has("A13:C13")).toBe(false);
      expect(attachment2Merges.has("A86:C86")).toBe(false);
      expect(readWorksheetImageBufferLength(attachment2Workbook, attachment2Worksheet)).toBe(
        expectedBrandLogoLength
      );
    },
    exportDocumentTestTimeoutMs
  );

  it(
    "should keep customer name in proposal when the template file name is customized",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);
      const customProposalTemplatePath = path.resolve(
        testRoot,
        "proposal-template-custom-name.xlsx"
      );

      mkdirSync(path.dirname(customProposalTemplatePath), { recursive: true });
      copyFileSync(
        path.resolve(
          process.cwd(),
          "양식샘플",
          "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
        ),
        customProposalTemplatePath
      );

      saveStoredDocumentTemplateVersion({
        templateType: "proposal",
        versionLabel: "품의서 커스텀 파일명",
        sourcePath: customProposalTemplatePath,
        status: "approved",
        isDefault: true,
        outputFileNamePattern: "결재품의_{workMonth}.xlsx",
        profileSchemaVersion: "2",
        profile: {
          kind: "proposal",
          primarySheetName: "품의서",
          editorSchemaVersion: "2",
          semanticZones: [],
          styleSpec: {
            fillColors: {
              documentTitleCell: "#EAF2FF"
            },
            fontSizes: {
              documentTitleCell: 16
            },
            horizontalAlignments: {
              documentTitleCell: "center"
            }
          },
          fieldMappings: {
            sheetName: "품의서",
            workMonthCell: "C5",
            printedDateCell: "E5",
            ownerDepartmentCell: "B16",
            systemNameCell: "A11",
            documentTitleCell: "A11",
            summaryIntroCell: "C12",
            scopeCell: "B15",
            targetHeadcountCell: "B16",
            sectionTitleCell: "B18",
            dataStartRow: "21"
          }
        }
      });

      const overtimeTarget = detail.entries.find((entry) => entry.section === "overtime");
      const targetSite = listStoredSites({ includeDeleted: true }).find(
        (site) => site.name === overtimeTarget!.siteName
      );
      saveStoredSite({
        id: targetSite?.id,
        siteCode: targetSite?.siteCode ?? "SITE-DOC",
        name: overtimeTarget!.siteName,
        customerName: "SK telecom",
        status: targetSite?.status ?? "active",
        timezone: targetSite?.timezone ?? "Asia/Seoul"
      });
      saveStoredAllowanceRateVersion({
        year: Number(overtimeTarget!.workDate.slice(0, 4)),
        versionLabel: "2026.3-테스트",
        status: "active",
        effectiveFrom: `${overtimeTarget!.workDate.slice(0, 4)}-12-31`,
        items: createCustomRateItems()
      });

      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: overtimeTarget!.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      const calculation = await runApprovedAllowanceCalculation({
        entryId: overtimeTarget!.id
      });

      expect(calculation.ok).toBe(true);
      if (!calculation.ok) {
        return;
      }

      const allowanceApproval = await reviewAllowanceCalculations(
        {
          calculationIds: [calculation.data.id],
          decision: "approved"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      if (!allowanceApproval.ok) {
        throw new Error(allowanceApproval.message);
      }

      const exported = await exportAllowanceDocuments(
        {
          calculationIds: [calculation.data.id],
          outputFormat: "xlsx"
        },
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(exported.ok).toBe(true);
      if (!exported.ok) {
        return;
      }

      const proposalWorkbook = new ExcelJS.Workbook();
      await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
      const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");
      const summaryRowNumber = findWorksheetRowContainingText(proposalWorksheet, "SK telecom");

      expect(summaryRowNumber).toBeGreaterThan(0);
      expect(String(proposalWorksheet?.getCell(`D${summaryRowNumber}`).value ?? "")).toBe(
        overtimeTarget!.siteName
      );
    },
    exportDocumentTestTimeoutMs
  );

  it(
    "should resolve customer name when the stored site name differs only by spacing",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);
      const overtimeTarget = detail.entries.find((entry) => entry.section === "overtime");
      const targetSite = listStoredSites({ includeDeleted: true }).find(
        (site) => site.name === overtimeTarget!.siteName
      );

      saveStoredSite({
        id: targetSite?.id,
        siteCode: targetSite?.siteCode ?? "SITE-DOC",
        name: overtimeTarget!.siteName.replace("NOC", " NOC"),
        customerName: "SK telecom",
        status: targetSite?.status ?? "active",
        timezone: targetSite?.timezone ?? "Asia/Seoul"
      });
      saveStoredAllowanceRateVersion({
        year: Number(overtimeTarget!.workDate.slice(0, 4)),
        versionLabel: "2026.3-테스트",
        status: "active",
        effectiveFrom: `${overtimeTarget!.workDate.slice(0, 4)}-12-31`,
        items: createCustomRateItems()
      });

      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: overtimeTarget!.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      const calculation = await runApprovedAllowanceCalculation({
        entryId: overtimeTarget!.id
      });

      expect(calculation.ok).toBe(true);
      if (!calculation.ok) {
        return;
      }

      const allowanceApproval = await reviewAllowanceCalculations(
        {
          calculationIds: [calculation.data.id],
          decision: "approved"
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );

      if (!allowanceApproval.ok) {
        throw new Error(allowanceApproval.message);
      }

      const exported = await exportAllowanceDocuments(
        {
          calculationIds: [calculation.data.id],
          outputFormat: "xlsx"
        },
        {
          userDataPath: fixture.userDataPath
        }
      );

      expect(exported.ok).toBe(true);
      if (!exported.ok) {
        return;
      }

      const proposalWorkbook = new ExcelJS.Workbook();
      await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
      const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");
      const summaryRowNumber = findWorksheetRowContainingText(proposalWorksheet, "SK telecom");

      expect(summaryRowNumber).toBeGreaterThan(0);
      expect(String(proposalWorksheet?.getCell(`D${summaryRowNumber}`).value ?? "")).toBe(
        overtimeTarget!.siteName
      );
    },
    exportDocumentTestTimeoutMs
  );

  it("should rebuild attachment1 rate guide from inline calculation history when no stored version exists", () => {
    const inlineHistory = [
      createSyntheticCalculationResult({
        id: "calc-1",
        rateVersionId: "access-performance-inline-2024",
        rateVersionLabel: "Access 실적 이관 2024",
        categoryCode: "legal-holiday",
        base: 1.5,
        overtime: 1.5,
        night: 1.5
      }),
      createSyntheticCalculationResult({
        id: "calc-2",
        rateVersionId: "access-performance-inline-2024",
        rateVersionLabel: "Access 실적 이관 2024",
        categoryCode: "weekday-substitute",
        base: 1.5,
        overtime: 2,
        night: 2.5
      }),
      createSyntheticCalculationResult({
        id: "calc-3",
        rateVersionId: "access-performance-inline-2024",
        rateVersionLabel: "Access 실적 이관 2024",
        categoryCode: "holiday-substitute",
        base: 1.5,
        overtime: 2,
        night: 2.5
      }),
      createSyntheticCalculationResult({
        id: "calc-4",
        rateVersionId: "access-performance-inline-2024",
        rateVersionLabel: "Access 실적 이관 2024",
        categoryCode: "weekday-overtime",
        base: 0,
        overtime: 1.5,
        night: 2
      }),
      createSyntheticCalculationResult({
        id: "calc-5",
        rateVersionId: "access-performance-inline-2024",
        rateVersionLabel: "Access 실적 이관 2024",
        categoryCode: "holiday-overtime",
        base: 0,
        overtime: 0,
        night: 0
      })
    ];

    const entries = buildAllowanceRateGuideEntriesForTest({
      results: [inlineHistory[0]!],
      historyResults: inlineHistory,
      knownVersions: []
    });

    const legalHolidayEntry = entries.find((entry) => entry.categoryCode === "legal-holiday");
    const weekdayOvertimeEntry = entries.find((entry) => entry.categoryCode === "weekday-overtime");

    expect(entries).toHaveLength(5);
    expect(legalHolidayEntry?.lines.map((line) => line.text)).not.toContain(
      "적용 요율: Access 실적 이관 2024"
    );
    expect(legalHolidayEntry?.lines.map((line) => line.text)).toContain(
      "적용 배수: 기본 x1.5 / 연장 x1.5 / 야간 x1.5"
    );
    expect(weekdayOvertimeEntry?.lines.map((line) => line.text)).toContain(
      "적용 배수: 기본 x0 / 연장 x1.5 / 야간 x2"
    );
    expect(entries.flatMap((entry) => entry.lines.map((line) => line.text)).join("\n")).not.toContain(
      "찾지 못했습니다"
    );
  });

  it("should keep the compact attachment1 early payout block when no early payout rows exist", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    saveStoredDocumentTemplateVersion({
      templateType: "proposal",
      versionLabel: "품의서 2026-04",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "결재품의_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment1",
      versionLabel: "별첨1 2026-04",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부1_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment2",
      versionLabel: "별첨2 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부2_{workMonth}.xlsx"
    });

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const calculations: AllowanceCalculationResultRecord[] = [];
    for (const entry of detail.entries) {
      const calculated = await runApprovedAllowanceCalculation({ entryId: entry.id });
      expect(calculated.ok).toBe(true);
      if (!calculated.ok) {
        return;
      }
      calculations.push(calculated.data);
    }

    const allowanceApproval = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((item) => item.id),
        decision: "approved"
      },
      testAdminSession
    );

    expect(allowanceApproval.ok).toBe(true);
    if (!allowanceApproval.ok) {
      return;
    }

    const exported = await exportAllowanceDocuments(
      {
        calculationIds: calculations.map((item) => item.id),
        outputFormat: "xlsx"
      },
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      return;
    }

    const attachment1Workbook = new ExcelJS.Workbook();
    await attachment1Workbook.xlsx.readFile(exported.data.attachment1Path);
    const attachment1Worksheet = attachment1Workbook.getWorksheet("별첨1");
    const sampleAttachment1Workbook = new ExcelJS.Workbook();
    await sampleAttachment1Workbook.xlsx.readFile(path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"));
    const sampleAttachment1Worksheet = sampleAttachment1Workbook.getWorksheet("별첨1");
    const earlyPayoutTitleRowNumber = findWorksheetRowContainingText(
      attachment1Worksheet,
      "퇴사자 조기 지급 내역"
    );

    expect(attachment1Workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(["별첨1"]);
    expect(earlyPayoutTitleRowNumber).toBeGreaterThan(0);
    expect(String(attachment1Worksheet?.getCell(`C${earlyPayoutTitleRowNumber + 4}`).value ?? "")).toBe(
      "해당 없음"
    );
    ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S"].forEach((column) => {
      expect(attachment1Worksheet?.getCell(`${column}${earlyPayoutTitleRowNumber + 4}`).value).toBeNull();
    });
    expect(hasWorksheetText(attachment1Worksheet, "* Sort")).toBe(true);
    expect(hasWorksheetText(attachment1Worksheet, "휴일근로수당 = (공)휴일근로시간 x 1.5 x 통상시급")).toBe(
      true
    );
    expect(hasWorksheetText(attachment1Worksheet, "적용 요율:")).toBe(false);
    expectAttachmentOneStaticGuideToMatchSample(sampleAttachment1Worksheet, attachment1Worksheet);
  }, exportDocumentTestTimeoutMs);

  it("should separate early payout rows into proposal section 3 and exclude them from section 2 totals", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    saveStoredDocumentTemplateVersion({
      templateType: "proposal",
      versionLabel: "품의서 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "결재품의_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment1",
      versionLabel: "별첨1 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부1_{workMonth}.xlsx",
      profileSchemaVersion: "2",
      profile: {
        kind: "attachment1",
        primarySheetName: "별첨1",
        editorSchemaVersion: "2",
        semanticZones: [],
        styleSpec: {},
        fieldMappings: {
          sheetName: "별첨1",
          titleCell: "B2",
          dataStartRow: "8"
        }
      }
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment2",
      versionLabel: "별첨2 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부2_{workMonth}.xlsx",
      profileSchemaVersion: "2",
      profile: {
        kind: "attachment2",
        primarySheetName: "별첨2",
        editorSchemaVersion: "2",
        semanticZones: [],
        styleSpec: {},
        fieldMappings: {
          sheetName: "별첨2",
          titleCell: "B2",
          dateRangeCell: "F2",
          dataStartRow: "9"
        }
      }
    });

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const calculations: AllowanceCalculationResultRecord[] = [];
    for (const entry of detail.entries) {
      const calculated = await runApprovedAllowanceCalculation({ entryId: entry.id });
      expect(calculated.ok).toBe(true);
      if (!calculated.ok) {
        return;
      }
      calculations.push(calculated.data);
    }

    const earlyPayoutTarget = calculations[0];
    const targetSite = listStoredSites({ includeDeleted: true }).find(
      (site) => site.name === earlyPayoutTarget.siteName
    );
    saveStoredSite({
      id: targetSite?.id,
      siteCode: targetSite?.siteCode ?? "SITE-DOC",
      name: earlyPayoutTarget.siteName,
      customerName: "SK telecom",
      status: targetSite?.status ?? "active",
      timezone: targetSite?.timezone ?? "Asia/Seoul"
    });
    const updateResult = setAllowanceCalculationEarlyPayout({
      calculationId: earlyPayoutTarget.id,
      earlyPayoutDate: "2026-04-05"
    });

    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) {
      return;
    }

    const allowanceApproval = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((item) => item.id),
        decision: "approved"
      },
      testAdminSession
    );

    expect(allowanceApproval.ok).toBe(true);
    if (!allowanceApproval.ok) {
      return;
    }

    const exported = await exportAllowanceDocuments(
      {
        calculationIds: calculations.map((item) => item.id),
        outputFormat: "xlsx"
      },
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      return;
    }

    const proposalWorkbook = new ExcelJS.Workbook();
    await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
    const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");

    const nonEarlyTotal = calculations
      .slice(1)
      .reduce((sum, item) => sum + item.snapshot.totalAllowanceAmount, 0);
    const allEmployeeCount = new Set(calculations.map((item) => `${item.employeeCode}:${item.employeeName}`)).size;
    const nonEarlyEmployeeCount = new Set(
      calculations.slice(1).map((item) => `${item.employeeCode}:${item.employeeName}`)
    ).size;

    expect(String(proposalWorksheet?.getCell("A3").value ?? "")).toBe("☑ 품의");
    expect(String(proposalWorksheet?.getCell("C3").value ?? "")).toBe("☐ 보고");
    expect(readWorksheetFirstImageRange(proposalWorksheet)).toEqual({
      startColumn: 0,
      startColumnOffset: 0,
      startRow: 0,
      startRowOffset: 0,
      endColumn: 3,
      endColumnOffset: 0,
      endRow: 1,
      endRowOffset: 0
    });
    expectCellFontColorBlack(proposalWorksheet?.getCell("A7"));
    expectCellFontColorBlack(proposalWorksheet?.getCell("C7"));
    expect(allEmployeeCount).toBeGreaterThan(nonEarlyEmployeeCount);
    expect(String(proposalWorksheet?.getCell("B16").value ?? "")).toContain(`${allEmployeeCount}명`);
    expect(Number(proposalWorksheet?.getCell("H22").value ?? 0)).toBe(nonEarlyTotal);
    expect(String(proposalWorksheet?.getCell("B27").value ?? "")).toBe("SK telecom");
    expect(String(proposalWorksheet?.getCell("D27").value ?? "")).toBe(earlyPayoutTarget.siteName);
    expectCenteredBorderedCell(proposalWorksheet?.getCell("B27"));
    expectCenteredBorderedCell(proposalWorksheet?.getCell("D27"));
    expect(Number(proposalWorksheet?.getCell("H28").value ?? 0)).toBe(
      earlyPayoutTarget.snapshot.totalAllowanceAmount
    );
    const earlyPayoutTitleRowNumber = Array.from(
      { length: proposalWorksheet?.rowCount ?? 0 },
      (_, index) => index + 1
    ).find((rowNumber) =>
      String(proposalWorksheet?.getCell(`B${rowNumber}`).value ?? "").includes("퇴사자 조기 지급 내역")
    );
    const proposalMerges = new Set(((proposalWorksheet?.model.merges ?? []) as string[]).map(String));

    expect(earlyPayoutTitleRowNumber).toBeDefined();
    expect(
      proposalMerges.has(`B${Number(earlyPayoutTitleRowNumber) + 1}:D${Number(earlyPayoutTitleRowNumber) + 2}`)
    ).toBe(true);
    expect(
      proposalMerges.has(`H${Number(earlyPayoutTitleRowNumber) + 1}:H${Number(earlyPayoutTitleRowNumber) + 2}`)
    ).toBe(true);
    expect(String(proposalWorksheet?.getCell(`B${Number(earlyPayoutTitleRowNumber) + 1}`).value ?? "")).toBe(
      "단위 사업 조직"
    );
    expect(String(proposalWorksheet?.getCell(`H${Number(earlyPayoutTitleRowNumber) + 1}`).value ?? "")).toBe("계");
    expect(String(proposalWorksheet?.getCell("B30").value ?? "")).toBe("총 합계");
    expect(Number(proposalWorksheet?.getCell("H30").value ?? 0)).toBe(
      calculations.reduce((sum, item) => sum + item.snapshot.totalAllowanceAmount, 0)
    );
    expectCellFontColorBlack(proposalWorksheet?.getCell("B30"));
    expectCellFontColorBlack(proposalWorksheet?.getCell("H30"));
    ["B", "C", "D", "E", "F", "G", "H"].forEach((column) => {
      expectCellBorderMedium(proposalWorksheet?.getCell(`${column}30`));
    });
    expect(String(proposalWorksheet?.getCell("B32").value ?? "")).toContain("지급 요청일");

    const attachment1Workbook = new ExcelJS.Workbook();
    await attachment1Workbook.xlsx.readFile(exported.data.attachment1Path);
    const attachment1Worksheet = attachment1Workbook.getWorksheet("별첨1");
    const sampleAttachment1Workbook = new ExcelJS.Workbook();
    await sampleAttachment1Workbook.xlsx.readFile(path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"));
    const sampleAttachment1Worksheet = sampleAttachment1Workbook.getWorksheet("별첨1");
    const attachmentEarlyPayoutTitleRowNumber = findWorksheetRowContainingText(
      attachment1Worksheet,
      "퇴사자 조기 지급 내역"
    );

    expect(attachment1Workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(["별첨1"]);
    expect(attachmentEarlyPayoutTitleRowNumber).toBeGreaterThan(0);
    expect(String(attachment1Worksheet?.getCell(`C${attachmentEarlyPayoutTitleRowNumber + 4}`).value ?? "")).toBe(
      earlyPayoutTarget.employeeName
    );
    expect(Number(attachment1Worksheet?.getCell(`S${attachmentEarlyPayoutTitleRowNumber + 4}`).value ?? 0)).toBe(
      earlyPayoutTarget.snapshot.totalAllowanceAmount
    );
    expectAttachmentOneStaticGuideToMatchSample(sampleAttachment1Worksheet, attachment1Worksheet);
  });

  it("should place early payout proposal headers below a spliced regular summary total row", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      for (let index = 0; index < 5; index += 1) {
        const rowNumber = 35 + index;
        worksheet.getCell(`BA${rowNumber}`).value = `2026-03-${String(4 + index).padStart(2, "0")}`;
        worksheet.getCell(`BC${rowNumber}`).value = 20;
        worksheet.getCell(`BD${rowNumber}`).value = 0;
        worksheet.getCell(`BE${rowNumber}`).value = 22;
        worksheet.getCell(`BF${rowNumber}`).value = 0;
        worksheet.getCell(`BG${rowNumber}`).value = fixture.workers.overtime.name;
        worksheet.getCell(`BH${rowNumber}`).value = `추가연장${index + 1}`;
        worksheet.getCell(`BJ${rowNumber}`).value = `추가증적${index + 1}`;
      }
    });

    const detail = await syncPreparedReturnedSchedule(fixture);

    saveStoredDocumentTemplateVersion({
      templateType: "proposal",
      versionLabel: "품의서 2026-04",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "결재품의_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment1",
      versionLabel: "별첨1 2026-04",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부1_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment2",
      versionLabel: "별첨2 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부2_{workMonth}.xlsx"
    });

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const calculations: AllowanceCalculationResultRecord[] = [];
    for (const entry of detail.entries) {
      const calculated = await runApprovedAllowanceCalculation({ entryId: entry.id });
      expect(calculated.ok).toBe(true);
      if (!calculated.ok) {
        return;
      }
      calculations.push(calculated.data);
    }

    expect(calculations).toHaveLength(8);

    const earlyPayoutTarget = calculations[0]!;
    const updateResult = setAllowanceCalculationEarlyPayout({
      calculationId: earlyPayoutTarget.id,
      earlyPayoutDate: "2026-04-05"
    });

    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) {
      return;
    }

    const allowanceApproval = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((item) => item.id),
        decision: "approved"
      },
      testAdminSession
    );

    expect(allowanceApproval.ok).toBe(true);
    if (!allowanceApproval.ok) {
      return;
    }

    const database = getSqliteDatabase()!;
    calculations.slice(1).forEach((calculation, index) => {
      database
        .prepare(
          `
            UPDATE allowance_calculations
            SET site_name = ?
            WHERE id = ?
          `
        )
        .run(`정규근무지${index + 1}`, calculation.id);
    });

    const exported = await exportAllowanceDocuments(
      {
        calculationIds: calculations.map((item) => item.id),
        outputFormat: "xlsx"
      },
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      throw new Error(exported.message);
    }

    const proposalWorkbook = new ExcelJS.Workbook();
    await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
    const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");
    const proposalMerges = new Set(((proposalWorksheet?.model.merges ?? []) as string[]).map(String));
    const earlyPayoutTitleRowNumber = findWorksheetRowContainingText(
      proposalWorksheet,
      "퇴사자 조기 지급 내역"
    );

    expect(earlyPayoutTitleRowNumber).toBe(30);
    expect(proposalMerges.has("B28:D28")).toBe(true);
    expect(proposalMerges.has("B31:D32")).toBe(true);
    expect(proposalMerges.has("B27:D28")).toBe(false);
  }, exportDocumentTestTimeoutMs);

  it("should export without a merge collision when both regular and early-payout summaries overflow the template capacity (spliceRows insert)", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });

    // 12 extra overtime rows → 15 entries total. After grouping this yields
    // 12 regular site summaries (> capacity 11) and 3 early-payout summaries
    // (> capacity 2), so BOTH sections trigger spliceRows row insertion — the
    // exact condition the previous test never exercised (it only removed rows).
    await updateReturnedWorkbook(fixture.filePath, (worksheet) => {
      for (let index = 0; index < 12; index += 1) {
        const rowNumber = 35 + index;
        worksheet.getCell(`BA${rowNumber}`).value = `2026-03-${String(4 + index).padStart(2, "0")}`;
        worksheet.getCell(`BC${rowNumber}`).value = 20;
        worksheet.getCell(`BD${rowNumber}`).value = 0;
        worksheet.getCell(`BE${rowNumber}`).value = 22;
        worksheet.getCell(`BF${rowNumber}`).value = 0;
        worksheet.getCell(`BG${rowNumber}`).value = fixture.workers.overtime.name;
        worksheet.getCell(`BH${rowNumber}`).value = `대량연장${index + 1}`;
        worksheet.getCell(`BJ${rowNumber}`).value = `대량증적${index + 1}`;
      }
    });

    const detail = await syncPreparedReturnedSchedule(fixture);

    saveStoredDocumentTemplateVersion({
      templateType: "proposal",
      versionLabel: "품의서 2026-04",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "결재품의_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment1",
      versionLabel: "별첨1 2026-04",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부1_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
      templateType: "attachment2",
      versionLabel: "별첨2 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부2_{workMonth}.xlsx"
    });

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        { fileId: detail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );
    }

    const calculations: AllowanceCalculationResultRecord[] = [];
    for (const entry of detail.entries) {
      const calculated = await runApprovedAllowanceCalculation({ entryId: entry.id });
      expect(calculated.ok).toBe(true);
      if (!calculated.ok) {
        return;
      }
      calculations.push(calculated.data);
    }

    expect(calculations.length).toBeGreaterThanOrEqual(15);

    for (let index = 0; index < 3; index += 1) {
      const earlyPayoutResult = setAllowanceCalculationEarlyPayout({
        calculationId: calculations[index]!.id,
        earlyPayoutDate: `2026-04-${String(5 + index).padStart(2, "0")}`
      });
      expect(earlyPayoutResult.ok).toBe(true);
      if (!earlyPayoutResult.ok) {
        return;
      }
    }

    const allowanceApproval = await reviewAllowanceCalculations(
      {
        calculationIds: calculations.map((item) => item.id),
        decision: "approved"
      },
      testAdminSession
    );

    expect(allowanceApproval.ok).toBe(true);
    if (!allowanceApproval.ok) {
      return;
    }

    const database = getSqliteDatabase()!;
    calculations.forEach((calculation, index) => {
      const siteName =
        index < 3 ? `선지급근무지${index + 1}` : `정규근무지${index - 2}`;
      database
        .prepare(`UPDATE allowance_calculations SET site_name = ? WHERE id = ?`)
        .run(siteName, calculation.id);
    });

    const exported = await exportAllowanceDocuments(
      {
        calculationIds: calculations.map((item) => item.id),
        outputFormat: "xlsx"
      },
      { userDataPath: fixture.userDataPath }
    );

    // The core assertion: the export must NOT throw "Cannot Merge already merged
    // cells" even though both sections inserted rows via spliceRows.
    expect(exported.ok, exported.ok ? "" : `EXPORT_FAILED: ${exported.message}`).toBe(true);
    if (!exported.ok) {
      throw new Error(exported.message);
    }

    const proposalWorkbook = new ExcelJS.Workbook();
    await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
    const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");
    const proposalMerges = new Set(
      ((proposalWorksheet?.model.merges ?? []) as string[]).map(String)
    );
    const earlyPayoutTitleRowNumber = findWorksheetRowContainingText(
      proposalWorksheet,
      "퇴사자 조기 지급 내역"
    );

    // 12 regular summaries push the regular total to row 33 (21 + 12), so the
    // early-payout title lands at 35 — well below the 30 of the 7-summary case,
    // proving the inserted rows were accounted for without a header/total overlap.
    expect(earlyPayoutTitleRowNumber).toBeGreaterThan(32);
    expect(proposalMerges.has(`B${earlyPayoutTitleRowNumber}:D${earlyPayoutTitleRowNumber}`)).toBe(false);
  }, exportDocumentTestTimeoutMs);
});
