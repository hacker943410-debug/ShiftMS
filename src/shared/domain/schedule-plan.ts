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
