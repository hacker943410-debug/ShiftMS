import path from "node:path";
import ExcelJS from "exceljs";

import {
  calculateAutomaticBreakMinutes,
  calculateWorkBreakdown,
  parseTimeToMinutes,
  type TimeRange
} from "../../shared/domain/calculation";
import {
  isBpDisplayName,
} from "../../shared/domain/employment-type";
import type { EmployeeRank } from "../../shared/domain/employee-rank";
import type {
  PerformanceAlert,
  PerformanceEntryRecord
} from "../../shared/domain/performance-file";
import { parsePoolWorkerDisplayName } from "../../shared/domain/performance-file";
import type { MonthlyScheduleItem, MonthlyScheduleRecord, WorkType } from "../../shared/domain/model";
import type {
  SchedulePlanTemplateLayout,
  SchedulePlanTemplateVariant,
  SchedulePlanWorkingDutyCode
} from "../../shared/domain/schedule-plan";
import {
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates
} from "./employee-history-service";
import { listStoredEmployees } from "./employee-storage-service";
import { inspectSchedulePlanTemplate } from "./schedule-plan-adapter";
import { listStoredMonthlySchedules } from "./monthly-schedule-storage-service";

interface SchedulePerformanceParseResult {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  templateVariant: SchedulePlanTemplateVariant;
  scheduleMonth: string;
  siteName: string;
  scheduleKey: string;
  alerts: PerformanceAlert[];
  previewRows: Array<Record<string, string | number>>;
  entries: PerformanceEntryRecord[];
}

interface ResolvedEmployeeContext {
  employeeCode: string;
  employeeRank?: EmployeeRank;
  hourlyRate?: number;
  latestEffectiveFrom?: string;
  duplicateNameCount: number;
  isPoolWorker: boolean;
  teamLabel?: string;
  resolutionError?: string;
}

interface EmployeeRateResolver {
  employeeCode: string;
  employeeName: string;
  employeeRank?: EmployeeRank;
  currentSiteName?: string;
  currentShiftGroup?: string;
  hireDate?: string;
  retireDate?: string;
  currentAssignmentStartDate?: string;
  currentAssignmentEndDate?: string;
  assignments: Array<{
    siteName?: string;
    shiftGroup?: string;
    startDate: string;
    endDate?: string;
  }>;
  latestEffectiveFrom?: string;
  resolveHourlyRate: (workDate: string) => number | undefined;
  isPoolWorker: boolean;
}

interface EmployeeResolverIndex {
  byCode: Map<string, EmployeeRateResolver>;
  byName: Map<string, EmployeeRateResolver[]>;
}

interface ParsedFileIdentity {
  scheduleMonth: string;
  siteName: string;
}

interface ParsedWorkTime {
  dutyCode?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  totalWorkMinutes: number;
  baseWorkMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
}

interface ResolvedScheduleContext {
  schedule: MonthlyScheduleRecord | null;
  scheduleAlerts: PerformanceAlert[];
}

interface RowParseContext {
  fileId: string;
  scheduleMonth: string;
  scheduleKey: string;
  siteName: string;
  employeeResolvers: EmployeeResolverIndex;
  schedule: MonthlyScheduleRecord | null;
}

interface SectionTableLayout {
  dateColumns: string[];
  startRow: number;
  endRow: number;
  originalWorkerColumns?: string[];
  substituteWorkerColumns?: string[];
  startHourColumn?: string;
  startMinuteColumn?: string;
  endHourColumn?: string;
  endMinuteColumn?: string;
  workerColumns?: string[];
  reasonColumns: string[];
  evidenceColumns: string[];
}

const HOLIDAY_FILL = "FFFFD1D1";
const EMPTY_MARKERS = new Set(["", "-", "휴무"]);
const VIRTUAL_ORIGINAL_WORKER_NAME = "홍길동";
const NONE_ACTUAL_WORKER_KEY = "none";
const SECTION_ORDER: Record<PerformanceEntryRecord["section"], number> = {
  "legal-holiday": 0,
  substitute: 1,
  overtime: 2
};

const substituteLayoutByVariant: Record<SchedulePlanTemplateVariant, SectionTableLayout> = {
  sample1: {
    dateColumns: ["BA", "BB"],
    startRow: 11,
    endRow: 26,
    originalWorkerColumns: ["BC", "BD"],
    substituteWorkerColumns: ["BE", "BF"],
    reasonColumns: ["BG", "BH", "BI"],
    evidenceColumns: ["BJ", "BK"]
  },
  sample2: {
    dateColumns: ["BI", "BJ"],
    startRow: 11,
    endRow: 26,
    originalWorkerColumns: ["BK", "BL"],
    substituteWorkerColumns: ["BM", "BN"],
    reasonColumns: ["BO", "BP", "BQ"],
    evidenceColumns: ["BR", "BS"]
  }
};

const overtimeLayoutByVariant: Record<SchedulePlanTemplateVariant, SectionTableLayout> = {
  sample1: {
    dateColumns: ["BA", "BB"],
    startRow: 34,
    endRow: 100,
    startHourColumn: "BC",
    startMinuteColumn: "BD",
    endHourColumn: "BE",
    endMinuteColumn: "BF",
    workerColumns: ["BG"],
    reasonColumns: ["BH", "BI"],
    evidenceColumns: ["BJ", "BK"]
  },
  sample2: {
    dateColumns: ["BI", "BJ"],
    startRow: 34,
    endRow: 100,
    startHourColumn: "BK",
    startMinuteColumn: "BL",
    endHourColumn: "BM",
    endMinuteColumn: "BN",
    workerColumns: ["BO"],
    reasonColumns: ["BP", "BQ"],
    evidenceColumns: ["BR", "BS"]
  }
};

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeText = (value: string | undefined | null) => value?.trim() ?? "";

const normalizeLookupKey = (value: string | undefined | null) =>
  normalizeText(value).replace(/[\s_]+/g, "").toLowerCase();

const isPoolShiftGroup = (value?: string | null) => normalizeLookupKey(value) === "pool";

const isEmptyMarker = (value: string | undefined | null) =>
  EMPTY_MARKERS.has(normalizeText(value).toUpperCase());

const isVirtualOriginalWorker = (value: string | undefined | null) =>
  normalizeLookupKey(value) === normalizeLookupKey(VIRTUAL_ORIGINAL_WORKER_NAME);

const isNoneActualWorker = (value: string | undefined | null) =>
  normalizeLookupKey(value) === NONE_ACTUAL_WORKER_KEY;

const isRealEmployeeCell = (value: string | undefined | null) =>
  normalizeText(value).length > 0 &&
  !isEmptyMarker(value) &&
  !isNoneActualWorker(value) &&
  !isVirtualOriginalWorker(value) &&
  !isBpDisplayName(value);

const isExcludedReturnedPerformanceEmployeeName = (
  value: string | undefined | null,
  employeeResolvers: EmployeeResolverIndex
) => {
  void employeeResolvers;
  return isBpDisplayName(value);
};

