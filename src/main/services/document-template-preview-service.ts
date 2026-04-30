import path from "node:path";
import { mkdirSync } from "node:fs";

import ExcelJS from "exceljs";

import { APP_DISPLAY_NAME } from "../../shared/config/app-brand";
import type {
  DocumentTemplatePreviewInput,
  DocumentTemplatePreviewRecord
} from "../../shared/bridge/contracts";
import {
  ALLOWANCE_DOCUMENT_OWNER_DEPARTMENT,
  buildAllowanceAttachmentOneTitle,
  buildAllowanceAttachmentTwoTitle
} from "../../shared/domain/allowance-document";
import type { DocumentTemplateVersion } from "../../shared/domain/model";
import { SCHEDULE_PLAN_CALENDAR_DATE_FORMAT } from "../../shared/domain/schedule-plan";
import {
  buildSchedulePlanCalendarDates,
  buildSchedulePlanDateBlockAddresses
} from "./schedule-plan-adapter";
import {
  getCurrentDocumentTemplateProfileSchemaVersion,
  normalizeDocumentTemplateProfile,
  resolveAttachmentOneTemplateFields,
  resolveAttachmentTwoTemplateFields,
  resolveProposalTemplateFields
} from "./document-template-profile-service";
import { applyWorkbookBrandLogo } from "./document-brand-logo-service";
import { applyDocumentTemplateStyleSpec } from "./document-template-style-apply-service";

const readWorkbook = async (filePath: string) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  applyWorkbookBrandLogo(workbook);

  return workbook;
};

const createPreviewTemplateVersion = (
  input: DocumentTemplatePreviewInput
): DocumentTemplateVersion => ({
  id: "preview",
  templateType: input.templateType,
  versionLabel: input.versionLabel ?? "미리보기",
  sourcePath: input.sourcePath,
  status: "pending",
  isDefault: false,
  profileSchemaVersion: getCurrentDocumentTemplateProfileSchemaVersion(),
  profile: normalizeDocumentTemplateProfile(input.templateType, input.profile),
  createdAt: new Date().toISOString()
});

const parseDateValue = (value: string) => {
  const [yearText, monthText, dayText] = value.split("-");
  return new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
};

const clearCellRange = (
  worksheet: ExcelJS.Worksheet,
  input: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  }
) => {
  for (let rowNumber = input.startRow; rowNumber <= input.endRow; rowNumber += 1) {
    for (let columnNumber = input.startColumn; columnNumber <= input.endColumn; columnNumber += 1) {
      worksheet.getRow(rowNumber).getCell(columnNumber).value = null;
    }
  }
};

