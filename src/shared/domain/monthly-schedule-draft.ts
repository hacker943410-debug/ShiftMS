import { buildShiftPatternDutySlotMap } from "./shift-pattern-compression";
import { formatEmployeeDisplayName } from "./employment-type";
import type {
  EmployeeRecord,
  MonthlyScheduleItem,
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternStep
} from "./model";
import { compareTeamLabels } from "./team-label";

export interface MonthlyScheduleDraftItem
  extends Pick<
    MonthlyScheduleItem,
    | "teamLabel"
    | "employeeCode"
    | "employeeName"
    | "workDate"
    | "dutyCode"
    | "startTime"
    | "endTime"
    | "breakMinutes"
  > {
  employeeCode: string;
  sortOrder?: number;
}

export interface MonthlyScheduleDraftIssue {
  code:
    | "empty-pattern"
    | "empty-employee-pool"
    | "missing-shift-group"
    | "missing-cycle-assignment"
    | "unsupported-duty-count";
  message: string;
}

interface MonthlyScheduleDraftInput {
  scheduleMonth: string;
  pattern: ShiftPatternRecord;
  employees: EmployeeRecord[];
  // 공휴일 날짜 목록(YYYY-MM-DD). 평·휴 분리(split) 사이클에서 평일에 낀 공휴일 판정에만 쓰인다.
  // 없으면 토·일만 휴일로 본다. 평·휴를 쓰지 않는 기존 패턴에는 아무 영향이 없다.
  publicHolidayDates?: ReadonlySet<string>;
}

interface TeamCycleContext {
  cycle: ShiftPatternCycle;
  teamIndex: number;
}

const OFF_DUTY_CODES = new Set(["X", "OFF", "O"]);

const normalizeDutyCode = (value: string) => value.trim().toUpperCase();

const isPoolShiftGroup = (value?: string) => normalizeDutyCode(value ?? "") === "POOL";

const createDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const parseDateValue = (value: string) => {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return new Date(year, month - 1, day);
};

const getDateDifferenceInDays = (left: string, right: string) => {
  const leftDate = parseDateValue(left);
  const rightDate = parseDateValue(right);
  const leftUtc = Date.UTC(leftDate.getFullYear(), leftDate.getMonth(), leftDate.getDate());
  const rightUtc = Date.UTC(rightDate.getFullYear(), rightDate.getMonth(), rightDate.getDate());

  return Math.round((rightUtc - leftUtc) / (24 * 60 * 60 * 1000));
};

const EMPTY_PUBLIC_HOLIDAY_SET: ReadonlySet<string> = new Set<string>();

const isWeekendWorkDate = (workDate: string): boolean => {
  const dayOfWeek = parseDateValue(workDate).getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

// 이 날짜에 휴일(토·일·공휴일) 시간을 적용해야 하는지 판정. 평·휴 분리(split)가 켜진 사이클에서만 true가 될 수 있다.
export const shouldUseHolidayTimes = (
  cycle: Pick<ShiftPatternCycle, "holidayTimeMode" | "weekdayPublicHolidayAsHoliday">,
  workDate: string,
  publicHolidayDates: ReadonlySet<string>
): boolean => {
  if (cycle.holidayTimeMode !== "split") {
    return false;
  }

  if (isWeekendWorkDate(workDate)) {
    return true; // 토·일은 토글과 무관하게 항상 휴일 시간
  }

  if (publicHolidayDates.has(workDate)) {
    // 평일에 낀 공휴일: 기본은 휴일 시간으로 보되, 토글이 명시적으로 false면 평일 시간을 쓴다.
    return cycle.weekdayPublicHolidayAsHoliday !== false;
  }

  return false;
};

// 휴일 시간을 써야 하면 휴일 칸을 쓰되, 휴일 칸이 비어 있으면 평일 칸으로 자연스럽게 폴백한다.
export const resolveStepTimesForDate = (
  step: Pick<
    ShiftPatternStep,
    | "startTime"
    | "endTime"
    | "breakMinutes"
    | "holidayStartTime"
    | "holidayEndTime"
    | "holidayBreakMinutes"
  >,
  useHolidayTimes: boolean
): { startTime?: string; endTime?: string; breakMinutes: number } => {
  if (!useHolidayTimes) {
    return { startTime: step.startTime, endTime: step.endTime, breakMinutes: step.breakMinutes };
  }

  return {
    startTime: step.holidayStartTime ?? step.startTime,
    endTime: step.holidayEndTime ?? step.endTime,
    breakMinutes: step.holidayBreakMinutes ?? step.breakMinutes
  };
};

const enumerateMonthDates = (scheduleMonth: string) => {
  const [yearText, monthText] = scheduleMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return [];
  }

  const lastDate = new Date(year, month, 0).getDate();

  return Array.from({ length: lastDate }, (_, index) =>
    createDateValue(new Date(year, month - 1, index + 1))
  );
};

