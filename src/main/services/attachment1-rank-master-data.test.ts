// TEMPORARY diagnostic test for the operator report "별첨1 자료에 직급 누락 (직급이 공백으로 나옴)".
// It traces 직급 end-to-end: employee master -> parsed performance entry -> approval snapshot ->
// allowance_calculations.employee_rank -> 별첨1 D column.
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeEmployeeRank } from "../../shared/domain/employee-rank";
import type { AllowanceCalculationResultRecord } from "../../shared/domain/allowance-service";
import { reviewAllowanceCalculations } from "./allowance-approval-service";
import { resetAllowanceDocumentExportHistoryForTest } from "./allowance-document-export-history-service";
import { exportAllowanceDocuments } from "./allowance-document-export-service";
import { runApprovedAllowanceCalculation } from "./approved-allowance-calculation-service";
import { saveStoredDocumentTemplateVersion } from "./operations-storage-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "attachment1-rank-blank");
const longTimeoutMs = 120000;

const registerDocumentTemplates = () => {
  saveStoredDocumentTemplateVersion({
    templateType: "proposal",
    versionLabel: "품의서 2026-04",
    sourcePath: path.resolve(process.cwd(), "양식샘플", "품의서_2026-04_수정본.xlsx"),
    status: "approved",
    isDefault: true,
    outputFileNamePattern: "결재품의_{workMonth}.xlsx"
  });
  saveStoredDocumentTemplateVersion({
    templateType: "attachment1",
    versionLabel: "별첨1 2026-04",
    sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_2026-04_수정본.xlsx"),
    status: "approved",
    isDefault: true,
    outputFileNamePattern: "첨부1_{workMonth}.xlsx"
  });
  saveStoredDocumentTemplateVersion({
    templateType: "attachment2",
    versionLabel: "별첨2 커스텀",
    sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
    status: "approved",
    isDefault: true,
    outputFileNamePattern: "첨부2_{workMonth}.xlsx"
  });
};

const readCellText = (value: ExcelJS.CellValue) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" && "result" in value) {
    return String((value as { result?: unknown }).result ?? "");
  }

  if (typeof value === "object" && "richText" in value) {
    return ((value as { richText?: Array<{ text?: string }> }).richText ?? [])
      .map((part) => part.text ?? "")
      .join("");
  }

  return String(value);
};

// Reads the 별첨1 detail rows as {사번, 성명, 직급} triples (columns B, C, D).
const readAttachmentOneNameRankPairs = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("별첨1") ?? workbook.worksheets[0];
  const pairs: Array<{ code: string; name: string; rank: string }> = [];

  if (!worksheet) {
    return pairs;
  }

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const code = readCellText(worksheet.getCell(`B${rowNumber}`).value).trim();
    const name = readCellText(worksheet.getCell(`C${rowNumber}`).value).trim();
    const rank = readCellText(worksheet.getCell(`D${rowNumber}`).value).trim();

    // Detail rows carry an employee code; header/subtotal/guide rows do not.
    if (!/^EMP-/.test(code)) {
      continue;
    }

    pairs.push({ code, name, rank });
  }

  return pairs;
};

