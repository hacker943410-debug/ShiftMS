import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type {
  ShiftPatternStepInput,
  ShiftPatternTeamIndexInput
} from "@shared/bridge/contracts";
import type { EmployeeRecord, ShiftPatternRecord, SiteRecord } from "@shared/domain/model";

import { FormSelect } from "../components/FormSelect";
import { useAppWorkflow } from "../contexts/app-workflow-context";

type SiteView = "list" | "step1" | "step2";
type PoolScope = "all" | "unassigned" | "other-site";
type ShiftTone = "day" | "night" | "first" | "second" | "third" | "off";

interface SiteDraftState {
  siteId?: string;
  patternId?: string;
  siteCode: string;
  name: string;
  status: SiteRecord["status"];
  timezone: string;
  teamCount: string;
  shiftCount: string;
  patternString: string;
  patternStartDate: string;
  breakMinutes: string;
  shiftTimes: string[];
  teamIndexes: number[];
}

interface ShiftDefinition {
  dutyCode: string;
  label: string;
  timeRange: string;
  breakMinutes: number;
}

interface SiteViewRow {
  site: SiteRecord;
  pattern: ShiftPatternRecord | null;
  patternString: string;
  teamStatusItems: Array<{ headcount: number; label: string }>;
  workType: string;
  shiftDefinitions: ShiftDefinition[];
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

const getPatternSymbols = (shiftCount: number) => {
  if (shiftCount === 2) {
    return ["주", "야"];
  }

  return Array.from({ length: shiftCount }, (_, index) => String(index + 1));
};

const getShiftDutyCodes = (shiftCount: number) => {
  if (shiftCount === 2) {
    return ["D", "N"];
  }

  return Array.from({ length: shiftCount }, (_, index) => String.fromCharCode(65 + index));
};

const buildDefaultPatternString = (shiftCount: number) => {
  if (shiftCount === 2) {
    return "주주주휴휴휴야야야휴휴휴";
  }

  return `${getPatternSymbols(shiftCount).join("")}휴`;
};

const normalizePatternStringInput = (value: string) => value.replace(/[\s,\-_/|]/g, "");

const createInitialDraft = (siteCode = ""): SiteDraftState => ({
  siteCode,
  name: "",
  status: "active",
  timezone: "Asia/Seoul",
  teamCount: "4",
  shiftCount: "2",
  patternString: buildDefaultPatternString(2),
  patternStartDate: createDateInputValue(),
  breakMinutes: "60",
  shiftTimes: buildDefaultShiftTimes(2),
  teamIndexes: createSequentialTeamIndexes(4)
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

const getShiftLabels = (shiftCount: number) => {
  if (shiftCount === 2) {
    return ["주간", "야간"];
  }

  if (shiftCount === 3) {
    return ["1근", "2근", "3근"];
  }

  return Array.from({ length: shiftCount }, (_, index) => `${index + 1}근`);
};

const splitTimeRange = (value: string) => {
  const parts = value.split("-").map((item) => item.trim());

  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return null;
  }

  return {
    startTime: parts[0],
    endTime: parts[1]
  };
};

const getDutyLabel = (dutyCode: string, index: number) => {
  const normalizedCode = dutyCode.trim().toUpperCase();

  if (normalizedCode === "D") {
    return "주간";
  }

  if (normalizedCode === "N") {
    return "야간";
  }

  if (normalizedCode === "X" || normalizedCode === "OFF") {
    return "휴무";
  }

  return `${index + 1}근`;
};

const shiftToneOrder: ShiftTone[] = ["day", "night", "first", "second", "third"];

const getShiftTone = (label: string, shiftLabels: string[]): ShiftTone => {
  if (label === "휴무") {
    return "off";
  }

  const index = shiftLabels.indexOf(label);
  return shiftToneOrder[Math.max(index, 0) % shiftToneOrder.length] ?? "day";
};

const parsePatternString = (patternString: string, shiftCount: number, shiftLabels: string[]) => {
  const normalizedPattern = normalizePatternStringInput(patternString);
  const tokens = Array.from(normalizedPattern);
  const symbols = getPatternSymbols(shiftCount);
  const dutyCodes = getShiftDutyCodes(shiftCount);
  const symbolEntries = symbols.map((symbol, index) => ({
    symbol,
    label: shiftLabels[index] ?? `${index + 1}근`,
    dutyCode: dutyCodes[index] ?? `S${index + 1}`
  }));
  const symbolMap = new Map(symbolEntries.map((entry) => [entry.symbol, entry]));
  const invalidTokens = tokens.filter((token) => token !== "휴" && !symbolMap.has(token));
  const cycleLabels = tokens.map((token) => {
    if (token === "휴") {
      return "휴무";
    }

    return symbolMap.get(token)?.label ?? "알수없음";
  });

  return {
    normalizedPattern,
    tokens,
    invalidTokens,
    cycleLabels,
    symbolEntries
  };
};

const createSimulationMonthRange = (anchorDate: string) => {
  const baseDate = new Date(`${anchorDate || createDateInputValue()}T00:00:00`);

  if (Number.isNaN(baseDate.getTime())) {
    const fallback = new Date();
    return Array.from({ length: 3 }, (_, index) => {
      const date = new Date(fallback.getFullYear(), fallback.getMonth() + index, 1);

      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        date
      };
    });
  }

  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, 1);

    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      date
    };
  });
};

const formatMonthLabel = (date: Date) =>
  `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월`;

