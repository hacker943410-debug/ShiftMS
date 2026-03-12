import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPerformanceApprovalRecord, resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  applyPerformanceFileWatchEventToStorage,
  syncPendingPerformanceFilesToStorage
} from "./performance-file-intake-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPendingPerformanceFiles,
  resetPerformanceFileStorageForTest
} from "./performance-file-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const sampleDir = path.resolve(process.cwd(), "양식샘플");
const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "performance-file-intake");
const pendingDir = path.resolve(testRoot, "pending");
const approvedDir = path.resolve(testRoot, "approved");
const archivedDir = path.resolve(testRoot, "archived");
const dbPath = path.resolve(testRoot, "performance-file-intake.test.sqlite");
const settings = {
  pendingDir,
  approvedDir
};

const copySampleToPending = (fileName: string) => {
  copyFileSync(path.resolve(sampleDir, fileName), path.resolve(pendingDir, fileName));
};

const movePendingFileToArchive = (fileName: string) => {
  const sourcePath = path.resolve(pendingDir, fileName);
  const targetPath = path.resolve(archivedDir, fileName);

  copyFileSync(sourcePath, targetPath);
  rmSync(sourcePath, { force: true });
};

describe("performance-file-intake-service", () => {
  beforeEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    mkdirSync(pendingDir, { recursive: true });
    mkdirSync(approvedDir, { recursive: true });
    mkdirSync(archivedDir, { recursive: true });
    initializeSqliteStorage({ dbPath });
  });

  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should sync pending directory files into sqlite and remove deleted pending files", async () => {
    copySampleToPending("별첨1_샘플.xlsx");

    const issues = await syncPendingPerformanceFilesToStorage(settings);
    const items = listStoredPendingPerformanceFiles();

    expect(issues).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("별첨1_샘플.xlsx");

    movePendingFileToArchive("별첨1_샘플.xlsx");

    const nextIssues = await syncPendingPerformanceFilesToStorage(settings);

    expect(nextIssues).toHaveLength(0);
    expect(listStoredPendingPerformanceFiles()).toHaveLength(0);
  });

  it("should preserve approved records when the source file disappears later", async () => {
    copySampleToPending("별첨1_샘플.xlsx");
    await syncPendingPerformanceFilesToStorage(settings);

    createPerformanceApprovalRecord({
      fileId: "별첨1_샘플.xlsx",
      fileName: "별첨1_샘플.xlsx",
      decision: "approved",
      processedBy: "user-admin",
      processedByName: "관리자",
      snapshotJson: "{\"fileId\":\"별첨1_샘플.xlsx\"}"
    });

    movePendingFileToArchive("별첨1_샘플.xlsx");
    await syncPendingPerformanceFilesToStorage(settings);

    const detail = getStoredPerformanceFileDetail("별첨1_샘플.xlsx");

    expect(detail?.status).toBe("approved");
  });

  it("should apply add and remove watch events into sqlite storage", async () => {
    const filePath = path.resolve(pendingDir, "별첨1_샘플.xlsx");

    copySampleToPending("별첨1_샘플.xlsx");

    const addIssue = await applyPerformanceFileWatchEventToStorage({
      type: "file-added",
      filePath,
      settings
    });

    expect(addIssue).toBeNull();
    expect(getStoredPerformanceFileDetail("별첨1_샘플.xlsx")?.fileName).toBe("별첨1_샘플.xlsx");

    movePendingFileToArchive("별첨1_샘플.xlsx");

    const removeIssue = await applyPerformanceFileWatchEventToStorage({
      type: "file-removed",
      filePath,
      settings
    });

    expect(removeIssue).toBeNull();
    expect(getStoredPerformanceFileDetail("별첨1_샘플.xlsx")).toBeNull();
  });
});
