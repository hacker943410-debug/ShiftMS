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

// Schedules saved by a restore that left some grid duty positions unresolved are tagged with this
// generatedBy marker so buildMissingScheduleTargets keeps the (site, month) eligible for re-restore.
const RESTORE_MARKER = "system-restore";
const PARTIAL_RESTORE_MARKER = "system-restore-partial";

interface RestoreScheduleTarget {
  site: SiteRecord;
  scheduleMonth: string;
  // The id of an existing incomplete restore schedule for this (site, month), reused on re-restore so
  // the row is REPLACED rather than duplicated (saveStoredMonthlySchedule has no unique (site, month)
  // constraint). Set for both partial-marked rows and legacy "system-restore" rows with null-time items.
  existingScheduleId?: string;
  // Signature of that existing row's items; if a re-restore reproduces it byte-for-byte we skip the
  // write (and the restored count) so a permanently-stuck cell does not churn startup reparse each boot.
  existingItemSignature?: string;
}

// A stable, order-independent fingerprint of a schedule's restorable content. Excludes ids/names and
// team/sort metadata so a no-op re-restore compares equal to the persisted row.
const scheduleItemSignature = (
  items: Array<{
    employeeCode?: string;
    workDate: string;
    dutyCode: string;
    startTime?: string;
    endTime?: string;
    breakMinutes: number;
  }>
): string =>
  items
    .map((item) =>
      [
        item.employeeCode ?? "",
        item.workDate,
        item.dutyCode,
        item.startTime ?? "",
        item.endTime ?? "",
        item.breakMinutes
      ].join("|")
    )
    .sort()
    .join("\n");

const supportedFileExtensions = new Set([".xlsx", ".xlsm", ".xls"]);

const normalizeText = (value: unknown) => String(value ?? "").replace(/\uFEFF/g, "").trim();

const normalizeLookupKey = (value: unknown) =>
  normalizeText(value).replace(/[\s_]+/g, "").toLowerCase();


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
  // Accept HH:MM and HH:MM:SS (storage may keep either form).
  const matched = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!matched) {
    return null;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  const second = matched[3] === undefined ? 0 : Number(matched[3]);

  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  return hour * 60 + minute;
};

const hasUsableWindow = (source?: DutyTimeSource): boolean => {
  const startMinute = toMinuteOfDay(source?.startTime);
  const endMinute = toMinuteOfDay(source?.endTime);

  // Both ends must parse, and a zero-length window (start === end) is not a real shift — it would
  // otherwise compute to a phantom 24-hour span downstream, so it is treated as having no usable time.
  return startMinute !== null && endMinute !== null && startMinute !== endMinute;
};

// The schedule-plan grid encodes shifts by position: Day -> "D", Evening -> "E", Night -> "N"
// (see schedule-plan-adapter supportedWorkingDutyCodes). A site's shift pattern may use its own
// duty letters (e.g. A/B/C 3교대) or even mislabel them, so we classify each working window to a
// grid position purely by its start time / overnight span — the pattern's own letter is ignored.
// This keeps non-D/E/N patterns working without trusting a literal code that may not match its time.
const classifyGridDutyCode = (
  source: DutyTimeSource
): SchedulePlanWorkingDutyCode | null => {
  const startMinute = toMinuteOfDay(source.startTime);

  if (startMinute === null) {
    return null;
  }

  const rawEndMinute = toMinuteOfDay(source.endTime);

  // A degenerate window whose end equals its start carries no usable duration (it would compute to a
  // phantom ~24h shift downstream), so it cannot be assigned to any grid position — return null and
  // let the caller surface it as unresolved instead of persisting a 0-length window.
  if (rawEndMinute !== null && rawEndMinute === startMinute) {
    return null;
  }

  // An end of "00:00" means midnight = end of the day (1440), not the start of the day (0). Without
  // this, an evening shift like 16:00-00:00 would look like it spans midnight and be misread as Night.
  const endMinute = rawEndMinute === 0 ? 24 * 60 : rawEndMinute;
  // A strictly-earlier end means the shift spans midnight (overnight night shift).
  const crossesMidnight = endMinute !== null && endMinute < startMinute;

  // Night is the band that wraps midnight: a window that spans midnight, a late start (>= 17:00), or a
  // shift beginning exactly at midnight (a 00:00 start is the tail of a night rotation, e.g. 00:00-08:00).
  // The start is matched on === 0 (not < 06:00) so a genuine early-morning Day shift (e.g. 05:00-13:00)
  // is not misrouted to Night and does not collide with the real Night window under first-match-wins.
  if (crossesMidnight || startMinute >= 17 * 60 || startMinute === 0) {
    return "N";
  }

  if (startMinute >= 12 * 60) {
    return "E";
  }

  return "D";
};

