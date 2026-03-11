import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectExcelTemplate,
  parseAttachmentOnePreview
} from "./excel-template-parser";

const sampleDir = path.resolve(process.cwd(), "양식샘플");

describe("inspectExcelTemplate", () => {
  it("should detect the schedule plan template", async () => {
    const result = await inspectExcelTemplate(
      path.join(sampleDir, "배포_근무표샘플.xlsx")
    );

    expect(result).toMatchObject({
      templateKind: "schedule-plan",
      sheetName: "교대 근무 계획표"
    });
  });

  it("should detect the proposal template", async () => {
    const result = await inspectExcelTemplate(path.join(sampleDir, "품위서_샘플.xlsx"));

    expect(result).toMatchObject({
      templateKind: "proposal",
      sheetName: "품의서"
    });
  });
});

describe("parseAttachmentOnePreview", () => {
  it("should parse the first data row from attachment1", async () => {
    const result = await parseAttachmentOnePreview(path.join(sampleDir, "별첨1_샘플.xlsx"));

    expect(result).toEqual({
      no: 1,
      employeeCode: "2014015",
      employeeName: "박경훈",
      department: "울산CLX",
      category: "휴일근로",
      workDate: "2024-10-01",
      workHours: 10.5,
      baseHours: 10.5,
      rate: 1.5
    });
  });
});
