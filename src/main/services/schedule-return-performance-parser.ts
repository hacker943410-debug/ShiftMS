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
import type {
  PerformanceAlert,
  PerformanceEntryRecord
} from "../../shared/domain/performance-file";
import type { MonthlyScheduleItem, MonthlyScheduleRecord, WorkType } from "../../shared/domain/model";
import type {
  SchedulePlanTemplateLayout,
  SchedulePlanTemplateVariant,
  SchedulePlanWorkingDutyCode
} from "../../shared/domain/schedule-plan";
import { listStoredEmployeeWageRates } from "./employee-history-service";
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
  hourlyRate?: number;
  latestEffectiveFrom?: string;
  duplicateNameCount: number;
  isPoolWorker: boolean;
  resolutionError?: string;
}

interface EmployeeRateResolver {
  employeeCode: string;
  employeeName: string;
  currentSiteName?: string;
  hireDate?: string;
  retireDate?: string;
  currentAssignmentStartDate?: string;
  currentAssignmentEndDate?: string;
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
const EMPTY_MARKERS = new Set(["", "-", "NONE", "휴무"]);
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
  !isVirtualOriginalWorker(value) &&
  !isBpDisplayName(value);

const isExcludedReturnedPerformanceEmployeeName = (
  value: string | undefined | null,
  employeeResolvers: EmployeeResolverIndex
) => {
  void employeeResolvers;
  return isBpDisplayName(value);
};

const parseFileIdentity = (fileName: string): ParsedFileIdentity | null => {
  const matched = fileName.match(/^(\d{4})_(\d{1,2})_(.+)\.(xlsx|xlsm|xls)$/i);

  if (!matched) {
    return null;
  }

  return {
    scheduleMonth: `${matched[1]}-${String(Number(matched[2])).padStart(2, "0")}`,
    siteName: normalizeText(path.basename(matched[3], path.extname(matched[3])))
  };
};

const resolveFileIdentityFromWorksheet = (
  worksheet: ExcelJS.Worksheet,
  layout: SchedulePlanTemplateLayout,
  fileName: string
): ParsedFileIdentity => {
  const fileIdentity = parseFileIdentity(fileName);

  if (fileIdentity) {
    return fileIdentity;
  }

  const siteName = normalizeCellText(worksheet.getCell(layout.siteNameCell).value);
  const monthValue = worksheet.getCell(layout.monthTitleCell).value;

  if (monthValue instanceof Date) {
    return {
      scheduleMonth: `${monthValue.getFullYear()}-${String(monthValue.getMonth() + 1).padStart(2, "0")}`,
      siteName
    };
  }

  if (isRecord(monthValue) && monthValue.result instanceof Date) {
    return {
      scheduleMonth: `${monthValue.result.getFullYear()}-${String(monthValue.result.getMonth() + 1).padStart(2, "0")}`,
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
  const employees = listStoredEmployees();
  const byCode = new Map<string, EmployeeRateResolver>();
  const byName = new Map<string, EmployeeRateResolver[]>();

  employees.forEach((employee) => {
    const wageRates = listStoredEmployeeWageRates(employee.id);
    const resolver: EmployeeRateResolver = {
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      currentSiteName: employee.currentSiteName,
      hireDate: employee.hireDate,
      retireDate: employee.retireDate,
      currentAssignmentStartDate: employee.currentAssignmentStartDate,
      currentAssignmentEndDate: employee.currentAssignmentEndDate,
      latestEffectiveFrom: wageRates[0]?.effectiveFrom,
      isPoolWorker: isPoolShiftGroup(employee.currentShiftGroup),
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

  if (employee.currentAssignmentEndDate && workDate > employee.currentAssignmentEndDate) {
    return false;
  }

  return true;
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
  const siteScopedCandidates = normalizedSiteKey
    ? dateScopedCandidates.filter(
        (employee) => normalizeLookupKey(employee.currentSiteName) === normalizedSiteKey
      )
    : [];

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
      resolutionError: createAmbiguousEmployeeMessage(employeeName, workDate, candidates)
    };
  }

  const matchedEmployee =
    [...candidates].find((employee) => employee.resolveHourlyRate(workDate) !== undefined) ??
    candidates[0];

  return {
    employeeCode: matchedEmployee.employeeCode,
    hourlyRate: matchedEmployee.resolveHourlyRate(workDate),
    latestEffectiveFrom: matchedEmployee.latestEffectiveFrom,
    duplicateNameCount: nameCandidates.length || candidates.length,
    isPoolWorker: matchedEmployee.isPoolWorker
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
          return {
            foundNoneMarker: true,
            scheduleItem: resolveScheduleItemByDutyCode(input.schedule, dutyCode, workDate)
          };
        }
      }
    }
  }

  return {
    foundNoneMarker: false,
    scheduleItem: null
  };
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
  employeeCodeHint?: string;
}): PerformanceEntryRecord => {
  const employeeContext = resolveHourlyRate(
    input.context.employeeResolvers,
    input.employeeName,
    input.workDate,
    input.context.siteName,
    input.employeeCodeHint
  );
  const alerts = [...(input.alerts ?? [])];

  if (!employeeContext) {
    alerts.push({
      severity: "error",
      message: `${input.employeeName} 인력 정보를 찾지 못했습니다.`
    });
  } else if (employeeContext.resolutionError) {
    alerts.push({
      severity: "error",
      message: employeeContext.resolutionError
    });
  } else if (employeeContext.hourlyRate === undefined) {
    alerts.push({
      severity: "error",
      message: employeeContext.latestEffectiveFrom
        ? `${input.employeeName}의 ${input.workDate} 기준 적용 시급을 찾지 못했습니다. 현재 등록 시작일: ${employeeContext.latestEffectiveFrom}`
        : `${input.employeeName}의 시급 이력이 없습니다.`
    });
  }

  return {
    id: `${input.context.fileId}:${input.sourceToken}`,
    performanceFileId: input.context.fileId,
    logicalKey: `${input.context.scheduleKey}:${input.sourceToken}`,
    scheduleMonth: input.context.scheduleMonth,
    scheduleKey: input.context.scheduleKey,
    siteName: input.context.siteName,
    employeeCode: employeeContext?.employeeCode ?? "",
    employeeName: input.employeeName,
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
    sourceRowNumber: input.sourceRowNumber,
    sortOrder: input.sortOrder,
    alerts,
    status: "pending",
    hourlyRate: employeeContext?.hourlyRate,
    note: input.note,
    workHours: input.workTime.totalWorkMinutes / 60,
    department: input.context.siteName,
    category: input.section,
    isPoolWorker: employeeContext?.isPoolWorker ?? false
  };
};

