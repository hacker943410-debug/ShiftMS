export interface AllowanceDocumentExportRecord {
  id: string;
  workMonth: string;
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
