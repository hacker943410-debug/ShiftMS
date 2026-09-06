import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PerformanceFileDetail } from "../../shared/domain/performance-file";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";
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

const withEntryIds = (detail: PerformanceFileDetail, entryIds: string[]): PerformanceFileDetail => ({
  ...detail,
  entryCount: entryIds.length,
  entries: entryIds.map((entryId, index) => ({
    ...detail.entries[0]!,
    id: entryId,
    logicalKey: `${detail.entries[0]!.logicalKey}:${entryId}`,
    sortOrder: index + 1
  }))
});

// The shape every failed open produces: nothing was read, so nothing is known about the workbook.
const createUnreadDetail = (detail: PerformanceFileDetail): PerformanceFileDetail => ({
  ...detail,
  status: "error",
  templateKind: "unknown",
  templateVariant: undefined,
  sheetName: "",
  rowCount: 0,
  columnCount: 0,
  scheduleMonth: "",
  siteName: "",
  scheduleKey: "",
  entryCount: 0,
  entries: [],
  previewRows: [],
  errorMessage: "EBUSY: resource busy or locked"
});

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

  it("should keep the stored file and its entries when one entry insert fails mid-save", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    const twoEntryDetail = withEntryIds(sampleDetail, ["entry-1", "entry-2"]);

    upsertPerformanceFileDetail(twoEntryDetail);

    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    // The parent row and the first entry go in, then the save dies. Without one transaction the
    // file kept the new size and modified time while holding a single leftover entry - and that
    // pairing is what every later scan reads as "already up to date".
    database.exec(`
      CREATE TRIGGER block_second_entry BEFORE INSERT ON performance_entries
      WHEN (SELECT COUNT(*) FROM performance_entries WHERE performance_file_id = NEW.performance_file_id) >= 1
      BEGIN SELECT RAISE(ABORT, 'injected'); END;
    `);

    expect(() =>
      upsertPerformanceFileDetail({
        ...withEntryIds(sampleDetail, ["entry-1", "entry-2", "entry-3"]),
        fileSize: 4096,
        modifiedTimeMs: sampleDetail.modifiedTimeMs + 5000,
        entryCount: 3
      })
    ).toThrowError();

    database.exec("DROP TRIGGER block_second_entry");

    const stored = getStoredPerformanceFileDetail(sampleDetail.id);

    expect(stored?.fileSize).toBe(sampleDetail.fileSize);
    expect(stored?.modifiedTimeMs).toBe(sampleDetail.modifiedTimeMs);
    expect(stored?.entryCount).toBe(2);
    expect(stored?.entries.map((entry) => entry.id)).toEqual(["entry-1", "entry-2"]);
  });

  it("should join a transaction the caller opened instead of committing on its own", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("시험용 데이터베이스가 없습니다.");
    }

    database.exec("BEGIN");
    upsertPerformanceFileDetail(sampleDetail);

    expect(database.isTransaction).toBe(true);

    database.exec("ROLLBACK");

    expect(getStoredPerformanceFileDetail(sampleDetail.id)).toBeNull();
  });

  it("should keep the last analysis when a re-read never opened the workbook", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    upsertPerformanceFileDetail({ ...sampleDetail, status: "rejected" });

    const result = upsertPerformanceFileDetail(createUnreadDetail(sampleDetail));

    expect(result.keptExistingAnalysis).toBe(true);

    const stored = getStoredPerformanceFileDetail(sampleDetail.id);

    expect(stored?.status).toBe("rejected");
    expect(stored?.scheduleMonth).toBe("2026-07");
    expect(stored?.siteName).toBe("보안팀");
    expect(stored?.entries).toHaveLength(1);
    expect(stored?.fileSize).toBe(sampleDetail.fileSize);
  });

  it("should still store a workbook that was opened and rejected for its format", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    upsertPerformanceFileDetail(sampleDetail);

    const result = upsertPerformanceFileDetail({
      ...createUnreadDetail(sampleDetail),
      sheetName: "잘못된 양식",
      rowCount: 4,
      columnCount: 2,
      errorMessage: "실적 파일 파싱 규격이 일치하지 않습니다."
    });

    expect(result.keptExistingAnalysis).toBe(false);

    const stored = getStoredPerformanceFileDetail(sampleDetail.id);

    expect(stored?.status).toBe("error");
    expect(stored?.entries).toHaveLength(0);
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

  // The reason code is what tells a wage alert apart from an employment one without matching Korean
  // sentences. It has to survive the round trip through the entry store, and an unknown code has to
  // be dropped so a consumer never reasons about a value this build has no meaning for. The code
  // stays out of every equivalence comparison (see normalizeAlerts), so carrying it back cannot flip
  // an approval.
  it("should keep a known alert reason code across the entry store, and drop an unknown one", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "performance-files.test.sqlite")
    });

    upsertPerformanceFileDetail({
      ...sampleDetail,
      entries: [
        {
          ...sampleDetail.entries[0]!,
          alerts: [
            {
              severity: "error",
              message: "적용 시급을 찾지 못했습니다.",
              reasonCode: "wage-missing-effective-rate"
            },
            {
              severity: "error",
              message: "고용 기간 밖 근무는 승인할 수 없습니다.",
              reasonCode: "employment-period-violation"
            },
            {
              severity: "warning",
              message: "알 수 없는 코드가 붙은 알림",
              reasonCode: "future-code-this-build-does-not-know"
            } as unknown as (typeof sampleDetail.entries)[number]["alerts"][number]
          ]
        }
      ]
    });

    const alerts = getStoredPerformanceFileDetail(sampleDetail.id)?.entries[0]?.alerts ?? [];

    expect(alerts.map((alert) => alert.reasonCode)).toEqual([
      "wage-missing-effective-rate",
      "employment-period-violation",
      undefined
    ]);
    // The message and severity are untouched, so nothing a comparison reads has moved.
    expect(alerts[2]?.message).toBe("알 수 없는 코드가 붙은 알림");
    expect(alerts[2]?.severity).toBe("warning");
  });

});
