import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { SitePatternImportAnalysis } from "@shared/bridge/contracts";
import { canPerformAction } from "@shared/domain/authorization";
import type {
  AuthSession,
  EmployeeRecord,
  ShiftPatternRecord,
  ShiftPatternTeamCycleAssignment,
  SiteNameOptionRecord,
  SiteRecord,
} from "@shared/domain/model";
import { getShiftPatternSymbols } from "@shared/domain/shift-pattern-compression";
import { normalizeTeamLabel } from "@shared/domain/team-label";

import { showActionResultDialog } from "../components/action-result-dialog";
import { useQuestionDialog } from "../components/QuestionDialog";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { SiteDetailModal } from "./site-management/SiteDetailModal";
import { SitePatternImportModal } from "./site-management/SitePatternImportModal";
import { SiteAssignmentStepView } from "./site-management/SiteAssignmentStepView";
import { SiteListView } from "./site-management/SiteListView";
import {
  getSiteDraftValidationError,
  saveSiteDraft,
} from "./site-management/site-management-actions";
import { createSiteManagementInteractionActions } from "./site-management/site-management-interaction-actions";
import { createSiteManagementStepOneActions } from "./site-management/site-management-step-one-actions";
import { createSiteManagementStepTwoActions } from "./site-management/site-management-step-two-actions";
import { useSiteManagementAssignmentDragState } from "./site-management/useSiteManagementAssignmentDragState";
import { useSiteManagementInteractionState } from "./site-management/useSiteManagementInteractionState";
import { useSiteManagementRegistrationFlow } from "./site-management/useSiteManagementRegistrationFlow";
import { useSiteManagementStepState } from "./site-management/useSiteManagementStepState";
import {
  ROTATION_TEMPLATES,
  buildRotationTeamIndexes,
  type RotationTemplate,
} from "./site-management/site-rotation-templates";
import {
  buildSiteSimulationCells,
  buildSiteSimulationMetrics,
  calculateWorkingHours,
  loadSiteSimulationHolidayMap,
} from "./site-management/site-pattern-simulation";
import {
  buildPatternString,
  buildPatternPresetSiteOptions,
  buildPatternPresetRows,
  buildRows,
  buildAssignedEmployeesByTeam,
  buildActiveTeamLabels,
  buildFilteredPoolEmployees,
  buildSitePatternCyclePreviews,
  buildSitePatternCycleAssignments,
  buildSitePatternSimulationModels,
  buildSitePatternSimulationTimeline,
  buildSitePatternStepSetupModels,
  buildSiteDetailModels,
  buildSiteAssignmentTeamColumns,
  buildSiteListSummary,
  buildSiteNameSelectValues,
  buildCycleDraftShiftValues,
  getPatternCycles,
  type SiteViewRow,
} from "./site-management/site-management-selectors";
import { SitePatternStepView } from "./site-management/SitePatternStepView";
import {
  UNASSIGNED_CYCLE_KEY,
  buildTeamSettingDraftsFromPattern,
  createDefaultTeamSettingDrafts,
  getTeamDisplayName,
  reindexTeamSlotValues,
  swapTeamSlots,
  syncTeamSettingDrafts,
  type SiteTeamSettingDraft,
} from "./site-management/site-team-settings";
import { normalizeTeamWorkType } from "@shared/domain/team-work-type";

type PatternImportPreviewTab = "analysis" | "groups" | "mismatches" | "data";
type ShiftTone = "day" | "night" | "first" | "second" | "third" | "off";
type SiteStatusFilter = "all" | SiteRecord["status"];

interface SiteDraftState {
  siteId?: string;
  patternId?: string;
  siteCode: string;
  name: string;
  customerName: string;
  status: SiteRecord["status"];
  teamCount: string;
  cycleCount: string;
  poolEnabled: boolean;
  poolTimeRange: string;
  poolBreakMinutes: string;
  cycles: SiteCycleDraftState[];
  teamCycleAssignments: string[];
  teamCapacities: string[];
  // 조 목록. 배열 순서가 곧 화면·근무표에 보이는 순서이고,
  // teamCycleAssignments·teamCapacities·cycles[].teamIndexes 는 이 순서와 나란히 놓인다.
  teamSettings: SiteTeamSettingDraft[];
}

const DEFAULT_SITE_TIMEZONE = "Asia/Seoul";

interface SiteCycleDraftState {
  cycleKey: string;
  name: string;
  shiftCount: string;
  patternString: string;
  patternStartDate: string;
  breakMinutes: string;
  shiftBreakMinutes: string[];
  shiftTimes: string[];
  teamIndexes: number[];
  // 평·휴 분리: "unified"=기존 동작, "split"=평일/휴일 시간을 따로 둠.
  holidayTimeMode: "unified" | "split";
  weekdayPublicHolidayAsHoliday: boolean;
  holidayShiftTimes: string[];
  holidayShiftBreakMinutes: string[];
}

interface PendingSiteAssignment {
  employeeId: string;
  sortOrder?: number;
  teamLabel: string;
  startDate: string;
}

interface PatternImportGroupDetailRow {
  groupId: number;
  cycleKey: string;
  cycleDisplay: string;
  cycleLength: number;
  name: string;
  offset: number;
  confidence: number;
  mismatchCount: number;
  suggestedTeamLabel?: string;
  suggestedTeamIndex?: number;
  suggestedTeamCapacity?: number;
}

interface PatternImportMismatchRow {
  groupId: number;
  cycleKey: string;
  cycleDisplay: string;
  name: string;
  offset: number;
  confidence: number;
  index: number;
  cycleIndex: number;
  date: string;
  weekday: string;
  holidayName?: string;
  actualCode: string;
  expectedCode: string;
}

const presetTimeRanges = [
  "07:00 - 19:00",
  "19:00 - 07:00",
  "06:00 - 14:00",
  "14:00 - 22:00",
  "22:00 - 06:00",
  "09:00 - 17:00",
];

const createDateInputValue = () => new Date().toISOString().slice(0, 10);

const clampCount = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const normalizeList = <T,>(
  items: T[],
  targetLength: number,
  fallbackFactory: (index: number) => T,
) =>
  Array.from(
    { length: targetLength },
    (_, index) => items[index] ?? fallbackFactory(index),
  );

const buildDefaultShiftTimes = (shiftCount: number) =>
  normalizeList<string>(
    [],
    shiftCount,
    (index) =>
      presetTimeRanges[index] ?? presetTimeRanges[presetTimeRanges.length - 1],
  );

const createSequentialTeamIndexes = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => index);

const createSequentialTeamCycleAssignments = (
  teamCount: number,
  cycleCount: number,
) =>
  Array.from(
    { length: teamCount },
    (_, index) => `cycle-${(index % Math.max(cycleCount, 1)) + 1}`,
  );

const buildDefaultPatternString = (shiftCount: number) => {
  if (shiftCount === 2) {
    return "주주주휴휴휴야야야휴휴휴";
  }

  return `${getShiftPatternSymbols(shiftCount).join("")}휴`;
};

const createInitialCycleDraft = (
  cycleKey: string,
  order: number,
): SiteCycleDraftState => ({
  cycleKey,
  name: `근무 묶음 ${order + 1}`,
  shiftCount: "2",
  patternString: buildDefaultPatternString(2),
  patternStartDate: createDateInputValue(),
  breakMinutes: "60",
  shiftBreakMinutes: Array.from({ length: 2 }, () => "60"),
  shiftTimes: buildDefaultShiftTimes(2),
  teamIndexes: createSequentialTeamIndexes(4),
  holidayTimeMode: "unified",
  weekdayPublicHolidayAsHoliday: true,
  holidayShiftTimes: buildDefaultShiftTimes(2),
  holidayShiftBreakMinutes: Array.from({ length: 2 }, () => "60"),
});

