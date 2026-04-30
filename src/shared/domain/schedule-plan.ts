export const SCHEDULE_PLAN_CALENDAR_DATE_FORMAT = 'dd"일"';

export interface SchedulePlanCellUpdate {
  address: string;
  value: string | number | Date | null;
  numberFormat?: string;
  numberFormatAddresses?: string[];
}

export type SchedulePlanWorkingDutyCode = "D" | "E" | "N";

export type SchedulePlanDutyCode = SchedulePlanWorkingDutyCode | "O";

export type SchedulePlanTemplateVariant = "sample1" | "sample2";

export interface SchedulePlanTemplateDaySlot {
  dateAddress: string;
  dutyCellAddresses: Partial<Record<SchedulePlanDutyCode, string[]>>;
}

export interface SchedulePlanTemplateWeekBlock {
  dateRow: number;
  daySlots: SchedulePlanTemplateDaySlot[];
}

export interface SchedulePlanTemplateLayout {
  variant: SchedulePlanTemplateVariant;
  sheetName: string;
  siteNameCell: string;
  monthTitleCell: string;
  rosterSummaryCell: string;
  monthAnchorCells: string[];
  weekBlocks: SchedulePlanTemplateWeekBlock[];
  rescheduleDateCells: string[];
  supportedWorkingDutyCodes: SchedulePlanWorkingDutyCode[];
  regularPlanColumns: Partial<Record<SchedulePlanWorkingDutyCode, string[]>>;
  changedPlanColumns: Partial<Record<SchedulePlanWorkingDutyCode, string[]>>;
  changeReasonColumn: string;
  changeReasonColumns?: string[];
}

export interface SchedulePlanAssignment {
  teamLabel?: string;
  workDate: string;
  dutyCode: string;
  displayValue: string;
}

export interface SchedulePlanPreviewRecord {
  scheduleId: string;
  scheduleMonth: string;
  siteName: string;
  patternName: string;
  templateSheetName: string;
  updateCount: number;
  updates: SchedulePlanCellUpdate[];
}

export interface SchedulePlanExportRecord {
  id: string;
  scheduleId: string;
  scheduleMonth: string;
  siteName: string;
  patternName: string;
  templateVersionId?: string;
  templateVersionLabel?: string;
  outputFileName: string;
  outputPath: string;
  updateCount: number;
  publishStatus?: "draft" | "published";
  publishedPath?: string;
  exportedAt: string;
}
