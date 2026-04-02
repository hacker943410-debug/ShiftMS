import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";
import type {
  PerformanceApprovedRowHiddenResult,
  PerformanceApprovedRowHideInput
} from "../../shared/domain/performance-file";
import { getLatestAllowanceCalculationByApprovalId } from "./approved-allowance-calculation-service";
import {
  getPerformanceApprovalById,
  getLatestPerformanceApprovalByLogicalKey
} from "./performance-approval-service";
import { hideApprovedPerformanceRow } from "./performance-approved-row-visibility-service";
import { getStoredPerformanceFileDetail } from "./performance-file-storage-service";

const buildBlockedResult = (
  errorCode: string,
  message: string
): BridgeResult<PerformanceApprovedRowHiddenResult> => ({
  ok: false,
  errorCode,
  message
});

export const hideApprovedPerformanceOverviewRow = (
  input: PerformanceApprovedRowHideInput,
  session: AuthSession
): BridgeResult<PerformanceApprovedRowHiddenResult> => {
  const approval = getPerformanceApprovalById(input.approvalId);

  if (!approval) {
    return buildBlockedResult(
      "PERFORMANCE_APPROVAL_NOT_FOUND",
      "숨길 승인 이력을 찾을 수 없습니다."
    );
  }

  if (approval.decision !== "approved") {
    return buildBlockedResult(
      "PERFORMANCE_APPROVAL_REQUIRED",
      "승인완료 상태의 행만 목록에서 숨길 수 있습니다."
    );
  }

  const latestApproval = getLatestPerformanceApprovalByLogicalKey(approval.logicalKey || approval.entryId);

  if (!latestApproval || latestApproval.id !== approval.id) {
    return buildBlockedResult(
      "PERFORMANCE_APPROVAL_NOT_LATEST",
      "최신 승인 이력만 목록에서 숨길 수 있습니다."
    );
  }

  const detail = getStoredPerformanceFileDetail(approval.fileId);

  if (!detail || detail.directoryType !== "approved") {
    return buildBlockedResult(
      "PERFORMANCE_APPROVED_ARCHIVE_REQUIRED",
      "승인완료 보관본 행만 목록에서 숨길 수 있습니다."
    );
  }

  const entry = detail.entries.find((item) => item.id === approval.entryId);

  if (!entry) {
    return buildBlockedResult(
      "PERFORMANCE_ENTRY_NOT_FOUND",
      "승인완료 행 정보를 찾을 수 없습니다."
    );
  }

  if (getLatestAllowanceCalculationByApprovalId(approval.id)) {
    return buildBlockedResult(
      "PERFORMANCE_ALLOWANCE_HISTORY_EXISTS",
      "품의 이력이 연결된 승인 행은 목록에서 숨길 수 없습니다."
    );
  }

  return {
    ok: true,
    data: hideApprovedPerformanceRow({
      approvalId: approval.id,
      logicalKey: entry.logicalKey,
      fileId: detail.id,
      entryId: entry.id,
      hiddenBy: session.userId,
      hiddenByName: session.displayName
    })
  };
};