const stripFileDuplicateSuffix = (siteName: string) =>
  // Bare trailing digits are valid site names such as "센터1"; strip only file-copy suffixes.
  normalizeText(siteName).replace(/(?:_dup\d+|_\d+)$/i, "");

const toScheduleMonth = (year: string, month: string) =>
  `${year}-${String(Number(month)).padStart(2, "0")}`;

const resolveScheduleMonthFromCell = (
  value: ExcelJS.CellValue | undefined | null
): string | null => {
  if (value instanceof Date) {
    return toScheduleMonth(String(value.getFullYear()), String(value.getMonth() + 1));
  }

  if (isRecord(value) && value.result instanceof Date) {
    return toScheduleMonth(String(value.result.getFullYear()), String(value.result.getMonth() + 1));
  }

  const text = normalizeCellText(value);
  const matched = text.match(/^(\d{4})[-.](\d{1,2})(?:[-.]\d{1,2})?$/);

  return matched ? toScheduleMonth(matched[1], matched[2]) : null;
};

const parseFileIdentity = (fileName: string): ParsedFileIdentity | null => {
  const yyyyUnderscoreMatched = fileName.match(/^(\d{4})_(\d{1,2})_(.+)\.(xlsx|xlsm|xls)$/i);

  if (yyyyUnderscoreMatched) {
    return {
      scheduleMonth: toScheduleMonth(yyyyUnderscoreMatched[1], yyyyUnderscoreMatched[2]),
      siteName: stripFileDuplicateSuffix(
        path.basename(yyyyUnderscoreMatched[3], path.extname(yyyyUnderscoreMatched[3]))
      )
    };
  }

  const siteFirstMatched = fileName.match(/^(.+?)_(\d{4})-(\d{1,2})(?:_.+)?\.(xlsx|xlsm|xls)$/i);

  if (!siteFirstMatched) {
    return null;
  }

  return {
    scheduleMonth: toScheduleMonth(siteFirstMatched[2], siteFirstMatched[3]),
    siteName: stripFileDuplicateSuffix(siteFirstMatched[1])
  };
};

const resolveFileIdentityFromWorksheet = (
  worksheet: ExcelJS.Worksheet,
  layout: SchedulePlanTemplateLayout,
  fileName: string
): ParsedFileIdentity => {
  const fileIdentity = parseFileIdentity(fileName);
  const worksheetSiteName = normalizeCellText(worksheet.getCell(layout.siteNameCell).value);
  const worksheetScheduleMonth = resolveScheduleMonthFromCell(
    worksheet.getCell(layout.monthTitleCell).value
  );
  const scheduleMonth = fileIdentity?.scheduleMonth ?? worksheetScheduleMonth;
  const siteName = stripFileDuplicateSuffix(fileIdentity?.siteName || worksheetSiteName || "");

  if (scheduleMonth && siteName) {
    return {
      scheduleMonth,
      siteName
    };
  }

  throw new Error(`근무표 파일명에서 접수월/근무지를 해석할 수 없습니다: ${fileName}`);
};

const normalizeCellText = (value: ExcelJS.CellValue | undefined | null): string => {
  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("result" in value) {
      return normalizeCellText(value.result as ExcelJS.CellValue | undefined | null);
    }
  }

  return String(value).trim();
};

const normalizeDateText = (value: ExcelJS.CellValue | undefined | null): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (isRecord(value) && value.result instanceof Date) {
    return value.result.toISOString().slice(0, 10);
  }

  const text = normalizeCellText(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) {
    return text.replaceAll(".", "-");
  }

  return text;
};

const getRowText = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: string[]
): string => {
  for (const column of columns) {
    const text = normalizeCellText(worksheet.getCell(`${column}${rowNumber}`).value);

    if (text.length > 0) {
      return text;
    }
  }

  return "";
};

const getHolidayFill = (worksheet: ExcelJS.Worksheet, address: string) =>
  (() => {
    const fill = worksheet.getCell(address).fill as { fgColor?: { argb?: string } } | undefined;
    return typeof fill?.fgColor?.argb === "string" ? fill.fgColor.argb : "";
  })();

const resolveEmployeeContexts = () => {
  const employees = listStoredEmployees({
    includeDeleted: true,
    includeHistoricalAssignments: true
  });
  const byCode = new Map<string, EmployeeRateResolver>();
  const byName = new Map<string, EmployeeRateResolver[]>();

  employees.forEach((employee) => {
    const wageRates = listStoredEmployeeWageRates(employee.id);
    const assignments = listStoredEmployeeAssignments(employee.id).map((assignment) => ({
      siteName: assignment.siteName,
      shiftGroup: assignment.shiftGroup,
      startDate: assignment.startDate,
      endDate: assignment.endDate
    }));
    const resolver: EmployeeRateResolver = {
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      employeeRank: employee.rank,
      currentSiteName: employee.currentSiteName,
      currentShiftGroup: employee.currentShiftGroup,
      hireDate: employee.hireDate,
      retireDate: employee.retireDate,
      currentAssignmentStartDate: employee.currentAssignmentStartDate,
      currentAssignmentEndDate: employee.currentAssignmentEndDate,
      assignments,
      latestEffectiveFrom: wageRates[0]?.effectiveFrom,
      isPoolWorker:
        isPoolShiftGroup(employee.currentShiftGroup) ||
        assignments.some((assignment) => isPoolShiftGroup(assignment.shiftGroup)),
      resolveHourlyRate: (workDate: string) => {
        const matchedRate = wageRates.find((rate) => {
          if (workDate < rate.effectiveFrom) {
            return false;
          }

          if (rate.effectiveTo && workDate > rate.effectiveTo) {
            return false;
          }

          return true;
        });

        return matchedRate?.hourlyRate;
      }
    };
    const normalizedName = normalizeLookupKey(employee.name);
    const nameBucket = byName.get(normalizedName) ?? [];

    byCode.set(employee.employeeCode, resolver);
    nameBucket.push(resolver);
    byName.set(normalizedName, nameBucket);
  });

  return {
    byCode,
    byName
  } satisfies EmployeeResolverIndex;
};

const isEmployeeAvailableOnDate = (employee: EmployeeRateResolver, workDate: string) => {
  const scheduleStartDate = employee.hireDate ?? employee.currentAssignmentStartDate;

  if (scheduleStartDate && workDate < scheduleStartDate) {
    return false;
  }

  if (employee.retireDate && workDate >= employee.retireDate) {
    return false;
  }

  if (
    employee.assignments.length === 0 &&
    employee.currentAssignmentEndDate &&
    workDate >= employee.currentAssignmentEndDate
  ) {
    return false;
  }

  return true;
};

const hasAssignmentAtSiteOnDate = (
  employee: EmployeeRateResolver,
  siteName: string,
  workDate: string
) => {
  const normalizedSiteKey = normalizeLookupKey(siteName);

  if (!normalizedSiteKey) {
    return false;
  }

  return employee.assignments.some((assignment) => {
    if (normalizeLookupKey(assignment.siteName) !== normalizedSiteKey) {
      return false;
    }

    if (workDate < assignment.startDate) {
      return false;
    }

    if (assignment.endDate && workDate >= assignment.endDate) {
      return false;
    }

    return true;
  });
};

