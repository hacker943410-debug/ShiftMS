import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AuthSession } from "../../shared/domain/model";
import { saveStoredAppSettings } from "./app-settings-storage-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import {
  approvePerformanceFile,
  getPerformanceApprovalHistory,
  rejectPerformanceFile
} from "./performance-approval-flow-service";
import { getStoredPerformanceFileDetail } from "./performance-file-storage-service";
import { syncPendingPerformanceFilesToStorage } from "./performance-file-intake-service";
import { listPendingPerformanceFiles } from "./performance-queue-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const session: AuthSession = {
  userId: "user-admin",
  loginId: "admin",
  role: "admin",
  displayName: "관리자",
  expiresAt: "2026-03-11T18:00:00+09:00",
  sessionToken: "session-token"
};

describe("performance-approval-flow-service", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetSqliteStorageForTest();
    rmSync(path.resolve(process.cwd(), "artifacts", "tests", "performance-approval-flow"), {
      recursive: true,
      force: true
    });
  });

  it("should approve a pending file and remove it from the pending queue", async () => {
    const items = await listPendingPerformanceFiles();
    const target = items[0];

    expect(target).toBeDefined();

    const result = await approvePerformanceFile(
      {
        fileId: target.id,
        comment: "1차 확인 완료"
      },
      session
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.decision).toBe("approved");

    const nextItems = await listPendingPerformanceFiles();
    expect(nextItems.some((item) => item.id === target.id)).toBe(false);
  });

  it("should reject a pending file and store the rejection reason in history", async () => {
    const items = await listPendingPerformanceFiles();
    const target = items[0];

    const result = await rejectPerformanceFile(
      {
        fileId: target.id,
        rejectionReason: "근무시간 값 확인 필요",
        comment: "행 누락 검토 요청"
      },
      session
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const history = getPerformanceApprovalHistory();

    expect(history.data[0]?.fileId).toBe(target.id);
    expect(history.data[0]?.decision).toBe("rejected");
    expect(history.data[0]?.rejectionReason).toBe("근무시간 값 확인 필요");
    expect(history.data[0]?.snapshotJson).toContain(`"fileId":"${target.id}"`);
  });

  it("should block duplicate processing for the same file", async () => {
    const items = await listPendingPerformanceFiles();
    const target = items[0];

    await approvePerformanceFile(
      {
        fileId: target.id
      },
      session
    );

    const secondResult = await rejectPerformanceFile(
      {
        fileId: target.id,
        rejectionReason: "중복 처리"
      },
      session
    );

    expect(secondResult.ok).toBe(false);
    if (secondResult.ok) {
      return;
    }

    expect(secondResult.errorCode).toBe("PERFORMANCE_ALREADY_PROCESSED");
  });

  it("should archive the approved source file into the approved directory when runtime storage is configured", async () => {
    const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "performance-approval-flow");
    const dbPath = path.resolve(testRoot, "approval-flow.test.sqlite");
    const userDataPath = path.resolve(testRoot, "user-data");
    const pendingDir = path.resolve(testRoot, "imports", "pending");
    const approvedDir = path.resolve(testRoot, "imports", "approved");
    const scheduleExportDir = path.resolve(testRoot, "exports");
    const sourceFilePath = path.resolve(pendingDir, "별첨1_샘플.xlsx");

    mkdirSync(pendingDir, { recursive: true });
    copyFileSync(
      path.resolve(process.cwd(), "양식샘플", "별첨1_샘플.xlsx"),
      sourceFilePath
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

    const target = (await listPendingPerformanceFiles()).find(
      (item) => item.fileName === "별첨1_샘플.xlsx"
    );

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    const result = await approvePerformanceFile(
      {
        fileId: target.id,
        comment: "archive flow"
      },
      session,
      {
        userDataPath
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.archivedFilePath).toContain(path.resolve(approvedDir, "2024-10"));
    expect(existsSync(sourceFilePath)).toBe(false);
    expect(existsSync(result.data.archivedFilePath as string)).toBe(true);

    const archivedDetail = getStoredPerformanceFileDetail(target.id);

    expect(archivedDetail?.directoryType).toBe("approved");
    expect(archivedDetail?.filePath).toBe(result.data.archivedFilePath);
    expect(archivedDetail?.status).toBe("approved");
  });
});
