import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  AllowanceDocumentExportInput,
  BridgeResult
} from "../../shared/bridge/contracts";
import type { AllowanceDocumentExportRecord } from "../../shared/domain/allowance-document";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import type { DocumentTemplateVersion } from "../../shared/domain/model";
import {
  resolveAllowanceRateCategoryLabel,
  resolveAllowanceSummaryCategory,
  type AllowanceRateCategoryCode
} from "../../shared/domain/allowance-rate-matrix";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { listApprovedAllowanceCalculationResults } from "./approved-allowance-calculation-service";
import { saveStoredAllowanceDocumentExport } from "./allowance-document-export-history-service";
import {
  resolveAttachmentOneTemplateFields,
  resolveAttachmentTwoTemplateFields,
  resolveProposalTemplateFields
} from "./document-template-profile-service";
import { resolveDocumentTemplateOutputFileName } from "./document-template-output-file-name-service";
import { resolveStoredDefaultDocumentTemplateVersion } from "./operations-storage-service";
import { getLatestPerformanceApproval } from "./performance-approval-service";
import { parsePerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";

interface ResolvedAllowanceExportRow {
  calculation: AllowanceCalculationResultRecord;
  businessCategoryCode: AllowanceRateCategoryCode;
  businessCategoryLabel: string;
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
  return `${year}년 ${month}월`;
};

const formatDecimalHours = (minutes: number) => {
  const hours = minutes / 60;

  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
};

const formatProposalDateRange = (workMonth: string) => {
  const [yearText, monthText] = workMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  return `${year}.${month}.1 ~ ${month}.${endDate.getUTCDate()}`;
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

const resolveExportRows = (
  results: AllowanceCalculationResultRecord[]
): ResolvedAllowanceExportRow[] =>
  results.map((result) => {
    const approval = getLatestPerformanceApproval(result.fileId);

    if (!approval?.snapshotJson) {
      throw new Error(`${result.fileName} 승인 스냅샷을 찾을 수 없습니다.`);
    }

    const approvalSnapshot = parsePerformanceApprovalSnapshot(approval.snapshotJson);
    const entry = approvalSnapshot?.entries[0];

    if (!approvalSnapshot || !entry) {
      throw new Error(`${result.fileName} 승인 스냅샷 행을 복원할 수 없습니다.`);
    }

    const baseLine = getLineByCode(result, "base");
    const overtimeLine = getLineByCode(result, "overtime");
    const nightLine = getLineByCode(result, "night");
    const primaryLine = baseLine ?? overtimeLine ?? nightLine;
    const businessCategoryCode = resolveBusinessCategoryCode(result);
    const summaryCategory = resolveAllowanceSummaryCategory(businessCategoryCode);

    return {
      calculation: result,
      businessCategoryCode,
      businessCategoryLabel:
        typeof result.snapshot.businessCategoryLabel === "string"
          ? result.snapshot.businessCategoryLabel
          : resolveAllowanceRateCategoryLabel(businessCategoryCode),
      employeeCode: entry.employeeCode,
      employeeName: entry.employeeName,
      department: entry.department ?? "미분류",
      workDate: entry.workDate,
      hourlyRate: entry.hourlyRate ?? 0,
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
  });

const writeProposalWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
  totalAllowanceAmount: number;
}) => {
  const workbook = await readWorkbook(input.template.sourcePath);
  const fields = resolveProposalTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];
  const siteSummaries = [...input.rows.reduce((accumulator, row) => {
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
  }, new Map<string, {
    department: string;
    substituteAmount: number;
    overtimeAmount: number;
    holidayAmount: number;
    totalAmount: number;
  }>()).values()];
  const employeeCount = new Set(input.rows.map((row) => `${row.employeeCode}:${row.employeeName}`)).size;
  const today = formatDate(new Date().toISOString().slice(0, 10));

  worksheet.getCell(fields.workMonthCell).value = input.workMonth;
  worksheet.getCell(fields.printedDateCell).value = today;
  worksheet.getCell(fields.ownerDepartmentCell).value = "교대근무 운영";
  worksheet.getCell(fields.systemNameCell).value = "ShiftMgmt 자동생성";
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
  worksheet.getCell(`H${totalRowNumber}`).value = input.totalAllowanceAmount;

  await workbook.xlsx.writeFile(input.outputPath);
};