const getMonthBoundaryDates = (scheduleMonth: string) => {
  const dates = enumerateMonthDates(scheduleMonth);

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1]
  };
};

const getEmployeeAssignmentSortOrder = (employee: Pick<EmployeeRecord, "currentAssignmentOrder">) =>
  typeof employee.currentAssignmentOrder === "number" && Number.isFinite(employee.currentAssignmentOrder)
    ? employee.currentAssignmentOrder
    : Number.MAX_SAFE_INTEGER;

const getLegacyCycle = (pattern: ShiftPatternRecord): ShiftPatternCycle => ({
  id: `${pattern.id}-legacy`,
  cycleKey: "cycle-1",
  name: "Cycle 1",
  order: 0,
  shiftCount: Math.max(
    new Set(
      pattern.steps
        .map((step) => normalizeDutyCode(step.dutyCode))
        .filter((dutyCode) => !OFF_DUTY_CODES.has(dutyCode))
    ).size,
    1
  ),
  cycleLength: pattern.steps.length,
  patternCode: pattern.patternCode,
  patternStartDate: pattern.patternStartDate,
  steps: pattern.steps,
  teamIndexes: pattern.teamIndexes
});

const getPatternCycles = (pattern: ShiftPatternRecord) =>
  pattern.cycles.length > 0 ? pattern.cycles : [getLegacyCycle(pattern)];

const getWorkingDutyCodes = (pattern: ShiftPatternRecord) => {
  const seen = new Set<string>();

  return getPatternCycles(pattern).flatMap((cycle) =>
    cycle.steps
      .slice()
      .sort((left, right) => left.stepIndex - right.stepIndex)
      .flatMap((step) => {
        const normalizedCode = normalizeDutyCode(step.dutyCode);

        if (OFF_DUTY_CODES.has(normalizedCode) || seen.has(normalizedCode)) {
          return [];
        }

        seen.add(normalizedCode);
        return [normalizedCode];
      })
  );
};

const buildExportDutyCodeMap = (pattern: ShiftPatternRecord) => {
  const workingCodes = getWorkingDutyCodes(pattern);
  const shiftCount = Math.max(Math.min(workingCodes.length, 3), 1);
  const slotByCode = buildShiftPatternDutySlotMap(workingCodes, shiftCount);
  const targetCodes =
    shiftCount <= 1 ? ["D"] : shiftCount === 2 ? ["D", "N"] : ["D", "E", "N"];

  return new Map(
    workingCodes.map((code, index) => [
      code,
      targetCodes[slotByCode.get(code) ?? Math.min(index, targetCodes.length - 1)] ?? "O"
    ])
  );
};

const normalizeStepDutyCode = (
  rawDutyCode: string,
  dutyCodeMap: Map<string, string>
): "D" | "E" | "N" | "O" => {
  const normalizedCode = normalizeDutyCode(rawDutyCode);

  if (OFF_DUTY_CODES.has(normalizedCode)) {
    return "O";
  }

  return (dutyCodeMap.get(normalizedCode) ?? "O") as "D" | "E" | "N" | "O";
};

const getEmployeeScheduleStartDate = (employee: EmployeeRecord) =>
  employee.hireDate ?? employee.currentAssignmentStartDate;

const isEmployeeAssignedOnWorkDate = (employee: EmployeeRecord, workDate: string) => {
  const scheduleStartDate = getEmployeeScheduleStartDate(employee);

  if (scheduleStartDate && workDate < scheduleStartDate) {
    return false;
  }

  if (employee.currentAssignmentEndDate && workDate >= employee.currentAssignmentEndDate) {
    return false;
  }

  return true;
};

