import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { SitePatternImportAnalysis } from "@shared/bridge/contracts";
import type {
  EmployeeRecord,
  ShiftPatternRecord,
  ShiftPatternTeamCycleAssignment,
  SiteNameOptionRecord,
  SiteRecord
} from "@shared/domain/model";
import { getShiftPatternSymbols } from "@shared/domain/shift-pattern-compression";
import { normalizeTeamLabel } from "@shared/domain/team-label";

import { useQuestionDialog } from "../components/QuestionDialog";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { SiteDetailModal } from "./site-management/SiteDetailModal";
import { SitePatternImportModal } from "./site-management/SitePatternImportModal";
import { SiteAssignmentStepView } from "./site-management/SiteAssignmentStepView";
import { SiteListView } from "./site-management/SiteListView";
import {
  getSiteDraftValidationError,
  saveSiteDraft
} from "./site-management/site-management-actions";
import { createSiteManagementInteractionActions } from "./site-management/site-management-interaction-actions";
import { createSiteManagementStepOneActions } from "./site-management/site-management-step-one-actions";
import { createSiteManagementStepTwoActions } from "./site-management/site-management-step-two-actions";
import { useSiteManagementInteractionState } from "./site-management/useSiteManagementInteractionState";
import { useSiteManagementStepState } from "./site-management/useSiteManagementStepState";
import {
  buildSiteSimulationCells,
  buildSiteSimulationMetrics,
  calculateWorkingHours,
  loadSiteSimulationHolidayMap
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
  getPatternCycles,
  getWorkingDefinitions,
  type SiteViewRow
} from "./site-management/site-management-selectors";
import { SitePatternStepView } from "./site-management/SitePatternStepView";

type PatternImportPreviewTab = "analysis" | "groups" | "mismatches" | "data";
type ShiftTone = "day" | "night" | "first" | "second" | "third" | "off";

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
}

const DEFAULT_SITE_TIMEZONE = "Asia/Seoul";

interface SiteCycleDraftState {
  cycleKey: string;
  name: string;
  shiftCount: string;
  patternString: string;
  patternStartDate: string;
  breakMinutes: string;
  shiftTimes: string[];
  teamIndexes: number[];
}

