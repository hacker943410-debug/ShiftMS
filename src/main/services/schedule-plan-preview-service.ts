import type {
  DocumentTemplateVersion,
  EmployeeRecord,
  MonthlyScheduleItem,
  MonthlyScheduleRecord,
  ShiftPatternRecord
} from "../../shared/domain/model";
import { formatEmployeeDisplayName } from "../../shared/domain/employment-type";
import type {
  SchedulePlanCellUpdate,
  SchedulePlanDutyCode,
  SchedulePlanPreviewRecord,
  SchedulePlanTemplateLayout,
  SchedulePlanWorkingDutyCode
} from "../../shared/domain/schedule-plan";
import { SCHEDULE_PLAN_CALENDAR_DATE_FORMAT } from "../../shared/domain/schedule-plan";
import {
  buildSchedulePlanDateBlockAddresses,
  buildSchedulePlanCalendarDates
} from "./schedule-plan-adapter";
import { listStoredEmployees } from "./employee-storage-service";
import { listStoredMonthlySchedules } from "./monthly-schedule-storage-service";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import {
  resolveSchedulePlanTemplateLayout,
  resolveSchedulePlanTemplateVersion
} from "./schedule-plan-template-service";

const parseDateValue = (value: string) => {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return new Date(year, month - 1, day);
};

const compareTeamLabel = (left: string, right: string) => {
  const leftMatch = left.trim().toUpperCase().match(/[A-Z]+|\d+/);
  const rightMatch = right.trim().toUpperCase().match(/[A-Z]+|\d+/);

  if (leftMatch && rightMatch && leftMatch[0] !== rightMatch[0]) {
    return leftMatch[0].localeCompare(rightMatch[0], "ko-KR", { numeric: true });
  }

  return left.localeCompare(right, "ko-KR", { numeric: true });
};

const normalizeDutyCode = (value: string): SchedulePlanDutyCode => {
  const normalized = value.trim().toUpperCase();

  if (normalized === "D" || normalized === "E" || normalized === "N") {
    return normalized;
  }

  return "O";
};

const normalizeTeamLabel = (value?: string) => value?.trim() ?? "";
const getEmployeeDisplayName = (employee?: Pick<EmployeeRecord, "name" | "employmentType"> | null) =>
  employee ? formatEmployeeDisplayName(employee) : "";

const getSchedulableTeamLabel = (
  item: MonthlyScheduleItem,
  employeesByCode: Map<string, EmployeeRecord>
) => {
  const stored = normalizeTeamLabel(item.teamLabel);

  if (stored) {
    return stored;
  }

  const employee = item.employeeCode ? employeesByCode.get(item.employeeCode) : undefined;
  const fallback = normalizeTeamLabel(employee?.currentShiftGroup);

  return fallback.toUpperCase() === "POOL" ? "" : fallback;
};

const getOrderedTeamLabels = (
  pattern: ShiftPatternRecord,
  schedule: MonthlyScheduleRecord,
  employeesByCode: Map<string, EmployeeRecord>
) => {
  const labels = new Set<string>();

  pattern.teamIndexes.forEach((item) => labels.add(item.teamLabel.trim()));
  pattern.teamCycleAssignments.forEach((item) => labels.add(item.teamLabel.trim()));
  pattern.cycles.forEach((cycle) => {
    cycle.teamIndexes.forEach((item) => labels.add(item.teamLabel.trim()));
  });
  schedule.items.forEach((item) => {
    const teamLabel = getSchedulableTeamLabel(item, employeesByCode);

    if (teamLabel) {
      labels.add(teamLabel);
    }
  });

  return Array.from(labels)
    .filter((item) => item.length > 0 && item.toUpperCase() !== "POOL")
    .sort(compareTeamLabel);
};

