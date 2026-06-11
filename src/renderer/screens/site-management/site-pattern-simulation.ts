import { calculateDurationMinutes } from "../../../shared/domain/calculation";

import type {
  SitePatternCyclePreviewLike,
  SitePatternSimulationMonth
} from "./site-management-selectors";

export interface SitePatternSimulationAssignment {
  cycleKey: string;
  cycleName: string;
  dutyLabel: string;
  teamLabel: string;
  tone: string;
}

export interface SitePatternSimulationCell {
  assignments: SitePatternSimulationAssignment[];
  date: string;
  dayLabel: string;
  holidayName?: string;
  isCurrentMonth: boolean;
  isHoliday: boolean;
  isToday: boolean;
  key: string;
}

export interface SitePatternSimulationMetricItem {
  label: string;
  note?: string;
  value: string;
}

export interface SitePatternSimulationMetricGroup {
  cycleKey: string;
  cycleName: string;
  items: SitePatternSimulationMetricItem[];
}

interface HolidayCalendarItemLike {
  holidayDate: string;
  name: string;
}

interface HolidayCalendarLike {
  items: HolidayCalendarItemLike[];
}

interface HolidayCalendarResultLike {
  data?: HolidayCalendarLike[];
  ok: boolean;
}

const parseClockTime = (value: string) => {
  const matched = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!matched) {
    return null;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return {
    hour: String(hour).padStart(2, "0"),
    minute: String(minute).padStart(2, "0")
  };
};

const buildTimeValue = (hour: string, minute: string) => `${hour}:${minute}`;

export const splitTimeRange = (value: string) => {
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
    endTime: buildTimeValue(endTime.hour, endTime.minute),
    startTime: buildTimeValue(startTime.hour, startTime.minute)
  };
};

const createDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const getDateDifferenceInDays = (left: string, right: string) => {
  const leftDate = new Date(`${left}T00:00:00`);
  const rightDate = new Date(`${right}T00:00:00`);
  const leftUtc = Date.UTC(leftDate.getFullYear(), leftDate.getMonth(), leftDate.getDate());
  const rightUtc = Date.UTC(rightDate.getFullYear(), rightDate.getMonth(), rightDate.getDate());

  return Math.round((rightUtc - leftUtc) / (24 * 60 * 60 * 1000));
};

const formatSimulationHours = (hours: number, minimumFractionDigits = 0) =>
  hours.toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
    minimumFractionDigits
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

export const calculateWorkingHours = (timeRange: string, breakMinutes: number) =>
  resolveWorkingHourSummary(timeRange, breakMinutes).actualMinutes / 60;

export const buildSimulationHolidayYears = (simulationMonths: SitePatternSimulationMonth[]) =>
  Array.from(
    new Set(simulationMonths.map((item) => item.date.getFullYear()).filter(Number.isInteger))
  );

export const loadSiteSimulationHolidayMap = async ({
  listHolidayCalendars,
  simulationMonths
}: {
  listHolidayCalendars: (year?: number) => Promise<HolidayCalendarResultLike>;
  simulationMonths: SitePatternSimulationMonth[];
}) => {
  const targetYears = buildSimulationHolidayYears(simulationMonths);

  if (targetYears.length === 0) {
    return new Map<string, string>();
  }

  const results = await Promise.all(targetYears.map((year) => listHolidayCalendars(year)));
  const nextMap = new Map<string, string>();

  results.forEach((result) => {
    if (!result.ok || !result.data) {
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

  return nextMap;
};

export const buildSiteSimulationCells = ({
  cyclePreviews,
  fallbackDate,
  getShiftTone,
  holidayNameByDate,
  monthDate,
  teamCycleAssignments,
  teamLabels
}: {
  cyclePreviews: SitePatternCyclePreviewLike[];
  fallbackDate: string;
  getShiftTone: (label: string, shiftLabels: string[]) => string;
  holidayNameByDate: Map<string, string>;
  monthDate: Date;
  teamCycleAssignments: string[];
  teamLabels: string[];
}): SitePatternSimulationCell[] => {
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
          cycleKey: assignedCycleKey,
          cycleName: "미지정",
          dutyLabel: "휴무",
          teamLabel,
          tone: "off"
        };
      }

      const cycleLabels = cyclePreview.cycleLabels.length > 0 ? cyclePreview.cycleLabels : ["휴무"];
      const dateOffset = getDateDifferenceInDays(
        cyclePreview.patternStartDate || fallbackDate,
        currentDateValue
      );
      const startIndex = cyclePreview.teamIndexes[teamIndexPosition] ?? teamIndexPosition;
      const cycleIndex =
        ((dateOffset + startIndex) % cycleLabels.length + cycleLabels.length) % cycleLabels.length;
      const dutyLabel = cycleLabels[cycleIndex] ?? "휴무";

      return {
        cycleKey: cyclePreview.cycleKey,
        cycleName: cyclePreview.name,
        dutyLabel,
        teamLabel,
        tone: getShiftTone(dutyLabel, cyclePreview.shiftLabels)
      };
    });

    return {
      assignments,
      date: currentDateValue,
      dayLabel: String(currentDate.getDate()),
      holidayName,
      isCurrentMonth: currentDate.getMonth() === month,
      isHoliday: Boolean(holidayName),
      isToday: currentDateValue === todayValue,
      key: `${currentDateValue}-${index}`
    };
  });
};

export const buildSiteSimulationMetrics = (
  cells: SitePatternSimulationCell[],
  cyclePreviews: SitePatternCyclePreviewLike[]
): SitePatternSimulationMetricGroup[] => {
  const currentMonthCells = cells.filter((cell) => cell.isCurrentMonth);
  const workingHourMaps = new Map(
    cyclePreviews.map((cycle) => [
      cycle.cycleKey,
      new Map(
        cycle.shiftLabels.map((label, index) => [
          label,
          resolveWorkingHourSummary(
            cycle.shiftTimes[index] ?? "",
            cycle.shiftBreakMinutes?.[index] ?? cycle.breakMinutes
          )
        ])
      )
    ])
  );

  return cyclePreviews.map((cycle) => {
    const cycleHourMap = workingHourMaps.get(cycle.cycleKey) ?? new Map<string, ReturnType<typeof resolveWorkingHourSummary>>();
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
          note: `총 ${formatSimulationHours(perPersonGrossHours)}시간 - 휴게 ${formatSimulationHours(
            perPersonBreakHours
          )}시간`,
          value: `${Math.round(perPersonHours).toLocaleString("ko-KR")}시간`
        },
        { label: "주간 1인 환산", value: `${Math.round(weeklyEquivalent).toLocaleString("ko-KR")}시간` },
        {
          label: "일평균 1인 실근무",
          value: `${formatSimulationHours(averageDailyHours, 1)}시간`
        },
        { label: "월간 1인 근무일수", value: `${Math.round(perPersonWorkingAssignments).toLocaleString("ko-KR")}회` },
        { label: "월간 1인 휴무일수", value: `${Math.round(perPersonOffAssignments).toLocaleString("ko-KR")}회` }
      ]
    };
  });
};
