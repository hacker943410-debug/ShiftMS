import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  PerformanceApprovalActionInput,
  PerformanceApprovalRecord,
  PerformanceRejectionInput
} from "../../shared/domain/performance-file";
import { createPerformanceApprovalRecord, listPerformanceApprovalHistory } from "./performance-approval-service";
import { getPendingPerformanceFileDetail } from "./performance-queue-service";

const buildMissingFileResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_FILE_NOT_FOUND",
  message: "대상 실적 파일을 찾을 수 없습니다."
});

const buildAlreadyProcessedResult = (): BridgeResult<PerformanceApprovalRecord> => ({
  ok: false,
  errorCode: "PERFORMANCE_ALREADY_PROCESSED",
  message: "이미 승인 또는 반려 처리된 파일입니다."
});

export const approvePerformanceFile = async (
  input: PerformanceApprovalActionInput,
  session: AuthSession
): Promise<BridgeResult<PerformanceApprovalRecord>> => {
  const detail = await getPendingPerformanceFileDetail(input.fileId);

  if (!detail) {
    return buildMissingFileResult();
  }

  if (detail.status !== "pending") {
    return buildAlreadyProcessedResult();
  }

  return {
    ok: true,
    data: createPerformanceApprovalRecord({
      fileId: detail.id,
      fileName: detail.fileName,
      decision: "approved",
      processedBy: session.userId,
      processedByName: session.displayName,
      comment: input.comment
    })
  };
};

export const rejectPerformanceFile = async (
  input: PerformanceRejectionInput,
  session: AuthSession
): Promise<BridgeResult<PerformanceApprovalRecord>> => {
  const detail = await getPendingPerformanceFileDetail(input.fileId);

  if (!detail) {
    return buildMissingFileResult();
  }

  if (detail.status !== "pending") {
    return buildAlreadyProcessedResult();
  }

  return {
    ok: true,
    data: createPerformanceApprovalRecord({
      fileId: detail.id,
      fileName: detail.fileName,
      decision: "rejected",
      processedBy: session.userId,
      processedByName: session.displayName,
      comment: input.comment,
      rejectionReason: input.rejectionReason
    })
  };
};

export const getPerformanceApprovalHistory = () => ({
  ok: true as const,
  data: listPerformanceApprovalHistory()
});
