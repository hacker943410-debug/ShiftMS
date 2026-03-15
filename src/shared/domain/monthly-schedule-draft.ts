import type { EmployeeRecord, MonthlyScheduleItem, ShiftPatternCycle, ShiftPatternRecord } from "./model";

export interface MonthlyScheduleDraftItem
  extends Pick<
    MonthlyScheduleItem,
    | "employeeCode"
    | "employeeName"
    | "workDate"
    | "dutyCode"
    | "startTime"
    | "endTime"
    | "breakMinutes"
  > {
  employeeCode: string;
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

const compareShiftGroup = (left: string, right: string) => {
  const leftMatch = normalizeDutyCode(left).match(/[A-Z]+|\d+/);
  const rightMatch = normalizeDutyCode(right).match(/[A-Z]+|\d+/);

  if (leftMatch && rightMatch && leftMatch[0] !== rightMatch[0]) {
    return leftMatch[0].localeCompare(rightMatch[0], "ko-KR", { numeric: true });
  }

  return left.localeCompare(right, "ko-KR", { numeric: true });
};

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
  const existingExportCodes = new Set(["D", "E", "N"]);

  if (workingCodes.every((code) => existingExportCodes.has(code))) {
    return new Map(workingCodes.map((code) => [code, code]));
  }

  const targetCodes =
    workingCodes.length <= 1 ? ["D"] : workingCodes.length === 2 ? ["D", "N"] : ["D", "E", "N"];

  return new Map(workingCodes.map((code, index) => [code, targetCodes[index] ?? "O"]));
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

const isEmployeeAssignedOnWorkDate = (employee: EmployeeRecord, workDate: string) => {
  if (employee.currentAssignmentStartDate && workDate < employee.currentAssignmentStartDate) {
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

  if (employee.currentAssignmentStartDate && employee.currentAssignmentStartDate > endDate) {
    return false;
  }

  if (employee.currentAssignmentEndDate && employee.currentAssignmentEndDate <= startDate) {
    return false;
  }

  return true;
};

const getSchedulableEmployees = (employees: EmployeeRecord[], scheduleMonth: string) =>
  employees.filter(
    (employee) =>
      !isPoolShiftGroup(employee.currentShiftGroup) &&
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
  const schedulableEmployees = getSchedulableEmployees(input.employees, input.scheduleMonth);

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

  const teamCycleContextMap = buildTeamCycleContextMap(input.pattern);
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
  const dates = enumerateMonthDates(input.scheduleMonth);
  const orderedEmployees = getSchedulableEmployees(input.employees, input.scheduleMonth)
    .filter((employee) => employee.currentShiftGroup?.trim())
    .slice()
    .sort((left, right) => {
      const leftGroup = left.currentShiftGroup?.trim() ?? "";
      const rightGroup = right.currentShiftGroup?.trim() ?? "";

      if (leftGroup !== rightGroup) {
        return compareShiftGroup(leftGroup, rightGroup);
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

      return [
        {
          employeeCode: employee.employeeCode,
          employeeName: employee.name,
          workDate,
          dutyCode,
          startTime: dutyCode === "O" ? undefined : step.startTime,
          endTime: dutyCode === "O" ? undefined : step.endTime,
          breakMinutes: dutyCode === "O" ? 0 : step.breakMinutes
        }
      ];
    })
  );
};