const writeAttachmentOneWorkbook = async (input: {
  template: DocumentTemplateVersion;
  outputPath: string;
  workMonth: string;
  rows: ResolvedAllowanceExportRow[];
}) => {
  const workbook = await readWorkbook(input.template.sourcePath);
  const fields = resolveAttachmentOneTemplateFields(input.template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];

  worksheet.getCell(fields.titleCell).value =
    `별첨1. ${formatMonthLabel(input.workMonth)} 교대근무자 시간외근로수당 내역`;
  clearCellRange(worksheet, {
    startRow: fields.dataStartRow,
    endRow: Math.max(worksheet.rowCount, 130),
    startColumn: 1,
    endColumn: 19
  });

  input.rows.forEach((row, index) => {
    const rowNumber = fields.dataStartRow + index;

    worksheet.getCell(`A${rowNumber}`).value = index + 1;
    worksheet.getCell(`B${rowNumber}`).value = row.employeeCode;
    worksheet.getCell(`C${rowNumber}`).value = row.employeeName;
    worksheet.getCell(`D${rowNumber}`).value = "-";
    worksheet.getCell(`E${rowNumber}`).value = row.department;
    worksheet.getCell(`F${rowNumber}`).value = row.businessCategoryLabel;
    worksheet.getCell(`G${rowNumber}`).value = formatDate(row.workDate);
    worksheet.getCell(`H${rowNumber}`).value = Number(formatDecimalHours(row.calculation.snapshot.breakdown.totalWorkMinutes));
    worksheet.getCell(`I${rowNumber}`).value = toNullableCellValue(row.primaryMinutes > 0 ? Number(formatDecimalHours(row.primaryMinutes)) : 0);
    worksheet.getCell(`J${rowNumber}`).value = toNullableCellValue(row.primaryMultiplier);
    worksheet.getCell(`K${rowNumber}`).value = toNullableCellValue(row.primaryAmount);
    worksheet.getCell(`L${rowNumber}`).value = toNullableCellValue(row.overtimeMinutes > 0 ? Number(formatDecimalHours(row.overtimeMinutes)) : 0);
    worksheet.getCell(`M${rowNumber}`).value = toNullableCellValue(row.overtimeMultiplier);
    worksheet.getCell(`N${rowNumber}`).value = toNullableCellValue(row.overtimeAmount);
    worksheet.getCell(`O${rowNumber}`).value = toNullableCellValue(row.nightMinutes > 0 ? Number(formatDecimalHours(row.nightMinutes)) : 0);
    worksheet.getCell(`P${rowNumber}`).value = toNullableCellValue(row.nightMultiplier);
    worksheet.getCell(`Q${rowNumber}`).value = toNullableCellValue(row.nightAmount);
    worksheet.getCell(`R${rowNumber}`).value = toNullableCellValue(row.hourlyRate);
    worksheet.getCell(`S${rowNumber}`).value = row.calculation.snapshot.totalAllowanceAmount;
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

const resolveExportResults = (input: AllowanceDocumentExportInput) => {
  if (input.calculationIds.length === 0) {
    throw new Error("문서로 출력할 수당 계산 결과가 없습니다.");
  }

  const calculationIdSet = new Set(input.calculationIds);
  const results = listApprovedAllowanceCalculationResults().filter((item) =>
    calculationIdSet.has(item.id)
  );

  if (results.length !== calculationIdSet.size) {
    throw new Error("일부 수당 계산 결과를 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
  }

  const workMonths = [...new Set(results.map((item) => item.workDate.slice(0, 7)))];

  if (workMonths.length !== 1) {
    throw new Error("품의 신청은 동일한 계산월 결과만 함께 출력할 수 있습니다. 계산월 필터를 먼저 맞춰 주세요.");
  }

  return {
    workMonth: workMonths[0] as string,
    results
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
    const { workMonth, results } = resolveExportResults(input);
    const exportRows = resolveExportRows(results).sort(
      (left, right) => left.workDate.localeCompare(right.workDate) || left.employeeName.localeCompare(right.employeeName)
    );
    const settings = getStoredAppSettingsSnapshot(context);
    const outputDir = path.resolve(settings.scheduleExportDir, "allowance-documents", sanitizeFileSegment(workMonth));
    const proposalTemplate = resolveTemplate("proposal");
    const attachment1Template = resolveTemplate("attachment1");
    const attachment2Template = resolveTemplate("attachment2");
    const totalAllowanceAmount = results.reduce(
      (sum, item) => sum + item.snapshot.totalAllowanceAmount,
      0
    );
    const employeeCount = new Set(
      exportRows.map((row) => `${row.employeeCode}:${row.employeeName}`)
    ).size;

    mkdirSync(outputDir, { recursive: true });

    const proposalFileName = resolveDocumentTemplateOutputFileName({
      templateType: "proposal",
      pattern: proposalTemplate.outputFileNamePattern,
      tokens: {
        workMonth,
        templateVersion: proposalTemplate.versionLabel
      }
    });
    const attachment1FileName = resolveDocumentTemplateOutputFileName({
      templateType: "attachment1",
      pattern: attachment1Template.outputFileNamePattern,
      tokens: {
        workMonth,
        templateVersion: attachment1Template.versionLabel
      }
    });
    const attachment2FileName = resolveDocumentTemplateOutputFileName({
      templateType: "attachment2",
      pattern: attachment2Template.outputFileNamePattern,
      tokens: {
        workMonth,
        templateVersion: attachment2Template.versionLabel
      }
    });
    const proposalPath = resolveUniqueOutputPath(outputDir, proposalFileName);
    const attachment1Path = resolveUniqueOutputPath(outputDir, attachment1FileName);
    const attachment2Path = resolveUniqueOutputPath(outputDir, attachment2FileName);

    await writeProposalWorkbook({
      template: proposalTemplate,
      outputPath: proposalPath,
      workMonth,
      rows: exportRows,
      totalAllowanceAmount
    });
    await writeAttachmentOneWorkbook({
      template: attachment1Template,
      outputPath: attachment1Path,
      workMonth,
      rows: exportRows
    });
    await writeAttachmentTwoWorkbook({
      template: attachment2Template,
      outputPath: attachment2Path,
      workMonth,
      rows: exportRows,
      totalAllowanceAmount
    });

    return {
      ok: true,
      data: saveStoredAllowanceDocumentExport({
        workMonth,
        calculationIds: results.map((item) => item.id),
        calculationCount: results.length,
        employeeCount,
        totalAllowanceAmount,
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
