import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import { formatEmployeeDisplayName } from "../../shared/domain/employment-type";
import type { EmployeeRecord, ShiftPatternRecord, SiteRecord } from "../../shared/domain/model";
import type { SchedulePlanWorkingDutyCode } from "../../shared/domain/schedule-plan";
import { listStoredEmployees } from "./employee-storage-service";
import {
  listStoredMonthlySchedules,
  saveStoredMonthlySchedule
} from "./monthly-schedule-storage-service";
import { listStoredPerformanceFileDetails } from "./performance-file-storage-service";
import { inspectSchedulePlanTemplate } from "./schedule-plan-adapter";
import { listStoredShiftPatterns } from "./shift-pattern-storage-service";
import { listStoredSites } from "./site-storage-service";

interface RestoreMissingMonthlySchedulesInput {
  scheduleExportDir: string;
}

export interface RestoreMissingMonthlySchedulesSummary {
  checkedScheduleCount: number;
  restoredScheduleCount: number;
  skippedScheduleCount: number;
  issueMessages: string[];
}

interface ExportedPlanIdentity {
  filePath: string;
  scheduleMonth: string;
  siteName: string;
}

interface DutyTimeSource {
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
}

const supportedFileExtensions = new Set([".xlsx", ".xlsm", ".xls"]);

const normalizeText = (value: unknown) => String(value ?? "").replace(/\uFEFF/g, "").trim();

const normalizeLookupKey = (value: unknown) =>
  normalizeText(value).replace(/[\s_]+/g, "").toLowerCase();

const normalizeDutyCode = (value: string) => value.trim().toUpperCase();

const isEmptyWorkerCell = (value: string) => {
  const normalized = value.trim().toUpperCase();

  return normalized.length === 0 || normalized === "-" || normalized === "NONE" || normalized === "휴무";
};

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(filePath);
  return workbook;
};

const listFilesRecursive = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const resolvedPath = path.resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(resolvedPath)));
      continue;
    }

    if (entry.isFile() && supportedFileExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(resolvedPath);
    }
  }

  return files;
};

const listMonthCandidateFiles = async (scheduleExportDir: string, scheduleMonth: string) => {
  const [yearText, monthText] = scheduleMonth.split("-");
  const monthDir = path.resolve(scheduleExportDir, `${yearText}년`, `${Number(monthText)}월`);
  const monthDirStats = await stat(monthDir).catch(() => null);

  if (monthDirStats?.isDirectory()) {
    return listFilesRecursive(monthDir);
  }

  return listFilesRecursive(scheduleExportDir);
};

const resolveScheduleMonthFromCell = (value: ExcelJS.CellValue | undefined | null) => {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "result" in value &&
    value.result instanceof Date
  ) {
    return `${value.result.getFullYear()}-${String(value.result.getMonth() + 1).padStart(2, "0")}`;
  }

  const matched = normalizeText(value).match(/^(\d{4})[-.](\d{1,2})(?:[-.]\d{1,2})?$/);

  return matched ? `${matched[1]}-${String(Number(matched[2])).padStart(2, "0")}` : "";
};

const resolveWorkDateFromCell = (
  value: ExcelJS.CellValue | undefined | null,
  scheduleMonth: string
) => {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "result" in value &&
    value.result instanceof Date
  ) {
    return `${value.result.getFullYear()}-${String(value.result.getMonth() + 1).padStart(2, "0")}-${String(
      value.result.getDate()
    ).padStart(2, "0")}`;
  }

  const text = normalizeText(value);
  const isoMatched = text.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/);

  if (isoMatched) {
    return `${isoMatched[1]}-${String(Number(isoMatched[2])).padStart(2, "0")}-${String(
      Number(isoMatched[3])
    ).padStart(2, "0")}`;
  }

  const dayMatched = text.match(/^(\d{1,2})(?:일)?$/);

  if (!dayMatched) {
    return "";
  }

  return `${scheduleMonth}-${String(Number(dayMatched[1])).padStart(2, "0")}`;
};

const parseWorkerNames = (value: ExcelJS.CellValue | undefined | null) =>
  normalizeText(value)
    .split(/[\/,\n]/)
    .map((item) => item.trim())
    .filter((item) => !isEmptyWorkerCell(item));

const buildUniqueEmployeeDisplayNameMap = (employees: EmployeeRecord[]) => {
  const candidates = new Map<string, EmployeeRecord[]>();

  employees.forEach((employee) => {
    const displayName = formatEmployeeDisplayName({
      name: employee.name,
      employmentType: employee.employmentType
    });

    [employee.name, displayName].forEach((name) => {
      const key = normalizeLookupKey(name);

      if (!key) {
        return;
      }

      const current = candidates.get(key) ?? [];
      current.push(employee);
      candidates.set(key, current);
    });
  });

  const unique = new Map<string, EmployeeRecord>();

  candidates.forEach((items, key) => {
    const employeeIds = new Set(items.map((item) => item.id));

    if (employeeIds.size === 1) {
      unique.set(key, items[0]!);
    }
  });

  return unique;
};