const createInitialDraft = (siteCode = ""): SiteDraftState => ({
  siteCode,
  name: "",
  customerName: "",
  status: "active",
  teamCount: "4",
  cycleCount: "1",
  poolEnabled: false,
  poolTimeRange: "09:00 - 18:00",
  poolBreakMinutes: "60",
  cycles: [createInitialCycleDraft("cycle-1", 0)],
  teamCycleAssignments: createSequentialTeamCycleAssignments(4, 1),
  teamCapacities: Array.from({ length: 4 }, () => ""),
  teamSettings: createDefaultTeamSettingDrafts(4),
});

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const buildNextAutoSiteCode = (sites: SiteRecord[]) => {
  const maxIndex = sites.reduce((currentMax, site) => {
    const matched = site.siteCode
      .trim()
      .toUpperCase()
      .match(/^SITE-(\d+)$/);

    if (!matched) {
      return currentMax;
    }

    return Math.max(currentMax, Number(matched[1]));
  }, 0);

  return `SITE-${String(maxIndex + 1).padStart(3, "0")}`;
};

const getPatternStringPlaceholder = (shiftCount: number) => {
  if (shiftCount === 2) {
    return "예: 주*2,휴*2,(야휴)*2";
  }

  if (shiftCount === 3) {
    return "예: 주*2,석*2,야*2,휴*2 또는 123휴";
  }

  return "예: 1*2,2*2,3*2,휴*2";
};

const getPatternStringNote = (shiftCount: number) => {
  if (shiftCount === 2) {
    return "2교대는 주/야/휴와 반복식(예: 주*2, (야휴)*3)을 함께 사용할 수 있습니다.";
  }

  if (shiftCount === 3) {
    return "3교대는 주/석/야/휴 또는 1/2/3/휴 형식을 모두 인식합니다.";
  }

  return "4교대 이상은 1/2/3.../휴와 반복식(예: (123휴)*2) 형식을 사용할 수 있습니다.";
};

const shiftToneOrder: ShiftTone[] = [
  "day",
  "night",
  "first",
  "second",
  "third",
];

const getShiftTone = (label: string, shiftLabels: string[]): ShiftTone => {
  if (label === "휴무") {
    return "off";
  }

  const index = shiftLabels.indexOf(label);
  return shiftToneOrder[Math.max(index, 0) % shiftToneOrder.length] ?? "day";
};

const formatMonthLabel = (date: Date) =>
  `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월`;

const getHolidayNameSizeClass = (name?: string) => {
  if (!name) {
    return "";
  }

  if (name.length >= 9) {
    return "is-xlong";
  }

  if (name.length >= 6) {
    return "is-long";
  }

  return "";
};

const parseMaxHeadcount = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const buildDraftFromRow = (row: SiteViewRow): SiteDraftState => {
  const teamCount = row.pattern?.teamCount ?? 4;
  const poolEnabled = row.pattern?.poolEnabled ?? false;
  const teamSettings = buildTeamSettingDraftsFromPattern({
    poolEnabled,
    teamCount,
    teamSettings: row.pattern?.teamSettings,
  });
  const teamLabels = teamSettings.map((item) => item.teamLabel);
  const cycles = row.pattern ? getPatternCycles(row.pattern) : [];
  const cycleDrafts =
    cycles.length > 0
      ? cycles.map((cycle): SiteCycleDraftState => {
          const {
            shiftBreakMinutes,
            shiftTimes,
            holidayShiftBreakMinutes,
            holidayShiftTimes,
          } = buildCycleDraftShiftValues(cycle);
          const fallbackBreakMinutes =
            shiftBreakMinutes.find((value) => value.trim()) ?? "60";
          const normalizedShiftBreakMinutes = normalizeList(
            shiftBreakMinutes,
            cycle.shiftCount,
            () => fallbackBreakMinutes,
          );
          const normalizedShiftTimes = normalizeList(
            shiftTimes,
            cycle.shiftCount,
            (itemIndex) =>
              buildDefaultShiftTimes(cycle.shiftCount)[itemIndex] ?? "",
          );

          return {
            cycleKey: cycle.cycleKey,
            name: cycle.name,
            shiftCount: String(cycle.shiftCount),
            patternString: buildPatternString(cycle),
            patternStartDate: cycle.patternStartDate ?? createDateInputValue(),
            breakMinutes: fallbackBreakMinutes,
            shiftBreakMinutes: normalizedShiftBreakMinutes,
            shiftTimes: normalizedShiftTimes,
            teamIndexes: teamLabels.map(
              (label, itemIndex) =>
                cycle.teamIndexes.find((item) => item.teamLabel === label)
                  ?.index ?? itemIndex,
            ),
            holidayTimeMode:
              cycle.holidayTimeMode === "split" ? "split" : "unified",
            weekdayPublicHolidayAsHoliday:
              cycle.weekdayPublicHolidayAsHoliday ?? true,
            // 휴일 칸이 비어 있던 근무조는 평일 값으로 채워 보여 준다(저장은 split일 때만 됨).
            holidayShiftTimes: normalizeList(
              holidayShiftTimes,
              cycle.shiftCount,
              (itemIndex) => normalizedShiftTimes[itemIndex] ?? "",
            ),
            holidayShiftBreakMinutes: normalizeList(
              holidayShiftBreakMinutes,
              cycle.shiftCount,
              (itemIndex) =>
                normalizedShiftBreakMinutes[itemIndex] ?? fallbackBreakMinutes,
            ),
          };
        })
      : [createInitialCycleDraft("cycle-1", 0)];
  const cycleKeyByTeam = new Map(
    (row.pattern?.teamCycleAssignments.length
      ? row.pattern.teamCycleAssignments
      : teamLabels.map((teamLabel) => ({
          teamLabel,
          cycleKey: cycleDrafts[0]?.cycleKey ?? "cycle-1",
        }))
    ).map((item) => [item.teamLabel, item.cycleKey]),
  );

  return {
    siteId: row.site.id,
    patternId: row.pattern?.id,
    siteCode: row.site.siteCode,
    name: row.site.name,
    customerName: row.site.customerName ?? "",
    status: row.site.status,
    teamCount: String(teamCount),
    cycleCount: String(Math.max(cycleDrafts.length, 1)),
    poolEnabled: row.pattern?.poolEnabled ?? false,
    poolTimeRange:
      row.pattern?.poolStartTime && row.pattern.poolEndTime
        ? `${row.pattern.poolStartTime} - ${row.pattern.poolEndTime}`
        : "09:00 - 18:00",
    poolBreakMinutes: String(row.pattern?.poolBreakMinutes ?? 60),
    cycles: cycleDrafts,
    teamSettings,
    // Pool 성격 조는 배정된 묶음이 없으면 "배정 안 함"으로 남긴다(저장소도 같은 규칙).
    teamCycleAssignments: teamSettings.map(
      (team) =>
        cycleKeyByTeam.get(team.teamLabel) ??
        (team.workType === "POOL"
          ? UNASSIGNED_CYCLE_KEY
          : cycleDrafts[0]?.cycleKey ?? "cycle-1"),
    ),
    teamCapacities: teamLabels.map((label) => {
      const maxHeadcount = row.pattern?.teamCapacities.find(
        (item) => item.teamLabel === label,
      )?.maxHeadcount;

      return typeof maxHeadcount === "number" ? String(maxHeadcount) : "";
    }),
  };
};

