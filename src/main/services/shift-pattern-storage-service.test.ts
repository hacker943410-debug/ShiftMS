import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { acknowledgeReparseMarker, peekReparseMarker } from "./app-settings-storage-service";
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
    expect(boramaePattern?.cycles).toHaveLength(1);
    expect(boramaePattern?.teamCycleAssignments).toEqual([
      { teamLabel: "A조", cycleKey: "cycle-1" },
      { teamLabel: "B조", cycleKey: "cycle-1" },
      { teamLabel: "C조", cycleKey: "cycle-1" },
      { teamLabel: "D조", cycleKey: "cycle-1" }
    ]);
    expect(boramaePattern?.teamCapacities).toHaveLength(4);
    expect(boramaePattern?.teamCapacities.find((item) => item.teamLabel === "A조")?.maxHeadcount).toBeUndefined();
    expect(boramaePattern?.teamIndexes).toEqual([
      { teamLabel: "A조", index: 0 },
      { teamLabel: "B조", index: 1 },
      { teamLabel: "C조", index: 2 },
      { teamLabel: "D조", index: 3 }
    ]);
    expect(boramaePattern?.steps).toHaveLength(6);
  });

  it("should save a shift pattern with multiple cycles and pool settings", () => {
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
      poolEnabled: true,
      poolStartTime: "09:00",
      poolEndTime: "18:00",
      poolBreakMinutes: 60,
      teamCapacities: [
        { teamLabel: "A조", maxHeadcount: 3 },
        { teamLabel: "B조", maxHeadcount: 3 },
        { teamLabel: "C조", maxHeadcount: 2 }
      ],
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
      ],
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 1,
          patternCode: "NX",
          patternString: "야휴",
          patternStartDate: "2026-04-01",
          steps: [
            { stepIndex: 0, dutyCode: "N", startTime: "19:00", endTime: "07:00", breakMinutes: 90 },
            { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 }
          ]
        },
        {
          cycleKey: "cycle-2",
          name: "Cycle 2",
          order: 1,
          shiftCount: 1,
          patternCode: "DX",
          patternString: "1휴",
          patternStartDate: "2026-04-03",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "07:00", endTime: "19:00", breakMinutes: 60 },
            { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: [
            { teamLabel: "C조", index: 0 },
            { teamLabel: "D조", index: 1 }
          ]
        }
      ],
      teamCycleAssignments: [
        { teamLabel: "A조", cycleKey: "cycle-1" },
        { teamLabel: "B조", cycleKey: "cycle-1" },
        { teamLabel: "C조", cycleKey: "cycle-2" },
        { teamLabel: "D조", cycleKey: "cycle-2" }
      ]
    });

    expect(saved.name).toBe("인천 야간 집중조");
    expect(saved.teamCount).toBe(4);
    expect(saved.cycleLength).toBe(2);
    expect(saved.patternStartDate).toBe("2026-04-01");
    expect(saved.teamIndexes[1]?.index).toBe(1);
    expect(saved.steps[0]?.dutyCode).toBe("N");
    expect(saved.cycles).toHaveLength(2);
    expect(saved.cycles[0]?.patternString).toBe("야휴");
    expect(saved.cycles[1]?.patternStartDate).toBe("2026-04-03");
    expect(saved.cycles[1]?.patternString).toBe("1휴");
    expect(saved.teamCycleAssignments).toEqual([
      { teamLabel: "A조", cycleKey: "cycle-1" },
      { teamLabel: "B조", cycleKey: "cycle-1" },
      { teamLabel: "C조", cycleKey: "cycle-2" },
      { teamLabel: "D조", cycleKey: "cycle-2" }
    ]);
    // Pool 조도 조 목록에 포함되므로 정원 칸이 함께 생긴다(값은 비어 있음).
    expect(saved.teamCapacities).toEqual([
      { teamLabel: "A조", maxHeadcount: 3 },
      { teamLabel: "B조", maxHeadcount: 3 },
      { teamLabel: "C조", maxHeadcount: 2 },
      { teamLabel: "D조", maxHeadcount: undefined },
      { teamLabel: "Pool", maxHeadcount: undefined }
    ]);
    // Pool 조는 명시 배정이 없으면 Cycle을 갖지 않는다(근무표 자동생성 대상에서 제외).
    expect(saved.teamCycleAssignments.some((item) => item.teamLabel === "Pool")).toBe(false);
    expect(saved.poolEnabled).toBe(true);
    expect(saved.poolStartTime).toBe("09:00");
    expect(saved.poolEndTime).toBe("18:00");
    expect(saved.poolBreakMinutes).toBe(60);
    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.cycles.map((cycle) => cycle.patternString)).toEqual(["야휴", "1휴"]);
  });

  it("should round-trip 평·휴 split holiday times and the public-holiday toggle", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    expect(targetSite).toBeDefined();

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "평휴 분리 주야조",
      teamCount: 2,
      patternCode: "DN",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "N", startTime: "21:00", endTime: "09:00", breakMinutes: 90 }
      ],
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "주야 사이클",
          order: 0,
          shiftCount: 2,
          patternCode: "DN",
          patternString: "주야",
          patternStartDate: "2026-05-01",
          holidayTimeMode: "split",
          weekdayPublicHolidayAsHoliday: false,
          steps: [
            {
              stepIndex: 0,
              dutyCode: "D",
              startTime: "09:00",
              endTime: "18:00",
              breakMinutes: 60,
              holidayStartTime: "09:00",
              holidayEndTime: "21:00",
              holidayBreakMinutes: 90
            },
            {
              stepIndex: 1,
              dutyCode: "N",
              startTime: "21:00",
              endTime: "09:00",
              breakMinutes: 90,
              holidayStartTime: "21:00",
              holidayEndTime: "09:00",
              holidayBreakMinutes: 120
            }
          ],
          teamIndexes: [
            { teamLabel: "A조", index: 0 },
            { teamLabel: "B조", index: 1 }
          ]
        }
      ]
    });

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);
    const cycle = reloaded?.cycles[0];

    expect(cycle?.holidayTimeMode).toBe("split");
    expect(cycle?.weekdayPublicHolidayAsHoliday).toBe(false);

    const dayStep = cycle?.steps.find((step) => step.dutyCode === "D");
    const nightStep = cycle?.steps.find((step) => step.dutyCode === "N");

    expect(dayStep?.startTime).toBe("09:00");
    expect(dayStep?.endTime).toBe("18:00");
    expect(dayStep?.breakMinutes).toBe(60);
    expect(dayStep?.holidayStartTime).toBe("09:00");
    expect(dayStep?.holidayEndTime).toBe("21:00");
    expect(dayStep?.holidayBreakMinutes).toBe(90);

    expect(nightStep?.holidayStartTime).toBe("21:00");
    expect(nightStep?.holidayEndTime).toBe("09:00");
    expect(nightStep?.holidayBreakMinutes).toBe(120);
  });

  it("should leave 평·휴 fields empty for a plain (unified) cycle so old patterns stay identical", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "단일 시간 주간조",
      teamCount: 1,
      patternCode: "D",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      teamIndexes: [{ teamLabel: "A조", index: 0 }],
      steps: [{ stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }],
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "주간 사이클",
          order: 0,
          shiftCount: 1,
          patternCode: "D",
          patternString: "주",
          patternStartDate: "2026-05-01",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 }
          ],
          teamIndexes: [{ teamLabel: "A조", index: 0 }]
        }
      ]
    });

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);
    const cycle = reloaded?.cycles[0];
    const step = cycle?.steps[0];

    expect(cycle?.holidayTimeMode).toBeUndefined();
    expect(cycle?.weekdayPublicHolidayAsHoliday).toBeUndefined();
    expect(step?.holidayStartTime).toBeUndefined();
    expect(step?.holidayEndTime).toBeUndefined();
    expect(step?.holidayBreakMinutes).toBeUndefined();
  });

  it("should default team work types by label and synthesize a pool team for legacy pool patterns", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "기본 근무유형 확인조",
      teamCount: 2,
      patternCode: "DX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      poolEnabled: true,
      poolStartTime: "09:00",
      poolEndTime: "18:00",
      poolBreakMinutes: 60,
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ]
    });

    // 자동으로 만들어 주는 Pool 조는 목록 맨 앞에 온다(Pool → A조 → B조 …).
    expect(saved.teamSettings).toEqual([
      { teamLabel: "Pool", displayName: undefined, workType: "POOL", isActive: true, sortOrder: 0 },
      { teamLabel: "A조", displayName: undefined, workType: "ROTATING", isActive: true, sortOrder: 1 },
      { teamLabel: "B조", displayName: undefined, workType: "ROTATING", isActive: true, sortOrder: 2 }
    ]);
  });

  it("should keep the old version and add a new one when the effective date changes", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");
    const baseInput = {
      siteId: targetSite!.id,
      name: "적용기간 확인조",
      teamCount: 2,
      patternCode: "DX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-01-01",
      status: "active" as const,
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ]
    };

    const first = saveStoredShiftPattern({ ...baseInput, effectiveFrom: "2026-01-01" });

    // 같은 날짜로 다시 저장하면 그 설정을 고친다.
    const edited = saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-01-01",
      teamCount: 3
    });

    expect(edited.id).toBe(first.id);
    expect(edited.teamCount).toBe(3);

    // 날짜를 바꿔 저장하면 예전 설정은 남고 새 버전이 하나 더 생긴다.
    const second = saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-08-01",
      teamCount: 4
    });

    expect(second.id).not.toBe(first.id);
    expect(second.effectiveFrom).toBe("2026-08-01");

    const stored = listStoredShiftPatterns(targetSite!.id);
    const keptFirst = stored.find((pattern) => pattern.id === first.id);

    expect(keptFirst?.teamCount).toBe(3);
    expect(keptFirst?.effectiveFrom).toBe("2026-01-01");

    // 같은 적용 시작일을 또 만들 수는 없다.
    expect(() =>
      saveStoredShiftPattern({ ...baseInput, id: first.id, effectiveFrom: "2026-08-01" })
    ).toThrow(/이미 있습니다/);
  });

  it("should round-trip explicit team settings including extra pool teams", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");

    const saved = saveStoredShiftPattern({
      siteId: targetSite!.id,
      name: "근무유형 지정조",
      teamCount: 3,
      patternCode: "DX",
      startIndexRule: "manual-seed",
      patternStartDate: "2026-05-01",
      status: "active",
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 },
        { teamLabel: "C조", index: 2 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ],
      teamSettings: [
        { teamLabel: "A조", workType: "FIXED_DAY", displayName: "주간고정 A" },
        { teamLabel: "B조", workType: "FIXED_DAY" },
        { teamLabel: "C조", workType: "ROTATING", isActive: false },
        { teamLabel: "지원조", workType: "POOL", sortOrder: 9 }
      ]
    });

    expect(saved.teamSettings).toEqual([
      { teamLabel: "A조", displayName: "주간고정 A", workType: "FIXED_DAY", isActive: true, sortOrder: 0 },
      { teamLabel: "B조", displayName: undefined, workType: "FIXED_DAY", isActive: true, sortOrder: 1 },
      { teamLabel: "C조", displayName: undefined, workType: "ROTATING", isActive: false, sortOrder: 2 },
      { teamLabel: "지원조", displayName: undefined, workType: "POOL", isActive: true, sortOrder: 3 }
    ]);

    const reloaded = listStoredShiftPatterns(targetSite!.id).find((pattern) => pattern.id === saved.id);

    expect(reloaded?.teamSettings).toEqual(saved.teamSettings);
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

