import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  PerformanceApprovalActionInput,
  PerformanceApprovalRecord,
  PerformanceRejectionInput
} from "../../shared/domain/performance-file";
import {
  createPerformanceApprovalRecord,
  getApprovedEntryIdsByFileId,
  getLatestPerformanceApprovalByEntryId,
  listPerformanceApprovalHistory
} from "./performance-approval-service";
import { createPerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";
import { archiveApprovedPerformanceFile } from "./performance-file-archive-service";
import {
  markStoredPerformanceFileArchived,
  setStoredEffectivePerformanceFile,
  updateStoredPerformanceFileApprovalProgress
} from "./performance-file-storage-service";
import { getPendingPerformanceFileDetail } from "./performance-queue-service";

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

  if (getLatestPerformanceApprovalByEntryId(entry.id)?.decision === "approved") {
    return buildAlreadyProcessedResult();
  }

  const record = createPerformanceApprovalRecord({
    fileId: detail.id,
    entry,
    fileName: detail.fileName,
    processedBy: session.userId,
    processedByName: session.displayName,
    comment: input.comment,
    snapshotJson: createPerformanceApprovalSnapshot(detail, entry)
  });
  const approvedEntryIds = getApprovedEntryIdsByFileId(detail.id);

  updateStoredPerformanceFileApprovalProgress({
    fileId: detail.id,
    approvedEntryCount: approvedEntryIds.size
  });

  if (approvedEntryIds.size === detail.entries.length && detail.entries.length > 0 && context?.userDataPath) {
    try {
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
    } catch (error) {
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
