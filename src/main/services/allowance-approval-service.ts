import { randomUUID } from "node:crypto";

import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  AllowanceApprovalRecord,
  AllowanceReviewActionInput
} from "../../shared/domain/allowance-workflow";
import {
  getAllowanceCalculationById,
  listAllowanceCalculationsByIds,
  updateAllowanceCalculationStatus
} from "./approved-allowance-calculation-service";
import { restoreApprovedPerformanceFileToPending } from "./performance-file-archive-service";
import {
  clearStoredEffectivePerformanceFiles,
  getStoredPerformanceFileDetail,
  moveStoredPerformanceFileToPending
} from "./performance-file-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface AllowanceApprovalRow {
  id: string;
  calculation_id: string;
  work_month: string;
  site_name?: string | null;
  employee_code?: string | null;
  employee_name: string;
  work_date: string;
  work_type?: string | null;
  decision: string;
  processed_at: string;
  processed_by: string;
  processed_by_name: string;
  comment?: string | null;
}

const approvalStore: AllowanceApprovalRecord[] = [];

const toRecord = (row: AllowanceApprovalRow): AllowanceApprovalRecord => ({
  id: row.id,
  calculationId: row.calculation_id,
  workMonth: row.work_month,
  siteName: row.site_name ?? "",
  employeeCode: row.employee_code ?? "",
  employeeName: row.employee_name,
  workDate: row.work_date,
  workType: (row.work_type ?? "overtime") as AllowanceApprovalRecord["workType"],
  decision: row.decision === "rejected" ? "rejected" : "approved",
  processedAt: row.processed_at,
  processedBy: row.processed_by,
  processedByName: row.processed_by_name,
  comment: row.comment ?? undefined
});

const listRecords = (whereSql?: string, params: Array<string> = []) => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    const rows = database.prepare(`
      SELECT *
      FROM allowance_approvals
      ${whereSql ? `WHERE ${whereSql}` : ""}
      ORDER BY processed_at DESC, id DESC
    `).all(...params) as unknown as AllowanceApprovalRow[];

    return rows.map(toRecord);
  }

  return [...approvalStore]
    .filter((record) => {
      if (!whereSql) {
        return true;
      }

      if (whereSql === "calculation_id = ?") {
        return record.calculationId === params[0];
      }

      return true;
    })
    .sort(
      (left, right) =>
        right.processedAt.localeCompare(left.processedAt) || right.id.localeCompare(left.id)
    );
};

const createAllowanceApprovalRecord = (input: {
  calculationId: string;
  workMonth: string;
  siteName: string;
  employeeCode: string;
  employeeName: string;
  workDate: string;
  workType: AllowanceApprovalRecord["workType"];
  decision: AllowanceApprovalRecord["decision"];
  processedBy: string;
  processedByName: string;
  comment?: string;
}) => {
  const record: AllowanceApprovalRecord = {
    id: randomUUID(),
    calculationId: input.calculationId,
    workMonth: input.workMonth,
    siteName: input.siteName,
    employeeCode: input.employeeCode,
    employeeName: input.employeeName,
    workDate: input.workDate,
    workType: input.workType,
    decision: input.decision,
    processedAt: new Date().toISOString(),
    processedBy: input.processedBy,
    processedByName: input.processedByName,
    comment: input.comment?.trim() || undefined
  };
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      INSERT INTO allowance_approvals (
        id,
        calculation_id,
        work_month,
        site_name,
        employee_code,
        employee_name,
        work_date,
        work_type,
        decision,
        processed_at,
        processed_by,
        processed_by_name,
        comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.calculationId,
      record.workMonth,
      record.siteName || null,
      record.employeeCode || null,
      record.employeeName,
      record.workDate,
      record.workType,
      record.decision,
      record.processedAt,
      record.processedBy,
      record.processedByName,
      record.comment ?? null
    );

    return record;
  }

  approvalStore.unshift(record);
  return record;
};

const deleteAllowanceApprovalRecord = (approvalId: string) => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.prepare(`
      DELETE FROM allowance_approvals
      WHERE id = ?
    `).run(approvalId);
    return;
  }

  const index = approvalStore.findIndex((record) => record.id === approvalId);

  if (index >= 0) {
    approvalStore.splice(index, 1);
  }
};

