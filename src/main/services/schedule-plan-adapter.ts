import ExcelJS from "exceljs";

import type { DocumentTemplateVersion } from "../../shared/domain/model";
import type {
  SchedulePlanCellUpdate,
  SchedulePlanTemplateLayout,
  SchedulePlanTemplateVariant,
  SchedulePlanTemplateWeekBlock
} from "../../shared/domain/schedule-plan";
import { applyDocumentTemplateStyleSpec } from "./document-template-style-apply-service";

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook;
};

const writeWorkbook = async (workbook: ExcelJS.Workbook, outputPath: string) => {
  await workbook.xlsx.writeFile(outputPath);
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

const toColumnNumber = (columnLetters: string) =>
  columnLetters
    .toUpperCase()
    .split("")
    .reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);

const parseCellAddress = (address: string) => {
  const match = address.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    columnNumber: toColumnNumber(match[1]!),
    rowNumber: Number(match[2])
  };
};

export const buildSchedulePlanDateBlockAddresses = (dateAddress: string) => {
  const parsed = parseCellAddress(dateAddress);

  if (!parsed) {
    return [dateAddress];
  }

  return Array.from(
    { length: 3 },
    (_, index) => `${toColumnLetter(parsed.columnNumber + index)}${parsed.rowNumber}`
  );
};

const normalizeCellText = (value: ExcelJS.CellValue | undefined | null) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const createDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const createDayBlock = (startColumnNumber: number) => ({
  left: `${toColumnLetter(startColumnNumber)}`,
  center: `${toColumnLetter(startColumnNumber + 1)}`,
  right: `${toColumnLetter(startColumnNumber + 2)}`
});

const createSample1WeekBlock = (dateRow: number): SchedulePlanTemplateWeekBlock => ({
  dateRow,
  daySlots: [3, 6, 9, 12, 15, 18, 21].map((columnNumber) => {
    const block = createDayBlock(columnNumber);

    return {
      dateAddress: `${block.left}${dateRow}`,
      dutyCellAddresses: {
        D: [`${block.center}${dateRow + 1}`],
        E: [`${block.center}${dateRow + 2}`],
        N: [`${block.center}${dateRow + 3}`],
        O: [`${block.center}${dateRow + 4}`, `${block.center}${dateRow + 5}`]
      }
    };
  })
});

const createSample2WeekBlock = (dateRow: number): SchedulePlanTemplateWeekBlock => ({
  dateRow,
  daySlots: [3, 6, 9, 12, 15, 18, 21].map((columnNumber) => {
    const block = createDayBlock(columnNumber);

    return {
      dateAddress: `${block.left}${dateRow}`,
      dutyCellAddresses: {
        D: [`${block.left}${dateRow + 1}`, `${block.center}${dateRow + 1}`, `${block.right}${dateRow + 1}`],
        N: [`${block.center}${dateRow + 4}`],
        O: Array.from({ length: 5 }, (_, index) => `${block.center}${dateRow + 5 + index}`)
      }
    };
  })
});

const detectTemplateVariant = (
  worksheet: ExcelJS.Worksheet
): SchedulePlanTemplateVariant => {
  const sample2ReasonHeader = normalizeCellText(worksheet.getCell("BF9").value);
  const sample1ReasonHeader = normalizeCellText(worksheet.getCell("AX9").value);

  if (sample2ReasonHeader === "변경 사유") {
    return "sample2";
  }

  if (sample1ReasonHeader === "변경 사유") {
    return "sample1";
  }

  throw new Error("지원하지 않는 근무표 템플릿 형식입니다.");
};

const createSample1Layout = (
  worksheet: ExcelJS.Worksheet,
  dateRows: number[]
): SchedulePlanTemplateLayout => ({
  variant: "sample1",
  sheetName: worksheet.name,
  siteNameCell: "C3",
  monthTitleCell: "W6",
  rosterSummaryCell: "B7",
  monthAnchorCells: ["AY8", "BK8", "BK30"],
  weekBlocks: dateRows.map(createSample1WeekBlock),
  rescheduleDateCells: Array.from({ length: 31 }, (_, index) => `Y${index + 12}`),
  supportedWorkingDutyCodes: ["D", "E", "N"],
  regularPlanColumns: {
    D: ["Z", "AA", "AB", "AC"],
    E: ["AD", "AE", "AF", "AG"],
    N: ["AH", "AI", "AJ", "AK"]
  },
  changedPlanColumns: {
    D: ["AL", "AM", "AN", "AO"],
    E: ["AP", "AQ", "AR", "AS"],
    N: ["AT", "AU", "AV", "AW"]
  },
  changeReasonColumn: "AX",
  changeReasonColumns: ["AX", "AY"]
});

