import { existsSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { getAllowanceRateEntryCode } from "../../shared/domain/allowance-rate-matrix";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import {
  buildAllowanceRateGuideEntriesForTest,
  exportAllowanceDocuments
} from "./allowance-document-export-service";
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
        outputFileNamePattern: "결재품의_{workMonth}.xlsx"
      });
      const attachment1Template = saveStoredDocumentTemplateVersion({
        templateType: "attachment1",
        versionLabel: "별첨1 커스텀",
        sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_샘플.xlsx"),
        status: "approved",
        isDefault: true,
        outputFileNamePattern: "첨부1_{workMonth}.xlsx",
        profileSchemaVersion: "1",
        profile: {
          kind: "generic",
          primarySheetName: "별첨1",
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
        profileSchemaVersion: "1",
        profile: {
          kind: "generic",
          primarySheetName: "별첨2",
          fieldMappings: {
            sheetName: "별첨2",
            titleCell: "B2",
            dateRangeCell: "F2",
            dataStartRow: "9"
          }
        }
      });

      const overtimeTarget = detail.entries.find((entry) => entry.section === "overtime");
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

      const attachment1Workbook = new ExcelJS.Workbook();
      await attachment1Workbook.xlsx.readFile(exported.data.attachment1Path);
      const attachment1Worksheet = attachment1Workbook.getWorksheet("별첨1");

      expect(String(attachment1Worksheet?.getCell("B2").value ?? "")).toContain("2026년 3월");
      expect(String(attachment1Worksheet?.getCell("B8").value ?? "")).toBeTruthy();
      expect(String(attachment1Worksheet?.getCell("C8").value ?? "")).toBeTruthy();
      expect(String(attachment1Worksheet?.getCell("F8").value ?? "")).toBe("연장근무");
      expect(String(attachment1Worksheet?.getCell("C9").value ?? "")).toContain("연장근무 소계");
      expect(hasWorksheetText(attachment1Worksheet, "1. 법정공휴일")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "적용 요율: 2026.3-테스트")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "적용 배수: 기본 1.9배 / 연장 2.4배 / 야간 2.8배")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "계산식 1: 기본수당 = 시급 x 기본시간 x 1.9배")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "계산식 2: 연장수당 = 시급 x 연장시간 x 2.4배")).toBe(true);
      expect(hasWorksheetText(attachment1Worksheet, "계산식 3: 야간수당 = 시급 x 야간시간 x 2.8배")).toBe(true);
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
        "계산식 1: 기본수당 = 시급 x 기본시간 x 1.9배"
      );
      const firstGuideFormulaThreeRow = findWorksheetRowContainingText(
        attachment1Worksheet,
        "계산식 3: 야간수당 = 시급 x 야간시간 x 2.8배"
      );
      const secondGuideRow = findWorksheetRowContainingText(attachment1Worksheet, "2. 평_대체근로수당");
      expect(firstGuideRow).toBeGreaterThan(0);
      expect(firstGuideRateRow).toBe(firstGuideRow + 2);
      expect(firstGuideAppliedValueRow).toBe(firstGuideRow + 3);
      expect(firstGuideFormulaOneRow).toBe(firstGuideRow + 4);
      expect(firstGuideFormulaThreeRow).toBe(firstGuideRow + 6);
      expect(secondGuideRow).toBe(firstGuideRow + 10);

      const proposalWorkbook = new ExcelJS.Workbook();
      await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
      const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");

      expect(String(proposalWorksheet?.getCell("C5").value ?? "")).toBe("2026-03");
      expect(String(proposalWorksheet?.getCell("B14").value ?? "")).toContain("1. 대상 기준 및 대상자");
      expect(String(proposalWorksheet?.getCell("B18").value ?? "")).toContain("3월 지급 요청 내역");

      const attachment2Workbook = new ExcelJS.Workbook();
      await attachment2Workbook.xlsx.readFile(exported.data.attachment2Path);
      const attachment2Worksheet = attachment2Workbook.getWorksheet("별첨2");

      expect(String(attachment2Worksheet?.getCell("B2").value ?? "")).toContain("202603");
      expect(String(attachment2Worksheet?.getCell("F2").value ?? "")).toContain("2026.3.1");
      expect(String(attachment2Worksheet?.getCell("B9").value ?? "")).toBeTruthy();
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
      "적용 배수: 기본 1.5배 / 연장 1.5배 / 야간 1.5배"
    );
    expect(weekdayOvertimeEntry?.lines.map((line) => line.text)).toContain(
      "적용 배수: 기본 0배 / 연장 1.5배 / 야간 2배"
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
      profileSchemaVersion: "1",
      profile: {
        kind: "generic",
        primarySheetName: "별첨1",
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
      profileSchemaVersion: "1",
      profile: {
        kind: "generic",
        primarySheetName: "별첨2",
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
    const updateResult = setAllowanceCalculationEarlyPayout({
      calculationId: earlyPayoutTarget.id,
      earlyPayoutDate: "2026-04-05"
    });

    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) {
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

    expect(Number(proposalWorksheet?.getCell("H32").value ?? 0)).toBe(nonEarlyTotal);
    expect(Number(proposalWorksheet?.getCell("H39").value ?? 0)).toBe(
      earlyPayoutTarget.snapshot.totalAllowanceAmount
    );
    expect(String(proposalWorksheet?.getCell("D37").value ?? "")).toBe(earlyPayoutTarget.siteName);
  });
});
