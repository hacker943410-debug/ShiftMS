import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { inspectDocumentTemplateImport } from "./document-template-management-service";
import { previewDocumentTemplateFile } from "./document-template-preview-service";

const previewRoot = path.resolve(process.cwd(), "artifacts", "tests", "template-preview");
const expectedBrandLogoLength = readFileSync(
  path.resolve(process.cwd(), "src", "renderer", "assets", "brand-logo-clean.png")
).length;

const readWorksheetImageBufferLength = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet | undefined
) => {
  const imageId = Number(worksheet?.getImages()[0]?.imageId ?? Number.NaN);

  if (!Number.isFinite(imageId)) {
    return 0;
  }

  const buffer = workbook.model.media?.[imageId]?.buffer as unknown as Uint8Array | undefined;

  return buffer?.byteLength ?? 0;
};

describe("document-template-preview-service", () => {
  afterEach(() => {
    rmSync(previewRoot, { recursive: true, force: true });
  });

  it("should generate a schedule template preview workbook", async () => {
    const sourcePath = path.resolve(process.cwd(), "양식샘플", "근무표_템플릿1.xlsx");
    const outputPath = path.resolve(previewRoot, "schedule-preview.xlsx");
    const inspection = await inspectDocumentTemplateImport({
      templateType: "schedule",
      sourcePath
    });

    expect(inspection.profile.kind).toBe("schedule");
    if (inspection.profile.kind !== "schedule") {
      return;
    }

    await previewDocumentTemplateFile(
      {
        templateType: "schedule",
        versionLabel: "근무표 미리보기",
        sourcePath,
        profile: inspection.profile
      },
      {
        outputPath
      }
    );

    expect(existsSync(outputPath)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const worksheet = workbook.getWorksheet("교대 근무 계획표");

    expect(
      String(worksheet?.getCell(inspection.profile.layout.siteNameCell).value ?? "")
    ).toBe("미리보기 근무지");
    expect(
      String(
        worksheet?.getCell(`${inspection.profile.layout.changeReasonColumn}12`).value ?? ""
      )
    ).toBe("미리보기");
  });

  it("should use generic attachment profile coordinates when building a preview", async () => {
    const sourcePath = path.resolve(process.cwd(), "양식샘플", "별첨1_샘플.xlsx");
    const outputPath = path.resolve(previewRoot, "attachment1-preview.xlsx");

    await previewDocumentTemplateFile(
      {
        templateType: "attachment1",
        versionLabel: "별첨1 미리보기",
        sourcePath,
        profile: {
          kind: "generic",
          primarySheetName: "별첨1",
          fieldMappings: {
            sheetName: "별첨1",
            titleCell: "B2",
            dataStartRow: "8"
          }
        }
      },
      {
        outputPath
      }
    );

    expect(existsSync(outputPath)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const worksheet = workbook.getWorksheet("별첨1");

    expect(String(worksheet?.getCell("B2").value ?? "")).toContain("2026년 3월");
    expect(String(worksheet?.getCell("B2").value ?? "")).toContain("DT사업1팀");
    expect(String(worksheet?.getCell("B8").value ?? "")).toBe("EMP-001");
    expect(String(worksheet?.getCell("C8").value ?? "")).toBe("가람");
    expect(readWorksheetImageBufferLength(workbook, worksheet)).toBe(expectedBrandLogoLength);
  });
});
