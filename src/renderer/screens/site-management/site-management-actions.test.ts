import { describe, expect, it, vi } from "vitest";

import type { ShiftPatternRecord, SiteRecord } from "@shared/domain/model";

import type { SitePatternCycleDraftLike, SitePatternCyclePreviewLike } from "./site-management-selectors";
import {
  buildSiteCycleInputs,
  getSiteDraftValidationError,
  saveSiteDraft,
  type SiteManagementDraftLike
} from "./site-management-actions";

const createDraft = (overrides?: Partial<SiteManagementDraftLike>): SiteManagementDraftLike => ({
  customerName: "고객사",
  cycles: [
    {
      breakMinutes: "60",
      cycleKey: "cycle-1",
      name: "Cycle 1",
      patternStartDate: "2026-04-01",
      patternString: "주야휴",
      shiftCount: "2",
      shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
      teamIndexes: [0, 1]
    } satisfies SitePatternCycleDraftLike
  ],
  cycleCount: "1",
  name: "본관",
  patternId: "pattern-1",
  poolBreakMinutes: "60",
  poolEnabled: false,
  poolTimeRange: "09:00 - 18:00",
  siteCode: "SITE-001",
  siteId: "site-1",
  status: "active",
  teamCapacities: ["2", ""],
  teamCount: "2",
  teamCycleAssignments: ["cycle-1", "cycle-1"],
  ...overrides
});

const createCyclePreview = (
  overrides?: Partial<SitePatternCyclePreviewLike>
): SitePatternCyclePreviewLike => ({
  breakMinutes: 60,
  cycleKey: "cycle-1",
  cycleLabels: ["주간", "야간", "휴무"],
  invalidTokens: [],
  name: "Cycle 1",
  patternStartDate: "2026-04-01",
  patternString: "주야휴",
  shiftCards: [
    { breakMinutes: 60, label: "주간", timeRange: "07:00 - 19:00" },
    { breakMinutes: 60, label: "야간", timeRange: "19:00 - 07:00" }
  ],
  shiftCount: 2,
  shiftLabels: ["주간", "야간"],
  shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
  teamIndexes: [0, 1],
  ...overrides
});

const createSiteRecord = (overrides?: Partial<SiteRecord>): SiteRecord => ({
  createdAt: "2026-04-01T00:00:00.000Z",
  id: "site-1",
  name: "본관",
  siteCode: "SITE-001",
  status: "active",
  timezone: "Asia/Seoul",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...overrides
});

const createPatternRecord = (overrides?: Partial<ShiftPatternRecord>): ShiftPatternRecord => ({
  cycleLength: 3,
  cycles: [],
  createdAt: "2026-04-01T00:00:00.000Z",
  id: "pattern-1",
  name: "본관 2조 / 1개 Cycle",
  patternCode: "DNO",
  patternStartDate: "2026-04-01",
  poolEnabled: false,
  siteId: "site-1",
  startIndexRule: "manual-seed",
  status: "active",
  steps: [],
  teamCapacities: [],
  teamCount: 2,
  teamCycleAssignments: [],
  teamIndexes: [],
  teamSettings: [],
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...overrides
});