const buildDraftFromPatternImportAnalysis = (
  analysis: SitePatternImportAnalysis,
  siteCode: string,
): SiteDraftState => {
  const suggestion = analysis.suggestion;
  const teamSettings = createDefaultTeamSettingDrafts(
    suggestion.teamCount,
    suggestion.poolEnabled,
  );
  const teamLabels = teamSettings.map((item) => item.teamLabel);
  const fallbackCycleKey = suggestion.cycles[0]?.cycleKey ?? "cycle-1";

  return {
    ...createInitialDraft(siteCode),
    teamSettings,
    siteCode,
    name: "",
    status: "active",
    teamCount: String(suggestion.teamCount),
    cycleCount: String(Math.max(suggestion.cycleCount, 1)),
    poolEnabled: suggestion.poolEnabled,
    poolTimeRange: suggestion.poolTimeRange,
    poolBreakMinutes: String(suggestion.poolBreakMinutes),
    cycles: suggestion.cycles.map((cycle) => ({
      cycleKey: cycle.cycleKey,
      name: cycle.name,
      shiftCount: String(cycle.shiftCount),
      patternString: cycle.patternString,
      patternStartDate: cycle.patternStartDate,
      breakMinutes: String(cycle.breakMinutes),
      shiftBreakMinutes: Array.from(
        { length: cycle.shiftCount },
        () => String(cycle.breakMinutes),
      ),
      shiftTimes: cycle.shiftTimes,
      holidayTimeMode: "unified" as const,
      weekdayPublicHolidayAsHoliday: true,
      holidayShiftTimes: cycle.shiftTimes,
      holidayShiftBreakMinutes: Array.from(
        { length: cycle.shiftCount },
        () => String(cycle.breakMinutes),
      ),
      teamIndexes: teamLabels.map(
        (teamLabel) =>
          cycle.teamIndexes.find((item) => item.teamLabel === teamLabel)
            ?.index ?? 0,
      ),
    })),
    teamCycleAssignments: teamLabels.map(
      (teamLabel) =>
        suggestion.teams.find((team) => team.teamLabel === teamLabel)
          ?.cycleKey ?? fallbackCycleKey,
    ),
    teamCapacities: teamLabels.map((teamLabel) => {
      const maxHeadcount = suggestion.teams.find(
        (team) => team.teamLabel === teamLabel,
      )?.maxHeadcount;

      return typeof maxHeadcount === "number" && maxHeadcount > 0
        ? String(maxHeadcount)
        : "";
    }),
  };
};

// "자주 쓰는 패턴으로 시작" 템플릿을 1단계 초안으로 변환한다(시작점; 적용 후 자유 수정).
const buildDraftFromRotationTemplate = (
  template: RotationTemplate,
  siteCode: string,
): SiteDraftState => {
  const teamSettings = createDefaultTeamSettingDrafts(template.teamCount);
  const teamLabels = teamSettings.map((item) => item.teamLabel);
  const cycleLength = template.patternString.length;
  const breakMinutesText = String(template.breakMinutes);
  const baseCycle = createInitialCycleDraft("cycle-1", 0);
  const cycle: SiteCycleDraftState = {
    ...baseCycle,
    shiftCount: String(template.shiftCount),
    patternString: template.patternString,
    breakMinutes: breakMinutesText,
    shiftBreakMinutes: Array.from({ length: template.shiftCount }, () => breakMinutesText),
    shiftTimes: [...template.shiftTimes],
    holidayShiftTimes: [...template.shiftTimes],
    holidayShiftBreakMinutes: Array.from({ length: template.shiftCount }, () => breakMinutesText),
    teamIndexes: buildRotationTeamIndexes(template.teamCount, cycleLength),
  };

  return {
    ...createInitialDraft(siteCode),
    siteCode,
    teamCount: String(template.teamCount),
    cycleCount: "1",
    cycles: [cycle],
    teamSettings,
    teamCycleAssignments: teamLabels.map(() => "cycle-1"),
    teamCapacities: teamLabels.map(() => ""),
  };
};

interface SiteManagementScreenProps {
  session: AuthSession;
}

