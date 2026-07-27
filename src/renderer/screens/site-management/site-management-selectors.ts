import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  SiteNameOptionRecord,
  SiteRecord
} from "@shared/domain/model";
import { formatEmployeeDisplayName } from "@shared/domain/employment-type";
import {
  buildShiftPatternDutySlotMap,
  buildShiftPatternDutyLabelMap,
  buildShiftPatternDisplayString,
  getShiftPatternDisplayLabels,
  parseCompressedShiftPatternString
} from "../../../shared/domain/shift-pattern-compression";
import { normalizeTeamLabel } from "../../../shared/domain/team-label";
import { isPoolTeamLabel } from "../../../shared/domain/team-work-type";

export interface ShiftDefinition {
  breakMinutes: number;
  cycleName?: string;
  dutyCode: string;
  label: string;
  timeRange: string;
  // 평·휴 분리(split)에서 저장된 휴일 시간/휴게(없으면 평일값 사용).
  holidayTimeRange?: string;
  holidayBreakMinutes?: number;
}

export interface SiteViewRow {
  cycleSummaries: Array<{
    cycleKey: string;
    name: string;
    patternStartDate?: string;
    patternString: string;
  }>;
  pattern: ShiftPatternRecord | null;
  patternString: string;
  poolEnabled: boolean;
  shiftDefinitions: ShiftDefinition[];
  site: SiteRecord;
  teamStatusItems: Array<{ headcount: number; label: string }>;
  workType: string;
}

export interface SiteDetailCycleDefinition {
  breakMinutes: number;
  dutyCode: string;
  label: string;
  timeRange: string;
}

export interface SiteDetailCycleTeam {
  headcount: number;
  maxHeadcount?: number;
  teamIndex: number;
  teamLabel: string;
}

export interface SiteDetailCycleCard {
  cycleKey: string;
  cycleLength: number;
  name: string;
  patternStartDate?: string;
  patternString: string;
  shiftCount: number;
  shiftDefinitions: SiteDetailCycleDefinition[];
  teams: SiteDetailCycleTeam[];
}

export interface SiteDetailTeamIndex {
  index: number;
  teamLabel: string;
}

export interface SiteDetailModels {
  detailCycleCards: SiteDetailCycleCard[];
  detailTeamIndexes: SiteDetailTeamIndex[];
  detailTotalAssignedHeadcount: number;
}

export interface SiteListSummary {
  activeSites: number;
  assignedEmployees: number;
  poolSites: number;
  totalSites: number;
}

export interface PendingSiteAssignmentLike {
  employeeId: string;
  sortOrder?: number;
  startDate: string;
  teamLabel: string;
}

export interface SiteAssignmentTeamColumn {
  assignedEmployees: EmployeeRecord[];
  capacityValue: string;
  displayLabel: string;
  isAtCapacity: boolean;
  isConfiguredTeam: boolean;
  isPoolGroup: boolean;
  label: string;
  maxHeadcount?: number;
}

export interface SitePatternCycleDraftLike {
  breakMinutes: string;
  cycleKey: string;
  name: string;
  patternStartDate: string;
  patternString: string;
  shiftCount: string;
  shiftBreakMinutes?: string[];
  shiftTimes: string[];
  teamIndexes: number[];
  holidayTimeMode?: "unified" | "split";
  weekdayPublicHolidayAsHoliday?: boolean;
  holidayShiftTimes?: string[];
  holidayShiftBreakMinutes?: string[];
}

export interface SitePatternCyclePreviewLike {
  breakMinutes: number;
  cycleKey: string;
  cycleLabels: string[];
  invalidTokens: string[];
  name: string;
  patternStartDate: string;
  patternString: string;
  shiftBreakMinutes?: number[];
  shiftTimes: string[];
  shiftCards: Array<{
    breakMinutes: number;
    label: string;
    timeRange: string;
  }>;
  shiftCount: number;
  shiftLabels: string[];
  teamIndexes: number[];
  holidayTimeMode?: "unified" | "split";
  weekdayPublicHolidayAsHoliday?: boolean;
  holidayShiftTimes?: string[];
  holidayShiftBreakMinutes?: number[];
}

export interface SitePatternSimulationCellLike {
  assignments: Array<{
    dutyLabel: string;
    teamLabel: string;
    tone: string;
  }>;
  date: string;
  dayLabel: string;
  holidayName?: string;
  isCurrentMonth: boolean;
  isHoliday: boolean;
  isToday: boolean;
  key: string;
}

export interface SitePatternCycleAssignment {
  cycle: SitePatternCyclePreviewLike;
  draftCycle: SitePatternCycleDraftLike;
  teams: Array<{
    teamIndex: number;
    teamLabel: string;
  }>;
}