const resolveEmployeeTeamLabel = (
  employee: EmployeeRateResolver,
  siteName: string,
  workDate: string
) => {
  const normalizedSiteKey = normalizeLookupKey(siteName);
  const matchedAssignment = employee.assignments.find((assignment) => {
    if (normalizedSiteKey && normalizeLookupKey(assignment.siteName) !== normalizedSiteKey) {
      return false;
    }

    if (workDate < assignment.startDate) {
      return false;
    }

    if (assignment.endDate && workDate >= assignment.endDate) {
      return false;
    }

    return Boolean(assignment.shiftGroup?.trim());
  });

  return matchedAssignment?.shiftGroup?.trim() || employee.currentShiftGroup?.trim() || undefined;
};

const createNoneActualWorkerCancellationMap = (
  worksheet: ExcelJS.Worksheet,
  layout: SchedulePlanTemplateLayout
) => {
  const sectionLayout = substituteLayoutByVariant[layout.variant];
  const cancellationsByDate = new Map<string, Set<string>>();

  for (let rowNumber = sectionLayout.startRow; rowNumber <= sectionLayout.endRow; rowNumber += 1) {
    const workDate = normalizeDateText(
      worksheet.getCell(`${sectionLayout.dateColumns[0]}${rowNumber}`).value
    );
    const originalWorker = getRowText(
      worksheet,
      rowNumber,
      sectionLayout.originalWorkerColumns ?? []
    );
    const substituteWorker = getRowText(
      worksheet,
      rowNumber,
      sectionLayout.substituteWorkerColumns ?? []
    );
    const originalWorkerKey = normalizeLookupKey(originalWorker);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
      originalWorkerKey.length === 0 ||
      isEmptyMarker(originalWorker) ||
      isNoneActualWorker(originalWorker) ||
      !isNoneActualWorker(substituteWorker)
    ) {
      continue;
    }

    const bucket = cancellationsByDate.get(workDate) ?? new Set<string>();

    bucket.add(originalWorkerKey);
    cancellationsByDate.set(workDate, bucket);
  }

  return cancellationsByDate;
};

const narrowEmployeeCandidates = (
  candidates: EmployeeRateResolver[],
  workDate: string,
  siteName: string
) => {
  const availableCandidates = candidates.filter((employee) =>
    isEmployeeAvailableOnDate(employee, workDate)
  );
  const dateScopedCandidates =
    availableCandidates.length > 0 ? availableCandidates : candidates;
  const normalizedSiteKey = normalizeLookupKey(siteName);
  const historicalSiteCandidates = normalizedSiteKey
    ? dateScopedCandidates.filter((employee) =>
        hasAssignmentAtSiteOnDate(employee, siteName, workDate)
      )
    : [];
  const siteScopedCandidates = normalizedSiteKey
    ? dateScopedCandidates.filter(
        (employee) => normalizeLookupKey(employee.currentSiteName) === normalizedSiteKey
      )
    : [];

  if (historicalSiteCandidates.length > 0) {
    return historicalSiteCandidates;
  }

  return siteScopedCandidates.length > 0 ? siteScopedCandidates : dateScopedCandidates;
};

const createAmbiguousEmployeeMessage = (
  employeeName: string,
  workDate: string,
  candidates: EmployeeRateResolver[]
) => {
  const candidateLabels = candidates
    .map((employee) =>
      `${employee.employeeName}(${employee.employeeCode}${
        employee.currentSiteName ? `/${employee.currentSiteName}` : ""
      })`
    )
    .join(", ");

  return `${employeeName}의 ${workDate} 인력 정보가 동명이인 ${candidates.length}명과 매칭되어 사번을 확정할 수 없습니다. 후보: ${candidateLabels}`;
};

const resolveHourlyRate = (
  employeeResolvers: EmployeeResolverIndex,
  employeeName: string,
  workDate: string,
  siteName: string,
  employeeCodeHint?: string
): ResolvedEmployeeContext | null => {
  const hintedCandidates = employeeCodeHint
    ? [employeeResolvers.byCode.get(employeeCodeHint)].filter(
        (value): value is EmployeeRateResolver => Boolean(value)
      )
    : [];
  const nameCandidates = employeeResolvers.byName.get(normalizeLookupKey(employeeName)) ?? [];
  const candidates =
    hintedCandidates.length > 0
      ? hintedCandidates
      : narrowEmployeeCandidates(nameCandidates, workDate, siteName);

  if (candidates.length === 0) {
    return null;
  }

  if (hintedCandidates.length === 0 && candidates.length > 1) {
    return {
      employeeCode: "",
      hourlyRate: undefined,
      latestEffectiveFrom: undefined,
      duplicateNameCount: candidates.length,
      isPoolWorker: false,
      teamLabel: undefined,
      resolutionError: createAmbiguousEmployeeMessage(employeeName, workDate, candidates)
    };
  }

  const matchedEmployee =
    [...candidates].find((employee) => employee.resolveHourlyRate(workDate) !== undefined) ??
    candidates[0];

  return {
    employeeCode: matchedEmployee.employeeCode,
    employeeRank: matchedEmployee.employeeRank,
    hourlyRate: matchedEmployee.resolveHourlyRate(workDate),
    latestEffectiveFrom: matchedEmployee.latestEffectiveFrom,
    duplicateNameCount: nameCandidates.length || candidates.length,
    isPoolWorker: matchedEmployee.isPoolWorker,
    teamLabel: resolveEmployeeTeamLabel(matchedEmployee, siteName, workDate)
  };
};

const resolveScheduleContext = (scheduleMonth: string, rawSiteName: string): ResolvedScheduleContext => {
  const normalizedSiteKey = normalizeLookupKey(rawSiteName);
  const matchedSchedules = listStoredMonthlySchedules().filter(
    (schedule) =>
      schedule.scheduleMonth === scheduleMonth &&
      normalizeLookupKey(schedule.siteName) === normalizedSiteKey
  );

  if (matchedSchedules.length === 0) {
    return {
      schedule: null,
      scheduleAlerts: [
        {
          severity: "error",
          message: `${scheduleMonth} ${rawSiteName} 월간 근무표 저장본을 찾지 못했습니다.`
        }
      ]
    };
  }

  const sortedSchedules = [...matchedSchedules].sort((left, right) =>
    right.generatedAt.localeCompare(left.generatedAt)
  );
  const scheduleAlerts: PerformanceAlert[] = [];

  if (matchedSchedules.length > 1) {
    scheduleAlerts.push({
      severity: "warning",
      message: `${scheduleMonth} ${rawSiteName} 월간 근무표 저장본이 ${matchedSchedules.length}건 있어 최신 생성본을 기준으로 파싱했습니다.`
    });
  }

  return {
    schedule: sortedSchedules[0] ?? null,
    scheduleAlerts
  };
};

