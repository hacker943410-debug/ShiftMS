import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { createDocumentTemplateCanvasSnapshot } from "./document-template-canvas-service";
import {
  createDefaultNonScheduleTemplateProfile,
  normalizeDocumentTemplateProfile
} from "./document-template-profile-service";

describe("document-template-canvas-service", () => {
  it("should build a schedule canvas snapshot with semantic zones and labels", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("교대 근무 계획표");
    worksheet.getCell("A1").value = "서울센터";
    worksheet.getCell("A2").value = "2026년 4월";
    worksheet.getCell("L4").value = "근무조 요약";
    worksheet.getCell("P24").value = "marker";

    const profile = normalizeDocumentTemplateProfile(
      "schedule",
      {
        kind: "schedule",
        templateFamily: "sample1",
        layout: {
          variant: "sample1",
          sheetName: "교대 근무 계획표",
          siteNameCell: "A1",
          monthTitleCell: "A2",
          rosterSummaryCell: "L4",
          monthAnchorCells: ["B2"],
          weekBlocks: [
            {
              dateRow: 6,
              daySlots: [
                {
                  dateAddress: "C6",
                  dutyCellAddresses: {
                    D: ["C7"],
                    E: ["C8"],
                    N: ["C9"],
                    O: ["C10"]
                  }
                },
                {
                  dateAddress: "F6",
                  dutyCellAddresses: {
                    D: ["F7"],
                    E: ["F8"],
                    N: ["F9"]
                  }
                }
              ]
            }
          ],
          rescheduleDateCells: [],
          supportedWorkingDutyCodes: ["D", "E", "N"],
          regularPlanColumns: {},
          changedPlanColumns: {},
          changeReasonColumn: "N",
          changeReasonColumns: ["N"]
        }
      },
      "교대 근무 계획표"
    );

    expect(profile).toBeDefined();

    const snapshot = createDocumentTemplateCanvasSnapshot({
      workbook,
      templateType: "schedule",
      profile: profile!,
      titleCandidates: [
        { sheetName: "교대 근무 계획표", address: "A1", text: "서울센터" },
        { sheetName: "교대 근무 계획표", address: "A2", text: "2026년 4월" }
      ]
    });

    expect(snapshot.sheetName).toBe("교대 근무 계획표");
    expect(snapshot.maxRow).toBe(24);
    expect(snapshot.maxColumn).toBe(16);
    expect(snapshot.zones.some((zone) => zone.id === "schedule-site-name")).toBe(true);
    expect(snapshot.zones.some((zone) => zone.id.startsWith("schedule-week-"))).toBe(true);
    expect(snapshot.labels.map((label) => label.text)).toContain("2026년 4월");
  });

  it("should provide fallback zones when semantic zones are missing", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("별첨1");
    worksheet.getCell("A1").value = "2026년 4월";
    worksheet.getCell("L36").value = "marker";

    const profile = {
      ...createDefaultNonScheduleTemplateProfile("attachment1", "별첨1"),
      semanticZones: []
    };
    const snapshot = createDocumentTemplateCanvasSnapshot({
      workbook,
      templateType: "attachment1",
      profile,
      titleCandidates: [{ sheetName: "별첨1", address: "A1", text: "2026년 4월" }]
    });

    expect(snapshot.zones).toHaveLength(2);
    expect(snapshot.zones.some((zone) => zone.id === "fallback-attachment1-main")).toBe(true);
    expect(snapshot.zones.find((zone) => zone.id === "fallback-attachment1-main")?.bounds.endRow).toBe(28);
  });

  it("should clamp inferred zone bounds within the worksheet range", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("품의서");
    worksheet.getCell("A1").value = "품의서";
    worksheet.getCell("H12").value = "marker";

    const profile = normalizeDocumentTemplateProfile("proposal", {
      kind: "proposal",
      primarySheetName: "품의서",
      fieldMappings: {
        sheetName: "품의서",
        workMonthCell: "B2",
        printedDateCell: "G2",
        ownerDepartmentCell: "B4",
        systemNameCell: "B5",
        documentTitleCell: "B1",
        summaryIntroCell: "B7",
        scopeCell: "B8",
        targetHeadcountCell: "F8",
        sectionTitleCell: "B10",
        dataStartRow: "999"
      }
    }, "품의서");

    expect(profile).toBeDefined();

    const snapshot = createDocumentTemplateCanvasSnapshot({
      workbook,
      templateType: "proposal",
      profile: profile!,
      titleCandidates: [{ sheetName: "품의서", address: "B1", text: "시간외근로수당 품의서" }]
    });

    const dataZone = snapshot.zones.find((zone) => zone.id === "proposal-dataStartRow");

    expect(dataZone).toBeDefined();
    expect(dataZone?.bounds.startRow).toBeLessThanOrEqual(12);
    expect(dataZone?.bounds.endRow).toBeLessThanOrEqual(12);
    expect(dataZone?.bounds.startColumn).toBeGreaterThanOrEqual(1);
  });
});