export interface SitePatternStepSetupModels {
  activeCycleCount: number;
  advancedEditorCycles: Array<{
    assignedTeamLabels: string[];
    cycleKey: string;
    cycleLabelCount: number;
    draft: {
      breakMinutes: string;
      name: string;
      patternStartDate: string;
      patternString: string;
      shiftCount: string;
      shiftBreakMinutes: string[];
      shiftTimes: string[];
      holidayTimeMode: "unified" | "split";
      weekdayPublicHolidayAsHoliday: boolean;
      holidayShiftTimes: string[];
      holidayShiftBreakMinutes: string[];
    };
    fallbackShiftTimes: string[];
    name: string;
    shiftCount: number;
    shiftLabels: string[];
    teamIndexes: Array<{
      teamIndex: number;
      teamLabel: string;
      value: number;
    }>;
  }>;
  assignedTeamCount: number;
  poolDailyHoursText: string;
  setupCycleAssignments: Array<{
    cycleKey: string;
    name: string;
    patternString: string;
    teams: string[];
  }>;
}

export interface SitePatternSimulationModels {
  cycleShiftCards: Array<{
    breakMinutes: number;
    cycleName: string;
    key: string;
    label: string;
    timeRange: string;
    toneClassName: string;
  }>;
  invalidCycleMessages: string[];
  simulationAssignmentSummaries: Array<{
    cycleKey: string;
    cycleName: string;
    patternString: string;
    teams: string[];
  }>;
  simulationMonthLabel: string;
  simulationPanelCells: Array<{
    assignments: Array<{
      dutyLabel: string;
      key: string;
      teamLabel: string;
      toneClassName: string;
    }>;
    date: string;
    dayLabel: string;
    holidayClassName: string;
    holidayName?: string;
    isCurrentMonth: boolean;
    isHoliday: boolean;
    isToday: boolean;
    key: string;
  }>;
}

export interface SitePatternSimulationMonth {
  date: Date;
  key: string;
}

const normalizeList = <T,>(
  items: T[],
  targetLength: number,
  fallbackFactory: (index: number) => T
) => Array.from({ length: targetLength }, (_, index) => items[index] ?? fallbackFactory(index));

const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const getResolvedAssignmentSortOrder = (
  employee: Pick<EmployeeRecord, "currentAssignmentOrder">,
  pendingAssignment?: Pick<PendingSiteAssignmentLike, "sortOrder">
) => {
  if (typeof pendingAssignment?.sortOrder === "number" && Number.isFinite(pendingAssignment.sortOrder)) {
    return pendingAssignment.sortOrder;
  }

  if (
    typeof employee.currentAssignmentOrder === "number" &&
    Number.isFinite(employee.currentAssignmentOrder)
  ) {
    return employee.currentAssignmentOrder;
  }

  return Number.MAX_SAFE_INTEGER;
};

const buildDefaultShiftTimes = (shiftCount: number, fallbackTimeRanges: string[]) =>
  normalizeList<string>(
    [],
    shiftCount,
    (index) => fallbackTimeRanges[index] ?? fallbackTimeRanges[fallbackTimeRanges.length - 1] ?? ""
  );

const createSimulationMonthRange = (anchorDate: string, fallbackDate: string): SitePatternSimulationMonth[] => {
  const baseDate = new Date(`${anchorDate || fallbackDate}T00:00:00`);

  if (Number.isNaN(baseDate.getTime())) {
    const nextFallback = new Date(`${fallbackDate}T00:00:00`);
    return Array.from({ length: 3 }, (_, index) => {
      const date = new Date(nextFallback.getFullYear(), nextFallback.getMonth() + index, 1);

      return {
        date,
        key: `${date.getFullYear()}-${date.getMonth()}`
      };
    });
  }

  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, 1);

    return {
      date,
      key: `${date.getFullYear()}-${date.getMonth()}`
    };
  });
};

