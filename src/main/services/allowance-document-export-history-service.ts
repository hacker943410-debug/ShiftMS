import { randomUUID } from "node:crypto";

import type { AllowanceDocumentExportRecord } from "../../shared/domain/allowance-document";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface AllowanceDocumentExportRow {
  id: string;
  work_month: string;
  output_format?: string | null;
  calculation_ids_json: string;
  calculation_count: number;
  employee_count: number;
  total_allowance_amount: number;
  proposal_template_version_id?: string | null;
  attachment1_template_version_id?: string | null;
  attachment2_template_version_id?: string | null;
  proposal_file_name: string;
  proposal_path: string;
  attachment1_file_name: string;
  attachment1_path: string;
  attachment2_file_name: string;
  attachment2_path: string;
  exported_at: string;
}

const toRecord = (row: AllowanceDocumentExportRow): AllowanceDocumentExportRecord => ({
  id: row.id,
  workMonth: row.work_month,
  outputFormat: row.output_format === "pdf" ? "pdf" : "xlsx",
  calculationIds: JSON.parse(row.calculation_ids_json) as string[],
  calculationCount: Number(row.calculation_count),
  employeeCount: Number(row.employee_count),
  totalAllowanceAmount: Number(row.total_allowance_amount),
  proposalTemplateVersionId: row.proposal_template_version_id ?? undefined,
  attachment1TemplateVersionId: row.attachment1_template_version_id ?? undefined,
  attachment2TemplateVersionId: row.attachment2_template_version_id ?? undefined,
  proposalFileName: row.proposal_file_name,
  proposalPath: row.proposal_path,
  attachment1FileName: row.attachment1_file_name,
  attachment1Path: row.attachment1_path,
  attachment2FileName: row.attachment2_file_name,
  attachment2Path: row.attachment2_path,
  exportedAt: row.exported_at
});

export const listStoredAllowanceDocumentExports = (): AllowanceDocumentExportRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT *
    FROM allowance_document_exports
    ORDER BY exported_at DESC
  `).all() as unknown as AllowanceDocumentExportRow[];

  return rows.map(toRecord);
};

export const saveStoredAllowanceDocumentExport = (
  input: Omit<AllowanceDocumentExportRecord, "id">
): AllowanceDocumentExportRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const id = randomUUID();

  database.prepare(`
    INSERT INTO allowance_document_exports (
      id,
      work_month,
      output_format,
      calculation_ids_json,
      calculation_count,
      employee_count,
      total_allowance_amount,
      proposal_template_version_id,
      attachment1_template_version_id,
      attachment2_template_version_id,
      proposal_file_name,
      proposal_path,
      attachment1_file_name,
      attachment1_path,
      attachment2_file_name,
      attachment2_path,
      exported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.workMonth,
    input.outputFormat,
    JSON.stringify(input.calculationIds),
    input.calculationCount,
    input.employeeCount,
    input.totalAllowanceAmount,
    input.proposalTemplateVersionId ?? null,
    input.attachment1TemplateVersionId ?? null,
    input.attachment2TemplateVersionId ?? null,
    input.proposalFileName,
    input.proposalPath,
    input.attachment1FileName,
    input.attachment1Path,
    input.attachment2FileName,
    input.attachment2Path,
    input.exportedAt
  );

  return listStoredAllowanceDocumentExports().find((item) => item.id === id) as AllowanceDocumentExportRecord;
};

export const resetAllowanceDocumentExportHistoryForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM allowance_document_exports;");
  }
};