const choosePattern = (patterns: ShiftPatternRecord[]) =>
  patterns.find((pattern) => pattern.status === "active") ?? patterns[0] ?? null;

const toMinuteOfDay = (time?: string): number | null => {
  const matched = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!matched) {
    return null;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
};

// The schedule-plan grid encodes shifts by position: Day -> "D", Evening -> "E", Night -> "N"
// (see schedule-plan-adapter supportedWorkingDutyCodes). A site's shift pattern, however, may use
// its own duty letters (e.g. A/B/C 3교대). Map a pattern step's working window to the grid duty
// position by time-of-day so those sites still resolve shift times instead of restoring no-time
// items (which previously made holiday/substitute work compute to 0 minutes).
const classifyGridDutyCode = (
  source: DutyTimeSource
): SchedulePlanWorkingDutyCode | null => {
  const startMinute = toMinuteOfDay(source.startTime);

  if (startMinute === null) {
    return null;
  }

  const endMinute = toMinuteOfDay(source.endTime);
  const crossesMidnight = endMinute !== null && endMinute <= startMinute;

  if (crossesMidnight || startMinute >= 17 * 60) {
    return "N";
  }

  if (startMinute >= 12 * 60) {
    return "E";
  }

  return "D";
};

const buildDutyTimeSourceMap = (pattern: ShiftPatternRecord) => {
  const result = new Map<string, DutyTimeSource>();
  const steps =
    pattern.cycles.length > 0
      ? pattern.cycles.flatMap((cycle) => cycle.steps)
      : pattern.steps;

  steps.forEach((step) => {
    const dutyCode = normalizeDutyCode(step.dutyCode);

    if (!result.has(dutyCode)) {
      result.set(dutyCode, {
        startTime: step.startTime,
        endTime: step.endTime,
        breakMinutes: step.breakMinutes
      });
    }
  });

  // Backfill the grid-positional D/E/N codes from time-of-day classification when the pattern
  // does not already define them. Patterns that natively use D/E/N (e.g. 판교DC) keep their own
  // windows because existing keys are never overwritten.
  steps.forEach((step) => {
    const source: DutyTimeSource = {
      startTime: step.startTime,
      endTime: step.endTime,
      breakMinutes: step.breakMinutes
    };
    const gridDutyCode = classifyGridDutyCode(source);

    if (gridDutyCode && !result.has(gridDutyCode)) {
      result.set(gridDutyCode, source);
    }
  });

  return result;
};

export const classifyGridDutyCodeForTest = classifyGridDutyCode;
export const buildDutyTimeSourceMapForTest = buildDutyTimeSourceMap;

const parseExportedPlanIdentity = async (filePath: string): Promise<ExportedPlanIdentity | null> => {
  const [layout, workbook] = await Promise.all([
    inspectSchedulePlanTemplate(filePath),
    readWorkbook(filePath)
  ]);
  const worksheet = workbook.getWorksheet(layout.sheetName) ?? workbook.worksheets[0];
  const scheduleMonth = resolveScheduleMonthFromCell(worksheet.getCell(layout.monthTitleCell).value);
  const siteName = normalizeText(worksheet.getCell(layout.siteNameCell).value);

  if (!scheduleMonth || !siteName) {
    return null;
  }

  return {
    filePath,
    scheduleMonth,
    siteName
  };
};

const findExportedPlanFile = async (input: {
  scheduleExportDir: string;
  scheduleMonth: string;
  siteName: string;
}) => {
  const filePaths = await listMonthCandidateFiles(input.scheduleExportDir, input.scheduleMonth);

  for (const filePath of filePaths) {
    try {
      const identity = await parseExportedPlanIdentity(filePath);

      if (
        identity?.scheduleMonth === input.scheduleMonth &&
        normalizeLookupKey(identity.siteName) === normalizeLookupKey(input.siteName)
      ) {
        return filePath;
      }
    } catch {
      // Ignore non-schedule workbooks in the export folder.
    }
  }

  return null;
};

