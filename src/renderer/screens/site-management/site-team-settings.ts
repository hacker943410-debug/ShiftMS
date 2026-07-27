import type { ShiftPatternTeamSettingInput } from "@shared/bridge/contracts";
import type { ShiftPatternTeamSetting } from "@shared/domain/model";
import {
  getDefaultTeamWorkType,
  isPoolTeamLabel,
  normalizeTeamWorkType,
  type TeamWorkType
} from "@shared/domain/team-work-type";

// 별도 근무(Pool)를 켰을 때 자동으로 만들어 주는 조 이름. 저장소도 같은 이름을 쓴다.
export const POOL_TEAM_LABEL = "Pool";

// 조를 Cycle에 배정하지 않은 상태. 빈 문자열이면 근무표 자동 생성에서 빠진다.
export const UNASSIGNED_CYCLE_KEY = "";

// 1단계 화면에서 편집하는 조별 설정. 배열 순서가 곧 화면에 보이는 순서(sortOrder)다.
export interface SiteTeamSettingDraft {
  teamLabel: string;
  displayName: string;
  workType: TeamWorkType;
  isActive: boolean;
}

export const getBaseTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

export const createTeamSettingDraft = (
  teamLabel: string,
  overrides?: Partial<Omit<SiteTeamSettingDraft, "teamLabel">>
): SiteTeamSettingDraft => ({
  teamLabel,
  displayName: "",
  workType: getDefaultTeamWorkType(teamLabel),
  isActive: true,
  ...overrides
});

// Pool 조는 목록 맨 앞에 둔다(Pool → A조 → B조 …).
export const createDefaultTeamSettingDrafts = (teamCount: number, poolEnabled = false) => {
  const drafts = getBaseTeamLabels(teamCount).map((teamLabel) => createTeamSettingDraft(teamLabel));

  return poolEnabled ? [createTeamSettingDraft(POOL_TEAM_LABEL), ...drafts] : drafts;
};

// 조 수나 별도 근무 설정이 바뀌면 조 목록을 다시 맞춘다.
// 남아 있는 조의 이름·근무유형·사용여부·순서는 그대로 두고, 늘어난 조만 뒤에 붙인다.
export const syncTeamSettingDrafts = ({
  current,
  poolEnabled,
  teamCount
}: {
  current: SiteTeamSettingDraft[];
  poolEnabled: boolean;
  teamCount: number;
}): SiteTeamSettingDraft[] => {
  const baseLabels = getBaseTeamLabels(teamCount);
  const baseLabelSet = new Set(baseLabels);
  const seen = new Set<string>();
  const kept: SiteTeamSettingDraft[] = [];

  current.forEach((item) => {
    const teamLabel = item.teamLabel.trim();

    if (!teamLabel || seen.has(teamLabel)) {
      return;
    }

    // 조 수를 줄이면 사라진 기본 조(A조~)는 뺀다. 직접 추가한 조와 Pool은 기본 목록에 없어도 남긴다.
    const isDroppedBaseLabel = /^[A-Z]조$/.test(teamLabel) && !baseLabelSet.has(teamLabel);

    if (isDroppedBaseLabel) {
      return;
    }

    if (isPoolTeamLabel(teamLabel) && !poolEnabled) {
      return;
    }

    seen.add(teamLabel);
    kept.push({ ...item, teamLabel });
  });

  baseLabels.forEach((teamLabel) => {
    if (seen.has(teamLabel)) {
      return;
    }

    seen.add(teamLabel);
    kept.push(createTeamSettingDraft(teamLabel));
  });

  // 새로 켠 Pool 조는 맨 앞에 붙인다(Pool → A조 → B조 …).
  // 이미 목록에 있던 Pool 조는 관리자가 정한 자리를 그대로 둔다.
  if (poolEnabled && !kept.some((item) => isPoolTeamLabel(item.teamLabel))) {
    return [createTeamSettingDraft(POOL_TEAM_LABEL), ...kept];
  }

  return kept;
};

// 저장된 패턴을 1단계 초안으로 되돌린다. 저장소가 sortOrder 순으로 돌려주므로 그 순서를 그대로 쓴다.
export const buildTeamSettingDraftsFromPattern = ({
  poolEnabled,
  teamCount,
  teamSettings
}: {
  poolEnabled: boolean;
  teamCount: number;
  teamSettings?: ShiftPatternTeamSetting[];
}): SiteTeamSettingDraft[] => {
  const stored = (teamSettings ?? [])
    .filter((item) => item.teamLabel.trim())
    .map((item) =>
      createTeamSettingDraft(item.teamLabel.trim(), {
        displayName: item.displayName?.trim() ?? "",
        isActive: item.isActive,
        workType: normalizeTeamWorkType(item.workType, getDefaultTeamWorkType(item.teamLabel))
      })
    );

  return syncTeamSettingDrafts({ current: stored, poolEnabled, teamCount });
};

// 조 목록의 순서가 바뀌면 조와 나란히 놓인 값(묶음 배정·정원·조별 Index)도 같은 순서로 옮긴다.
export const swapTeamSlots = <T>(values: T[], from: number, to: number): T[] => {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= values.length ||
    to >= values.length
  ) {
    return values;
  }

  const next = [...values];
  const moved = next[from] as T;

  next[from] = next[to] as T;
  next[to] = moved;

  return next;
};

// 조 목록이 바뀌었을 때(추가·삭제) 조와 나란히 놓인 값을 조 이름 기준으로 다시 맞춘다.
export const reindexTeamSlotValues = <T>({
  fallback,
  nextLabels,
  previousLabels,
  values
}: {
  fallback: (teamLabel: string, index: number) => T;
  nextLabels: string[];
  previousLabels: string[];
  values: T[];
}): T[] =>
  nextLabels.map((teamLabel, index) => {
    const previousIndex = previousLabels.indexOf(teamLabel);

    if (previousIndex < 0) {
      return fallback(teamLabel, index);
    }

    const value = values[previousIndex];

    return value === undefined ? fallback(teamLabel, index) : value;
  });

export const getTeamDisplayName = (item: SiteTeamSettingDraft) =>
  item.displayName.trim() || item.teamLabel;

export const buildTeamSettingInputs = (
  drafts: SiteTeamSettingDraft[]
): ShiftPatternTeamSettingInput[] =>
  drafts.map((item, index) => {
    const displayName = item.displayName.trim();

    return {
      teamLabel: item.teamLabel.trim(),
      displayName: displayName && displayName !== item.teamLabel ? displayName : undefined,
      workType: item.workType,
      isActive: item.isActive,
      sortOrder: index
    };
  });

export const getTeamSettingsValidationError = (drafts: SiteTeamSettingDraft[]) => {
  const displayNames = new Set<string>();

  for (const item of drafts) {
    const displayName = getTeamDisplayName(item);

    if (displayNames.has(displayName)) {
      return `조 이름 "${displayName}"이 중복됩니다. 조마다 다른 이름을 사용하세요.`;
    }

    displayNames.add(displayName);
  }

  if (drafts.length > 0 && drafts.every((item) => !item.isActive)) {
    return "적어도 한 개 조는 사용 중이어야 합니다.";
  }

  return null;
};