const resolveScheduleItem = (
  schedule: MonthlyScheduleRecord | null,
  employeeName: string,
  workDate: string
): MonthlyScheduleItem | null => {
  if (!schedule) {
    return null;
  }

  const normalizedEmployeeName = normalizeLookupKey(employeeName);

  return (
    schedule.items.find(
      (item) =>
        item.workDate === workDate && normalizeLookupKey(item.employeeName) === normalizedEmployeeName
    ) ?? null
  );
};

const resolveScheduleItemByDutyCode = (
  schedule: MonthlyScheduleRecord | null,
  dutyCode: SchedulePlanWorkingDutyCode,
  workDate: string
): MonthlyScheduleItem | null => {
  if (!schedule) {
    return null;
  }

  const matchedItem =
    schedule.items.find(
      (item) =>
        item.workDate === workDate &&
        item.dutyCode === dutyCode &&
        Boolean(item.startTime) &&
        Boolean(item.endTime)
    ) ??
    schedule.items.find(
      (item) =>
        item.dutyCode === dutyCode &&
        Boolean(item.startTime) &&
        Boolean(item.endTime)
    );

  return matchedItem
    ? {
        ...matchedItem,
        workDate,
        dutyCode
      }
    : null;
};

const resolveVirtualScheduleItemFromHolidayTable = (input: {
  worksheet: ExcelJS.Worksheet;
  layout: SchedulePlanTemplateLayout;
  schedule: MonthlyScheduleRecord | null;
  workDate: string;
}): {
  foundNoneMarker: boolean;
  scheduleItem: MonthlyScheduleItem | null;
} => {
  for (const dateAddress of input.layout.rescheduleDateCells) {
    const rowNumber = Number(dateAddress.match(/\d+$/)?.[0] ?? 0);
    const workDate = normalizeDateText(input.worksheet.getCell(dateAddress).value);

    if (workDate !== input.workDate) {
      continue;
    }

    for (const dutyCode of input.layout.supportedWorkingDutyCodes) {
      const regularColumns = input.layout.regularPlanColumns[dutyCode] ?? [];
      const changedColumns = input.layout.changedPlanColumns[dutyCode] ?? [];

      for (let slotIndex = 0; slotIndex < regularColumns.length; slotIndex += 1) {
        const regularName = normalizeCellText(
          input.worksheet.getCell(`${regularColumns[slotIndex]}${rowNumber}`).value
        );
        const changedColumn = changedColumns[slotIndex];
        const changedName = changedColumn
          ? normalizeCellText(input.worksheet.getCell(`${changedColumn}${rowNumber}`).value)
          : "";

        if (isVirtualOriginalWorker(regularName) && isNoneActualWorker(changedName)) {
          continue;
        }
      }
    }
  }

  return {
    foundNoneMarker: false,
    scheduleItem: null
  };
};

const resolveScheduleItemFromReturnedDutySlot = (input: {
  worksheet: ExcelJS.Worksheet;
  layout: SchedulePlanTemplateLayout;
  schedule: MonthlyScheduleRecord | null;
  workDate: string;
  originalWorker: string;
  substituteWorker: string;
}): {
  dutyCode: SchedulePlanWorkingDutyCode;
  rowNumber: number;
  slotIndex: number;
  regularName: string;
  changedName: string;
  scheduleItem: MonthlyScheduleItem | null;
} | null => {
  const substituteWorkerKey = normalizeLookupKey(input.substituteWorker);

  for (const dateAddress of input.layout.rescheduleDateCells) {
    const rowNumber = Number(dateAddress.match(/\d+$/)?.[0] ?? 0);
    const workDate = normalizeDateText(input.worksheet.getCell(dateAddress).value);

    if (workDate !== input.workDate) {
      continue;
    }

    for (const dutyCode of input.layout.supportedWorkingDutyCodes) {
      const regularColumns = input.layout.regularPlanColumns[dutyCode] ?? [];
      const changedColumns = input.layout.changedPlanColumns[dutyCode] ?? [];

      for (let slotIndex = 0; slotIndex < regularColumns.length; slotIndex += 1) {
        const regularName = normalizeCellText(
          input.worksheet.getCell(`${regularColumns[slotIndex]}${rowNumber}`).value
        );
        const changedColumn = changedColumns[slotIndex];
        const changedName = changedColumn
          ? normalizeCellText(input.worksheet.getCell(`${changedColumn}${rowNumber}`).value)
          : "";
        const changedWorkerMatches =
          substituteWorkerKey.length > 0 && normalizeLookupKey(changedName) === substituteWorkerKey;
        const matchesEmptySlot =
          isEmptyMarker(input.originalWorker) && isEmptyMarker(regularName) && changedWorkerMatches;
        const matchesVirtualSlot =
          isVirtualOriginalWorker(input.originalWorker) &&
          isVirtualOriginalWorker(regularName) &&
          (changedName.length === 0 || changedWorkerMatches);
        const matchesRealOriginal =
          !isEmptyMarker(input.originalWorker) &&
          !isVirtualOriginalWorker(input.originalWorker) &&
          normalizeLookupKey(regularName) === normalizeLookupKey(input.originalWorker);

        if (!matchesEmptySlot && !matchesVirtualSlot && !matchesRealOriginal) {
          continue;
        }

        return {
          dutyCode,
          rowNumber,
          slotIndex,
          regularName,
          changedName,
          scheduleItem: resolveScheduleItemByDutyCode(input.schedule, dutyCode, workDate)
        };
      }
    }
  }

  return null;
};

const createWorkTimeFromTimeRange = (
  timeRange: TimeRange,
  dutyCode?: string
): ParsedWorkTime => {
  const breakdown = calculateWorkBreakdown({
    isHoliday: false,
    workType: "overtime",
    timeRange
  });

  return {
    dutyCode,
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    breakMinutes: timeRange.breakMinutes,
    totalWorkMinutes: breakdown.totalWorkMinutes,
    baseWorkMinutes: breakdown.baseWorkMinutes,
    overtimeMinutes: breakdown.overtimeMinutes,
    nightMinutes: breakdown.nightMinutes
  };
};

const createWorkTimeFromScheduleItem = (
  scheduleItem: MonthlyScheduleItem | null,
  workType: WorkType
): ParsedWorkTime => {
  if (!scheduleItem?.startTime || !scheduleItem.endTime) {
    return {
      dutyCode: scheduleItem?.dutyCode,
      breakMinutes: scheduleItem?.breakMinutes ?? 0,
      totalWorkMinutes: 0,
      baseWorkMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0
    };
  }

  const breakdown = calculateWorkBreakdown({
    isHoliday: workType === "holiday",
    workType,
    timeRange: {
      startTime: scheduleItem.startTime,
      endTime: scheduleItem.endTime,
      breakMinutes: scheduleItem.breakMinutes
    }
  });

  return {
    dutyCode: scheduleItem.dutyCode,
    startTime: scheduleItem.startTime,
    endTime: scheduleItem.endTime,
    breakMinutes: scheduleItem.breakMinutes,
    totalWorkMinutes: breakdown.totalWorkMinutes,
    baseWorkMinutes: breakdown.baseWorkMinutes,
    overtimeMinutes: breakdown.overtimeMinutes,
    nightMinutes: breakdown.nightMinutes
  };
};

