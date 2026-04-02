import { randomUUID } from "node:crypto";

import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  AllowanceProposalApprovalInput,
  AllowanceProposalApprovalRecord,
  AllowanceProposalPreview
} from "../../shared/domain/allowance-workflow";
import { updateAllowanceCalculationStatus } from "./approved-allowance-calculation-service";
import {
  buildAllowanceProposalPreview,
  exportAllowanceDocuments
} from "./allowance-document-export-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface AllowanceProposalApprovalRow {
  id: string;
  work_month: string;
  calculation_ids_json: string;
  calculation_count: number;
  employee_count: number;
  total_allowance_amount: number;
  regular_total_allowance_amount: number;
  early_payout_total_allowance_amount: number;
  export_record_id: string;
  output_format: string;
  approved_at: string;
  approved_by: string;
  approved_by_name: string;
  comment?: string | null;
  preview_snapshot_json: string;
  backup_summary_json: string;
}

const proposalApprovalStore: AllowanceProposalApprovalRecord[] = [];

const toRecord = (row: AllowanceProposalApprovalRow): AllowanceProposalApprovalRecord => ({
  id: row.id,
  workMonth: row.work_month,
  calculationIds: JSON.parse(row.calculation_ids_json) as string[],
  calculationCount: Number(row.calculation_count),
  employeeCount: Number(row.employee_count),
  totalAllowanceAmount: Number(row.total_allowance_amount),
  regularTotalAllowanceAmount: Number(row.regular_total_allowance_amount),
  earlyPayoutTotalAllowanceAmount: Number(row.early_payout_total_allowance_amount),
  exportRecordId: row.export_record_id,
  outputFormat: row.output_format === "xlsx" ? "xlsx" : "pdf",
  approvedAt: row.approved_at,
  approvedBy: row.approved_by,
  approvedByName: row.approved_by_name,
  comment: row.comment ?? undefined,
  previewSnapshot: JSON.parse(row.preview_snapshot_json) as AllowanceProposalPreview,
  backupSummary: JSON.parse(row.backup_summary_json) as AllowanceProposalApprovalRecord["backupSummary"]
});

export const listAllowanceProposalApprovalHistory = (): AllowanceProposalApprovalRecord[] => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const rows = database.prepare(`
      SELECT *
      FROM allowance_proposal_approvals
      ORDER BY approved_at DESC, id DESC
    `).all() as unknown as AllowanceProposalApprovalRow[];

    return rows.map(toRecord);
  }

  return [...proposalApprovalStore].sort(
    (left, right) => right.approvedAt.localeCompare(left.approvedAt) || right.id.localeCompare(left.id)
  );
};

export const previewAllowanceProposalApproval = (input: {
  calculationIds: string[];
}): BridgeResult<AllowanceProposalPreview> => {
  try {
    return {
      ok: true,
      data: buildAllowanceProposalPreview(input)
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_PROPOSAL_PREVIEW_FAILED",
      message: error instanceof Error ? error.message : "품의 미리보기를 준비하지 못했습니다."
    };
  }
};

const createProposalApprovalRecord = (input: {
  calculationIds: string[];
  exportRecordId: string;
  outputFormat: AllowanceProposalApprovalRecord["outputFormat"];
  comment?: string;
  previewSnapshot: AllowanceProposalPreview;
  backupSummary: AllowanceProposalApprovalRecord["backupSummary"];
  session: AuthSession;
}) => {
  const record: AllowanceProposalApprovalRecord = {
    id: randomUUID(),
    workMonth: input.previewSnapshot.workMonth,
    calculationIds: input.calculationIds,
    calculationCount: input.previewSnapshot.calculationCount,
    employeeCount: input.previewSnapshot.employeeCount,
    totalAllowanceAmount: input.previewSnapshot.totalAllowanceAmount,
    regularTotalAllowanceAmount: input.previewSnapshot.regularTotalAllowanceAmount,
    earlyPayoutTotalAllowanceAmount: input.previewSnapshot.earlyPayoutTotalAllowanceAmount,
    exportRecordId: input.exportRecordId,
    outputFormat: input.outputFormat,
    approvedAt: new Date().toISOString(),
    approvedBy: input.session.userId,
    approvedByName: input.session.displayName,
    comment: input.comment?.trim() || undefined,
    previewSnapshot: input.previewSnapshot,
    backupSummary: input.backupSummary
  };
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO allowance_proposal_approvals (
        id,
        work_month,
        calculation_ids_json,
        calculation_count,
        employee_count,
        total_allowance_amount,
        regular_total_allowance_amount,
        early_payout_total_allowance_amount,
        export_record_id,
        output_format,
        approved_at,
        approved_by,
        approved_by_name,
        comment,
        preview_snapshot_json,
        backup_summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.workMonth,
      JSON.stringify(record.calculationIds),
      record.calculationCount,
      record.employeeCount,
      record.totalAllowanceAmount,
      record.regularTotalAllowanceAmount,
      record.earlyPayoutTotalAllowanceAmount,
      record.exportRecordId,
      record.outputFormat,
      record.approvedAt,
      record.approvedBy,
      record.approvedByName,
      record.comment ?? null,
      JSON.stringify(record.previewSnapshot),
      JSON.stringify(record.backupSummary)
    );

    return record;
  }

  proposalApprovalStore.unshift(record);
  return record;
};

export const approveAllowanceProposal = async (
  input: AllowanceProposalApprovalInput,
  session: AuthSession,
  context: {
    userDataPath: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<AllowanceProposalApprovalRecord>> => {
  try {
    const calculationIds = [...new Set(input.calculationIds)];

    if (calculationIds.length === 0) {
      return {
        ok: false,
        errorCode: "ALLOWANCE_PROPOSAL_TARGET_REQUIRED",
        message: "품의 승인할 수당 산출 결과를 선택해 주세요."
      };
    }

    const previewSnapshot = buildAllowanceProposalPreview({
      calculationIds
    });
    const exportResult = await exportAllowanceDocuments(
      {
        calculationIds,
        outputFormat: input.outputFormat ?? "pdf"
      },
      context
    );

    if (!exportResult.ok) {
      return exportResult;
    }

    const backupSummary = await runDatabaseBackupNow(context);
    const record = createProposalApprovalRecord({
      calculationIds,
      exportRecordId: exportResult.data.id,
      outputFormat: input.outputFormat ?? "pdf",
      comment: input.comment,
      previewSnapshot,
      backupSummary,
      session
    });

    calculationIds.forEach((calculationId) => {
      updateAllowanceCalculationStatus({
        calculationId,
        status: "proposal-approved"
      });
    });

    return {
      ok: true,
      data: record
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_PROPOSAL_APPROVAL_FAILED",
      message: error instanceof Error ? error.message : "품의 승인 처리 중 오류가 발생했습니다."
    };
  }
};

export const resetAllowanceProposalApprovalStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM allowance_proposal_approvals;");
  }

  proposalApprovalStore.length = 0;
};
