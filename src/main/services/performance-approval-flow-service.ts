import { existsSync } from "node:fs";
import path from "node:path";

import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import { markWageRateReparseRequired } from "./app-settings-storage-service";
import type {
  PerformanceAlert,
  PerformanceApprovalActionInput,
  PerformanceApprovalRecord,
  PerformanceEntryRecord,
  PerformanceFileDetail,
  PerformanceReapprovalFinalizeInput,
  PerformanceRejectionInput
} from "../../shared/domain/performance-file";
import {
  getNonPayableSubstituteReasonText,
  isPoolSubstitutePerformanceEntry
} from "../../shared/domain/performance-file";
import {
  createPerformanceApprovalRecord,
  deletePerformanceApprovalRecord,
  getLatestPerformanceApprovalByLogicalKey,
  listPerformanceApprovalHistory
} from "./performance-approval-service";
import {
  hasBlockingNonWageAlert,
  isWageDerivedAlert,
  resolvePerformanceEntryApprovalState
} from "./performance-approval-resolution-service";
import { createPerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import {
  archiveApprovedPerformanceFile,
  restoreApprovedPerformanceFileToPending
} from "./performance-file-archive-service";
import { detectUnmarkedHolidayGap } from "./performance-holiday-gap-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  markStoredPerformanceFileArchivedAsEffective,
  moveStoredPerformanceFileToPending,
  updateStoredPerformanceFileApprovalProgress
} from "./performance-file-storage-service";
import { getPendingPerformanceFileDetail } from "./performance-queue-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";
import {
  deleteAllowanceCalculationByApprovalId,
  getLatestAllowanceCalculationByApprovalId,
  runApprovedAllowanceCalculationForApproval
} from "./approved-allowance-calculation-service";

const buildMissingFileResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_FILE_NOT_FOUND",
  message: "대상 실적 파일을 찾을 수 없습니다."
});

const buildMissingEntryResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_ENTRY_NOT_FOUND",
  message: "대상 실적 행을 찾을 수 없습니다."
});

const buildAlreadyProcessedResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_ALREADY_APPROVED",
  message: "이미 승인 처리된 실적 행입니다."
});

const buildApprovalBlockedResult = (message: string): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_APPROVAL_BLOCKED",
  message
});

const buildFinalizeMissingFileResult = (): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_FILE_NOT_FOUND",
  message: "대상 실적 파일을 찾을 수 없습니다."
});

const buildFinalizeBlockedResult = (message: string): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_REAPPROVAL_FINALIZE_BLOCKED",
  message
});

const isCompletedInCurrentReapprovalCycle = (
  detail: Pick<PerformanceFileDetail, "id" | "receivedAt">,
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
) =>
  Boolean(
    latestApproval &&
      latestApproval.fileId === detail.id &&
      latestApproval.processedAt >= detail.receivedAt
  );


// Settled = "this row was approved in the current reapproval cycle AND the row still looks the way
// it did when it was approved". The cycle condition above is a TIME condition only, so a workbook
// edited again after every row was re-approved keeps it true: finalizing then freezes the amounts
// from before the edit. EVERY completion count for a reapproval file asks this extra question -
// the operator can finish such a file through three doors (finalize, the allowance site approval,
// and the automatic archive once every eligible row is approved), and a gate on only some of them
// is no gate at all. What stays untouched is the cycle condition itself, which decides whether the
// file is a reapproval file: tightening THAT would cost a file its reapproval eligibility.
//
// The verdict is the negation of needsReapproval rather than `satisfied`: it is exactly what the
// screen shows as the "재검토" pill, so a blocked file always states its reason where the operator
// is already looking, and the "no snapshot + different entry id" combination (satisfied:false,
// needsReapproval:false) never becomes a silent, unexplained block.
//
// The wage is out of both comparisons (see performance-approval-resolution-service), so a row whose
// wage alone changed stays settled and keeps the amount its approval paid (T-2).
const isReapprovalEntrySettled = (input: {
  detail: Pick<PerformanceFileDetail, "id" | "receivedAt">;
  entry: PerformanceEntryRecord;
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>;
}) =>
  input.latestApproval?.decision === "approved" &&
  isCompletedInCurrentReapprovalCycle(input.detail, input.latestApproval) &&
  !hasBlockingNonWageAlert(input.entry) &&
  !resolvePerformanceEntryApprovalState({
    entry: input.entry,
    latestApproval: input.latestApproval
  }).needsReapproval;