const createSummaryText = (entry: Pick<
  PerformanceEntryRecord,
  "totalWorkMinutes" | "baseWorkMinutes" | "overtimeMinutes" | "nightMinutes" | "breakMinutes"
>) => {
  const toHourText = (minutes: number) => {
    const hours = minutes / 60;
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  };

  return `총 ${toHourText(entry.totalWorkMinutes)} / 기본 ${toHourText(entry.baseWorkMinutes)} / 연장 ${toHourText(entry.overtimeMinutes)} / 야간 ${toHourText(entry.nightMinutes)} / 휴게 ${toHourText(entry.breakMinutes)}`;
};

const toScheduleItemSource = (item: MonthlyScheduleItem | null | undefined) =>
  item
    ? {
        employeeCode: item.employeeCode ?? "",
        employeeName: item.employeeName ?? "",
        workDate: item.workDate,
        dutyCode: item.dutyCode,
        startTime: item.startTime ?? "",
        endTime: item.endTime ?? "",
        breakMinutes: item.breakMinutes,
        teamLabel: item.teamLabel ?? "",
        sortOrder: item.sortOrder ?? 0
      }
    : null;

const createEntrySourceSignature = (
  section: PerformanceEntryRecord["section"],
  source: Record<string, unknown>
) => `returned-schedule-source:v1:${section}:${JSON.stringify(source)}`;

const buildEntry = (input: {
  context: RowParseContext;
  employeeName: string;
  workDate: string;
  workType: WorkType;
  section: PerformanceEntryRecord["section"];
  sourceToken: string;
  sourceRowNumber: number;
  sortOrder: number;
  workTime: ParsedWorkTime;
  reason?: string;
  evidence?: string;
  alerts?: PerformanceAlert[];
  note?: string;
  teamLabel?: string;
  employeeCodeHint?: string;
  sourceSignature?: string;
}): PerformanceEntryRecord => {
  const parsedEmployeeName = parsePoolWorkerDisplayName(input.employeeName);
  const employeeName = parsedEmployeeName.employeeName;
  const employeeContext = resolveHourlyRate(
    input.context.employeeResolvers,
    employeeName,
    input.workDate,
    input.context.siteName,
    input.employeeCodeHint
  );
  const alerts = [...(input.alerts ?? [])];
  const isPoolWorker = Boolean(
    employeeContext?.isPoolWorker || (input.section === "substitute" && parsedEmployeeName.isPoolDisplayName)
  );
  const isPoolSubstitute = input.section === "substitute" && isPoolWorker;

  if (!employeeContext) {
    alerts.push(
      isPoolSubstitute
        ? {
            severity: "warning",
            message: `${input.employeeName}은 Pool 대체근무 표시로 인식했지만 등록 인력 정보를 찾지 못했습니다.`
          }
        : {
            severity: "error",
            message: `${employeeName} 인력 정보를 찾지 못했습니다.`
          }
    );
  } else if (employeeContext.resolutionError) {
    alerts.push({
      severity: "error",
      message: employeeContext.resolutionError
    });
  } else if (!isPoolSubstitute && employeeContext.hourlyRate === undefined) {
    alerts.push({
      severity: "error",
      message: employeeContext.latestEffectiveFrom
        ? `${employeeName}의 ${input.workDate} 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: ${employeeContext.latestEffectiveFrom}`
        : `${employeeName}의 시급 이력이 없습니다.`
    });
  }

  const notes = [
    input.note,
    isPoolSubstitute ? "Pool 대체근무" : undefined,
    isPoolSubstitute ? "수당 미지급" : undefined,
    parsedEmployeeName.isPoolDisplayName && employeeName !== input.employeeName
      ? `원본 표기 ${input.employeeName}`
      : undefined
  ].filter((note): note is string => Boolean(note?.trim()));

  return {
    id: `${input.context.fileId}:${input.sourceToken}`,
    performanceFileId: input.context.fileId,
    logicalKey: `${input.context.scheduleKey}:${input.sourceToken}`,
    scheduleMonth: input.context.scheduleMonth,
    scheduleKey: input.context.scheduleKey,
    siteName: input.context.siteName,
    employeeCode: employeeContext?.employeeCode ?? "",
    employeeName,
    employeeRank: employeeContext?.employeeRank,
    workDate: input.workDate,
    workType: input.workType,
    section: input.section,
    dutyCode: input.workTime.dutyCode,
    startTime: input.workTime.startTime,
    endTime: input.workTime.endTime,
    breakMinutes: input.workTime.breakMinutes,
    totalWorkMinutes: input.workTime.totalWorkMinutes,
    baseWorkMinutes: input.workTime.baseWorkMinutes,
    overtimeMinutes: input.workTime.overtimeMinutes,
    nightMinutes: input.workTime.nightMinutes,
    reason: input.reason,
    evidence: input.evidence,
    sourceSignature: input.sourceSignature,
    sourceRowNumber: input.sourceRowNumber,
    sortOrder: input.sortOrder,
    teamLabel: input.teamLabel ?? employeeContext?.teamLabel,
    alerts,
    status: "pending",
    hourlyRate: employeeContext?.hourlyRate,
    note: notes.length > 0 ? notes.join(" / ") : undefined,
    workHours: input.workTime.totalWorkMinutes / 60,
    department: input.context.siteName,
    category: input.section,
    isPoolWorker
  };
};

