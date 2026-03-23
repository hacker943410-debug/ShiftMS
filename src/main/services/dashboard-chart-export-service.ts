import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import ExcelJS from "exceljs";

import type {
  BridgeResult,
  DashboardChartExportColumn,
  DashboardChartExportInput,
  DashboardChartExportRecord,
  DashboardReportExportInput,
  DashboardReportExportRecord
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

const resolveOutputPath = (input: {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  outputPath?: string;
  outputDir?: string;
  defaultFileName: string;
  outputFormat: "xlsx" | "pdf";
}) => {
  const fallbackOutputDir =
    input.outputDir ??
    path.resolve(
      getStoredAppSettingsSnapshot({
        userDataPath: input.userDataPath,
        env: input.env
      }).scheduleExportDir,
      "dashboard-exports"
    );

  if (input.outputPath) {
    const targetPath = path.resolve(input.outputPath);
    const expectedExtension = `.${input.outputFormat}`;

    return path.extname(targetPath).toLowerCase() === expectedExtension
      ? targetPath
      : path.resolve(`${targetPath}${expectedExtension}`);
  }

  return resolveUniqueOutputPath(fallbackOutputDir, input.defaultFileName);
};

const getCellNumberFormat = (format?: DashboardChartExportColumn["format"]) => {
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

const formatCellValue = (value: string | number | null, format?: DashboardChartExportColumn["format"]) => {
  if (value === null || value === "") {
    return "-";
  }

  if (format === "currency") {
    return `₩${Math.round(Number(value)).toLocaleString("ko-KR")}`;
  }

  if (format === "percent") {
    return `${Number(value).toLocaleString("ko-KR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    })}%`;
  }

  if (format === "number") {
    return Number(value).toLocaleString("ko-KR");
  }

  return String(value);
};

const resolveImageExtension = (dataUrl: string) =>
  dataUrl.startsWith("data:image/jpeg") ? "jpeg" : "png";

const addChartImageToWorksheet = (input: {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  chartImageDataUrl?: string;
  startRow: number;
}) => {
  if (!input.chartImageDataUrl) {
    return input.startRow;
  }

  const imageWidth = 860;
  const imageHeight = 300;
  const imageId = input.workbook.addImage({
    base64: input.chartImageDataUrl,
    extension: resolveImageExtension(input.chartImageDataUrl)
  });

  input.worksheet.addImage(imageId, {
    tl: { col: 0, row: input.startRow - 1 },
    ext: { width: imageWidth, height: imageHeight }
  });

  return input.startRow + Math.ceil(imageHeight / 20) + 2;
};

const appendDataTableToWorksheet = (input: {
  worksheet: ExcelJS.Worksheet;
  columns: DashboardChartExportColumn[];
  rows: DashboardChartExportInput["rows"];
  headerRowNumber: number;
}) => {
  input.worksheet.getRow(input.headerRowNumber).values = input.columns.map((column) => column.header);
  input.worksheet.getRow(input.headerRowNumber).font = {
    name: "Pretendard",
    bold: true,
    color: { argb: "FF1B2D45" }
  };
  input.worksheet.getRow(input.headerRowNumber).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF3F9" }
  };

  if (input.rows.length === 0) {
    input.worksheet.getCell(`A${input.headerRowNumber + 1}`).value = "표시할 데이터가 없습니다.";
    input.worksheet.mergeCells(
      input.headerRowNumber + 1,
      1,
      input.headerRowNumber + 1,
      Math.max(input.columns.length, 1)
    );
    input.worksheet.getCell(`A${input.headerRowNumber + 1}`).font = {
      name: "Pretendard",
      italic: true,
      color: { argb: "FF6C7A8F" }
    };
    return;
  }

  input.rows.forEach((row, rowIndex) => {
    const rowNumber = input.headerRowNumber + 1 + rowIndex;
    input.worksheet.getRow(rowNumber).values = input.columns.map((column) => row[column.key] ?? "");
  });

  input.worksheet.views = [
    {
      state: "frozen",
      ySplit: input.headerRowNumber
    }
  ];
  input.worksheet.autoFilter = {
    from: { row: input.headerRowNumber, column: 1 },
    to: { row: input.headerRowNumber, column: input.columns.length }
  };
};

const createMetadataRows = (
  filters: DashboardChartExportInput["filters"] | DashboardReportExportInput["filters"],
  exportedAt: string
): Array<[string, string]> => [
  ["내보내기 시각", exportedAt],
  ["조회 연도", filters.year],
  ["조회 월", filters.month],
  ["근무지", filters.siteName],
  ["이름", filters.employeeName],
  ["데이터 기준", filters.dataSource]
];

const writeSheetHeader = (input: {
  worksheet: ExcelJS.Worksheet;
  title: string;
  metadataRows: Array<[string, string]>;
  mergeToColumnCount: number;
}) => {
  input.worksheet.mergeCells(1, 1, 1, Math.max(input.mergeToColumnCount, 2));
  input.worksheet.getCell("A1").value = input.title;
  input.worksheet.getCell("A1").font = {
    name: "Pretendard",
    size: 15,
    bold: true,
    color: { argb: "FF1B2D45" }
  };
  input.worksheet.getCell("A1").alignment = {
    vertical: "middle"
  };

  input.metadataRows.forEach(([label, value], index) => {
    const rowNumber = index + 2;
    input.worksheet.getCell(`A${rowNumber}`).value = label;
    input.worksheet.getCell(`B${rowNumber}`).value = value;
    input.worksheet.getCell(`A${rowNumber}`).font = {
      name: "Pretendard",
      bold: true,
      color: { argb: "FF526175" }
    };
  });
};

const writeChartWorkbook = async (input: {
  chart: DashboardChartExportInput;
  outputPath: string;
  exportedAt: string;
}) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(trimSheetName(input.chart.sheetName));
  const metadataRows = createMetadataRows(input.chart.filters, input.exportedAt);

  mkdirSync(path.dirname(input.outputPath), { recursive: true });
  workbook.creator = "ShiftMgmt V3.4";
  workbook.lastModifiedBy = "ShiftMgmt Dashboard Export";
  workbook.created = new Date();
  workbook.modified = new Date();

  writeSheetHeader({
    worksheet,
    title: input.chart.chartTitle,
    metadataRows,
    mergeToColumnCount: input.chart.columns.length
  });
  const headerRowNumber = addChartImageToWorksheet({
    workbook,
    worksheet,
    chartImageDataUrl: input.chart.chartImageDataUrl,
    startRow: metadataRows.length + 3
  });

  appendDataTableToWorksheet({
    worksheet,
    columns: input.chart.columns,
    rows: input.chart.rows,
    headerRowNumber
  });
  setWorksheetColumns(worksheet, input.chart);

  await workbook.xlsx.writeFile(input.outputPath);
};

