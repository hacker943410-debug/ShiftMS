import type { DocumentTemplateProfile } from "../../shared/domain/document-template";
import type { DocumentTemplateVersion, TemplateType } from "../../shared/domain/model";

export interface ProposalTemplateFieldMappings {
  sheetName: string;
  workMonthCell: string;
  printedDateCell: string;
  ownerDepartmentCell: string;
  systemNameCell: string;
  documentTitleCell: string;
  summaryIntroCell: string;
  scopeCell: string;
  targetHeadcountCell: string;
  sectionTitleCell: string;
  dataStartRow: number;
}

export interface AttachmentOneTemplateFieldMappings {
  sheetName: string;
  titleCell: string;
  dataStartRow: number;
}

export interface AttachmentTwoTemplateFieldMappings {
  sheetName: string;
  titleCell: string;
  dateRangeCell: string;
  dataStartRow: number;
}

const defaultGenericFieldMappingsByType: Record<
  Exclude<TemplateType, "schedule">,
  Record<string, string>
> = {
  proposal: {
    sheetName: "품의서",
    workMonthCell: "C5",
    printedDateCell: "E5",
    ownerDepartmentCell: "C6",
    systemNameCell: "C7",
    documentTitleCell: "A12",
    summaryIntroCell: "C13",
    scopeCell: "B16",
    targetHeadcountCell: "B17",
    sectionTitleCell: "B19",
    dataStartRow: "22"
  },
  attachment1: {
    sheetName: "별첨1",
    titleCell: "A1",
    dataStartRow: "5"
  },
  attachment2: {
    sheetName: "별첨2",
    titleCell: "B1",
    dateRangeCell: "G2",
    dataStartRow: "5"
  }
};

const toPositiveRowNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? "");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getGenericFieldMappings = (
  templateType: Exclude<TemplateType, "schedule">,
  profile?: DocumentTemplateProfile
) => {
  const defaults = defaultGenericFieldMappingsByType[templateType];

  if (profile?.kind !== "generic") {
    return defaults;
  }

  return {
    ...defaults,
    ...profile.fieldMappings
  };
};

export const createDefaultGenericFieldMappings = (
  templateType: Exclude<TemplateType, "schedule">,
  primarySheetName: string
): Record<string, string> => ({
  ...defaultGenericFieldMappingsByType[templateType],
  sheetName: primarySheetName
});

export const resolveProposalTemplateFields = (
  template: DocumentTemplateVersion
): ProposalTemplateFieldMappings => {
  const mappings = getGenericFieldMappings("proposal", template.profile);

  return {
    sheetName: mappings.sheetName,
    workMonthCell: mappings.workMonthCell,
    printedDateCell: mappings.printedDateCell,
    ownerDepartmentCell: mappings.ownerDepartmentCell,
    systemNameCell: mappings.systemNameCell,
    documentTitleCell: mappings.documentTitleCell,
    summaryIntroCell: mappings.summaryIntroCell,
    scopeCell: mappings.scopeCell,
    targetHeadcountCell: mappings.targetHeadcountCell,
    sectionTitleCell: mappings.sectionTitleCell,
    dataStartRow: toPositiveRowNumber(mappings.dataStartRow, 22)
  };
};

export const resolveAttachmentOneTemplateFields = (
  template: DocumentTemplateVersion
): AttachmentOneTemplateFieldMappings => {
  const mappings = getGenericFieldMappings("attachment1", template.profile);

  return {
    sheetName: mappings.sheetName,
    titleCell: mappings.titleCell,
    dataStartRow: toPositiveRowNumber(mappings.dataStartRow, 5)
  };
};

export const resolveAttachmentTwoTemplateFields = (
  template: DocumentTemplateVersion
): AttachmentTwoTemplateFieldMappings => {
  const mappings = getGenericFieldMappings("attachment2", template.profile);

  return {
    sheetName: mappings.sheetName,
    titleCell: mappings.titleCell,
    dateRangeCell: mappings.dateRangeCell,
    dataStartRow: toPositiveRowNumber(mappings.dataStartRow, 5)
  };
};

export const getGenericTemplateFieldLabels = (
  templateType: Exclude<TemplateType, "schedule">
): Record<string, string> => {
  switch (templateType) {
    case "proposal":
      return {
        sheetName: "시트명",
        workMonthCell: "대상월 셀",
        printedDateCell: "출력일 셀",
        ownerDepartmentCell: "부서 셀",
        systemNameCell: "시스템명 셀",
        documentTitleCell: "문서 제목 셀",
        summaryIntroCell: "요약 문구 셀",
        scopeCell: "지급 범위 셀",
        targetHeadcountCell: "대상자 셀",
        sectionTitleCell: "섹션 제목 셀",
        dataStartRow: "표 시작 행"
      };
    case "attachment1":
      return {
        sheetName: "시트명",
        titleCell: "제목 셀",
        dataStartRow: "표 시작 행"
      };
    case "attachment2":
      return {
        sheetName: "시트명",
        titleCell: "제목 셀",
        dateRangeCell: "기간 셀",
        dataStartRow: "표 시작 행"
      };
    default:
      return {};
  }
};

export const isGenericTemplateRowField = (fieldKey: string) => fieldKey.endsWith("Row");