const syncRejectedAllowanceSiteToPerformance = async (
  calculations: ReturnType<typeof listAllowanceCalculationsByIds>,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
  }
) => {
  const fileIds = [...new Set(calculations.map((record) => record.fileId))];
  const approvedDetails = fileIds
    .map((fileId) => getStoredPerformanceFileDetail(fileId))
    .filter(
      (detail): detail is NonNullable<ReturnType<typeof getStoredPerformanceFileDetail>> =>
        Boolean(detail)
    )
    .filter((detail) => detail.directoryType === "approved");

  if (approvedDetails.length === 0) {
    return;
  }

  if (!context?.userDataPath) {
    throw new Error("승인완료 파일을 승인대기로 되돌릴 경로를 확인할 수 없습니다.");
  }

  const receivedAt = new Date().toISOString();

  for (const detail of approvedDetails) {
    const restoreResult = await restoreApprovedPerformanceFileToPending({
      detail,
      userDataPath: context.userDataPath,
      env: context.env,
      allowMissingSource: true
    });

    moveStoredPerformanceFileToPending({
      fileId: detail.id,
      pendingFilePath: restoreResult.pendingFilePath,
      receivedAt,
      status: "rejected"
    });

    if (detail.scheduleKey) {
      clearStoredEffectivePerformanceFiles(detail.scheduleKey);
    }
  }
};

export const listAllowanceApprovalHistory = (): AllowanceApprovalRecord[] => listRecords();

export const getAllowanceApprovalHistoryByCalculationId = (calculationId: string) =>
  listRecords("calculation_id = ?", [calculationId]);

export const getLatestAllowanceApprovalByCalculationId = (
  calculationId: string
): AllowanceApprovalRecord | null => getAllowanceApprovalHistoryByCalculationId(calculationId)[0] ?? null;

export const reviewAllowanceCalculations = async (
  input: AllowanceReviewActionInput,
  session: AuthSession,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<AllowanceApprovalRecord[]>> => {
  const calculationIds = [...new Set(input.calculationIds)];
  const normalizedComment = input.comment?.trim();

  if (calculationIds.length === 0) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_REVIEW_TARGET_REQUIRED",
      message: "처리할 수당 산출 결과를 선택해 주세요."
    };
  }

  const calculations = listAllowanceCalculationsByIds(calculationIds);

  if (calculations.length !== calculationIds.length) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_CALCULATION_NOT_FOUND",
      message: "일부 수당 산출 결과를 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
    };
  }

  const proposalApprovedRows = calculations.filter((record) => record.status === "proposal-approved");

  if (proposalApprovedRows.length > 0) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_REVIEW_ALREADY_CLOSED",
      message: "이미 품의 승인으로 마감된 수당은 상태를 변경할 수 없습니다."
    };
  }

  const nextStatus = input.decision === "approved" ? "approved" : "rejected";
  const changedRecords = calculations.filter((record) => record.status !== nextStatus);

  if (input.decision === "rejected" && input.syncPerformanceSiteReject && !normalizedComment) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_REVIEW_COMMENT_REQUIRED",
      message: "근무지 반려 사유를 입력해 주세요."
    };
  }

  if (changedRecords.length === 0) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_REVIEW_NO_CHANGES",
      message:
        input.decision === "approved"
          ? "선택한 수당은 이미 승인 상태입니다."
          : "선택한 수당은 이미 반려 상태입니다."
    };
  }

  const previousStatuses = new Map(changedRecords.map((record) => [record.id, record.status] as const));
  const approvalRecords: AllowanceApprovalRecord[] = [];

  try {
    changedRecords.forEach((record) => {
      updateAllowanceCalculationStatus({
        calculationId: record.id,
        status: nextStatus
      });

      approvalRecords.push(
        createAllowanceApprovalRecord({
          calculationId: record.id,
          workMonth: record.workDate.slice(0, 7),
          siteName: record.siteName,
          employeeCode: record.employeeCode,
          employeeName: record.employeeName,
          workDate: record.workDate,
          workType: record.workType,
          decision: input.decision,
          processedBy: session.userId,
          processedByName: session.displayName,
          comment: normalizedComment
        })
      );
    });

    if (input.decision === "rejected" && input.syncPerformanceSiteReject) {
      await syncRejectedAllowanceSiteToPerformance(calculations, context);
    }
  } catch (error) {
    changedRecords.forEach((record) => {
      const previousStatus = previousStatuses.get(record.id);

      if (previousStatus) {
        updateAllowanceCalculationStatus({
          calculationId: record.id,
          status: previousStatus
        });
      }
    });
    approvalRecords.forEach((record) => {
      deleteAllowanceApprovalRecord(record.id);
    });

    return {
      ok: false,
      errorCode: "ALLOWANCE_REVIEW_SYNC_FAILED",
      message: error instanceof Error ? error.message : "수당 반려 연동 처리 중 오류가 발생했습니다."
    };
  }

  return {
    ok: true,
    data: approvalRecords
  };
};

export const resetAllowanceApprovalStateForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM allowance_approvals;");
  }

  approvalStore.length = 0;
};

export const resolveAllowanceCalculationReviewStatus = (calculationId: string) =>
  getAllowanceCalculationById(calculationId)?.status ?? "pending";
