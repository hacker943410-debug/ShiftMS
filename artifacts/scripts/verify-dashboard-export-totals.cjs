const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ExcelJS = require("exceljs");
const { app } = require("electron");

const {
  exportDashboardChartData,
  exportDashboardReport
} = require("../../dist-electron/main/services/dashboard-chart-export-service.js");

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-dashboard-export-"));

const createChartInput = (outputFormat) => ({
  chartKey: "site",
  chartTitle: "근무지별 수당 합계",
  sheetName: "근무지별 합계",
  columns: [
    { key: "siteName", header: "근무지", format: "text" },
    { key: "overtimeAmount", header: "연장수당", format: "currency" },
    { key: "substituteAmount", header: "대체수당", format: "currency" },
    { key: "legalHolidayAmount", header: "휴일수당", format: "currency" },
    { key: "totalAmount", header: "합계(원)", format: "currency" }
  ],
  rows: [
    {
      siteName: "보라매DC",
      overtimeAmount: 120000,
      substituteAmount: 30000,
      legalHolidayAmount: 50000,
      totalAmount: 200000
    },
    {
      siteName: "대전NOC",
      overtimeAmount: 80000,
      substituteAmount: 20000,
      legalHolidayAmount: 20000,
      totalAmount: 120000
    }
  ],
  filters: {
    year: "2026",
    month: "3월",
    siteName: "전체 근무지",
    employeeName: "전체",
    dataSource: "스모크 데이터"
  },
  outputFormat,
  chartImageDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9W7vGN4AAAAASUVORK5CYII="
});

const createReportInput = (outputFormat) => ({
  title: "대시보드 리포트",
  filters: {
    year: "2026",
    month: "3월",
    siteName: "전체",
    employeeName: "전체",
    dataSource: "스모크 데이터"
  },
  outputFormat,
  sections: [
    {
      sectionKey: "site",
      chartTitle: "근무지별 수당 합계",
      sheetName: "근무지별 합계",
      chartImageDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9W7vGN4AAAAASUVORK5CYII=",
      columns: [
        { key: "siteName", header: "근무지", format: "text" },
        { key: "totalAmount", header: "합계(원)", format: "currency" }
      ],
      rows: [
        { siteName: "보라매DC", totalAmount: 200000 },
        { siteName: "대전NOC", totalAmount: 120000 }
      ]
    }
  ]
});

(async () => {
  await app.whenReady();
  const outputDir = path.resolve(userDataPath, "exports");
  fs.mkdirSync(outputDir, { recursive: true });

  const chartExcelPath = path.resolve(outputDir, "dashboard-chart.xlsx");
  const reportExcelPath = path.resolve(outputDir, "dashboard-report.xlsx");
  const reportPdfPath = path.resolve(outputDir, "dashboard-report.pdf");

  const chartExcel = await exportDashboardChartData(createChartInput("xlsx"), {
    outputPath: chartExcelPath,
    userDataPath
  });
  const reportExcel = await exportDashboardReport(createReportInput("xlsx"), {
    outputPath: reportExcelPath,
    userDataPath
  });
  const reportPdf = await exportDashboardReport(createReportInput("pdf"), {
    outputPath: reportPdfPath,
    userDataPath
  });

  if (!chartExcel.ok || !reportExcel.ok || !reportPdf.ok) {
    throw new Error(
      JSON.stringify({
        chartExcel,
        reportExcel,
        reportPdf
      })
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(reportExcelPath);
  const overviewSheet = workbook.getWorksheet("대시보드");

  if (!overviewSheet) {
    throw new Error("대시보드 개요 시트를 찾지 못했습니다.");
  }

  const overviewHeader = String(overviewSheet.getCell("C9").value ?? "").trim();
  const overviewValue = Number(overviewSheet.getCell("C10").value ?? 0);

  if (overviewHeader !== "총액(원)" || overviewValue !== 320000) {
    throw new Error(`대시보드 총액 출력 검증 실패: header=${overviewHeader} value=${overviewValue}`);
  }

  const reportPdfSize = fs.statSync(reportPdfPath).size;
  if (reportPdfSize < 2000) {
    throw new Error(`대시보드 PDF 파일 크기가 비정상적으로 작습니다: ${reportPdfSize}`);
  }

  console.log(
    JSON.stringify(
      {
        chartExcelPath,
        overviewHeader,
        overviewValue,
        reportExcelPath,
        reportPdfPath,
        reportPdfSize
      },
      null,
      2
    )
  );
  await app.quit();
})().finally(() => {
  fs.rmSync(userDataPath, { recursive: true, force: true });
});