const getDateDifferenceInDays = (left: string, right: string) => {
  const leftDate = new Date(`${left}T00:00:00`);
  const rightDate = new Date(`${right}T00:00:00`);
  const leftUtc = Date.UTC(leftDate.getFullYear(), leftDate.getMonth(), leftDate.getDate());
  const rightUtc = Date.UTC(rightDate.getFullYear(), rightDate.getMonth(), rightDate.getDate());

  return Math.round((rightUtc - leftUtc) / (24 * 60 * 60 * 1000));
};

const createDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const calculateWorkingHours = (timeRange: string, breakMinutes: number) => {
  const parsed = splitTimeRange(timeRange);

  if (!parsed) {
    return 0;
  }

  const [startHour, startMinute] = parsed.startTime.split(":").map(Number);
  const [endHour, endMinute] = parsed.endTime.split(":").map(Number);

  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return 0;
  }

  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;

  if (endTotal <= startTotal) {
    endTotal += 24 * 60;
  }

  return Math.max(endTotal - startTotal - breakMinutes, 0) / 60;
};

const buildSimulationCells = (
  monthDate: Date,
  patternStartDate: string,
  teamLabels: string[],
  teamIndexes: number[],
  patternCycleLabels: string[],
  shiftLabels: string[]
) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDate = new Date(year, month, 1);
  const firstWeekday = firstDate.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + totalDays) / 7) * 7;
  const patternCycle = patternCycleLabels.length > 0 ? patternCycleLabels : ["휴무"];
  const todayValue = createDateValue(new Date());

  return Array.from({ length: totalCells }, (_, index) => {
    const currentDate = new Date(year, month, index - firstWeekday + 1);
    const currentDateValue = createDateValue(currentDate);
    const dateOffset = getDateDifferenceInDays(patternStartDate, currentDateValue);
    const assignments = teamLabels.map((teamLabel, teamIndexPosition) => {
      const startIndex = teamIndexes[teamIndexPosition] ?? teamIndexPosition;
      const cycleIndex =
        ((dateOffset + startIndex) % patternCycle.length + patternCycle.length) % patternCycle.length;
      const dutyLabel = patternCycle[cycleIndex] ?? "휴무";

      return {
        teamLabel,
        dutyLabel,
        tone: getShiftTone(dutyLabel, shiftLabels)
      };
    });

    return {
      key: `${currentDateValue}-${index}`,
      dayLabel: String(currentDate.getDate()),
      isCurrentMonth: currentDate.getMonth() === month,
      isToday: currentDateValue === todayValue,
      assignments
    };
  });
};

const buildSimulationMetrics = (
  cells: ReturnType<typeof buildSimulationCells>,
  shiftLabels: string[],
  shiftTimes: string[],
  breakMinutes: number
) => {
  const workingHourMap = new Map(
    shiftLabels.map((label, index) => [label, calculateWorkingHours(shiftTimes[index] ?? "", breakMinutes)])
  );
  const currentMonthCells = cells.filter((cell) => cell.isCurrentMonth);
  const totalHours = currentMonthCells.reduce(
    (sum, cell) =>
      sum +
      cell.assignments.reduce(
        (assignmentSum, assignment) =>
          assignmentSum + (workingHourMap.get(assignment.dutyLabel) ?? 0),
        0
      ),
    0
  );
  const totalWorkingAssignments = currentMonthCells.reduce(
    (sum, cell) => sum + cell.assignments.filter((assignment) => assignment.dutyLabel !== "휴무").length,
    0
  );
  const totalOffAssignments = currentMonthCells.reduce(
    (sum, cell) => sum + cell.assignments.filter((assignment) => assignment.dutyLabel === "휴무").length,
    0
  );
  const averageDailyHours =
    currentMonthCells.length > 0 ? totalHours / currentMonthCells.length : 0;
  const weeklyEquivalent =
    currentMonthCells.length > 0 ? totalHours / (currentMonthCells.length / 7) : 0;

  return [
    { label: "월간 총근무시간", value: `${Math.round(totalHours).toLocaleString("ko-KR")}시간` },
    { label: "주간 환산", value: `${Math.round(weeklyEquivalent).toLocaleString("ko-KR")}시간` },
    {
      label: "일평균 실근무시간",
      value: `${averageDailyHours.toLocaleString("ko-KR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })}시간`
    },
    {
      label: "월간 휴무 슬롯",
      value: `${totalOffAssignments.toLocaleString("ko-KR")}회`
    },
    {
      label: "월간 배정 슬롯",
      value: `${totalWorkingAssignments.toLocaleString("ko-KR")}회`
    }
  ];
};

const getWorkingDefinitions = (pattern: ShiftPatternRecord): ShiftDefinition[] => {
  const seenCodes = new Set<string>();

  return pattern.steps
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
          dutyCode,
          label: getDutyLabel(dutyCode, seenCodes.size - 1),
          timeRange:
            step.startTime && step.endTime ? `${step.startTime} - ${step.endTime}` : "-",
          breakMinutes: step.breakMinutes
        }
      ];
    });
};

const buildPatternString = (pattern: ShiftPatternRecord) => {
  const definitions = getWorkingDefinitions(pattern);
  const symbolByCode = new Map(
    definitions.map((definition, index) => [
      definition.dutyCode,
      definition.label === "주간"
        ? "주"
        : definition.label === "야간"
          ? "야"
          : String(index + 1)
    ])
  );

  return pattern.steps
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .map((step) => {
      const dutyCode = step.dutyCode.trim().toUpperCase();

      if (dutyCode === "X" || dutyCode === "OFF") {
        return "휴";
      }

      return symbolByCode.get(dutyCode) ?? dutyCode;
    })
    .join("");
};

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
      const label = employee.currentShiftGroup?.trim() || "미지정";

      if (!counts.has(label)) {
        labels.push(label);
      }

      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

  return labels.map((label) => ({
    label,
    headcount: counts.get(label) ?? 0
  }));
};

