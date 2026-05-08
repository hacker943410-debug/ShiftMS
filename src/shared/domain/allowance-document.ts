export type AllowanceDocumentExportFormat = "xlsx" | "pdf";

export const ALLOWANCE_DOCUMENT_OWNER_DEPARTMENT = "DT사업1팀";

const formatAllowanceDocumentWorkMonthLabel = (workMonth: string) => {
  const [year, month] = workMonth.split("-");
  return `${year}년 ${Number(month)}월`;
};

export const buildAllowanceAttachmentOneTitle = (workMonth: string) =>
  `별첨1. ${ALLOWANCE_DOCUMENT_OWNER_DEPARTMENT} 교대근무자 시간외근로수당 내역 (${formatAllowanceDocumentWorkMonthLabel(workMonth)})`;

export const buildAllowanceAttachmentTwoTitle = (workMonth: string) =>
  `월간 ${ALLOWANCE_DOCUMENT_OWNER_DEPARTMENT} 교대근무 직원의 연장근로 수당 지급 현황 ${workMonth.replace("-", "")}`;

export const buildAllowanceProposalDocumentNumber = (input: {
  printedDate: string;
  fallbackWorkMonth: string;
}) => {
  const matched = /^(\d{4})[.-](\d{1,2})/.exec(input.printedDate.trim());

  if (!matched) {
    return input.fallbackWorkMonth;
  }

  return `${matched[1]}-${matched[2].padStart(2, "0")}`;
};

export interface AllowanceDocumentExportRecord {
  id: string;
  workMonth: string;
  outputFormat: AllowanceDocumentExportFormat;
  calculationIds: string[];
  calculationCount: number;
  employeeCount: number;
  totalAllowanceAmount: number;
  proposalTemplateVersionId?: string;
  attachment1TemplateVersionId?: string;
  attachment2TemplateVersionId?: string;
  proposalFileName: string;
  proposalPath: string;
  attachment1FileName: string;
  attachment1Path: string;
  attachment2FileName: string;
  attachment2Path: string;
  exportedAt: string;
}