export const getWorkingDefinitions = (
  cycle: Pick<ShiftPatternCycle, "name" | "shiftCount" | "steps">
): ShiftDefinition[] => {
  const seenCodes = new Set<string>();
  const orderedWorkingCodes = cycle.steps
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .flatMap((step) => {
      const dutyCode = step.dutyCode.trim().toUpperCase();

      if (dutyCode === "X" || dutyCode === "OFF" || seenCodes.has(dutyCode)) {
        return [];
      }

      seenCodes.add(dutyCode);
      return [dutyCode];
    });
  const shiftCount = Math.max(cycle.shiftCount, orderedWorkingCodes.length, 1);
  const labelByDutyCode = buildShiftPatternDutyLabelMap(orderedWorkingCodes, shiftCount);
  const slotByDutyCode = buildShiftPatternDutySlotMap(orderedWorkingCodes, shiftCount);

  seenCodes.clear();

  return cycle.steps
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .flatMap((step) => {
      const dutyCode = step.dutyCode.trim().toUpperCase();

      if (dutyCode === "X" || dutyCode === "OFF" || seenCodes.has(dutyCode)) {
        return [];
      }

      seenCodes.add(dutyCode);

      return [
        {
          slot: slotByDutyCode.get(dutyCode) ?? seenCodes.size - 1,
          definition: {
            breakMinutes: step.breakMinutes,
            cycleName: cycle.name,
            dutyCode,
            label: labelByDutyCode.get(dutyCode) ?? `${seenCodes.size}근`,
            timeRange:
              step.startTime && step.endTime ? `${step.startTime} - ${step.endTime}` : "-",
            holidayTimeRange:
              step.holidayStartTime && step.holidayEndTime
                ? `${step.holidayStartTime} - ${step.holidayEndTime}`
                : undefined,
            holidayBreakMinutes: step.holidayBreakMinutes
          }
        }
      ];
    })
    .sort((left, right) => left.slot - right.slot)
    .map((item) => item.definition);
};

export const buildCycleDraftShiftValues = (
  cycle: Pick<ShiftPatternCycle, "name" | "shiftCount" | "steps">
) => {
  const definitions = getWorkingDefinitions(cycle);
  const shiftCount = Math.max(cycle.shiftCount, definitions.length, 1);
  const slotByDutyCode = buildShiftPatternDutySlotMap(
    definitions.map((definition) => definition.dutyCode),
    shiftCount
  );
  const shiftTimes = Array.from({ length: shiftCount }, () => "");
  const shiftBreakMinutes = Array.from({ length: shiftCount }, () => "");
  const holidayShiftTimes = Array.from({ length: shiftCount }, () => "");
  const holidayShiftBreakMinutes = Array.from({ length: shiftCount }, () => "");

  definitions.forEach((definition, index) => {
    const slot = slotByDutyCode.get(definition.dutyCode) ?? index;

    if (slot < 0 || slot >= shiftCount) {
      return;
    }

    shiftTimes[slot] = definition.timeRange;
    shiftBreakMinutes[slot] = String(definition.breakMinutes);

    if (definition.holidayTimeRange) {
      holidayShiftTimes[slot] = definition.holidayTimeRange;
    }

    if (definition.holidayBreakMinutes !== undefined) {
      holidayShiftBreakMinutes[slot] = String(definition.holidayBreakMinutes);
    }
  });

  return {
    shiftBreakMinutes,
    shiftTimes,
    holidayShiftBreakMinutes,
    holidayShiftTimes
  };
};

export const getPatternCycles = (pattern: ShiftPatternRecord) =>
  pattern.cycles.length > 0
    ? pattern.cycles
    : [
        {
          id: `${pattern.id}-legacy`,
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: Math.max(
            new Set(
              pattern.steps
                .map((step) => step.dutyCode.trim().toUpperCase())
                .filter((dutyCode) => dutyCode !== "X" && dutyCode !== "OFF")
            ).size,
            1
          ),
          cycleLength: pattern.steps.length,
          patternCode: pattern.patternCode,
          patternStartDate: pattern.patternStartDate,
          steps: pattern.steps,
          teamIndexes: pattern.teamIndexes
        }
      ];

export const buildPatternString = (
  cycle: Pick<ShiftPatternCycle, "patternString" | "steps">
) => cycle.patternString?.trim() || buildShiftPatternDisplayString(cycle.steps);

const getPrimaryPattern = (patterns: ShiftPatternRecord[]) =>
  patterns.find((pattern) => pattern.status === "active") ?? patterns[0] ?? null;

