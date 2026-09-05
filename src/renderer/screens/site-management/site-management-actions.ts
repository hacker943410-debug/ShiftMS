import type {
  BridgeResult,
  ShiftPatternCycleInput,
  ShiftPatternTeamCycleAssignmentInput,
  ShiftPatternUpsertInput,
  ShiftPatternStepInput,
  SiteUpsertInput
} from "@shared/bridge/contracts";
import type { ShiftPatternRecord, SiteRecord } from "@shared/domain/model";
import { buildShiftPatternStepsFromPatternString } from "../../../shared/domain/shift-pattern-compression";

import type {
  SitePatternCycleDraftLike,
  SitePatternCyclePreviewLike
} from "./site-management-selectors";
import { splitTimeRange } from "./site-pattern-simulation";
import {
  buildTeamSettingInputs,
  getTeamSettingsValidationError,
  type SiteTeamSettingDraft
} from "./site-team-settings";

export interface SiteManagementDraftLike {
  customerName: string;
  cycles: SitePatternCycleDraftLike[];
  cycleCount: string;
  // 이 설정을 적용하기 시작할 날짜. 비어 있으면 예전처럼 패턴 시작일을 쓴다.
  effectiveFrom?: string;
  name: string;
  patternId?: string;
  poolBreakMinutes: string;
  poolEnabled: boolean;
  poolTimeRange: string;
  siteCode: string;
  siteId?: string;
  status: SiteRecord["status"];
  teamCapacities: string[];
  teamCount: string;
  teamCycleAssignments: string[];
  // 조 목록(순서·이름·근무유형·사용여부). 없으면 기존처럼 이름 기준 기본값으로 저장된다.
  teamSettings?: SiteTeamSettingDraft[];
}

interface SiteManagementSaveBridge {
  // The real bridge says whether a team's work type changed; a test double may leave it out.
  saveShiftPattern: (
    input: ShiftPatternUpsertInput
  ) => Promise<BridgeResult<ShiftPatternRecord & { teamWorkTypeChanged?: boolean }>>;
  saveSite: (input: SiteUpsertInput) => Promise<BridgeResult<SiteRecord>>;
}

interface GetSiteDraftValidationErrorInput {
  cyclePreviews: SitePatternCyclePreviewLike[];
  draft: SiteManagementDraftLike;
  parseMaxHeadcount: (value: string) => number | undefined;
  teamLabels: string[];
}

interface BuildSiteCycleInputsInput {
  cyclePreviews: SitePatternCyclePreviewLike[];
  draft: Pick<SiteManagementDraftLike, "teamCycleAssignments">;
  fallbackPatternStartDate?: string;
  teamLabels: string[];
}

interface SaveSiteDraftInput extends BuildSiteCycleInputsInput {
  bridge: SiteManagementSaveBridge;
  createDateInputValue: () => string;
  cycleCount: number;
  defaultSiteTimezone: string;
  draft: SiteManagementDraftLike;
  parseMaxHeadcount: (value: string) => number | undefined;
  teamCount: number;
}

interface SiteDraftSaveSuccess {
  assignmentStartDate: string;
  ok: true;
  patternId: string;
  site: SiteRecord;
  // True when a team's work type changed: the pending performance files are read again on the
  // next overview, and the completion dialog says so.
  teamWorkTypeChanged: boolean;
}

interface SiteDraftSaveFailure {
  message: string;
  ok: false;
}

export type SiteDraftSaveResult = SiteDraftSaveSuccess | SiteDraftSaveFailure;

const buildPatternCode = (steps: ShiftPatternStepInput[]) => steps.map((step) => step.dutyCode).join("");

export const getSiteDraftValidationError = ({
  cyclePreviews,
  draft,
  parseMaxHeadcount,
  teamLabels
}: GetSiteDraftValidationErrorInput) => {
  if (!draft.siteCode.trim() || !draft.name.trim()) {
    return "근무지 코드와 근무지명은 필수입니다.";
  }

  if (cyclePreviews.some((cycle) => !cycle.patternString)) {
    return "모든 Cycle의 패턴String을 입력해야 합니다.";
  }

  const invalidCycle = cyclePreviews.find((cycle) => cycle.invalidTokens.length > 0);

  if (invalidCycle) {
    return `${invalidCycle.name} 패턴String에 사용할 수 없는 문자가 있습니다: ${Array.from(
      new Set(invalidCycle.invalidTokens)
    ).join(", ")}`;
  }

  const invalidIndexCycle = cyclePreviews.find((cycle) =>
    teamLabels.some((teamLabel, index) => {
      if (draft.teamCycleAssignments[index] !== cycle.cycleKey) {
        return false;
      }

      const value = cycle.teamIndexes[index] ?? index;

      return !Number.isInteger(value) || value < 0 || value >= cycle.cycleLabels.length;
    })
  );

  if (invalidIndexCycle) {
    return `${invalidIndexCycle.name}의 조별 Index는 0 ~ ${Math.max(
      invalidIndexCycle.cycleLabels.length - 1,
      0
    )} 범위로 입력해야 합니다.`;
  }

  if (cyclePreviews.some((cycle) => cycle.breakMinutes < 0)) {
    return "휴게시간은 0 이상의 정수로 입력해야 합니다.";
  }

  if (cyclePreviews.some((cycle) => cycle.shiftTimes.some((timeRange) => !splitTimeRange(timeRange)))) {
    return "모든 Cycle의 근무 시작/종료 시각을 선택해야 합니다.";
  }

  if (draft.poolEnabled && !splitTimeRange(draft.poolTimeRange)) {
    return "Pool 근무 시작/종료 시각을 선택해야 합니다.";
  }

  const invalidCapacity = draft.teamCapacities.find((value) => {
    const trimmed = value.trim();

    return trimmed.length > 0 && parseMaxHeadcount(trimmed) === undefined;
  });

  if (invalidCapacity !== undefined) {
    return "조별 정원은 비워두거나 1 이상의 정수로 입력해야 합니다.";
  }

  const teamSettingsError = draft.teamSettings
    ? getTeamSettingsValidationError(draft.teamSettings)
    : null;

  if (teamSettingsError) {
    return teamSettingsError;
  }

  return null;
};