const isEmployeeAssignedDuringScheduleMonth = (
  employee: EmployeeRecord,
  scheduleMonth: string
) => {
  const { startDate, endDate } = getMonthBoundaryDates(scheduleMonth);

  if (!startDate || !endDate) {
    return false;
  }

  const scheduleStartDate = getEmployeeScheduleStartDate(employee);

  if (scheduleStartDate && scheduleStartDate > endDate) {
    return false;
  }

  if (employee.currentAssignmentEndDate && employee.currentAssignmentEndDate <= startDate) {
    return false;
  }

  return true;
};

const findTeamSetting = (pattern: ShiftPatternRecord, teamLabel: string) =>
  pattern.teamSettings?.find((setting) => setting.teamLabel.trim() === teamLabel);

// 근무표 자동생성에서 빼야 하는 조인지. Pool 성격 조는 Cycle이 배정돼 있으면 다른 조와 똑같이 생성하고,
// 배정이 없으면 기존처럼 제외한다. 관리자가 끈 조(비활성)도 제외한다.
const isExcludedTeam = (
  pattern: ShiftPatternRecord,
  teamLabel: string,
  teamCycleContextMap: Map<string, TeamCycleContext>
) => {
  const setting = findTeamSetting(pattern, teamLabel);

  if (setting && !setting.isActive) {
    return true;
  }

  if (teamCycleContextMap.has(teamLabel)) {
    return false;
  }

  return setting ? setting.workType === "POOL" : isPoolShiftGroup(teamLabel);
};

const getSchedulableEmployees = (
  employees: EmployeeRecord[],
  scheduleMonth: string,
  pattern: ShiftPatternRecord,
  teamCycleContextMap: Map<string, TeamCycleContext>
) =>
  employees.filter(
    (employee) =>
      !isExcludedTeam(pattern, employee.currentShiftGroup?.trim() ?? "", teamCycleContextMap) &&
      isEmployeeAssignedDuringScheduleMonth(employee, scheduleMonth)
  );

const buildTeamCycleContextMap = (pattern: ShiftPatternRecord): Map<string, TeamCycleContext> => {
  const cycles = getPatternCycles(pattern);
  const cycleByKey = new Map(cycles.map((cycle) => [cycle.cycleKey, cycle]));
  const assignmentMap = new Map(
    (pattern.teamCycleAssignments.length > 0
      ? pattern.teamCycleAssignments
      : cycles.flatMap((cycle) =>
          cycle.teamIndexes.map((item) => ({
            teamLabel: item.teamLabel,
            cycleKey: cycle.cycleKey
          }))
        )
    ).map((item) => [item.teamLabel.trim(), item.cycleKey])
  );
  const contextMap = new Map<string, TeamCycleContext>();

  assignmentMap.forEach((cycleKey, teamLabel) => {
    const cycle = cycleByKey.get(cycleKey);

    if (!cycle) {
      return;
    }

    const teamIndex =
      cycle.teamIndexes.find((item) => item.teamLabel.trim() === teamLabel)?.index ?? 0;

    contextMap.set(teamLabel, {
      cycle,
      teamIndex
    });
  });

  return contextMap;
};

const isEmployeeAvailableOnWorkDate = (employee: EmployeeRecord, workDate: string) => {
  if (!isEmployeeAssignedOnWorkDate(employee, workDate)) {
    return false;
  }

  if (employee.status === "retired" && !employee.retireDate) {
    return false;
  }

  if (employee.retireDate && workDate >= employee.retireDate) {
    return false;
  }

  return true;
};