const buildTeamStatusItems = (
  siteId: string,
  pattern: ShiftPatternRecord | null,
  employees: EmployeeRecord[]
) => {
  const labels = pattern ? getTeamLabels(pattern.teamCount) : [];
  const counts = new Map<string, number>();

  labels.forEach((label) => {
    counts.set(label, 0);
  });

  employees
    .filter((employee) => employee.currentSiteId === siteId)
    .forEach((employee) => {
      const label = normalizeTeamLabel(employee.currentShiftGroup) ?? "미지정";

      if (!counts.has(label)) {
        labels.push(label);
      }

      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

  return labels.map((label) => ({
    headcount: counts.get(label) ?? 0,
    label
  }));
};

export const buildRows = (
  sites: SiteRecord[],
  patterns: ShiftPatternRecord[],
  employees: EmployeeRecord[]
): SiteViewRow[] =>
  sites.map((site) => {
    const pattern = getPrimaryPattern(patterns.filter((item) => item.siteId === site.id));
    const cycles = pattern ? getPatternCycles(pattern) : [];
    const shiftDefinitions = cycles.flatMap((cycle) => getWorkingDefinitions(cycle));
    const cycleSummaries = cycles.map((cycle) => ({
      cycleKey: cycle.cycleKey,
      name: cycle.name,
      patternStartDate: cycle.patternStartDate,
      patternString: buildPatternString(cycle)
    }));

    return {
      cycleSummaries,
      pattern,
      patternString:
        cycleSummaries.length > 0
          ? cycleSummaries.map((cycle) => `${cycle.name}: ${cycle.patternString}`).join(" / ")
          : "등록된 패턴이 없습니다.",
      poolEnabled: pattern?.poolEnabled ?? false,
      shiftDefinitions,
      site,
      teamStatusItems: buildTeamStatusItems(site.id, pattern, employees),
      workType:
        pattern && cycles.length > 0
          ? `${pattern.teamCount}조 / ${cycles.length}개 Cycle${pattern.poolEnabled ? " / Pool" : ""}`
          : "패턴 미등록"
    };
  });

export const buildSiteNameSelectValues = (
  siteNameOptions: SiteNameOptionRecord[],
  customerName: string
) => {
  const optionNames = siteNameOptions.map((option) => option.name);
  const currentSiteName = customerName.trim();

  return currentSiteName && !optionNames.includes(currentSiteName)
    ? [currentSiteName, ...optionNames]
    : optionNames;
};

export const buildSiteDetailModels = (detailRow: SiteViewRow | null): SiteDetailModels => {
  if (!detailRow) {
    return {
      detailCycleCards: [],
      detailTeamIndexes: [],
      detailTotalAssignedHeadcount: 0
    };
  }

  const detailTotalAssignedHeadcount = detailRow.teamStatusItems.reduce(
    (sum, item) => sum + item.headcount,
    0
  );
  const labels = getTeamLabels(
    detailRow.pattern?.teamCount ?? Math.max(detailRow.teamStatusItems.length, 2)
  );
  const detailTeamIndexes = labels.map((teamLabel, index) => ({
    index:
      detailRow.pattern?.teamIndexes.find((item) => item.teamLabel === teamLabel)?.index ?? index,
    teamLabel
  }));

  if (!detailRow.pattern) {
    return {
      detailCycleCards: [],
      detailTeamIndexes,
      detailTotalAssignedHeadcount
    };
  }

  const cycles = getPatternCycles(detailRow.pattern);
  const teamStatusMap = new Map(detailRow.teamStatusItems.map((item) => [item.label, item.headcount]));
  const teamCapacityMap = new Map(
    detailRow.pattern.teamCapacities
      .filter((item) => typeof item.maxHeadcount === "number")
      .map((item) => [item.teamLabel, item.maxHeadcount as number])
  );
  const teamCycleMap = new Map(
    (detailRow.pattern.teamCycleAssignments.length > 0
      ? detailRow.pattern.teamCycleAssignments
      : labels.map((teamLabel) => ({
          cycleKey: cycles[0]?.cycleKey ?? "cycle-1",
          teamLabel
        }))).map((item) => [item.teamLabel, item.cycleKey])
  );

  const detailCycleCards = cycles.map((cycle) => ({
    cycleKey: cycle.cycleKey,
    cycleLength: Math.max(cycle.steps.length, cycle.cycleLength),
    name: cycle.name,
    patternStartDate: cycle.patternStartDate ?? "-",
    patternString: buildPatternString(cycle),
    shiftCount: cycle.shiftCount,
    shiftDefinitions: getWorkingDefinitions(cycle),
    teams: labels
      .filter(
        (teamLabel) =>
          (teamCycleMap.get(teamLabel) ?? cycles[0]?.cycleKey ?? cycle.cycleKey) === cycle.cycleKey
      )
      .map((teamLabel) => ({
        headcount: teamStatusMap.get(teamLabel) ?? 0,
        maxHeadcount: teamCapacityMap.get(teamLabel),
        teamIndex:
          cycle.teamIndexes.find((item) => item.teamLabel === teamLabel)?.index ??
          labels.indexOf(teamLabel),
        teamLabel
      }))
  }));

  return {
    detailCycleCards,
    detailTeamIndexes,
    detailTotalAssignedHeadcount
  };
};

export const buildSiteListSummary = (
  rows: SiteViewRow[],
  visibleRows: SiteViewRow[] = rows
): SiteListSummary => ({
  activeSites: rows.filter((row) => row.site.status === "active").length,
  // '배정 인원' 카드 설명이 "목록에 표시되는 총 배정 수"이므로 상태 필터가 걸리면
  // 실제로 보이는 행(visibleRows) 기준으로 집계한다. 나머지 카드(등록/운영중/Pool)는
  // 저장된 전체 기준 KPI라 rows 기준을 유지한다.
  assignedEmployees: visibleRows.reduce(
    (sum, row) => sum + row.teamStatusItems.reduce((itemSum, item) => itemSum + item.headcount, 0),
    0
  ),
  poolSites: rows.filter((row) => row.poolEnabled).length,
  totalSites: rows.length
});

export const buildPatternPresetRows = (rows: SiteViewRow[], draftSiteId?: string) =>
  rows.filter((row) => row.pattern && row.site.id !== draftSiteId);

export const buildActiveTeamLabels = ({
  employees,
  pendingAssignments,
  poolEnabled,
  siteId,
  teamLabels
}: {
  employees: EmployeeRecord[];
  pendingAssignments: PendingSiteAssignmentLike[];
  poolEnabled: boolean;
  siteId?: string;
  teamLabels: string[];
}) => {
  // 조 목록에 Pool 조가 이미 들어 있으면 다시 붙이지 않는다. 새로 붙일 때는 맨 앞에 둔다.
  const baseLabels =
    poolEnabled && !teamLabels.some(isPoolTeamLabel) ? ["Pool", ...teamLabels] : teamLabels;
  const extraGroups = [
    ...employees
      .filter((employee) => employee.currentSiteId === siteId && employee.currentShiftGroup)
      .map((employee) => normalizeTeamLabel(employee.currentShiftGroup))
      .filter((label): label is string => Boolean(label)),
    ...pendingAssignments.map((assignment) => assignment.teamLabel)
  ].filter((group) => !baseLabels.includes(group));

  return extraGroups.length > 0 ? [...baseLabels, ...extraGroups] : baseLabels;
};

export const buildAssignedEmployeesByTeam = ({
  activeTeamLabels,
  employees,
  pendingAssignmentMap,
  siteId
}: {
  activeTeamLabels: string[];
  employees: EmployeeRecord[];
  pendingAssignmentMap: Map<string, PendingSiteAssignmentLike>;
  siteId?: string;
}) => {
  const grouped = new Map<string, EmployeeRecord[]>();

  activeTeamLabels.forEach((label) => {
    grouped.set(label, []);
  });

  employees.forEach((employee) => {
    const pendingAssignment = pendingAssignmentMap.get(employee.id);

    if (pendingAssignment) {
      const current = grouped.get(pendingAssignment.teamLabel) ?? [];
      current.push(employee);
      grouped.set(pendingAssignment.teamLabel, current);
      return;
    }

    if (employee.currentSiteId !== siteId) {
      return;
    }

    const key = normalizeTeamLabel(employee.currentShiftGroup) ?? activeTeamLabels[0] ?? "미지정";
    const current = grouped.get(key) ?? [];
    current.push(employee);
    grouped.set(key, current);
  });

  return new Map(
    Array.from(grouped.entries()).map(([label, assignedEmployees]) => [
      label,
      assignedEmployees.slice().sort((left, right) => {
        const leftPendingAssignment = pendingAssignmentMap.get(left.id);
        const rightPendingAssignment = pendingAssignmentMap.get(right.id);
        const assignmentOrderDifference =
          getResolvedAssignmentSortOrder(left, leftPendingAssignment) -
          getResolvedAssignmentSortOrder(right, rightPendingAssignment);

        if (assignmentOrderDifference !== 0) {
          return assignmentOrderDifference;
        }

        const employeeCodeDifference = left.employeeCode.localeCompare(right.employeeCode, "ko-KR", {
          numeric: true
        });

        if (employeeCodeDifference !== 0) {
          return employeeCodeDifference;
        }

        return left.name.localeCompare(right.name, "ko-KR", {
          numeric: true
        });
      })
    ])
  );
};

export const buildFilteredPoolEmployees = ({
  employees,
  keyword,
  pendingAssignmentMap,
  poolScope,
  siteId
}: {
  employees: EmployeeRecord[];
  keyword: string;
  pendingAssignmentMap: Map<string, PendingSiteAssignmentLike>;
  poolScope: "all" | "unassigned" | "other-site";
  siteId?: string;
}) =>
  employees
    .filter((employee) => !pendingAssignmentMap.has(employee.id))
    .filter((employee) => employee.currentSiteId !== siteId)
    .filter((employee) => {
      if (poolScope === "unassigned") {
        return !employee.currentSiteId;
      }

      if (poolScope === "other-site") {
        return Boolean(employee.currentSiteId);
      }

      return true;
    })
    .filter((employee) => {
      const normalizedKeyword = keyword.trim().toLowerCase();

      if (!normalizedKeyword) {
        return true;
      }

      const displayName = formatEmployeeDisplayName(employee).toLowerCase();

      return (
        employee.name.toLowerCase().includes(normalizedKeyword) ||
        displayName.includes(normalizedKeyword) ||
        employee.employeeCode.toLowerCase().includes(normalizedKeyword)
      );
    });

export const buildSiteAssignmentTeamColumns = ({
  activeTeamLabels,
  assignedByTeam,
  configuredTeamCapacities,
  draggingEmployeeId,
  teamCapacities,
  teamLabels
}: {
  activeTeamLabels: string[];
  assignedByTeam: Map<string, EmployeeRecord[]>;
  configuredTeamCapacities: Map<string, number | undefined>;
  draggingEmployeeId: string | null;
  teamCapacities: string[];
  teamLabels: string[];
}): SiteAssignmentTeamColumn[] =>
  activeTeamLabels.map((label) => {
    const assignedEmployees = assignedByTeam.get(label) ?? [];
    const isConfiguredTeam = teamLabels.includes(label);
    const teamIndex = teamLabels.indexOf(label);
    const maxHeadcount = configuredTeamCapacities.get(label);
    const occupiedCount = assignedEmployees.filter((employee) => employee.id !== draggingEmployeeId).length;

    return {
      assignedEmployees,
      capacityValue: teamIndex >= 0 ? teamCapacities[teamIndex] ?? "" : "",
      displayLabel: label === "Pool" ? "Pool 근무" : label,
      isAtCapacity: typeof maxHeadcount === "number" && occupiedCount >= maxHeadcount,
      isConfiguredTeam,
      isPoolGroup: label === "Pool",
      label,
      maxHeadcount
    };
  });

export const buildSitePatternCycleAssignments = ({
  createFallbackDraft,
  cycleDrafts,
  cyclePreviews,
  teamCycleAssignments,
  teamLabels
}: {
  createFallbackDraft: (cycleKey: string) => SitePatternCycleDraftLike;
  cycleDrafts: SitePatternCycleDraftLike[];
  cyclePreviews: SitePatternCyclePreviewLike[];
  teamCycleAssignments: string[];
  teamLabels: string[];
}): SitePatternCycleAssignment[] => {
  const cycleDraftMap = new Map(cycleDrafts.map((cycle) => [cycle.cycleKey, cycle]));

  return cyclePreviews.map((cycle) => ({
    cycle,
    draftCycle: cycleDraftMap.get(cycle.cycleKey) ?? createFallbackDraft(cycle.cycleKey),
    teams: teamLabels.flatMap((teamLabel, index) =>
      teamCycleAssignments[index] === cycle.cycleKey ? [{ teamIndex: index, teamLabel }] : []
    )
  }));
};

export const buildSitePatternCyclePreviews = ({
  cycleCount,
  cycleDrafts,
  fallbackDate,
  fallbackTimeRanges,
  teamCount,
  // 조별 Index 칸 수. 기본 조(A조~) 말고 Pool 같은 조가 더 있으면 그만큼 늘어난다.
  teamSlotCount = teamCount
}: {
  cycleCount: number;
  cycleDrafts: SitePatternCycleDraftLike[];
  fallbackDate: string;
  fallbackTimeRanges: string[];
  teamCount: number;
  teamSlotCount?: number;
}): SitePatternCyclePreviewLike[] =>
  normalizeList<SitePatternCycleDraftLike>(cycleDrafts, cycleCount, (index) => ({
    breakMinutes: "60",
    cycleKey: `cycle-${index + 1}`,
    name: `Cycle ${index + 1}`,
    patternStartDate: fallbackDate,
    patternString: "",
    shiftCount: "2",
    shiftTimes: buildDefaultShiftTimes(2, fallbackTimeRanges),
    teamIndexes: Array.from({ length: teamSlotCount }, (_, itemIndex) => itemIndex)
  })).map((cycle, index) => {
    const shiftCount = Math.min(Math.max(Number(cycle.shiftCount) || 1, 1), 6);
    const shiftLabels = getShiftPatternDisplayLabels(shiftCount);
    const parsedPattern = parseCompressedShiftPatternString(
      cycle.patternString,
      shiftCount,
      shiftLabels
    );
    const breakMinutes = Number(cycle.breakMinutes) || 0;
    const shiftTimes = normalizeList(cycle.shiftTimes, shiftCount, (itemIndex) => {
      const defaults = buildDefaultShiftTimes(shiftCount, fallbackTimeRanges);
      return defaults[itemIndex] ?? "";
    });
    const shiftBreakMinutes =
      cycle.shiftBreakMinutes && cycle.shiftBreakMinutes.length > 0
        ? normalizeList(cycle.shiftBreakMinutes, shiftCount, () => cycle.breakMinutes).map(
            (value) => Number(value) || 0
          )
        : undefined;

    // 평·휴 분리(split)일 때만 휴일 시간/휴게를 함께 실어 보낸다.
    // 휴일 칸이 비어 있으면 0이 아니라 같은 근무조의 평일 값으로 채운다(빈 칸 = 평일과 동일).
    const isSplit = cycle.holidayTimeMode === "split";
    const holidayShiftTimes = isSplit
      ? Array.from({ length: shiftCount }, (_, itemIndex) => {
          const raw = cycle.holidayShiftTimes?.[itemIndex];
          return raw && raw.trim() ? raw : shiftTimes[itemIndex] ?? "";
        })
      : undefined;
    const holidayShiftBreakMinutes = isSplit
      ? Array.from({ length: shiftCount }, (_, itemIndex) => {
          const raw = cycle.holidayShiftBreakMinutes?.[itemIndex];
          const weekdayBreak = shiftBreakMinutes?.[itemIndex] ?? breakMinutes;
          return raw !== undefined && raw.trim() !== "" ? Number(raw) || 0 : weekdayBreak;
        })
      : undefined;

    return {
      breakMinutes,
      cycleKey: cycle.cycleKey || `cycle-${index + 1}`,
      cycleLabels: parsedPattern.cycleLabels,
      invalidTokens: parsedPattern.invalidTokens,
      name: cycle.name.trim() || `Cycle ${index + 1}`,
      patternStartDate: cycle.patternStartDate || fallbackDate,
      patternString: parsedPattern.normalizedPattern,
      ...(shiftBreakMinutes ? { shiftBreakMinutes } : {}),
      shiftTimes,
      shiftCards: shiftLabels.map((label, itemIndex) => ({
        breakMinutes: shiftBreakMinutes?.[itemIndex] ?? breakMinutes,
        label,
        timeRange: shiftTimes[itemIndex] ?? ""
      })),
      shiftCount,
      shiftLabels,
      teamIndexes: normalizeList(cycle.teamIndexes, teamSlotCount, (itemIndex) => itemIndex),
      ...(isSplit
        ? {
            holidayTimeMode: "split" as const,
            weekdayPublicHolidayAsHoliday: cycle.weekdayPublicHolidayAsHoliday ?? true
          }
        : {}),
      ...(holidayShiftTimes ? { holidayShiftTimes } : {}),
      ...(holidayShiftBreakMinutes ? { holidayShiftBreakMinutes } : {})
    };
  });

export const buildSitePatternSimulationTimeline = ({
  cyclePreviews,
  fallbackDate,
  simulationMonthIndex
}: {
  cyclePreviews: Array<Pick<SitePatternCyclePreviewLike, "patternStartDate">>;
  fallbackDate: string;
  simulationMonthIndex: number;
}) => {
  const dates = cyclePreviews
    .map((cycle) => cycle.patternStartDate)
    .filter((value): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  const simulationAnchorDate = dates[0] ?? fallbackDate;
  const simulationMonths = createSimulationMonthRange(simulationAnchorDate, fallbackDate);

  return {
    simulationAnchorDate,
    simulationMonth: simulationMonths[simulationMonthIndex] ?? simulationMonths[0],
    simulationMonths
  };
};

const formatPoolDailyHoursText = (poolDailyHours: number) =>
  poolDailyHours.toLocaleString("ko-KR", {
    minimumFractionDigits: poolDailyHours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1
  });

const getFallbackShiftTime = (fallbackTimeRanges: string[], index: number) =>
  fallbackTimeRanges[index] ??
  fallbackTimeRanges[fallbackTimeRanges.length - 1] ??
  "09:00 - 17:00";

export const buildSitePatternStepSetupModels = ({
  cycleAssignments,
  fallbackTimeRanges,
  poolDailyHours
}: {
  cycleAssignments: SitePatternCycleAssignment[];
  fallbackTimeRanges: string[];
  poolDailyHours: number;
}): SitePatternStepSetupModels => {
  const assignedTeamCount = cycleAssignments.reduce((sum, { teams }) => sum + teams.length, 0);
  const activeCycleCount = cycleAssignments.filter(({ teams }) => teams.length > 0).length;

  return {
    activeCycleCount,
    advancedEditorCycles: cycleAssignments.map(({ cycle, draftCycle, teams }) => ({
      assignedTeamLabels: teams.map((team) => team.teamLabel),
      cycleKey: cycle.cycleKey,
      cycleLabelCount: cycle.cycleLabels.length,
      draft: {
        breakMinutes: draftCycle.breakMinutes,
        name: draftCycle.name,
        patternStartDate: draftCycle.patternStartDate,
        patternString: draftCycle.patternString,
        shiftCount: draftCycle.shiftCount,
        shiftBreakMinutes: draftCycle.shiftBreakMinutes ?? [],
        shiftTimes: draftCycle.shiftTimes,
        holidayTimeMode: draftCycle.holidayTimeMode ?? "unified",
        weekdayPublicHolidayAsHoliday: draftCycle.weekdayPublicHolidayAsHoliday ?? true,
        holidayShiftTimes: draftCycle.holidayShiftTimes ?? [],
        holidayShiftBreakMinutes: draftCycle.holidayShiftBreakMinutes ?? []
      },
      fallbackShiftTimes: cycle.shiftLabels.map(
        (_, index) => cycle.shiftCards[index]?.timeRange ?? getFallbackShiftTime(fallbackTimeRanges, index)
      ),
      name: cycle.name,
      shiftCount: cycle.shiftCount,
      shiftLabels: cycle.shiftLabels,
      teamIndexes: teams.map((team) => ({
        teamIndex: team.teamIndex,
        teamLabel: team.teamLabel,
        value: draftCycle.teamIndexes[team.teamIndex] ?? team.teamIndex
      }))
    })),
    assignedTeamCount,
    poolDailyHoursText: formatPoolDailyHoursText(poolDailyHours),
    setupCycleAssignments: cycleAssignments.map(({ cycle, teams }) => ({
      cycleKey: cycle.cycleKey,
      name: cycle.name,
      patternString: cycle.patternString,
      teams: teams.map((team) => team.teamLabel)
    }))
  };
};

export const buildSitePatternSimulationModels = ({
  cycleAssignments,
  formatMonthLabel,
  getHolidayNameSizeClass,
  getShiftTone,
  simulationCells,
  simulationMonthDate
}: {
  cycleAssignments: SitePatternCycleAssignment[];
  formatMonthLabel: (date: Date) => string;
  getHolidayNameSizeClass: (name?: string) => string;
  getShiftTone: (label: string, shiftLabels: string[]) => string;
  simulationCells: SitePatternSimulationCellLike[];
  simulationMonthDate?: Date;
}): SitePatternSimulationModels => ({
  cycleShiftCards: cycleAssignments.flatMap(({ cycle }) =>
    cycle.shiftCards.map((card) => ({
      breakMinutes: card.breakMinutes,
      cycleName: cycle.name,
      key: `${cycle.cycleKey}-${card.label}`,
      label: card.label,
      timeRange: card.timeRange,
      toneClassName: getShiftTone(card.label, cycle.shiftLabels)
    }))
  ),
  invalidCycleMessages: cycleAssignments.flatMap(({ cycle }) =>
    cycle.invalidTokens.length > 0
      ? [`${cycle.name}: ${Array.from(new Set(cycle.invalidTokens)).join(", ")}`]
      : []
  ),
  simulationAssignmentSummaries: cycleAssignments.map(({ cycle, teams }) => ({
    cycleKey: cycle.cycleKey,
    cycleName: cycle.name,
    patternString: cycle.patternString || "패턴 대기",
    teams: teams.map((team) => team.teamLabel)
  })),
  simulationMonthLabel: simulationMonthDate ? formatMonthLabel(simulationMonthDate) : "-",
  simulationPanelCells: simulationCells.map((cell) => ({
    assignments: cell.assignments.map((assignment) => ({
      dutyLabel: assignment.dutyLabel,
      key: `${cell.key}-${assignment.teamLabel}`,
      teamLabel: assignment.teamLabel,
      toneClassName: assignment.tone
    })),
    date: cell.date,
    dayLabel: cell.dayLabel,
    holidayClassName: getHolidayNameSizeClass(cell.holidayName),
    holidayName: cell.holidayName,
    isCurrentMonth: cell.isCurrentMonth,
    isHoliday: cell.isHoliday,
    isToday: cell.isToday,
    key: cell.key
  }))
});

export const buildPatternPresetSiteOptions = (rows: Array<Pick<SiteViewRow, "site">>) =>
  rows.map((row) => ({
    id: row.site.id,
    name: row.site.name
  }));