interface PendingSiteAssignment {
  employeeId: string;
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

interface DragAutoScrollSnapshot {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

const presetTimeRanges = [
  "07:00 - 19:00",
  "19:00 - 07:00",
  "06:00 - 14:00",
  "14:00 - 22:00",
  "22:00 - 06:00",
  "09:00 - 17:00"
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
  fallbackFactory: (index: number) => T
) => Array.from({ length: targetLength }, (_, index) => items[index] ?? fallbackFactory(index));

const buildDefaultShiftTimes = (shiftCount: number) =>
  normalizeList<string>(
    [],
    shiftCount,
    (index) => presetTimeRanges[index] ?? presetTimeRanges[presetTimeRanges.length - 1]
  );

const createSequentialTeamIndexes = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => index);

const createSequentialTeamCycleAssignments = (teamCount: number, cycleCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `cycle-${(index % Math.max(cycleCount, 1)) + 1}`);

const buildDefaultPatternString = (shiftCount: number) => {
  if (shiftCount === 2) {
    return "주주주휴휴휴야야야휴휴휴";
  }

  return `${getShiftPatternSymbols(shiftCount).join("")}휴`;
};

const createInitialCycleDraft = (cycleKey: string, order: number): SiteCycleDraftState => ({
  cycleKey,
  name: `Cycle ${order + 1}`,
  shiftCount: "2",
  patternString: buildDefaultPatternString(2),
  patternStartDate: createDateInputValue(),
  breakMinutes: "60",
  shiftTimes: buildDefaultShiftTimes(2),
  teamIndexes: createSequentialTeamIndexes(4)
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
  teamCapacities: Array.from({ length: 4 }, () => "")
});

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";

const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const buildNextAutoSiteCode = (sites: SiteRecord[]) => {
  const maxIndex = sites.reduce((currentMax, site) => {
    const matched = site.siteCode.trim().toUpperCase().match(/^SITE-(\d+)$/);

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

const shiftToneOrder: ShiftTone[] = ["day", "night", "first", "second", "third"];

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

const DRAG_AUTO_SCROLL_EDGE_SIZE = 72;
const DRAG_AUTO_SCROLL_STEP = 22;

const resolveAutoScrollDelta = (pointer: number, start: number, end: number) => {
  if (pointer < start + DRAG_AUTO_SCROLL_EDGE_SIZE) {
    return -Math.min(
      Math.ceil((start + DRAG_AUTO_SCROLL_EDGE_SIZE - pointer) / 4),
      DRAG_AUTO_SCROLL_STEP
    );
  }

  if (pointer > end - DRAG_AUTO_SCROLL_EDGE_SIZE) {
    return Math.min(
      Math.ceil((pointer - (end - DRAG_AUTO_SCROLL_EDGE_SIZE)) / 4),
      DRAG_AUTO_SCROLL_STEP
    );
  }

  return 0;
};

const scrollDragContainer = (element: HTMLElement, snapshot: DragAutoScrollSnapshot) => {
  const rect = element.getBoundingClientRect();
  const deltaY = resolveAutoScrollDelta(snapshot.clientY, rect.top, rect.bottom);
  const deltaX = resolveAutoScrollDelta(snapshot.clientX, rect.left, rect.right);

  if (deltaY !== 0 && element.scrollHeight > element.clientHeight) {
    element.scrollTop += deltaY;
  }

  if (deltaX !== 0 && element.scrollWidth > element.clientWidth) {
    element.scrollLeft += deltaX;
  }
};

const findScrollableDragContainer = (target: EventTarget | null) => {
  let current = target instanceof HTMLElement ? target : null;

  while (current) {
    const styles = window.getComputedStyle(current);
    const overflowY = `${styles.overflowY} ${styles.overflow}`;
    const overflowX = `${styles.overflowX} ${styles.overflow}`;
    const canScrollY = /(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight;
    const canScrollX = /(auto|scroll)/.test(overflowX) && current.scrollWidth > current.clientWidth;

    if (canScrollY || canScrollX) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
};

const buildDraftFromRow = (row: SiteViewRow): SiteDraftState => {
  const teamCount = row.pattern?.teamCount ?? 4;
  const teamLabels = getTeamLabels(teamCount);
  const cycles = row.pattern ? getPatternCycles(row.pattern) : [];
  const cycleDrafts =
    cycles.length > 0
      ? cycles.map((cycle, index) => ({
          cycleKey: cycle.cycleKey,
          name: cycle.name,
          shiftCount: String(cycle.shiftCount),
          patternString: buildPatternString(cycle),
          patternStartDate: cycle.patternStartDate ?? createDateInputValue(),
          breakMinutes: String(cycle.steps.find((step) => step.dutyCode !== "X")?.breakMinutes ?? 60),
          shiftTimes: normalizeList(
            getWorkingDefinitions(cycle).map((definition) => definition.timeRange),
            cycle.shiftCount,
            (itemIndex) => buildDefaultShiftTimes(cycle.shiftCount)[itemIndex] ?? ""
          ),
          teamIndexes: teamLabels.map(
            (label, itemIndex) =>
              cycle.teamIndexes.find((item) => item.teamLabel === label)?.index ?? itemIndex
          )
        }))
      : [createInitialCycleDraft("cycle-1", 0)];
  const cycleKeyByTeam = new Map(
    (row.pattern?.teamCycleAssignments.length
      ? row.pattern.teamCycleAssignments
      : teamLabels.map((teamLabel) => ({
          teamLabel,
          cycleKey: cycleDrafts[0]?.cycleKey ?? "cycle-1"
        }))
    ).map((item) => [item.teamLabel, item.cycleKey])
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
    teamCycleAssignments: teamLabels.map(
      (label) => cycleKeyByTeam.get(label) ?? cycleDrafts[0]?.cycleKey ?? "cycle-1"
    ),
    teamCapacities: teamLabels.map((label) => {
      const maxHeadcount = row.pattern?.teamCapacities.find((item) => item.teamLabel === label)?.maxHeadcount;

      return typeof maxHeadcount === "number" ? String(maxHeadcount) : "";
    })
  };
};

const buildDraftFromPatternImportAnalysis = (
  analysis: SitePatternImportAnalysis,
  siteCode: string
): SiteDraftState => {
  const suggestion = analysis.suggestion;
  const teamLabels = getTeamLabels(suggestion.teamCount);
  const fallbackCycleKey = suggestion.cycles[0]?.cycleKey ?? "cycle-1";

  return {
    ...createInitialDraft(siteCode),
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
      shiftTimes: cycle.shiftTimes,
      teamIndexes: teamLabels.map(
        (teamLabel) =>
          cycle.teamIndexes.find((item) => item.teamLabel === teamLabel)?.index ?? 0
      )
    })),
    teamCycleAssignments: teamLabels.map(
      (teamLabel) =>
        suggestion.teams.find((team) => team.teamLabel === teamLabel)?.cycleKey ?? fallbackCycleKey
    ),
    teamCapacities: teamLabels.map((teamLabel) => {
      const maxHeadcount = suggestion.teams.find((team) => team.teamLabel === teamLabel)?.maxHeadcount;

      return typeof maxHeadcount === "number" && maxHeadcount > 0 ? String(maxHeadcount) : "";
    })
  };
};

export const SiteManagementScreen = () => {
  const { setSelectedSiteId: setWorkflowSiteId, openRoute } = useAppWorkflow();
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [siteNameOptions, setSiteNameOptions] = useState<SiteNameOptionRecord[]>([]);
  const [draft, setDraft] = useState<SiteDraftState>(() => createInitialDraft());
  const [pendingAssignments, setPendingAssignments] = useState<PendingSiteAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isCompletingSite, setIsCompletingSite] = useState(false);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);
  const [draggingEmployeeSourceTeam, setDraggingEmployeeSourceTeam] = useState<string | null>(null);
  const [isTeamCapacityDirty, setIsTeamCapacityDirty] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stepTwoError, setStepTwoError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [simulationHolidayNameByDate, setSimulationHolidayNameByDate] = useState<Map<string, string>>(
    new Map()
  );
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shouldRestoreListFocusRef = useRef(false);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const dragAutoScrollSnapshotRef = useRef<DragAutoScrollSnapshot | null>(null);
  const { askQuestion, questionDialog } = useQuestionDialog();
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
    view
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
    showPatternImportModal
  } = useSiteManagementInteractionState();