describe("site-management-actions", () => {
  it("should validate pool time ranges and team capacities", () => {
    expect(
      getSiteDraftValidationError({
        cyclePreviews: [createCyclePreview()],
        draft: createDraft({ poolEnabled: true, poolTimeRange: "invalid" }),
        parseMaxHeadcount: (value) => {
          const parsed = Number(value);
          return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
        },
        teamLabels: ["A조", "B조"]
      })
    ).toBe("Pool 근무 시작/종료 시각을 선택해야 합니다.");

    expect(
      getSiteDraftValidationError({
        cyclePreviews: [createCyclePreview()],
        draft: createDraft({ teamCapacities: ["two", ""] }),
        parseMaxHeadcount: (value) => {
          const parsed = Number(value);
          return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
        },
        teamLabels: ["A조", "B조"]
      })
    ).toBe("조별 정원은 비워두거나 1 이상의 정수로 입력해야 합니다.");
  });

  it("should build cycle inputs using assigned team indexes", () => {
    const cycleInputs = buildSiteCycleInputs({
      cyclePreviews: [createCyclePreview()],
      draft: createDraft(),
      teamLabels: ["A조", "B조"]
    });

    expect(cycleInputs).toHaveLength(1);
    expect(cycleInputs[0]).toMatchObject({
      cycleKey: "cycle-1",
      order: 0,
      patternCode: "DNX",
      shiftCount: 2,
      teamIndexes: [
        { index: 0, teamLabel: "A조" },
        { index: 1, teamLabel: "B조" }
      ]
    });
    expect(cycleInputs[0]?.steps).toHaveLength(3);
  });

  it("should keep mixed three-shift times and break minutes aligned when saving", () => {
    const cycleInputs = buildSiteCycleInputs({
      cyclePreviews: [
        createCyclePreview({
          breakMinutes: 30,
          cycleLabels: [
            "1근",
            "1근",
            "휴무",
            "3근",
            "3근",
            "휴무",
            "2근",
            "2근",
            "휴무",
            "3근",
            "3근",
            "휴무"
          ],
          patternString: "주*2,휴,야*2,휴,석*2,휴,야*2,휴",
          shiftBreakMinutes: [30, 30, 90],
          shiftCards: [
            { breakMinutes: 30, label: "1근", timeRange: "09:00 - 15:00" },
            { breakMinutes: 30, label: "2근", timeRange: "15:00 - 21:00" },
            { breakMinutes: 90, label: "3근", timeRange: "21:00 - 09:00" }
          ],
          shiftCount: 3,
          shiftLabels: ["1근", "2근", "3근"],
          shiftTimes: ["09:00 - 15:00", "15:00 - 21:00", "21:00 - 09:00"]
        })
      ],
      draft: createDraft(),
      teamLabels: ["A조", "B조"]
    });

    expect(
      cycleInputs[0]?.steps.map((step) => [
        step.dutyCode,
        step.startTime,
        step.endTime,
        step.breakMinutes
      ])
    ).toEqual([
      ["A", "09:00", "15:00", 30],
      ["A", "09:00", "15:00", 30],
      ["X", undefined, undefined, 0],
      ["C", "21:00", "09:00", 90],
      ["C", "21:00", "09:00", 90],
      ["X", undefined, undefined, 0],
      ["B", "15:00", "21:00", 30],
      ["B", "15:00", "21:00", 30],
      ["X", undefined, undefined, 0],
      ["C", "21:00", "09:00", 90],
      ["C", "21:00", "09:00", 90],
      ["X", undefined, undefined, 0]
    ]);
  });

  it("should use a fallback pattern start date instead of blocking empty cycle dates", () => {
    const cyclePreview = createCyclePreview({ patternStartDate: "" });
    const validationError = getSiteDraftValidationError({
      cyclePreviews: [cyclePreview],
      draft: createDraft(),
      parseMaxHeadcount: (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
      },
      teamLabels: ["A조", "B조"]
    });
    const cycleInputs = buildSiteCycleInputs({
      cyclePreviews: [cyclePreview],
      draft: createDraft(),
      fallbackPatternStartDate: "2026-04-01",
      teamLabels: ["A조", "B조"]
    });

    expect(validationError).toBeNull();
    expect(cycleInputs[0]?.patternStartDate).toBe("2026-04-01");
  });

  it("should save site draft and forward pattern payload", async () => {
    const saveSite = vi.fn(async () => ({
      ok: true as const,
      data: createSiteRecord()
    }));
    const saveShiftPattern = vi.fn(async () => ({
      ok: true as const,
      data: createPatternRecord()
    }));

    const result = await saveSiteDraft({
      bridge: { saveShiftPattern, saveSite },
      createDateInputValue: () => "2026-04-01",
      cycleCount: 1,
      cyclePreviews: [createCyclePreview()],
      defaultSiteTimezone: "Asia/Seoul",
      draft: createDraft(),
      parseMaxHeadcount: (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
      },
      teamCount: 2,
      teamLabels: ["A조", "B조"]
    });

    expect(result).toEqual({
      assignmentStartDate: "2026-04-01",
      ok: true,
      patternId: "pattern-1",
      site: createSiteRecord()
    });
    expect(saveSite).toHaveBeenCalledWith({
      customerName: "고객사",
      id: "site-1",
      name: "본관",
      siteCode: "SITE-001",
      status: "active",
      timezone: "Asia/Seoul"
    });
    expect(saveShiftPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        cycles: expect.any(Array),
        name: "본관 2조 / 1개 Cycle",
        poolBreakMinutes: 60,
        poolEndTime: "18:00",
        poolStartTime: "09:00",
        siteId: "site-1",
        teamCapacities: [{ maxHeadcount: 2, teamLabel: "A조" }, { teamLabel: "B조" }],
        teamCount: 2
      })
    );
  });

  it("should stop on bridge failure and surface the message", async () => {
    const saveSite = vi.fn(async () => ({
      ok: false as const,
      errorCode: "SITE_SAVE_FAILED",
      message: "근무지 저장 실패"
    }));
    const saveShiftPattern = vi.fn();

    const result = await saveSiteDraft({
      bridge: { saveShiftPattern, saveSite },
      createDateInputValue: () => "2026-04-01",
      cycleCount: 1,
      cyclePreviews: [createCyclePreview()],
      defaultSiteTimezone: "Asia/Seoul",
      draft: createDraft(),
      parseMaxHeadcount: (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
      },
      teamCount: 2,
      teamLabels: ["A조", "B조"]
    });

    expect(result).toEqual({
      message: "근무지 저장 실패",
      ok: false
    });
    expect(saveShiftPattern).not.toHaveBeenCalled();
  });
});