const fillSchedulePreview = async (
  workbook: ExcelJS.Workbook,
  input: DocumentTemplatePreviewInput
) => {
  if (input.profile.kind !== "schedule") {
    throw new Error("근무표 미리보기 프로필이 올바르지 않습니다.");
  }

  const { layout } = input.profile;
  const worksheet = workbook.getWorksheet(layout.sheetName) ?? workbook.worksheets[0];
  const monthValue = "2026-03";
  const monthStart = new Date(2026, 2, 1);
  const calendarDates = buildSchedulePlanCalendarDates(monthValue);
  const teamCodes = {
    D: ["A", "B"],
    E: ["C"],
    N: ["D"],
    O: ["E", "F"]
  } satisfies Record<"D" | "E" | "N" | "O", string[]>;

  worksheet.getCell(layout.siteNameCell).value = "미리보기 근무지";
  worksheet.getCell(layout.monthTitleCell).value = monthStart;
  worksheet.getCell(layout.rosterSummaryCell).value =
    "A: 가람, 나래     B: 다온, 라온     C: 마루, 바다\n◎교대근무 구조: Work Type - 6조 3교대, Staffing - 1조 2명";
  layout.monthAnchorCells.forEach((address) => {
    worksheet.getCell(address).value = monthStart;
  });

  let calendarIndex = 0;
  layout.weekBlocks.forEach((weekBlock) => {
    weekBlock.daySlots.forEach((daySlot) => {
      const workDate = calendarDates[calendarIndex];
      const dateCell = worksheet.getCell(daySlot.dateAddress);

      dateCell.value = workDate ? parseDateValue(workDate) : null;
      buildSchedulePlanDateBlockAddresses(daySlot.dateAddress).forEach((address) => {
        worksheet.getCell(address).numFmt = SCHEDULE_PLAN_CALENDAR_DATE_FORMAT;
      });

      Object.entries(daySlot.dutyCellAddresses).forEach(([dutyCode, addresses]) => {
        if (!addresses || addresses.length === 0) {
          return;
        }

        const values = teamCodes[dutyCode as keyof typeof teamCodes] ?? [];
        addresses.forEach((address, index) => {
          worksheet.getCell(address).value = values[index] ?? (dutyCode === "O" ? "-" : null);
        });
      });

      calendarIndex += 1;
    });
  });

  layout.rescheduleDateCells.forEach((address, index) => {
    const workDate = `${monthValue}-${String(index + 1).padStart(2, "0")}`;
    worksheet.getCell(address).value = parseDateValue(workDate);
  });

  layout.supportedWorkingDutyCodes.forEach((dutyCode) => {
    const regularColumns = layout.regularPlanColumns[dutyCode] ?? [];

    regularColumns.slice(0, 3).forEach((columnLetter, index) => {
      worksheet.getCell(`${columnLetter}12`).value = ["가람", "나래", "다온"][index] ?? "-";
    });
  });

  worksheet.getCell(`${layout.changeReasonColumn}12`).value = "미리보기";
};

const fillProposalPreview = (workbook: ExcelJS.Workbook, template: DocumentTemplateVersion) => {
  if (
    path.basename(template.sourcePath) ===
    "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
  ) {
    const worksheet = workbook.getWorksheet("품의서") ?? workbook.worksheets[0];

    worksheet.getCell("C5").value = "2026-03";
    worksheet.getCell("E5").value = "2026.03.23";
    worksheet.getCell("A11").value =
      `제  목  :  ${ALLOWANCE_DOCUMENT_OWNER_DEPARTMENT} 스케쥴근무 시간외 근로 수당 지급 품의`;
    worksheet.getCell("C12").value =
      "2026년 3월에 발생한 스케쥴근무자의 시간외 근로 수당 지급 승인을 요청드립니다.";
    worksheet.getCell("B16").value = " ② 당월 지급 대상자 :  3명";
    worksheet.getCell("B18").value = "2. 3월 지급 요청 내역";

    clearCellRange(worksheet, {
      startRow: 21,
      endRow: 32,
      startColumn: 2,
      endColumn: 8
    });

    [
      ["교대근무", "운영", "보라매DC", "-", 120000, "-", 120000],
      ["교대근무", "운영", "을지로DC", "-", 84000, 32000, 116000],
      ["합 계", null, null, "-", 204000, 32000, 236000]
    ].forEach((row, index) => {
      const rowNumber = 21 + index;
      row.forEach((value, columnIndex) => {
        worksheet.getCell(rowNumber, columnIndex + 2).value = value;
      });
    });

    return;
  }

  const fields = resolveProposalTemplateFields(template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];

  worksheet.getCell(fields.workMonthCell).value = "2026-03";
  worksheet.getCell(fields.printedDateCell).value = "2026.03.17";
  worksheet.getCell(fields.ownerDepartmentCell).value = "교대근무 운영";
  worksheet.getCell(fields.systemNameCell).value = `${APP_DISPLAY_NAME} 미리보기`;
  worksheet.getCell(fields.documentTitleCell).value =
    "제  목  :  2026년 3월 교대근무 시간외근로 수당 지급 품의";
  worksheet.getCell(fields.summaryIntroCell).value =
    "2026년 3월 승인 완료 수당 미리보기 3건의 지급 승인을 요청드립니다.";
  worksheet.getCell(fields.scopeCell).value = "① 지급 범위 : 2026년 3월 승인 완료 교대근무 수당";
  worksheet.getCell(fields.targetHeadcountCell).value = "② 대  상  자 : 승인 건수 3건 / 대상 인원 3명";
  worksheet.getCell(fields.sectionTitleCell).value = "2. 3월 교대근무 사이트별 지급 요청 내역";
  clearCellRange(worksheet, {
    startRow: fields.dataStartRow,
    endRow: fields.dataStartRow + 6,
    startColumn: 2,
    endColumn: 8
  });

  [
    ["교대근무", "운영", "보라매DC", "-", 120000, "-", 120000],
    ["교대근무", "운영", "을지로DC", "-", 84000, 32000, 116000],
    ["합계", "합계", "합계", "-", 204000, 32000, 236000]
  ].forEach((row, index) => {
    const rowNumber = fields.dataStartRow + index;
    row.forEach((value, columnIndex) => {
      worksheet.getCell(rowNumber, columnIndex + 2).value = value;
    });
  });
};