const buildRows = (
  sites: SiteRecord[],
  patterns: ShiftPatternRecord[],
  employees: EmployeeRecord[]
): SiteViewRow[] =>
  sites.map((site) => {
    const pattern = getPrimaryPattern(patterns.filter((item) => item.siteId === site.id));
    const shiftDefinitions = pattern ? getWorkingDefinitions(pattern) : [];

    return {
      site,
      pattern,
      patternString: pattern ? buildPatternString(pattern) : "등록된 패턴이 없습니다.",
      teamStatusItems: buildTeamStatusItems(site.id, pattern, employees),
      workType:
        pattern && shiftDefinitions.length > 0
          ? `${pattern.teamCount}조 ${shiftDefinitions.length}교대`
          : "패턴 미등록",
      shiftDefinitions
    };
  });

const buildDraftFromRow = (row: SiteViewRow): SiteDraftState => {
  const shiftCount = row.shiftDefinitions.length > 0 ? row.shiftDefinitions.length : 2;
  const teamCount = row.pattern?.teamCount ?? 4;
  const teamLabels = getTeamLabels(teamCount);

  return {
    siteId: row.site.id,
    patternId: row.pattern?.id,
    siteCode: row.site.siteCode,
    name: row.site.name,
    status: row.site.status,
    timezone: row.site.timezone,
    teamCount: String(teamCount),
    shiftCount: String(shiftCount),
    patternString: row.pattern ? buildPatternString(row.pattern) : buildDefaultPatternString(shiftCount),
    patternStartDate: row.pattern?.patternStartDate ?? createDateInputValue(),
    breakMinutes: String(row.shiftDefinitions[0]?.breakMinutes ?? 60),
    shiftTimes: normalizeList(
      row.shiftDefinitions.map((definition) => definition.timeRange),
      shiftCount,
      (index) => buildDefaultShiftTimes(shiftCount)[index] ?? ""
    ),
    teamIndexes: teamLabels.map(
      (label, index) => row.pattern?.teamIndexes.find((item) => item.teamLabel === label)?.index ?? index
    )
  };
};

const buildShiftPatternSteps = (
  shiftCount: number,
  shiftLabels: string[],
  shiftTimes: string[],
  breakMinutes: number,
  patternString: string
) => {
  const parsedPattern = parsePatternString(patternString, shiftCount, shiftLabels);
  const symbolMap = new Map(parsedPattern.symbolEntries.map((entry) => [entry.symbol, entry]));

  return parsedPattern.tokens.map((token, stepIndex) => {
    if (token === "휴") {
      return {
        stepIndex,
        dutyCode: "X",
        breakMinutes: 0
      } satisfies ShiftPatternStepInput;
    }

    const entry = symbolMap.get(token);
    const shiftIndex = parsedPattern.symbolEntries.findIndex((item) => item.symbol === token);
    const parsedTime = splitTimeRange(shiftTimes[shiftIndex] ?? "");

    return {
      stepIndex,
      dutyCode: entry?.dutyCode ?? `S${shiftIndex + 1}`,
      startTime: parsedTime?.startTime,
      endTime: parsedTime?.endTime,
      breakMinutes
    } satisfies ShiftPatternStepInput;
  });
};

const buildPatternCode = (steps: ShiftPatternStepInput[]) => steps.map((step) => step.dutyCode).join("");

