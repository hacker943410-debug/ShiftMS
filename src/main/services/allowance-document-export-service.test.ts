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
    expect(exported.data.workMonth).toBe("2024-10");
    expect(listStoredAllowanceDocumentExports()).toHaveLength(1);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported.data.attachment1Path);
    const worksheet = workbook.getWorksheet("별첨1");

    expect(String(worksheet?.getCell("A1").value ?? "")).toContain("2024년 10월");
    expect(String(worksheet?.getCell("B5").value ?? "")).toBeTruthy();
    expect(String(worksheet?.getCell("C5").value ?? "")).toBeTruthy();
  });
});
