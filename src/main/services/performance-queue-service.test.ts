import { afterEach, describe, expect, it } from "vitest";

import {
  getPendingPerformanceFileDetail,
  listPendingPerformanceFiles
} from "./performance-queue-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";

afterEach(() => {
  resetPerformanceApprovalStateForTest();
});

describe("listPendingPerformanceFiles", () => {
  it("should return queue items from the sample excel directory", async () => {
    const items = await listPendingPerformanceFiles();

    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items[0]).toMatchObject({
      id: expect.stringMatching(/\.xlsx$/),
      fileName: expect.any(String),
      templateKind: expect.any(String),
      status: "pending"
    });
  });
});

describe("getPendingPerformanceFileDetail", () => {
  it("should return attachment1 preview rows for the sample file", async () => {
    const detail = await getPendingPerformanceFileDetail("별첨1_샘플.xlsx");

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      id: "별첨1_샘플.xlsx",
      fileName: "별첨1_샘플.xlsx",
      templateKind: "attachment1",
      status: "pending"
    });
    expect(detail?.previewRows[0]).toMatchObject({
      사번: "2014015",
      성명: "박경훈"
    });
  });

  it("should return null when the file does not exist", async () => {
    await expect(getPendingPerformanceFileDetail("missing.xlsx")).resolves.toBeNull();
  });
});