const buildHolidayEntries = (
  worksheet: ExcelJS.Worksheet,
  layout: SchedulePlanTemplateLayout,
  context: RowParseContext
) => {
  const entries: PerformanceEntryRecord[] = [];
  const noneActualWorkerCancellations = createNoneActualWorkerCancellationMap(
    worksheet,
    layout
  );

  layout.rescheduleDateCells.forEach((dateAddress, rowIndex) => {
    const rowNumber = Number(dateAddress.match(/\d+$/)?.[0] ?? 0);
    const workDate = normalizeDateText(worksheet.getCell(dateAddress).value);
    const holidayFill = getHolidayFill(worksheet, dateAddress);

    if (holidayFill !== HOLIDAY_FILL || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return;
    }

    layout.supportedWorkingDutyCodes.forEach((dutyCode) => {
      const regularColumns = layout.regularPlanColumns[dutyCode] ?? [];
      const changedColumns = layout.changedPlanColumns[dutyCode] ?? [];

      regularColumns.forEach((columnLetter, slotIndex) => {
        const regularName = normalizeCellText(worksheet.getCell(`${columnLetter}${rowNumber}`).value);
        const changedColumn = changedColumns[slotIndex];
        const changedName = changedColumn
          ? normalizeCellText(worksheet.getCell(`${changedColumn}${rowNumber}`).value)
          : "";
        const hasChangedActualWorker =
          isRealEmployeeCell(changedName) &&
          !isExcludedReturnedPerformanceEmployeeName(changedName, context.employeeResolvers);
        const hasManualVirtualActualWorker =
          isVirtualOriginalWorker(regularName) &&
          hasChangedActualWorker;
        const hasManualEmptySlotActualWorker =
          isEmptyMarker(regularName) &&
          hasChangedActualWorker;
        const isCancelledByNoneActualWorker =
          noneActualWorkerCancellations
            .get(workDate)
            ?.has(normalizeLookupKey(regularName)) ?? false;

        if (
          isNoneActualWorker(regularName) ||
          isNoneActualWorker(changedName) ||
          isCancelledByNoneActualWorker
        ) {
          return;
        }

        if (regularName.length === 0 || isEmptyMarker(regularName)) {
          if (!hasManualEmptySlotActualWorker) {
            return;
          }
        }

        const alerts: PerformanceAlert[] = [];

        if (isVirtualOriginalWorker(regularName) || hasManualEmptySlotActualWorker) {
          if (!hasManualVirtualActualWorker && !hasManualEmptySlotActualWorker) {
            return;
          }

          const dutyScheduleItem = resolveScheduleItemByDutyCode(
            context.schedule,
            dutyCode,
            workDate
          );
          const directScheduleItem = resolveScheduleItem(context.schedule, changedName, workDate);
          const scheduleItem = dutyScheduleItem ?? directScheduleItem;

          if (!dutyScheduleItem && directScheduleItem) {
            alerts.push({
              severity: "warning",
              message: `${changedName}의 ${workDate} ${dutyCode} 근무열 기준을 찾지 못해 투입자 원래 근무시간을 사용했습니다.`
            });
          }

          if (!scheduleItem) {
            alerts.push({
              severity: "warning",
              message: `${changedName}의 ${workDate} ${dutyCode} 근무시간 기준을 찾지 못했습니다.`
            });
          }

          entries.push(
            buildEntry({
              context,
              employeeName: changedName,
              employeeCodeHint: directScheduleItem?.employeeCode,
              workDate,
              workType: "holiday",
              section: "legal-holiday",
              sourceToken: `holiday:${rowNumber}:${dutyCode}:${slotIndex}`,
              sourceRowNumber: rowNumber,
              sortOrder: SECTION_ORDER["legal-holiday"] * 10000 + rowIndex * 100 + slotIndex,
              teamLabel: scheduleItem?.teamLabel,
              workTime: createWorkTimeFromScheduleItem(scheduleItem, "holiday"),
              alerts,
              note: hasManualEmptySlotActualWorker
                ? "빈 근무열 기준 법정휴일근로"
                : `${VIRTUAL_ORIGINAL_WORKER_NAME} 기준 법정휴일근로`,
              sourceSignature: createEntrySourceSignature("legal-holiday", {
                rowNumber,
                slotIndex,
                workDate,
                dutyCode,
                holidayFill,
                regularColumn: columnLetter,
                changedColumn: changedColumn ?? "",
                regularName,
                changedName,
                dutyScheduleItem: toScheduleItemSource(dutyScheduleItem),
                directScheduleItem: toScheduleItemSource(directScheduleItem)
              })
            })
          );
          return;
        }

        if (isExcludedReturnedPerformanceEmployeeName(regularName, context.employeeResolvers)) {
          return;
        }

        if (
          changedName.length > 0 &&
          normalizeLookupKey(changedName) !== normalizeLookupKey(regularName) &&
          !isEmptyMarker(changedName)
        ) {
          alerts.push({
            severity: "warning",
            message: `${workDate.slice(5)} 법정대체휴일근무 중복(${regularName})`
          });
        }

        const scheduleItem = resolveScheduleItem(context.schedule, regularName, workDate);

        if (!scheduleItem) {
          alerts.push({
            severity: "warning",
            message: `${regularName}의 ${workDate} 근무표 저장 정보를 찾지 못했습니다.`
          });
        }

        entries.push(
          buildEntry({
            context,
            employeeName: regularName,
            employeeCodeHint: scheduleItem?.employeeCode,
            workDate,
            workType: "holiday",
            section: "legal-holiday",
            sourceToken: `holiday:${rowNumber}:${dutyCode}:${slotIndex}`,
            sourceRowNumber: rowNumber,
            sortOrder: SECTION_ORDER["legal-holiday"] * 10000 + rowIndex * 100 + slotIndex,
            teamLabel: scheduleItem?.teamLabel,
            workTime: createWorkTimeFromScheduleItem(scheduleItem, "holiday"),
            alerts,
            sourceSignature: createEntrySourceSignature("legal-holiday", {
              rowNumber,
              slotIndex,
              workDate,
              dutyCode,
              holidayFill,
              regularColumn: columnLetter,
              changedColumn: changedColumn ?? "",
              regularName,
              changedName,
              scheduleItem: toScheduleItemSource(scheduleItem)
            })
          })
        );
      });
    });
  });

  return entries;
};