export const buildSiteCycleInputs = ({
  cyclePreviews,
  draft,
  fallbackPatternStartDate,
  teamLabels
}: BuildSiteCycleInputsInput) =>
  cyclePreviews.map((cycle) => {
    const isSplit = cycle.holidayTimeMode === "split";
    const steps = buildShiftPatternStepsFromPatternString(
      cycle.shiftCount,
      cycle.shiftLabels,
      cycle.shiftTimes,
      cycle.breakMinutes,
      cycle.patternString,
      cycle.shiftBreakMinutes,
      isSplit
        ? {
            holidayTimeMode: "split",
            holidayShiftTimes: cycle.holidayShiftTimes,
            holidayShiftBreakMinutes: cycle.holidayShiftBreakMinutes
          }
        : undefined
    );

    return {
      cycleKey: cycle.cycleKey,
      name: cycle.name,
      order: cyclePreviews.findIndex((item) => item.cycleKey === cycle.cycleKey),
      patternCode: buildPatternCode(steps),
      patternString: cycle.patternString,
      patternStartDate: cycle.patternStartDate || fallbackPatternStartDate,
      shiftCount: cycle.shiftCount,
      steps,
      teamIndexes: teamLabels
        .filter((_, index) => draft.teamCycleAssignments[index] === cycle.cycleKey)
        .map((teamLabel, index) => ({
          index: cycle.teamIndexes[teamLabels.indexOf(teamLabel)] ?? index,
          teamLabel
        })),
      ...(isSplit
        ? {
            holidayTimeMode: "split" as const,
            weekdayPublicHolidayAsHoliday: cycle.weekdayPublicHolidayAsHoliday ?? true
          }
        : {})
    } satisfies ShiftPatternCycleInput;
  });

export const saveSiteDraft = async ({
  bridge,
  createDateInputValue,
  cycleCount,
  cyclePreviews,
  defaultSiteTimezone,
  draft,
  parseMaxHeadcount,
  teamCount,
  teamLabels
}: SaveSiteDraftInput): Promise<SiteDraftSaveResult> => {
  const validationError = getSiteDraftValidationError({
    cyclePreviews,
    draft,
    parseMaxHeadcount,
    teamLabels
  });

  if (validationError) {
    return {
      message: validationError,
      ok: false
    };
  }

  const siteResult = await bridge.saveSite({
    customerName: draft.customerName.trim() || undefined,
    id: draft.siteId,
    name: draft.name.trim(),
    siteCode: draft.siteCode.trim(),
    status: draft.status,
    timezone: defaultSiteTimezone
  });

  if (!siteResult.ok) {
    return {
      message: siteResult.message,
      ok: false
    };
  }

  const cycleInputs = buildSiteCycleInputs({
    cyclePreviews,
    draft,
    fallbackPatternStartDate: createDateInputValue(),
    teamLabels
  });
  const primaryCycle = cycleInputs[0];

  if (!primaryCycle) {
    return {
      message: "저장할 Cycle 정보가 없습니다.",
      ok: false
    };
  }

  const poolRange = splitTimeRange(draft.poolTimeRange);
  const patternResult = await bridge.saveShiftPattern({
    cycles: cycleInputs,
    id: draft.patternId,
    name: `${siteResult.data.name} ${teamCount}조 / ${cycleCount}개 Cycle`,
    patternCode: primaryCycle.patternCode,
    patternStartDate: primaryCycle.patternStartDate,
    poolBreakMinutes: Number(draft.poolBreakMinutes) || 0,
    poolEnabled: draft.poolEnabled,
    poolEndTime: poolRange?.endTime,
    poolStartTime: poolRange?.startTime,
    siteId: siteResult.data.id,
    startIndexRule: "manual-seed",
    status: "active",
    ...(draft.effectiveFrom?.trim() ? { effectiveFrom: draft.effectiveFrom.trim() } : {}),
    steps: primaryCycle.steps,
    teamCapacities: teamLabels.map((teamLabel, index) => {
      const maxHeadcount = parseMaxHeadcount(draft.teamCapacities[index] ?? "");

      return typeof maxHeadcount === "number" ? { maxHeadcount, teamLabel } : { teamLabel };
    }),
    teamCount,
    // 배정하지 않은 조는 빈 값으로 보낸다. 저장소가 Pool 성격 조만 배정 없이 두고,
    // 나머지는 첫 근무 묶음으로 되돌린다.
    teamCycleAssignments: teamLabels.map((teamLabel, index) => ({
      cycleKey: draft.teamCycleAssignments[index] ?? primaryCycle.cycleKey,
      teamLabel
    })) satisfies ShiftPatternTeamCycleAssignmentInput[],
    teamIndexes: primaryCycle.teamIndexes,
    ...(draft.teamSettings
      ? { teamSettings: buildTeamSettingInputs(draft.teamSettings) }
      : {})
  });

  if (!patternResult.ok) {
    return {
      message: patternResult.message,
      ok: false
    };
  }

  return {
    assignmentStartDate: primaryCycle.patternStartDate ?? createDateInputValue(),
    ok: true,
    patternId: patternResult.data.id,
    site: siteResult.data,
    teamWorkTypeChanged: patternResult.data.teamWorkTypeChanged === true
  };
};
