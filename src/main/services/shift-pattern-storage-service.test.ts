import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStoredSites } from "./site-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";
import {
  deactivateStoredShiftPattern,
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
    expect(boramaePattern?.teamCount).toBe(4);
    expect(boramaePattern?.patternCode).toBe("DDNNXX");
    expect(boramaePattern?.patternStartDate).toBe("2024-09-01");
    expect(boramaePattern?.teamIndexes).toEqual([
      { teamLabel: "A조", index: 0 },
      { teamLabel: "B조", index: 1 },
      { teamLabel: "C조", index: 2 },
      { teamLabel: "D조", index: 3 }
    ]);
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
      teamCount: 4,
      patternCode: "NNXX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-04-01",
      status: "active",
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 2 },
        { teamLabel: "C조", index: 4 },
        { teamLabel: "D조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
        { stepIndex: 1, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
        { stepIndex: 2, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 }
      ]
    });

    expect(saved.name).toBe("인천 야간 집중조");
    expect(saved.teamCount).toBe(4);
    expect(saved.cycleLength).toBe(4);
    expect(saved.patternStartDate).toBe("2026-04-01");
    expect(saved.teamIndexes[1]?.index).toBe(2);
    expect(saved.steps[0]?.dutyCode).toBe("N");
    expect(listStoredShiftPatterns(targetSite!.id).some((pattern) => pattern.id === saved.id)).toBe(
      true
    );
  });

  it("should deactivate an active shift pattern without deleting it", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });

    const activePattern = listStoredShiftPatterns().find((pattern) => pattern.status === "active");

    expect(activePattern).toBeDefined();

    const deactivated = deactivateStoredShiftPattern(activePattern!.id);
    const stored = listStoredShiftPatterns().find((pattern) => pattern.id === activePattern!.id);

    expect(deactivated.status).toBe("inactive");
    expect(stored?.status).toBe("inactive");
    expect(listStoredShiftPatterns().some((pattern) => pattern.id === activePattern!.id)).toBe(true);
  });
});
