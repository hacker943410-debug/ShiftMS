import type { EmployeeRecord, MonthlyScheduleItem, ShiftPatternRecord } from "./model";

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
    | "unsupported-duty-count";
  message: string;
}

interface MonthlyScheduleDraftInput {
  scheduleMonth: string;
  pattern: ShiftPatternRecord;
  employees: EmployeeRecord[];
}

const OFF_DUTY_CODES = new Set(["X", "OFF", "O"]);

const normalizeDutyCode = (value: string) => value.trim().toUpperCase();

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

const getWorkingDutyCodes = (pattern: ShiftPatternRecord) => {
  const seen = new Set<string>();

  return pattern.steps
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .flatMap((step) => {
      const normalizedCode = normalizeDutyCode(step.dutyCode);

      if (OFF_DUTY_CODES.has(normalizedCode) || seen.has(normalizedCode)) {
        return [];
      }

      seen.add(normalizedCode);
      return [normalizedCode];
    });
};

const compareShiftGroup = (left: string, right: string) => {
  const leftMatch = normalizeDutyCode(left).match(/[A-Z]+|\d+/);
  const rightMatch = normalizeDutyCode(right).match(/[A-Z]+|\d+/);

  if (leftMatch && rightMatch && leftMatch[0] !== rightMatch[0]) {
    return leftMatch[0].localeCompare(rightMatch[0], "ko-KR", { numeric: true });
  }

  return left.localeCompare(right, "ko-KR", { numeric: true });
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

const getEmployeeShiftGroups = (employees: EmployeeRecord[]) =>
  Array.from(
    new Set(
      employees
        .map((employee) => employee.currentShiftGroup?.trim())
        .filter((group): group is string => Boolean(group))
    )
  ).sort(compareShiftGroup);

export const getMonthlyScheduleDraftIssues = (
  input: MonthlyScheduleDraftInput
): MonthlyScheduleDraftIssue[] => {
  const issues: MonthlyScheduleDraftIssue[] = [];

  if (input.pattern.steps.length === 0) {
    issues.push({
      code: "empty-pattern",
      message: "선택한 교대 패턴에 저장된 스텝이 없습니다."
    });
  }

  if (input.employees.length === 0) {
    issues.push({
      code: "empty-employee-pool",
      message: "선택한 근무지에 배정된 재직 인력이 없습니다."
    });
  }

  const missingShiftGroupCount = input.employees.filter(
    (employee) => !employee.currentShiftGroup?.trim()
  ).length;

  if (missingShiftGroupCount > 0) {
    issues.push({
      code: "missing-shift-group",
      message: `근무조가 지정되지 않은 인력이 ${missingShiftGroupCount}명 있습니다.`
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

  const orderedSteps = input.pattern.steps
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex);
  const shiftGroups = getEmployeeShiftGroups(input.employees);
  const shiftGroupIndexMap = new Map(shiftGroups.map((group, index) => [group, index]));
  const dutyCodeMap = buildExportDutyCodeMap(input.pattern);
  const cycleLength = orderedSteps.length;
  const baseDate = input.pattern.patternStartDate ?? `${input.scheduleMonth}-01`;
  const dates = enumerateMonthDates(input.scheduleMonth);
  const orderedEmployees = input.employees
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
    orderedEmployees.map((employee) => {
      const shiftGroup = employee.currentShiftGroup?.trim() ?? "";
      const shiftGroupIndex = shiftGroupIndexMap.get(shiftGroup) ?? 0;
      const dateOffset = getDateDifferenceInDays(baseDate, workDate);
      const cycleIndex = ((dateOffset + shiftGroupIndex) % cycleLength + cycleLength) % cycleLength;
      const step = orderedSteps[cycleIndex]!;
      const dutyCode = normalizeStepDutyCode(step.dutyCode, dutyCodeMap);

      return {
        employeeCode: employee.employeeCode,
        workDate,
        dutyCode,
        startTime: dutyCode === "O" ? undefined : step.startTime,
        endTime: dutyCode === "O" ? undefined : step.endTime,
        breakMinutes: dutyCode === "O" ? 0 : step.breakMinutes
      };
    })
  );
};
