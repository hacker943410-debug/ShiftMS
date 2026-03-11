import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PerformanceFileDetail } from "../../shared/domain/performance-file";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPendingPerformanceFiles,
  resetPerformanceFileStorageForTest,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";

const sampleDetail: PerformanceFileDetail = {
  id: "별첨1_샘플.xlsx",
  fileName: "별첨1_샘플.xlsx",
  filePath: "C:\\ShiftMgmt\\양식샘플\\별첨1_샘플.xlsx",
  directoryType: "pending",
  templateKind: "attachment1",
  sheetName: "별첨1",
  rowCount: 10,
  columnCount: 12,
  fileSize: 1024,
  modifiedTimeMs: 1710000000123,
  duplicateKey: "duplicate-key",
  receivedAt: "2026-03-11T10:00:00+09:00",
  status: "pending",
  previewRows: [{ 사번: "2014015", 성명: "박경훈" }],
  approvalHistory: [],
  latestApproval: null
};

describe("performance-file-storage-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should upsert runtime performance file metadata into sqlite", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    upsertPerformanceFileDetail(sampleDetail);

    const items = listStoredPendingPerformanceFiles();

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(sampleDetail.id);

    const detail = getStoredPerformanceFileDetail(sampleDetail.id);

    expect(detail?.previewRows[0]).toMatchObject({
      사번: "2014015",
      성명: "박경훈"
    });
  });
});
