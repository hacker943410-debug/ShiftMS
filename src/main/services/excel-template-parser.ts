import path from "node:path";

import ExcelJS from "exceljs";

import type { ExcelTemplateKind } from "../../shared/domain/performance-file";

export interface ExcelTemplateInspection {
  fileName: string;
  sheetName: string;
  templateKind: ExcelTemplateKind;
  rowCount: number;
  columnCount: number;
}

export interface AttachmentOneRowPreview {
  no: number;
  employeeCode: string;
  employeeName: string;
  department: string;
  category: string;
  workDate: string;
  workHours: number;
  baseHours: number;
  rate: number;
}

export interface AttachmentOneEntry {
  no: number;
  employeeCode: string;
  employeeName: string;
  department: string;
  category: string;
  workDate: string;
  workHours: number;
  baseHours: number;
  rate: number;
}

const detectTemplateKind = (sheetName: string): ExcelTemplateKind => {
  switch (sheetName) {
    case "교대 근무 계획표":
      return "schedule-plan";
    case "별첨1":
      return "attachment1";
    case "별첨2":
      return "attachment2";
    case "품의서":
      return "proposal";
    default:
      return "unknown";
  }
};

const normalizeCellValue = (value: ExcelJS.CellValue | undefined | null) => {
  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object" && "result" in value) {
    const formulaResult = value.result;

    if (formulaResult instanceof Date) {
      return formulaResult.toISOString().slice(0, 10);
    }

    return String(formulaResult ?? "");
  }

  return String(value);
};

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook;
};

export const inspectExcelTemplate = async (
  filePath: string
): Promise<ExcelTemplateInspection> => {
  const workbook = await readWorkbook(filePath);
  const worksheet = workbook.worksheets[0];

  return {
    fileName: path.basename(filePath),
    sheetName: worksheet?.name ?? "",
    templateKind: detectTemplateKind(worksheet?.name ?? ""),
    rowCount: worksheet?.rowCount ?? 0,
    columnCount: worksheet?.columnCount ?? 0
  };
};

export const parseAttachmentOneEntries = async (
  filePath: string
): Promise<AttachmentOneEntry[]> => {
  const workbook = await readWorkbook(filePath);
  const worksheet = workbook.getWorksheet("별첨1");

  if (!worksheet) {
    return [];
  }

  const entries: AttachmentOneEntry[] = [];

  for (let rowNumber = 5; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const no = row.getCell(1).value;

    if (typeof no !== "number") {
      continue;
    }

    entries.push({
      no,
      employeeCode: normalizeCellValue(row.getCell(2).value),
      employeeName: normalizeCellValue(row.getCell(3).value),
      department: normalizeCellValue(row.getCell(5).value),
      category: normalizeCellValue(row.getCell(6).value),
      workDate: normalizeCellValue(row.getCell(7).value),
      workHours: Number(row.getCell(8).value ?? 0),
      baseHours: Number(row.getCell(9).value ?? 0),
      rate: Number(row.getCell(10).value ?? 0)
    });
  }

  return entries;
};

export const parseAttachmentOnePreview = async (
  filePath: string
): Promise<AttachmentOneRowPreview | null> => (await parseAttachmentOneEntries(filePath))[0] ?? null;
