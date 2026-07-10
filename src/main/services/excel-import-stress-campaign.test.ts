import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { syncPendingPerformanceFilesToStorage } from "./performance-file-intake-service";
import { listStoredPendingPerformanceFiles } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule
} from "./performance-test-helpers";
import { analyzeSitePatternImport } from "./site-pattern-extraction-service";

const campaignRoot = path.resolve(process.cwd(), "artifacts", "tests", "excel-import-stress");

const rewriteReturnedWorkbook = async (
  filePath: string,
  update: (worksheet: ExcelJS.Worksheet) => void
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  update(worksheet);
  await workbook.xlsx.writeFile(filePath);
};

const buildMonthDate = (day: number) => `2026-03-${String(day).padStart(2, "0")}`;

describe("excel-import stress campaign", () => {
  const cleanupRoots: string[] = [];

  afterEach(() => {
    while (cleanupRoots.length > 0) {
      const rootDir = cleanupRoots.pop();

      if (rootDir) {
        resetPreparedReturnedScheduleRoot(rootDir);
      }
    }
  });

  it("parses a returned workbook with the overtime table filled to capacity (62 rows)", async () => {
    const rootDir = path.resolve(campaignRoot, "overtime-capacity");
    cleanupRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });

    // Two non-overlapping windows per calendar day fill rows 34..95 without
    // triggering the same-person time-conflict validation.
    await rewriteReturnedWorkbook(fixture.filePath, (worksheet) => {
      for (let index = 0; index < 62; index += 1) {
        const rowNumber = 34 + index;
        const day = Math.floor(index / 2) + 1;
        const evening = index % 2 === 1;

        worksheet.getCell(`BA${rowNumber}`).value = buildMonthDate(day);
        worksheet.getCell(`BC${rowNumber}`).value = evening ? 19 : 6;
        worksheet.getCell(`BD${rowNumber}`).value = 0;
        worksheet.getCell(`BE${rowNumber}`).value = evening ? 21 : 8;
        worksheet.getCell(`BF${rowNumber}`).value = 0;
        worksheet.getCell(`BG${rowNumber}`).value = fixture.workers.overtime.name;
        worksheet.getCell(`BH${rowNumber}`).value = `부하시험 ${index + 1}`;
        worksheet.getCell(`BJ${rowNumber}`).value = "증적";
      }
    });

    const startedAt = Date.now();
    const detail = await syncPreparedReturnedSchedule(fixture);
    const elapsedMs = Date.now() - startedAt;

    const overtimeEntries = detail.entries.filter((entry) => entry.section === "overtime");

    expect(detail.status).not.toBe("error");
    expect(overtimeEntries).toHaveLength(62);
    overtimeEntries.forEach((entry) => {
      expect(entry.totalWorkMinutes).toBe(120);
      expect(entry.overtimeMinutes).toBe(120);
      expect(entry.breakMinutes).toBe(0);
      expect(entry.alerts.filter((alert) => alert.severity === "error")).toHaveLength(0);
    });
    // Parsing a capacity-filled workbook must stay well under the suite timeout.
    expect(elapsedMs).toBeLessThan(10_000);
  }, 30_000);

  it("parses 31 consecutive pink holiday rows credited via 홍길동 slots", async () => {
    const rootDir = path.resolve(campaignRoot, "holiday-31days");
    cleanupRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });

    await rewriteReturnedWorkbook(fixture.filePath, (worksheet) => {
      for (let day = 1; day <= 31; day += 1) {
        const rowNumber = 11 + day;

        worksheet.getCell(`Y${rowNumber}`).value = buildMonthDate(day);
        worksheet.getCell(`Y${rowNumber}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFD1D1" }
        };
        worksheet.getCell(`Z${rowNumber}`).value = "홍길동";
        worksheet.getCell(`AL${rowNumber}`).value = fixture.workers.holidayReplacement.name;
      }
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const holidayEntries = detail.entries.filter((entry) => entry.section === "legal-holiday");

    expect(detail.status).not.toBe("error");
    expect(holidayEntries).toHaveLength(31);
    holidayEntries.forEach((entry) => {
      expect(entry.employeeName).toBe(fixture.workers.holidayReplacement.name);
      expect(entry.workType).toBe("holiday");
      // D duty slot 06:00-18:00 with 60 min break — holiday work counts fully as base.
      expect(entry.totalWorkMinutes).toBe(660);
      expect(entry.baseWorkMinutes).toBe(660);
      expect(entry.overtimeMinutes).toBe(0);
      expect(entry.alerts.filter((alert) => alert.severity === "error")).toHaveLength(0);
    });
  }, 30_000);

  it("caps full-period scans at 20 newly parsed files and finishes the rest next run", async () => {
    const rootDir = path.resolve(campaignRoot, "parse-cap");
    cleanupRoots.push(rootDir);
    const fixture = await prepareReturnedScheduleFixture({ rootDir });

    const junkDir = path.resolve(fixture.pendingDir, "2026년", "3월");
    mkdirSync(junkDir, { recursive: true });

    for (let index = 1; index <= 22; index += 1) {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("잘못된시트");
      worksheet.getCell("A1").value = `부하 ${index}`;
      const buffer = await workbook.xlsx.writeBuffer();
      writeFileSync(
        path.resolve(junkDir, `2026_3_부하근무지${String(index).padStart(2, "0")}.xlsx`),
        Buffer.from(buffer as ArrayBuffer)
      );
    }

    const firstIssues = await syncPendingPerformanceFilesToStorage({
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir }
    });
    const firstCount = listStoredPendingPerformanceFiles().length;

    expect(firstIssues.some((issue) => issue.message.includes("최대 20개"))).toBe(true);
    expect(firstCount).toBe(20);

    const secondIssues = await syncPendingPerformanceFilesToStorage({
      settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir }
    });
    const secondCount = listStoredPendingPerformanceFiles().length;

    // 23 files total (22 junk + 1 returned workbook) must all be registered by run 2.
    expect(secondIssues.some((issue) => issue.message.includes("최대 20개"))).toBe(false);
    expect(secondCount).toBe(23);
  }, 60_000);

  it("analyzes a 90-day / 24-worker roster and detects the 12-day cycle", async () => {
    const rootDir = path.resolve(campaignRoot, "pattern-large");
    cleanupRoots.push(rootDir);
    mkdirSync(rootDir, { recursive: true });

    const cycle = ["D", "D", "E", "E", "N", "N", "휴", "휴", "휴", "휴", "휴", "휴"];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("과거근무표");
    worksheet.getCell("A1").value = "날짜";

    for (let dayIndex = 0; dayIndex < 90; dayIndex += 1) {
      const columnNumber = 2 + dayIndex;
      worksheet.getRow(1).getCell(columnNumber).value = new Date(Date.UTC(2026, 0, 1 + dayIndex));
      worksheet.getRow(2).getCell(columnNumber).value = "요일";
    }

    for (let workerIndex = 0; workerIndex < 24; workerIndex += 1) {
      const rowNumber = 4 + workerIndex;
      const offset = (workerIndex % 4) * 3;

      worksheet.getRow(rowNumber).getCell(1).value = `근무자${String(workerIndex + 1).padStart(2, "0")}`;
      for (let dayIndex = 0; dayIndex < 90; dayIndex += 1) {
        worksheet.getRow(rowNumber).getCell(2 + dayIndex).value =
          cycle[(dayIndex + offset) % cycle.length];
      }
    }

    const filePath = path.resolve(rootDir, "pattern-90x24.xlsx");
    await workbook.xlsx.writeFile(filePath);

    const startedAt = Date.now();
    const analysis = await analyzeSitePatternImport({ filePath });
    const elapsedMs = Date.now() - startedAt;

    expect(analysis.totalDays).toBe(90);
    expect(analysis.workerCount).toBe(24);
    expect(analysis.detectedGroupCount).toBe(1);
    expect(analysis.groups[0]?.cycleLength).toBe(12);
    expect(analysis.skippedWorkers).toHaveLength(0);
    expect(analysis.suggestion.teamCount).toBe(4);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 30_000);

  it("refuses auto-apply when more than 8 teams are detected", async () => {
    const rootDir = path.resolve(campaignRoot, "pattern-team-cap");
    cleanupRoots.push(rootDir);
    mkdirSync(rootDir, { recursive: true });

    const cycle = ["D", "N", "휴", "휴", "휴", "휴", "휴", "휴", "휴", "휴", "휴", "휴"];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("과거근무표");
    worksheet.getCell("A1").value = "날짜";

    for (let dayIndex = 0; dayIndex < 48; dayIndex += 1) {
      worksheet.getRow(1).getCell(2 + dayIndex).value = new Date(Date.UTC(2026, 0, 1 + dayIndex));
    }

    for (let workerIndex = 0; workerIndex < 9; workerIndex += 1) {
      const rowNumber = 4 + workerIndex;

      worksheet.getRow(rowNumber).getCell(1).value = `초과근무자${workerIndex + 1}`;
      for (let dayIndex = 0; dayIndex < 48; dayIndex += 1) {
        worksheet.getRow(rowNumber).getCell(2 + dayIndex).value =
          cycle[(dayIndex + workerIndex) % cycle.length];
      }
    }

    const filePath = path.resolve(rootDir, "pattern-9teams.xlsx");
    await workbook.xlsx.writeFile(filePath);

    await expect(analyzeSitePatternImport({ filePath })).rejects.toThrow(/8개를 초과/);
  }, 30_000);
});
