import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  PerformanceAlert,
  PerformanceApprovalActionInput,
  PerformanceApprovalRecord,
  PerformanceEntryRecord,
  PerformanceFileDetail,
  PerformanceReapprovalFinalizeInput,
  PerformanceRejectionInput
} from "../../shared/domain/performance-file";
import { isPoolSubstitutePerformanceEntry } from "../../shared/domain/performance-file";
import {
  createPerformanceApprovalRecord,
  deletePerformanceApprovalRecord,
  getLatestPerformanceApprovalByLogicalKey,
  listPerformanceApprovalHistory
} from "./performance-approval-service";
import { resolvePerformanceEntryApprovalState } from "./performance-approval-resolution-service";
import { createPerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import { archiveApprovedPerformanceFile } from "./performance-file-archive-service";
import {
  getStoredPerformanceFileDetail,
  listStoredPerformanceFileDetails,
  markStoredPerformanceFileArchived,
  setStoredEffectivePerformanceFile,
  updateStoredPerformanceFileApprovalProgress
} from "./performance-file-storage-service";
import { getPendingPerformanceFileDetail } from "./performance-queue-service";
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
    alerts: entry.alerts.filter((alert) => !isHourlyRateAlert(alert))
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

const validateApprovalEntry = (entry: PerformanceEntryRecord): string | null => {
  if (isPoolSubstitutePerformanceEntry(entry)) {
    return "Pool 대체근무는 승인 및 수당 처리 대상이 아닙니다.";
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
    deletePerformanceApprovalRecord(record.id);
    deleteAllowanceCalculationByApprovalId(record.id);

    return {
      ok: false as const,
      errorCode: calculationResult.errorCode,
      message: calculationResult.message
    };
  }

  return {
    ok: true as const,
    data: record
  };
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
      detail.status === "rejected" ||
      hasPriorApprovedContentForPendingFile(detail) ||
      hasApprovedArchiveForSchedule(detail);

    if (isReapprovalFile) {
      if (isChangeLockedApproval(latestApproval)) {
        return true;
      }

      return (
        latestApproval?.decision === "approved" &&
        isCompletedInCurrentReapprovalCycle(detail, latestApproval)
      );
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

const hasApprovedArchiveForSchedule = (detail: Pick<PerformanceFileDetail, "id" | "scheduleKey">) =>
  Boolean(
    detail.scheduleKey &&
      listStoredPerformanceFileDetails().some(
        (item) =>
          item.id !== detail.id &&
          item.scheduleKey === detail.scheduleKey &&
          item.directoryType === "approved" &&
          item.status === "approved"
      )
  );

const hasPriorApprovedContentForPendingFile = (
  detail: Pick<PerformanceFileDetail, "id" | "directoryType" | "status" | "entries">
) =>
  detail.directoryType === "pending" &&
  getEligibleApprovalEntries(detail).some((entry) => {
    const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);
    return (
      latestApproval?.decision === "approved" &&
      (detail.status === "rejected" || latestApproval.fileId !== detail.id)
    );
  });

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
    return buildApprovalBlockedResult("Pool 대체근무는 승인 및 수당 처리 대상이 아닙니다.");
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
  const isPendingReapprovalFile =
    hasPriorApprovedContentForPendingFile(detail) || hasApprovedArchiveForSchedule(detail);
  const canReapproveCurrentCycle =
    latestApproval?.decision === "approved" &&
    resolvedApproval.satisfied &&
    isPendingReapprovalFile &&
    !hasCurrentCycleApproval;

  if (
    latestApproval?.decision === "approved" &&
    resolvedApproval.satisfied &&
    !canReapproveCurrentCycle
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
    !hasApprovedArchiveForSchedule(detail)
  ) {
    try {
      const archiveResult = await archiveApprovedPerformanceFile({
        detail,
        userDataPath,
        env: context?.env
      });
      const completedAt = new Date().toISOString();

      markStoredPerformanceFileArchived({
        fileId: detail.id,
        archivedFilePath: archiveResult.archivedFilePath,
        archivedFileName: archiveResult.archivedFileName,
        completedAt
      });
      setStoredEffectivePerformanceFile({
        fileId: detail.id,
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
    return buildFinalizeBlockedResult("승인대기 폴더에 있는 재승인 파일만 확정할 수 있습니다.");
  }

  if (!hasPriorApprovedContentForPendingFile(detail) && !hasApprovedArchiveForSchedule(detail)) {
    return buildFinalizeBlockedResult("기존 승인 완료본이 있는 재승인 파일만 수동 확정할 수 있습니다.");
  }

  if (!context?.userDataPath) {
    return buildFinalizeBlockedResult("재승인본 이동 경로를 확인할 수 없습니다.");
  }

  const eligibleEntries = getEligibleApprovalEntries(detail);

  if (eligibleEntries.length === 0) {
    return buildFinalizeBlockedResult("확정할 실적 행이 없습니다.");
  }

  const missingApprovalEntries = eligibleEntries.flatMap((entry) => {
    const latestApproval = getLatestPerformanceApprovalByLogicalKey(entry.logicalKey);

    if (isChangeLockedApproval(latestApproval)) {
      return [];
    }

    if (
      latestApproval?.decision === "approved" &&
      isCompletedInCurrentReapprovalCycle(detail, latestApproval)
    ) {
      return [];
    }

    return [`${entry.employeeName} ${entry.workDate}`];
  });

  if (missingApprovalEntries.length > 0) {
    return buildFinalizeBlockedResult(
      detail.status === "rejected"
        ? `근무지 반려 후 재승인된 실적은 모두 현재 파일 기준으로 다시 승인해야 합니다. ${missingApprovalEntries.join(" / ")}`
        : `재승인 파일은 변경 가능한 모든 실적을 현재 파일 기준으로 다시 승인해야 합니다. ${missingApprovalEntries.join(" / ")}`
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

    markStoredPerformanceFileArchived({
      fileId: detail.id,
      archivedFilePath: archiveResult.archivedFilePath,
      archivedFileName: archiveResult.archivedFileName,
      completedAt
    });
    setStoredEffectivePerformanceFile({
      fileId: detail.id,
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
