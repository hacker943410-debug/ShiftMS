import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  listStoredShiftPatterns,
  resetShiftPatternStorageForTest,
  saveStoredShiftPattern
} from "./shift-pattern-storage-service";

describe("shift-pattern-storage-service", () => {
  afterEach(() => {
    resetShiftPatternStorageForTest();
    resetSqliteStorageForTest();
  });

  it("should seed and list default shift patterns", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });

    const patterns = listStoredShiftPatterns();
    const boramaePattern = patterns.find((pattern) => pattern.name === "보라매 4조 2교대");

    expect(patterns.length).toBeGreaterThanOrEqual(2);
    expect(boramaePattern?.patternCode).toBe("DDNNXX");
    expect(boramaePattern?.steps).toHaveLength(6);
  });

  it("should save a shift pattern with step definitions", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    expect(targetSite).toBeDefined();

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "인천 야간 집중조",
      patternCode: "NNXX",
      startIndexRule: "manual-seed",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
        { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
        { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 }
      ]
    });

    expect(saved.name).toBe("인천 야간 집중조");
    expect(saved.cycleLength).toBe(4);
    expect(saved.steps[0]?.dutyCode).toBe("N");
    expect(listStoredShiftPatterns(targetSite!.id).some((pattern) => pattern.id === saved.id)).toBe(
      true
    );
  });
});
