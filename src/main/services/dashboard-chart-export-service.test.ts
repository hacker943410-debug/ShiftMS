import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettings } from "./app-settings-storage-service";
import {
  exportDashboardChartData,
  exportDashboardReport
} from "./dashboard-chart-export-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootDir = path.resolve(process.cwd(), "artifacts", "tests", "dashboard-chart-export");
const testOutputDir = path.resolve(testRootDir, "direct-output");
const storedOutputDir = path.resolve(testRootDir, "stored-output");
const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0Y4AAAAASUVORK5CYII=";

describe("dashboard-chart-export-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRootDir, { recursive: true, force: true });
  });

  it("should export dashboard chart rows with metadata and headers to a selected save path", async () => {
    const selectedOutputPath = path.resolve(testOutputDir, "trend-selected-path");
    const result = await exportDashboardChartData(
      {
        chartKey: "trend",
        chartTitle: "월별 수당 지급 추이 (최근 6개월)",
        sheetName: "월별 수당 추이",
        filters: {
          year: "2026",
          month: "2월",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "샘플 데이터"
        },
        outputFormat: "xlsx",
        chartImageDataUrl: tinyPngDataUrl,
        columns: [
          { key: "month", header: "월", format: "text" },
          { key: "overtimeAmount", header: "연장수당(원)", format: "currency" },
          { key: "substituteAmount", header: "대체수당(원)", format: "currency" },
          { key: "legalHolidayAmount", header: "법정공휴일수당(원)", format: "currency" }
        ],
        rows: [
          {
            month: "9월",
            overtimeAmount: 2_640_120,
            substituteAmount: 1_422_880,
            legalHolidayAmount: 2_118_400
          },
          {
            month: "10월",
            overtimeAmount: 2_812_500,
            substituteAmount: 1_533_200,
            legalHolidayAmount: 2_305_920
          }
        ]
      },
      {
        userDataPath: process.cwd(),
        outputPath: selectedOutputPath
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.outputPath).toBe(`${selectedOutputPath}.xlsx`);
    expect(existsSync(result.data.outputPath)).toBe(true);
    expect(result.data.rowCount).toBe(2);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.data.outputPath);
    const worksheet = workbook.getWorksheet("월별 수당 추이");
    let headerRowNumber = 0;

    worksheet?.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "월") {
        headerRowNumber = rowNumber;
      }
    });

    expect(String(worksheet?.getCell("A1").value ?? "")).toContain("월별 수당 지급 추이");
    expect(worksheet?.getCell("A2").value).toBe("내보내기 시각");
    expect(worksheet?.getCell("A7").value).toBe("데이터 기준");
    expect(headerRowNumber).toBeGreaterThan(0);
    expect(worksheet?.getCell(`A${headerRowNumber}`).value).toBe("월");
    expect(worksheet?.getCell(`B${headerRowNumber}`).value).toBe("연장수당(원)");
    expect(worksheet?.getCell(`A${headerRowNumber + 1}`).value).toBe("9월");
    expect(worksheet?.getCell(`B${headerRowNumber + 1}`).value).toBe(2_640_120);
    expect(worksheet?.getCell(`D${headerRowNumber + 2}`).value).toBe(2_305_920);
  });

  it("should use the stored export directory when no output override is provided", async () => {
    initializeSqliteStorage({
      dbPath: path.resolve(testRootDir, "dashboard-chart-export.test.sqlite")
    });

    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: path.resolve(testRootDir, "pending"),
        approvedDir: path.resolve(testRootDir, "approved"),
        scheduleExportDir: storedOutputDir,
        allowanceProposalExportDir: path.resolve(testRootDir, "allowance", "proposal"),
        allowanceAttachment1ExportDir: path.resolve(testRootDir, "allowance", "attachment1"),
        allowanceAttachment2ExportDir: path.resolve(testRootDir, "allowance", "attachment2"),
        migrationFilePath: ""
      },
      {
        userDataPath: process.cwd()
      }
    );

    const result = await exportDashboardChartData(
      {
        chartKey: "ratio",
        chartTitle: "전사 수당 유형 비율",
        sheetName: "수당 유형 비율",
        filters: {
          year: "2026",
          month: "전체",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "실데이터"
        },
        columns: [
          { key: "category", header: "수당 유형", format: "text" },
          { key: "amount", header: "금액(원)", format: "currency" },
          { key: "ratioPercent", header: "비율(%)", format: "percent" }
        ],
        rows: [
          {
            category: "연장수당",
            amount: 3_260_305,
            ratioPercent: 37.9
          }
        ]
      },
      {
        userDataPath: process.cwd()
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(path.dirname(result.data.outputPath)).toBe(path.resolve(storedOutputDir, "dashboard-exports"));
    expect(existsSync(result.data.outputPath)).toBe(true);
  });

  it("should export a dashboard report workbook with overview and section sheets", async () => {
    const selectedOutputPath = path.resolve(testOutputDir, "dashboard-report");
    const result = await exportDashboardReport(
      {
        title: "대시보드 전체 내보내기",
        outputFormat: "xlsx",
        filters: {
          year: "2026",
          month: "전체",
          siteName: "전체",
          employeeName: "전체",
          dataSource: "실데이터"
        },
        sections: [
          {
            sectionKey: "trend",
            chartTitle: "월별 수당 지급 추이",
            sheetName: "월별 수당 추이",
            chartImageDataUrl: tinyPngDataUrl,
            columns: [
              { key: "month", header: "월", format: "text" },
              { key: "amount", header: "금액(원)", format: "currency" }
            ],
            rows: [
              {
                month: "3월",
                amount: 1_250_000
              }
            ]
          },
          {
            sectionKey: "ranking",
            chartTitle: "연장근무 상위 인원 (Top 5)",
            sheetName: "연장근무 상위 인원",
            columns: [
              { key: "employeeName", header: "이름", format: "text" },
              { key: "siteName", header: "근무지", format: "text" },
              { key: "minutes", header: "연장근무시간(h)", format: "number" }
            ],
            rows: [
              {
                employeeName: "김현수",
                siteName: "보라매DC",
                minutes: 12.5
              }
            ]
          }
        ]
      },
      {
        userDataPath: process.cwd(),
        outputPath: selectedOutputPath
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.outputPath).toBe(`${selectedOutputPath}.xlsx`);
    expect(existsSync(result.data.outputPath)).toBe(true);
    expect(result.data.sectionCount).toBe(2);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.data.outputPath);
    let trendHeaderRowNumber = 0;
    let rankingHeaderRowNumber = 0;

    workbook.getWorksheet("월별 수당 추이")?.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "월") {
        trendHeaderRowNumber = rowNumber;
      }
    });
    workbook.getWorksheet("연장근무 상위 인원")?.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "이름") {
        rankingHeaderRowNumber = rowNumber;
      }
    });

    expect(workbook.worksheets).toHaveLength(3);
    expect(String(workbook.getWorksheet("대시보드")?.getCell("A1").value ?? "")).toContain(
      "대시보드 전체 내보내기"
    );
    expect(trendHeaderRowNumber).toBeGreaterThan(0);
    expect(rankingHeaderRowNumber).toBeGreaterThan(0);
  });
});
