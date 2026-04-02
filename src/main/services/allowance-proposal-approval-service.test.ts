import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listApprovedAllowanceCalculationResults,
  runApprovedAllowanceCalculation
} from "./approved-allowance-calculation-service";
import {
  listAllowanceApprovalHistory,
  resetAllowanceApprovalStateForTest,
  reviewAllowanceCalculations
} from "./allowance-approval-service";
import {
  approveAllowanceProposal,
  listAllowanceProposalApprovalHistory,
  previewAllowanceProposalApproval,
  resetAllowanceProposalApprovalStateForTest
} from "./allowance-proposal-approval-service";
import { resetAllowanceDocumentExportHistoryForTest } from "./allowance-document-export-history-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  saveStoredDocumentTemplateVersion
} from "./operations-storage-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { resetSqliteStorageForTest } from "./sqlite-storage-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "allowance-proposal-approval");

const registerDefaultTemplates = () => {
  saveStoredDocumentTemplateVersion({
    templateType: "proposal",
    versionLabel: "품의서 커스텀",
    sourcePath: path.resolve(
      process.cwd(),
      "양식샘플",
      "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
    ),
    status: "approved",
    isDefault: true,
    outputFileNamePattern: "결재품의_{workMonth}.xlsx"
  });
  saveStoredDocumentTemplateVersion({
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
  saveStoredDocumentTemplateVersion({
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
};

describe("allowance-proposal-approval-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetAllowanceApprovalStateForTest();
    resetAllowanceProposalApprovalStateForTest();
    resetAllowanceDocumentExportHistoryForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    resetPreparedReturnedScheduleRoot(testRoot);
  });

  it("should review allowances, preview the proposal, and finalize proposal approval with backup", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: testRoot,
      templateVariant: "sample1"
    });
    const detail = await syncPreparedReturnedSchedule(fixture);

    registerDefaultTemplates();

    for (const entry of detail.entries) {
      await approvePerformanceFile(
        {
          fileId: detail.id,
          entryId: entry.id
        },
        testAdminSession,
        {
          userDataPath: fixture.userDataPath
        }
      );
    }

    const calculatedIds: string[] = [];
    for (const entry of detail.entries) {
      const calculation = await runApprovedAllowanceCalculation({ entryId: entry.id });

      expect(calculation.ok).toBe(true);
      if (!calculation.ok) {
        return;
      }

      calculatedIds.push(calculation.data.id);
    }

    const reviewResult = await reviewAllowanceCalculations(
      {
        calculationIds: calculatedIds,
        decision: "approved"
      },
      testAdminSession
    );

    expect(reviewResult.ok).toBe(true);
    expect(listAllowanceApprovalHistory()).toHaveLength(calculatedIds.length);

    const previewResult = previewAllowanceProposalApproval({
      calculationIds: calculatedIds
    });

    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) {
      return;
    }

    expect(previewResult.data.calculationCount).toBe(calculatedIds.length);
    expect(previewResult.data.totalAllowanceAmount).toBeGreaterThan(0);

    const proposalResult = await approveAllowanceProposal(
      {
        calculationIds: calculatedIds,
        comment: "월 마감 승인",
        outputFormat: "xlsx"
      },
      testAdminSession,
      {
        userDataPath: fixture.userDataPath
      }
    );

    expect(proposalResult.ok).toBe(true);
    if (!proposalResult.ok) {
      return;
    }

    expect(proposalResult.data.outputFormat).toBe("xlsx");
    expect(proposalResult.data.comment).toBe("월 마감 승인");
    expect(existsSync(proposalResult.data.backupSummary.jsonBackupPath)).toBe(true);
    expect(listAllowanceProposalApprovalHistory()).toHaveLength(1);

    const latestStatuses = listApprovedAllowanceCalculationResults()
      .filter((record) => calculatedIds.includes(record.id))
      .map((record) => record.status);

    expect(latestStatuses).toEqual(Array.from({ length: calculatedIds.length }, () => "proposal-approved"));
  });
});
