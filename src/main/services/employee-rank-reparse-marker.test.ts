// F6: the 직급 is a parser input, so changing it has to reach the pending rows that were parsed
// with the old one — but it must never disturb a row that is already approved.
//
// The parser stamps the rank it reads onto every performance entry; on approval that rank is
// copied into the allowance calculation and it is the 직급 the 별첨1 document prints. Until now
// saveStoredEmployee compared only 사번/이름/입사일/퇴사일 when deciding whether to leave the
// employee-master reparse marker, so a corrected rank never reached an already-parsed pending file.
//
// These tests drive the real path end to end and pin BOTH halves of the rule:
//   1. a rank change re-reads the pending rows and carries through to 별첨1,
//   2. an already-approved row keeps its approval, its counts and its rank snapshot (forward-only),
//      and the only way to correct it stays 승인대기로 되돌리기 → 재승인.
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import type { EmployeeRank } from "../../shared/domain/employee-rank";
import { reviewAllowanceCalculations } from "./allowance-approval-service";
import { resetAllowanceDocumentExportHistoryForTest } from "./allowance-document-export-history-service";
import { exportAllowanceDocuments } from "./allowance-document-export-service";
import { isReparseMonthCovered, peekReparseMarker } from "./app-settings-storage-service";
import { listApprovedAllowanceCalculationResults } from "./approved-allowance-calculation-service";
import { listStoredEmployees, saveStoredEmployee } from "./employee-storage-service";
import { saveStoredDocumentTemplateVersion } from "./operations-storage-service";
import {
  approvePerformanceFile,
  returnApprovedPerformanceFileToPending
} from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  getStoredPerformanceFileDetail,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import { listPerformanceOverview } from "./performance-management-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { getSqliteDatabase, resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRootBase = path.resolve(process.cwd(), "artifacts", "tests", "employee-rank-reparse");
const allocatedTestRoots: string[] = [];
const scheduleMonth = "2026-03";
const longTimeoutMs = 180000;