const isHourlyRateAlert = (alert: PerformanceAlert) => {
  const normalizedMessage = alert.message.replace(/\s+/g, "");

  if (!normalizedMessage.includes("시급")) {
    return false;
  }

  return (
    normalizedMessage.includes("적용") ||
    normalizedMessage.includes("이력") ||
    normalizedMessage.includes("정보") ||
    normalizedMessage.includes("찾지못") ||
    normalizedMessage.includes("없")
  );
};

const resolveApprovalEntry = (
  entry: PerformanceEntryRecord,
  manualHourlyRate?: number
): PerformanceEntryRecord => {
  if (!manualHourlyRate || manualHourlyRate <= 0) {
    return entry;
  }

  return {
    ...entry,
    hourlyRate: manualHourlyRate,
    // The set erased here must stay a superset of the set the equivalence check drops
    // (isWageDerivedAlert). If a wage-derived alert survived a manual wage, the row would be stored
    // carrying an alert the comparison ignores, and the finalize gate would read it as changed.
    // isHourlyRateAlert above is the wider, keyword-based half and stays as it is.
    alerts: entry.alerts.filter(
      (alert) => !(isHourlyRateAlert(alert) || isWageDerivedAlert(alert))
    )
  };
};

const buildApprovalComment = (input: {
  comment?: string;
  manualHourlyRate?: number;
}) => {
  const notes = [];

  if (input.comment?.trim()) {
    notes.push(input.comment.trim());
  }

  if (input.manualHourlyRate && input.manualHourlyRate > 0) {
    notes.push(`시급 임의지정 ${input.manualHourlyRate.toLocaleString("ko-KR")}원`);
  }

  return notes.join(" / ") || undefined;
};

// 미지급 대체근무 차단 문구. 판정 사유가 있으면 그 사유를 그대로 보여준다(Pool/주간고정조 구분).
const buildNonPayableSubstituteMessage = (entry: PerformanceEntryRecord) => {
  const reasonText = getNonPayableSubstituteReasonText(entry);

  return reasonText && entry.substituteAllowanceReasonCode
    ? `${reasonText} 승인 및 수당 처리 대상이 아닙니다.`
    : "Pool 대체근무는 승인 및 수당 처리 대상이 아닙니다.";
};

const validateApprovalEntry = (entry: PerformanceEntryRecord): string | null => {
  if (isPoolSubstitutePerformanceEntry(entry)) {
    return buildNonPayableSubstituteMessage(entry);
  }

  if (!entry.hourlyRate || entry.hourlyRate <= 0) {
    return "적용 시급이 없어 승인할 수 없습니다. 재승인 상세보기에서 시급을 임의 지정한 뒤 다시 승인하세요.";
  }

  if (entry.alerts.some((alert) => alert.severity === "error")) {
    return "오류 알림이 남아 있어 승인할 수 없습니다. 알림을 해소하거나 시급을 임의 지정한 뒤 다시 승인하세요.";
  }

  return null;
};

const createApprovedPerformanceRecord = async (input: {
  detail: PerformanceFileDetail;
  entry: PerformanceEntryRecord;
  session: AuthSession;
  comment?: string;
}): Promise<BridgeResult<PerformanceApprovalRecord>> => {
  const validationMessage = validateApprovalEntry(input.entry);

  if (validationMessage) {
    return {
      ok: false as const,
      errorCode: "PERFORMANCE_APPROVAL_BLOCKED",
      message: validationMessage
    };
  }

  // 승인 기록 저장과 수당 계산 저장을 한 묶음(트랜잭션)으로 처리한다.
  // 둘 중 하나라도 실패하면 전체를 되돌려, 저장 도중 멈춰도 짝이 안 맞는 찌꺼기 기록이 남지 않게 한다.
  // (수당 계산에 필요한 요율·공휴일 조회는 BEGIN 이전 검증 단계에서 끝나며 중첩 트랜잭션을 열지 않는다.)
  const transactionalDatabase = isSqliteStorageReady() ? getSqliteDatabase() : null;

  if (transactionalDatabase) {
    transactionalDatabase.exec("BEGIN");
  }

  try {
    const record = createPerformanceApprovalRecord({
      fileId: input.detail.id,
      entry: input.entry,
      fileName: input.detail.fileName,
      processedBy: input.session.userId,
      processedByName: input.session.displayName,
      comment: input.comment,
      snapshotJson: createPerformanceApprovalSnapshot(input.detail, input.entry)
    });
    const calculationResult = await runApprovedAllowanceCalculationForApproval(record);

    if (!calculationResult.ok) {
      if (transactionalDatabase) {
        transactionalDatabase.exec("ROLLBACK");
      } else {
        deletePerformanceApprovalRecord(record.id);
        deleteAllowanceCalculationByApprovalId(record.id);
      }

      return {
        ok: false as const,
        errorCode: calculationResult.errorCode,
        message: calculationResult.message
      };
    }

    if (transactionalDatabase) {
      transactionalDatabase.exec("COMMIT");
    }

    return {
      ok: true as const,
      data: record
    };
  } catch (error) {
    if (transactionalDatabase) {
      transactionalDatabase.exec("ROLLBACK");
    }

    throw error;
  }
};