// The performance parser decides whether a substitute row is payable from the team's work type in
// the settings that apply to the file's month. Pending files parsed before a work-type change
// keep the old decision, so the save leaves a reparse marker - but only when a work type actually
// changed, not for every save of the settings.
describe("shift-pattern-storage-service · team work-type reparse marker", () => {
  afterEach(() => {
    resetShiftPatternStorageForTest();
    resetSqliteStorageForTest();
  });

  const spendTeamWorkTypeMarker = () => {
    const token = peekReparseMarker("team-work-type");

    if (token !== null) {
      acknowledgeReparseMarker("team-work-type", token);
    }

    return token !== null;
  };

  it("leaves the team work-type reparse marker only when a team's work type actually changes", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "shift-patterns.test.sqlite")
    });
    const targetSite = listStoredSites().find((site) => site.name === "인천허브");
    const baseInput = {
      siteId: targetSite!.id,
      name: "근무유형 표시 확인조",
      teamCount: 2,
      patternCode: "DX",
      startIndexRule: "manual-seed" as const,
      patternStartDate: "2026-01-01",
      status: "active" as const,
      teamIndexes: [
        { teamLabel: "A조", index: 0 },
        { teamLabel: "B조", index: 1 }
      ],
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ]
    };

    expect(spendTeamWorkTypeMarker()).toBe(false);

    // First settings with the default work types: nothing changed against what the parser assumed.
    const first = saveStoredShiftPattern({ ...baseInput, effectiveFrom: "2026-01-01" });

    expect(spendTeamWorkTypeMarker()).toBe(false);

    // Only the name and a step time change: no marker.
    saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-01-01",
      name: "이름만 바뀐 조",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "X", breakMinutes: 0 }
      ]
    });

    expect(spendTeamWorkTypeMarker()).toBe(false);

    // A조 becomes a fixed day team: marker, spent once.
    saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-01-01",
      teamSettings: [
        { teamLabel: "A조", workType: "FIXED_DAY" },
        { teamLabel: "B조", workType: "ROTATING" }
      ]
    });

    expect(spendTeamWorkTypeMarker()).toBe(true);
    expect(spendTeamWorkTypeMarker()).toBe(false);

    // The same work types saved again: no marker.
    saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-01-01",
      teamSettings: [
        { teamLabel: "A조", workType: "FIXED_DAY" },
        { teamLabel: "B조", workType: "ROTATING" }
      ]
    });

    expect(spendTeamWorkTypeMarker()).toBe(false);

    // A new version from a later date that puts A조 back on rotation: marker.
    const second = saveStoredShiftPattern({
      ...baseInput,
      id: first.id,
      effectiveFrom: "2026-08-01",
      teamSettings: [
        { teamLabel: "A조", workType: "ROTATING" },
        { teamLabel: "B조", workType: "ROTATING" }
      ]
    });

    expect(second.id).not.toBe(first.id);
    expect(spendTeamWorkTypeMarker()).toBe(true);

    // Taking a version out of service hands its months to another version: marker.
    deactivateStoredShiftPattern(second.id);

    expect(spendTeamWorkTypeMarker()).toBe(true);
  });
});