const fillAttachmentOnePreview = (workbook: ExcelJS.Workbook, template: DocumentTemplateVersion) => {
  const fields = resolveAttachmentOneTemplateFields(template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];

  worksheet.getCell(fields.titleCell).value = buildAllowanceAttachmentOneTitle("2026-03");
  clearCellRange(worksheet, {
    startRow: fields.dataStartRow,
    endRow: fields.dataStartRow + 4,
    startColumn: 1,
    endColumn: 19
  });

  [
    [1, "EMP-001", "가람", "-", "보라매DC", "정기근로", "2026.03.01", 8, 8, 1, 120000],
    [2, "EMP-002", "나래", "-", "보라매DC", "야간근로", "2026.03.02", 8, 4, 1.5, 84000]
  ].forEach((row, index) => {
    const rowNumber = fields.dataStartRow + index;
    row.forEach((value, columnIndex) => {
      worksheet.getCell(rowNumber, columnIndex + 1).value = value;
    });
  });
};

const fillAttachmentTwoPreview = (workbook: ExcelJS.Workbook, template: DocumentTemplateVersion) => {
  const fields = resolveAttachmentTwoTemplateFields(template);
  const worksheet = workbook.getWorksheet(fields.sheetName) ?? workbook.worksheets[0];

  worksheet.getCell(fields.titleCell).value = buildAllowanceAttachmentTwoTitle("2026-03");
  worksheet.getCell(fields.dateRangeCell).value = "2026.3.1 ~ 3.31";
  clearCellRange(worksheet, {
    startRow: fields.dataStartRow,
    endRow: fields.dataStartRow + 6,
    startColumn: 1,
    endColumn: 7
  });

  [
    [1, "보라매DC", "가람", "-", 120000, "-", 120000],
    [2, "을지로DC", "나래", "-", 84000, 32000, 116000],
    ["합계", "합계", "합계", "-", 204000, 32000, 236000]
  ].forEach((row, index) => {
    const rowNumber = fields.dataStartRow + index;
    row.forEach((value, columnIndex) => {
      worksheet.getCell(rowNumber, columnIndex + 1).value = value;
    });
  });
};

export const previewDocumentTemplateFile = async (
  input: DocumentTemplatePreviewInput,
  context: {
    outputPath: string;
  }
): Promise<DocumentTemplatePreviewRecord> => {
  const workbook = await readWorkbook(input.sourcePath);
  const template = createPreviewTemplateVersion(input);

  mkdirSync(path.dirname(context.outputPath), { recursive: true });

  if (input.templateType === "schedule") {
    await fillSchedulePreview(workbook, input);
  } else if (input.templateType === "proposal") {
    fillProposalPreview(workbook, template);
  } else if (input.templateType === "attachment1") {
    fillAttachmentOnePreview(workbook, template);
  } else if (input.templateType === "attachment2") {
    fillAttachmentTwoPreview(workbook, template);
  }

  applyDocumentTemplateStyleSpec({
    workbook,
    template
  });

  await workbook.xlsx.writeFile(context.outputPath);

  return {
    templateType: input.templateType,
    outputFileName: path.basename(context.outputPath),
    outputPath: context.outputPath,
    previewedAt: new Date().toISOString()
  };
};
