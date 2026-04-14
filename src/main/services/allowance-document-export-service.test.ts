import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { getAllowanceRateEntryCode } from "../../shared/domain/allowance-rate-matrix";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import {
  buildAllowanceRateGuideEntriesForTest,
  exportAllowanceDocuments
} from "./allowance-document-export-service";
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
import { resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "allowance-document-export");
const exportDocumentTestTimeoutMs = 15000;

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

describe("allowance-document-export-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
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
        testAdminSession
      );

      expect(allowanceApproval.ok).toBe(true);
      if (!allowanceApproval.ok) {
        return;
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
      expect(path.basename(exported.data.proposalPath)).toBe("결재품의_2026-03.xlsx");
      expect(path.basename(exported.data.attachment1Path)).toBe("첨부1_2026-03.xlsx");
      expect(path.basename(exported.data.attachment2Path)).toBe("첨부2_2026-03.xlsx");
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
      expect(String(attachment1Worksheet?.getCell("F8").value ?? "")).toBe("연장근무");
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

      expect(String(proposalWorksheet?.getCell("C5").value ?? "")).toBe("2026-03");
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

  it("should separate early payout rows into proposal section 3 and exclude them from section 2 totals", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    saveStoredDocumentTemplateVersion({
      templateType: "proposal",
      versionLabel: "품의서 커스텀",
      sourcePath: path.resolve(
        process.cwd(),
        "양식샘플",
        "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
      ),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "결재품의_{workMonth}.xlsx"
    });
    saveStoredDocumentTemplateVersion({
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
      String(proposalWorksheet?.getCell(`B${rowNumber}`).value ?? "").includes("퇴사자 지급 내역")
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
    expect(String(proposalWorksheet?.getCell("B30").value ?? "")).toContain("지급 요청일");
  });
});
