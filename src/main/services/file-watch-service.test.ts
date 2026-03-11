import { describe, expect, it } from "vitest";

import {
  classifyWatchDirectory,
  createDuplicateFileKey,
  createFileWatchState,
  toFileWatchEvent
} from "./file-watch-service";

const watchState = createFileWatchState({
  appName: "ShiftMgmt_V3.4",
  holidayApiBaseUrl: "https://date.nager.at/api/v3/PublicHolidays",
  dataDir: "C:\\ShiftMgmt\\data",
  databasePath: "C:\\ShiftMgmt\\data\\shiftmgmt.sqlite",
  pendingDir: "C:\\ShiftMgmt\\data\\imports\\pending",
  approvedDir: "C:\\ShiftMgmt\\data\\imports\\approved"
});

describe("createDuplicateFileKey", () => {
  it("should create a stable duplicate key from path, size, and modified time", () => {
    expect(
      createDuplicateFileKey({
        filePath: "C:\\ShiftMgmt\\data\\imports\\pending\\report.xlsx",
        size: 2048,
        modifiedTimeMs: 1710000000123.9
      })
    ).toBe("c:\\shiftmgmt\\data\\imports\\pending\\report.xlsx::2048::1710000000123");
  });
});

describe("classifyWatchDirectory", () => {
  it("should classify files in the pending directory", () => {
    expect(
      classifyWatchDirectory(
        "C:\\ShiftMgmt\\data\\imports\\pending\\report.xlsx",
        watchState
      )
    ).toBe("pending");
  });

  it("should classify files in the approved directory", () => {
    expect(
      classifyWatchDirectory(
        "C:\\ShiftMgmt\\data\\imports\\approved\\report.xlsx",
        watchState
      )
    ).toBe("approved");
  });
});

describe("toFileWatchEvent", () => {
  it("should serialize a file-added event with duplicate metadata", () => {
    expect(
      toFileWatchEvent({
        type: "file-added",
        filePath: "C:\\ShiftMgmt\\data\\imports\\pending\\report.xlsx",
        state: watchState,
        size: 1024,
        modifiedTimeMs: 1710000000999
      })
    ).toEqual({
      type: "file-added",
      filePath: "C:\\ShiftMgmt\\data\\imports\\pending\\report.xlsx",
      fileName: "report.xlsx",
      directoryType: "pending",
      duplicateKey:
        "c:\\shiftmgmt\\data\\imports\\pending\\report.xlsx::1024::1710000000999",
      message: undefined
    });
  });

  it("should serialize watcher errors without duplicate metadata", () => {
    expect(
      toFileWatchEvent({
        type: "watcher-error",
        filePath: "C:\\ShiftMgmt\\data\\imports\\pending",
        state: watchState,
        message: "Permission denied"
      })
    ).toEqual({
      type: "watcher-error",
      filePath: "C:\\ShiftMgmt\\data\\imports\\pending",
      fileName: "pending",
      directoryType: "pending",
      duplicateKey: undefined,
      message: "Permission denied"
    });
  });
});
