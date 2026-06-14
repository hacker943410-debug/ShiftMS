import type { PerformanceFileDetail } from "../../shared/domain/performance-file";
import { listStoredHolidayCalendars } from "./operations-storage-service";

// Pure core (testable without a database): given the work dates the file actually contains and the
// public-holiday dates registered in the calendar, decide whether a holiday's work rows were almost
// certainly dropped during parse.
//
// Rule: fire only when a registered holiday date falls in a month the file actually has rows for, yet
// NO row of any kind is recorded on that holiday date. Holiday rows are only emitted when the returned
// workbook's date cell is holiday-marked (pink); when that marking is lost the holiday worker's row
// silently disappears, leaving the registered holiday completely unaccounted for. We compare against
// actual entry work dates (not the file's labelled scheduleMonth) so that:
//   - a holiday genuinely worked but recorded under 대체근무 (section "substitute") counts as accounted
//     and does NOT fire (any row on the date counts);
//   - a file whose rows spill into a different month than its label cannot be stranded by a holiday in
//     a month it has no rows for (the month must be among the rows' own months).
export const hasUnmarkedHolidayGapFromData = (input: {
  workDates: string[];
  registeredHolidayDates: string[];
}): boolean => {
  if (input.workDates.length === 0) {
    return false;
  }

  const relevantMonths = new Set(input.workDates.map((workDate) => workDate.slice(0, 7)));
  const workedDates = new Set(input.workDates);

  return input.registeredHolidayDates.some(
    (holidayDate) =>
      relevantMonths.has(holidayDate.slice(0, 7)) && !workedDates.has(holidayDate)
  );
};

// Database-backed wrapper: looks up the registered holidays for the years the file's rows touch and
// applies the pure rule above. Used to gate the auto-archive in approvePerformanceFile so that
// approving overtime alone never silently moves a file to 승인완료 when its holiday rows were dropped
// before the user could act.
export const detectUnmarkedHolidayGap = (
  detail: Pick<PerformanceFileDetail, "entries">
): boolean => {
  const workDates = detail.entries
    .map((entry) => entry.workDate)
    .filter((workDate): workDate is string => Boolean(workDate));

  if (workDates.length === 0) {
    return false;
  }

  const years = new Set(
    workDates
      .map((workDate) => Number(workDate.slice(0, 4)))
      .filter((year) => Number.isInteger(year))
  );
  const registeredHolidayDates = [...years]
    .flatMap((year) => listStoredHolidayCalendars(year))
    .flatMap((calendar) => calendar.items)
    .map((item) => item.holidayDate);

  return hasUnmarkedHolidayGapFromData({ workDates, registeredHolidayDates });
};