const writeReportWorkbook = async (input: {
  report: DashboardReportExportInput;
  outputPath: string;
  exportedAt: string;
}) => {
  const workbook = new ExcelJS.Workbook();
  const overviewSheet = workbook.addWorksheet("대시보드");
  const metadataRows = createMetadataRows(input.report.filters, input.exportedAt);

  mkdirSync(path.dirname(input.outputPath), { recursive: true });
  workbook.creator = "ShiftMgmt V3.4";
  workbook.lastModifiedBy = "ShiftMgmt Dashboard Export";
  workbook.created = new Date();
  workbook.modified = new Date();

  writeSheetHeader({
    worksheet: overviewSheet,
    title: input.report.title,
    metadataRows,
    mergeToColumnCount: 4
  });
  overviewSheet.getCell("A9").value = "포함 섹션";
  overviewSheet.getCell("B9").value = "행 수";
  overviewSheet.getRow(9).font = {
    name: "Pretendard",
    bold: true,
    color: { argb: "FF1B2D45" }
  };
  overviewSheet.getRow(9).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF3F9" }
  };

  input.report.sections.forEach((section, index) => {
    const rowNumber = 10 + index;
    overviewSheet.getCell(`A${rowNumber}`).value = section.chartTitle;
    overviewSheet.getCell(`B${rowNumber}`).value = section.rows.length;
  });

  input.report.sections.forEach((section) => {
    const worksheet = workbook.addWorksheet(trimSheetName(section.sheetName));
    writeSheetHeader({
      worksheet,
      title: section.chartTitle,
      metadataRows,
      mergeToColumnCount: section.columns.length
    });
    const headerRowNumber = addChartImageToWorksheet({
      workbook,
      worksheet,
      chartImageDataUrl: section.chartImageDataUrl,
      startRow: metadataRows.length + 3
    });

    appendDataTableToWorksheet({
      worksheet,
      columns: section.columns,
      rows: section.rows,
      headerRowNumber
    });
    setWorksheetColumns(worksheet, {
      columns: section.columns,
      rows: section.rows
    });
  });

  await workbook.xlsx.writeFile(input.outputPath);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderMetadataHtml = (
  filters: DashboardChartExportInput["filters"] | DashboardReportExportInput["filters"],
  exportedAt: string
) =>
  `
    <div class="meta-grid">
      <div><strong>내보내기 시각</strong><span>${escapeHtml(exportedAt)}</span></div>
      <div><strong>조회 연도</strong><span>${escapeHtml(filters.year)}</span></div>
      <div><strong>조회 월</strong><span>${escapeHtml(filters.month)}</span></div>
      <div><strong>근무지</strong><span>${escapeHtml(filters.siteName)}</span></div>
      <div><strong>이름</strong><span>${escapeHtml(filters.employeeName)}</span></div>
      <div><strong>데이터 기준</strong><span>${escapeHtml(filters.dataSource)}</span></div>
    </div>
  `;