const createSample2Layout = (
  worksheet: ExcelJS.Worksheet,
  dateRows: number[]
): SchedulePlanTemplateLayout => ({
  variant: "sample2",
  sheetName: worksheet.name,
  siteNameCell: "C3",
  monthTitleCell: "W6",
  rosterSummaryCell: "B7",
  monthAnchorCells: ["BG8", "BS8", "BS30"],
  weekBlocks: dateRows.map(createSample2WeekBlock),
  rescheduleDateCells: Array.from({ length: 31 }, (_, index) => `Y${index + 12}`),
  supportedWorkingDutyCodes: ["D", "N"],
  regularPlanColumns: {
    D: ["Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK"],
    N: ["AL", "AM", "AN", "AO"]
  },
  changedPlanColumns: {
    D: ["AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "AY", "AZ", "BA"],
    N: ["BB", "BC", "BD", "BE"]
  },
  changeReasonColumn: "BF",
  changeReasonColumns: ["BF", "BG"]
});

export const buildSchedulePlanCalendarDates = (scheduleMonth: string) => {
  const [yearText, monthText] = scheduleMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return [];
  }

  const firstDay = new Date(year, month - 1, 1);
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstDay.getDay());
  const dates: string[] = [];

  for (let index = 0; index < 42; index += 1) {
    const cursor = new Date(calendarStart);
    cursor.setDate(calendarStart.getDate() + index);
    dates.push(createDateValue(cursor));
  }

  return dates;
};

// 이미 읽어 둔 워크북에서 레이아웃을 도출한다(파일을 다시 읽지 않음).
// 워크시트 선택 규칙은 기존과 동일하다.
export const inspectSchedulePlanTemplateFromWorkbook = (
  workbook: ExcelJS.Workbook
): SchedulePlanTemplateLayout => {
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];
  const variant = detectTemplateVariant(worksheet);
  const dateRows = Array.from({ length: worksheet.rowCount }, (_, index) => index + 1).filter(
    (rowNumber) => normalizeCellText(worksheet.getCell(rowNumber, 2).value) === "DATE"
  );

  if (dateRows.length === 0) {
    throw new Error("근무표 템플릿에서 주차 블록을 찾을 수 없습니다.");
  }

  if (variant === "sample2") {
    return createSample2Layout(worksheet, dateRows);
  }

  return createSample1Layout(worksheet, dateRows);
};

export const inspectSchedulePlanTemplate = async (
  filePath: string
): Promise<SchedulePlanTemplateLayout> => {
  const workbook = await readWorkbook(filePath);
  return inspectSchedulePlanTemplateFromWorkbook(workbook);
};

const applyCellNumberFormat = (
  worksheet: ExcelJS.Worksheet,
  addresses: string[],
  numberFormat: string
) => {
  addresses.forEach((address) => {
    const sourceCell = worksheet.getCell(address);
    const targetCell = sourceCell.master ?? sourceCell;

    targetCell.numFmt = numberFormat;
  });
};

export const writeSchedulePlanWorkbook = async (input: {
  templatePath: string;
  outputPath: string;
  updates: SchedulePlanCellUpdate[];
  cellFillUpdates?: Array<{ address: string; colorArgb: string }>;
  template?: Pick<DocumentTemplateVersion, "profile" | "validation">;
}) => {
  const workbook = await readWorkbook(input.templatePath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  input.updates.forEach((update) => {
    const sourceCell = worksheet.getCell(update.address);
    const targetCell = sourceCell.master ?? sourceCell;

    if (update.value instanceof Date) {
      const excelSafeDate = new Date(update.value);
      excelSafeDate.setHours(12, 0, 0, 0);
      targetCell.value = excelSafeDate;

      if (update.numberFormat) {
        applyCellNumberFormat(
          worksheet,
          update.numberFormatAddresses?.length ? update.numberFormatAddresses : [update.address],
          update.numberFormat
        );
      }

      return;
    }

    targetCell.value = update.value;

    if (update.numberFormat) {
      applyCellNumberFormat(
        worksheet,
        update.numberFormatAddresses?.length ? update.numberFormatAddresses : [update.address],
        update.numberFormat
      );
    }
  });

  (input.cellFillUpdates ?? []).forEach(({ address, colorArgb }) => {
    const targetCell = worksheet.getCell(address).master ?? worksheet.getCell(address);

    targetCell.style = {
      ...targetCell.style,
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorArgb }
      }
    };
  });

  if (input.template) {
    applyDocumentTemplateStyleSpec({
      workbook,
      template: input.template
    });
  }

  await writeWorkbook(workbook, input.outputPath);
};