const approveAndCalculateEverything = async (fixture: {
  userDataPath: string;
}, detail: { id: string; entries: Array<{ id: string }> }) => {
  for (const entry of detail.entries) {
    await approvePerformanceFile(
      { fileId: detail.id, entryId: entry.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );
  }

  const calculations: AllowanceCalculationResultRecord[] = [];

  for (const entry of detail.entries) {
    const calculated = await runApprovedAllowanceCalculation({ entryId: entry.id });

    expect(calculated.ok).toBe(true);

    if (!calculated.ok) {
      throw new Error("수당 계산에 실패했습니다.");
    }

    calculations.push(calculated.data);
  }

  const approval = await reviewAllowanceCalculations(
    { calculationIds: calculations.map((item) => item.id), decision: "approved" },
    testAdminSession
  );

  expect(approval.ok).toBe(true);

  return calculations;
};

describe("별첨1 직급 공백 재현", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("HOP 0: the rank vocabulary silently drops any 직급 outside the 5 allowed words", () => {
    expect(normalizeEmployeeRank("사원")).toBe("사원");
    expect(normalizeEmployeeRank("부장")).toBe("부장");

    // Real-world Korean ranks that are NOT in employeeRankOptions.
    for (const realWorldRank of [
      "주임",
      "선임",
      "책임",
      "수석",
      "팀장",
      "반장",
      "조장",
      "소장",
      "매니저",
      "차장대우",
      "위원",
      "기장"
    ]) {
      expect(normalizeEmployeeRank(realWorldRank), realWorldRank).toBeUndefined();
    }
  });

  it(
    "HOP 1-4: a populated 직급 survives master -> entry -> approval -> allowance_calculations -> 별첨1 D column",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);

      registerDocumentTemplates();

      const database = getSqliteDatabase();
      const masterRanks = database
        ?.prepare("SELECT employee_code, rank FROM employees WHERE employee_code LIKE 'EMP-PF-%'")
        .all() as Array<{ employee_code: string; rank: string | null }>;

      // The fixture registers every worker with 직급 = 사원.
      expect(masterRanks.every((row) => row.rank === "사원")).toBe(true);

      const parsedRanks = detail.entries.map((entry) => entry.employeeRank);
      const calculations = await approveAndCalculateEverything(fixture, detail);
      const storedCalcRanks = database
        ?.prepare("SELECT employee_code, employee_rank FROM allowance_calculations")
        .all() as Array<{ employee_code: string; employee_rank: string | null }>;

      const exported = await exportAllowanceDocuments(
        {
          calculationIds: calculations.map((item) => item.id),
          outputFormat: "xlsx"
        },
        { userDataPath: fixture.userDataPath }
      );

      expect(exported.ok).toBe(true);

      if (!exported.ok) {
        return;
      }

      const pairs = await readAttachmentOneNameRankPairs(exported.data.attachment1Path);

      console.log("[HOP1 parsed entry employeeRank]", JSON.stringify(parsedRanks));
      console.log("[HOP3 allowance_calculations.employee_rank]", JSON.stringify(storedCalcRanks));
      console.log("[HOP4 별첨1 B/C/D]", JSON.stringify(pairs));

      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs.every((pair) => pair.rank === "사원")).toBe(true);
    },
    longTimeoutMs
  );

  it(
    "HOP 4: a blank 직급 on the employee master makes the 별첨1 직급 column render '-' for every row, and re-filling the master rank fixes it on re-export with no re-approval",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });

      // Simulate the operator's real master data: employees registered without picking 직급
      // (or migrated from a source whose 직급명 was outside 사원/대리/과장/차장/부장).
      const database = getSqliteDatabase();
      database?.prepare("UPDATE employees SET rank = NULL").run();

      const detail = await syncPreparedReturnedSchedule(fixture);

      registerDocumentTemplates();

      const parsedRanks = detail.entries.map((entry) => entry.employeeRank);
      const calculations = await approveAndCalculateEverything(fixture, detail);
      const storedCalcRanks = database
        ?.prepare("SELECT DISTINCT employee_rank FROM allowance_calculations")
        .all() as Array<{ employee_rank: string | null }>;

      const exported = await exportAllowanceDocuments(
        {
          calculationIds: calculations.map((item) => item.id),
          outputFormat: "xlsx"
        },
        { userDataPath: fixture.userDataPath }
      );

      expect(exported.ok).toBe(true);

      if (!exported.ok) {
        return;
      }

      const blankPairs = await readAttachmentOneNameRankPairs(exported.data.attachment1Path);

      console.log("[BLANK HOP1 parsed entry employeeRank]", JSON.stringify(parsedRanks));
      console.log("[BLANK HOP3 allowance_calculations.employee_rank]", JSON.stringify(storedCalcRanks));
      console.log("[BLANK HOP4 별첨1 B/C/D]", JSON.stringify(blankPairs));

      expect(blankPairs.length).toBeGreaterThan(0);
      expect(parsedRanks.every((rank) => rank === undefined)).toBe(true);
      expect(storedCalcRanks.every((row) => row.employee_rank === null)).toBe(true);
      expect(blankPairs.every((pair) => pair.rank === "-")).toBe(true);

      // Now the operator fills 직급 in on the 인력 관리 screen and re-exports the SAME approved
      // calculations. resolveExportRows falls back to the live employee master by 사번.
      database?.prepare("UPDATE employees SET rank = '과장' WHERE employee_code LIKE 'EMP-PF-%'").run();

      const reExported = await exportAllowanceDocuments(
        {
          calculationIds: calculations.map((item) => item.id),
          outputFormat: "xlsx"
        },
        { userDataPath: fixture.userDataPath }
      );

      expect(reExported.ok).toBe(true);

      if (!reExported.ok) {
        return;
      }

      const repairedPairs = await readAttachmentOneNameRankPairs(reExported.data.attachment1Path);

      console.log("[REPAIRED HOP4 별첨1 B/C/D]", JSON.stringify(repairedPairs));

      const storedCalcRanksAfter = database
        ?.prepare("SELECT DISTINCT employee_rank FROM allowance_calculations")
        .all() as Array<{ employee_rank: string | null }>;

      // The approved snapshot is untouched (forward-only); only the rendered document changes.
      expect(storedCalcRanksAfter.every((row) => row.employee_rank === null)).toBe(true);
      expect(repairedPairs.length).toBeGreaterThan(0);
      expect(repairedPairs.every((pair) => pair.rank === "과장")).toBe(true);
    },
    longTimeoutMs
  );
});