const renderTableHtml = (input: {
  columns: DashboardChartExportColumn[];
  rows: DashboardChartExportInput["rows"];
}) => `
  <table>
    <thead>
      <tr>${input.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${
        input.rows.length > 0
          ? input.rows
              .map(
                (row) => `
                  <tr>
                    ${input.columns
                      .map((column) => {
                        const value = formatCellValue(row[column.key] ?? null, column.format);
                        const cellClass =
                          column.format === "currency" ||
                          column.format === "number" ||
                          column.format === "percent"
                            ? " class=\"number\""
                            : "";

                        return `<td${cellClass}>${escapeHtml(value)}</td>`;
                      })
                      .join("")}
                  </tr>
                `
              )
              .join("")
          : `<tr><td colspan="${Math.max(input.columns.length, 1)}">표시할 데이터가 없습니다.</td></tr>`
      }
    </tbody>
  </table>
`;

const renderDashboardPdfDocument = (input: {
  title: string;
  exportedAt: string;
  filters: DashboardChartExportInput["filters"] | DashboardReportExportInput["filters"];
  sections: Array<{
    title: string;
    chartImageDataUrl?: string;
    columns: DashboardChartExportColumn[];
    rows: DashboardChartExportInput["rows"];
  }>;
}) => `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 12mm;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #1b2434;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
        font-size: 11px;
        line-height: 1.5;
      }
      h1, h2, p, strong, span { margin: 0; }
      .page {
        display: grid;
        gap: 14px;
      }
      .page + .page {
        page-break-before: always;
      }
      .title {
        display: grid;
        gap: 8px;
      }
      .title h1 {
        font-size: 20px;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px 14px;
        padding: 12px 14px;
        border: 1px solid #d6deeb;
        border-radius: 14px;
        background: #f7f9fc;
      }
      .meta-grid div {
        display: grid;
        gap: 4px;
      }
      .meta-grid strong {
        color: #53627c;
        font-size: 10px;
      }
      .chart-frame {
        border: 1px solid #dbe3ef;
        border-radius: 16px;
        background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
        padding: 10px;
      }
      .chart-frame img {
        display: block;
        width: 100%;
        max-height: 320px;
        object-fit: contain;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      th, td {
        border: 1px solid #d4dceb;
        padding: 6px 8px;
        vertical-align: middle;
      }
      th {
        background: #eef3fb;
        color: #2c457f;
        font-weight: 700;
      }
      .number {
        text-align: right;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    ${input.sections
      .map(
        (section, index) => `
          <section class="page">
            <div class="title">
              <h1>${escapeHtml(index === 0 ? input.title : section.title)}</h1>
              ${index === 0 ? renderMetadataHtml(input.filters, input.exportedAt) : ""}
            </div>
            ${index > 0 ? `<h2>${escapeHtml(section.title)}</h2>` : ""}
            ${
              section.chartImageDataUrl
                ? `<div class="chart-frame"><img alt="${escapeHtml(section.title)}" src="${section.chartImageDataUrl}" /></div>`
                : ""
            }
            ${renderTableHtml({
              columns: section.columns,
              rows: section.rows
            })}
          </section>
        `
      )
      .join("")}
  </body>
</html>`;

