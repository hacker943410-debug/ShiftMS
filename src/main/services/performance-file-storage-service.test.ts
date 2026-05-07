import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PerformanceFileDetail } from "../../shared/domain/performance-file";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  listStoredPerformanceFileReferences,
  listStoredPendingPerformanceFiles,
  markStoredPerformanceFileArchived,
  resetPerformanceFileStorageForTest,
  upsertPerformanceFileDetail
} from "./performance-file-storage-service";
import {
  createPerformanceApprovalRecord,
  resetPerformanceApprovalStateForTest
} from "./performance-approval-service";

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
  scheduleMonth: "2026-07",
  siteName: "보안팀",
  scheduleKey: "2026-07:보안팀",
  entryCount: 1,
  approvedEntryCount: 0,
  warningCount: 0,
  isEffective: false,
  status: "pending",
  alerts: [],
  previewRows: [{ 사번: "2014015", 성명: "박경훈" }],
  entries: [
    {
      id: "entry-1",
      performanceFileId: "별첨1_샘플.xlsx",
      logicalKey: "2026-07:보안팀:entry-1",
      scheduleMonth: "2026-07",
      scheduleKey: "2026-07:보안팀",
      siteName: "보안팀",
      employeeCode: "2014015",
      employeeName: "박경훈",
      workDate: "2026-07-01",
      workType: "overtime",
      section: "overtime",
      breakMinutes: 0,
      totalWorkMinutes: 480,
      baseWorkMinutes: 480,
      overtimeMinutes: 0,
      nightMinutes: 0,
      sourceRowNumber: 11,
      sortOrder: 1,
      alerts: [],
      status: "pending",
      workHours: 8,
      department: "보안팀",
      category: "주간",
      hourlyRate: 12500
    }
  ],
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
    expect(detail?.entries[0]).toMatchObject({
      employeeCode: "2014015",
      employeeName: "박경훈",
      workDate: "2026-07-01",
      workHours: 8
    });
  });

  it("should block overwriting an approved file with a different parsed source", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    upsertPerformanceFileDetail(sampleDetail);
    createPerformanceApprovalRecord({
      fileId: sampleDetail.id,
      fileName: sampleDetail.fileName,
      decision: "approved",
      processedBy: "user-admin",
      processedByName: "관리자",
      snapshotJson: "{\"fileId\":\"별첨1_샘플.xlsx\"}"
    });
    markStoredPerformanceFileArchived({
      fileId: sampleDetail.id,
      archivedFilePath: "C:\\ShiftMgmt\\승인완료\\2026년\\7월\\별첨1_샘플.xlsx",
      archivedFileName: sampleDetail.fileName,
      completedAt: "2026-03-11T10:10:00+09:00"
    });

    expect(() =>
      upsertPerformanceFileDetail({
        ...sampleDetail,
        fileSize: 2048,
        modifiedTimeMs: sampleDetail.modifiedTimeMs + 1000,
        previewRows: [{ 사번: "9999999", 성명: "덮어쓰기대상" }],
        entries: [
          {
            ...sampleDetail.entries[0]!,
            id: "entry-overwrite",
            employeeCode: "9999999",
            employeeName: "덮어쓰기대상",
            workDate: "2030-01-01",
            workHours: 1
          }
        ]
      })
    ).toThrowError("이미 승인 또는 반려된 실적 파일은 다른 원본으로 덮어쓸 수 없습니다.");

    const detail = getStoredPerformanceFileDetail(sampleDetail.id);

    expect(detail?.fileSize).toBe(sampleDetail.fileSize);
    expect(detail?.entries[0]?.employeeCode).toBe("2014015");
  });

  it("should filter stored details and references without resolving approval-heavy fields", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    upsertPerformanceFileDetail(sampleDetail);
    upsertPerformanceFileDetail({
      ...sampleDetail,
      id: "approved-sample.xlsx",
      fileName: "approved-sample.xlsx",
      filePath: "C:\\ShiftMgmt\\승인완료\\2026년\\7월\\approved-sample.xlsx",
      directoryType: "approved",
      status: "approved",
      approvedEntryCount: 1,
      entries: sampleDetail.entries.map((entry) => ({
        ...entry,
        id: "approved-entry-1",
        performanceFileId: "approved-sample.xlsx"
      }))
    });

    const pendingDetails = listStoredPerformanceFileDetails(
      {
        directoryTypes: ["pending"],
        scheduleMonth: "2026-07"
      },
      {
        resolveApprovalFields: false,
        resolveEntryApprovalStatus: false
      }
    );
    const references = listStoredPerformanceFileReferences({
      directoryTypes: ["pending", "approved"],
      scheduleMonth: "2026-07"
    });

    expect(pendingDetails.map((detail) => detail.id)).toEqual([sampleDetail.id]);
    expect(pendingDetails[0]?.approvalHistory).toEqual([]);
    expect(references.map((detail) => detail.id).sort()).toEqual([
      "approved-sample.xlsx",
      sampleDetail.id
    ]);
  });
});
