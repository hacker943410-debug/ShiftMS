import { randomUUID } from "node:crypto";

import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  AllowanceApprovalRecord,
  AllowanceReviewActionInput
} from "../../shared/domain/allowance-workflow";
import { isPoolSubstitutePerformanceEntry } from "../../shared/domain/performance-file";
import {
  getAllowanceCalculationById,
  listAllowanceCalculationsByIds,
  listApprovedAllowanceCalculationResults,
  updateAllowanceCalculationStatus
} from "./approved-allowance-calculation-service";
import { resolvePendingPerformanceArchiveGate } from "./performance-approval-flow-service";
import {
  archiveApprovedPerformanceFile,
  restoreApprovedPerformanceFileToPending
} from "./performance-file-archive-service";
import { detectUnmarkedHolidayGap } from "./performance-holiday-gap-service";
import {
  clearStoredEffectivePerformanceFiles,
  getStoredPerformanceFileDetail,
  markStoredPerformanceFileArchived,
  markStoredPerformanceFileArchivedAsEffective,
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

const hasProposalApprovedRowsForSiteReject = (
  calculations: ReturnType<typeof listAllowanceCalculationsByIds>
) => {
  const fileIds = new Set(calculations.map((record) => record.fileId));
  const siteMonthKeys = new Set(
    calculations.map((record) => `${record.siteName.trim()}::${record.workDate.slice(0, 7)}`)
  );

  return listApprovedAllowanceCalculationResults().some(
    (record) =>
      record.status === "proposal-approved" &&
      (fileIds.has(record.fileId) ||
        siteMonthKeys.has(`${record.siteName.trim()}::${record.workDate.slice(0, 7)}`))
  );
};

// Names the 근무지 whose 실적 file is still waiting to be re-approved. Checked BEFORE any status is
// written, so approving the allowance of a returned (반려) file is refused outright instead of
// leaving "수당은 승인 / 실적은 재승인 대기" behind. Deliberately narrow: only a 반려·재승인 file
// counts. Generalising it to "not every row approved yet" would block the everyday case of paying
// the rows of a partly approved file.
const listSiteNamesBlockedByPendingReapproval = (
  calculations: ReturnType<typeof listAllowanceCalculationsByIds>
) => {
  const blockedSiteNames = new Set<string>();

  [...new Set(calculations.map((record) => record.fileId))].forEach((fileId) => {
    const detail = getStoredPerformanceFileDetail(fileId);

    if (!detail || detail.directoryType !== "pending") {
      return;
    }

    const archiveGate = resolvePendingPerformanceArchiveGate(detail);

    if (archiveGate.isReapprovalFile && archiveGate.unsettledEntryLabels.length > 0) {
      blockedSiteNames.add(detail.siteName || detail.fileName);
    }
  });

  return [...blockedSiteNames];
};

const syncApprovedAllowanceSiteToPerformance = async (
  calculations: ReturnType<typeof listAllowanceCalculationsByIds>,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
  }
) => {
  const fileIds = [...new Set(calculations.map((record) => record.fileId))];
  const pendingDetails = fileIds
    .map((fileId) => getStoredPerformanceFileDetail(fileId))
    .filter(
      (detail): detail is NonNullable<ReturnType<typeof getStoredPerformanceFileDetail>> =>
        Boolean(detail)
    )
    .filter((detail) => detail.directoryType === "pending");

  if (pendingDetails.length === 0) {
    return;
  }

  if (!context?.userDataPath) {
    throw new Error("승인대기 파일을 승인완료로 이동할 경로를 확인할 수 없습니다.");
  }

  for (const detail of pendingDetails) {
    const eligibleEntryCount = detail.entries.filter(
      (entry) => !isPoolSubstitutePerformanceEntry(entry)
    ).length;

    if (eligibleEntryCount === 0 || (detail.approvedEntryCount ?? 0) < eligibleEntryCount) {
      continue;
    }

    // approvedEntryCount above only counts how many rows this file id was ever approved for. It says
    // nothing about WHEN, so a file returned to 승인대기 by a 근무지 반려 still reports a full count and
    // used to be archived straight back to 승인완료 from here, with none of its rows re-approved. Ask
    // the same gate the 실적 확정 button asks, so this path cannot archive what that button refuses.
    const archiveGate = resolvePendingPerformanceArchiveGate(detail);

    if (archiveGate.unsettledEntryLabels.length > 0) {
      continue;
    }

    // A first-time file must not push aside an existing 승인완료 copy of the same 근무지·월 (that would
    // clear the older copy's in-use flag). A reapproval file is exempt: replacing its predecessor is
    // the point. Same rule as finalizeReapprovedPerformanceFile.
    if (archiveGate.supersedesApprovedArchive) {
      continue;
    }

    // Honour the same auto-archive hold the approve flow uses: never silently archive a file whose
    // holiday work rows look dropped, so the allowance-approve path is not a side door around the
    // 승인대기 hold. The file stays pending with its holiday-gap hint until the operator resolves it.
    if (detectUnmarkedHolidayGap(detail)) {
      continue;
    }

    const archiveResult = await archiveApprovedPerformanceFile({
      detail,
      userDataPath: context.userDataPath,
      env: context.env
    });
    const completedAt = new Date().toISOString();

    if (detail.scheduleKey) {
      // Archive + effective-mark in one transaction so an interrupted approval can never leave the
      // file flagged archived without its is_effective bit, which would hide it from payroll.
      markStoredPerformanceFileArchivedAsEffective({
        fileId: detail.id,
        archivedFilePath: archiveResult.archivedFilePath,
        archivedFileName: archiveResult.archivedFileName,
        completedAt,
        scheduleKey: detail.scheduleKey
      });
    } else {
      // No schedule key means there is no effective-copy concept to maintain for this file, so a
      // single archive UPDATE is already atomic on its own.
      markStoredPerformanceFileArchived({
        fileId: detail.id,
        archivedFilePath: archiveResult.archivedFilePath,
        archivedFileName: archiveResult.archivedFileName,
        completedAt
      });
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

  if (
    input.decision === "rejected" &&
    input.syncPerformanceSiteReject &&
    hasProposalApprovedRowsForSiteReject(calculations)
  ) {
    return {
      ok: false,
      errorCode: "ALLOWANCE_SITE_REJECT_PROPOSAL_APPROVED",
      message: "품의 승인으로 마감된 근무지는 근무지 반려를 할 수 없습니다."
    };
  }

  if (input.decision === "approved") {
    const blockedSiteNames = listSiteNamesBlockedByPendingReapproval(calculations);

    if (blockedSiteNames.length > 0) {
      return {
        ok: false,
        errorCode: "ALLOWANCE_APPROVE_REAPPROVAL_PENDING",
        message: `${blockedSiteNames.join(", ")} 실적이 아직 재승인되지 않았습니다. 실적 관리에서 먼저 재승인한 뒤 수당을 승인해 주세요.`
      };
    }
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

    if (input.decision === "approved") {
      await syncApprovedAllowanceSiteToPerformance(calculations, context);
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
