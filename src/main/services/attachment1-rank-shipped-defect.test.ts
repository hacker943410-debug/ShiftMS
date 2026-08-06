// Regression cover for the operator report that survived 0.5.3: the 직급 was filled in on the
// 인력 관리 screen and 별첨1 still printed "-" for everyone.
//
// 0.5.3 keyed the 사번 lookup on the stored employee code verbatim while probing with a trimmed
// code, so an employee master carrying trailing whitespace (common after an Excel-driven import)
// could never match — filling in 직급 could not help. It also dropped soft-deleted employees.
// Both are fixed; this test drives the real export path end to end and asserts the D column,
// and it pins the shipped-0.5.3 lookup shape alongside so a regression cannot pass silently.
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

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "attachment1-rank-shipped");
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

const readAttachmentOneRankRows = async (filePath: string) => {
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

    if (!/^EMP-/.test(code)) {
      continue;
    }

    rows.push({ code, name, rank });
  }

  return rows;
};

const approveAndCalculateEverything = async (
  fixture: { userDataPath: string },
  detail: { id: string; entries: Array<{ id: string }> }
) => {
  for (const entry of detail.entries) {
    await approvePerformanceFile({ fileId: detail.id, entryId: entry.id }, testAdminSession, {
      userDataPath: fixture.userDataPath
    });
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

// The 사번 lookup exactly as 0.5.3 shipped it: the map key is the stored code verbatim and
// soft-deleted employees are excluded. Used to prove the defect is real, not imagined.
const resolveRankTheWayShippedDid = (
  employees: Array<{ employee_code: string; name: string; rank: string | null; deleted_at: string | null }>,
  probeCode: string
) => {
  const rankByCode = new Map<string, string>();

  employees.forEach((employee) => {
    if (employee.deleted_at || !employee.rank) {
      return;
    }

    rankByCode.set(String(employee.employee_code), employee.rank);
  });

  return rankByCode.get(probeCode.trim());
};

describe("별첨1 직급 — 0.5.3 사번 대조 결함", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it(
    "직급을 채워도 인력 사번에 공백이 붙어 있으면 0.5.3은 못 찾고, 지금 판은 찾아 낸다",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);

      registerDocumentTemplates();

      const database = getSqliteDatabase();
      const calculations = await approveAndCalculateEverything(fixture, detail);

      // The operator's 실적 files carry no 직급 column, so the approved snapshot has none either.
      // That is what forces the export to fall back to the employee master.
      database?.prepare("UPDATE allowance_calculations SET employee_rank = NULL").run();

      // The operator's situation: 직급 filled in on screen, but the stored 사번 carries trailing
      // whitespace from an earlier import. Also rename the master rows so the name fallback (a
      // 0.5.4 addition) cannot mask whether the 사번 trim itself works.
      database
        ?.prepare(
          `UPDATE employees
              SET employee_code = employee_code || '  ',
                  rank = '과장',
                  name = name || '_마스터'
            WHERE employee_code LIKE 'EMP-PF-%'`
        )
        .run();

      const employeesNow = database
        ?.prepare("SELECT employee_code, name, rank, deleted_at FROM employees")
        .all() as Array<{
        employee_code: string;
        name: string;
        rank: string | null;
        deleted_at: string | null;
      }>;

      const probeCodes = (
        database
          ?.prepare("SELECT DISTINCT employee_code FROM allowance_calculations")
          .all() as Array<{ employee_code: string }>
      ).map((row) => row.employee_code);

      expect(probeCodes.length).toBeGreaterThan(0);

      // The shipped 0.5.3 lookup finds nothing — this is the defect the operator hit.
      probeCodes.forEach((code) => {
        expect(resolveRankTheWayShippedDid(employeesNow, code), code).toBeUndefined();
      });

      const exported = await exportAllowanceDocuments(
        { calculationIds: calculations.map((item) => item.id), outputFormat: "xlsx" },
        { userDataPath: fixture.userDataPath }
      );

      expect(exported.ok).toBe(true);

      if (!exported.ok) {
        return;
      }

      const rows = await readAttachmentOneRankRows(exported.data.attachment1Path);

      expect(rows.length).toBeGreaterThan(0);
      // The current export trims both sides, so every row resolves despite the whitespace.
      expect(rows.every((row) => row.rank === "과장")).toBe(true);
      expect(exported.data.rankMissingEmployeeNames ?? []).toHaveLength(0);
    },
    longTimeoutMs
  );

  it(
    "퇴사로 삭제 처리된 인력도 그 달 문서에는 직급이 찍힌다",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: testRoot,
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);

      registerDocumentTemplates();

      const database = getSqliteDatabase();
      const calculations = await approveAndCalculateEverything(fixture, detail);

      database?.prepare("UPDATE allowance_calculations SET employee_rank = NULL").run();

      // Worked that month, deleted afterwards. 0.5.3 dropped these rows from the lookup entirely.
      database
        ?.prepare(
          `UPDATE employees
              SET rank = '대리',
                  deleted_at = '2026-07-31T00:00:00.000Z',
                  name = name || '_마스터'
            WHERE employee_code LIKE 'EMP-PF-%'`
        )
        .run();

      const employeesNow = database
        ?.prepare("SELECT employee_code, name, rank, deleted_at FROM employees")
        .all() as Array<{
        employee_code: string;
        name: string;
        rank: string | null;
        deleted_at: string | null;
      }>;

      const probeCodes = (
        database
          ?.prepare("SELECT DISTINCT employee_code FROM allowance_calculations")
          .all() as Array<{ employee_code: string }>
      ).map((row) => row.employee_code);

      probeCodes.forEach((code) => {
        expect(resolveRankTheWayShippedDid(employeesNow, code), code).toBeUndefined();
      });

      const exported = await exportAllowanceDocuments(
        { calculationIds: calculations.map((item) => item.id), outputFormat: "xlsx" },
        { userDataPath: fixture.userDataPath }
      );

      expect(exported.ok).toBe(true);

      if (!exported.ok) {
        return;
      }

      const rows = await readAttachmentOneRankRows(exported.data.attachment1Path);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.rank === "대리")).toBe(true);
    },
    longTimeoutMs
  );
});
