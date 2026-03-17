import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildSchedulePlanCalendarDates,
  inspectSchedulePlanTemplate
} from "./schedule-plan-adapter";

const template1Path = path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx");
const template2Path = path.resolve(process.cwd(), "양식샘플", "근무표_템플릿2.xlsx");

describe("buildSchedulePlanCalendarDates", () => {
  it("should build a fixed 6-week calendar grid for the target month", () => {
    const dates = buildSchedulePlanCalendarDates("2024-10");

    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2024-09-29");
    expect(dates[41]).toBe("2024-11-09");
  });
});

describe("inspectSchedulePlanTemplate", () => {
  it("should detect the layout anchors from template1", async () => {
    const layout = await inspectSchedulePlanTemplate(template1Path);

    expect(layout.variant).toBe("sample1");
    expect(layout.sheetName).toBe("교대 근무 계획표");
    expect(layout.siteNameCell).toBe("C3");
    expect(layout.monthTitleCell).toBe("W6");
    expect(layout.rosterSummaryCell).toBe("B7");
    expect(layout.monthAnchorCells).toEqual(["AY8", "BK8", "BK30"]);
    expect(layout.supportedWorkingDutyCodes).toEqual(["D", "E", "N"]);
    expect(layout.weekBlocks.map((block) => block.dateRow)).toEqual([9, 15, 21, 27, 33, 39]);
    expect(layout.weekBlocks[0]?.daySlots[0]).toEqual({
      dateAddress: "C9",
      dutyCellAddresses: {
        D: ["D10"],
        E: ["D11"],
        N: ["D12"],
        O: ["D13", "D14"]
      }
    });
    expect(layout.regularPlanColumns).toEqual({
      D: ["Z", "AA", "AB", "AC"],
      E: ["AD", "AE", "AF", "AG"],
      N: ["AH", "AI", "AJ", "AK"]
    });
    expect(layout.changeReasonColumn).toBe("AX");
    expect(layout.changeReasonColumns).toEqual(["AX", "AY"]);
  });

  it("should detect the layout anchors from template2", async () => {
    const layout = await inspectSchedulePlanTemplate(template2Path);

    expect(layout.variant).toBe("sample2");
    expect(layout.sheetName).toBe("교대 근무 계획표");
    expect(layout.siteNameCell).toBe("C3");
    expect(layout.monthTitleCell).toBe("W6");
    expect(layout.rosterSummaryCell).toBe("B7");
    expect(layout.monthAnchorCells).toEqual(["BG8", "BS8", "BS30"]);
    expect(layout.supportedWorkingDutyCodes).toEqual(["D", "N"]);
    expect(layout.weekBlocks.map((block) => block.dateRow)).toEqual([9, 19, 29, 39, 49, 59]);
    expect(layout.weekBlocks[0]?.daySlots[0]).toEqual({
      dateAddress: "C9",
      dutyCellAddresses: {
        D: ["C10", "D10", "E10"],
        N: ["D13"],
        O: ["D14", "D15", "D16", "D17", "D18"]
      }
    });
    expect(layout.regularPlanColumns).toEqual({
      D: ["Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK"],
      N: ["AL", "AM", "AN", "AO"]
    });
    expect(layout.changeReasonColumn).toBe("BF");
    expect(layout.changeReasonColumns).toEqual(["BF", "BG"]);
  });
});