const buildSubstituteEntries = (
  worksheet: ExcelJS.Worksheet,
  layout: SchedulePlanTemplateLayout,
  context: RowParseContext
) => {
  const sectionLayout = substituteLayoutByVariant[layout.variant];
  const entries: PerformanceEntryRecord[] = [];

  for (let rowNumber = sectionLayout.startRow; rowNumber <= sectionLayout.endRow; rowNumber += 1) {
    const workDate = normalizeDateText(
      worksheet.getCell(`${sectionLayout.dateColumns[0]}${rowNumber}`).value
    );
    const originalWorker = getRowText(
      worksheet,
      rowNumber,
      sectionLayout.originalWorkerColumns ?? []
    );
    const substituteWorker = getRowText(
      worksheet,
      rowNumber,
      sectionLayout.substituteWorkerColumns ?? []
    );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
      !originalWorker ||
      !substituteWorker ||
      isNoneActualWorker(originalWorker) ||
      isNoneActualWorker(substituteWorker) ||
      isEmptyMarker(substituteWorker) ||
      isVirtualOriginalWorker(substituteWorker)
    ) {
      continue;
    }

    if (isExcludedReturnedPerformanceEmployeeName(substituteWorker, context.employeeResolvers)) {
      continue;
    }

    const alerts: PerformanceAlert[] = [];
    const directScheduleItem = resolveScheduleItem(context.schedule, originalWorker, workDate);
    const virtualScheduleItem =
      !directScheduleItem && isVirtualOriginalWorker(originalWorker)
        ? resolveVirtualScheduleItemFromHolidayTable({
            worksheet,
            layout,
            schedule: context.schedule,
            workDate
          })
        : null;
    const slotScheduleItem =
      !directScheduleItem
        ? resolveScheduleItemFromReturnedDutySlot({
            worksheet,
            layout,
            schedule: context.schedule,
            workDate,
            originalWorker,
            substituteWorker
          })
        : null;

    if (
      isVirtualOriginalWorker(originalWorker) &&
      !directScheduleItem &&
      !virtualScheduleItem?.foundNoneMarker &&
      !slotScheduleItem
    ) {
      continue;
    }

    if (isEmptyMarker(originalWorker) && !slotScheduleItem) {
      continue;
    }

    const scheduleItem =
      directScheduleItem ??
      virtualScheduleItem?.scheduleItem ??
      slotScheduleItem?.scheduleItem ??
      null;

    if (slotScheduleItem && !slotScheduleItem.scheduleItem) {
      alerts.push({
        severity: "warning",
        message: `${workDate} ${slotScheduleItem.dutyCode} 대체근무 슬롯 시간 기준을 찾지 못했습니다.`
      });
    }

    if (slotScheduleItem?.scheduleItem && !directScheduleItem && !virtualScheduleItem?.scheduleItem) {
      alerts.push({
        severity: "warning",
        message: `${originalWorker} 원근무자 이름으로 근무표를 찾지 못해 ${workDate} ${slotScheduleItem.dutyCode} 슬롯 시간을 사용했습니다.`
      });
    }

    const reason = getRowText(worksheet, rowNumber, sectionLayout.reasonColumns);
    const evidence = getRowText(worksheet, rowNumber, sectionLayout.evidenceColumns);

    if (!scheduleItem) {
      alerts.push({
        severity: "warning",
        message: isVirtualOriginalWorker(originalWorker)
          ? `${VIRTUAL_ORIGINAL_WORKER_NAME}의 ${workDate} None 표식 근무시간을 찾지 못했습니다.`
          : `${originalWorker}의 ${workDate} 원래 근무표 정보를 찾지 못했습니다.`
      });
    }

    entries.push(
      buildEntry({
        context,
        employeeName: substituteWorker,
        workDate,
        workType: "substitute",
        section: "substitute",
        sourceToken: `substitute:${rowNumber}`,
        sourceRowNumber: rowNumber,
        sortOrder: SECTION_ORDER.substitute * 10000 + rowNumber,
        teamLabel: scheduleItem?.teamLabel,
        workTime: createWorkTimeFromScheduleItem(scheduleItem, "substitute"),
        reason,
        evidence,
        alerts,
        note: `원 근무자 ${originalWorker}`,
        sourceSignature: createEntrySourceSignature("substitute", {
          rowNumber,
          workDate,
          originalWorker,
          substituteWorker,
          reason,
          evidence,
          directScheduleItem: toScheduleItemSource(directScheduleItem),
          virtualFoundNoneMarker: virtualScheduleItem?.foundNoneMarker ?? false,
          virtualScheduleItem: toScheduleItemSource(virtualScheduleItem?.scheduleItem),
          slotDutyCode: slotScheduleItem?.dutyCode ?? "",
          slotRowNumber: slotScheduleItem?.rowNumber ?? 0,
          slotIndex: slotScheduleItem?.slotIndex ?? -1,
          slotRegularName: slotScheduleItem?.regularName ?? "",
          slotChangedName: slotScheduleItem?.changedName ?? "",
          slotScheduleItem: toScheduleItemSource(slotScheduleItem?.scheduleItem)
        })
      })
    );
  }

  return entries;
};

const toTimeText = (hourText: string, minuteText: string) => {
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const buildOvertimeEntries = (
  worksheet: ExcelJS.Worksheet,
  variant: SchedulePlanTemplateVariant,
  context: RowParseContext
) => {
  const sectionLayout = overtimeLayoutByVariant[variant];
  const entries: PerformanceEntryRecord[] = [];
  const finalRow = Math.min(sectionLayout.endRow, worksheet.rowCount);

  for (let rowNumber = sectionLayout.startRow; rowNumber <= finalRow; rowNumber += 1) {
    const workDate = normalizeDateText(
      worksheet.getCell(`${sectionLayout.dateColumns[0]}${rowNumber}`).value
    );
    const employeeName = getRowText(worksheet, rowNumber, sectionLayout.workerColumns ?? []);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
      employeeName.length === 0 ||
      isNoneActualWorker(employeeName)
    ) {
      continue;
    }

    if (isExcludedReturnedPerformanceEmployeeName(employeeName, context.employeeResolvers)) {
      continue;
    }

    const startTime = toTimeText(
      normalizeCellText(worksheet.getCell(`${sectionLayout.startHourColumn}${rowNumber}`).value),
      normalizeCellText(worksheet.getCell(`${sectionLayout.startMinuteColumn}${rowNumber}`).value)
    );
    const endTime = toTimeText(
      normalizeCellText(worksheet.getCell(`${sectionLayout.endHourColumn}${rowNumber}`).value),
      normalizeCellText(worksheet.getCell(`${sectionLayout.endMinuteColumn}${rowNumber}`).value)
    );
    const startHourText = normalizeCellText(
      worksheet.getCell(`${sectionLayout.startHourColumn}${rowNumber}`).value
    );
    const startMinuteText = normalizeCellText(
      worksheet.getCell(`${sectionLayout.startMinuteColumn}${rowNumber}`).value
    );
    const endHourText = normalizeCellText(
      worksheet.getCell(`${sectionLayout.endHourColumn}${rowNumber}`).value
    );
    const endMinuteText = normalizeCellText(
      worksheet.getCell(`${sectionLayout.endMinuteColumn}${rowNumber}`).value
    );
    const reason = getRowText(worksheet, rowNumber, sectionLayout.reasonColumns);
    const evidence = getRowText(worksheet, rowNumber, sectionLayout.evidenceColumns);
    const alerts: PerformanceAlert[] = [];

    if (!startTime || !endTime) {
      alerts.push({
        severity: "warning",
        message: `${employeeName}의 연장근무 시작/종료 시각이 올바르지 않습니다.`
      });
    }

    const timeRange = startTime && endTime
      ? {
          startTime,
          endTime,
          breakMinutes: calculateAutomaticBreakMinutes({ startTime, endTime })
        }
      : {
          startTime: "00:00",
          endTime: "00:00",
          breakMinutes: 0
        };

    entries.push(
      buildEntry({
        context,
        employeeName,
        workDate,
        workType: "overtime",
        section: "overtime",
        sourceToken: `overtime:${rowNumber}`,
        sourceRowNumber: rowNumber,
        sortOrder: SECTION_ORDER.overtime * 10000 + rowNumber,
        workTime: createWorkTimeFromTimeRange(timeRange, "OT"),
        reason,
        evidence,
        alerts,
        sourceSignature: createEntrySourceSignature("overtime", {
          rowNumber,
          workDate,
          employeeName,
          startHourText,
          startMinuteText,
          endHourText,
          endMinuteText,
          reason,
          evidence
        })
      })
    );
  }

  return entries;
};

const toDateOrdinal = (workDate: string) => {
  const matched = workDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!matched) {
    return null;
  }

  return Math.floor(
    Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])) / 86400000
  );
};