const createTestRoot = () => {
  const root = path.resolve(testRootBase, `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);

  allocatedTestRoots.push(root);
  return root;
};

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

// Same D column reader the 별첨1 직급 regression tests use.
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

// Saves the person with a new rank and nothing else changed, the way the 인력 관리 screen does.
const setEmployeeRank = (employeeCode: string, rank: EmployeeRank) => {
  const person = listStoredEmployees().find((employee) => employee.employeeCode === employeeCode);

  if (!person) {
    throw new Error(`인력을 찾지 못했습니다: ${employeeCode}`);
  }

  saveStoredEmployee({
    id: person.id,
    employeeCode: person.employeeCode,
    name: person.name,
    rank,
    employmentType: person.employmentType,
    status: person.status,
    hireDate: person.hireDate ?? "2024-01-01"
  });
};

describe("employee rank reparse marker", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it(
    "carries a corrected rank into the pending rows and on into 별첨1, re-reading the files only once",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: createTestRoot(),
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);
      const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
      const overtimeRow = () =>
        getStoredPerformanceFileDetail(detail.id)?.entries.find(
          (entry) => entry.section === "overtime" && entry.employeeName === fixture.workers.overtime.name
        );

      registerDocumentTemplates();

      await listPerformanceOverview({ approvalScope: "pending", scheduleMonth }, settings);

      // Parsed with the rank the master carried at the time.
      expect(overtimeRow()?.employeeRank).toBe("사원");
      expect(peekReparseMarker("employee-master")).toBeNull();

      // Promotion day: three people's ranks corrected one after another. The marker is a single
      // token per kind, so the saves pile up into one outstanding re-read, not three.
      setEmployeeRank(fixture.workers.overtime.employeeCode, "과장");

      const firstToken = peekReparseMarker("employee-master");

      expect(firstToken).not.toBeNull();

      setEmployeeRank(fixture.workers.holiday.employeeCode, "대리");
      setEmployeeRank(fixture.workers.substituteOriginal.employeeCode, "차장");

      const token = peekReparseMarker("employee-master");

      // Each save replaces the token rather than queueing another one.
      expect(token).not.toBeNull();
      expect(token).not.toBe(firstToken);

      // The workbook on disk never changed; only the marker can make this read the file again.
      await listPerformanceOverview({ approvalScope: "pending", scheduleMonth }, settings);

      expect(overtimeRow()?.employeeRank).toBe("과장");
      expect(isReparseMonthCovered("employee-master", token!, scheduleMonth)).toBe(true);

      // Cost ceiling: with this month recorded against the token, the next overview of the same
      // month reuses the stored rows. A wage stamped straight into the row survives a reuse and is
      // wiped by a re-read, so it proves the three rank saves bought exactly one reparse.
      const probedEntryId = overtimeRow()?.id;

      expect(probedEntryId).toBeDefined();
      getSqliteDatabase()!
        .prepare("UPDATE performance_entries SET hourly_rate = 1 WHERE id = ?")
        .run(probedEntryId!);

      await listPerformanceOverview({ approvalScope: "pending", scheduleMonth }, settings);
      expect(overtimeRow()?.hourlyRate).toBe(1);

      // A full-period overview spends the marker and reads every month, which also clears the probe.
      await listPerformanceOverview({ approvalScope: "pending" }, settings);

      expect(peekReparseMarker("employee-master")).toBeNull();
      expect(overtimeRow()?.hourlyRate).toBeGreaterThan(1);
      expect(overtimeRow()?.employeeRank).toBe("과장");

      // Approve everything: the new rank is what the approval snapshot keeps...
      const approvable = getStoredPerformanceFileDetail(detail.id)?.entries ?? [];

      for (const entry of approvable) {
        const approved = await approvePerformanceFile(
          { fileId: detail.id, entryId: entry.id },
          testAdminSession,
          { userDataPath: fixture.userDataPath }
        );

        expect(approved.ok).toBe(true);
      }

      const calculations = listApprovedAllowanceCalculationResults().filter(
        (item) => item.fileId === detail.id
      );
      const overtimeCalculation = calculations.find(
        (item) => item.employeeCode === fixture.workers.overtime.employeeCode
      );

      expect(overtimeCalculation?.employeeRank).toBe("과장");

      // ...and 별첨1 prints it.
      const reviewed = await reviewAllowanceCalculations(
        { calculationIds: calculations.map((item) => item.id), decision: "approved" },
        testAdminSession
      );

      expect(reviewed.ok).toBe(true);

      const exported = await exportAllowanceDocuments(
        { calculationIds: calculations.map((item) => item.id), outputFormat: "xlsx" },
        { userDataPath: fixture.userDataPath }
      );

      expect(exported.ok).toBe(true);

      if (!exported.ok) {
        return;
      }

      const documentRows = await readAttachmentOneRankRows(exported.data.attachment1Path);
      const overtimeDocumentRow = documentRows.find(
        (row) => row.code === fixture.workers.overtime.employeeCode
      );

      expect(overtimeDocumentRow?.rank).toBe("과장");
    },
    longTimeoutMs
  );

  it(
    "leaves an already approved row untouched when the rank changes, and corrects it only through 승인대기로 되돌리기",
    async () => {
      const fixture = await prepareReturnedScheduleFixture({
        rootDir: createTestRoot(),
        templateVariant: "sample1"
      });
      const detail = await syncPreparedReturnedSchedule(fixture);
      const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
      const overtimeCalculation = () =>
        listApprovedAllowanceCalculationResults()
          .filter((item) => item.fileId === detail.id)
          .find((item) => item.employeeCode === fixture.workers.overtime.employeeCode);

      await listPerformanceOverview({ approvalScope: "pending", scheduleMonth }, settings);

      // Approve the whole file FIRST, at the old rank.
      for (const entry of detail.entries) {
        const approved = await approvePerformanceFile(
          { fileId: detail.id, entryId: entry.id },
          testAdminSession,
          { userDataPath: fixture.userDataPath }
        );

        expect(approved.ok).toBe(true);
      }

      expect(getStoredPerformanceFileDetail(detail.id)?.directoryType).toBe("approved");
      expect(overtimeCalculation()?.employeeRank).toBe("사원");

      const before = await listPerformanceOverview(
        { approvalScope: "approved", scheduleMonth },
        settings
      );

      expect(before.approvedCount).toBeGreaterThan(0);

      // Now the rank is corrected. Nothing about the approved rows may move.
      setEmployeeRank(fixture.workers.overtime.employeeCode, "과장");
      expect(peekReparseMarker("employee-master")).not.toBeNull();

      const after = await listPerformanceOverview(
        { approvalScope: "approved", scheduleMonth },
        settings
      );
      const afterRow = after.groups
        .flatMap((group) => group.rows)
        .find(
          (row) =>
            row.entry.section === "overtime" &&
            row.entry.employeeName === fixture.workers.overtime.name
        );

      expect(afterRow?.approvalStatus).toBe("approved");
      expect(afterRow?.needsReapproval).toBe(false);
      expect(afterRow?.reapprovalStatus).toBe("none");
      expect(after.approvedCount).toBe(before.approvedCount);
      expect(after.needsReapprovalCount).toBe(before.needsReapprovalCount);
      expect(after.rowCount).toBe(before.rowCount);

      // The approval snapshot is history: it still says what it was approved with.
      expect(overtimeCalculation()?.employeeRank).toBe("사원");

      // The one supported correction: return the file to 승인대기, let it be read again, re-approve.
      const returned = await returnApprovedPerformanceFileToPending(
        { fileId: detail.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(returned.ok).toBe(true);
      expect(overtimeCalculation()).toBeUndefined();

      await listPerformanceOverview({ approvalScope: "pending", scheduleMonth }, settings);

      const reread = getStoredPerformanceFileDetail(detail.id);

      expect(reread?.directoryType).toBe("pending");
      expect(
        reread?.entries.find(
          (entry) =>
            entry.section === "overtime" && entry.employeeName === fixture.workers.overtime.name
        )?.employeeRank
      ).toBe("과장");

      for (const entry of reread?.entries ?? []) {
        const approved = await approvePerformanceFile(
          { fileId: detail.id, entryId: entry.id },
          testAdminSession,
          { userDataPath: fixture.userDataPath }
        );

        expect(approved.ok).toBe(true);
      }

      expect(overtimeCalculation()?.employeeRank).toBe("과장");
    },
    longTimeoutMs
  );
});