const getResolvedApprovedEntryCount = (
  detail: NonNullable<Awaited<ReturnType<typeof getPendingPerformanceFileDetail>>>
) =>
  detail.entries.filter((entry) => {
    if (isPoolSubstitutePerformanceEntry(entry)) {
      return false;
    }

    const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
    const isReapprovalFile =
      detail.status === "rejected" || hasPriorApprovedContentForPendingFile(detail);

    if (isReapprovalFile) {
      if (isChangeLockedApproval(latestApproval)) {
        return true;
      }

      return isReapprovalEntrySettled({ detail, entry, latestApproval });
    }

    return resolvePerformanceEntryApprovalState({
      entry,
      latestApproval
    }).satisfied;
  }).length;

const getEligibleApprovalEntries = (
  detail: Pick<PerformanceFileDetail, "entries">
) => detail.entries.filter((entry) => !isPoolSubstitutePerformanceEntry(entry));

const isChangeLockedApproval = (
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
) =>
  latestApproval?.decision === "approved" &&
  getLatestAllowanceCalculationByApprovalId(latestApproval.id)?.status === "proposal-approved";

const normalizeArchiveScheduleKey = (scheduleKey?: string | null) =>
  (scheduleKey ?? "").replace(/:(?:pending|approved)$/i, "");

const hasApprovedArchiveForSchedule = (detail: Pick<PerformanceFileDetail, "id" | "scheduleKey">) =>
  Boolean(detail.scheduleKey) &&
  listStoredPerformanceFileDetails().some(
    (item) =>
      item.id !== detail.id &&
      normalizeArchiveScheduleKey(item.scheduleKey) ===
        normalizeArchiveScheduleKey(detail.scheduleKey) &&
      item.directoryType === "approved" &&
      item.status === "approved"
  );

const hasPriorApprovedHistoryFromAnotherFile = (
  detail: Pick<PerformanceFileDetail, "id" | "entries">
) => {
  const payrollLogicalKeys = new Set(
    getEligibleApprovalEntries(detail).map((entry) => entry.logicalKey)
  );

  if (payrollLogicalKeys.size === 0) {
    return false;
  }

  return listPerformanceApprovalHistory().some(
    (approval) =>
      approval.decision === "approved" &&
      approval.fileId !== detail.id &&
      payrollLogicalKeys.has(approval.logicalKey)
  );
};

const hasCurrentCycleApproval = (
  detail: Pick<PerformanceFileDetail, "id" | "entries" | "receivedAt">
) =>
  getEligibleApprovalEntries(detail).some((entry) =>
    isCompletedInCurrentReapprovalCycle(
      detail,
      getLatestPerformanceApprovalByLogicalKey(entry.logicalKey)
    )
  );

// A prior approval whose owning file row is gone, or whose archived workbook no longer exists on
// disk, is an orphan: the user hand-moved the approved file out of 승인완료 (which mints a brand-new
// pending file id and strands the old approved row). Such an approval can no longer be trusted as a
// live "already approved" copy, so the pending file in hand must be treated as re-approvable instead
// of returning PERFORMANCE_ALREADY_APPROVED forever. Returns false for healthy approvals, so live
// approvals are completely unaffected.
const isLatestApprovalSourceMissing = (
  latestApproval: ReturnType<typeof getLatestPerformanceApprovalByLogicalKey>
): boolean => {
  if (!latestApproval || latestApproval.decision !== "approved") {
    return false;
  }

  const approvedFile = getStoredPerformanceFileDetail(latestApproval.fileId);

  // If we cannot positively confirm an archived approval row, keep blocking (treat as healthy). Only a
  // row we can read as directory_type='approved' is a candidate for the hand-moved-orphan signature.
  if (!approvedFile || approvedFile.directoryType !== "approved") {
    return false;
  }

  if (existsSync(approvedFile.filePath)) {
    return false;
  }

  // The recorded source file is gone. Only trust that as a genuine orphan when its CONTAINING FOLDER
  // is still reachable: a momentarily-offline 승인완료 folder (network share / cloud-on-demand) would
  // otherwise make every approved source look "missing" and wrongly unlock reapproval en masse. When
  // the folder itself is unreachable we treat it as unknown and keep blocking.
  return existsSync(path.dirname(approvedFile.filePath));
};

