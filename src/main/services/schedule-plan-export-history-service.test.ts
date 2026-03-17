import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listStoredSchedulePlanExports,
  resetSchedulePlanExportHistoryForTest,
  saveStoredSchedulePlanExport
} from "./schedule-plan-export-history-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

describe("schedule-plan-export-history-service", () => {
  afterEach(() => {
    resetSchedulePlanExportHistoryForTest();
    resetSqliteStorageForTest();
  });

  it("should persist generated export history records in sqlite", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "schedule-plan-export-history.test.sqlite")
    });

    const saved = saveStoredSchedulePlanExport({
      scheduleId: "schedule-1",
      scheduleMonth: "2026-04",
      siteName: "보라매DC",
      patternName: "보라매 4조 2교대",
      templateVersionId: "template-schedule-sample1-2026-1",
      templateVersionLabel: "근무표 양식 1",
      outputFileName: "boramae.xlsx",
      outputPath: "C:\\exports\\boramae.xlsx",
      updateCount: 6,
      publishStatus: "draft",
      exportedAt: "2026-03-11T12:00:00.000Z"
    });

    expect(saved.id).toBeTruthy();
    expect(listStoredSchedulePlanExports("schedule-1")).toHaveLength(1);
    expect(listStoredSchedulePlanExports("schedule-1")[0]?.outputPath).toBe("C:\\exports\\boramae.xlsx");
    expect(listStoredSchedulePlanExports("schedule-1")[0]?.templateVersionLabel).toBe("근무표 양식 1");
  });
});
