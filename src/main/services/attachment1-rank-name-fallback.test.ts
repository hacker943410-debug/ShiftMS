// Pool substitute rows reach 별첨1 with a placeholder 사번 ("0" or "") while the same person
// exists in the employee master under their real 사번. A 사번-only rank lookup can never resolve
// those, so 별첨1 printed "-" no matter how carefully the operator filled 직급 in on the
// 인력 관리 screen. The name lookup covers them — but only when the name identifies exactly one
// person, otherwise a 동명이인 would silently borrow someone else's rank.
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

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

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "attachment1-rank-verify");
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

// Reads every 별첨1 row that carries a 성명 written by the exporter (columns B, C, D).
const readAttachmentOneRows = async (filePath: string, names: string[]) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("별첨1") ?? workbook.worksheets[0];
  const rows: Array<{ code: string; name: string; rank: string }> = [];

  if (!worksheet) {
    return rows;
  }

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const code = readCellText(worksheet.getCell(`B${rowNumber}`).value).trim();
    const name = readCellText(worksheet.getCell(`C${rowNumber}`).value).trim();
    const rank = readCellText(worksheet.getCell(`D${rowNumber}`).value).trim();

    if (!names.includes(name)) {
      continue;
    }

    rows.push({ code, name, rank });
  }

  return rows;
};

describe("별첨1 직급 - 사번을 못 찾을 때 이름으로 보조 조회", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it(
    "resolves 직급 by name when the approved row's 사번 is a placeholder, but not for a 동명이인",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });

      const database = getSqliteDatabase();

      // The employees are registered WITHOUT 직급 first (the shape that produces a NULL snapshot),
      // exactly like the live DB rows employee_rank IS NULL.
      database?.prepare("UPDATE employees SET rank = NULL").run();

      const detail = await syncPreparedReturnedSchedule(fixture);

      registerDocumentTemplates();

      const calculations: AllowanceCalculationResultRecord[] = [];

      for (const entry of detail.entries) {
        await approvePerformanceFile(
          { fileId: detail.id, entryId: entry.id },
          testAdminSession,
          { userDataPath: fixture.userDataPath }
        );
      }

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

      // Live-DB shape: Pool substitute rows keep 사번 "0" (or "") on the approved row while the
      // person exists in the employee master under their real 사번.
      database?.prepare("UPDATE allowance_calculations SET employee_code = '0'").run();

      // The operator now fills 직급 in on the 인력 관리 screen for every worker.
      database?.prepare("UPDATE employees SET rank = '과장'").run();

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

      const names = calculations.map((item) => item.employeeName);
      const rows = await readAttachmentOneRows(exported.data.attachment1Path, names);

      expect(rows.length).toBeGreaterThan(0);
      // 사번 lookup cannot match "0", so the name lookup has to carry it.
      expect(rows.every((row) => row.rank === "과장")).toBe(true);
      expect(exported.data.rankMissingEmployeeNames ?? []).toEqual([]);

      // A worker deleted from 인력 관리 after the fact still has to show the rank they held
      // on the month the document covers.
      database?.prepare("UPDATE employees SET deleted_at = '2026-05-01T00:00:00.000Z'").run();

      const afterDeleteExport = await exportAllowanceDocuments(
        {
          calculationIds: calculations.map((item) => item.id),
          outputFormat: "xlsx"
        },
        { userDataPath: fixture.userDataPath }
      );

      expect(afterDeleteExport.ok).toBe(true);

      if (!afterDeleteExport.ok) {
        return;
      }

      const afterDeleteRows = await readAttachmentOneRows(
        afterDeleteExport.data.attachment1Path,
        names
      );

      expect(afterDeleteRows.length).toBeGreaterThan(0);
      expect(afterDeleteRows.every((row) => row.rank === "과장")).toBe(true);

      // Same-name workers must NOT borrow each other's rank — the name lookup drops
      // any name it cannot pin to exactly one person.
      database?.prepare("UPDATE employees SET name = '같은이름' WHERE employee_code LIKE 'EMP-PF-%'").run();
      database?.prepare("UPDATE allowance_calculations SET employee_name = '같은이름'").run();

      const ambiguousExport = await exportAllowanceDocuments(
        {
          calculationIds: calculations.map((item) => item.id),
          outputFormat: "xlsx"
        },
        { userDataPath: fixture.userDataPath }
      );

      expect(ambiguousExport.ok).toBe(true);

      if (!ambiguousExport.ok) {
        return;
      }

      const ambiguousRows = await readAttachmentOneRows(ambiguousExport.data.attachment1Path, [
        "같은이름"
      ]);

      expect(ambiguousRows.length).toBeGreaterThan(0);
      expect(ambiguousRows.every((row) => row.rank === "-")).toBe(true);
      // …and the operator is told who came out blank instead of silently shipping "-".
      expect(ambiguousExport.data.rankMissingEmployeeNames).toContain("같은이름");
    },
    longTimeoutMs
  );
});
