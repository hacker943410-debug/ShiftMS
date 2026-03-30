import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  ShiftPatternCycleInput,
  ShiftPatternTeamCycleAssignmentInput,
  ShiftPatternStepInput,
  ShiftPatternTeamIndexInput
} from "@shared/bridge/contracts";
import type {
  EmployeeRecord,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternTeamCycleAssignment,
  SiteRecord
} from "@shared/domain/model";
import { calculateDurationMinutes } from "@shared/domain/calculation";
import {
  buildShiftPatternDisplayString,
  buildShiftPatternStepsFromPatternString,
  getShiftPatternSymbols,
  parseCompressedShiftPatternString
} from "@shared/domain/shift-pattern-compression";
import { normalizeTeamLabel } from "@shared/domain/team-label";

import { DateField } from "../components/DateField";
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

interface ShiftDefinition {
  dutyCode: string;
  label: string;
  timeRange: string;
  breakMinutes: number;
  cycleName?: string;
}

interface SiteViewRow {
  site: SiteRecord;
  pattern: ShiftPatternRecord | null;
  patternString: string;
  teamStatusItems: Array<{ headcount: number; label: string }>;
  workType: string;
  shiftDefinitions: ShiftDefinition[];
  cycleSummaries: Array<{
    cycleKey: string;
    name: string;
    patternString: string;
    patternStartDate?: string;
  }>;
  poolEnabled: boolean;
}

interface SiteCyclePreview {
  cycleKey: string;
  name: string;
  shiftCount: number;
  patternString: string;
  patternStartDate: string;
  breakMinutes: number;
  shiftTimes: string[];
  teamIndexes: number[];
  shiftLabels: string[];
  cycleLabels: string[];
  invalidTokens: string[];
  shiftCards: Array<{
    label: string;
    timeRange: string;
    breakMinutes: number;
  }>;
}

interface SimulationAssignment {
  teamLabel: string;
  dutyLabel: string;
  tone: ShiftTone;
  cycleKey: string;
  cycleName: string;
}

interface SimulationMetricItem {
  label: string;
  note?: string;
  value: string;
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
const timeHourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const timeMinuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

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

const truncatePatternSummary = (value: string, maxLength = 15) => {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
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

const getShiftLabels = (shiftCount: number) => {
  if (shiftCount === 1) {
    return ["주간"];
  }

  if (shiftCount === 2) {
    return ["주간", "야간"];
  }

  if (shiftCount === 3) {
    return ["1근", "2근", "3근"];
  }

  return Array.from({ length: shiftCount }, (_, index) => `${index + 1}근`);
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

const parseClockTime = (value: string) => {
  const matched = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!matched) {
    return null;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour: String(hour).padStart(2, "0"),
    minute: String(minute).padStart(2, "0")
  };
};

const buildTimeValue = (hour: string, minute: string) => `${hour}:${minute}`;

const buildTimeRangeValue = (
  startHour: string,
  startMinute: string,
  endHour: string,
  endMinute: string
) => `${buildTimeValue(startHour, startMinute)} - ${buildTimeValue(endHour, endMinute)}`;

const splitTimeRange = (value: string) => {
  const parts = value.split("-").map((item) => item.trim());

  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return null;
  }

  const startTime = parseClockTime(parts[0]);
  const endTime = parseClockTime(parts[1]);

  if (!startTime || !endTime) {
    return null;
  }

  return {
    startTime: buildTimeValue(startTime.hour, startTime.minute),
    endTime: buildTimeValue(endTime.hour, endTime.minute)
  };
};

const getTimeRangeParts = (value: string, fallbackValue: string) => {
  const parsed =
    splitTimeRange(value) ??
    splitTimeRange(fallbackValue) ??
    splitTimeRange("00:00 - 00:00") ?? {
      startTime: "00:00",
      endTime: "00:00"
    };
  const start = parseClockTime(parsed.startTime) ?? { hour: "00", minute: "00" };
  const end = parseClockTime(parsed.endTime) ?? { hour: "00", minute: "00" };

  return {
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute
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

const formatSimulationHours = (hours: number, minimumFractionDigits = 0) =>
  hours.toLocaleString("ko-KR", {
    minimumFractionDigits,
    maximumFractionDigits: 1
  });

const resolveWorkingHourSummary = (timeRange: string, breakMinutes: number) => {
  const parsed = splitTimeRange(timeRange);

  if (!parsed) {
    return {
      actualMinutes: 0,
      breakMinutes: 0,
      grossMinutes: 0
    };
  }

  const grossMinutes = calculateDurationMinutes({
    ...parsed,
    breakMinutes: 0
  });
  const actualMinutes = calculateDurationMinutes({
    ...parsed,
    breakMinutes
  });

  return {
    actualMinutes,
    breakMinutes: Math.max(grossMinutes - actualMinutes, 0),
    grossMinutes
  };
};

const calculateWorkingHours = (timeRange: string, breakMinutes: number) => {
  const summary = resolveWorkingHourSummary(timeRange, breakMinutes);

  return summary.actualMinutes / 60;
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

interface SiteTimeRangePickerProps {
  fallbackValue: string;
  value: string;
  onChange: (value: string) => void;
}

const SiteTimeRangePicker = ({
  fallbackValue,
  value,
  onChange
}: SiteTimeRangePickerProps) => {
  const timeParts = getTimeRangeParts(value, fallbackValue);
  const previewValue = buildTimeRangeValue(
    timeParts.startHour,
    timeParts.startMinute,
    timeParts.endHour,
    timeParts.endMinute
  );

  const updateTimeRange = (
    nextPart:
      | { key: "startHour"; value: string }
      | { key: "startMinute"; value: string }
      | { key: "endHour"; value: string }
      | { key: "endMinute"; value: string }
  ) => {
    const nextTimeParts = {
      ...timeParts,
      [nextPart.key]: nextPart.value
    };

    onChange(
      buildTimeRangeValue(
        nextTimeParts.startHour,
        nextTimeParts.startMinute,
        nextTimeParts.endHour,
        nextTimeParts.endMinute
      )
    );
  };

  return (
    <div className="site-time-range-picker">
      <div className="site-time-picker-row">
        <span className="site-time-picker-row-label">시작</span>
        <FormSelect
          aria-label="시작 시"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "startHour", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.startHour}
        >
          {timeHourOptions.map((hour) => (
            <option key={`start-hour-${hour}`} value={hour}>
              {hour}
            </option>
          ))}
        </FormSelect>
        <span className="site-time-picker-divider">:</span>
        <FormSelect
          aria-label="시작 분"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "startMinute", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.startMinute}
        >
          {timeMinuteOptions.map((minute) => (
            <option key={`start-minute-${minute}`} value={minute}>
              {minute}
            </option>
          ))}
        </FormSelect>
      </div>
      <div className="site-time-picker-row">
        <span className="site-time-picker-row-label">종료</span>
        <FormSelect
          aria-label="종료 시"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "endHour", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.endHour}
        >
          {timeHourOptions.map((hour) => (
            <option key={`end-hour-${hour}`} value={hour}>
              {hour}
            </option>
          ))}
        </FormSelect>
        <span className="site-time-picker-divider">:</span>
        <FormSelect
          aria-label="종료 분"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "endMinute", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.endMinute}
        >
          {timeMinuteOptions.map((minute) => (
            <option key={`end-minute-${minute}`} value={minute}>
              {minute}
            </option>
          ))}
        </FormSelect>
      </div>
      <span className="site-time-range-preview">{previewValue}</span>
    </div>
  );
};

const buildSimulationCells = (
  monthDate: Date,
  teamLabels: string[],
  teamCycleAssignments: string[],
  cyclePreviews: SiteCyclePreview[],
  holidayNameByDate: Map<string, string>
) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDate = new Date(year, month, 1);
  const firstWeekday = firstDate.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + totalDays) / 7) * 7;
  const todayValue = createDateValue(new Date());
  const cyclePreviewMap = new Map(cyclePreviews.map((cycle) => [cycle.cycleKey, cycle]));
  const defaultCycle = cyclePreviews[0] ?? null;

  return Array.from({ length: totalCells }, (_, index) => {
    const currentDate = new Date(year, month, index - firstWeekday + 1);
    const currentDateValue = createDateValue(currentDate);
    const holidayName = holidayNameByDate.get(currentDateValue);
    const assignments = teamLabels.map((teamLabel, teamIndexPosition) => {
      const assignedCycleKey =
        teamCycleAssignments[teamIndexPosition] ?? defaultCycle?.cycleKey ?? "cycle-1";
      const cyclePreview = cyclePreviewMap.get(assignedCycleKey) ?? defaultCycle;

      if (!cyclePreview) {
        return {
          teamLabel,
          dutyLabel: "휴무",
          tone: "off" as ShiftTone,
          cycleKey: assignedCycleKey,
          cycleName: "미지정"
        };
      }

      const cycleLabels = cyclePreview.cycleLabels.length > 0 ? cyclePreview.cycleLabels : ["휴무"];
      const dateOffset = getDateDifferenceInDays(
        cyclePreview.patternStartDate || createDateInputValue(),
        currentDateValue
      );
      const startIndex = cyclePreview.teamIndexes[teamIndexPosition] ?? teamIndexPosition;
      const cycleIndex =
        ((dateOffset + startIndex) % cycleLabels.length + cycleLabels.length) % cycleLabels.length;
      const dutyLabel = cycleLabels[cycleIndex] ?? "휴무";

      return {
        teamLabel,
        dutyLabel,
        tone: getShiftTone(dutyLabel, cyclePreview.shiftLabels),
        cycleKey: cyclePreview.cycleKey,
        cycleName: cyclePreview.name
      };
    });

    return {
      key: `${currentDateValue}-${index}`,
      date: currentDateValue,
      dayLabel: String(currentDate.getDate()),
      isCurrentMonth: currentDate.getMonth() === month,
      isToday: currentDateValue === todayValue,
      isHoliday: Boolean(holidayName),
      holidayName,
      assignments
    };
  });
};