// Build a Day/Evening/Night (D/E/N) -> shift-time map by classifying each pattern step's working
// window by time. Only steps with a complete, valid window contribute, and the first match per grid
// position wins. The pattern's own letters are never used as keys (the restore consumer only reads
// D/E/N), so a literal "D" step that has no time or a night window can no longer block or poison
// the result.
const buildDutyTimeSourceMap = (pattern: ShiftPatternRecord): Map<string, DutyTimeSource> => {
  const result = new Map<string, DutyTimeSource>();
  const steps =
    pattern.cycles.length > 0
      ? pattern.cycles.flatMap((cycle) => cycle.steps)
      : pattern.steps;

  steps.forEach((step) => {
    const source: DutyTimeSource = {
      startTime: step.startTime,
      endTime: step.endTime,
      breakMinutes: step.breakMinutes
    };

    if (!hasUsableWindow(source)) {
      return;
    }

    const gridDutyCode = classifyGridDutyCode(source);

    if (gridDutyCode && !result.has(gridDutyCode)) {
      result.set(gridDutyCode, source);
    }
  });

  return result;
};

export const classifyGridDutyCodeForTest = classifyGridDutyCode;
export const buildDutyTimeSourceMapForTest = buildDutyTimeSourceMap;
export const hasUsableWindowForTest = hasUsableWindow;

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
  // Grid duty codes that have a scheduled worker but no usable shift time from the pattern.
  // Such items are skipped (never persisted with a 0-length window) and surfaced as a warning so
  // the resulting holiday/substitute 0-minute outcome is visible rather than silent.
  const unresolvedDutyCodes = new Set<string>();

  const items = layout.rescheduleDateCells.flatMap((dateAddress, dayIndex) => {
    const rowNumber = Number(dateAddress.match(/\d+$/)?.[0] ?? dayIndex + 12);
    const workDate = resolveWorkDateFromCell(
      worksheet.getCell(dateAddress).value,
      input.scheduleMonth
    );

    if (!workDate.startsWith(`${input.scheduleMonth}-`)) {
      return [];
    }

    return layout.supportedWorkingDutyCodes.flatMap((dutyCode: SchedulePlanWorkingDutyCode) => {
      const dutyTime = input.dutyTimeSources.get(dutyCode);
      const dutyTimeIsUsable = hasUsableWindow(dutyTime);
      const regularColumns = layout.regularPlanColumns[dutyCode] ?? [];

      return regularColumns.flatMap((columnLetter, slotIndex) =>
        parseWorkerNames(worksheet.getCell(`${columnLetter}${rowNumber}`).value).flatMap(
          (workerName) => {
            const employee = input.employeesByName.get(normalizeLookupKey(workerName));

            if (!employee) {
              return [];
            }

            if (!dutyTime || !dutyTimeIsUsable) {
              // Worker is scheduled but the pattern gives no usable time for this grid position.
              unresolvedDutyCodes.add(dutyCode);
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

  return { items, unresolvedDutyCodes: [...unresolvedDutyCodes] };
};

const buildMissingScheduleTargets = (): RestoreScheduleTarget[] => {
  const sitesByName = new Map(
    listStoredSites({ includeDeleted: true }).map((site) => [normalizeLookupKey(site.name), site])
  );
  const storedSchedules = listStoredMonthlySchedules();
  const keyOf = (schedule: (typeof storedSchedules)[number]) =>
    `${schedule.siteId}:${schedule.scheduleMonth}`;
  const isRestoreSchedule = (schedule: (typeof storedSchedules)[number]) =>
    schedule.generatedBy === RESTORE_MARKER || schedule.generatedBy === PARTIAL_RESTORE_MARKER;
  // A restore-generated schedule counts as complete only when it is not partial-marked AND every item
  // carries a shift time. This also catches legacy 0.4.23 rows ("system-restore" with null-time items
  // for unresolved positions), so an upgraded install self-heals them once the pattern is fixed.
  const isCompleteRestore = (schedule: (typeof storedSchedules)[number]) =>
    schedule.generatedBy === RESTORE_MARKER &&
    schedule.items.every((item) => Boolean(item.startTime) && Boolean(item.endTime));
  // "Done" = a user-owned schedule (never auto-overwrite) OR a complete restore.
  const doneKeys = new Set(
    storedSchedules
      .filter((schedule) => !isRestoreSchedule(schedule) || isCompleteRestore(schedule))
      .map(keyOf)
  );
  // Incomplete restore rows (partial-marked, or legacy null-time rows) stay eligible; reuse their id so
  // a re-restore REPLACES the bad row rather than stacking a duplicate.
  const reusableScheduleByKey = new Map<string, (typeof storedSchedules)[number]>();

  storedSchedules
    .filter((schedule) => isRestoreSchedule(schedule) && !doneKeys.has(keyOf(schedule)))
    .forEach((schedule) => {
      const key = keyOf(schedule);

      if (!reusableScheduleByKey.has(key)) {
        reusableScheduleByKey.set(key, schedule);
      }
    });

  const targets = new Map<string, RestoreScheduleTarget>();

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

    if (doneKeys.has(key)) {
      return;
    }

    const reusable = reusableScheduleByKey.get(key);

    targets.set(key, {
      site,
      scheduleMonth: detail.scheduleMonth,
      existingScheduleId: reusable?.id,
      existingItemSignature: reusable ? scheduleItemSignature(reusable.items) : undefined
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
    const { items, unresolvedDutyCodes } = await parseMonthlyScheduleItemsFromExportedPlan({
      filePath: exportedPlanPath,
      scheduleMonth: target.scheduleMonth,
      employeesByName,
      dutyTimeSources: buildDutyTimeSourceMap(pattern)
    });

    if (unresolvedDutyCodes.length > 0) {
      issueMessages.push(
        `${target.scheduleMonth} ${target.site.name} 근무 패턴에서 ${unresolvedDutyCodes.join("/")} 근무의 시간을 확인하지 못해 해당 근무는 복원에서 제외했습니다. 근무 패턴의 근무 시간을 확인해 주세요.`
      );
    }

    if (items.length === 0) {
      skippedScheduleCount += 1;

      // When every worker was dropped because the pattern had no usable time, the unresolved-duty
      // warning above already explains why — do not also claim no workers were found in the export.
      if (unresolvedDutyCodes.length === 0) {
        issueMessages.push(
          `${target.scheduleMonth} ${target.site.name} 배포 근무표에서 복원할 근무자를 찾지 못했습니다.`
        );
      }
      continue;
    }

    // If a re-restore reproduces the existing incomplete row exactly (e.g. a still-unfixed partial),
    // skip the write and the restored count so startup recovery does not force an approved-file
    // reparse on every boot for a permanently-stuck cell.
    if (
      target.existingScheduleId &&
      target.existingItemSignature === scheduleItemSignature(items)
    ) {
      continue;
    }

    saveStoredMonthlySchedule({
      // Reuse the existing incomplete row's id so this save REPLACES it (and flips the marker to a full
      // restore once the pattern resolves) instead of stacking a duplicate (site, month) row.
      id: target.existingScheduleId,
      siteId: target.site.id,
      scheduleMonth: target.scheduleMonth,
      patternId: pattern.id,
      generatedBy: unresolvedDutyCodes.length > 0 ? PARTIAL_RESTORE_MARKER : RESTORE_MARKER,
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