export const SiteManagementScreen = () => {
  const { setSelectedSiteId: setWorkflowSiteId, openRoute } = useAppWorkflow();
  const [view, setView] = useState<SiteView>("list");
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SiteDraftState>(() => createInitialDraft());
  const [activeTeam, setActiveTeam] = useState("");
  const [poolKeyword, setPoolKeyword] = useState("");
  const [poolScope, setPoolScope] = useState<PoolScope>("all");
  const [assignmentStartDate, setAssignmentStartDate] = useState(createDateInputValue());
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stepTwoError, setStepTwoError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [simulationMonthIndex, setSimulationMonthIndex] = useState(0);

  const deferredPoolKeyword = useDeferredValue(poolKeyword);
  const rows = useMemo(() => buildRows(sites, patterns, employees), [employees, patterns, sites]);
  const detailRow = detailSiteId ? rows.find((row) => row.site.id === detailSiteId) ?? null : null;
  const detailTeamIndexes = useMemo(() => {
    if (!detailRow) {
      return [];
    }

    const labels = getTeamLabels(detailRow.pattern?.teamCount ?? Math.max(detailRow.teamStatusItems.length, 2));

    return labels.map((teamLabel, index) => ({
      teamLabel,
      index: detailRow.pattern?.teamIndexes.find((item) => item.teamLabel === teamLabel)?.index ?? index
    }));
  }, [detailRow]);
  const teamCount = clampCount(Number(draft.teamCount), 2, 8);
  const shiftCount = clampCount(Number(draft.shiftCount), 2, 6);
  const teamLabels = useMemo(() => getTeamLabels(teamCount), [teamCount]);
  const shiftLabels = useMemo(() => getShiftLabels(shiftCount), [shiftCount]);
  const parsedPattern = useMemo(
    () => parsePatternString(draft.patternString, shiftCount, shiftLabels),
    [draft.patternString, shiftCount, shiftLabels]
  );
  const patternPreview = useMemo(() => {
    return {
      patternString: parsedPattern.normalizedPattern,
      cycleLabels: parsedPattern.cycleLabels,
      invalidTokens: parsedPattern.invalidTokens,
      shiftCards: shiftLabels.map((label, index) => ({
        label,
        timeRange: draft.shiftTimes[index] ?? "",
        breakMinutes: Number(draft.breakMinutes) || 0
      }))
    };
  }, [draft.breakMinutes, draft.shiftTimes, parsedPattern, shiftLabels]);
  const simulationMonths = useMemo(
    () => createSimulationMonthRange(draft.patternStartDate),
    [draft.patternStartDate]
  );
  const simulationMonth = simulationMonths[simulationMonthIndex] ?? simulationMonths[0];
  const simulationCells = useMemo(
    () =>
      buildSimulationCells(
        simulationMonth?.date ?? new Date(),
        draft.patternStartDate || createDateInputValue(),
        teamLabels,
        draft.teamIndexes,
        patternPreview.cycleLabels,
        shiftLabels
      ),
    [
      draft.patternStartDate,
      draft.teamIndexes,
      patternPreview.cycleLabels,
      shiftLabels,
      simulationMonth?.date,
      teamLabels
    ]
  );
  const simulationMetrics = useMemo(
    () =>
      buildSimulationMetrics(
        simulationCells,
        shiftLabels,
        draft.shiftTimes,
        Number(draft.breakMinutes) || 0
      ),
    [draft.breakMinutes, draft.shiftTimes, shiftLabels, simulationCells]
  );

  const activeTeamLabels = useMemo(() => {
    const extraGroups = employees
      .filter((employee) => employee.currentSiteId === draft.siteId && employee.currentShiftGroup)
      .map((employee) => employee.currentShiftGroup as string)
      .filter((group) => !teamLabels.includes(group));

    return extraGroups.length > 0 ? [...teamLabels, ...extraGroups] : teamLabels;
  }, [draft.siteId, employees, teamLabels]);

  const assignedByTeam = useMemo(() => {
    const grouped = new Map<string, EmployeeRecord[]>();

    activeTeamLabels.forEach((label) => {
      grouped.set(label, []);
    });

    employees
      .filter((employee) => employee.currentSiteId === draft.siteId)
      .forEach((employee) => {
        const key = employee.currentShiftGroup ?? activeTeamLabels[0] ?? "미지정";
        const current = grouped.get(key) ?? [];
        current.push(employee);
        grouped.set(key, current);
      });

    return grouped;
  }, [activeTeamLabels, draft.siteId, employees]);

  const filteredPoolEmployees = useMemo(
    () =>
      employees
        .filter((employee) => employee.currentSiteId !== draft.siteId)
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
          const keyword = deferredPoolKeyword.trim().toLowerCase();

          if (!keyword) {
            return true;
          }

          return (
            employee.name.toLowerCase().includes(keyword) ||
            employee.employeeCode.toLowerCase().includes(keyword)
          );
        }),
    [deferredPoolKeyword, draft.siteId, employees, poolScope]
  );

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const [siteResult, patternResult, employeeResult] = await Promise.all([
          window.appBridge.listSites(),
          window.appBridge.listShiftPatterns(),
          window.appBridge.listEmployees()
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
    setDraft((current) => ({
      ...current,
      teamCount: String(teamCount),
      shiftCount: String(shiftCount),
      patternString: current.patternString.trim()
        ? current.patternString
        : buildDefaultPatternString(shiftCount),
      shiftTimes: normalizeList(current.shiftTimes, shiftCount, (index) => {
        const defaults = buildDefaultShiftTimes(shiftCount);
        return defaults[index] ?? "";
      }),
      teamIndexes: normalizeList(current.teamIndexes, teamCount, (index) => index)
    }));
  }, [shiftCount, teamCount]);

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

  useEffect(() => {
    setActiveTeam(activeTeamLabels[0] ?? "");
  }, [activeTeamLabels]);

  const handleDraftChange = <K extends keyof SiteDraftState>(key: K, value: SiteDraftState[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const openRegistration = (siteId?: string) => {
    setDetailSiteId(null);
    setFormError(null);
    setStepTwoError(null);
    setSimulationMonthIndex(0);

    if (!siteId) {
      setDraft(createInitialDraft(buildNextAutoSiteCode(sites)));
      setView("step1");
      return;
    }

    const targetRow = rows.find((row) => row.site.id === siteId);

    if (!targetRow) {
      return;
    }

    setWorkflowSiteId(targetRow.site.id);
    setDraft(buildDraftFromRow(targetRow));
    setView("step1");
  };

  const persistDraft = async () => {
    setFormError(null);

    if (!draft.siteCode.trim() || !draft.name.trim()) {
      setFormError("근무지 코드와 근무지명은 필수입니다.");
      return false;
    }

    if (!draft.patternStartDate) {
      setFormError("패턴 시작일을 입력해야 합니다.");
      return false;
    }

    if (!patternPreview.patternString) {
      setFormError("패턴String을 입력해야 합니다.");
      return false;
    }

    if (patternPreview.invalidTokens.length > 0) {
      setFormError(
        `패턴String에 사용할 수 없는 문자가 있습니다: ${Array.from(
          new Set(patternPreview.invalidTokens)
        ).join(", ")}`
      );
      return false;
    }

    if (
      draft.teamIndexes.some(
        (value) =>
          !Number.isInteger(value) ||
          value < 0 ||
          value >= patternPreview.cycleLabels.length
      )
    ) {
      setFormError(
        `조별 Index는 0 ~ ${Math.max(patternPreview.cycleLabels.length - 1, 0)} 범위로 입력해야 합니다.`
      );
      return false;
    }

    const breakMinutes = Number(draft.breakMinutes);

    if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
      setFormError("휴게시간은 0 이상의 정수로 입력해야 합니다.");
      return false;
    }

    if (draft.shiftTimes.some((timeRange) => !splitTimeRange(timeRange))) {
      setFormError("모든 근무시간은 `HH:MM - HH:MM` 형식으로 입력해야 합니다.");
      return false;
    }

    setIsSavingDraft(true);

    try {
      const siteResult = await window.appBridge.saveSite({
        id: draft.siteId,
        siteCode: draft.siteCode.trim(),
        name: draft.name.trim(),
        status: draft.status,
        timezone: draft.timezone.trim() || "Asia/Seoul"
      });

      if (!siteResult.ok) {
        setFormError(siteResult.message);
        return false;
      }

      const steps = buildShiftPatternSteps(
        shiftCount,
        shiftLabels,
        draft.shiftTimes,
        breakMinutes,
        draft.patternString
      );
      const patternResult = await window.appBridge.saveShiftPattern({
        id: draft.patternId,
        siteId: siteResult.data.id,
        name: `${siteResult.data.name} ${teamCount}조 ${shiftCount}교대`,
        teamCount,
        patternCode: buildPatternCode(steps),
        startIndexRule: "manual-seed",
        patternStartDate: draft.patternStartDate,
        status: "active",
        steps,
        teamIndexes: teamLabels.map((teamLabel, index) => ({
          teamLabel,
          index: draft.teamIndexes[index] ?? index
        }))
      });

      if (!patternResult.ok) {
        setFormError(patternResult.message);
        return false;
      }

      setDraft((current) => ({
        ...current,
        siteId: siteResult.data.id,
        patternId: patternResult.data.id,
        siteCode: siteResult.data.siteCode,
        name: siteResult.data.name,
        status: siteResult.data.status,
        timezone: siteResult.data.timezone
      }));
      setWorkflowSiteId(siteResult.data.id);
      setAssignmentStartDate(draft.patternStartDate);
      setRefreshKey((current) => current + 1);

      return true;
    } catch (error) {
      setFormError(getErrorMessage(error));
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleAssignEmployee = async (employee: EmployeeRecord, targetTeam: string) => {
    if (!draft.siteId) {
      setStepTwoError("근무지 저장 후 인력 배정을 진행할 수 있습니다.");
      return;
    }

    if (!assignmentStartDate) {
      setStepTwoError("배정 적용일을 입력해야 합니다.");
      return;
    }

    setStepTwoError(null);
    setAssigningEmployeeId(employee.id);

    try {
      const result = await window.appBridge.saveEmployeeAssignment({
        employeeId: employee.id,
        siteId: draft.siteId,
        shiftGroup: targetTeam,
        teamName: targetTeam,
        startDate: assignmentStartDate
      });

      if (!result.ok) {
        setStepTwoError(result.message);
        return;
      }

      setRefreshKey((current) => current + 1);
    } catch (error) {
      setStepTwoError(getErrorMessage(error));
    } finally {
      setAssigningEmployeeId(null);
    }
  };

  const handleTeamIndexChange = (index: number, value: string) => {
    const nextValue = Number(value);

    setDraft((current) => ({
      ...current,
      teamIndexes: current.teamIndexes.map((item, itemIndex) =>
        itemIndex === index ? (Number.isNaN(nextValue) ? 0 : nextValue) : item
      )
    }));
  };

  if (view === "step2") {
    const activeEmployees = assignedByTeam.get(activeTeam) ?? [];

    return (
      <div className="screen-stack">
        <section className="surface-card site-stage-header">
          <div className="stage-indicator-row">
            <span className="stage-chip done">1단계: 패턴 등록</span>
            <span className="stage-chip active">2단계: 조직 구성</span>
          </div>
          <div>
            <h3>근무지 등록 - 2단계: 조직 구성</h3>
            <p>{draft.name || "신규 근무지"}에 실제 인력을 배정하고 조별 현황을 확인합니다.</p>
          </div>
        </section>

        {stepTwoError ? <p className="form-error-text">{stepTwoError}</p> : null}

        <section className="site-step-two-layout">
          <article className="surface-card assignment-pool-card">
            <div className="section-heading compact-heading">
              <h3>배정 후보 인력</h3>
              <span className="pill neutral">{filteredPoolEmployees.length}명</span>
            </div>
            <div className="site-pool-filters">
              <label className="field">
                <span>검색</span>
                <input
                  onChange={(event) => {
                    setPoolKeyword(event.target.value);
                  }}
                  placeholder="이름/사번 검색"
                  value={poolKeyword}
                />
              </label>
              <label className="field">
                <span>대상</span>
                <FormSelect
                  className="top-filter-select-shell"
                  onChange={(event) => {
                    setPoolScope(event.target.value as PoolScope);
                  }}
                  selectClassName="top-filter-select"
                  value={poolScope}
                >
                  <option value="all">전체</option>
                  <option value="unassigned">미배정</option>
                  <option value="other-site">타 근무지</option>
                </FormSelect>
              </label>
              <label className="field">
                <span>배정 적용일</span>
                <input
                  onChange={(event) => {
                    setAssignmentStartDate(event.target.value);
                  }}
                  type="date"
                  value={assignmentStartDate}
                />
              </label>
            </div>
            <div className="pool-list">
              {filteredPoolEmployees.length > 0 ? (
                filteredPoolEmployees.map((employee) => (
                  <div className="pool-item" key={employee.id}>
                    <div className="pool-avatar">{employee.name.slice(0, 1)}</div>
                    <div className="pool-copy">
                      <strong>{employee.name}</strong>
                      <span>
                        {employee.employeeCode} / {employee.employmentType}
                      </span>
                      <em
                        className={
                          employee.currentSiteName ? "pool-state warning" : "pool-state neutral"
                        }
                      >
                        {employee.currentSiteName
                          ? `${employee.currentSiteName} / ${employee.currentShiftGroup ?? "미지정"}`
                          : "미배정"}
                      </em>
                      <div className="pool-item-actions">
                        <button
                          className="primary-button compact-button"
                          disabled={!activeTeam || assigningEmployeeId === employee.id}
                          onClick={() => {
                            void handleAssignEmployee(employee, activeTeam);
                          }}
                          type="button"
                        >
                          {assigningEmployeeId === employee.id ? "배정 중..." : `${activeTeam} 배정`}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="site-empty-state">
                  <strong>표시할 인력이 없습니다.</strong>
                </div>
              )}
            </div>
          </article>

          <article className="surface-card assignment-board-card">
            <div className="tab-row team-tab-row">
              {activeTeamLabels.map((label) => (
                <button
                  className={label === activeTeam ? "tab-button active" : "tab-button"}
                  key={label}
                  onClick={() => {
                    setActiveTeam(label);
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="assignment-dropzone">
              {activeEmployees.length > 0 ? (
                <div className="assigned-card-row">
                  {activeEmployees.map((employee) => (
                    <div className="assigned-member-card" key={employee.id}>
                      <span className="assigned-avatar">{employee.name.slice(0, 1)}</span>
                      <div>
                        <strong>{employee.name}</strong>
                        <span>{employee.employeeCode}</span>
                        <div className="assigned-member-actions">
                          {teamLabels
                            .filter((label) => label !== activeTeam)
                            .map((label) => (
                              <button
                                className="ghost-button compact-button"
                                disabled={assigningEmployeeId === employee.id}
                                key={`${employee.id}-${label}`}
                                onClick={() => {
                                  void handleAssignEmployee(employee, label);
                                }}
                                type="button"
                              >
                                {label} 이동
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="assignment-empty">
                  <strong>{activeTeam}에 배정된 인력이 없습니다.</strong>
                </div>
              )}
            </div>

            <div className="team-summary-row">
              {activeTeamLabels.map((label) => (
                <div className="team-summary-card" key={label}>
                  <span>{label}</span>
                  <strong>{assignedByTeam.get(label)?.length ?? 0}명</strong>
                </div>
              ))}
            </div>

            <div className="site-shift-summary-grid">
              {patternPreview.shiftCards.map((card) => (
                <div className="site-shift-summary-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.timeRange}</strong>
                  <em>휴게 {card.breakMinutes}분</em>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="surface-card footer-action-card">
          <div className="button-row spread">
            <button
              className="ghost-button"
              onClick={() => {
                setView("step1");
              }}
              type="button"
            >
              이전 단계
            </button>
            <div className="button-row">
              <button
                className="ghost-button"
                onClick={() => {
                  void persistDraft();
                }}
                type="button"
              >
                패턴 다시 저장
              </button>
              <button
                className="ghost-button"
                disabled={!draft.siteId}
                onClick={() => {
                  if (!draft.siteId) {
                    return;
                  }

                  setWorkflowSiteId(draft.siteId);
                  openRoute("schedule", { selectedSiteId: draft.siteId });
                }}
                type="button"
              >
                근무표로 이동
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setView("list");
                }}
                type="button"
              >
                완료
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (view === "step1") {
    return (
      <div className="screen-stack">
        <section className="surface-card site-stage-header">
          <div className="stage-indicator-row">
            <span className="stage-chip active">1단계: 패턴 등록</span>
            <span className="stage-chip">2단계: 조직 구성</span>
          </div>
          <div>
            <h3>근무지 등록 - 1단계: 패턴 등록</h3>
            <p>근무지 기본 정보와 교대 패턴을 실제 저장소에 등록합니다.</p>
          </div>
        </section>

        {formError ? <p className="form-error-text">{formError}</p> : null}

        <section className="site-step-one-layout">
          <article className="surface-card site-form-panel">
            <div className="site-form-header">
              <div>
                <h3>기본 정보 및 패턴 설정</h3>
                <p>근무유형과 조별 Index를 먼저 고정하면 우측 달력 시뮬레이션이 바로 갱신됩니다.</p>
              </div>
              <div className="site-form-badge-row">
                <span className="site-stage-badge">자동 코드</span>
                <span className="site-stage-badge neutral">{teamCount}조 {shiftCount}교대</span>
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">기본 정보</strong>
              <div className="site-registration-grid">
                <label className="field compact-site-field site-code-field">
                  <span>근무지 코드</span>
                  <input readOnly value={draft.siteCode} />
                  <em className="site-field-note">신규 등록 시 자동 부여</em>
                </label>
                <label className="field compact-site-field site-name-field">
                  <span>근무지명</span>
                  <input
                    onChange={(event) => {
                      handleDraftChange("name", event.target.value);
                    }}
                    value={draft.name}
                  />
                </label>
                <label className="field compact-site-field site-status-field">
                  <span>상태</span>
                  <FormSelect
                    className="top-filter-select-shell"
                    onChange={(event) => {
                      handleDraftChange("status", event.target.value as SiteRecord["status"]);
                    }}
                    selectClassName="top-filter-select"
                    value={draft.status}
                  >
                    <option value="active">운영중</option>
                    <option value="inactive">중지</option>
                  </FormSelect>
                </label>
              </div>
              <div className="site-pattern-string-card">
                <span>패턴 String</span>
                <input
                  onChange={(event) => {
                    handleDraftChange("patternString", event.target.value);
                  }}
                  placeholder={shiftCount === 2 ? "예: 주주주휴휴휴야야야휴휴휴" : "예: 123휴123휴"}
                  value={draft.patternString}
                />
                <em className="site-field-note">
                  {shiftCount === 2
                    ? "2교대는 주/야/휴, 그 외 근무유형은 1/2/3.../휴 형식으로 입력"
                    : "휴무는 휴, 근무는 숫자 순서로 입력"}
                </em>
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">패턴 설정</strong>
              <div className="site-count-grid site-count-grid-tight">
                <label className="field compact-site-field">
                  <span>조 수</span>
                  <input
                    max={8}
                    min={2}
                    onChange={(event) => {
                      handleDraftChange("teamCount", event.target.value);
                    }}
                    type="number"
                    value={draft.teamCount}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>교대 수</span>
                  <input
                    max={6}
                    min={2}
                    onChange={(event) => {
                      handleDraftChange("shiftCount", event.target.value);
                    }}
                    type="number"
                    value={draft.shiftCount}
                  />
                </label>
                <div className="site-worktype-card">
                  <span>근무유형</span>
                  <strong>
                    {teamCount}조 {shiftCount}교대
                  </strong>
                </div>
              </div>
              <div className="site-form-grid site-pattern-meta-grid">
                <label className="field compact-site-field">
                  <span>패턴 시작일</span>
                  <input
                    onChange={(event) => {
                      handleDraftChange("patternStartDate", event.target.value);
                    }}
                    type="date"
                    value={draft.patternStartDate}
                  />
                </label>
                <label className="field compact-site-field">
                  <span>휴게시간(분)</span>
                  <input
                    min={0}
                    onChange={(event) => {
                      handleDraftChange("breakMinutes", event.target.value);
                    }}
                    type="number"
                    value={draft.breakMinutes}
                  />
                </label>
              </div>
              <div className="site-time-grid">
                {shiftLabels.map((label, index) => (
                  <label className="field compact-site-field" key={label}>
                    <span>{label}</span>
                    <input
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          shiftTimes: current.shiftTimes.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item
                          )
                        }));
                      }}
                      value={draft.shiftTimes[index] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">조별 Index</strong>
              <p className="site-config-copy">
                근무유형에 따라 조 입력란이 자동으로 늘어나며, 우측 달력은 이 Index를 기준으로 회전합니다.
                현재 입력 범위: 0 ~ {Math.max(patternPreview.cycleLabels.length - 1, 0)}
              </p>
              <div className="site-index-grid">
                {teamLabels.map((teamLabel, index) => (
                  <label className="field compact-site-field site-index-field" key={teamLabel}>
                    <span>{teamLabel} Index</span>
                    <input
                      onChange={(event) => {
                        handleTeamIndexChange(index, event.target.value);
                      }}
                      max={Math.max(patternPreview.cycleLabels.length - 1, 0)}
                      min={0}
                      type="number"
                      value={draft.teamIndexes[index] ?? index}
                    />
                  </label>
                ))}
              </div>
            </div>
          </article>

          <article className="surface-card simulation-panel site-simulation-panel">
            <div className="site-simulation-header">
              <div>
                <h3>월간 달력 시뮬레이션</h3>
                <p>패턴 시작일과 조별 Index 기준으로 이번 달 순환 배치를 미리 확인합니다.</p>
              </div>
              <div className="site-simulation-headline">
                <strong>{simulationMonth ? formatMonthLabel(simulationMonth.date) : "-"}</strong>
                <span>기준일 {draft.patternStartDate}</span>
              </div>
            </div>
            <div className="simulation-navigation">
              <button
                className="ghost-button compact-button"
                disabled={simulationMonthIndex === 0}
                onClick={() => {
                  setSimulationMonthIndex((current) => Math.max(current - 1, 0));
                }}
                type="button"
              >
                이전
              </button>
              <strong className="simulation-month-label">
                {simulationMonth ? formatMonthLabel(simulationMonth.date) : "-"}
              </strong>
              <button
                className="ghost-button compact-button"
                disabled={simulationMonthIndex === simulationMonths.length - 1}
                onClick={() => {
                  setSimulationMonthIndex((current) =>
                    Math.min(current + 1, simulationMonths.length - 1)
                  );
                }}
                type="button"
              >
                다음
              </button>
            </div>
            <div className="legend-row site-legend-row">
              {shiftLabels.map((label) => (
                <span className={`legend-item ${getShiftTone(label, shiftLabels)}`} key={label}>
                  {label}
                </span>
              ))}
              <span className="legend-item muted">휴무</span>
            </div>
            {patternPreview.invalidTokens.length > 0 ? (
              <p className="form-error-text">
                패턴String 오류: {Array.from(new Set(patternPreview.invalidTokens)).join(", ")}
              </p>
            ) : null}
            <div className="site-calendar-head">
              {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="site-calendar-grid">
              {simulationCells.map((cell) => (
                <div
                  className={
                    cell.isCurrentMonth
                      ? cell.isToday
                        ? "site-calendar-cell current"
                        : "site-calendar-cell"
                      : "site-calendar-cell muted"
                  }
                  key={cell.key}
                >
                  <div className="site-calendar-top">
                    <strong>{cell.dayLabel}</strong>
                    {cell.isToday ? <span className="site-calendar-today">오늘</span> : null}
                  </div>
                  <div className="site-calendar-assignment-list">
                    {cell.assignments.map((assignment) => (
                      <span
                        className={`shift-chip ${assignment.tone}`}
                        key={`${cell.key}-${assignment.teamLabel}`}
                      >
                        {assignment.teamLabel} {assignment.dutyLabel}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="site-shift-summary-grid site-shift-summary-grid-slim">
              {patternPreview.shiftCards.map((card) => (
                <div className="site-shift-summary-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.timeRange}</strong>
                  <em>휴게 {card.breakMinutes}분</em>
                </div>
              ))}
            </div>
            <div className="site-summary-strip site-summary-strip-wide">
              {simulationMetrics.map((item) => (
                <div className="site-summary-box" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="surface-card footer-action-card">
          <div className="button-row spread">
            <button
              className="ghost-button"
              onClick={() => {
                setView("list");
              }}
              type="button"
            >
              뒤로가기
            </button>
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isSavingDraft}
                onClick={() => {
                  void persistDraft();
                }}
                type="button"
              >
                적용
              </button>
              <button
                className="primary-button"
                disabled={isSavingDraft}
                onClick={() => {
                  void (async () => {
                    const saved = await persistDraft();

                    if (saved) {
                      setView("step2");
                    }
                  })();
                }}
                type="button"
              >
                다음 단계
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-stack">
      <section className="surface-card site-list-shell">
        <div className="section-heading compact-heading">
          <div>
            <h3>근무지 관리</h3>
            <p>저장된 근무지와 활성 패턴, 현재 인력 배치 상태를 확인합니다.</p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              openRegistration();
            }}
            type="button"
          >
            근무지 등록
          </button>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}

        <div className="data-scroll">
          <table className="info-table site-list-table">
            <thead>
              <tr>
                <th>근무지명</th>
                <th>패턴 String</th>
                <th>근무유형</th>
                <th>조별 근무자 현황</th>
                <th>상태</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>근무지 정보를 불러오는 중입니다.</td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.site.id}>
                    <td className="table-strong">{row.site.name}</td>
                    <td className="site-pattern-cell">
                      <div className="pattern-preview">
                        <span>{row.patternString}</span>
                      </div>
                    </td>
                    <td>{row.workType}</td>
                    <td className="site-team-cell">
                      {row.teamStatusItems.length > 0 ? (
                        <div className="site-team-summary">
                          {row.teamStatusItems.map((item) => (
                            <span className="site-team-chip" key={`${row.site.id}-${item.label}`}>
                              <em>{item.label}</em>
                              <strong>{item.headcount}명</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="site-team-empty">배정 인력 없음</span>
                      )}
                    </td>
                    <td>
                      <span className={row.site.status === "active" ? "pill info" : "pill neutral"}>
                        {row.site.status === "active" ? "운영중" : "중지"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        onClick={() => {
                          setWorkflowSiteId(row.site.id);
                          setDetailSiteId(row.site.id);
                        }}
                        type="button"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>등록된 근무지가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailRow ? (
        <div className="modal-overlay">
          <div className="modal-card site-detail-modal">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>{detailRow.site.name}</h3>
                <p>저장된 근무지와 활성 패턴 정보입니다.</p>
              </div>
              <div className="button-row">
                <button
                  className="ghost-button compact-button"
                  onClick={() => {
                    setWorkflowSiteId(detailRow.site.id);
                    openRoute("schedule", { selectedSiteId: detailRow.site.id });
                  }}
                  type="button"
                >
                  근무표 배포
                </button>
                <button
                  className="primary-button compact-button"
                  onClick={() => {
                    openRegistration(detailRow.site.id);
                  }}
                  type="button"
                >
                  수정
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() => {
                    setDetailSiteId(null);
                  }}
                  type="button"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="site-detail-grid">
              <div className="site-detail-section">
                <span>근무지명</span>
                <strong>{detailRow.site.name}</strong>
              </div>
              <div className="site-detail-section">
                <span>근무지 코드</span>
                <strong>{detailRow.site.siteCode}</strong>
              </div>
              <div className="site-detail-section">
                <span>근무유형</span>
                <strong>{detailRow.workType}</strong>
              </div>
              <div className="site-detail-section">
                <span>시간대 / 상태</span>
                <strong>
                  {detailRow.site.timezone} / {detailRow.site.status === "active" ? "운영중" : "중지"}
                </strong>
              </div>
              <div className="site-detail-section">
                <span>패턴 시작일</span>
                <strong>{detailRow.pattern?.patternStartDate ?? "-"}</strong>
              </div>
              <div className="site-detail-section">
                <span>조별 Index 요약</span>
                <strong>
                  {detailTeamIndexes.length > 0
                    ? detailTeamIndexes
                        .map((item) => `${item.teamLabel} ${item.index}`)
                        .join(" / ")
                    : "-"}
                </strong>
              </div>
            </div>
            <div className="site-worktime-grid">
              {detailRow.shiftDefinitions.length > 0 ? (
                detailRow.shiftDefinitions.map((definition) => (
                  <div className="site-detail-section" key={definition.dutyCode}>
                    <span>{definition.label}</span>
                    <strong>{definition.timeRange}</strong>
                    <em>휴게 {definition.breakMinutes}분</em>
                  </div>
                ))
              ) : (
                <div className="site-detail-section">
                  <span>패턴 상태</span>
                  <strong>등록된 패턴이 없습니다.</strong>
                </div>
              )}
            </div>
            {detailTeamIndexes.length > 0 ? (
              <div className="site-index-status-grid">
                {detailTeamIndexes.map((item) => (
                  <div className="site-detail-section" key={item.teamLabel}>
                    <span>{item.teamLabel} Index</span>
                    <strong>{item.index}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
