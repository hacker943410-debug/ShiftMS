export interface SchedulePlanCellUpdate {
  address: string;
  value: string;
}

export interface SchedulePlanTemplateLayout {
  sheetName: string;
  siteNameCell: string;
  dateHeaderRow: number;
  dateColumns: Array<{
    address: string;
    date: string;
    columnNumber: number;
  }>;
  shiftRows: Record<"D" | "E" | "N" | "O", number>;
}

export interface SchedulePlanAssignment {
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
  outputFileName: string;
  outputPath: string;
  updateCount: number;
  publishStatus?: "draft" | "published";
  publishedPath?: string;
  exportedAt: string;
}
