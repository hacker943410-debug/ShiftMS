import type { SchedulePlanPreviewRecord } from "../../shared/domain/schedule-plan";
import {
  createSchedulePlanCellUpdates,
  getSampleSchedulePlanPath,
  inspectSchedulePlanTemplate
} from "./schedule-plan-adapter";
import { listStoredMonthlySchedules } from "./monthly-schedule-storage-service";

const toGroupedAssignments = (
  schedule: ReturnType<typeof listStoredMonthlySchedules>[number]
) => {
  const groupedAssignments = new Map<string, string[]>();

  schedule.items.forEach((item) => {
    const key = `${item.workDate}::${item.dutyCode.trim().toUpperCase()}`;
    const displayValue = item.employeeCode ?? item.employeeName ?? item.employeeId;
    const current = groupedAssignments.get(key) ?? [];
    current.push(displayValue);
    groupedAssignments.set(key, current);
  });

  return Array.from(groupedAssignments.entries()).map(([key, displayValues]) => {
    const [workDate, dutyCode] = key.split("::");

    return {
      workDate,
      dutyCode,
      displayValue: displayValues.join(", ")
    };
  });
};

export const previewMonthlySchedulePlan = async (
  scheduleId: string
): Promise<SchedulePlanPreviewRecord | null> => {
  const schedule = listStoredMonthlySchedules().find((item) => item.id === scheduleId);

  if (!schedule || !schedule.siteName || !schedule.patternName) {
    return null;
  }

  const layout = await inspectSchedulePlanTemplate(getSampleSchedulePlanPath());
  const updates = createSchedulePlanCellUpdates({
    layout,
    siteName: schedule.siteName,
    assignments: toGroupedAssignments(schedule)
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