  const deferredPoolKeyword = useDeferredValue(poolKeyword);
  const rows = useMemo(() => buildRows(sites, patterns, employees), [employees, patterns, sites]);
  const siteNameSelectValues = useMemo(
    () => buildSiteNameSelectValues(siteNameOptions, draft.customerName),
    [draft.customerName, siteNameOptions]
  );
  const detailRow = detailSnapshot;
  const pendingAssignmentMap = useMemo(
    () => new Map(pendingAssignments.map((item) => [item.employeeId, item])),
    [pendingAssignments]
  );
  const { detailTeamIndexes, detailCycleCards, detailTotalAssignedHeadcount } = useMemo(
    () => buildSiteDetailModels(detailRow),
    [detailRow]
  );
  const siteListSummary = useMemo(() => buildSiteListSummary(rows), [rows]);
  const patternPresetRows = useMemo(
    () => buildPatternPresetRows(rows, draft.siteId),
    [draft.siteId, rows]
  );
  const selectedPatternPresetRow = useMemo(
    () =>
      patternPresetRows.find((row) => row.site.id === selectedPatternPresetSiteId) ?? null,
    [patternPresetRows, selectedPatternPresetSiteId]
  );
  const patternImportGroupDetailRows = useMemo<PatternImportGroupDetailRow[]>(
    () =>
      patternImportAnalysis?.groups.flatMap((group) =>
        group.members.map((member) => {
          const suggestedTeam = patternImportAnalysis.suggestion.teams.find(
            (team) => team.cycleKey === group.cycleKey && team.index === member.offset
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
            suggestedTeamCapacity: suggestedTeam?.maxHeadcount
          };
        })
      ) ?? [],
    [patternImportAnalysis]
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
            expectedCode: mismatch.expectedCode
          }))
        )
      ) ?? [],
    [patternImportAnalysis]
  );
  const teamCount = clampCount(Number(draft.teamCount), 2, 8);
  const cycleCount = clampCount(Number(draft.cycleCount), 1, 4);
  const teamLabels = useMemo(() => getTeamLabels(teamCount), [teamCount]);
  const cyclePreviews = useMemo(
    () =>
      buildSitePatternCyclePreviews({
        cycleCount,
        cycleDrafts: draft.cycles,
        fallbackDate: createDateInputValue(),
        fallbackTimeRanges: presetTimeRanges,
        teamCount
      }),
    [cycleCount, draft.cycles, teamCount]
  );
  const { simulationAnchorDate, simulationMonth, simulationMonths } = useMemo(
    () =>
      buildSitePatternSimulationTimeline({
        cyclePreviews,
        fallbackDate: createDateInputValue(),
        simulationMonthIndex
      }),
    [cyclePreviews, simulationMonthIndex]
  );

  useEffect(() => {
    let active = true;

    const loadSimulationHolidayMap = async () => {
      try {
        const nextMap = await loadSiteSimulationHolidayMap({
          listHolidayCalendars: window.appBridge.listHolidayCalendars,
          simulationMonths
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

  useEffect(() => {
    if (!draggingEmployeeId && dragAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
      dragAutoScrollSnapshotRef.current = null;
    }
  }, [draggingEmployeeId]);

  useEffect(
    () => () => {
      if (dragAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      }
    },
    []
  );

  const simulationCells = useMemo(
    () =>
      buildSiteSimulationCells({
        cyclePreviews,
        fallbackDate: createDateInputValue(),
        getShiftTone,
        holidayNameByDate: simulationHolidayNameByDate,
        monthDate: simulationMonth?.date ?? new Date(),
        teamCycleAssignments: draft.teamCycleAssignments,
        teamLabels
      }),
    [
      cyclePreviews,
      draft.teamCycleAssignments,
      simulationHolidayNameByDate,
      simulationMonth?.date,
      teamLabels
    ]
  );
  const simulationMetrics = useMemo(
    () => buildSiteSimulationMetrics(simulationCells, cyclePreviews),
    [cyclePreviews, simulationCells]
  );
  const poolDailyHours = useMemo(
    () => calculateWorkingHours(draft.poolTimeRange, Number(draft.poolBreakMinutes) || 0),
    [draft.poolBreakMinutes, draft.poolTimeRange]
  );
  const configuredTeamCapacities = useMemo(
    () =>
      new Map(
        teamLabels.map((teamLabel, index) => [
          teamLabel,
          parseMaxHeadcount(draft.teamCapacities[index] ?? "")
        ])
      ),
    [draft.teamCapacities, teamLabels]
  );

  const activeTeamLabels = useMemo(
    () =>
      buildActiveTeamLabels({
        employees,
        pendingAssignments,
        poolEnabled: draft.poolEnabled,
        siteId: draft.siteId,
        teamLabels
      }),
    [draft.poolEnabled, draft.siteId, employees, pendingAssignments, teamLabels]
  );

  const assignedByTeam = useMemo(
    () =>
      buildAssignedEmployeesByTeam({
        activeTeamLabels,
        employees,
        pendingAssignmentMap,
        siteId: draft.siteId
      }),
    [activeTeamLabels, draft.siteId, employees, pendingAssignmentMap]
  );

  const filteredPoolEmployees = useMemo(
    () =>
      buildFilteredPoolEmployees({
        employees,
        keyword: deferredPoolKeyword,
        pendingAssignmentMap,
        poolScope,
        siteId: draft.siteId
      }),
    [deferredPoolKeyword, draft.siteId, employees, pendingAssignmentMap, poolScope]
  );

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [siteResult, patternResult, employeeResult, siteNameOptionsResult] = await Promise.all([
          window.appBridge.listSites(),
          window.appBridge.listShiftPatterns(),
          window.appBridge.listEmployees(),
          window.appBridge.listSiteNameOptions()
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

    const nextDetailRow = rows.find((row) => row.site.id === detailSiteId) ?? null;

    if (!nextDetailRow) {
      return;
    }

    setDetailSnapshot((current) =>
      current?.site.id === nextDetailRow.site.id &&
      current.pattern?.id === nextDetailRow.pattern?.id &&
      current.teamStatusItems.length === nextDetailRow.teamStatusItems.length
        ? current
        : nextDetailRow
    );
  }, [detailSiteId, detailSnapshot, rows]);

  useEffect(() => {
    setDraft((current) => {
      const normalizedCycles = normalizeList(current.cycles, cycleCount, (index) =>
        createInitialCycleDraft(`cycle-${index + 1}`, index)
      ).map((cycle, index) => {
        const shiftCount = clampCount(Number(cycle.shiftCount), 1, 6);

        return {
          ...cycle,
          cycleKey: cycle.cycleKey || `cycle-${index + 1}`,
          name: cycle.name.trim() || `Cycle ${index + 1}`,
          shiftCount: String(shiftCount),
          patternString: cycle.patternString.trim()
            ? cycle.patternString
            : buildDefaultPatternString(shiftCount),
          patternStartDate: cycle.patternStartDate || createDateInputValue(),
          breakMinutes: String(Math.max(Number(cycle.breakMinutes) || 0, 0)),
          shiftTimes: normalizeList(cycle.shiftTimes, shiftCount, (itemIndex) => {
            const defaults = buildDefaultShiftTimes(shiftCount);
            return defaults[itemIndex] ?? "";
          }),
          teamIndexes: normalizeList(cycle.teamIndexes, teamCount, (itemIndex) => itemIndex)
        };
      });
      const availableCycleKeys = new Set(normalizedCycles.map((cycle) => cycle.cycleKey));
      const firstCycleKey = normalizedCycles[0]?.cycleKey ?? "cycle-1";
      const normalizedAssignments = normalizeList(
        current.teamCycleAssignments,
        teamCount,
        (index) => normalizedCycles[index % normalizedCycles.length]?.cycleKey ?? firstCycleKey
      ).map((cycleKey) => (availableCycleKeys.has(cycleKey) ? cycleKey : firstCycleKey));

      return {
        ...current,
        teamCount: String(teamCount),
        cycleCount: String(cycleCount),
        cycles: normalizedCycles,
        teamCycleAssignments: normalizedAssignments,
        teamCapacities: normalizeList(current.teamCapacities, teamCount, () => "")
      };
    });
  }, [cycleCount, teamCount]);

  useEffect(() => {
    if (view !== "step1" || draft.siteId || draft.siteCode.trim()) {
      return;
    }

    setDraft((current) => ({
      ...current,
      siteCode: buildNextAutoSiteCode(sites)
    }));
  }, [draft.siteCode, draft.siteId, sites, view]);

  useEffect(() => {
    setSimulationMonthIndex((current) =>
      Math.min(current, Math.max(simulationMonths.length - 1, 0))
    );
  }, [simulationMonths.length]);

  useLayoutEffect(() => {
    if (view !== "list" || !shouldRestoreListFocusRef.current) {
      return;
    }

    shouldRestoreListFocusRef.current = false;
    requestAnimationFrame(() => {
      listHeadingRef.current?.focus({ preventScroll: true });
    });
  }, [view]);

  const handleDraftChange = <K extends keyof SiteDraftState>(key: K, value: SiteDraftState[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleCycleDraftChange = (
    cycleKey: string,
    key: keyof SiteCycleDraftState,
    value: SiteCycleDraftState[keyof SiteCycleDraftState]
  ) => {
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) =>
        cycle.cycleKey === cycleKey
          ? {
              ...cycle,
              [key]: value
            }
          : cycle
      )
    }));
  };

  const handleCycleShiftTimeChange = (cycleKey: string, shiftIndex: number, value: string) => {
    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) =>
        cycle.cycleKey === cycleKey
          ? {
              ...cycle,
              shiftTimes: cycle.shiftTimes.map((item, itemIndex) =>
                itemIndex === shiftIndex ? value : item
              )
            }
          : cycle
      )
    }));
  };

  const handleCycleTeamIndexChange = (cycleKey: string, teamIndex: number, value: string) => {
    const nextValue = Number(value);

    setDraft((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) =>
        cycle.cycleKey === cycleKey
          ? {
              ...cycle,
              teamIndexes: cycle.teamIndexes.map((item, itemIndex) =>
                itemIndex === teamIndex ? (Number.isNaN(nextValue) ? 0 : nextValue) : item
              )
            }
          : cycle
      )
    }));
  };

  const handleTeamCapacityChange = (teamIndex: number, value: string) => {
    setDraft((current) => ({
      ...current,
      teamCapacities: current.teamCapacities.map((item, itemIndex) =>
        itemIndex === teamIndex ? value : item
      )
    }));
    setIsTeamCapacityDirty(true);
  };

  const handleAssignTeamToCycle = (teamLabel: string, cycleKey: string) => {
    const teamIndex = teamLabels.indexOf(teamLabel);

    if (teamIndex < 0) {
      return;
    }

    setDraft((current) => ({
      ...current,
      teamCycleAssignments: current.teamCycleAssignments.map((item, itemIndex) =>
        itemIndex === teamIndex ? cycleKey : item
      )
    }));
  };

  const handleBackToList = () => {
    shouldRestoreListFocusRef.current = true;
    setDetailSiteId(null);
    setDetailSnapshot(null);
    setView("list");
  };

  const resetRegistrationState = () => {
    setDetailSiteId(null);
    setDetailSnapshot(null);
    setFormError(null);
    setStepTwoError(null);
    setDeleteError(null);
    setDraggingEmployeeId(null);
    setDraggingEmployeeSourceTeam(null);
    setIsTeamCapacityDirty(false);
    setPendingAssignments([]);
    resetRegistrationViewState();
  };

  const stopDragAutoScroll = () => {
    if (dragAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
    }

    dragAutoScrollSnapshotRef.current = null;
  };

  const runDragAutoScroll = () => {
    const snapshot = dragAutoScrollSnapshotRef.current;

    if (!snapshot) {
      dragAutoScrollFrameRef.current = null;
      return;
    }

    const nearestScrollable = findScrollableDragContainer(snapshot.target);

    if (nearestScrollable) {
      scrollDragContainer(nearestScrollable, snapshot);
    }

    const consoleMain = document.querySelector(".console-main");

    if (consoleMain instanceof HTMLElement && consoleMain !== nearestScrollable) {
      scrollDragContainer(consoleMain, snapshot);
    }

    const windowDeltaY = resolveAutoScrollDelta(snapshot.clientY, 0, window.innerHeight);
    const windowDeltaX = resolveAutoScrollDelta(snapshot.clientX, 0, window.innerWidth);

    if (windowDeltaX !== 0 || windowDeltaY !== 0) {
      window.scrollBy({
        left: windowDeltaX,
        top: windowDeltaY,
        behavior: "auto"
      });
    }

    dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
  };

  const queueDragAutoScroll = (snapshot: DragAutoScrollSnapshot) => {
    dragAutoScrollSnapshotRef.current = snapshot;

    if (dragAutoScrollFrameRef.current !== null) {
      return;
    }

    dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
  };

  const clearDraggingEmployee = () => {
    stopDragAutoScroll();
    setDraggingEmployeeId(null);
    setDraggingEmployeeSourceTeam(null);
  };

  const handleAssignmentDragAutoScroll = (event: React.DragEvent<HTMLElement>) => {
    if (!draggingEmployeeId) {
      return;
    }

    queueDragAutoScroll({
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target
    });
  };

  const validateDraftForm = () => {
    const validationError = getSiteDraftValidationError({
      cyclePreviews,
      draft,
      parseMaxHeadcount,
      teamLabels
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

    const savedDraft = await saveDraftToStorage({ preserveAssignmentStartDate: true });

    return savedDraft?.site.id ?? null;
  };

  const saveDraftToStorage = async (options?: { preserveAssignmentStartDate?: boolean }) => {
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
        teamLabels
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
        status: result.site.status
      }));
      setWorkflowSiteId(result.site.id);
      if (!options?.preserveAssignmentStartDate) {
        setAssignmentStartDate(result.assignmentStartDate);
      }
      setIsTeamCapacityDirty(false);
      setRefreshKey((current) => current + 1);

      return {
        site: result.site,
        patternId: result.patternId
      };
    } catch (error) {
      setFormError(getErrorMessage(error));
      return null;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const persistDraft = async (options?: { preserveAssignmentStartDate?: boolean }) =>
    Boolean(await saveDraftToStorage(options));

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
    markShouldRestoreListFocus: () => {
      shouldRestoreListFocusRef.current = true;
    },
    patternImportAnalysis,
    patternImportFile,
    resetRegistrationState,
    rows,
    setAssignmentStartDate,
    setDeleteError,
    setDetailSiteId,
    setDetailSnapshot,
    setDraft,
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
    writeClipboardText: (value) => navigator.clipboard.writeText(value)
  });
  const stepOneActions = createSiteManagementStepOneActions({
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
    validateDraftForm
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
    handleBackToList,
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
    stopDragAutoScroll
  });

  const handleStepTwoDragStart = (employeeId: string, sourceTeam: string | null) => {
    setDraggingEmployeeId(employeeId);
    setDraggingEmployeeSourceTeam(sourceTeam);
  };

  const handleStepTwoAssignEmployee = async (employeeId: string, targetTeam: string) => {
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

  const handleStepTwoTeamCapacityChange = (teamLabel: string, value: string) => {
    const targetIndex = teamLabels.indexOf(teamLabel);

    if (targetIndex < 0) {
      return;
    }

    handleTeamCapacityChange(targetIndex, value);
  };

  if (view === "step2") {
    const cycleShiftCards = cyclePreviews.flatMap((cycle) =>
      cycle.shiftCards.map((card) => ({
        key: `${cycle.cycleKey}-${card.label}`,
        cycleName: cycle.name,
        ...card
      }))
    );
    const stageLabel = draft.siteId ? "근무지 수정" : "근무지 등록";
    const teamColumns = buildSiteAssignmentTeamColumns({
      activeTeamLabels,
      assignedByTeam,
      configuredTeamCapacities,
      draggingEmployeeId,
      teamCapacities: draft.teamCapacities,
      teamLabels
    });

    return (
      <div className="screen-stack">
        {questionDialog}
        <SiteAssignmentStepView
          assignmentStartDate={assignmentStartDate}
          assigningEmployeeId={assigningEmployeeId}
          cycleShiftCards={cycleShiftCards}
          draggingEmployeeId={draggingEmployeeId}
          draggingEmployeeSourceTeam={draggingEmployeeSourceTeam}
          errorMessage={stepTwoError ?? formError}
          filteredPoolEmployees={filteredPoolEmployees}
          isCompletingSite={isCompletingSite}
          isSavingDraft={isSavingDraft}
          onAssignEmployee={handleStepTwoAssignEmployee}
          onAssignmentStartDateChange={setAssignmentStartDate}
          onBack={() => {
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
          onSaveOrValidate={() => {
            if (!draft.siteId) {
              validateDraftForm();
              return;
            }

            void persistDraft({ preserveAssignmentStartDate: true });
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
      teamLabels
    });
    const { activeCycleCount, advancedEditorCycles, assignedTeamCount, poolDailyHoursText, setupCycleAssignments } =
      buildSitePatternStepSetupModels({
        cycleAssignments,
        fallbackTimeRanges: presetTimeRanges,
        poolDailyHours
      });
    const {
      cycleShiftCards,
      invalidCycleMessages,
      simulationAssignmentSummaries,
      simulationMonthLabel,
      simulationPanelCells
    } = buildSitePatternSimulationModels({
      cycleAssignments,
      formatMonthLabel,
      getHolidayNameSizeClass,
      getShiftTone,
      simulationCells,
      simulationMonthDate: simulationMonth?.date
    });
    const patternPresetOptions = buildPatternPresetSiteOptions(patternPresetRows);

    return (
      <SitePatternStepView
        activeCycleCount={activeCycleCount}
        advancedEditorPanelProps={{
          cycles: advancedEditorCycles,
          getPatternStringNote,
          getPatternStringPlaceholder,
          onCycleFieldChange: handleCycleDraftChange,
          onCycleShiftTimeChange: handleCycleShiftTimeChange,
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
          poolTimeRange: draft.poolTimeRange
        }}
        assignedTeamCount={assignedTeamCount}
        cycleCount={cycleCount}
        formError={formError}
        hasPersistedSiteId={Boolean(draft.siteId)}
        isSubmitting={isSavingDraft || isCompletingSite}
        onBackToList={handleBackToList}
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
          siteOptions: patternPresetOptions
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
          onOpenPatternPresetModal: () => {
            openPatternPresetModal(patternPresetRows[0]?.site.id ?? "");
          },
          onPoolEnabledChange: (checked) => {
            handleDraftChange("poolEnabled", checked);
          },
          onStartDraggingTeam: (teamLabel) => {
            setDraggingTeamLabel(teamLabel);
          },
          onStatusChange: (value) => {
            handleDraftChange("status", value);
          },
          onTeamCountChange: (value) => {
            handleDraftChange("teamCount", value);
          },
          patternPresetDisabled: patternPresetRows.length === 0,
          teamCount
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
            setSimulationMonthIndex((current) => Math.min(current + 1, simulationMonths.length - 1));
          },
          onMovePreviousMonth: () => {
            setSimulationMonthIndex((current) => Math.max(current - 1, 0));
          },
          poolSummary: draft.poolEnabled
            ? {
                timeRange: draft.poolTimeRange,
                breakMinutes: draft.poolBreakMinutes,
                dailyHoursText: poolDailyHours.toFixed(1)
              }
            : null,
          simulationAnchorDate,
          simulationCells: simulationPanelCells,
          simulationMonthLabel
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
        headingRef={listHeadingRef}
        isLoading={isLoading}
        onOpenDetail={interactionActions.openDetailModal}
        onOpenPatternImport={interactionActions.openPatternImportModal}
        onOpenRegistration={interactionActions.openRegistration}
        rows={rows}
        screenError={screenError}
        siteListSummary={siteListSummary}
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
        onApply={interactionActions.handleApplyPatternImportToDraft}
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
        deleteError={deleteError}
        detailCycleCards={detailCycleCards}
        detailRow={detailRow}
        detailTeamIndexes={detailTeamIndexes}
        detailTotalAssignedHeadcount={detailTotalAssignedHeadcount}
        isDeletingSite={isDeletingSite}
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