const buildHolidayEntries = (
  worksheet: ExcelJS.Worksheet,
  layout: SchedulePlanTemplateLayout,
  context: RowParseContext
) => {
  const entries: PerformanceEntryRecord[] = [];

  layout.rescheduleDateCells.forEach((dateAddress, rowIndex) => {
    const rowNumber = Number(dateAddress.match(/\d+$/)?.[0] ?? 0);
    const fillColor = getHolidayFill(worksheet, dateAddress);
    const workDate = normalizeDateText(worksheet.getCell(dateAddress).value);

    if (fillColor !== HOLIDAY_FILL || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return;
    }

    layout.supportedWorkingDutyCodes.forEach((dutyCode) => {
      const regularColumns = layout.regularPlanColumns[dutyCode] ?? [];
      const changedColumns = layout.changedPlanColumns[dutyCode] ?? [];

      regularColumns.forEach((columnLetter, slotIndex) => {
        const regularName = normalizeCellText(worksheet.getCell(`${columnLetter}${rowNumber}`).value);

        if (regularName.length === 0 || isEmptyMarker(regularName)) {
          return;
        }

        const changedColumn = changedColumns[slotIndex];
        const changedName = changedColumn
          ? normalizeCellText(worksheet.getCell(`${changedColumn}${rowNumber}`).value)
          : "";

        if (isEmptyMarker(changedName)) {
          if (changedName.length > 0) {
            return;
          }
        }

        const alerts: PerformanceAlert[] = [];

        if (isVirtualOriginalWorker(regularName)) {
          if (
            !isRealEmployeeCell(changedName) ||
            isExcludedReturnedPerformanceEmployeeName(changedName, context.employeeResolvers)
          ) {
            return;
          }

          const directScheduleItem = resolveScheduleItem(context.schedule, changedName, workDate);
          const scheduleItem =
            directScheduleItem ?? resolveScheduleItemByDutyCode(context.schedule, dutyCode, workDate);

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
              workTime: createWorkTimeFromScheduleItem(scheduleItem, "holiday"),
              alerts,
              note: `${VIRTUAL_ORIGINAL_WORKER_NAME} 기준 법정휴일근로`
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
            workTime: createWorkTimeFromScheduleItem(scheduleItem, "holiday"),
            alerts
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
      isEmptyMarker(originalWorker) ||
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

    if (
      isVirtualOriginalWorker(originalWorker) &&
      !directScheduleItem &&
      !virtualScheduleItem?.foundNoneMarker
    ) {
      continue;
    }

    const scheduleItem = directScheduleItem ?? virtualScheduleItem?.scheduleItem ?? null;

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
        workTime: createWorkTimeFromScheduleItem(scheduleItem, "substitute"),
        reason: getRowText(worksheet, rowNumber, sectionLayout.reasonColumns),
        evidence: getRowText(worksheet, rowNumber, sectionLayout.evidenceColumns),
        alerts,
        note: `원 근무자 ${originalWorker}`
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || employeeName.length === 0) {
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
        reason: getRowText(worksheet, rowNumber, sectionLayout.reasonColumns),
        evidence: getRowText(worksheet, rowNumber, sectionLayout.evidenceColumns),
        alerts
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
  const entries = validateEmployeeTimeConflicts(
    [
      ...buildHolidayEntries(worksheet, layout, context),
      ...buildSubstituteEntries(worksheet, layout, context),
      ...buildOvertimeEntries(worksheet, layout.variant, context)
    ].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.workDate.localeCompare(right.workDate) ||
        left.employeeName.localeCompare(right.employeeName, "ko")
    )
  );

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
