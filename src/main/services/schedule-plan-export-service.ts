import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { buildSchedulePlanCalendarDates, writeSchedulePlanWorkbook } from "./schedule-plan-adapter";
import { resolveDocumentTemplateSourcePathOrThrow } from "./document-template-source-path-service";
import { listStoredHolidayCalendars } from "./operations-storage-service";
import { saveStoredSchedulePlanExport } from "./schedule-plan-export-history-service";
import { previewMonthlySchedulePlan } from "./schedule-plan-preview-service";
import { listStoredMonthlySchedules } from "./monthly-schedule-storage-service";
import {
  resolveSchedulePlanTemplateLayout,
  resolveSchedulePlanTemplateVersion
} from "./schedule-plan-template-service";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

const getRowNumber = (address: string) => Number(address.match(/\d+$/)?.[0] ?? 0);
const CALENDAR_DEFAULT_FILL = "FFFFFFFF";
const HOLIDAY_FILL = "FFFFD1D1";
const SCHEDULE_ODD_ROW_FILL = "FFF2F2F2";
const SCHEDULE_EVEN_ROW_FILL = "FFFFFFFF";

const resolveUniqueOutputPath = (directoryPath: string, fileName: string) => {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let currentPath = path.resolve(directoryPath, fileName);
  let duplicateIndex = 1;

  while (existsSync(currentPath)) {
    currentPath = path.resolve(
      directoryPath,
      `${sanitizeFileSegment(baseName)}_${duplicateIndex}${extension}`
    );
    duplicateIndex += 1;
  }

  return currentPath;
};

const createScheduleCellFillUpdates = async (input: {
  template: ReturnType<typeof resolveSchedulePlanTemplateVersion>;
  scheduleMonth: string;
}) => {
  const [yearText, monthText] = input.scheduleMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return [];
  }

  const layout = await resolveSchedulePlanTemplateLayout(input.template);
  const calendarDates = buildSchedulePlanCalendarDates(input.scheduleMonth);
  const calendarYears = new Set(calendarDates.map((date) => Number(date.split("-")[0])));
  const holidayDates = new Set(
    Array.from(calendarYears)
      .flatMap((calendarYear) => listStoredHolidayCalendars(calendarYear))
      .flatMap((calendar) => calendar.items)
      .map((item) => item.holidayDate)
  );
  const cellFillMap = new Map<string, string>();
  let calendarIndex = 0;

  layout.weekBlocks.forEach((weekBlock) => {
    weekBlock.daySlots.forEach((daySlot) => {
      const workDate = calendarDates[calendarIndex];

      if (workDate) {
        cellFillMap.set(
          daySlot.dateAddress,
          holidayDates.has(workDate) ? HOLIDAY_FILL : CALENDAR_DEFAULT_FILL
        );
      }

      calendarIndex += 1;
    });
  });

  layout.rescheduleDateCells.forEach((dateAddress, index) => {
    if (index >= new Date(year, month, 0).getDate()) {
      return;
    }

    const workDate = `${input.scheduleMonth}-${String(index + 1).padStart(2, "0")}`;
    const rowNumber = getRowNumber(dateAddress);
    const rowFillColor = holidayDates.has(workDate)
      ? HOLIDAY_FILL
      : index % 2 === 0
        ? SCHEDULE_ODD_ROW_FILL
        : SCHEDULE_EVEN_ROW_FILL;
    cellFillMap.set(dateAddress, rowFillColor);

    layout.supportedWorkingDutyCodes.forEach((dutyCode) => {
      (layout.regularPlanColumns[dutyCode] ?? []).forEach((columnLetter) => {
        cellFillMap.set(`${columnLetter}${rowNumber}`, rowFillColor);
      });

      (layout.changedPlanColumns[dutyCode] ?? []).forEach((columnLetter) => {
        cellFillMap.set(`${columnLetter}${rowNumber}`, rowFillColor);
      });
    });

    (layout.changeReasonColumns ?? [layout.changeReasonColumn]).forEach((columnLetter) => {
      cellFillMap.set(`${columnLetter}${rowNumber}`, rowFillColor);
    });
  });

  return Array.from(cellFillMap.entries()).map(([address, colorArgb]) => ({
    address,
    colorArgb
  }));
};

export const exportMonthlySchedulePlan = async (input: {
  scheduleId: string;
  userDataPath: string;
  outputDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SchedulePlanExportRecord | null> => {
  const preview = await previewMonthlySchedulePlan(input.scheduleId);

  if (!preview) {
    return null;
  }

  const schedule = listStoredMonthlySchedules().find((item) => item.id === input.scheduleId);

  if (!schedule) {
    return null;
  }

  const template = resolveSchedulePlanTemplateVersion(schedule.templateVersionId);
  const [yearText, monthText] = preview.scheduleMonth.split("-");
  const numericMonth = Number(monthText);

  const outputRootDir =
    input.outputDir ??
    getStoredAppSettingsSnapshot({
      userDataPath: input.userDataPath,
      env: input.env
    }).scheduleExportDir;
  const outputDir = path.resolve(
    outputRootDir,
    `${yearText}년`,
    `${numericMonth}월`
  );
  mkdirSync(outputDir, { recursive: true });

  const requestedOutputFileName = `${yearText}_${numericMonth}_${sanitizeFileSegment(
    preview.siteName
  )}.xlsx`;
  const outputPath = resolveUniqueOutputPath(outputDir, requestedOutputFileName);
  const outputFileName = path.basename(outputPath);
  const cellFillUpdates = await createScheduleCellFillUpdates({
    template,
    scheduleMonth: preview.scheduleMonth
  });

  await writeSchedulePlanWorkbook({
    templatePath: resolveDocumentTemplateSourcePathOrThrow(template),
    outputPath,
    updates: preview.updates,
    cellFillUpdates,
    template
  });

  return saveStoredSchedulePlanExport({
    scheduleId: preview.scheduleId,
    scheduleMonth: preview.scheduleMonth,
    siteName: preview.siteName,
    patternName: preview.patternName,
    templateVersionId: template.id,
    templateVersionLabel: template.versionLabel,
    outputFileName,
    outputPath,
    updateCount: preview.updateCount,
    publishStatus: "draft",
    exportedAt: new Date().toISOString()
  });
};