const hasPriorApprovedContentForPendingFile = (
  detail: Pick<PerformanceFileDetail, "id" | "directoryType" | "status" | "entries" | "receivedAt">
) =>
  detail.directoryType === "pending" &&
  (
    detail.status === "rejected" ||
    (hasPriorApprovedHistoryFromAnotherFile(detail) && hasCurrentCycleApproval(detail)) ||
    getEligibleApprovalEntries(detail).some((entry) => {
      const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
      return Boolean(
        latestApproval?.decision === "approved" &&
          latestApproval.fileId !== detail.id &&
          (resolvePerformanceEntryApprovalState({
            entry,
            latestApproval
          }).needsReapproval ||
            isLatestApprovalSourceMissing(latestApproval))
      );
    })
  );

const listUnsettledApprovalEntryLabels = (input: {
  detail: Pick<PerformanceFileDetail, "id" | "receivedAt" | "entries">;
  isReapprovalFile: boolean;
}) =>
  getEligibleApprovalEntries(input.detail).flatMap((entry) => {
    const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);

    if (isChangeLockedApproval(latestApproval)) {
      return [];
    }

    // A first-time file keeps the original time-only condition. This same gate is the
    // "이대로 승인완료" escape hatch that releases a file the holiday-gap hold parked in 승인대기, so a
    // new lock here would trap a file whose rows are already approved and already paid.
    const isSettled = input.isReapprovalFile
      ? isReapprovalEntrySettled({ detail: input.detail, entry, latestApproval })
      : latestApproval?.decision === "approved" &&
        isCompletedInCurrentReapprovalCycle(input.detail, latestApproval);

    return isSettled ? [] : [`${entry.employeeName} ${entry.workDate}`];
  });

export interface PendingPerformanceArchiveGate {
  isReapprovalFile: boolean;
  // Only meaningful while unsettledEntryLabels is empty: an unsettled file is already refused, and
  // answering this question means listing every stored file detail, which is the expensive half of
  // the gate. Read the two in that order.
  supersedesApprovedArchive: boolean;
  unsettledEntryLabels: string[];
}

// The gate a 승인대기 file has to pass before it may be archived as 승인완료. It is exported so that
// the allowance path ("수당 관리 → 근무지 승인", allowance-approval-service) asks exactly the same
// questions as finalizeReapprovedPerformanceFile below. When the two paths differ, the finalize
// button refuses a file that the allowance button archives anyway - which is how a stale amount got
// frozen as 승인완료 without anyone approving it.
export const resolvePendingPerformanceArchiveGate = (
  detail: Pick<
    PerformanceFileDetail,
    "id" | "receivedAt" | "directoryType" | "status" | "entries" | "scheduleKey"
  >
): PendingPerformanceArchiveGate => {
  const isReapprovalFile = hasPriorApprovedContentForPendingFile(detail);
  const unsettledEntryLabels = listUnsettledApprovalEntryLabels({ detail, isReapprovalFile });

  return {
    isReapprovalFile,
    unsettledEntryLabels,
    // A reapproval file is meant to replace the approved copy it corrects, so it is exempt here,
    // exactly as in finalizeReapprovedPerformanceFile.
    supersedesApprovedArchive:
      unsettledEntryLabels.length === 0 &&
      !isReapprovalFile &&
      hasApprovedArchiveForSchedule(detail)
  };
};