const toAlphabetCode = (index: number) => {
  let current = index + 1;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const buildTeamCodeMap = (
  pattern: ShiftPatternRecord,
  schedule: MonthlyScheduleRecord,
  employeesByCode: Map<string, EmployeeRecord>
) => {
  const orderedTeamLabels = getOrderedTeamLabels(pattern, schedule, employeesByCode);

  return new Map(orderedTeamLabels.map((teamLabel, index) => [teamLabel, toAlphabetCode(index)]));
};

const getWorkingShiftCount = (pattern: ShiftPatternRecord) => {
  const seen = new Set<string>();
  const sourceCycles =
    pattern.cycles.length > 0 ? pattern.cycles : [{ steps: pattern.steps }];

  sourceCycles.forEach((cycle) => {
    cycle.steps.forEach((step) => {
      const dutyCode = normalizeDutyCode(step.dutyCode);

      if (dutyCode !== "O") {
        seen.add(dutyCode);
      }
    });
  });

  return Math.max(seen.size, 1);
};

interface RosterMemberSlot {
  employeeCode: string;
  sortOrder: number;
}

// 조 구성에서 배치한 순서는 근무표 항목의 sortOrder(= currentAssignmentOrder)에 실려 온다.
// 값이 없는 항목은 맨 뒤로 보내고 사번으로 가른다.
const getItemSortOrder = (item: MonthlyScheduleItem) =>
  typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
    ? item.sortOrder
    : Number.MAX_SAFE_INTEGER;

const compareRosterMemberSlot = (left: RosterMemberSlot, right: RosterMemberSlot) =>
  left.sortOrder !== right.sortOrder
    ? left.sortOrder - right.sortOrder
    : left.employeeCode.localeCompare(right.employeeCode, "ko-KR", { numeric: true });

interface AssignmentSlot extends RosterMemberSlot {
  employeeName: string;
  teamRank: number;
}

// 한 날 여러 조가 같은 근무를 서면 조 순서(A→B→C)로 묶고, 조 안에서는 배치 순서를 따른다.
const compareAssignmentSlot = (left: AssignmentSlot, right: AssignmentSlot) =>
  left.teamRank !== right.teamRank
    ? left.teamRank - right.teamRank
    : compareRosterMemberSlot(left, right);

// 조원 표기 순서는 조 구성에서 배치한 순서를 그대로 따른다(맨 위가 조장).
// 이름 가나다순으로 다시 세우면 조장이 중간으로 밀린다.
const buildRosterSegmentText = (
  teamCodeMap: Map<string, string>,
  teamMembers: Map<string, string[]>,
  employeesByCode: Map<string, EmployeeRecord>
) =>
  Array.from(teamCodeMap.entries())
    .map(([teamLabel, teamCode]) => {
      const memberNames = (teamMembers.get(teamLabel) ?? []).map(
        (employeeCode) => getEmployeeDisplayName(employeesByCode.get(employeeCode)) || employeeCode
      );

      return `${teamCode}: ${memberNames.join(", ") || "-"}`;
    })
    .join("     ");

const buildRosterSummary = (input: {
  layout: SchedulePlanTemplateLayout;
  pattern: ShiftPatternRecord;
  schedule: MonthlyScheduleRecord;
  employeesByCode: Map<string, EmployeeRecord>;
  teamCodeMap: Map<string, string>;
}) => {
  const teamMemberSlots = new Map<string, RosterMemberSlot[]>();

  input.schedule.items.forEach((item) => {
    const teamLabel = getSchedulableTeamLabel(item, input.employeesByCode);

    if (!teamLabel || !item.employeeCode) {
      return;
    }

    const current = teamMemberSlots.get(teamLabel) ?? [];

    if (!current.some((slot) => slot.employeeCode === item.employeeCode)) {
      current.push({ employeeCode: item.employeeCode, sortOrder: getItemSortOrder(item) });
      teamMemberSlots.set(teamLabel, current);
    }
  });

  const teamMembers = new Map(
    Array.from(teamMemberSlots.entries()).map(([teamLabel, slots]) => [
      teamLabel,
      slots.sort(compareRosterMemberSlot).map((slot) => slot.employeeCode)
    ])
  );

  const rosterSummary = buildRosterSegmentText(
    input.teamCodeMap,
    teamMembers,
    input.employeesByCode
  );
  const uniqueTeamSizes = new Set(Array.from(teamMembers.values()).map((members) => members.length));
  const staffingLabel =
    uniqueTeamSizes.size === 1 ? `1조 ${Array.from(teamMembers.values())[0]?.length ?? 0}명` : "조별 상이";
  const totalAssigned = Array.from(teamMembers.values()).reduce(
    (sum, members) => sum + members.length,
    0
  );
  const structureLine = `◎교대근무 구조: Work Type - ${input.pattern.teamCount}조 ${getWorkingShiftCount(
    input.pattern
  )}교대, Staffing - ${staffingLabel}, Current Enrollment Quota for Shift Work - ${totalAssigned}명`;

  if (input.layout.variant === "sample2") {
    return `(기본 그룹 현황) ${rosterSummary}\n(주말 그룹 현황) ${rosterSummary}\n${structureLine}`;
  }

  return `${rosterSummary}\n${structureLine}`;
};

const buildAssignmentMaps = (input: {
  schedule: MonthlyScheduleRecord;
  employeesByCode: Map<string, EmployeeRecord>;
  teamCodeMap: Map<string, string>;
}) => {
  const teamCodesByDateAndDuty = new Map<string, string[]>();
  const employeeNamesByDateAndDuty = new Map<string, string[]>();
  // 조 순서(A→B→C)는 teamCodeMap 이 이미 정한 순서다. 그 안에서는 조 구성 배치 순서를 따른다.
  const teamRankByLabel = new Map(
    Array.from(input.teamCodeMap.keys()).map((teamLabel, index) => [teamLabel, index] as const)
  );
  const teamRankByCode = new Map(
    Array.from(input.teamCodeMap.values()).map((teamCode, index) => [teamCode, index] as const)
  );
  const employeeSlotsByDateAndDuty = new Map<string, AssignmentSlot[]>();

  input.schedule.items.forEach((item) => {
    const dutyCode = normalizeDutyCode(item.dutyCode);

    if (dutyCode === "O") {
      return;
    }

    const key = `${item.workDate}::${dutyCode}`;
    const teamLabel = getSchedulableTeamLabel(item, input.employeesByCode);
    const teamCode = teamLabel ? input.teamCodeMap.get(teamLabel) : undefined;
    const employeeName =
      item.employeeName ??
      (item.employeeCode ? getEmployeeDisplayName(input.employeesByCode.get(item.employeeCode)) : undefined) ??
      item.employeeCode;

    if (teamCode) {
      const currentCodes = teamCodesByDateAndDuty.get(key) ?? [];

      if (!currentCodes.includes(teamCode)) {
        currentCodes.push(teamCode);
        teamCodesByDateAndDuty.set(key, currentCodes);
      }
    }

    if (employeeName) {
      const currentSlots = employeeSlotsByDateAndDuty.get(key) ?? [];

      currentSlots.push({
        employeeCode: item.employeeCode ?? "",
        employeeName,
        sortOrder: getItemSortOrder(item),
        teamRank: (teamLabel ? teamRankByLabel.get(teamLabel) : undefined) ?? Number.MAX_SAFE_INTEGER
      });
      employeeSlotsByDateAndDuty.set(key, currentSlots);
    }
  });

  teamCodesByDateAndDuty.forEach((value, key) => {
    value.sort(
      (left, right) =>
        ((teamRankByCode.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (teamRankByCode.get(right) ?? Number.MAX_SAFE_INTEGER)) ||
        left.localeCompare(right, "ko-KR", { numeric: true })
    );
    teamCodesByDateAndDuty.set(key, value);
  });

  employeeSlotsByDateAndDuty.forEach((slots, key) => {
    employeeNamesByDateAndDuty.set(
      key,
      slots.sort(compareAssignmentSlot).map((slot) => slot.employeeName)
    );
  });

  return {
    teamCodesByDateAndDuty,
    employeeNamesByDateAndDuty
  };
};

const getRowNumber = (address: string) => Number(address.match(/\d+$/)?.[0] ?? 0);

const isHorizontalSlotSet = (addresses: string[]) => {
  if (addresses.length <= 1) {
    return false;
  }

  const firstRow = getRowNumber(addresses[0]!);

  return addresses.every((address) => getRowNumber(address) === firstRow);
};

const buildLeftSlotUpdates = (addresses: string[], values: string[]): SchedulePlanCellUpdate[] => {
  const resolved = Array.from({ length: addresses.length }, () => "-");
  const normalizedValues = values.filter((value) => value.trim().length > 0);

  if (normalizedValues.length > 0) {
    if (isHorizontalSlotSet(addresses) && addresses.length === 3) {
      if (normalizedValues.length === 1) {
        resolved[1] = normalizedValues[0]!;
      } else if (normalizedValues.length === 2) {
        resolved[0] = normalizedValues[0]!;
        resolved[2] = normalizedValues[1]!;
      } else {
        normalizedValues.slice(0, addresses.length).forEach((value, index) => {
          resolved[index] = value;
        });

        if (normalizedValues.length > addresses.length) {
          resolved[addresses.length - 1] = normalizedValues.slice(addresses.length - 1).join("/");
        }
      }
    } else {
      normalizedValues.slice(0, addresses.length).forEach((value, index) => {
        resolved[index] = value;
      });

      if (normalizedValues.length > addresses.length) {
        resolved[addresses.length - 1] = normalizedValues.slice(addresses.length - 1).join("/");
      }
    }
  }

  return addresses.map((address, index) => ({
    address,
    value: resolved[index] ?? "-"
  }));
};

const buildOffTeamCodeMap = (input: {
  calendarDates: string[];
  scheduleMonth: string;
  teamCodeMap: Map<string, string>;
  teamCodesByDateAndDuty: Map<string, string[]>;
}) => {
  const allTeamCodes = Array.from(input.teamCodeMap.values()).sort((left, right) =>
    left.localeCompare(right, "ko-KR", { numeric: true })
  );
  const offCodesByDate = new Map<string, string[]>();

  input.calendarDates.forEach((workDate) => {
    if (!workDate.startsWith(`${input.scheduleMonth}-`)) {
      offCodesByDate.set(workDate, []);
      return;
    }

    const activeCodes = new Set<string>();

    (["D", "E", "N"] as const).forEach((dutyCode) => {
      (input.teamCodesByDateAndDuty.get(`${workDate}::${dutyCode}`) ?? []).forEach((teamCode) => {
        activeCodes.add(teamCode);
      });
    });

    offCodesByDate.set(
      workDate,
      allTeamCodes.filter((teamCode) => !activeCodes.has(teamCode))
    );
  });

  return offCodesByDate;
};

const validateTemplateCompatibility = (
  schedule: MonthlyScheduleRecord,
  layout: SchedulePlanTemplateLayout
) => {
  const usedDutyCodes = Array.from(
    new Set(
      schedule.items
        .map((item) => normalizeDutyCode(item.dutyCode))
        .filter((dutyCode): dutyCode is SchedulePlanWorkingDutyCode => dutyCode !== "O")
    )
  );
  const unsupported = usedDutyCodes.filter(
    (dutyCode) => !layout.supportedWorkingDutyCodes.includes(dutyCode)
  );

  if (unsupported.length > 0) {
    throw new Error(
      `선택한 배포 양식은 ${unsupported.join(", ")} 근무를 지원하지 않습니다.`
    );
  }
};

const createTemplateUpdates = async (input: {
  schedule: MonthlyScheduleRecord;
  pattern: ShiftPatternRecord;
  employeesByCode: Map<string, EmployeeRecord>;
  template: DocumentTemplateVersion;
}) => {
  const layout = await resolveSchedulePlanTemplateLayout(input.template);

  validateTemplateCompatibility(input.schedule, layout);

  const teamCodeMap = buildTeamCodeMap(input.pattern, input.schedule, input.employeesByCode);
  const rosterSummary = buildRosterSummary({
    layout,
    pattern: input.pattern,
    schedule: input.schedule,
    employeesByCode: input.employeesByCode,
    teamCodeMap
  });
  const { teamCodesByDateAndDuty, employeeNamesByDateAndDuty } = buildAssignmentMaps({
    schedule: input.schedule,
    employeesByCode: input.employeesByCode,
    teamCodeMap
  });
  const updates: SchedulePlanCellUpdate[] = [];
  const monthStartDate = parseDateValue(`${input.schedule.scheduleMonth}-01`);
  const calendarDates = buildSchedulePlanCalendarDates(input.schedule.scheduleMonth);
  const offTeamCodesByDate = buildOffTeamCodeMap({
    calendarDates,
    scheduleMonth: input.schedule.scheduleMonth,
    teamCodeMap,
    teamCodesByDateAndDuty
  });
  let calendarIndex = 0;

  updates.push({
    address: layout.siteNameCell,
    value: input.schedule.siteName ?? ""
  });
  updates.push({
    address: layout.monthTitleCell,
    value: monthStartDate
  });
  updates.push({
    address: layout.rosterSummaryCell,
    value: rosterSummary
  });
  layout.monthAnchorCells.forEach((address) => {
    updates.push({
      address,
      value: monthStartDate
    });
  });

  layout.weekBlocks.forEach((weekBlock) => {
    weekBlock.daySlots.forEach((daySlot) => {
      const workDate = calendarDates[calendarIndex];

      updates.push({
        address: daySlot.dateAddress,
        value: workDate ? parseDateValue(workDate) : null,
        numberFormat: SCHEDULE_PLAN_CALENDAR_DATE_FORMAT,
        numberFormatAddresses: buildSchedulePlanDateBlockAddresses(daySlot.dateAddress)
      });

      (Object.entries(daySlot.dutyCellAddresses) as Array<
        [SchedulePlanDutyCode, string[] | undefined]
      >).forEach(([dutyCode, addresses]) => {
        if (!addresses || addresses.length === 0) {
          return;
        }

        const values =
          dutyCode === "O"
            ? offTeamCodesByDate.get(workDate ?? "") ?? []
            : teamCodesByDateAndDuty.get(`${workDate}::${dutyCode}`) ?? [];

        updates.push(...buildLeftSlotUpdates(addresses, values));
      });

      calendarIndex += 1;
    });
  });

  layout.rescheduleDateCells.forEach((address, index) => {
    const dayIndex = index + 1;
    const workDate = `${input.schedule.scheduleMonth}-${String(dayIndex).padStart(2, "0")}`;
    const daysInMonth = new Date(
      monthStartDate.getFullYear(),
      monthStartDate.getMonth() + 1,
      0
    ).getDate();
    const isInMonth = dayIndex <= daysInMonth;

    updates.push({
      address,
      value: isInMonth ? parseDateValue(workDate) : null
    });

    layout.supportedWorkingDutyCodes.forEach((dutyCode) => {
      const names = isInMonth
        ? employeeNamesByDateAndDuty.get(`${workDate}::${dutyCode}`) ?? []
        : [];
      const regularColumns = layout.regularPlanColumns[dutyCode] ?? [];
      const changedColumns = layout.changedPlanColumns[dutyCode] ?? [];

      regularColumns.forEach((columnLetter, nameIndex) => {
        updates.push({
          address: `${columnLetter}${index + 12}`,
          value: isInMonth ? names[nameIndex] ?? "-" : null
        });
      });

      changedColumns.forEach((columnLetter) => {
        updates.push({
          address: `${columnLetter}${index + 12}`,
          value: null
        });
      });
    });

    updates.push({
      address: `${layout.changeReasonColumn}${index + 12}`,
      value: null
    });
  });

  return {
    layout,
    updates
  };
};

export const previewMonthlySchedulePlan = async (
  scheduleId: string
): Promise<SchedulePlanPreviewRecord | null> => {
  const schedule = listStoredMonthlySchedules().find((item) => item.id === scheduleId);

  if (!schedule || !schedule.siteName || !schedule.patternName) {
    return null;
  }

  const pattern = listStoredShiftPatterns(schedule.siteId).find((item) => item.id === schedule.patternId);

  if (!pattern) {
    throw new Error("근무표에 연결된 교대 패턴을 찾을 수 없습니다.");
  }

  const template = resolveSchedulePlanTemplateVersion(schedule.templateVersionId);
  const employees = listStoredEmployees({ siteId: schedule.siteId });
  const employeesByCode = new Map(employees.map((employee) => [employee.employeeCode, employee]));
  const { layout, updates } = await createTemplateUpdates({
    schedule,
    pattern,
    employeesByCode,
    template
  });

  return {
    scheduleId: schedule.id,
    scheduleMonth: schedule.scheduleMonth,
    siteName: schedule.siteName,
    patternName: schedule.patternName,
    templateSheetName: layout.sheetName,
    updateCount: updates.length,
    updates
  };
};
