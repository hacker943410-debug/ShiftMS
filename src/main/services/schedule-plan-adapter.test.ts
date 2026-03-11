import { describe, expect, it } from "vitest";

import {
  createSchedulePlanCellUpdates,
  getSampleSchedulePlanPath,
  inspectSchedulePlanTemplate
} from "./schedule-plan-adapter";

describe("inspectSchedulePlanTemplate", () => {
  it("should detect the schedule plan layout anchors from the sample workbook", async () => {
    const layout = await inspectSchedulePlanTemplate(getSampleSchedulePlanPath());

    expect(layout.sheetName).toBe("교대 근무 계획표");
    expect(layout.siteNameCell).toBe("C3");
    expect(layout.dateHeaderRow).toBe(9);
    expect(layout.shiftRows).toEqual({
      D: 10,
      E: 11,
      N: 12,
      O: 13
    });
    expect(layout.dateColumns.slice(0, 3)).toEqual([
      {
        address: "C9",
        date: "2024-10-27",
        columnNumber: 3
      },
      {
        address: "F9",
        date: "2024-10-28",
        columnNumber: 6
      },
      {
        address: "I9",
        date: "2024-10-29",
        columnNumber: 9
      }
    ]);
  });
});

describe("createSchedulePlanCellUpdates", () => {
  it("should map monthly assignments to schedule plan cell updates", async () => {
    const layout = await inspectSchedulePlanTemplate(getSampleSchedulePlanPath());
    const updates = createSchedulePlanCellUpdates({
      layout,
      siteName: "보라매DC",
      assignments: [
        {
          workDate: "2024-10-27",
          dutyCode: "D",
          displayValue: "C"
        },
        {
          workDate: "2024-10-28",
          dutyCode: "N",
          displayValue: "A"
        },
        {
          workDate: "2024-10-29",
          dutyCode: "OFF",
          displayValue: "A"
        }
      ]
    });

    expect(updates).toEqual([
      {
        address: "C3",
        value: "보라매DC"
      },
      {
        address: "C10",
        value: "C"
      },
      {
        address: "F12",
        value: "A"
      },
      {
        address: "I13",
        value: "A"
      }
    ]);
  });
});
