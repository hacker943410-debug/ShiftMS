import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { applyDocumentTemplateStyleSpec } from "./document-template-style-apply-service";

describe("document-template-style-apply-service", () => {
  it("should release stale merged cell masters before applying style merge ranges", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("품의서");

    worksheet.mergeCells("A1:B1");
    (worksheet.model as { merges?: string[] }).merges = [];

    expect(worksheet.getCell("B1").isMerged).toBe(true);

    expect(() =>
      applyDocumentTemplateStyleSpec({
        workbook,
        template: {
          validation: {
            sourceFileName: "proposal.xlsx",
            primarySheetName: "품의서",
            sheetNames: ["품의서"],
            titleCandidates: [],
            canProceed: true,
            messages: [],
            detectedZones: [],
            canvasSnapshot: null,
            inspectionWarnings: [],
            suggestedLabels: []
          },
          profile: {
            kind: "proposal",
            primarySheetName: "품의서",
            editorSchemaVersion: "2",
            semanticZones: [
              {
                id: "approvalHeader",
                label: "결재 헤더",
                description: "결재 헤더 병합 영역",
                role: "header",
                bindingType: "cell",
                bindings: ["B1"]
              }
            ],
            styleSpec: {
              mergedRanges: {
                approvalHeader: "B1:C1"
              }
            },
            fieldMappings: {}
          }
        }
      })
    ).not.toThrow();
    expect(new Set(((worksheet.model.merges ?? []) as string[]).map(String)).has("B1:C1")).toBe(true);
  });
});