const createEntryRange = (entry: PerformanceEntryRecord) => {
  if (!entry.startTime || !entry.endTime) {
    return null;
  }

  const dateOrdinal = toDateOrdinal(entry.workDate);

  if (dateOrdinal === null) {
    return null;
  }

  try {
    const startMinutes = parseTimeToMinutes(entry.startTime);
    const endMinutes = parseTimeToMinutes(entry.endTime);
    const dayStartMinutes = dateOrdinal * 24 * 60;
    const normalizedEndMinutes =
      endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;

    return {
      start: dayStartMinutes + startMinutes,
      end: dayStartMinutes + normalizedEndMinutes
    };
  } catch {
    return null;
  }
};

const appendConflictAlert = (entry: PerformanceEntryRecord, message: string) => {
  if (entry.alerts.some((alert) => alert.message === message)) {
    return;
  }

  entry.alerts.push({
    severity: "error",
    message
  });
};

const formatEntryTimeLabel = (entry: PerformanceEntryRecord) =>
  `${entry.workDate} ${entry.startTime ?? "-"}-${entry.endTime ?? "-"}`;

const createConflictMessage = (
  entry: PerformanceEntryRecord,
  otherEntry: PerformanceEntryRecord
) => {
  const isExactDuplicate =
    entry.workDate === otherEntry.workDate &&
    entry.startTime === otherEntry.startTime &&
    entry.endTime === otherEntry.endTime;
  const identityLabel = `${entry.employeeName}(${entry.employeeCode})`;

  if (isExactDuplicate) {
    return `${identityLabel} ${formatEntryTimeLabel(entry)} 근무가 중복되었습니다. 같은 근무지/날짜/사번/시간대 중복 근무는 등록할 수 없습니다.`;
  }

  return `${identityLabel} ${formatEntryTimeLabel(entry)} 근무시간이 ${formatEntryTimeLabel(otherEntry)} 근무와 겹칩니다. 같은 근무지/사번의 근무시간은 겹칠 수 없습니다.`;
};

const validateEmployeeTimeConflicts = (entries: PerformanceEntryRecord[]) => {
  const entriesByIdentity = new Map<string, PerformanceEntryRecord[]>();

  entries.forEach((entry) => {
    if (!entry.employeeCode) {
      return;
    }

    const key = [normalizeLookupKey(entry.siteName), entry.employeeCode].join(":");
    const identityEntries = entriesByIdentity.get(key) ?? [];

    identityEntries.push(entry);
    entriesByIdentity.set(key, identityEntries);
  });

  entriesByIdentity.forEach((identityEntries) => {
    const entriesWithRanges = identityEntries
      .map((entry) => ({
        entry,
        range: createEntryRange(entry)
      }))
      .filter(
        (
          item
        ): item is { entry: PerformanceEntryRecord; range: { start: number; end: number } } =>
          item.range !== null
      )
      .sort(
        (left, right) => left.range.start - right.range.start || left.range.end - right.range.end
      );

    for (let leftIndex = 0; leftIndex < entriesWithRanges.length; leftIndex += 1) {
      const left = entriesWithRanges[leftIndex]!;

      for (let rightIndex = leftIndex + 1; rightIndex < entriesWithRanges.length; rightIndex += 1) {
        const right = entriesWithRanges[rightIndex]!;

        if (right.range.start >= left.range.end) {
          break;
        }

        if (left.range.start < right.range.end && right.range.start < left.range.end) {
          appendConflictAlert(left.entry, createConflictMessage(left.entry, right.entry));
          appendConflictAlert(right.entry, createConflictMessage(right.entry, left.entry));
        }
      }
    }
  });

  return entries;
};

const buildPreviewRows = (entries: PerformanceEntryRecord[]) =>
  entries.slice(0, 12).map((entry) => ({
    날짜: entry.workDate,
    이름: entry.employeeName,
    근로유형:
      entry.section === "legal-holiday"
        ? "법정휴일근무"
        : entry.section === "substitute"
          ? "대체근무"
          : "연장근무",
    근무시간: createSummaryText(entry),
    사유: entry.reason ?? "-",
    알림: entry.alerts.map((alert) => alert.message).join(" / ") || "-"
  }));

const isScheduleDependentEntry = (entry: PerformanceEntryRecord) =>
  entry.section === "legal-holiday" || entry.section === "substitute";

const markMissingScheduleRows = (
  entries: PerformanceEntryRecord[],
  scheduleMonth: string,
  siteName: string
) => {
  const message = `${scheduleMonth} ${siteName} 월간 근무표 저장본이 없어 근무시간을 산출할 수 없습니다. 근무지 관리에서 해당 월 근무표를 생성/저장한 뒤 다시 실적을 추출하세요.`;

  return entries.map((entry) => {
    if (!isScheduleDependentEntry(entry)) {
      return entry;
    }

    if (entry.alerts.some((alert) => alert.message === message)) {
      return entry;
    }

    return {
      ...entry,
      alerts: [
        {
          severity: "error" as const,
          message
        },
        ...entry.alerts
      ]
    };
  });
};

export const parseReturnedSchedulePerformanceFile = async (input: {
  filePath: string;
  fileId: string;
}): Promise<SchedulePerformanceParseResult> => {
  const [layout, workbook] = await Promise.all([
    inspectSchedulePlanTemplate(input.filePath),
    readWorkbook(input.filePath)
  ]);
  const worksheet = workbook.getWorksheet(layout.sheetName) ?? workbook.worksheets[0];
  const identity = resolveFileIdentityFromWorksheet(worksheet, layout, path.basename(input.filePath));
  const scheduleContext = resolveScheduleContext(identity.scheduleMonth, identity.siteName);
  const employeeResolvers = resolveEmployeeContexts();
  const resolvedSiteName = scheduleContext.schedule?.siteName ?? identity.siteName;
  const scheduleKey = `${identity.scheduleMonth}:${normalizeLookupKey(resolvedSiteName)}`;
  const context: RowParseContext = {
    fileId: input.fileId,
    scheduleMonth: identity.scheduleMonth,
    scheduleKey,
    siteName: resolvedSiteName,
    employeeResolvers,
    schedule: scheduleContext.schedule
  };
  const parsedEntries = [
    ...buildHolidayEntries(worksheet, layout, context),
    ...buildSubstituteEntries(worksheet, layout, context),
    ...buildOvertimeEntries(worksheet, layout.variant, context)
  ].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.workDate.localeCompare(right.workDate) ||
        left.employeeName.localeCompare(right.employeeName, "ko")
  );
  const retainedEntries = scheduleContext.schedule
    ? parsedEntries
    : markMissingScheduleRows(parsedEntries, identity.scheduleMonth, resolvedSiteName);

  const entries = validateEmployeeTimeConflicts(retainedEntries);

  return {
    sheetName: worksheet.name,
    rowCount: worksheet.rowCount,
    columnCount: worksheet.columnCount,
    templateVariant: layout.variant,
    scheduleMonth: identity.scheduleMonth,
    siteName: resolvedSiteName,
    scheduleKey,
    alerts: scheduleContext.scheduleAlerts,
    previewRows: buildPreviewRows(entries),
    entries
  };
};