export const approvePerformanceFile = async (
  input: PerformanceApprovalActionInput,
  session: AuthSession,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<PerformanceApprovalRecord>> => {
  const detail = await getPendingPerformanceFileDetail(input.fileId);

  if (!detail) {
    return buildMissingFileResult();
  }

  const entry = detail.entries.find((item) => item.id === input.entryId);

  if (!entry) {
    return buildMissingEntryResult();
  }

  if (isPoolSubstitutePerformanceEntry(entry)) {
    return buildApprovalBlockedResult(buildNonPayableSubstituteMessage(entry));
  }

  const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);

  if (isChangeLockedApproval(latestApproval)) {
    return buildApprovalBlockedResult("품의승인 완료 수당은 재승인으로 변경할 수 없습니다.");
  }

  const approvalEntry = resolveApprovalEntry(entry, input.manualHourlyRate);
  const resolvedApproval = resolvePerformanceEntryApprovalState({
    entry: approvalEntry,
    latestApproval
  });
  const hasCurrentCycleApproval = isCompletedInCurrentReapprovalCycle(detail, latestApproval);
  const isPendingReapprovalFile = hasPriorApprovedContentForPendingFile(detail);
  const canReapproveCurrentCycle =
    latestApproval?.decision === "approved" &&
    resolvedApproval.satisfied &&
    isPendingReapprovalFile &&
    !hasCurrentCycleApproval;
  // The wage is not part of the equivalence check any more, so a refresh cannot flip approved rows
  // (T-2). That also means a manual rate no longer makes the entry "different" on its own - and a
  // manual rate typed on the re-approval screen is exactly the deliberate way to pay a row again
  // at another wage. It is let through here, explicitly, when it differs from what was approved.
  const isDeliberateRateChange =
    Boolean(input.manualHourlyRate && input.manualHourlyRate > 0) &&
    input.manualHourlyRate !== (resolvedApproval.approvedEntry?.hourlyRate ?? null);

  if (
    latestApproval?.decision === "approved" &&
    resolvedApproval.satisfied &&
    !canReapproveCurrentCycle &&
    !isDeliberateRateChange
  ) {
    return buildAlreadyProcessedResult();
  }

  const creationResult = await createApprovedPerformanceRecord({
    detail,
    entry: approvalEntry,
    session,
    comment: buildApprovalComment(input)
  });

  if (!creationResult.ok) {
    return creationResult;
  }

  const record = creationResult.data;

  const approvedEntryCount = getResolvedApprovedEntryCount(detail);
  const eligibleEntryCount = getEligibleApprovalEntries(detail).length;
  const userDataPath = context?.userDataPath;

  updateStoredPerformanceFileApprovalProgress({
    fileId: detail.id,
    approvedEntryCount
  });

  if (
    approvedEntryCount === eligibleEntryCount &&
    eligibleEntryCount > 0 &&
    userDataPath &&
    !hasApprovedArchiveForSchedule(detail) &&
    // Hold the auto-archive when the month has registered public holidays but the file produced no
    // 법정휴일 근무 row at all: that is the signature of a returned schedule whose holiday markings
    // were lost, and silently moving it to 승인완료 is exactly the surprise this change prevents. The
    // overtime approval still persists; the file stays in 승인대기 with the holiday-gap hint, and the
    // user can register the holidays and re-import, or finalize as-is via "이대로 승인완료".
    !detectUnmarkedHolidayGap(detail)
  ) {
    try {
      const archiveResult = await archiveApprovedPerformanceFile({
        detail,
        userDataPath,
        env: context?.env
      });
      const completedAt = new Date().toISOString();

      markStoredPerformanceFileArchivedAsEffective({
        fileId: detail.id,
        archivedFilePath: archiveResult.archivedFilePath,
        archivedFileName: archiveResult.archivedFileName,
        completedAt,
        scheduleKey: detail.scheduleKey ?? ""
      });
    } catch (error) {
      deletePerformanceApprovalRecord(record.id);
      deleteAllowanceCalculationByApprovalId(record.id);
      updateStoredPerformanceFileApprovalProgress({
        fileId: detail.id,
        approvedEntryCount: getResolvedApprovedEntryCount(detail)
      });

      return {
        ok: false,
        errorCode: "PERFORMANCE_ARCHIVE_FAILED",
        message: error instanceof Error ? error.message : "승인 파일 보관에 실패했습니다."
      };
    }
  }

  return {
    ok: true,
    data: record
  };
};

