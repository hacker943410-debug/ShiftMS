import { describe, expect, it, vi } from "vitest";

import { createPerformanceFileMetadataRecord, updatePerformanceFileMetadataStatus } from "./performance-file-metadata-service";

describe("createPerformanceFileMetadataRecord", () => {
  it("should create a pending metadata record from a watch event and template inspection", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T08:00:00.000Z"));

    const record = createPerformanceFileMetadataRecord({
      watchEvent: {
        type: "file-added",
        filePath: "C:\\ShiftMgmt\\data\\imports\\pending\\별첨1_샘플.xlsx",
        fileName: "별첨1_샘플.xlsx",
        directoryType: "pending",
        duplicateKey: "dup-key-1"
      },
      inspection: {
        fileName: "별첨1_샘플.xlsx",
        sheetName: "별첨1",
        templateKind: "attachment1",
        rowCount: 131,
        columnCount: 19
      },
      fileSize: 27845,
      modifiedTimeMs: 1730872882000
    });

    expect(record).toMatchObject({
      fileName: "별첨1_샘플.xlsx",
      filePath: "C:\\ShiftMgmt\\data\\imports\\pending\\별첨1_샘플.xlsx",
      directoryType: "pending",
      templateKind: "attachment1",
      sheetName: "별첨1",
      rowCount: 131,
      columnCount: 19,
      fileSize: 27845,
      modifiedTimeMs: 1730872882000,
      duplicateKey: "dup-key-1",
      receivedAt: "2026-03-11T08:00:00.000Z",
      status: "pending"
    });
    expect(record.id).toBeTruthy();

    vi.useRealTimers();
  });

  it("should create an error record from a watcher error event", () => {
    const record = createPerformanceFileMetadataRecord({
      watchEvent: {
        type: "watcher-error",
        filePath: "C:\\ShiftMgmt\\data\\imports\\pending",
        fileName: "pending",
        directoryType: "pending",
        message: "Permission denied"
      },
      fileSize: 0,
      modifiedTimeMs: 0
    });

    expect(record).toMatchObject({
      templateKind: "unknown",
      status: "error",
      errorMessage: "Permission denied"
    });
  });
});

describe("updatePerformanceFileMetadataStatus", () => {
  it("should update the status while keeping the original metadata", () => {
    const updated = updatePerformanceFileMetadataStatus(
      {
        id: "meta-01",
        fileName: "별첨1_샘플.xlsx",
        filePath: "C:\\ShiftMgmt\\data\\imports\\pending\\별첨1_샘플.xlsx",
        directoryType: "pending",
        templateKind: "attachment1",
        sheetName: "별첨1",
        rowCount: 131,
        columnCount: 19,
        fileSize: 27845,
        modifiedTimeMs: 1730872882000,
        duplicateKey: "dup-key-1",
        receivedAt: "2026-03-11T08:00:00.000Z",
        status: "pending"
      },
      "parsed"
    );

    expect(updated).toMatchObject({
      id: "meta-01",
      status: "parsed"
    });
  });
});