export const SiteManagementScreen = ({
  session,
}: SiteManagementScreenProps) => {
  const { setSelectedSiteId: setWorkflowSiteId, openRoute } = useAppWorkflow();
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [siteNameOptions, setSiteNameOptions] = useState<
    SiteNameOptionRecord[]
  >([]);
  const [draft, setDraft] = useState<SiteDraftState>(() =>
    createInitialDraft(),
  );
  const [siteStatusFilter, setSiteStatusFilter] =
    useState<SiteStatusFilter>("all");
  const [pendingAssignments, setPendingAssignments] = useState<
    PendingSiteAssignment[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isCompletingSite, setIsCompletingSite] = useState(false);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(
    null,
  );
  const [isTeamCapacityDirty, setIsTeamCapacityDirty] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stepTwoError, setStepTwoError] = useState<string | null>(null);
  const [focusedAssignmentTeamLabel, setFocusedAssignmentTeamLabel] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [simulationHolidayNameByDate, setSimulationHolidayNameByDate] =
    useState<Map<string, string>>(new Map());
  const { askQuestion, questionDialog } = useQuestionDialog();
  const {
    clearDraggingEmployee,
    draggingEmployeeId,
    draggingEmployeeSourceTeam,
    handleAssignmentDragAutoScroll,
    handleStepTwoDragStart,
    stopDragAutoScroll,
  } = useSiteManagementAssignmentDragState();
  const {
    assignmentStartDate,
    closePatternPresetModal,
    draggingTeamLabel,
    openPatternPresetModal,
    poolKeyword,
    poolScope,
    resetRegistrationViewState,
    selectedPatternPresetSiteId,
    setAssignmentStartDate,
    setDraggingTeamLabel,
    setPoolKeyword,
    setPoolScope,
    setSelectedPatternPresetSiteId,
    setSimulationMonthIndex,
    setView,
    showPatternPresetModal,
    simulationMonthIndex,
    view,
  } = useSiteManagementStepState(createDateInputValue);
  const {
    deleteError,
    detailSiteId,
    detailSnapshot,
    isAnalyzingPatternImport,
    isDeletingSite,
    patternImportAnalysis,
    patternImportCopyStatus,
    patternImportError,
    patternImportFile,
    patternImportPreviewTab,
    setDeleteError,
    setDetailSiteId,
    setDetailSnapshot,
    setIsAnalyzingPatternImport,
    setIsDeletingSite,
    setPatternImportAnalysis,
    setPatternImportCopyStatus,
    setPatternImportError,
    setPatternImportFile,
    setPatternImportPreviewTab,
    setShowPatternImportGuide,
    setShowPatternImportModal,
    showPatternImportGuide,
    showPatternImportModal,
  } = useSiteManagementInteractionState();
  const {
    handleBackToList,
    listHeadingRef,
    markShouldRestoreListFocus,
    resetRegistrationState,
  } = useSiteManagementRegistrationFlow<SiteViewRow, PendingSiteAssignment>({
    clearDraggingEmployee,
    resetRegistrationViewState,
    setDeleteError,
    setDetailSiteId,
    setDetailSnapshot,
    setFormError,
    setIsTeamCapacityDirty,
    setPendingAssignments,
    setStepTwoError,
    setView,
    view,
  });

  const deferredPoolKeyword = useDeferredValue(poolKeyword);
  const rows = useMemo(
    () => buildRows(sites, patterns, employees),
    [employees, patterns, sites],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        siteStatusFilter === "all" ? true : row.site.status === siteStatusFilter
      ),
    [rows, siteStatusFilter]
  );
  const siteNameSelectValues = useMemo(
    () => buildSiteNameSelectValues(siteNameOptions, draft.customerName),
    [draft.customerName, siteNameOptions],
  );
  const detailRow = detailSnapshot;
  const pendingAssignmentMap = useMemo(
    () => new Map(pendingAssignments.map((item) => [item.employeeId, item])),
    [pendingAssignments],
  );
  const { detailTeamIndexes, detailCycleCards, detailTotalAssignedHeadcount } =
    useMemo(() => buildSiteDetailModels(detailRow), [detailRow]);
  const siteListSummary = useMemo(
    () => buildSiteListSummary(rows, filteredRows),
    [filteredRows, rows]
  );
  const patternPresetRows = useMemo(
    () => buildPatternPresetRows(rows, draft.siteId),
    [draft.siteId, rows],
  );
  const selectedPatternPresetRow = useMemo(
    () =>
      patternPresetRows.find(
        (row) => row.site.id === selectedPatternPresetSiteId,
      ) ?? null,
    [patternPresetRows, selectedPatternPresetSiteId],
  );
  const patternImportGroupDetailRows = useMemo<PatternImportGroupDetailRow[]>(
    () =>
      patternImportAnalysis?.groups.flatMap((group) =>
        group.members.map((member) => {
          const suggestedTeam = patternImportAnalysis.suggestion.teams.find(
            (team) =>
              team.cycleKey === group.cycleKey && team.index === member.offset,
          );

          return {
            groupId: group.groupId,
            cycleKey: group.cycleKey,
            cycleDisplay: group.cycleDisplay,
            cycleLength: group.cycleLength,
            name: member.name,
            offset: member.offset,
            confidence: member.confidence,
            mismatchCount: member.mismatchCount,
            suggestedTeamLabel: suggestedTeam?.teamLabel,
            suggestedTeamIndex: suggestedTeam?.index,
            suggestedTeamCapacity: suggestedTeam?.maxHeadcount,
          };
        }),
      ) ?? [],
    [patternImportAnalysis],
  );
  const patternImportMismatchRows = useMemo<PatternImportMismatchRow[]>(
    () =>
      patternImportAnalysis?.groups.flatMap((group) =>
        group.members.flatMap((member) =>
          member.mismatches.map((mismatch) => ({
            groupId: group.groupId,
            cycleKey: group.cycleKey,
            cycleDisplay: group.cycleDisplay,
            name: member.name,
            offset: member.offset,
            confidence: member.confidence,
            index: mismatch.index,
            cycleIndex: mismatch.cycleIndex,
            date: mismatch.date,
            weekday: mismatch.weekday,
            holidayName: mismatch.holidayName,
            actualCode: mismatch.actualCode,
            expectedCode: mismatch.expectedCode,
          })),
        ),
      ) ?? [],
    [patternImportAnalysis],
  );
  const teamCount = clampCount(Number(draft.teamCount), 2, 8);
  const cycleCount = clampCount(Number(draft.cycleCount), 1, 4);
  // 조 목록이 곧 조 순서다. 정원·묶음 배정·조별 Index 는 모두 이 순서와 나란히 놓인다.
  const teamLabels = useMemo(
    () => draft.teamSettings.map((item) => item.teamLabel),
    [draft.teamSettings],
  );
  const teamSlotCount = teamLabels.length;
  // 1단계 미리보기·칩에 보여 줄 이름. 조 이름을 바꾸면 여기부터 바뀐다.
  const displayTeamLabels = useMemo(
    () => draft.teamSettings.map(getTeamDisplayName),
    [draft.teamSettings],
  );
  const cyclePreviews = useMemo(
    () =>
      buildSitePatternCyclePreviews({
        cycleCount,
        cycleDrafts: draft.cycles,
        fallbackDate: createDateInputValue(),
        fallbackTimeRanges: presetTimeRanges,
        teamCount,
        teamSlotCount,
      }),
    [cycleCount, draft.cycles, teamCount, teamSlotCount],
  );
  const { simulationAnchorDate, simulationMonth, simulationMonths } = useMemo(
    () =>
      buildSitePatternSimulationTimeline({
        cyclePreviews,
        fallbackDate: createDateInputValue(),
        simulationMonthIndex,
      }),
    [cyclePreviews, simulationMonthIndex],
  );

  useEffect(() => {
    let active = true;

    const loadSimulationHolidayMap = async () => {
      try {
        const nextMap = await loadSiteSimulationHolidayMap({
          listHolidayCalendars: window.appBridge.listHolidayCalendars,
          simulationMonths,
        });

        if (!active) {
          return;
        }

        setSimulationHolidayNameByDate(nextMap);
      } catch {
        if (active) {
          setSimulationHolidayNameByDate(new Map());
        }
      }
    };

    void loadSimulationHolidayMap();

    return () => {
      active = false;
    };
  }, [refreshKey, simulationMonths]);

  // 달력 미리보기에는 실제로 근무표가 만들어지는 조만 넣는다.
  // (사용 안 함으로 꺼 둔 조, 근무 묶음을 배정하지 않은 조는 빠진다.)
  const scheduledTeams = useMemo(
    () =>
      draft.teamSettings.flatMap((team, index) => {
        const cycleKey = draft.teamCycleAssignments[index] ?? UNASSIGNED_CYCLE_KEY;

        return team.isActive && cycleKey
          ? [{ cycleKey, slotIndex: index, teamLabel: getTeamDisplayName(team) }]
          : [];
      }),
    [draft.teamCycleAssignments, draft.teamSettings],
  );
  const simulationCells = useMemo(
    () =>
      buildSiteSimulationCells({
        cyclePreviews,
        fallbackDate: createDateInputValue(),
        getShiftTone,
        holidayNameByDate: simulationHolidayNameByDate,
        monthDate: simulationMonth?.date ?? new Date(),
        teamCycleAssignments: scheduledTeams.map((team) => team.cycleKey),
        teamLabels: scheduledTeams.map((team) => team.teamLabel),
        teamStartIndexes: scheduledTeams.map((team) => {
          const cycle = cyclePreviews.find(
            (item) => item.cycleKey === team.cycleKey,
          );

          return cycle?.teamIndexes[team.slotIndex] ?? team.slotIndex;
        }),
      }),
    [
      cyclePreviews,
      scheduledTeams,
      simulationHolidayNameByDate,
      simulationMonth?.date,
    ],
  );
  const simulationMetrics = useMemo(
    () => buildSiteSimulationMetrics(simulationCells, cyclePreviews),
    [cyclePreviews, simulationCells],
  );
  const poolDailyHours = useMemo(
    () =>
      calculateWorkingHours(
        draft.poolTimeRange,
        Number(draft.poolBreakMinutes) || 0,
      ),
    [draft.poolBreakMinutes, draft.poolTimeRange],
  );
  const configuredTeamCapacities = useMemo(
    () =>
      new Map(
        teamLabels.map((teamLabel, index) => [
          teamLabel,
          parseMaxHeadcount(draft.teamCapacities[index] ?? ""),
        ]),
      ),
    [draft.teamCapacities, teamLabels],
  );

  const activeTeamLabels = useMemo(
    () =>
      buildActiveTeamLabels({
        employees,
        pendingAssignments,
        poolEnabled: draft.poolEnabled,
        siteId: draft.siteId,
        teamLabels,
      }),
    [
      draft.poolEnabled,
      draft.siteId,
      employees,
      pendingAssignments,
      teamLabels,
    ],
  );

  const assignedByTeam = useMemo(
    () =>
      buildAssignedEmployeesByTeam({
        activeTeamLabels,
        employees,
        pendingAssignmentMap,
        siteId: draft.siteId,
      }),
    [activeTeamLabels, draft.siteId, employees, pendingAssignmentMap],
  );

  const filteredPoolEmployees = useMemo(
    () =>
      buildFilteredPoolEmployees({
        employees,
        keyword: deferredPoolKeyword,
        pendingAssignmentMap,
        poolScope,
        siteId: draft.siteId,
      }),
    [
      deferredPoolKeyword,
      draft.siteId,
      employees,
      pendingAssignmentMap,
      poolScope,
    ],
  );

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [
          siteResult,
          patternResult,
          employeeResult,
          siteNameOptionsResult,
        ] = await Promise.all([
          window.appBridge.listSites(),
          window.appBridge.listShiftPatterns(),
          window.appBridge.listEmployees(),
          window.appBridge.listSiteNameOptions(),
        ]);

        if (!active) {
          return;
        }

        if (siteResult.ok) {
          setSites(siteResult.data);
        } else {
          setScreenError(siteResult.message);
        }

        if (patternResult.ok) {
          setPatterns(patternResult.data);
        } else {
          setScreenError(patternResult.message);
        }

        if (employeeResult.ok) {
          setEmployees(employeeResult.data);
        } else {
          setScreenError(employeeResult.message);
        }

        if (siteNameOptionsResult.ok) {
          setSiteNameOptions(siteNameOptionsResult.data);
        } else {
          setScreenError(siteNameOptionsResult.message);
        }
      } catch (error) {
        if (active) {
          setScreenError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!detailSiteId) {
      if (detailSnapshot) {
        setDetailSnapshot(null);
      }

      return;
    }

    const nextDetailRow =
      rows.find((row) => row.site.id === detailSiteId) ?? null;

    if (!nextDetailRow) {
      return;
    }

    setDetailSnapshot((current) =>
      current?.site.id === nextDetailRow.site.id &&
      current.pattern?.id === nextDetailRow.pattern?.id &&
      current.teamStatusItems.length === nextDetailRow.teamStatusItems.length
        ? current
        : nextDetailRow,
    );
  }, [detailSiteId, detailSnapshot, rows]);

  useEffect(() => {
    setDraft((current) => {
      const normalizedCycles = normalizeList(
        current.cycles,
        cycleCount,
        (index) => createInitialCycleDraft(`cycle-${index + 1}`, index),
      ).map((cycle, index): SiteCycleDraftState => {
        const shiftCount = clampCount(Number(cycle.shiftCount), 1, 6);

        return {
          ...cycle,
          cycleKey: cycle.cycleKey || `cycle-${index + 1}`,
          name: cycle.name.trim() || `근무 묶음 ${index + 1}`,
          shiftCount: String(shiftCount),
          patternString: cycle.patternString.trim()
            ? cycle.patternString
            : buildDefaultPatternString(shiftCount),
          patternStartDate: cycle.patternStartDate || createDateInputValue(),
          breakMinutes: String(Math.max(Number(cycle.breakMinutes) || 0, 0)),
          shiftBreakMinutes: normalizeList(
            cycle.shiftBreakMinutes,
            shiftCount,
            () => String(Math.max(Number(cycle.breakMinutes) || 0, 0)),
          ).map((value) => String(Math.max(Number(value) || 0, 0))),
          shiftTimes: normalizeList(
            cycle.shiftTimes,
            shiftCount,
            (itemIndex) => {
              const defaults = buildDefaultShiftTimes(shiftCount);
              return defaults[itemIndex] ?? "";
            },
          ),
          holidayTimeMode:
            cycle.holidayTimeMode === "split" ? "split" : "unified",
          weekdayPublicHolidayAsHoliday:
            cycle.weekdayPublicHolidayAsHoliday ?? true,
          // 휴일 칸은 0으로 강제하지 않는다. 빈 칸은 "평일과 동일"을 뜻하고 저장 시 평일 값으로 채워진다.
          holidayShiftTimes: normalizeList(
            cycle.holidayShiftTimes ?? [],
            shiftCount,
            () => "",
          ),
          holidayShiftBreakMinutes: normalizeList(
            cycle.holidayShiftBreakMinutes ?? [],
            shiftCount,
            () => "",
          ),
          teamIndexes: cycle.teamIndexes,
        };
      });
      const availableCycleKeys = new Set(
        normalizedCycles.map((cycle) => cycle.cycleKey),
      );
      const firstCycleKey = normalizedCycles[0]?.cycleKey ?? "cycle-1";
      // 조 수나 별도 근무 설정이 바뀌면 조 목록을 먼저 맞추고, 조와 나란히 놓인 값은 조 이름 기준으로 옮긴다.
      const nextTeamSettings = syncTeamSettingDrafts({
        current: current.teamSettings,
        poolEnabled: current.poolEnabled,
        teamCount,
      });
      const previousLabels = current.teamSettings.map((item) => item.teamLabel);
      const nextLabels = nextTeamSettings.map((item) => item.teamLabel);
      const normalizedAssignments = reindexTeamSlotValues({
        // 새로 생긴 조는 묶음을 돌아가며 배정한다. 단 Pool 성격 조는 배정 없이 시작한다.
        fallback: (_teamLabel, index) =>
          nextTeamSettings[index]?.workType === "POOL"
            ? UNASSIGNED_CYCLE_KEY
            : normalizedCycles[index % normalizedCycles.length]?.cycleKey ??
              firstCycleKey,
        nextLabels,
        previousLabels,
        values: current.teamCycleAssignments,
      }).map((cycleKey, index) => {
        if (availableCycleKeys.has(cycleKey)) {
          return cycleKey;
        }

        // Pool 성격 조만 "배정 안 함"으로 남을 수 있다. 나머지는 첫 묶음으로 되돌린다.
        return nextTeamSettings[index]?.workType === "POOL"
          ? UNASSIGNED_CYCLE_KEY
          : firstCycleKey;
      });

      return {
        ...current,
        teamCount: String(teamCount),
        cycleCount: String(cycleCount),
        cycles: normalizedCycles.map((cycle) => ({
          ...cycle,
          teamIndexes: reindexTeamSlotValues({
            fallback: (_teamLabel, index) => index,
            nextLabels,
            previousLabels,
            values: cycle.teamIndexes,
          }),
        })),
        teamSettings: nextTeamSettings,
        teamCycleAssignments: normalizedAssignments,
        teamCapacities: reindexTeamSlotValues({
          fallback: () => "",
          nextLabels,
          previousLabels,
          values: current.teamCapacities,
        }),
      };
    });
  }, [cycleCount, draft.poolEnabled, teamCount]);

  useEffect(() => {
    if (view !== "step1" || draft.siteId || draft.siteCode.trim()) {
      return;
    }

    setDraft((current) => ({
      ...current,
      siteCode: buildNextAutoSiteCode(sites),
    }));
  }, [draft.siteCode, draft.siteId, sites, view]);

  useEffect(() => {
    setSimulationMonthIndex((current) =>
      Math.min(current, Math.max(simulationMonths.length - 1, 0)),
    );
  }, [simulationMonths.length]);

  const handleDraftChange = <K extends keyof SiteDraftState>(
    key: K,
    value: SiteDraftState[K],
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleCycleDraftChange = (
    cycleKey: string,
    key: keyof SiteCycleDraftState,
    value: SiteCycleDraftState[keyof SiteCycleDraftState],
  ) => {
    // 휴게시간 기본값(breakMinutes)을 바꿔도 이미 입력된 근무조별 휴게시간은 건드리지 않는다.
    // 기본값은 새로 추가되는 근무조와 비운 칸에만 적용된다(근무조별 차등 휴게 보존).
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) =>
        cycle.cycleKey === cycleKey ? { ...cycle, [key]: value } : cycle,
      ),
    }));
  };

  const handleCycleShiftBreakChange = (
    cycleKey: string,
    shiftIndex: number,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) => {
        if (cycle.cycleKey !== cycleKey) {
          return cycle;
        }

        const size = clampCount(Number(cycle.shiftCount), 1, 6);
        const shiftBreakMinutes = Array.from({ length: size }, (_, index) => {
          if (index === shiftIndex) {
            // 비우면 그 근무조는 휴게시간 기본값을 따른다(0분으로 잘못 저장되지 않게).
            return value.trim() === "" ? cycle.breakMinutes : value;
          }

          return cycle.shiftBreakMinutes[index] ?? cycle.breakMinutes;
        });

        return { ...cycle, shiftBreakMinutes };
      }),
    }));
  };

  const handleCycleShiftTimeChange = (
    cycleKey: string,
    shiftIndex: number,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) =>
        cycle.cycleKey === cycleKey
          ? {
              ...cycle,
              shiftTimes: cycle.shiftTimes.map((item, itemIndex) =>
                itemIndex === shiftIndex ? value : item,
              ),
            }
          : cycle,
      ),
    }));
  };

  // 평·휴 분리: "평일에 낀 공휴일도 휴일 시간" 체크박스.
  const handleCycleHolidayToggle = (cycleKey: string, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) =>
        cycle.cycleKey === cycleKey
          ? { ...cycle, weekdayPublicHolidayAsHoliday: checked }
          : cycle,
      ),
    }));
  };

  const handleCycleHolidayShiftTimeChange = (
    cycleKey: string,
    shiftIndex: number,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) => {
        if (cycle.cycleKey !== cycleKey) {
          return cycle;
        }

        const size = clampCount(Number(cycle.shiftCount), 1, 6);
        const holidayShiftTimes = Array.from({ length: size }, (_, index) =>
          index === shiftIndex ? value : cycle.holidayShiftTimes[index] ?? "",
        );

        return { ...cycle, holidayShiftTimes };
      }),
    }));
  };

  const handleCycleHolidayShiftBreakChange = (
    cycleKey: string,
    shiftIndex: number,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) => {
        if (cycle.cycleKey !== cycleKey) {
          return cycle;
        }

        const size = clampCount(Number(cycle.shiftCount), 1, 6);
        // 빈 값은 그대로 둔다(빈 칸 = 평일 휴게와 동일). 0으로 강제하지 않는다.
        const holidayShiftBreakMinutes = Array.from({ length: size }, (_, index) =>
          index === shiftIndex ? value : cycle.holidayShiftBreakMinutes[index] ?? "",
        );

        return { ...cycle, holidayShiftBreakMinutes };
      }),
    }));
  };

  const handleCycleTeamIndexChange = (
    cycleKey: string,
    teamIndex: number,
    value: string,
  ) => {
    // 조별 Index 는 0 ~ (Cycle 길이-1) 범위 안에서만 의미가 있으므로, 음수나 과대값을
    // 타이핑해도 즉시 범위 안으로 보정한다(저장 시 검증과 동일한 상한).
    const maxIndex = Math.max(
      (cyclePreviews.find((cycle) => cycle.cycleKey === cycleKey)?.cycleLabels.length ?? 1) - 1,
      0,
    );
    const nextValue = clampCount(Number(value), 0, maxIndex);

    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) =>
        cycle.cycleKey === cycleKey
          ? {
              ...cycle,
              teamIndexes: cycle.teamIndexes.map((item, itemIndex) =>
                itemIndex === teamIndex ? nextValue : item,
              ),
            }
          : cycle,
      ),
    }));
  };

  const handleTeamCapacityChange = (teamIndex: number, value: string) => {
    setDraft((current) => ({
      ...current,
      teamCapacities: current.teamCapacities.map((item, itemIndex) =>
        itemIndex === teamIndex ? value : item,
      ),
    }));
    setIsTeamCapacityDirty(true);
  };

  const handleTeamCycleChange = (teamIndex: number, cycleKey: string) => {
    setDraft((current) => ({
      ...current,
      teamCycleAssignments: current.teamCycleAssignments.map(
        (item, itemIndex) => (itemIndex === teamIndex ? cycleKey : item),
      ),
    }));
  };

  const handleAssignTeamToCycle = (teamLabel: string, cycleKey: string) => {
    const teamIndex = displayTeamLabels.indexOf(teamLabel);

    if (teamIndex < 0) {
      return;
    }

    handleTeamCycleChange(teamIndex, cycleKey);
  };

  const updateTeamSetting = (
    teamIndex: number,
    patch: Partial<SiteTeamSettingDraft>,
  ) => {
    setDraft((current) => ({
      ...current,
      teamSettings: current.teamSettings.map((item, itemIndex) =>
        itemIndex === teamIndex ? { ...item, ...patch } : item,
      ),
    }));
  };

  const handleTeamDisplayNameChange = (teamIndex: number, value: string) => {
    updateTeamSetting(teamIndex, { displayName: value });
  };

  const handleTeamWorkTypeChange = (teamIndex: number, value: string) => {
    const workType = normalizeTeamWorkType(value);

    setDraft((current) => ({
      ...current,
      teamSettings: current.teamSettings.map((item, itemIndex) =>
        itemIndex === teamIndex ? { ...item, workType } : item,
      ),
      // 교대조·주간고정조는 반드시 근무 묶음이 있어야 한다. Pool로 바꾼 조만 배정을 비울 수 있다.
      teamCycleAssignments: current.teamCycleAssignments.map((item, itemIndex) => {
        if (itemIndex !== teamIndex || workType === "POOL" || item) {
          return item;
        }

        return current.cycles[0]?.cycleKey ?? "cycle-1";
      }),
    }));
  };

  const handleTeamIsActiveChange = (teamIndex: number, checked: boolean) => {
    updateTeamSetting(teamIndex, { isActive: checked });
  };

  // 조 순서를 바꾸면 조와 나란히 놓인 값(묶음 배정·정원·조별 Index)도 함께 옮긴다.
  const handleTeamMove = (teamIndex: number, direction: -1 | 1) => {
    const targetIndex = teamIndex + direction;

    setDraft((current) => {
      if (targetIndex < 0 || targetIndex >= current.teamSettings.length) {
        return current;
      }

      return {
        ...current,
        teamSettings: swapTeamSlots(current.teamSettings, teamIndex, targetIndex),
        teamCycleAssignments: swapTeamSlots(
          current.teamCycleAssignments,
          teamIndex,
          targetIndex,
        ),
        teamCapacities: swapTeamSlots(
          current.teamCapacities,
          teamIndex,
          targetIndex,
        ),
        cycles: current.cycles.map((cycle) => ({
          ...cycle,
          teamIndexes: swapTeamSlots(cycle.teamIndexes, teamIndex, targetIndex),
        })),
      };
    });
    setIsTeamCapacityDirty(true);
  };

  // 자주 쓰는 패턴 템플릿 적용: 조 수·교대·시간·패턴을 한 번에 채우되, 이미 입력한
  // 근무지 식별 정보(이름·사이트명·상태·코드)는 그대로 보존한다.
  const handleApplyRotationTemplate = (templateKey: string) => {
    const template = ROTATION_TEMPLATES.find((item) => item.key === templateKey);

    if (!template) {
      return;
    }

    setFormError(null);
    setDraft((current) => ({
      ...buildDraftFromRotationTemplate(template, current.siteCode),
      siteId: current.siteId,
      patternId: current.patternId,
      name: current.name,
      customerName: current.customerName,
      status: current.status,
    }));
  };

  const validateDraftForm = () => {
    const validationError = getSiteDraftValidationError({
      cyclePreviews,
      draft,
      parseMaxHeadcount,
      teamLabels,
    });

    setFormError(validationError);

    return !validationError;
  };

  const ensureStepTwoPatternSaved = async () => {
    if (!isTeamCapacityDirty) {
      return true;
    }

    return persistDraft({ preserveAssignmentStartDate: true });
  };

  const ensureSiteReadyForAssignments = async () => {
    if (draft.siteId) {
      const stepTwoSaved = await ensureStepTwoPatternSaved();

      return stepTwoSaved ? draft.siteId : null;
    }

    const savedDraft = await saveDraftToStorage({
      preserveAssignmentStartDate: true,
    });

    return savedDraft?.site.id ?? null;
  };

  const saveDraftToStorage = async (options?: {
    preserveAssignmentStartDate?: boolean;
  }) => {
    setIsSavingDraft(true);

    try {
      const result = await saveSiteDraft({
        bridge: window.appBridge,
        createDateInputValue,
        cycleCount,
        cyclePreviews,
        defaultSiteTimezone: DEFAULT_SITE_TIMEZONE,
        draft,
        parseMaxHeadcount,
        teamCount,
        teamLabels,
      });

      if (!result.ok) {
        setFormError(result.message);
        return null;
      }

      setFormError(null);
      setDraft((current) => ({
        ...current,
        siteId: result.site.id,
        patternId: result.patternId,
        siteCode: result.site.siteCode,
        name: result.site.name,
        customerName: result.site.customerName ?? "",
        status: result.site.status,
      }));
      setWorkflowSiteId(result.site.id);
      if (!options?.preserveAssignmentStartDate) {
        setAssignmentStartDate(result.assignmentStartDate);
      }
      setIsTeamCapacityDirty(false);
      setRefreshKey((current) => current + 1);

      return {
        site: result.site,
        patternId: result.patternId,
      };
    } catch (error) {
      setFormError(getErrorMessage(error));
      return null;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const persistDraft = async (options?: {
    preserveAssignmentStartDate?: boolean;
  }) => Boolean(await saveDraftToStorage(options));

  const interactionActions = createSiteManagementInteractionActions({
    askQuestion,
    bridge: window.appBridge,
    buildDraftFromPatternImportAnalysis,
    buildDraftFromRow,
    buildNextAutoSiteCode,
    createDateInputValue,
    createInitialDraft,
    detailRow,
    getErrorMessage,
    incrementRefreshKey: () => {
      setRefreshKey((current) => current + 1);
    },
    markShouldRestoreListFocus,
    patternImportAnalysis,
    patternImportFile,
    resetRegistrationState,
    rows,
    setAssignmentStartDate,
    setDeleteError,
    setDetailSiteId,
    setDetailSnapshot,
    setDraft,
    setFocusedAssignmentTeamLabel,
    setIsAnalyzingPatternImport,
    setIsDeletingSite,
    setPatternImportAnalysis,
    setPatternImportCopyStatus,
    setPatternImportError,
    setPatternImportFile,
    setPatternImportPreviewTab,
    setShowPatternImportModal,
    setView,
    setWorkflowSiteId,
    sites,
    writeClipboardText: (value) => navigator.clipboard.writeText(value),
  });
  const handleBackToListWithAssignmentReset = () => {
    setFocusedAssignmentTeamLabel(null);
    handleBackToList();
  };
  const stepOneActions = createSiteManagementStepOneActions({
    askQuestion,
    buildDraftFromRow,
    closePatternPresetModal,
    createDateInputValue,
    draftSiteId: draft.siteId,
    getPatternStartDate: (row: SiteViewRow) => row.pattern?.patternStartDate,
    persistDraft,
    selectedPatternPresetRow,
    setAssignmentStartDate,
    setDraft,
    setFormError,
    setView,
    validateDraftForm,
  });

  const stepTwoActions = createSiteManagementStepTwoActions({
    askQuestion,
    assignedByTeam,
    assignmentStartDate,
    bridge: window.appBridge,
    clearDraggingEmployee,
    configuredTeamCapacities,
    draftSiteId: draft.siteId,
    draftSiteName: draft.name,
    ensureSiteReadyForAssignments,
    getErrorMessage,
    handleBackToList: handleBackToListWithAssignmentReset,
    incrementRefreshKey: () => {
      setRefreshKey((current) => current + 1);
    },
    pendingAssignmentMap,
    pendingAssignments,
    setAssigningEmployeeId,
    setEmployees,
    setIsCompletingSite,
    setPendingAssignments,
    setStepTwoError,
    stopDragAutoScroll,
  });

  const handleStepTwoAssignEmployee = async (
    employeeId: string,
    targetTeam: string,
  ) => {
    const employee = employees.find((item) => item.id === employeeId);

    if (!employee) {
      clearDraggingEmployee();
      return;
    }

    await stepTwoActions.handleAssignEmployee(employee, targetTeam);
  };

  const handleStepTwoUnassignEmployee = async (employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId);

    if (!employee) {
      clearDraggingEmployee();
      return;
    }

    await stepTwoActions.handleUnassignEmployee(employee);
  };

  const handleStepTwoMoveEmployee = async (
    employeeId: string,
    teamLabel: string,
    direction: "up" | "down"
  ) => {
    const employee = employees.find((item) => item.id === employeeId);

    if (!employee) {
      return;
    }

    await stepTwoActions.handleMoveEmployee(employee, teamLabel, direction);
  };

  const handleStepTwoTeamCapacityChange = (
    teamLabel: string,
    value: string,
  ) => {
    const targetIndex = teamLabels.indexOf(teamLabel);

    if (targetIndex < 0) {
      return;
    }

    handleTeamCapacityChange(targetIndex, value);
  };
  const canManageSiteWrites = canPerformAction(session.role, "site-write");
  const canManageShiftPatternWrites = canPerformAction(
    session.role,
    "shift-pattern-write",
  );
  const canManageSiteRegistration =
    canManageSiteWrites && canManageShiftPatternWrites;

  if (view === "step2") {
    const cycleShiftCards = cyclePreviews.flatMap((cycle) =>
      cycle.shiftCards.map((card) => ({
        key: `${cycle.cycleKey}-${card.label}`,
        cycleName: cycle.name,
        ...card,
      })),
    );
    const stageLabel = draft.siteId ? "근무지 수정" : "근무지 등록";
    const teamColumns = buildSiteAssignmentTeamColumns({
      activeTeamLabels,
      assignedByTeam,
      configuredTeamCapacities,
      draggingEmployeeId,
      teamCapacities: draft.teamCapacities,
      teamLabels,
    });

    return (
      <div className="screen-stack">
        {questionDialog}
        <SiteAssignmentStepView
          assignmentStartDate={assignmentStartDate}
          assigningEmployeeId={assigningEmployeeId}
          canManageSiteRegistration={canManageSiteRegistration}
          cycleShiftCards={cycleShiftCards}
          draggingEmployeeId={draggingEmployeeId}
          draggingEmployeeSourceTeam={draggingEmployeeSourceTeam}
          errorMessage={stepTwoError ?? formError}
          filteredPoolEmployees={filteredPoolEmployees}
          focusedTeamLabel={focusedAssignmentTeamLabel}
          isCompletingSite={isCompletingSite}
          isSavingDraft={isSavingDraft}
          onAssignEmployee={handleStepTwoAssignEmployee}
          onAssignmentStartDateChange={setAssignmentStartDate}
          onBack={() => {
            setFocusedAssignmentTeamLabel(null);
            setView("step1");
          }}
          onClearDraggingEmployee={clearDraggingEmployee}
          onComplete={() => {
            void stepTwoActions.handleCompleteStepTwo();
          }}
          onDragAutoScroll={handleAssignmentDragAutoScroll}
          onOpenSchedule={() => {
            if (!draft.siteId) {
              return;
            }

            setWorkflowSiteId(draft.siteId);
            openRoute("schedule", { selectedSiteId: draft.siteId });
          }}
          onPoolKeywordChange={setPoolKeyword}
          onPoolScopeChange={setPoolScope}
          onMoveEmployee={handleStepTwoMoveEmployee}
          onSaveOrValidate={() => {
            if (!draft.siteId) {
              validateDraftForm();
              return;
            }

            void (async () => {
              const saved = await persistDraft({ preserveAssignmentStartDate: true });

              if (saved) {
                await showActionResultDialog(askQuestion, {
                  title: "근무지 저장 완료",
                  message: `${draft.name || "근무지"} 2단계 설정을 저장했습니다.`
                });
              }
            })();
          }}
          onStartDraggingEmployee={handleStepTwoDragStart}
          onTeamCapacityChange={handleStepTwoTeamCapacityChange}
          onUnassignEmployee={handleStepTwoUnassignEmployee}
          poolEnabled={draft.poolEnabled}
          poolKeyword={poolKeyword}
          poolScope={poolScope}
          siteId={draft.siteId}
          siteName={draft.name}
          stageLabel={stageLabel}
          teamColumns={teamColumns}
        />
      </div>
    );
  }

  if (view === "step1") {
    const stageLabel = draft.siteId ? "근무지 수정" : "근무지 등록";
    const cycleAssignments = buildSitePatternCycleAssignments({
      createFallbackDraft: (cycleKey) => createInitialCycleDraft(cycleKey, 0),
      cycleDrafts: draft.cycles,
      cyclePreviews,
      teamCycleAssignments: draft.teamCycleAssignments,
      teamLabels: displayTeamLabels,
    });
    const {
      activeCycleCount,
      advancedEditorCycles,
      assignedTeamCount,
      poolDailyHoursText,
      setupCycleAssignments,
    } = buildSitePatternStepSetupModels({
      cycleAssignments,
      fallbackTimeRanges: presetTimeRanges,
      poolDailyHours,
    });
    const {
      cycleShiftCards,
      invalidCycleMessages,
      simulationAssignmentSummaries,
      simulationMonthLabel,
      simulationPanelCells,
    } = buildSitePatternSimulationModels({
      cycleAssignments,
      formatMonthLabel,
      getHolidayNameSizeClass,
      getShiftTone,
      simulationCells,
      simulationMonthDate: simulationMonth?.date,
    });
    const patternPresetOptions =
      buildPatternPresetSiteOptions(patternPresetRows);

    return (
      <SitePatternStepView
        activeCycleCount={activeCycleCount}
        advancedEditorPanelProps={{
          cycles: advancedEditorCycles,
          getPatternStringNote,
          getPatternStringPlaceholder,
          onCycleFieldChange: handleCycleDraftChange,
          onCycleShiftBreakChange: handleCycleShiftBreakChange,
          onCycleShiftTimeChange: handleCycleShiftTimeChange,
          onCycleHolidayToggle: handleCycleHolidayToggle,
          onCycleHolidayShiftTimeChange: handleCycleHolidayShiftTimeChange,
          onCycleHolidayShiftBreakChange: handleCycleHolidayShiftBreakChange,
          onCycleTeamIndexChange: handleCycleTeamIndexChange,
          onPoolBreakMinutesChange: (value) => {
            handleDraftChange("poolBreakMinutes", value);
          },
          onPoolTimeRangeChange: (value) => {
            handleDraftChange("poolTimeRange", value);
          },
          poolBreakMinutes: draft.poolBreakMinutes,
          poolDailyHoursText,
          poolEnabled: draft.poolEnabled,
          poolTimeRange: draft.poolTimeRange,
        }}
        assignedTeamCount={assignedTeamCount}
        canManageSiteRegistration={canManageSiteRegistration}
        cycleCount={cycleCount}
        formError={formError}
        hasPersistedSiteId={Boolean(draft.siteId)}
        isSubmitting={isSavingDraft || isCompletingSite}
        onBackToList={handleBackToListWithAssignmentReset}
        onGoNext={() => {
          void stepOneActions.handleGoNext();
        }}
        onReviewOrSave={stepOneActions.handleReviewOrSave}
        patternPresetModalProps={{
          canApply: Boolean(selectedPatternPresetRow),
          onApply: stepOneActions.applyPatternPreset,
          onClose: closePatternPresetModal,
          onSelectSiteId: setSelectedPatternPresetSiteId,
          selectedSiteId: selectedPatternPresetSiteId,
          siteOptions: patternPresetOptions,
        }}
        poolBreakMinutes={draft.poolBreakMinutes}
        poolEnabled={draft.poolEnabled}
        poolTimeRange={draft.poolTimeRange}
        setupPanelProps={{
          customerNameOptions: siteNameSelectValues,
          cycleAssignments: setupCycleAssignments,
          cycleCount,
          draft,
          draggingTeamLabel,
          onAssignTeamToCycle: handleAssignTeamToCycle,
          onClearDraggingTeam: () => {
            setDraggingTeamLabel(null);
          },
          onCycleCountChange: (value) => {
            handleDraftChange("cycleCount", value);
          },
          onCustomerNameChange: (value) => {
            handleDraftChange("customerName", value);
          },
          onNameChange: (value) => {
            handleDraftChange("name", value);
          },
          onApplyRotationTemplate: handleApplyRotationTemplate,
          onOpenPatternPresetModal: () => {
            openPatternPresetModal(patternPresetRows[0]?.site.id ?? "");
          },
          onPoolEnabledChange: (checked) => {
            handleDraftChange("poolEnabled", checked);
          },
          rotationTemplates: ROTATION_TEMPLATES.map((template) => ({
            key: template.key,
            label: template.label,
            description: template.description,
          })),
          onStartDraggingTeam: (teamLabel) => {
            setDraggingTeamLabel(teamLabel);
          },
          teamSettingsPanelProps: {
            cycleOptions: cyclePreviews.map((cycle) => ({
              cycleKey: cycle.cycleKey,
              name: cycle.name,
            })),
            onTeamCycleChange: handleTeamCycleChange,
            onTeamDisplayNameChange: handleTeamDisplayNameChange,
            onTeamIsActiveChange: handleTeamIsActiveChange,
            onTeamMove: handleTeamMove,
            onTeamWorkTypeChange: handleTeamWorkTypeChange,
            teamCycleAssignments: draft.teamCycleAssignments,
            teamSettings: draft.teamSettings,
          },
          onStatusChange: (value) => {
            handleDraftChange("status", value);
          },
          onTeamCountChange: (value) => {
            handleDraftChange("teamCount", value);
          },
          patternPresetDisabled: patternPresetRows.length === 0,
          teamCount,
        }}
        showPatternPresetModal={showPatternPresetModal}
        simulationAnchorDate={simulationAnchorDate}
        simulationMonthLabel={simulationMonthLabel}
        simulationPanelProps={{
          assignmentSummaries: simulationAssignmentSummaries,
          canMoveNextMonth: simulationMonthIndex < simulationMonths.length - 1,
          canMovePreviousMonth: simulationMonthIndex > 0,
          cycleShiftCards,
          invalidCycleMessages,
          metricGroups: simulationMetrics,
          onMoveNextMonth: () => {
            setSimulationMonthIndex((current) =>
              Math.min(current + 1, simulationMonths.length - 1),
            );
          },
          onMovePreviousMonth: () => {
            setSimulationMonthIndex((current) => Math.max(current - 1, 0));
          },
          poolSummary: draft.poolEnabled
            ? {
                timeRange: draft.poolTimeRange,
                breakMinutes: draft.poolBreakMinutes,
                dailyHoursText: poolDailyHours.toFixed(1),
              }
            : null,
          simulationAnchorDate,
          simulationCells: simulationPanelCells,
          simulationMonthLabel,
        }}
        siteName={draft.name}
        stageLabel={stageLabel}
        teamCount={teamCount}
      />
    );
  }

  return (
    <div className="screen-stack">
      {questionDialog}

      <SiteListView
        canManageSiteRegistration={canManageSiteRegistration}
        headingRef={listHeadingRef}
        isLoading={isLoading}
        onOpenDetail={interactionActions.openDetailModal}
        onOpenPatternImport={interactionActions.openPatternImportModal}
        onOpenRegistration={interactionActions.openRegistration}
        onStatusFilterChange={setSiteStatusFilter}
        rows={filteredRows}
        screenError={screenError}
        siteListSummary={siteListSummary}
        statusFilter={siteStatusFilter}
      />

      <SitePatternImportModal
        analysis={patternImportAnalysis}
        copyStatus={patternImportCopyStatus}
        errorMessage={patternImportError}
        file={patternImportFile}
        groupDetailRows={patternImportGroupDetailRows}
        isAnalyzing={isAnalyzingPatternImport}
        isOpen={showPatternImportModal}
        mismatchRows={patternImportMismatchRows}
        onAnalyze={() => {
          void interactionActions.handleAnalyzePatternImport();
        }}
        onApply={() => {
          if (!canManageSiteRegistration) {
            setPatternImportError("기준정보 수정 권한이 필요합니다.");
            return;
          }

          interactionActions.handleApplyPatternImportToDraft();
        }}
        onClose={() => {
          setShowPatternImportModal(false);
        }}
        onCloseGuide={() => {
          setShowPatternImportGuide(false);
        }}
        onCopyReport={() => {
          void interactionActions.handleCopyPatternImportAnalysisReport();
        }}
        onOpenGuide={() => {
          setShowPatternImportGuide(true);
        }}
        onPreviewTabChange={setPatternImportPreviewTab}
        onSelectFile={() => {
          void interactionActions.handleSelectPatternImportFile();
        }}
        previewTab={patternImportPreviewTab}
        showGuide={showPatternImportGuide}
      />

      <SiteDetailModal
        canManageSiteRegistration={canManageSiteRegistration}
        deleteError={deleteError}
        detailCycleCards={detailCycleCards}
        detailRow={detailRow}
        detailTeamIndexes={detailTeamIndexes}
        detailTotalAssignedHeadcount={detailTotalAssignedHeadcount}
        isDeletingSite={isDeletingSite}
        onOpenAssignment={interactionActions.openAssignmentFromDetail}
        onClose={interactionActions.closeDetailModal}
        onDelete={() => {
          void interactionActions.handleRequestDeleteSite();
        }}
        onEdit={interactionActions.openRegistrationFromDetail}
        onOpenSchedule={() => {
          if (!detailRow) {
            return;
          }

          setWorkflowSiteId(detailRow.site.id);
          openRoute("schedule", { selectedSiteId: detailRow.site.id });
        }}
      />
    </div>
  );
};