export const getMonthlyScheduleDraftIssues = (
  input: MonthlyScheduleDraftInput
): MonthlyScheduleDraftIssue[] => {
  const issues: MonthlyScheduleDraftIssue[] = [];
  const cycles = getPatternCycles(input.pattern);
  const teamCycleContextMap = buildTeamCycleContextMap(input.pattern);
  const schedulableEmployees = getSchedulableEmployees(
    input.employees,
    input.scheduleMonth,
    input.pattern,
    teamCycleContextMap
  );

  if (cycles.every((cycle) => cycle.steps.length === 0)) {
    issues.push({
      code: "empty-pattern",
      message: "선택한 교대 패턴에 저장된 스텝이 없습니다."
    });
  }

  if (schedulableEmployees.length === 0) {
    issues.push({
      code: "empty-employee-pool",
      message: "선택한 근무지에 배정된 재직 인력이 없습니다."
    });
  }

  const missingShiftGroupCount = schedulableEmployees.filter(
    (employee) => !employee.currentShiftGroup?.trim()
  ).length;

  if (missingShiftGroupCount > 0) {
    issues.push({
      code: "missing-shift-group",
      message: `근무조가 지정되지 않은 인력이 ${missingShiftGroupCount}명 있습니다.`
    });
  }

  const missingCycleAssignmentCount = schedulableEmployees.filter((employee) => {
    const shiftGroup = employee.currentShiftGroup?.trim();

    return typeof shiftGroup === "string" && shiftGroup.length > 0 && !teamCycleContextMap.has(shiftGroup);
  }).length;

  if (missingCycleAssignmentCount > 0) {
    issues.push({
      code: "missing-cycle-assignment",
      message: `Cycle이 지정되지 않은 조가 ${missingCycleAssignmentCount}명에게 연결되어 있습니다.`
    });
  }

  const workingDutyCodes = getWorkingDutyCodes(input.pattern);

  if (workingDutyCodes.length > 3) {
    issues.push({
      code: "unsupported-duty-count",
      message: "현재 근무표 양식은 최대 3개 근무 코드까지 지원합니다."
    });
  }

  return issues;
};

export const buildMonthlyScheduleDraft = (
  input: MonthlyScheduleDraftInput
): MonthlyScheduleDraftItem[] => {
  if (getMonthlyScheduleDraftIssues(input).length > 0) {
    return [];
  }

  const teamCycleContextMap = buildTeamCycleContextMap(input.pattern);
  const dutyCodeMap = buildExportDutyCodeMap(input.pattern);
  const publicHolidayDates = input.publicHolidayDates ?? EMPTY_PUBLIC_HOLIDAY_SET;
  const dates = enumerateMonthDates(input.scheduleMonth);
  const orderedEmployees = getSchedulableEmployees(
    input.employees,
    input.scheduleMonth,
    input.pattern,
    teamCycleContextMap
  )
    .filter((employee) => employee.currentShiftGroup?.trim())
    .slice()
    .sort((left, right) => {
      const leftGroup = left.currentShiftGroup?.trim() ?? "";
      const rightGroup = right.currentShiftGroup?.trim() ?? "";

      if (leftGroup !== rightGroup) {
        return compareTeamLabels(leftGroup, rightGroup);
      }

      const assignmentOrderDifference =
        getEmployeeAssignmentSortOrder(left) - getEmployeeAssignmentSortOrder(right);

      if (assignmentOrderDifference !== 0) {
        return assignmentOrderDifference;
      }

      return left.employeeCode.localeCompare(right.employeeCode, "ko-KR", { numeric: true });
    });

  return dates.flatMap((workDate) =>
    orderedEmployees.flatMap((employee) => {
      if (!isEmployeeAvailableOnWorkDate(employee, workDate)) {
        return [];
      }

      const shiftGroup = employee.currentShiftGroup?.trim() ?? "";
      const teamCycleContext = teamCycleContextMap.get(shiftGroup);

      if (!teamCycleContext) {
        return [];
      }

      const orderedSteps = teamCycleContext.cycle.steps
        .slice()
        .sort((left, right) => left.stepIndex - right.stepIndex);
      const cycleLength = orderedSteps.length;

      if (cycleLength === 0) {
        return [];
      }

      const baseDate = teamCycleContext.cycle.patternStartDate ?? `${input.scheduleMonth}-01`;
      const dateOffset = getDateDifferenceInDays(baseDate, workDate);
      const cycleIndex =
        ((dateOffset + teamCycleContext.teamIndex) % cycleLength + cycleLength) % cycleLength;
      const step = orderedSteps[cycleIndex]!;
      const dutyCode = normalizeStepDutyCode(step.dutyCode, dutyCodeMap);
      const useHolidayTimes = shouldUseHolidayTimes(
        teamCycleContext.cycle,
        workDate,
        publicHolidayDates
      );
      const timing = resolveStepTimesForDate(step, useHolidayTimes);

      return [
        {
          teamLabel: shiftGroup,
          employeeCode: employee.employeeCode,
          employeeName: formatEmployeeDisplayName(employee),
          sortOrder: employee.currentAssignmentOrder,
          workDate,
          dutyCode,
          startTime: dutyCode === "O" ? undefined : timing.startTime,
          endTime: dutyCode === "O" ? undefined : timing.endTime,
          breakMinutes: dutyCode === "O" ? 0 : timing.breakMinutes
        }
      ];
    })
  );
};