const parseMonthlyScheduleItemsFromExportedPlan = async (input: {
  filePath: string;
  scheduleMonth: string;
  employeesByName: Map<string, EmployeeRecord>;
  dutyTimeSources: Map<string, DutyTimeSource>;
}) => {
  const [layout, workbook] = await Promise.all([
    inspectSchedulePlanTemplate(input.filePath),
    readWorkbook(input.filePath)
  ]);
  const worksheet = workbook.getWorksheet(layout.sheetName) ?? workbook.worksheets[0];

  return layout.rescheduleDateCells.flatMap((dateAddress, dayIndex) => {
    const rowNumber = Number(dateAddress.match(/\d+$/)?.[0] ?? dayIndex + 12);
    const workDate = resolveWorkDateFromCell(
      worksheet.getCell(dateAddress).value,
      input.scheduleMonth
    );

    if (!workDate.startsWith(`${input.scheduleMonth}-`)) {
      return [];
    }

    return layout.supportedWorkingDutyCodes.flatMap((dutyCode: SchedulePlanWorkingDutyCode) => {
      const dutyTime = input.dutyTimeSources.get(dutyCode) ?? {
        breakMinutes: 0
      };
      const regularColumns = layout.regularPlanColumns[dutyCode] ?? [];

      return regularColumns.flatMap((columnLetter, slotIndex) =>
        parseWorkerNames(worksheet.getCell(`${columnLetter}${rowNumber}`).value).flatMap(
          (workerName) => {
            const employee = input.employeesByName.get(normalizeLookupKey(workerName));

            if (!employee) {
              return [];
            }

            return [
              {
                employeeCode: employee.employeeCode,
                teamLabel:
                  employee.currentShiftGroup?.toUpperCase() === "POOL"
                    ? undefined
                    : employee.currentShiftGroup,
                sortOrder: slotIndex,
                workDate,
                dutyCode,
                startTime: dutyTime.startTime,
                endTime: dutyTime.endTime,
                breakMinutes: dutyTime.breakMinutes
              }
            ];
          }
        )
      );
    });
  });
};

const buildMissingScheduleTargets = () => {
  const sitesByName = new Map(
    listStoredSites({ includeDeleted: true }).map((site) => [normalizeLookupKey(site.name), site])
  );
  const existingScheduleKeys = new Set(
    listStoredMonthlySchedules().map(
      (schedule) => `${schedule.siteId}:${schedule.scheduleMonth}`
    )
  );
  const targets = new Map<string, { site: SiteRecord; scheduleMonth: string }>();

  listStoredPerformanceFileDetails(undefined, {
    resolveApprovalFields: false,
    resolveEntryApprovalStatus: false
  }).forEach((detail) => {
    if (!detail.scheduleMonth || !detail.siteName) {
      return;
    }

    const site = sitesByName.get(normalizeLookupKey(detail.siteName));

    if (!site) {
      return;
    }

    const key = `${site.id}:${detail.scheduleMonth}`;

    if (existingScheduleKeys.has(key)) {
      return;
    }

    targets.set(key, {
      site,
      scheduleMonth: detail.scheduleMonth
    });
  });

  return Array.from(targets.values());
};

export const restoreMissingMonthlySchedulesFromExportedPlans = async (
  input: RestoreMissingMonthlySchedulesInput
): Promise<RestoreMissingMonthlySchedulesSummary> => {
  const targets = buildMissingScheduleTargets();
  const issueMessages: string[] = [];
  let restoredScheduleCount = 0;
  let skippedScheduleCount = 0;

  for (const target of targets) {
    const patterns = listStoredShiftPatterns(target.site.id);
    const pattern = choosePattern(patterns);

    if (!pattern) {
      skippedScheduleCount += 1;
      issueMessages.push(`${target.scheduleMonth} ${target.site.name} 근무패턴을 찾지 못했습니다.`);
      continue;
    }

    const exportedPlanPath = await findExportedPlanFile({
      scheduleExportDir: input.scheduleExportDir,
      scheduleMonth: target.scheduleMonth,
      siteName: target.site.name
    });

    if (!exportedPlanPath) {
      skippedScheduleCount += 1;
      issueMessages.push(`${target.scheduleMonth} ${target.site.name} 배포 근무표 파일을 찾지 못했습니다.`);
      continue;
    }

    const employees = listStoredEmployees({ siteId: target.site.id });
    const employeesByName = buildUniqueEmployeeDisplayNameMap(employees);
    const items = await parseMonthlyScheduleItemsFromExportedPlan({
      filePath: exportedPlanPath,
      scheduleMonth: target.scheduleMonth,
      employeesByName,
      dutyTimeSources: buildDutyTimeSourceMap(pattern)
    });

    if (items.length === 0) {
      skippedScheduleCount += 1;
      issueMessages.push(`${target.scheduleMonth} ${target.site.name} 배포 근무표에서 복원할 근무자를 찾지 못했습니다.`);
      continue;
    }

    saveStoredMonthlySchedule({
      siteId: target.site.id,
      scheduleMonth: target.scheduleMonth,
      patternId: pattern.id,
      generatedBy: "system-restore",
      items
    });
    restoredScheduleCount += 1;
  }

  return {
    checkedScheduleCount: targets.length,
    restoredScheduleCount,
    skippedScheduleCount,
    issueMessages
  };
};
