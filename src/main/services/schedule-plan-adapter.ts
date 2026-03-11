import path from "node:path";

import ExcelJS from "exceljs";

import type {
  SchedulePlanAssignment,
  SchedulePlanCellUpdate,
  SchedulePlanTemplateLayout
} from "../../shared/domain/schedule-plan";

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook;
};

const writeWorkbook = async (workbook: ExcelJS.Workbook, outputPath: string) => {
  await workbook.xlsx.writeFile(outputPath);
};

const normalizeDateValue = (value: ExcelJS.CellValue | undefined | null) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object" && value && "result" in value) {
    const result = value.result;
    if (result instanceof Date) {
      return result.toISOString().slice(0, 10);
    }
  }

  return null;
};

const toColumnLetter = (columnNumber: number) => {
  let current = columnNumber;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const normalizeDutyCode = (dutyCode: string) => {
  const code = dutyCode.trim().toUpperCase();

  if (code === "D") {
    return "D";
  }

  if (code === "E") {
    return "E";
  }

  if (code === "N") {
    return "N";
  }

  return "O";
};

export const inspectSchedulePlanTemplate = async (
  filePath: string
): Promise<SchedulePlanTemplateLayout> => {
  const workbook = await readWorkbook(filePath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  const dateColumns: SchedulePlanTemplateLayout["dateColumns"] = [];
  let lastRecordedDate: string | null = null;
  for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
    const value = worksheet.getCell(9, columnNumber).value;
    const normalizedDate = normalizeDateValue(value);

    if (!normalizedDate) {
      continue;
    }

    if (normalizedDate === lastRecordedDate) {
      continue;
    }

    dateColumns.push({
      address: `${toColumnLetter(columnNumber)}9`,
      date: normalizedDate,
      columnNumber
    });
    lastRecordedDate = normalizedDate;
  }

  return {
    sheetName: worksheet.name,
    siteNameCell: "C3",
    dateHeaderRow: 9,
    dateColumns,
    shiftRows: {
      D: 10,
      E: 11,
      N: 12,
      O: 13
    }
  };
};

export const createSchedulePlanCellUpdates = (input: {
  layout: SchedulePlanTemplateLayout;
  siteName: string;
  assignments: SchedulePlanAssignment[];
}): SchedulePlanCellUpdate[] => {
  const updates: SchedulePlanCellUpdate[] = [
    {
      address: input.layout.siteNameCell,
      value: input.siteName
    }
  ];

  const dateColumns = new Map(
    input.layout.dateColumns.map((column) => [column.date, column.columnNumber])
  );

  for (const assignment of input.assignments) {
    const columnNumber = dateColumns.get(assignment.workDate);

    if (!columnNumber) {
      continue;
    }

    const normalizedDutyCode = normalizeDutyCode(assignment.dutyCode);
    const rowNumber = input.layout.shiftRows[normalizedDutyCode];

    updates.push({
      address: `${toColumnLetter(columnNumber)}${rowNumber}`,
      value: assignment.displayValue
    });
  }

  return updates;
};

export const writeSchedulePlanWorkbook = async (input: {
  templatePath: string;
  outputPath: string;
  updates: SchedulePlanCellUpdate[];
}) => {
  const workbook = await readWorkbook(input.templatePath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  input.updates.forEach((update) => {
    worksheet.getCell(update.address).value = update.value;
  });

  await writeWorkbook(workbook, input.outputPath);
};

export const getSampleSchedulePlanPath = () =>
  path.resolve(process.cwd(), "양식샘플", "배포_근무표샘플.xlsx");
