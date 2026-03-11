import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createPerformanceApprovalRecord,
  getLatestPerformanceApproval,
  getPerformanceApprovalHistory,
  listPerformanceApprovalHistory,
  resetPerformanceApprovalStateForTest,
  resolvePerformanceFileStatus
} from "./performance-approval-service";
import {
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

describe("performance-approval-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetSqliteStorageForTest();
  });

  it("should store approval records and update file status", () => {
    const record = createPerformanceApprovalRecord({
      fileId: "file-1",
      fileName: "별첨1_샘플.xlsx",
      decision: "approved",
      processedBy: "user-admin",
      processedByName: "관리자",
      comment: "검토 완료"
    });

    expect(record.decision).toBe("approved");
    expect(resolvePerformanceFileStatus("file-1", "pending")).toBe("approved");
    expect(getLatestPerformanceApproval("file-1")?.id).toBe(record.id);
    expect(getPerformanceApprovalHistory("file-1")).toHaveLength(1);
  });

  it("should keep latest history item first", () => {
    createPerformanceApprovalRecord({
      fileId: "file-1",
      fileName: "별첨1_샘플.xlsx",
      decision: "approved",
      processedBy: "user-admin",
      processedByName: "관리자"
    });
    const rejected = createPerformanceApprovalRecord({
      fileId: "file-2",
      fileName: "별첨2_샘플.xlsx",
      decision: "rejected",
      processedBy: "user-operator",
      processedByName: "운영담당",
      rejectionReason: "사번 누락"
    });

    expect(listPerformanceApprovalHistory()[0]?.id).toBe(rejected.id);
    expect(resolvePerformanceFileStatus("file-2", "pending")).toBe("rejected");
  });

  it("should persist approval history in sqlite when storage is initialized", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-approval.test.sqlite")
    });

    const record = createPerformanceApprovalRecord({
      fileId: "file-sqlite",
      fileName: "별첨1_샘플.xlsx",
      decision: "approved",
      processedBy: "user-admin",
      processedByName: "관리자",
      snapshotJson: "{\"fileId\":\"file-sqlite\"}"
    });

    expect(getLatestPerformanceApproval("file-sqlite")?.id).toBe(record.id);
    expect(listPerformanceApprovalHistory()[0]?.fileId).toBe("file-sqlite");
    expect(getLatestPerformanceApproval("file-sqlite")?.snapshotJson).toBe(
      "{\"fileId\":\"file-sqlite\"}"
    );
    expect(resolvePerformanceFileStatus("file-sqlite", "pending")).toBe("approved");
  });
});
