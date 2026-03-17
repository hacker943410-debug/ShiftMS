import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthSession } from "../../shared/domain/model";
import { saveStoredAppSettings } from "./app-settings-storage-service";
import {
  exportAllowanceDocuments
} from "./allowance-document-export-service";
import { listStoredAllowanceDocumentExports, resetAllowanceDocumentExportHistoryForTest } from "./allowance-document-export-history-service";
import { saveStoredDocumentTemplateVersion } from "./operations-storage-service";
import { runApprovedAllowanceCalculation } from "./approved-allowance-calculation-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { syncPendingPerformanceFilesToStorage } from "./performance-file-intake-service";
import { listStoredPendingPerformanceFiles } from "./performance-file-storage-service";
import {
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const session: AuthSession = {
  userId: "user-admin",
  loginId: "admin",
  role: "admin",
  displayName: "관리자",
  expiresAt: "2026-03-11T18:00:00+09:00",
  sessionToken: "session-token"
};

describe("allowance-document-export-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetSqliteStorageForTest();
    rmSync(path.resolve(process.cwd(), "artifacts", "tests", "allowance-document-export"), {
      recursive: true,
      force: true
    });
  });

  it("should generate proposal, attachment1, and attachment2 files and store export history", async () => {
    const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "allowance-document-export");
    const dbPath = path.resolve(testRoot, "allowance-document-export.test.sqlite");
    const userDataPath = path.resolve(testRoot, "user-data");
    const pendingDir = path.resolve(testRoot, "imports", "pending");
    const approvedDir = path.resolve(testRoot, "imports", "approved");
    const scheduleExportDir = path.resolve(testRoot, "exports");

    mkdirSync(pendingDir, { recursive: true });
    copyFileSync(
      path.resolve(process.cwd(), "양식샘플", "별첨1_샘플.xlsx"),
      path.resolve(pendingDir, "별첨1_샘플.xlsx")
    );

    initializeSqliteStorage({ dbPath });
    saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir,
        approvedDir,
        scheduleExportDir
      },
      { userDataPath }
    );
    const proposalTemplate = saveStoredDocumentTemplateVersion({
      templateType: "proposal",
      versionLabel: "품의서 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "품위서_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "결재품의_{workMonth}.xlsx",
      profileSchemaVersion: "1",
      profile: {
        kind: "generic",
        primarySheetName: "품의서",
        fieldMappings: {
          sheetName: "품의서",
          workMonthCell: "B2",
          printedDateCell: "F2",
          ownerDepartmentCell: "B3",
          systemNameCell: "B4",
          documentTitleCell: "A9",
          summaryIntroCell: "A10",
          scopeCell: "A12",
          targetHeadcountCell: "A13",
          sectionTitleCell: "A15",
          dataStartRow: "28"
        }
      }
    });
    const attachment1Template = saveStoredDocumentTemplateVersion({
      templateType: "attachment1",
      versionLabel: "별첨1 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨1_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부1_{workMonth}.xlsx",
      profileSchemaVersion: "1",
      profile: {
        kind: "generic",
        primarySheetName: "별첨1",
        fieldMappings: {
          sheetName: "별첨1",
          titleCell: "B2",
          dataStartRow: "8"
        }
      }
    });
    const attachment2Template = saveStoredDocumentTemplateVersion({
      templateType: "attachment2",
      versionLabel: "별첨2 커스텀",
      sourcePath: path.resolve(process.cwd(), "양식샘플", "별첨2_샘플.xlsx"),
      status: "approved",
      isDefault: true,
      outputFileNamePattern: "첨부2_{workMonth}.xlsx",
      profileSchemaVersion: "1",
      profile: {
        kind: "generic",
        primarySheetName: "별첨2",
        fieldMappings: {
          sheetName: "별첨2",
          titleCell: "B2",
          dateRangeCell: "F2",
          dataStartRow: "9"
        }
      }
    });
    await syncPendingPerformanceFilesToStorage({
      pendingDir,
      approvedDir
    });

    const target = listStoredPendingPerformanceFiles().find(
      (item) => item.fileName === "별첨1_샘플.xlsx"
    );

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    const approval = await approvePerformanceFile(
      {
        fileId: target.id,
        comment: "document export"
      },
      session,
      { userDataPath }
    );

    expect(approval.ok).toBe(true);
    if (!approval.ok) {
      return;
    }

    const calculation = await runApprovedAllowanceCalculation(target.id);

    expect(calculation.ok).toBe(true);
    if (!calculation.ok) {
      return;
    }

    const exported = await exportAllowanceDocuments(
      {
        calculationIds: [calculation.data.id]
      },
      {
        userDataPath
      }
    );

    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      return;
    }

    expect(existsSync(exported.data.proposalPath)).toBe(true);
    expect(existsSync(exported.data.attachment1Path)).toBe(true);
    expect(existsSync(exported.data.attachment2Path)).toBe(true);
    expect(path.basename(exported.data.proposalPath)).toBe("결재품의_2024-10.xlsx");
    expect(path.basename(exported.data.attachment1Path)).toBe("첨부1_2024-10.xlsx");
    expect(path.basename(exported.data.attachment2Path)).toBe("첨부2_2024-10.xlsx");
    expect(exported.data.workMonth).toBe("2024-10");
    expect(listStoredAllowanceDocumentExports()).toHaveLength(1);
    expect(exported.data.proposalTemplateVersionId).toBe(proposalTemplate.id);
    expect(exported.data.attachment1TemplateVersionId).toBe(attachment1Template.id);
    expect(exported.data.attachment2TemplateVersionId).toBe(attachment2Template.id);

    const attachment1Workbook = new ExcelJS.Workbook();
    await attachment1Workbook.xlsx.readFile(exported.data.attachment1Path);
    const attachment1Worksheet = attachment1Workbook.getWorksheet("별첨1");

    expect(String(attachment1Worksheet?.getCell("B2").value ?? "")).toContain("2024년 10월");
    expect(String(attachment1Worksheet?.getCell("B8").value ?? "")).toBeTruthy();
    expect(String(attachment1Worksheet?.getCell("C8").value ?? "")).toBeTruthy();

    const proposalWorkbook = new ExcelJS.Workbook();
    await proposalWorkbook.xlsx.readFile(exported.data.proposalPath);
    const proposalWorksheet = proposalWorkbook.getWorksheet("품의서");

    expect(String(proposalWorksheet?.getCell("B2").value ?? "")).toBe("2024-10");
    expect(String(proposalWorksheet?.getCell("A9").value ?? "")).toContain("2024년 10월");

    const attachment2Workbook = new ExcelJS.Workbook();
    await attachment2Workbook.xlsx.readFile(exported.data.attachment2Path);
    const attachment2Worksheet = attachment2Workbook.getWorksheet("별첨2");

    expect(String(attachment2Worksheet?.getCell("B2").value ?? "")).toContain("202410");
    expect(String(attachment2Worksheet?.getCell("F2").value ?? "")).toContain("2024.10.1");
    expect(String(attachment2Worksheet?.getCell("B9").value ?? "")).toBeTruthy();
  });
});