const buildSimulationMetrics = (
  cells: ReturnType<typeof buildSimulationCells>,
  cyclePreviews: SiteCyclePreview[]
) => {
  const currentMonthCells = cells.filter((cell) => cell.isCurrentMonth);
  const workingHourMaps = new Map(
    cyclePreviews.map((cycle) => [
      cycle.cycleKey,
      new Map(
        cycle.shiftLabels.map((label, index) => [
          label,
          resolveWorkingHourSummary(cycle.shiftTimes[index] ?? "", cycle.breakMinutes)
        ])
      )
    ])
  );

  return cyclePreviews.map((cycle) => {
    const cycleHourMap = workingHourMaps.get(cycle.cycleKey) ?? new Map<
      string,
      ReturnType<typeof resolveWorkingHourSummary>
    >();
    const cycleAssignments = currentMonthCells.flatMap((cell) =>
      cell.assignments.filter((assignment) => assignment.cycleKey === cycle.cycleKey)
    );
    const assignedTeams = new Set(cycleAssignments.map((assignment) => assignment.teamLabel));
    const assignedHeadcount = Math.max(assignedTeams.size, 1);
    const totalGrossMinutes = cycleAssignments.reduce(
      (sum, assignment) => sum + (cycleHourMap.get(assignment.dutyLabel)?.grossMinutes ?? 0),
      0
    );
    const totalBreakMinutes = cycleAssignments.reduce(
      (sum, assignment) => sum + (cycleHourMap.get(assignment.dutyLabel)?.breakMinutes ?? 0),
      0
    );
    const totalWorkMinutes = cycleAssignments.reduce(
      (sum, assignment) => sum + (cycleHourMap.get(assignment.dutyLabel)?.actualMinutes ?? 0),
      0
    );
    const workingAssignments = cycleAssignments.filter(
      (assignment) => assignment.dutyLabel !== "휴무"
    ).length;
    const offAssignments = cycleAssignments.length - workingAssignments;
    const perPersonHours = totalWorkMinutes / assignedHeadcount / 60;
    const perPersonGrossHours = totalGrossMinutes / assignedHeadcount / 60;
    const perPersonBreakHours = totalBreakMinutes / assignedHeadcount / 60;
    const averageDailyHours =
      currentMonthCells.length > 0 ? perPersonHours / currentMonthCells.length : 0;
    const weeklyEquivalent =
      currentMonthCells.length > 0 ? perPersonHours / (currentMonthCells.length / 7) : 0;
    const perPersonWorkingAssignments = workingAssignments / assignedHeadcount;
    const perPersonOffAssignments = offAssignments / assignedHeadcount;

    return {
      cycleKey: cycle.cycleKey,
      cycleName: cycle.name,
      items: [
        {
          label: "월간 1인 실근무시간",
          note: `총 ${formatSimulationHours(perPersonGrossHours)}시간 - 휴게 ${formatSimulationHours(perPersonBreakHours)}시간`,
          value: `${Math.round(perPersonHours).toLocaleString("ko-KR")}시간`
        },
        { label: "주간 1인 환산", value: `${Math.round(weeklyEquivalent).toLocaleString("ko-KR")}시간` },
        {
          label: "일평균 1인 실근무",
          value: `${formatSimulationHours(averageDailyHours, 1)}시간`
        },
        { label: "월간 1인 근무일수", value: `${Math.round(perPersonWorkingAssignments).toLocaleString("ko-KR")}회` },
        { label: "월간 1인 휴무일수", value: `${Math.round(perPersonOffAssignments).toLocaleString("ko-KR")}회` }
      ] satisfies SimulationMetricItem[]
    };
  });
};

const getWorkingDefinitions = (
  cycle: Pick<ShiftPatternCycle, "name" | "steps">
): ShiftDefinition[] => {
  const seenCodes = new Set<string>();

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
          dutyCode,
          label: getDutyLabel(dutyCode, seenCodes.size - 1),
          timeRange:
            step.startTime && step.endTime ? `${step.startTime} - ${step.endTime}` : "-",
          breakMinutes: step.breakMinutes,
          cycleName: cycle.name
        }
      ];
    });
};

const getPatternCycles = (pattern: ShiftPatternRecord) =>
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

const buildPatternString = (cycle: Pick<ShiftPatternCycle, "steps">) =>
  buildShiftPatternDisplayString(cycle.steps);

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
    const cycles = pattern ? getPatternCycles(pattern) : [];
    const shiftDefinitions = cycles.flatMap((cycle) => getWorkingDefinitions(cycle));
    const cycleSummaries = cycles.map((cycle) => ({
      cycleKey: cycle.cycleKey,
      name: cycle.name,
      patternString: buildPatternString(cycle),
      patternStartDate: cycle.patternStartDate
    }));

    return {
      site,
      pattern,
      patternString:
        cycleSummaries.length > 0
          ? cycleSummaries.map((cycle) => `${cycle.name}: ${cycle.patternString}`).join(" / ")
          : "등록된 패턴이 없습니다.",
      teamStatusItems: buildTeamStatusItems(site.id, pattern, employees),
      workType:
        pattern && cycles.length > 0
          ? `${pattern.teamCount}조 / ${cycles.length}개 Cycle${pattern.poolEnabled ? " / Pool" : ""}`
          : "패턴 미등록",
      shiftDefinitions,
      cycleSummaries,
      poolEnabled: pattern?.poolEnabled ?? false
    };
  });

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

const buildPatternCode = (steps: ShiftPatternStepInput[]) => steps.map((step) => step.dutyCode).join("");

