import path from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { analyzeSitePatternImport } from "./site-pattern-extraction-service";

const createPatternWorkbookFixture = async (fileName: string, workerRows: string[][]) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("표준근무표");
  const filePath = path.resolve(process.cwd(), "artifacts", "tests", fileName);
  const totalDays = Math.max(workerRows[0]?.length ?? 1, 2) - 1;
  const dates = Array.from({ length: totalDays }, (_, index) => new Date(Date.UTC(2026, 0, index + 1)));
  const formatDate = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate()
    ).padStart(2, "0")}`;

  worksheet.getCell("A1").value = "날짜";
  worksheet.getCell("A2").value = "요일";
  worksheet.getCell("A3").value = "공휴일";

  dates.forEach((date, index) => {
    const column = index + 2;

    worksheet.getCell(1, column).value = formatDate(date);
    worksheet.getCell(2, column).value = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
    worksheet.getCell(3, column).value = index === 0 ? "신정" : "";
  });

  workerRows.forEach((row, rowIndex) => {
    const worksheetRow = rowIndex + 4;

    worksheet.getCell(worksheetRow, 1).value = row[0];
    row.slice(1).forEach((code, index) => {
      worksheet.getCell(worksheetRow, index + 2).value = code;
    });
  });

  await workbook.xlsx.writeFile(filePath);

  return filePath;
};

describe("site-pattern-extraction-service", () => {
  it("should analyze a standard schedule workbook and build a site draft suggestion", async () => {
    const filePath = await createPatternWorkbookFixture("site-pattern-import.xlsx", [
      ["김현중", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"],
      ["이은동", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O"],
      ["송민재", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O"],
      ["류중록", "D", "D", "D", "D", "D", "O", "O", "D", "D", "D", "D", "D", "O", "O"]
    ]);
    const analysis = await analyzeSitePatternImport({
      filePath,
      minConfidence: 0.7
    });

    expect(analysis.totalDays).toBe(14);
    expect(analysis.workerCount).toBe(4);
    expect(analysis.holidayCount).toBe(1);
    expect(analysis.detectedGroupCount).toBe(2);
    expect(analysis.uniqueCodes).toEqual(["D", "O", "N"]);
    expect(analysis.analysisReport).toContain("근무 사이클 패턴 분석 결과");
    expect(analysis.analysisReport).toContain("발견된 사이클 그룹: 2개");
    expect(analysis.groups[0]?.cycleLength).toBe(7);
    expect(analysis.groups[0]?.members).toHaveLength(3);
    expect(analysis.groups[1]?.members).toHaveLength(1);
    expect(analysis.suggestion.cycleCount).toBe(2);
    expect(analysis.suggestion.teamCount).toBe(4);
    expect(analysis.suggestion.teams.map((team) => team.maxHeadcount)).toEqual([1, 1, 1, 1]);
    expect(analysis.suggestion.cycles[0]?.patternString).toBe("주주휴휴야야야");
  });

  it("should expose mismatch details with cycle indexes for preview rendering", async () => {
    const cycle = ["D", "D", "O", "O", "N", "N", "N"];
    const repeated = [...cycle, ...cycle, ...cycle];
    repeated[13] = "D";

    const filePath = await createPatternWorkbookFixture("site-pattern-import-mismatch.xlsx", [
      ["김현중", ...repeated]
    ]);
    const analysis = await analyzeSitePatternImport({
      filePath,
      minConfidence: 0.7
    });
    const mismatch = analysis.groups[0]?.members[0]?.mismatches[0];

    expect(analysis.detectedGroupCount).toBe(1);
    expect(analysis.groups[0]?.members[0]?.mismatchCount).toBe(1);
    expect(mismatch).toMatchObject({
      index: 13,
      cycleIndex: 6,
      actualCode: "D",
      expectedCode: "N"
    });
  });

  it("should merge duplicate duty labels into a single analysis group and sum headcount", async () => {
    const filePath = await createPatternWorkbookFixture("site-pattern-import-duplicate-duty.xlsx", [
      ["주간", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"],
      ["주간", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"]
    ]);
    const analysis = await analyzeSitePatternImport({
      filePath,
      minConfidence: 0.7
    });

    expect(analysis.workerCount).toBe(2);
    expect(analysis.previewRows.map((row) => row.name)).toEqual(["주간", "주간 (2)"]);
    expect(analysis.detectedGroupCount).toBe(1);
    expect(analysis.groups[0]?.members.map((member) => member.name)).toEqual(["주간"]);
    expect(analysis.groups[0]?.teamSuggestions).toEqual([
      {
        offset: 0,
        headcount: 2,
        memberNames: ["주간", "주간 (2)"]
      }
    ]);
    expect(analysis.suggestion.teamCount).toBe(2);
    expect(analysis.suggestion.teams.map((team) => team.maxHeadcount)).toEqual([2, 0]);
  });

  it("should keep day and night symbols stable even when night appears first", async () => {
    const filePath = await createPatternWorkbookFixture("site-pattern-import-night-first.xlsx", [
      ["야간조", "N", "N", "O", "D", "D", "O", "N", "N", "O", "D", "D", "O"]
    ]);
    const analysis = await analyzeSitePatternImport({
      filePath,
      minConfidence: 0.7
    });

    expect(analysis.suggestion.cycles[0]?.patternString).toBe("야야휴주주휴");
  });
});
