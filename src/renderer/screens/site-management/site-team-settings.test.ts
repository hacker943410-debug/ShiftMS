import { describe, expect, it } from "vitest";

import type { ShiftPatternTeamSetting } from "@shared/domain/model";

import {
  buildTeamSettingDraftsFromPattern,
  buildTeamSettingInputs,
  createDefaultTeamSettingDrafts,
  createTeamSettingDraft,
  getBaseTeamLabels,
  getTeamDisplayName,
  getTeamSettingsValidationError,
  reindexTeamSlotValues,
  swapTeamSlots,
  syncTeamSettingDrafts
} from "./site-team-settings";

describe("site-team-settings", () => {
  it("should build default drafts from the team count and pool toggle", () => {
    expect(getBaseTeamLabels(3)).toEqual(["A조", "B조", "C조"]);
    expect(createDefaultTeamSettingDrafts(2).map((item) => item.teamLabel)).toEqual([
      "A조",
      "B조"
    ]);
    expect(createDefaultTeamSettingDrafts(2, true).map((item) => item.teamLabel)).toEqual([
      "Pool",
      "A조",
      "B조"
    ]);
    expect(createDefaultTeamSettingDrafts(2, true)[0]?.workType).toBe("POOL");
    expect(createDefaultTeamSettingDrafts(2)[0]?.workType).toBe("ROTATING");
  });

  it("should keep existing team edits when the team count grows", () => {
    const current = [
      createTeamSettingDraft("A조", { displayName: "주간A", workType: "FIXED_DAY" }),
      createTeamSettingDraft("B조", { isActive: false })
    ];

    const next = syncTeamSettingDrafts({ current, poolEnabled: false, teamCount: 4 });

    expect(next.map((item) => item.teamLabel)).toEqual(["A조", "B조", "C조", "D조"]);
    expect(next[0]).toMatchObject({ displayName: "주간A", workType: "FIXED_DAY" });
    expect(next[1]?.isActive).toBe(false);
    expect(next[3]?.workType).toBe("ROTATING");
  });

  it("should drop base teams that no longer exist when the team count shrinks", () => {
    const current = createDefaultTeamSettingDrafts(4);

    const next = syncTeamSettingDrafts({ current, poolEnabled: false, teamCount: 2 });

    expect(next.map((item) => item.teamLabel)).toEqual(["A조", "B조"]);
  });

  it("should add and remove the pool team with the pool toggle while keeping order", () => {
    const enabled = syncTeamSettingDrafts({
      current: createDefaultTeamSettingDrafts(2),
      poolEnabled: true,
      teamCount: 2
    });

    expect(enabled.map((item) => item.teamLabel)).toEqual(["Pool", "A조", "B조"]);

    const disabled = syncTeamSettingDrafts({
      current: enabled,
      poolEnabled: false,
      teamCount: 2
    });

    expect(disabled.map((item) => item.teamLabel)).toEqual(["A조", "B조"]);
  });

  it("should preserve a custom team order across a team count change", () => {
    const reordered = swapTeamSlots(createDefaultTeamSettingDrafts(3), 0, 2);

    const next = syncTeamSettingDrafts({
      current: reordered,
      poolEnabled: false,
      teamCount: 4
    });

    expect(next.map((item) => item.teamLabel)).toEqual(["C조", "B조", "A조", "D조"]);
  });

  it("should keep manually added teams that are not part of the base labels", () => {
    const current = [
      ...createDefaultTeamSettingDrafts(2),
      createTeamSettingDraft("야간전담", { workType: "FIXED_DAY" })
    ];

    const next = syncTeamSettingDrafts({ current, poolEnabled: false, teamCount: 3 });

    expect(next.map((item) => item.teamLabel)).toEqual(["A조", "B조", "야간전담", "C조"]);
  });

  it("should restore drafts from stored settings in their saved order", () => {
    const teamSettings: ShiftPatternTeamSetting[] = [
      { teamLabel: "B조", workType: "FIXED_DAY", isActive: true, sortOrder: 0 },
      { teamLabel: "Pool", workType: "POOL", isActive: false, sortOrder: 1 },
      { teamLabel: "A조", displayName: "선임조", workType: "ROTATING", isActive: true, sortOrder: 2 }
    ];

    const drafts = buildTeamSettingDraftsFromPattern({
      poolEnabled: true,
      teamCount: 2,
      teamSettings
    });

    expect(drafts.map((item) => item.teamLabel)).toEqual(["B조", "Pool", "A조"]);
    expect(drafts[1]?.isActive).toBe(false);
    expect(drafts[2]?.displayName).toBe("선임조");
  });

  it("should fall back to defaults when a pattern has no stored settings", () => {
    const drafts = buildTeamSettingDraftsFromPattern({ poolEnabled: false, teamCount: 3 });

    expect(drafts.map((item) => item.teamLabel)).toEqual(["A조", "B조", "C조"]);
    expect(drafts.every((item) => item.isActive)).toBe(true);
  });

  it("should swap slot values so parallel arrays stay aligned", () => {
    expect(swapTeamSlots(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(swapTeamSlots(["a", "b", "c"], 0, 0)).toEqual(["a", "b", "c"]);
    expect(swapTeamSlots(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(swapTeamSlots(["a", "b", "c"], 2, 3)).toEqual(["a", "b", "c"]);
  });

  it("should reindex parallel values by team label", () => {
    const next = reindexTeamSlotValues({
      fallback: () => "",
      nextLabels: ["C조", "A조", "D조"],
      previousLabels: ["A조", "B조", "C조"],
      values: ["1", "2", "3"]
    });

    expect(next).toEqual(["3", "1", ""]);
  });

  it("should build storage inputs with the list order as sort order", () => {
    const inputs = buildTeamSettingInputs([
      createTeamSettingDraft("B조", { displayName: "야간조" }),
      createTeamSettingDraft("A조", { displayName: "A조", isActive: false })
    ]);

    expect(inputs).toEqual([
      { teamLabel: "B조", displayName: "야간조", workType: "ROTATING", isActive: true, sortOrder: 0 },
      { teamLabel: "A조", displayName: undefined, workType: "ROTATING", isActive: false, sortOrder: 1 }
    ]);
  });

  it("should reject duplicate team names and an all-disabled team list", () => {
    expect(
      getTeamSettingsValidationError([
        createTeamSettingDraft("A조", { displayName: "주간조" }),
        createTeamSettingDraft("B조", { displayName: "주간조" })
      ])
    ).toContain("중복");

    expect(
      getTeamSettingsValidationError([
        createTeamSettingDraft("A조", { isActive: false }),
        createTeamSettingDraft("B조", { isActive: false })
      ])
    ).toContain("한 개 조는 사용 중");

    expect(getTeamSettingsValidationError(createDefaultTeamSettingDrafts(2))).toBeNull();
  });

  it("should fall back to the team label when no display name is set", () => {
    expect(getTeamDisplayName(createTeamSettingDraft("A조"))).toBe("A조");
    expect(getTeamDisplayName(createTeamSettingDraft("A조", { displayName: " 주간조 " }))).toBe(
      "주간조"
    );
  });
});