export const finalizeReapprovedPerformanceFile = async (
  input: PerformanceReapprovalFinalizeInput,
  _session: AuthSession,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<PerformanceFileDetail>> => {
  const detail = await getPendingPerformanceFileDetail(input.fileId);

  if (!detail) {
    return buildFinalizeMissingFileResult();
  }

  if (detail.directoryType !== "pending") {
    return buildFinalizeBlockedResult("승인대기 폴더에 있는 파일만 승인완료로 확정할 수 있습니다.");
  }

  if (!context?.userDataPath) {
    return buildFinalizeBlockedResult("재승인본 이동 경로를 확인할 수 없습니다.");
  }

  // A reapproval file (a re-imported correction or a 근무지 반려 후 재승인) keeps its existing
  // semantics. A first-time file is only finalizable here when every eligible row has already been
  // approved — that is the "이대로 승인완료" escape hatch for a file whose auto-archive was held back
  // by the holiday-gap guard (e.g. a month with a registered holiday that nobody actually worked).
  const isReapprovalFile = hasPriorApprovedContentForPendingFile(detail);

  // A genuinely new first-time file (not a reapproval/re-import of the same rows) must not be force
  // archived over an existing approved copy of the same 근무지·월: archiving would flip the existing
  // copy's is_effective bit off and supersede it, even though the two files may cover disjoint people.
  // Reapproval files intentionally replace their prior approved copy and are exempt.
  if (!isReapprovalFile && hasApprovedArchiveForSchedule(detail)) {
    return buildFinalizeBlockedResult(
      "이미 같은 근무지·월의 승인완료본이 있어 이대로 승인완료할 수 없습니다. 기존 승인완료본을 먼저 승인대기로 되돌린 뒤 다시 시도하세요."
    );
  }

  const eligibleEntries = getEligibleApprovalEntries(detail);

  if (eligibleEntries.length === 0) {
    return buildFinalizeBlockedResult("확정할 실적 행이 없습니다.");
  }

  const missingApprovalEntries = listUnsettledApprovalEntryLabels({ detail, isReapprovalFile });

  if (missingApprovalEntries.length > 0) {
    return buildFinalizeBlockedResult(
      detail.status === "rejected"
        ? `근무지 반려 후 재승인된 실적은 모두 현재 파일 기준으로 다시 승인해야 합니다. ${missingApprovalEntries.join(" / ")}`
        : isReapprovalFile
        ? `재승인 파일은 변경 가능한 모든 실적을 현재 파일 기준으로 다시 승인해야 합니다. ${missingApprovalEntries.join(" / ")}`
        : `먼저 모든 실적을 승인해야 승인완료로 옮길 수 있습니다. ${missingApprovalEntries.join(" / ")}`
    );
  }

  try {
    updateStoredPerformanceFileApprovalProgress({
      fileId: detail.id,
      approvedEntryCount: getResolvedApprovedEntryCount(detail)
    });

    const archiveResult = await archiveApprovedPerformanceFile({
      detail,
      userDataPath: context.userDataPath,
      env: context.env
    });
    const completedAt = new Date().toISOString();

    markStoredPerformanceFileArchivedAsEffective({
      fileId: detail.id,
      archivedFilePath: archiveResult.archivedFilePath,
      archivedFileName: archiveResult.archivedFileName,
      completedAt,
      scheduleKey: detail.scheduleKey ?? ""
    });

    const archivedDetail = getStoredPerformanceFileDetail(detail.id);

    if (!archivedDetail) {
      return {
        ok: false,
        errorCode: "PERFORMANCE_ARCHIVE_FAILED",
        message: "이동 후 실적 파일 상태를 다시 불러오지 못했습니다."
      };
    }

    return {
      ok: true,
      data: archivedDetail
    };
  } catch (error) {
    updateStoredPerformanceFileApprovalProgress({
      fileId: detail.id,
      approvedEntryCount: getResolvedApprovedEntryCount(detail)
    });

    return {
      ok: false,
      errorCode: "PERFORMANCE_ARCHIVE_FAILED",
      message: error instanceof Error ? error.message : "재승인본 이동에 실패했습니다."
    };
  }
};

const buildReturnToPendingMissingResult = (): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_FILE_NOT_FOUND",
  message: "대상 실적 파일을 찾을 수 없습니다."
});

const buildReturnToPendingBlockedResult = (message: string): BridgeResult<PerformanceFileDetail> => ({
  ok: false,
  errorCode: "PERFORMANCE_RETURN_TO_PENDING_BLOCKED",
  message
});

