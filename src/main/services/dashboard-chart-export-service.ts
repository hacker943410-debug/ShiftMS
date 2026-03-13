import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  BridgeResult,
  DashboardChartExportInput,
  DashboardChartExportRecord
} from "../../shared/bridge/contracts";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const trimSheetName = (value: string) => value.replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Dashboard";

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

const getCellNumberFormat = (format?: DashboardChartExportInput["columns"][number]["format"]) => {
  switch (format) {
    case "currency":
    case "number":
      return "#,##0";
    case "percent":
      return "0.0";
    default:
      return undefined;
  }
};

const setWorksheetColumns = (
  worksheet: ExcelJS.Worksheet,
  input: Pick<DashboardChartExportInput, "columns" | "rows">
) => {
  input.columns.forEach((column, index) => {
    const values = input.rows.map((row) => row[column.key]);
    const maxLength = Math.max(
      column.header.length,
      ...values.map((value) => String(value ?? "").length)
    );

    worksheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 4, 12), 26);
    const numberFormat = getCellNumberFormat(column.format);

    if (!numberFormat) {
      return;
    }

    worksheet.getColumn(index + 1).numFmt = numberFormat;
  });
};

export const exportDashboardChartData = async (
  input: DashboardChartExportInput,
  context: {
    userDataPath: string;
    outputPath?: string;
    outputDir?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<DashboardChartExportRecord>> => {
  try {
    if (input.columns.length === 0) {
      throw new Error("내보낼 차트 컬럼이 없습니다.");
    }

    if (input.rows.length === 0) {
      throw new Error("내보낼 차트 데이터가 없습니다.");
    }

    const exportedAt = new Date().toISOString();
    const timestamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const fallbackOutputDir =
      context.outputDir ??
      path.resolve(
        getStoredAppSettingsSnapshot({
          userDataPath: context.userDataPath,
          env: context.env
        }).scheduleExportDir,
        "dashboard-exports"
      );
    const fallbackOutputFileName = `${sanitizeFileSegment(input.chartKey)}_${sanitizeFileSegment(
      input.chartTitle
    )}_${timestamp}.xlsx`;
    const outputPath = context.outputPath
      ? path.extname(context.outputPath).toLowerCase() === ".xlsx"
        ? path.resolve(context.outputPath)
        : path.resolve(`${context.outputPath}.xlsx`)
      : resolveUniqueOutputPath(fallbackOutputDir, fallbackOutputFileName);
    const outputDir = path.dirname(outputPath);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(trimSheetName(input.sheetName));
    const metadataRows: Array<[string, string]> = [
      ["내보내기 시각", exportedAt],
      ["조회 연도", input.filters.year],
      ["조회 월", input.filters.month],
      ["근무지", input.filters.siteName],
      ["이름", input.filters.employeeName],
      ["데이터 기준", input.filters.dataSource]
    ];
    const headerRowNumber = metadataRows.length + 3;

    mkdirSync(outputDir, { recursive: true });

    workbook.creator = "ShiftMgmt V3.4";
    workbook.lastModifiedBy = "ShiftMgmt Dashboard Export";
    workbook.created = new Date();
    workbook.modified = new Date();

    worksheet.mergeCells(1, 1, 1, Math.max(input.columns.length, 2));
    worksheet.getCell("A1").value = input.chartTitle;
    worksheet.getCell("A1").font = {
      name: "Pretendard",
      size: 15,
      bold: true,
      color: { argb: "FF1B2D45" }
    };
    worksheet.getCell("A1").alignment = {
      vertical: "middle"
    };

    metadataRows.forEach(([label, value], index) => {
      const rowNumber = index + 2;
      worksheet.getCell(`A${rowNumber}`).value = label;
      worksheet.getCell(`B${rowNumber}`).value = value;
      worksheet.getCell(`A${rowNumber}`).font = {
        name: "Pretendard",
        bold: true,
        color: { argb: "FF526175" }
      };
    });

    worksheet.getRow(headerRowNumber).values = input.columns.map((column) => column.header);
    worksheet.getRow(headerRowNumber).font = {
      name: "Pretendard",
      bold: true,
      color: { argb: "FF1B2D45" }
    };
    worksheet.getRow(headerRowNumber).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF3F9" }
    };

    input.rows.forEach((row, rowIndex) => {
      const rowNumber = headerRowNumber + 1 + rowIndex;
      worksheet.getRow(rowNumber).values = input.columns.map((column) => row[column.key] ?? "");
    });

    worksheet.views = [
      {
        state: "frozen",
        ySplit: headerRowNumber
      }
    ];
    worksheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: input.columns.length }
    };

    setWorksheetColumns(worksheet, input);

    await workbook.xlsx.writeFile(outputPath);

    return {
      ok: true,
      data: {
        chartKey: input.chartKey,
        chartTitle: input.chartTitle,
        outputFileName: path.basename(outputPath),
        outputPath,
        rowCount: input.rows.length,
        exportedAt
      }
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "DASHBOARD_CHART_EXPORT_FAILED",
      message: error instanceof Error ? error.message : "대시보드 차트 내보내기 중 오류가 발생했습니다."
    };
  }
};