export const SiteManagementScreen = () => {
  const { setSelectedSiteId: setWorkflowSiteId, openRoute } = useAppWorkflow();
  const [view, setView] = useState<SiteView>("list");
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<SiteViewRow | null>(null);
  const [draft, setDraft] = useState<SiteDraftState>(() => createInitialDraft());
  const [pendingAssignments, setPendingAssignments] = useState<PendingSiteAssignment[]>([]);
  const [poolKeyword, setPoolKeyword] = useState("");
  const [poolScope, setPoolScope] = useState<PoolScope>("all");
  const [assignmentStartDate, setAssignmentStartDate] = useState(createDateInputValue());
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isCompletingSite, setIsCompletingSite] = useState(false);
  const [isDeletingSite, setIsDeletingSite] = useState(false);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);
  const [draggingEmployeeSourceTeam, setDraggingEmployeeSourceTeam] = useState<string | null>(null);
  const [isTeamCapacityDirty, setIsTeamCapacityDirty] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stepTwoError, setStepTwoError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPatternPresetModal, setShowPatternPresetModal] = useState(false);
  const [selectedPatternPresetSiteId, setSelectedPatternPresetSiteId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [simulationMonthIndex, setSimulationMonthIndex] = useState(0);
  const [draggingTeamLabel, setDraggingTeamLabel] = useState<string | null>(null);
  const [simulationHolidayNameByDate, setSimulationHolidayNameByDate] = useState<Map<string, string>>(
    new Map()
  );
  const listSectionRef = useRef<HTMLElement | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shouldRestoreListFocusRef = useRef(false);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const dragAutoScrollSnapshotRef = useRef<DragAutoScrollSnapshot | null>(null);

  const deferredPoolKeyword = useDeferredValue(poolKeyword);
  const rows = useMemo(() => buildRows(sites, patterns, employees), [employees, patterns, sites]);
  const detailRow = detailSnapshot;
  const pendingAssignmentMap = useMemo(
    () => new Map(pendingAssignments.map((item) => [item.employeeId, item])),
    [pendingAssignments]
  );
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
  const detailCycleCards = useMemo(() => {
    if (!detailRow?.pattern) {
      return [];
    }

    const pattern = detailRow.pattern;
    const cycles = getPatternCycles(pattern);
    const labels = getTeamLabels(pattern.teamCount);
    const teamStatusMap = new Map(detailRow.teamStatusItems.map((item) => [item.label, item.headcount]));
    const teamCapacityMap = new Map(
      pattern.teamCapacities
        .filter((item) => typeof item.maxHeadcount === "number")
        .map((item) => [item.teamLabel, item.maxHeadcount as number])
    );
    const teamCycleMap = new Map(
      (pattern.teamCycleAssignments.length > 0
        ? pattern.teamCycleAssignments
        : labels.map((teamLabel) => ({
            teamLabel,
            cycleKey: cycles[0]?.cycleKey ?? "cycle-1"
          }))).map((item) => [item.teamLabel, item.cycleKey])
    );

    return cycles.map((cycle) => ({
      cycleKey: cycle.cycleKey,
      name: cycle.name,
      patternStartDate: cycle.patternStartDate ?? "-",
      patternString: buildPatternString(cycle),
      shiftCount: cycle.shiftCount,
      cycleLength: Math.max(cycle.steps.length, cycle.cycleLength),
      shiftDefinitions: getWorkingDefinitions(cycle),
      teams: labels
        .filter((teamLabel) => (teamCycleMap.get(teamLabel) ?? cycles[0]?.cycleKey ?? cycle.cycleKey) === cycle.cycleKey)
        .map((teamLabel) => ({
          teamLabel,
          teamIndex:
            cycle.teamIndexes.find((item) => item.teamLabel === teamLabel)?.index ?? labels.indexOf(teamLabel),
          headcount: teamStatusMap.get(teamLabel) ?? 0,
          maxHeadcount: teamCapacityMap.get(teamLabel)
        }))
    }));
  }, [detailRow]);
  const detailTotalAssignedHeadcount = useMemo(
    () => detailRow?.teamStatusItems.reduce((sum, item) => sum + item.headcount, 0) ?? 0,
    [detailRow]
  );
  const siteListSummary = useMemo(
    () => ({
      totalSites: rows.length,
      activeSites: rows.filter((row) => row.site.status === "active").length,
      poolSites: rows.filter((row) => row.poolEnabled).length,
      assignedEmployees: rows.reduce(
        (sum, row) => sum + row.teamStatusItems.reduce((itemSum, item) => itemSum + item.headcount, 0),
        0
      )
    }),
    [rows]
  );
  const patternPresetRows = useMemo(
    () => rows.filter((row) => row.pattern && row.site.id !== draft.siteId),
    [draft.siteId, rows]
  );
  const selectedPatternPresetRow = useMemo(
    () =>
      patternPresetRows.find((row) => row.site.id === selectedPatternPresetSiteId) ?? null,
    [patternPresetRows, selectedPatternPresetSiteId]
  );
  const teamCount = clampCount(Number(draft.teamCount), 2, 8);
  const cycleCount = clampCount(Number(draft.cycleCount), 1, 4);
  const teamLabels = useMemo(() => getTeamLabels(teamCount), [teamCount]);
  const cyclePreviews = useMemo(
    () =>
      normalizeList(draft.cycles, cycleCount, (index) => createInitialCycleDraft(`cycle-${index + 1}`, index)).map(
        (cycle, index) => {
          const shiftCount = clampCount(Number(cycle.shiftCount), 1, 6);
          const shiftLabels = getShiftLabels(shiftCount);
          const parsedPattern = parseCompressedShiftPatternString(
            cycle.patternString,
            shiftCount,
            shiftLabels
          );

          return {
            cycleKey: cycle.cycleKey || `cycle-${index + 1}`,
            name: cycle.name.trim() || `Cycle ${index + 1}`,
            shiftCount,
            patternString: parsedPattern.normalizedPattern,
            patternStartDate: cycle.patternStartDate || createDateInputValue(),
            breakMinutes: Number(cycle.breakMinutes) || 0,
            shiftTimes: normalizeList(cycle.shiftTimes, shiftCount, (itemIndex) => {
              const defaults = buildDefaultShiftTimes(shiftCount);
              return defaults[itemIndex] ?? "";
            }),
            teamIndexes: normalizeList(cycle.teamIndexes, teamCount, (itemIndex) => itemIndex),
            shiftLabels,
            cycleLabels: parsedPattern.cycleLabels,
            invalidTokens: parsedPattern.invalidTokens,
            shiftCards: shiftLabels.map((label, itemIndex) => ({
              label,
              timeRange:
                normalizeList(cycle.shiftTimes, shiftCount, (fallbackIndex) => {
                  const defaults = buildDefaultShiftTimes(shiftCount);
                  return defaults[fallbackIndex] ?? "";
                })[itemIndex] ?? "",
              breakMinutes: Number(cycle.breakMinutes) || 0
            }))
          } satisfies SiteCyclePreview;
        }
      ),
    [cycleCount, draft.cycles, teamCount]
  );
  const simulationAnchorDate = useMemo(() => {
    const dates = cyclePreviews
      .map((cycle) => cycle.patternStartDate)
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort();

    return dates[0] ?? createDateInputValue();
  }, [cyclePreviews]);
  const simulationMonths = useMemo(
    () => createSimulationMonthRange(simulationAnchorDate),
    [simulationAnchorDate]
  );
  const simulationMonth = simulationMonths[simulationMonthIndex] ?? simulationMonths[0];

  useEffect(() => {
    let active = true;

    const loadSimulationHolidayMap = async () => {
      const targetYears = Array.from(
        new Set(simulationMonths.map((item) => item.date.getFullYear()).filter(Number.isInteger))
      );

      if (targetYears.length === 0) {
        setSimulationHolidayNameByDate(new Map());
        return;
      }

      try {
        const results = await Promise.all(
          targetYears.map((year) => window.appBridge.listHolidayCalendars(year))
        );

        if (!active) {
          return;
        }

        const nextMap = new Map<string, string>();

        results.forEach((result) => {
          if (!result.ok) {
            return;
          }

          result.data.forEach((calendar) => {
            calendar.items.forEach((item) => {
              if (!nextMap.has(item.holidayDate)) {
                nextMap.set(item.holidayDate, item.name);
              }
            });
          });
        });

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
      buildSimulationCells(
        simulationMonth?.date ?? new Date(),
        teamLabels,
        draft.teamCycleAssignments,
        cyclePreviews,
        simulationHolidayNameByDate
      ),
    [
      cyclePreviews,
      draft.teamCycleAssignments,
      simulationHolidayNameByDate,
      simulationMonth?.date,
      teamLabels
    ]
  );
  const simulationMetrics = useMemo(
    () => buildSimulationMetrics(simulationCells, cyclePreviews),
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

  const activeTeamLabels = useMemo(() => {
    const baseLabels = draft.poolEnabled ? [...teamLabels, "Pool"] : teamLabels;
    const extraGroups = [
      ...employees
        .filter((employee) => employee.currentSiteId === draft.siteId && employee.currentShiftGroup)
        .map((employee) => normalizeTeamLabel(employee.currentShiftGroup))
        .filter((label): label is string => Boolean(label)),
      ...pendingAssignments.map((assignment) => assignment.teamLabel)
    ]
      .filter((group) => !baseLabels.includes(group));

    return extraGroups.length > 0 ? [...baseLabels, ...extraGroups] : baseLabels;
  }, [draft.poolEnabled, draft.siteId, employees, pendingAssignments, teamLabels]);

  const assignedByTeam = useMemo(() => {
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

      if (employee.currentSiteId !== draft.siteId) {
        return;
      }

      const key = normalizeTeamLabel(employee.currentShiftGroup) ?? activeTeamLabels[0] ?? "미지정";
      const current = grouped.get(key) ?? [];
      current.push(employee);
      grouped.set(key, current);
    });

    return grouped;
  }, [activeTeamLabels, draft.siteId, employees, pendingAssignmentMap]);

  const filteredPoolEmployees = useMemo(
    () =>
      employees
        .filter((employee) => !pendingAssignmentMap.has(employee.id))
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
    [deferredPoolKeyword, draft.siteId, employees, pendingAssignmentMap, poolScope]
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
    setShowDeleteConfirm(false);
    setShowPatternPresetModal(false);
    setSelectedPatternPresetSiteId("");
    setSimulationMonthIndex(0);
    setDraggingEmployeeId(null);
    setDraggingEmployeeSourceTeam(null);
    setIsTeamCapacityDirty(false);
    setPendingAssignments([]);
  };

  const openDetailModal = (row: SiteViewRow) => {
    setWorkflowSiteId(row.site.id);
    setDetailSiteId(row.site.id);
    setDetailSnapshot(row);
  };

  const closeDetailModal = () => {
    setDetailSiteId(null);
    setDetailSnapshot(null);
    setDeleteError(null);
    setShowDeleteConfirm(false);
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

  const getDraftValidationError = () => {
    if (!draft.siteCode.trim() || !draft.name.trim()) {
      return "근무지 코드와 근무지명은 필수입니다.";
    }

    if (cyclePreviews.some((cycle) => !cycle.patternStartDate)) {
      return "모든 Cycle의 패턴 시작일을 입력해야 합니다.";
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

    return null;
  };

  const validateDraftForm = () => {
    const validationError = getDraftValidationError();

    setFormError(validationError);

    return !validationError;
  };

  const buildCycleInputs = () =>
    cyclePreviews.map((cycle) => {
      const steps = buildShiftPatternStepsFromPatternString(
        cycle.shiftCount,
        cycle.shiftLabels,
        cycle.shiftTimes,
        cycle.breakMinutes,
        cycle.patternString
      );

      return {
        cycleKey: cycle.cycleKey,
        name: cycle.name,
        order: cyclePreviews.findIndex((item) => item.cycleKey === cycle.cycleKey),
        shiftCount: cycle.shiftCount,
        patternCode: buildPatternCode(steps),
        patternStartDate: cycle.patternStartDate,
        steps,
        teamIndexes: teamLabels
          .filter((_, index) => draft.teamCycleAssignments[index] === cycle.cycleKey)
          .map((teamLabel, index) => ({
            teamLabel,
            index:
              cycle.teamIndexes[teamLabels.indexOf(teamLabel)] ?? index
          }))
      } satisfies ShiftPatternCycleInput;
    });

  const ensureStepTwoPatternSaved = async () => {
    if (!isTeamCapacityDirty) {
      return true;
    }

    return persistDraft({ preserveAssignmentStartDate: true });
  };

  const openRegistration = (siteId?: string) => {
    resetRegistrationState();

    if (!siteId) {
      setDraft(createInitialDraft(buildNextAutoSiteCode(sites)));
      setAssignmentStartDate(createDateInputValue());
      setView("step1");
      return;
    }

    const targetRow = rows.find((row) => row.site.id === siteId);

    if (!targetRow) {
      return;
    }

    setWorkflowSiteId(targetRow.site.id);
    setDraft(buildDraftFromRow(targetRow));
    setAssignmentStartDate(targetRow.pattern?.patternStartDate ?? createDateInputValue());
    setView("step1");
  };

  const openRegistrationFromDetail = () => {
    if (!detailRow) {
      return;
    }

    resetRegistrationState();
    setWorkflowSiteId(detailRow.site.id);
    setDraft(buildDraftFromRow(detailRow));
    setAssignmentStartDate(detailRow.pattern?.patternStartDate ?? createDateInputValue());
    setView("step1");
  };

  const saveDraftToStorage = async (options?: { preserveAssignmentStartDate?: boolean }) => {
    const validationError = getDraftValidationError();

    setFormError(validationError);

    if (validationError) {
      return null;
    }

    setIsSavingDraft(true);

    try {
      const siteResult = await window.appBridge.saveSite({
        id: draft.siteId,
        siteCode: draft.siteCode.trim(),
        name: draft.name.trim(),
        status: draft.status,
        timezone: DEFAULT_SITE_TIMEZONE
      });

      if (!siteResult.ok) {
        setFormError(siteResult.message);
        return null;
      }

      const cycleInputs = buildCycleInputs();
      const primaryCycle = cycleInputs[0];

      if (!primaryCycle) {
        setFormError("저장할 Cycle 정보가 없습니다.");
        return null;
      }

      const patternResult = await window.appBridge.saveShiftPattern({
        id: draft.patternId,
        siteId: siteResult.data.id,
        name: `${siteResult.data.name} ${teamCount}조 / ${cycleCount}개 Cycle`,
        teamCount,
        patternCode: primaryCycle.patternCode,
        startIndexRule: "manual-seed",
        patternStartDate: primaryCycle.patternStartDate,
        status: "active",
        steps: primaryCycle.steps,
        teamIndexes: primaryCycle.teamIndexes,
        cycles: cycleInputs,
        teamCycleAssignments: teamLabels.map((teamLabel, index) => ({
          teamLabel,
          cycleKey: draft.teamCycleAssignments[index] ?? primaryCycle.cycleKey
        })) satisfies ShiftPatternTeamCycleAssignmentInput[],
        teamCapacities: teamLabels.map((teamLabel, index) => {
          const maxHeadcount = parseMaxHeadcount(draft.teamCapacities[index] ?? "");

          return typeof maxHeadcount === "number"
            ? { teamLabel, maxHeadcount }
            : { teamLabel };
        }),
        poolEnabled: draft.poolEnabled,
        poolStartTime: splitTimeRange(draft.poolTimeRange)?.startTime,
        poolEndTime: splitTimeRange(draft.poolTimeRange)?.endTime,
        poolBreakMinutes: Number(draft.poolBreakMinutes) || 0
      });

      if (!patternResult.ok) {
        setFormError(patternResult.message);
        return null;
      }

      setDraft((current) => ({
        ...current,
        siteId: siteResult.data.id,
        patternId: patternResult.data.id,
        siteCode: siteResult.data.siteCode,
        name: siteResult.data.name,
        status: siteResult.data.status
      }));
      setWorkflowSiteId(siteResult.data.id);
      if (!options?.preserveAssignmentStartDate) {
        setAssignmentStartDate(primaryCycle.patternStartDate ?? createDateInputValue());
      }
      setIsTeamCapacityDirty(false);
      setRefreshKey((current) => current + 1);

      return {
        site: siteResult.data,
        patternId: patternResult.data.id
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

  const openPatternPresetModal = () => {
    setSelectedPatternPresetSiteId(patternPresetRows[0]?.site.id ?? "");
    setShowPatternPresetModal(true);
  };

  const applyPatternPreset = () => {
    if (!selectedPatternPresetRow) {
      return;
    }

    const sourceDraft = buildDraftFromRow(selectedPatternPresetRow);

    setDraft((current) => ({
      ...sourceDraft,
      siteId: current.siteId,
      patternId: current.patternId,
      siteCode: current.siteCode,
      name: current.name,
      status: current.status
    }));
    setAssignmentStartDate(selectedPatternPresetRow.pattern?.patternStartDate ?? createDateInputValue());
    setFormError(null);
    setShowPatternPresetModal(false);
  };

  const handleDeleteSite = async () => {
    if (!detailRow) {
      return;
    }

    setDeleteError(null);
    setIsDeletingSite(true);

    try {
      const result = await window.appBridge.deleteSite({
        siteId: detailRow.site.id
      });

      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }

      shouldRestoreListFocusRef.current = true;
      setWorkflowSiteId("");
      setShowDeleteConfirm(false);
      setDetailSiteId(null);
      setDetailSnapshot(null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setIsDeletingSite(false);
    }
  };

  const handleCompleteStepTwo = async () => {
    setStepTwoError(null);
    setIsCompletingSite(true);

    try {
      let targetSiteId = draft.siteId;

      if (targetSiteId) {
        const stepTwoSaved = await ensureStepTwoPatternSaved();

        if (!stepTwoSaved) {
          return;
        }
      } else {
        const savedDraft = await saveDraftToStorage({ preserveAssignmentStartDate: true });

        if (!savedDraft) {
          return;
        }

        targetSiteId = savedDraft.site.id;
      }

      if (!targetSiteId) {
        return;
      }

      for (const assignment of pendingAssignments) {
        setAssigningEmployeeId(assignment.employeeId);

        const result = await window.appBridge.saveEmployeeAssignment({
          employeeId: assignment.employeeId,
          siteId: targetSiteId,
          shiftGroup: assignment.teamLabel,
          teamName: assignment.teamLabel,
          startDate: assignment.startDate
        });

        if (!result.ok) {
          setStepTwoError(result.message);
          return;
        }
      }

      setPendingAssignments([]);
      setRefreshKey((current) => current + 1);
      handleBackToList();
    } catch (error) {
      setStepTwoError(getErrorMessage(error));
    } finally {
      setAssigningEmployeeId(null);
      setIsCompletingSite(false);
    }
  };

  const handleAssignEmployee = async (employee: EmployeeRecord, targetTeam: string) => {
    if (!assignmentStartDate) {
      setStepTwoError("적용 일자를 입력해야 합니다.");
      return;
    }

    const currentDraftTeam =
      pendingAssignmentMap.get(employee.id)?.teamLabel ??
      (employee.currentSiteId === draft.siteId
        ? normalizeTeamLabel(employee.currentShiftGroup)
        : undefined);

    if (currentDraftTeam === targetTeam) {
      clearDraggingEmployee();
      return;
    }

    const maxHeadcount = configuredTeamCapacities.get(targetTeam);
    const occupiedCount = (assignedByTeam.get(targetTeam) ?? []).filter(
      (assignedEmployee) => assignedEmployee.id !== employee.id
    ).length;

    if (maxHeadcount && occupiedCount >= maxHeadcount) {
      setStepTwoError(`${targetTeam} 정원(${maxHeadcount}명)이 이미 가득 차 있습니다.`);
      clearDraggingEmployee();
      return;
    }

    const confirmed = window.confirm(
      `적용 일자가 ${assignmentStartDate}가 맞습니까?\n${employee.name}님을 ${targetTeam}로 배정하시겠습니까?`
    );

    if (!confirmed) {
      clearDraggingEmployee();
      return;
    }

    if (!draft.siteId) {
      setPendingAssignments((current) => [
        ...current.filter((item) => item.employeeId !== employee.id),
        { employeeId: employee.id, teamLabel: targetTeam, startDate: assignmentStartDate }
      ]);
      setStepTwoError(null);
      clearDraggingEmployee();
      return;
    }

    const stepTwoSaved = await ensureStepTwoPatternSaved();

    if (!stepTwoSaved) {
      clearDraggingEmployee();
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

      setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                currentSiteId: draft.siteId,
                currentSiteName:
                  sites.find((site) => site.id === draft.siteId)?.name ||
                  draft.name.trim() ||
                  item.currentSiteName,
                currentShiftGroup: normalizeTeamLabel(targetTeam) ?? targetTeam,
                currentAssignmentStartDate: assignmentStartDate,
                currentAssignmentEndDate: undefined
              }
            : item
        )
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setStepTwoError(getErrorMessage(error));
    } finally {
      setAssigningEmployeeId(null);
      clearDraggingEmployee();
    }
  };

  const handleUnassignEmployee = async (employee: EmployeeRecord) => {
    const currentDraftTeam =
      pendingAssignmentMap.get(employee.id)?.teamLabel ??
      (employee.currentSiteId === draft.siteId
        ? normalizeTeamLabel(employee.currentShiftGroup)
        : undefined);

    if (!currentDraftTeam) {
      clearDraggingEmployee();
      return;
    }

    if (!assignmentStartDate) {
      setStepTwoError("적용 일자를 입력해야 합니다.");
      clearDraggingEmployee();
      return;
    }

    const confirmed = window.confirm(
      `해제 일자가 ${assignmentStartDate}가 맞습니까?\n${employee.name}님의 ${currentDraftTeam} 배정을 해제하시겠습니까?`
    );

    if (!confirmed) {
      clearDraggingEmployee();
      return;
    }

    if (!draft.siteId) {
      setPendingAssignments((current) => current.filter((item) => item.employeeId !== employee.id));
      setStepTwoError(null);
      clearDraggingEmployee();
      return;
    }

    setAssigningEmployeeId(employee.id);

    try {
      const assignmentsResult = await window.appBridge.listEmployeeAssignments(employee.id);

      if (!assignmentsResult.ok) {
        setStepTwoError(assignmentsResult.message);
        return;
      }

      const activeAssignment = assignmentsResult.data.find(
        (assignment) => assignment.status === "active" && assignment.siteId === draft.siteId
      );

      if (!activeAssignment) {
        setStepTwoError("해제할 현재 배정 정보를 찾을 수 없습니다.");
        return;
      }

      if (assignmentStartDate < activeAssignment.startDate) {
        setStepTwoError("배정 해제일은 현재 배정 시작일 이후여야 합니다.");
        return;
      }

      const closeResult = await window.appBridge.closeEmployeeAssignment({
        assignmentId: activeAssignment.id,
        endDate: assignmentStartDate
      });

      if (!closeResult.ok) {
        setStepTwoError(closeResult.message);
        return;
      }

      setStepTwoError(null);
      setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                currentSiteId: undefined,
                currentSiteName: undefined,
                currentShiftGroup: undefined,
                currentAssignmentStartDate: undefined,
                currentAssignmentEndDate: assignmentStartDate
              }
            : item
        )
      );
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setStepTwoError(getErrorMessage(error));
    } finally {
      setAssigningEmployeeId(null);
      clearDraggingEmployee();
    }
  };

  if (view === "step2") {
    const cycleShiftCards = cyclePreviews.flatMap((cycle) =>
      cycle.shiftCards.map((card) => ({
        key: `${cycle.cycleKey}-${card.label}`,
        cycleName: cycle.name,
        tone: getShiftTone(card.label, cycle.shiftLabels),
        ...card
      }))
    );
    const stageLabel = draft.siteId ? "근무지 수정" : "근무지 등록";
    const teamColumns = activeTeamLabels.map((label) => {
      const assignedEmployees = assignedByTeam.get(label) ?? [];
      const isConfiguredTeam = teamLabels.includes(label);
      const maxHeadcount = configuredTeamCapacities.get(label);
      const occupiedCount = assignedEmployees.filter(
        (employee) => employee.id !== draggingEmployeeId
      ).length;

      return {
        label,
        displayLabel: label === "Pool" ? "Pool 근무" : label,
        assignedEmployees,
        isConfiguredTeam,
        isPoolGroup: label === "Pool",
        maxHeadcount,
        isAtCapacity: typeof maxHeadcount === "number" && occupiedCount >= maxHeadcount
      };
    });
    const assignedEmployeeCount = teamColumns.reduce(
      (sum, column) => sum + column.assignedEmployees.length,
      0
    );
    const configuredCapacityCount = teamColumns.filter(
      (column) => typeof column.maxHeadcount === "number"
    ).length;

    return (
      <div className="screen-stack">
        <section className="surface-card site-stage-header">
          <div className="stage-indicator-row">
            <span className="stage-chip done">1단계: 패턴 등록</span>
            <span className="stage-chip active">2단계: 조직 구성</span>
          </div>
          <div>
            <h3>{stageLabel} - 2단계: 조직 구성</h3>
            <p>{draft.name || "신규 근무지"}에 실제 인력을 배정하고 조별 현황을 확인합니다.</p>
          </div>
        </section>

        {stepTwoError ?? formError ? <p className="form-error-text">{stepTwoError ?? formError}</p> : null}

        <section className="site-step-summary-grid">
          <article className="surface-card site-step-summary-card emphasis">
            <span>배정 후보</span>
            <strong>{filteredPoolEmployees.length}명</strong>
            <em>현재 드래그 가능한 인력 수</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>배정 그룹</span>
            <strong>{teamColumns.length}개</strong>
            <em>{draft.poolEnabled ? "Pool 포함 구성" : "Cycle 배정 그룹 기준"}</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>현재 보드 인원</span>
            <strong>{assignedEmployeeCount}명</strong>
            <em>배정 보드에 보이는 총 인원</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>정원 설정</span>
            <strong>{configuredCapacityCount}개 조</strong>
            <em>적용 일자 {assignmentStartDate || "-"}</em>
          </article>
        </section>

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
                <span>적용 일자</span>
                <DateField
                  onChange={(value) => {
                    setAssignmentStartDate(value);
                  }}
                  value={assignmentStartDate}
                />
              </label>
            </div>
            <div className="assignment-date-card">
              <strong>드래그로 조 배정</strong>
              <span>후보 인력 카드나 배정된 인력 카드를 원하는 조 컬럼으로 옮기면 적용 일자 확인 후 반영됩니다.</span>
              <em>현재 적용 일자 {assignmentStartDate || "-"}</em>
              <em>배정된 인력 카드를 다시 이 후보 영역으로 드롭하면 배정이 해제됩니다.</em>
              {draft.poolEnabled ? <em>Pool 적용 시 `Pool 근무` 컬럼으로도 드래그 배정할 수 있습니다.</em> : null}
              {!draft.siteId ? <em>신규 등록은 완료 버튼을 눌러야 근무지와 배정 정보가 함께 저장됩니다.</em> : null}
            </div>
            <div
              className={draggingEmployeeSourceTeam ? "pool-list assignment-release-zone active" : "pool-list assignment-release-zone"}
              onDragOver={(event) => {
                handleAssignmentDragAutoScroll(event);

                if (!draggingEmployeeSourceTeam) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!draggingEmployeeSourceTeam) {
                  clearDraggingEmployee();
                  return;
                }

                event.preventDefault();
                const employeeId = event.dataTransfer.getData("text/plain") || draggingEmployeeId;

                if (!employeeId) {
                  clearDraggingEmployee();
                  return;
                }

                const employee = employees.find((item) => item.id === employeeId);

                if (!employee) {
                  clearDraggingEmployee();
                  return;
                }

                void handleUnassignEmployee(employee);
              }}
            >
              <div className="assignment-release-copy">
                <strong>배정 해제 드롭 영역</strong>
                <span>배정된 카드를 여기로 드롭하면 근무지 배정이 해제되고 후보 목록으로 돌아옵니다.</span>
              </div>
              {filteredPoolEmployees.length > 0 ? (
                filteredPoolEmployees.map((employee) => (
                  <div
                    className={
                      draggingEmployeeId === employee.id
                        ? "pool-item draggable dragging"
                        : "pool-item draggable"
                    }
                    draggable
                    key={employee.id}
                    onDragEnd={() => {
                      clearDraggingEmployee();
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", employee.id);
                      setDraggingEmployeeId(employee.id);
                      setDraggingEmployeeSourceTeam(null);
                    }}
                  >
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
                          ? `${employee.currentSiteName} / ${normalizeTeamLabel(employee.currentShiftGroup) ?? "미지정"}`
                          : "미배정"}
                      </em>
                      <div className="assignment-drag-hint">
                        <span>드래그해서 조 배정</span>
                        {assigningEmployeeId === employee.id ? <em>배정 중...</em> : null}
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

          <article className="surface-card assignment-board-card" onDragOver={handleAssignmentDragAutoScroll}>
            <div className="assignment-board-header">
              <div>
                <h3>조별 배정 보드</h3>
                <p>조별 정원을 입력한 뒤 인력 카드를 드래그해 배정합니다. 정원이 비어 있으면 제한 없이 배정됩니다.</p>
              </div>
              <div className="assignment-board-meta">
                <strong>{teamColumns.length}개 그룹</strong>
                <span>
                  {draft.siteId
                    ? "정원 변경 후 첫 배정 시 패턴 설정이 함께 저장됩니다."
                    : "신규 등록 단계에서는 조배정이 화면에만 반영되고 완료 시 한 번에 저장됩니다."}
                </span>
              </div>
            </div>
            <div className="assignment-board-columns">
              {teamColumns.map((column) => (
                <div
                  className={
                    draggingEmployeeId
                      ? column.isAtCapacity
                        ? "assignment-column active full"
                        : "assignment-column active"
                      : "assignment-column"
                  }
                  key={column.label}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const employeeId = event.dataTransfer.getData("text/plain") || draggingEmployeeId;

                    if (!employeeId) {
                      clearDraggingEmployee();
                      return;
                    }

                    const employee = employees.find((item) => item.id === employeeId);

                    if (!employee) {
                      clearDraggingEmployee();
                      return;
                    }

                    void handleAssignEmployee(employee, column.label);
                  }}
                >
                  <div className="assignment-column-head">
                    <div className="assignment-column-title">
                      <strong>{column.displayLabel}</strong>
                      <span>
                        {column.assignedEmployees.length}명
                        {typeof column.maxHeadcount === "number"
                          ? ` / 정원 ${column.maxHeadcount}명`
                          : " / 제한 없음"}
                      </span>
                    </div>
                    {column.isConfiguredTeam ? (
                      <label className="field compact-site-field assignment-capacity-field">
                        <span>정원 최대</span>
                        <input
                          min={1}
                          onChange={(event) => {
                            const targetIndex = teamLabels.indexOf(column.label);

                            if (targetIndex < 0) {
                              return;
                            }

                            handleTeamCapacityChange(targetIndex, event.target.value);
                          }}
                          placeholder="미입력 시 제한 없음"
                          type="number"
                          value={draft.teamCapacities[teamLabels.indexOf(column.label)] ?? ""}
                        />
                      </label>
                    ) : (
                      <div className="assignment-column-note">
                        {column.isPoolGroup ? "Pool 근무 별도 운영" : "기존 배정 그룹"}
                      </div>
                    )}
                  </div>
                  <div className="assignment-column-dropzone">
                    {column.assignedEmployees.length > 0 ? (
                      <div className="assigned-card-row assigned-card-row-column">
                        {column.assignedEmployees.map((employee) => (
                          <div
                            className={
                              draggingEmployeeId === employee.id
                                ? "assigned-member-card draggable dragging"
                                : "assigned-member-card draggable"
                            }
                            draggable
                            key={employee.id}
                            onDragEnd={() => {
                              clearDraggingEmployee();
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", employee.id);
                              setDraggingEmployeeId(employee.id);
                              setDraggingEmployeeSourceTeam(column.label);
                            }}
                          >
                            <span className="assigned-avatar">{employee.name.slice(0, 1)}</span>
                            <div>
                              <strong>{employee.name}</strong>
                              <span>{employee.employeeCode}</span>
                              <em className="assignment-card-meta">
                                {employee.employmentType}
                                {draggingEmployeeSourceTeam === column.label ? " / 이동 중" : ""}
                              </em>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="assignment-column-empty">
                        <strong>
                          {column.isPoolGroup
                            ? "Pool 근무 인력이 없습니다."
                            : `${column.displayLabel}에 배정된 인력이 없습니다.`}
                        </strong>
                        <span>좌측 후보 인력 카드를 이 영역으로 드롭하세요.</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="site-shift-summary-grid">
              {cycleShiftCards.map((card) => (
                <div className="site-shift-summary-card" key={card.key}>
                  <span>
                    {card.cycleName} · {card.label}
                  </span>
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
                disabled={isSavingDraft || isCompletingSite}
                onClick={() => {
                  if (!draft.siteId) {
                    validateDraftForm();
                    return;
                  }

                  void persistDraft({ preserveAssignmentStartDate: true });
                }}
                type="button"
              >
                {draft.siteId ? "패턴 다시 저장" : "입력 다시 검토"}
              </button>
              <button
                className="ghost-button"
                disabled={!draft.siteId || isSavingDraft || isCompletingSite}
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
                disabled={isSavingDraft || isCompletingSite}
                onClick={() => {
                  void handleCompleteStepTwo();
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
    const stageLabel = draft.siteId ? "근무지 수정" : "근무지 등록";
    const cycleDraftMap = new Map(draft.cycles.map((cycle) => [cycle.cycleKey, cycle]));
    const cycleAssignments = cyclePreviews.map((cycle) => ({
      cycle,
      draftCycle: cycleDraftMap.get(cycle.cycleKey) ?? createInitialCycleDraft(cycle.cycleKey, 0),
      teams: teamLabels.flatMap((teamLabel, index) =>
        draft.teamCycleAssignments[index] === cycle.cycleKey
          ? [{ teamLabel, teamIndex: index }]
          : []
      )
    }));
    const cycleShiftCards = cycleAssignments.flatMap(({ cycle }) =>
      cycle.shiftCards.map((card) => ({
        key: `${cycle.cycleKey}-${card.label}`,
        cycleName: cycle.name,
        tone: getShiftTone(card.label, cycle.shiftLabels),
        ...card
      }))
    );
    const invalidCycleMessages = cycleAssignments.flatMap(({ cycle }) =>
      cycle.invalidTokens.length > 0
        ? [
            `${cycle.name}: ${Array.from(new Set(cycle.invalidTokens)).join(", ")}`
          ]
        : []
    );
    const assignedTeamCount = cycleAssignments.reduce((sum, { teams }) => sum + teams.length, 0);
    const activeCycleCount = cycleAssignments.filter(({ teams }) => teams.length > 0).length;

    return (
      <div className="screen-stack">
        <section className="surface-card site-stage-header">
          <div className="stage-indicator-row">
            <span className="stage-chip active">1단계: 패턴 등록</span>
            <span className="stage-chip">2단계: 조직 구성</span>
          </div>
          <div>
            <h3>{stageLabel} - 1단계: 패턴 등록</h3>
            <p>근무지 기본 정보, Cycle 구성, Pool 기준을 저장하고 우측 시뮬레이션으로 바로 검토합니다.</p>
          </div>
        </section>

        {formError ? <p className="form-error-text">{formError}</p> : null}

        <section className="site-step-summary-grid">
          <article className="surface-card site-step-summary-card emphasis">
            <span>운영 구조</span>
            <strong>
              {teamCount}조 / {cycleCount}개 Cycle
            </strong>
            <em>{draft.name.trim() || "신규 근무지 설정 중"}</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>조 배정 현황</span>
            <strong>{assignedTeamCount}개 조</strong>
            <em>{activeCycleCount}개 Cycle에 배정됨</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>Pool 운영</span>
            <strong>{draft.poolEnabled ? "적용" : "미적용"}</strong>
            <em>
              {draft.poolEnabled
                ? `${draft.poolTimeRange} / 휴게 ${draft.poolBreakMinutes}분`
                : "패턴 회전 대상만 구성"}
            </em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>시뮬레이션 기준</span>
            <strong>{simulationAnchorDate}</strong>
            <em>{simulationMonth ? formatMonthLabel(simulationMonth.date) : "-"}</em>
          </article>
        </section>

        <section className="site-step-one-layout">
          <article className="surface-card site-form-panel">
            <div className="site-form-header">
              <div>
                <h3>기본 정보 및 패턴 설정</h3>
                <p>Cycle 단위로 패턴을 나누고, 각 조가 어느 Cycle을 따르는지 배정한 뒤 우측 달력으로 확인합니다.</p>
              </div>
              <div className="site-form-header-actions">
                <button
                  className="ghost-button compact-button"
                  disabled={patternPresetRows.length === 0}
                  onClick={openPatternPresetModal}
                  type="button"
                >
                  패턴 및 설정정보 불러오기
                </button>
                <div className="site-form-badge-row">
                  <span className="site-stage-badge">{draft.siteCode || "자동 코드"}</span>
                  <span className="site-stage-badge neutral">{teamCount}조 / {cycleCount}개 Cycle</span>
                  {draft.poolEnabled ? <span className="site-stage-badge neutral">Pool 적용</span> : null}
                </div>
              </div>
            </div>

            <div className="site-form-overview-grid">
              <div className="site-config-section">
                <div className="site-section-header-inline">
                  <strong className="site-config-title">기본 정보</strong>
                  <span className="site-field-note">코드와 상태는 근무지 기본값으로 사용됩니다.</span>
                </div>
                <div className="site-registration-grid site-registration-grid-stacked">
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
              </div>

              <div className="site-config-section">
                <div className="site-section-header-inline">
                  <strong className="site-config-title">운영 구조</strong>
                  <span className="site-field-note">Pool은 달력, 패턴 회전, 근무표 생성 대상에서 제외됩니다.</span>
                </div>
                <div className="site-topology-grid site-topology-grid-primary">
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
                    <span>Cycle 수</span>
                    <input
                      max={4}
                      min={1}
                      onChange={(event) => {
                        handleDraftChange("cycleCount", event.target.value);
                      }}
                      type="number"
                      value={draft.cycleCount}
                    />
                  </label>
                  <div className="site-worktype-card compact">
                    <span>근무유형</span>
                    <strong>
                      {teamCount}조 / {cycleCount}개 Cycle
                    </strong>
                  </div>
                </div>
                <label className="field site-toggle-field">
                  <span>Pool 적용 유무</span>
                  <span className="site-checkbox-row">
                    <input
                      checked={draft.poolEnabled}
                      onChange={(event) => {
                        handleDraftChange("poolEnabled", event.target.checked);
                      }}
                      type="checkbox"
                    />
                    <strong>{draft.poolEnabled ? "적용" : "미적용"}</strong>
                    <em className="site-field-note">Pool은 별도 시간만 관리하고 패턴 String에는 포함하지 않습니다.</em>
                  </span>
                </label>
              </div>
            </div>

            <div className="site-config-section">
              <strong className="site-config-title">Cycle 배정</strong>
              <p className="site-config-copy">
                각 조 칩을 원하는 Cycle 카드로 드래그해 배정합니다. 조는 하나의 Cycle에만 속할 수 있습니다.
              </p>
              <div className="site-cycle-assignment-grid">
                {cycleAssignments.map(({ cycle, teams }) => (
                  <div
                    className={
                      draggingTeamLabel
                        ? "site-cycle-assignment-card active"
                        : "site-cycle-assignment-card"
                    }
                    key={cycle.cycleKey}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();

                      if (!draggingTeamLabel) {
                        return;
                      }

                      handleAssignTeamToCycle(draggingTeamLabel, cycle.cycleKey);
                      setDraggingTeamLabel(null);
                    }}
                  >
                    <div className="site-cycle-assignment-head">
                      <div>
                        <strong>{cycle.name}</strong>
                        <span>{teams.length}개 조 배정</span>
                      </div>
                      <em>{cycle.patternString || "패턴 대기"}</em>
                    </div>
                    <div className="site-cycle-team-list">
                      {teams.length > 0 ? (
                        teams.map(({ teamLabel }) => (
                          <button
                            className={
                              draggingTeamLabel === teamLabel
                                ? "site-cycle-team-chip dragging"
                                : "site-cycle-team-chip"
                            }
                            draggable
                            key={`${cycle.cycleKey}-${teamLabel}`}
                            onDragEnd={() => {
                              setDraggingTeamLabel(null);
                            }}
                            onDragStart={() => {
                              setDraggingTeamLabel(teamLabel);
                            }}
                            type="button"
                          >
                            {teamLabel}
                          </button>
                        ))
                      ) : (
                        <span className="site-cycle-assignment-empty">배정된 조 없음</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {draft.poolEnabled ? (
              <div className="site-config-section">
                <div className="site-section-header-inline">
                  <strong className="site-config-title">Pool 설정</strong>
                  <span className="site-field-note">Pool은 근무시간만 산출하고 달력에는 반영하지 않습니다.</span>
                </div>
                <div className="site-topology-grid site-topology-grid-pool">
                  <label className="field compact-site-field">
                    <span>Pool 근무시간</span>
                    <SiteTimeRangePicker
                      fallbackValue="09:00 - 18:00"
                      onChange={(value) => {
                        handleDraftChange("poolTimeRange", value);
                      }}
                      value={draft.poolTimeRange}
                    />
                  </label>
                  <label className="field compact-site-field">
                    <span>Pool 휴게시간(분)</span>
                    <input
                      min={0}
                      onChange={(event) => {
                        handleDraftChange("poolBreakMinutes", event.target.value);
                      }}
                      type="number"
                      value={draft.poolBreakMinutes}
                    />
                  </label>
                  <div className="site-worktype-card compact">
                    <span>Pool 실근무시간</span>
                    <strong>
                      {poolDailyHours.toLocaleString("ko-KR", {
                        minimumFractionDigits: poolDailyHours % 1 === 0 ? 0 : 1,
                        maximumFractionDigits: 1
                      })}
                      시간
                    </strong>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="site-cycle-editor-stack">
              {cycleAssignments.map(({ cycle, draftCycle, teams }) => (
                <div className="site-config-section site-cycle-config-section" key={cycle.cycleKey}>
                  <div className="site-cycle-config-head">
                    <div>
                      <strong className="site-config-title">{cycle.name} 설정</strong>
                      <p className="site-config-copy">
                        {teams.length > 0
                          ? `배정 조: ${teams.map((team) => team.teamLabel).join(", ")}`
                          : "배정된 조가 아직 없습니다."}
                      </p>
                    </div>
                    <span className="site-stage-badge neutral">
                      {cycle.shiftCount}교대 / {Math.max(cycle.cycleLabels.length, 1)}일
                    </span>
                  </div>
                  <div className="site-cycle-config-layout is-balanced">
                    <div className="site-cycle-config-main-panel">
                      <div className="site-cycle-top-grid">
                        <label className="field compact-site-field">
                          <span>Cycle 이름</span>
                          <input
                            onChange={(event) => {
                              handleCycleDraftChange(cycle.cycleKey, "name", event.target.value);
                            }}
                            value={draftCycle.name}
                          />
                        </label>
                        <label className="field compact-site-field">
                          <span>교대 수</span>
                          <input
                            max={6}
                            min={1}
                            onChange={(event) => {
                              handleCycleDraftChange(cycle.cycleKey, "shiftCount", event.target.value);
                            }}
                            type="number"
                            value={draftCycle.shiftCount}
                          />
                        </label>
                        <label className="field compact-site-field">
                          <span>패턴 시작일</span>
                          <DateField
                            onChange={(value) => {
                              handleCycleDraftChange(
                                cycle.cycleKey,
                                "patternStartDate",
                                value
                              );
                            }}
                            value={draftCycle.patternStartDate}
                          />
                        </label>
                        <label className="field compact-site-field">
                          <span>휴게시간(분)</span>
                          <input
                            min={0}
                            onChange={(event) => {
                              handleCycleDraftChange(cycle.cycleKey, "breakMinutes", event.target.value);
                            }}
                            type="number"
                            value={draftCycle.breakMinutes}
                          />
                        </label>
                      </div>
                      <div className="site-pattern-string-card">
                        <span>{cycle.name} 패턴 String</span>
                        <input
                          onChange={(event) => {
                            handleCycleDraftChange(cycle.cycleKey, "patternString", event.target.value);
                          }}
                          placeholder={getPatternStringPlaceholder(cycle.shiftCount)}
                          value={draftCycle.patternString}
                        />
                        <em className="site-field-note">
                          {getPatternStringNote(cycle.shiftCount)}
                        </em>
                      </div>
                      <div className="site-time-grid">
                        {cycle.shiftLabels.map((label, index) => (
                          <label className="field compact-site-field" key={`${cycle.cycleKey}-${label}`}>
                            <span>{label} 근무시간</span>
                            <SiteTimeRangePicker
                              fallbackValue={cycle.shiftTimes[index] ?? presetTimeRanges[index] ?? "09:00 - 17:00"}
                              onChange={(value) => {
                                handleCycleShiftTimeChange(cycle.cycleKey, index, value);
                              }}
                              value={draftCycle.shiftTimes[index] ?? cycle.shiftTimes[index] ?? ""}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="site-config-section site-cycle-index-panel compact">
                      <strong className="site-config-title">조별 Index</strong>
                      <p className="site-config-copy">
                        현재 입력 범위: 0 ~ {Math.max(cycle.cycleLabels.length - 1, 0)}
                      </p>
                      <div className="site-index-grid">
                        {teams.length > 0 ? (
                          teams.map(({ teamLabel, teamIndex }) => (
                            <label
                              className="field compact-site-field site-index-field"
                              key={`${cycle.cycleKey}-${teamLabel}`}
                            >
                              <span>{teamLabel} Index</span>
                              <input
                                max={Math.max(cycle.cycleLabels.length - 1, 0)}
                                min={0}
                                onChange={(event) => {
                                  handleCycleTeamIndexChange(
                                    cycle.cycleKey,
                                    teamIndex,
                                    event.target.value
                                  );
                                }}
                                type="number"
                                value={draftCycle.teamIndexes[teamIndex] ?? teamIndex}
                              />
                            </label>
                          ))
                        ) : (
                          <div className="site-empty-state">
                            <strong>이 Cycle에 배정된 조가 없습니다.</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-card simulation-panel site-simulation-panel site-simulation-panel-expanded">
            <div className="site-simulation-header">
              <div>
                <h3>월간 달력 시뮬레이션</h3>
                <p>Cycle별 패턴 시작일과 조별 Index 기준으로 이번 달 순환 배치를 미리 확인합니다.</p>
              </div>
              <div className="site-simulation-headline">
                <strong>{simulationMonth ? formatMonthLabel(simulationMonth.date) : "-"}</strong>
                <span>기준일 {simulationAnchorDate}</span>
              </div>
            </div>
            <div className="site-cycle-legend-grid">
              {cycleAssignments.map(({ cycle, teams }) => (
                <div className="site-cycle-legend-card" key={`legend-${cycle.cycleKey}`}>
                  <strong>{cycle.name}</strong>
                  <span>{cycle.patternString || "패턴 대기"}</span>
                  <em>
                    {teams.length > 0
                      ? `${teams.map((team) => team.teamLabel).join(", ")} 배정`
                      : "배정 조 없음"}
                  </em>
                </div>
              ))}
            </div>
            {invalidCycleMessages.length > 0 ? (
              <div className="site-cycle-error-stack">
                {invalidCycleMessages.map((message) => (
                  <p className="form-error-text" key={message}>
                    패턴String 오류: {message}
                  </p>
                ))}
              </div>
            ) : null}
            {draft.poolEnabled ? (
              <div className="site-pool-summary-card">
                <strong>Pool 별도 운영</strong>
                <span>{draft.poolTimeRange}</span>
                <em>휴게 {draft.poolBreakMinutes}분 / 일 {poolDailyHours.toFixed(1)}시간</em>
              </div>
            ) : null}
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
              {cycleShiftCards.map((card) => (
                <span className={`legend-item ${card.tone}`} key={`legend-item-${card.key}`}>
                  {card.cycleName} · {card.label}
                </span>
              ))}
              <span className="legend-item muted">휴무</span>
            </div>
            <div className="site-calendar-head">
              {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="site-calendar-grid">
              {simulationCells.map((cell) => (
                <div
                  className={
                    [
                      "site-calendar-cell",
                      cell.isCurrentMonth ? "" : "muted",
                      cell.isToday ? "current" : "",
                      cell.isHoliday ? "holiday" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  key={cell.key}
                >
                  <div className="site-calendar-top">
                    <strong className={cell.isHoliday ? "site-calendar-date holiday" : "site-calendar-date"}>
                      {cell.dayLabel}
                    </strong>
                    {cell.isToday ? <span className="site-calendar-today">오늘</span> : null}
                  </div>
                  {cell.holidayName ? (
                    <span
                      className={`site-calendar-holiday ${getHolidayNameSizeClass(cell.holidayName)}`}
                      title={`${cell.date} · ${cell.holidayName}`}
                    >
                      {cell.holidayName}
                    </span>
                  ) : null}
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
              {cycleShiftCards.map((card) => (
                <div className="site-shift-summary-card" key={card.key}>
                  <span>
                    {card.cycleName} · {card.label}
                  </span>
                  <strong>{card.timeRange}</strong>
                  <em>휴게 {card.breakMinutes}분</em>
                </div>
              ))}
            </div>
            <div className="site-cycle-metric-stack">
              {simulationMetrics.map((metricGroup) => (
                <div className="site-cycle-metric-card" key={metricGroup.cycleKey}>
                  <div className="site-cycle-metric-head">
                    <strong>{metricGroup.cycleName}</strong>
                    <span>1인 기준</span>
                  </div>
                  <div className="site-summary-strip site-summary-strip-wide">
                    {metricGroup.items.map((item) => (
                      <div className="site-summary-box" key={`${metricGroup.cycleKey}-${item.label}`}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        {item.note ? <em>{item.note}</em> : null}
                      </div>
                    ))}
                  </div>
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
                handleBackToList();
              }}
              type="button"
            >
              뒤로가기
            </button>
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isSavingDraft || isCompletingSite}
                onClick={() => {
                  if (draft.siteId) {
                    void persistDraft();
                    return;
                  }

                  validateDraftForm();
                }}
                type="button"
              >
                {draft.siteId ? "적용" : "입력 검토"}
              </button>
              <button
                className="primary-button"
                disabled={isSavingDraft || isCompletingSite}
                onClick={() => {
                  void (async () => {
                    if (!draft.siteId) {
                      if (validateDraftForm()) {
                        setView("step2");
                      }

                      return;
                    }

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

        {showPatternPresetModal ? (
          <div className="modal-overlay">
            <div aria-modal="true" className="modal-card site-preset-modal" role="dialog">
              <div className="section-heading compact-heading">
                <div className="modal-heading-copy">
                  <h3>패턴 및 설정정보 불러오기</h3>
                  <p>선택한 근무지의 운영 구조, Cycle 구성, Pool 설정을 현재 편집 중인 근무지에 적용합니다.</p>
                </div>
              </div>
              <label className="field workforce-select-field">
                <span>근무지명</span>
                <FormSelect
                  className="workforce-select-shell"
                  onChange={(event) => {
                    setSelectedPatternPresetSiteId(event.target.value);
                  }}
                  selectClassName="workforce-modern-select"
                  value={selectedPatternPresetSiteId}
                >
                  {patternPresetRows.map((row) => (
                    <option key={row.site.id} value={row.site.id}>
                      {row.site.name}
                    </option>
                  ))}
                </FormSelect>
              </label>
              <p className="site-field-note">
                근무지 코드, 근무지명, 상태는 현재 값이 유지되고 패턴 관련 설정만 덮어씁니다.
              </p>
              <div className="button-row">
                <button
                  className="primary-button"
                  disabled={!selectedPatternPresetRow}
                  onClick={applyPatternPreset}
                  type="button"
                >
                  불러오기
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setShowPatternPresetModal(false);
                  }}
                  type="button"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="screen-stack">
      <section className="surface-card site-list-shell" ref={listSectionRef}>
        <div className="section-heading compact-heading">
          <div>
            <h3 ref={listHeadingRef} tabIndex={-1}>
              근무지 관리
            </h3>
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

        <section className="site-step-summary-grid">
          <article className="surface-card site-step-summary-card emphasis">
            <span>등록 근무지</span>
            <strong>{siteListSummary.totalSites}개</strong>
            <em>저장된 근무지 전체</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>운영중 근무지</span>
            <strong>{siteListSummary.activeSites}개</strong>
            <em>현재 활성 상태 기준</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>Pool 운영</span>
            <strong>{siteListSummary.poolSites}개</strong>
            <em>Pool 별도 운영 포함</em>
          </article>
          <article className="surface-card site-step-summary-card">
            <span>배정 인원</span>
            <strong>{siteListSummary.assignedEmployees}명</strong>
            <em>목록에 표시되는 총 배정 수</em>
          </article>
        </section>

        <div className="data-scroll">
          <table className="info-table site-list-table">
            <colgroup>
              <col className="site-list-col-site" />
              <col className="site-list-col-pattern" />
              <col className="site-list-col-structure" />
              <col className="site-list-col-teams" />
              <col className="site-list-col-status" />
              <col className="site-list-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>근무지</th>
                <th>Cycle · 패턴</th>
                <th>운영 구조</th>
                <th>조 현황</th>
                <th>상태</th>
                <th>액션</th>
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
                    <td className="site-site-cell">
                      <div className="site-list-primary">
                        <strong>{row.site.name}</strong>
                        <span>{row.site.siteCode}</span>
                      </div>
                    </td>
                    <td className="site-pattern-cell">
                      <div className="site-cycle-summary-list">
                        {row.cycleSummaries.length > 0 ? (
                          row.cycleSummaries.map((cycle) => (
                            <div className="site-cycle-summary-item" key={`${row.site.id}-${cycle.cycleKey}`}>
                              <strong>{cycle.name}</strong>
                              <span title={cycle.patternString}>{truncatePatternSummary(cycle.patternString)}</span>
                              <em>시작일 {cycle.patternStartDate ?? "-"}</em>
                            </div>
                          ))
                        ) : (
                          <div className="site-pattern-empty">
                            <strong>등록된 Cycle이 없습니다.</strong>
                            <span>패턴을 먼저 등록해야 합니다.</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="site-worktype-cell">
                      <div className="site-list-structure">
                        <strong>{row.workType}</strong>
                        <span>
                          {row.shiftDefinitions.length > 0
                            ? `${row.shiftDefinitions.length}개 근무시간 세트`
                            : "근무시간 미등록"}
                        </span>
                        {row.shiftDefinitions.slice(0, 2).map((definition) => (
                          <em key={`${row.site.id}-${definition.cycleName ?? "default"}-${definition.label}`}>
                            {definition.cycleName ? `${definition.cycleName} · ` : ""}
                            {definition.label} {definition.timeRange}
                          </em>
                        ))}
                      </div>
                    </td>
                    <td className="site-team-cell">
                      {row.teamStatusItems.length > 0 ? (
                        <div className="site-team-stack">
                          <span className="site-team-total">
                            총 {row.teamStatusItems.reduce((sum, item) => sum + item.headcount, 0)}명 배정
                          </span>
                          <div className="site-team-summary">
                            {row.teamStatusItems.map((item) => (
                              <span className="site-team-chip" key={`${row.site.id}-${item.label}`}>
                                <em>{item.label}</em>
                                <strong>{item.headcount}명</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="site-team-empty">배정 인력 없음</span>
                      )}
                    </td>
                    <td className="site-status-cell">
                      <div className="site-status-stack">
                        <span className={row.site.status === "active" ? "pill info" : "pill neutral"}>
                          {row.site.status === "active" ? "운영중" : "중지"}
                        </span>
                        <em>{row.poolEnabled ? "Pool 운영" : "Pool 없음"}</em>
                      </div>
                    </td>
                    <td className="site-action-cell">
                      <div className="site-action-stack">
                        <button
                          className="icon-button"
                          onClick={() => {
                            openDetailModal(row);
                          }}
                          type="button"
                        >
                          상세 보기
                        </button>
                        <span>Cycle {row.cycleSummaries.length}개</span>
                      </div>
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
          <div aria-modal="true" className="modal-card site-detail-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>{detailRow.site.name}</h3>
                <p>저장된 근무지, Cycle 구성, 근무시간, 조별 Index와 현재 배정 현황입니다.</p>
              </div>
              <div className="button-row">
                <button
                  className="danger-button compact-button"
                  onClick={() => {
                    setDeleteError(null);
                    setShowDeleteConfirm(true);
                  }}
                  type="button"
                >
                  근무지 삭제
                </button>
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
                    openRegistrationFromDetail();
                  }}
                  type="button"
                >
                  수정
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() => {
                    closeDetailModal();
                  }}
                  type="button"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="site-detail-summary-grid">
              <div className="site-detail-section">
                <span>근무지 코드</span>
                <strong>{detailRow.site.siteCode}</strong>
              </div>
              <div className="site-detail-section">
                <span>운영 상태</span>
                <strong>{detailRow.site.status === "active" ? "운영중" : "중지"}</strong>
              </div>
              <div className="site-detail-section">
                <span>근무유형</span>
                <strong>{detailRow.workType}</strong>
              </div>
              <div className="site-detail-section">
                <span>전체 배정 인원</span>
                <strong>{detailTotalAssignedHeadcount}명</strong>
                <em>{detailCycleCards.length}개 Cycle 기준</em>
              </div>
              <div className="site-detail-section site-detail-team-summary-section">
                <span>현재 조별 배정 현황</span>
                <div className="site-detail-team-chip-row">
                  {detailRow.teamStatusItems.map((item) => (
                    <span className="site-team-chip" key={`detail-${item.label}`}>
                      <em>{item.label}</em>
                      <strong>{item.headcount}명</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="site-detail-cycle-stack">
              {detailCycleCards.length > 0 ? (
                detailCycleCards.map((cycle) => (
                  <section className="site-detail-cycle-card" key={cycle.cycleKey}>
                    <div className="site-detail-cycle-head">
                      <div>
                        <strong>{cycle.name}</strong>
                        <p>{cycle.patternString}</p>
                      </div>
                      <div className="site-detail-cycle-meta">
                        <span>패턴 시작일 {cycle.patternStartDate}</span>
                        <span>{cycle.shiftCount}교대 / {cycle.cycleLength}일 Cycle</span>
                      </div>
                    </div>
                    <div className="site-detail-shift-grid">
                      {cycle.shiftDefinitions.length > 0 ? (
                        cycle.shiftDefinitions.map((definition) => (
                          <div
                            className="site-detail-section"
                            key={`${cycle.cycleKey}-${definition.dutyCode}`}
                          >
                            <span>
                              {cycle.name} · {definition.label} 근무시간
                            </span>
                            <strong>{definition.timeRange}</strong>
                            <em>휴게 {definition.breakMinutes}분</em>
                          </div>
                        ))
                      ) : (
                        <div className="site-detail-section">
                          <span>{cycle.name}</span>
                          <strong>등록된 근무시간이 없습니다.</strong>
                        </div>
                      )}
                    </div>
                    <div className="site-detail-team-grid">
                      {cycle.teams.length > 0 ? (
                        cycle.teams.map((team) => (
                          <div className="site-detail-section" key={`${cycle.cycleKey}-${team.teamLabel}`}>
                            <span>
                              {cycle.name} · {team.teamLabel}
                            </span>
                            <strong>조별 Index {team.teamIndex}</strong>
                            <em>
                              현재 {team.headcount}명
                              {typeof team.maxHeadcount === "number"
                                ? ` / 정원 ${team.maxHeadcount}명`
                                : " / 정원 제한 없음"}
                            </em>
                          </div>
                        ))
                      ) : (
                        <div className="site-detail-section">
                          <span>{cycle.name}</span>
                          <strong>이 Cycle에 편성된 조가 없습니다.</strong>
                        </div>
                      )}
                    </div>
                  </section>
                ))
              ) : (
                <div className="site-detail-section">
                  <span>패턴 상태</span>
                  <strong>등록된 패턴이 없습니다.</strong>
                </div>
              )}
              {detailRow.pattern?.poolEnabled ? (
                <section className="site-detail-cycle-card pool">
                  <div className="site-detail-cycle-head">
                    <div>
                      <strong>Pool 운영</strong>
                      <p>Pool은 달력 패턴에 포함되지 않고 별도 근무시간만 산출합니다.</p>
                    </div>
                    <div className="site-detail-cycle-meta">
                      <span>
                        근무시간 {detailRow.pattern.poolStartTime ?? "-"} - {detailRow.pattern.poolEndTime ?? "-"}
                      </span>
                      <span>휴게 {detailRow.pattern.poolBreakMinutes ?? 0}분</span>
                    </div>
                  </div>
                </section>
              ) : null}
              {detailTeamIndexes.length > 0 ? (
                <div className="site-index-status-grid">
                  {detailTeamIndexes.map((item) => (
                    <div className="site-detail-section" key={`summary-${item.teamLabel}`}>
                      <span>{item.teamLabel} 전체 Index 요약</span>
                      <strong>{item.index}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {detailRow && showDeleteConfirm ? (
        <div className="modal-overlay">
          <div aria-modal="true" className="modal-card site-delete-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>근무지 삭제</h3>
                <p>근무지 삭제를 할 경우 영구 삭제됩니다. 괜찮으시겠습니까?</p>
              </div>
            </div>
            <div className="site-delete-warning-box">
              <strong>{detailRow.site.name}</strong>
              <span>이미 실적에 반영된 데이터와 이력은 보존되고, 근무지 목록에서만 제거됩니다.</span>
            </div>
            {deleteError ? <p className="form-error-text">{deleteError}</p> : null}
            <div className="button-row">
              <button
                className="danger-button"
                disabled={isDeletingSite}
                onClick={() => {
                  void handleDeleteSite();
                }}
                type="button"
              >
                {isDeletingSite ? "삭제 중..." : "확인"}
              </button>
              <button
                className="ghost-button"
                disabled={isDeletingSite}
                onClick={() => {
                  setShowDeleteConfirm(false);
                }}
                type="button"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