// Official "승인완료 → 승인대기로 되돌리기" action. Replaces the unsafe manual move that strands an
// orphan row: it keeps the same file id (so no re-id and no mass re-approval), physically moves the
// workbook back into 승인대기 (tolerating a missing source), clears the effective flag for the
// schedule, and then performs a CLEAN undo — dropping this file's approval records and their
// allowance calculations so the file re-enters 승인대기 exactly as if freshly received. A file whose
// allowance has already been 품의-approved (proposal-approved) is blocked, because returning it would
// strand committed pay.
export const returnApprovedPerformanceFileToPending = async (
  input: PerformanceReapprovalFinalizeInput,
  _session: AuthSession,
  context?: {
    userDataPath?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<BridgeResult<PerformanceFileDetail>> => {
  const detail = getStoredPerformanceFileDetail(input.fileId);

  if (!detail) {
    return buildReturnToPendingMissingResult();
  }

  if (detail.directoryType !== "approved") {
    return buildReturnToPendingBlockedResult(
      "승인완료 상태의 실적 파일만 승인대기로 되돌릴 수 있습니다."
    );
  }

  if (!context?.userDataPath) {
    return buildReturnToPendingBlockedResult("되돌릴 파일을 옮길 경로를 확인할 수 없습니다.");
  }

  const fileApprovals = listPerformanceApprovalHistory().filter(
    (approval) => approval.fileId === detail.id
  );

  if (fileApprovals.some((approval) => isChangeLockedApproval(approval))) {
    return buildReturnToPendingBlockedResult(
      "수당 품의가 승인된 실적은 되돌릴 수 없습니다. 먼저 수당 관리에서 품의 승인을 취소한 뒤 다시 시도하세요."
    );
  }

  const restoreResult = await restoreApprovedPerformanceFileToPending({
    detail,
    userDataPath: context.userDataPath,
    env: context.env,
    allowMissingSource: true
  });
  const receivedAt = new Date().toISOString();

  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return {
      ok: false,
      errorCode: "PERFORMANCE_RETURN_TO_PENDING_FAILED",
      message: "되돌린 상태를 저장할 수 없습니다."
    };
  }

  // The row demotion and the approval/allowance cleanup run in one transaction so a crash can never
  // leave the file in 승인대기 while its own approvals survive — which would deadlock every future
  // re-approval (PERFORMANCE_ALREADY_APPROVED). The physical workbook was already moved above, so a
  // crash before COMMIT leaves the row still 'approved' (a recoverable orphan the startup recovery
  // surfaces), never the deadlock. moveStoredPerformanceFileToPending also clears THIS file's
  // is_effective bit; we intentionally do not touch sibling rows, so a live copy of the same
  // 근무지·월 keeps its effective flag.
  database.exec("BEGIN");
  try {
    const moved = moveStoredPerformanceFileToPending({
      fileId: detail.id,
      pendingFilePath: restoreResult.pendingFilePath,
      receivedAt,
      status: "pending"
    });

    if (!moved) {
      throw new Error("승인대기로 되돌리는 중 상태 갱신에 실패했습니다.");
    }

    for (const approval of fileApprovals) {
      deleteAllowanceCalculationByApprovalId(approval.id);
      deletePerformanceApprovalRecord(approval.id);
    }

    // While the file sat in the approved folder, every marker that would have re-read it was
    // consumed by overviews that read pending files only. Back in 승인대기 it must be read against
    // today's master, schedule and wages before anyone approves it again (T-17), so the return
    // leaves a marker in this same transaction.
    markWageRateReparseRequired();

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");

    return {
      ok: false,
      errorCode: "PERFORMANCE_RETURN_TO_PENDING_FAILED",
      message: error instanceof Error ? error.message : "승인대기로 되돌리지 못했습니다."
    };
  }

  const refreshed = getStoredPerformanceFileDetail(detail.id);

  if (!refreshed) {
    return {
      ok: false,
      errorCode: "PERFORMANCE_RETURN_TO_PENDING_FAILED",
      message: "되돌린 후 실적 파일 상태를 다시 불러오지 못했습니다."
    };
  }

  return {
    ok: true,
    data: refreshed
  };
};

export const rejectPerformanceFile = async (
  _input: PerformanceRejectionInput,
  _session: AuthSession
): Promise<BridgeResult<PerformanceApprovalRecord>> => ({
  ok: false,
  errorCode: "PERFORMANCE_REJECT_UNSUPPORTED",
  message: "실적 관리는 미승인/승인 2단계만 지원합니다."
});

export const getPerformanceApprovalHistory = () => ({
  ok: true as const,
  data: listPerformanceApprovalHistory()
});