const createPdfDocument = async (input: {
  outputPath: string;
  html: string;
}) => {
  if (!process.versions.electron) {
    throw new Error("PDF 출력은 Electron 앱 실행 환경에서만 지원합니다.");
  }

  const { BrowserWindow } = await import("electron");
  const browserWindow = new BrowserWindow({
    show: false,
    width: 1600,
    height: 1200,
    webPreferences: {
      sandbox: false
    }
  });
  const tempDir = mkdtempSync(path.resolve(tmpdir(), "shiftmgmt-dashboard-pdf-"));
  const tempHtmlPath = path.resolve(tempDir, "document.html");

  try {
    writeFileSync(tempHtmlPath, input.html, "utf8");
    await browserWindow.loadFile(tempHtmlPath);

    const pdfBuffer = await Promise.race([
      browserWindow.webContents.printToPDF({
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("PDF 생성이 제한 시간 내에 완료되지 않았습니다."));
        }, 30000);
      })
    ]);

    mkdirSync(path.dirname(input.outputPath), { recursive: true });
    writeFileSync(input.outputPath, pdfBuffer);
  } finally {
    if (!browserWindow.isDestroyed()) {
      browserWindow.destroy();
    }

    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
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

    const outputFormat = input.outputFormat ?? "xlsx";
    const exportedAt = new Date().toISOString();
    const timestamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const defaultFileName = `${sanitizeFileSegment(input.chartKey)}_${sanitizeFileSegment(
      input.chartTitle
    )}_${timestamp}.${outputFormat}`;
    const outputPath = resolveOutputPath({
      userDataPath: context.userDataPath,
      env: context.env,
      outputPath: context.outputPath,
      outputDir: context.outputDir,
      defaultFileName,
      outputFormat
    });

    if (outputFormat === "pdf") {
      await createPdfDocument({
        outputPath,
        html: renderDashboardPdfDocument({
          title: input.chartTitle,
          exportedAt,
          filters: input.filters,
          sections: [
            {
              title: input.chartTitle,
              chartImageDataUrl: input.chartImageDataUrl,
              columns: input.columns,
              rows: input.rows
            }
          ]
        })
      });
    } else {
      await writeChartWorkbook({
        chart: input,
        outputPath,
        exportedAt
      });
    }

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

export const exportDashboardReport = async (
  input: DashboardReportExportInput,
  context: {
    userDataPath: string;
    outputPath?: string;
    outputDir?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<DashboardReportExportRecord>> => {
  try {
    if (input.sections.length === 0) {
      throw new Error("내보낼 대시보드 섹션이 없습니다.");
    }

    const exportedAt = new Date().toISOString();
    const timestamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const defaultFileName = `${sanitizeFileSegment(input.title)}_${timestamp}.${input.outputFormat}`;
    const outputPath = resolveOutputPath({
      userDataPath: context.userDataPath,
      env: context.env,
      outputPath: context.outputPath,
      outputDir: context.outputDir,
      defaultFileName,
      outputFormat: input.outputFormat
    });

    if (input.outputFormat === "pdf") {
      await createPdfDocument({
        outputPath,
        html: renderDashboardPdfDocument({
          title: input.title,
          exportedAt,
          filters: input.filters,
          sections: input.sections.map((section) => ({
            title: section.chartTitle,
            chartImageDataUrl: section.chartImageDataUrl,
            columns: section.columns,
            rows: section.rows
          }))
        })
      });
    } else {
      await writeReportWorkbook({
        report: input,
        outputPath,
        exportedAt
      });
    }

    return {
      ok: true,
      data: {
        title: input.title,
        outputFileName: path.basename(outputPath),
        outputPath,
        sectionCount: input.sections.length,
        exportedAt
      }
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "DASHBOARD_REPORT_EXPORT_FAILED",
      message: error instanceof Error ? error.message : "대시보드 전체 내보내기 중 오류가 발생했습니다."
    };
  }
};
