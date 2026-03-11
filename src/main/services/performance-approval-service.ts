import { randomUUID } from "node:crypto";

import type { PerformanceFileStatus } from "../../shared/domain/model";
import type { PerformanceApprovalRecord } from "../../shared/domain/performance-file";

interface CreateApprovalRecordInput {
  fileId: string;
  fileName: string;
  decision: PerformanceApprovalRecord["decision"];
  processedBy: string;
  processedByName: string;
  comment?: string;
  rejectionReason?: string;
}

const statusByDecision: Record<
  PerformanceApprovalRecord["decision"],
  Extract<PerformanceFileStatus, "approved" | "rejected">
> = {
  approved: "approved",
  rejected: "rejected"
};

const approvalHistoryStore: PerformanceApprovalRecord[] = [];
const fileStatusStore = new Map<string, PerformanceFileStatus>();

export const createPerformanceApprovalRecord = (
  input: CreateApprovalRecordInput
): PerformanceApprovalRecord => {
  const record: PerformanceApprovalRecord = {
    id: randomUUID(),
    fileId: input.fileId,
    fileName: input.fileName,
    decision: input.decision,
    processedAt: new Date().toISOString(),
    processedBy: input.processedBy,
    processedByName: input.processedByName,
    comment: input.comment,
    rejectionReason: input.rejectionReason
  };

  approvalHistoryStore.unshift(record);
  fileStatusStore.set(input.fileId, statusByDecision[input.decision]);

  return record;
};

export const resolvePerformanceFileStatus = (
  fileId: string,
  fallbackStatus: PerformanceFileStatus
): PerformanceFileStatus => fileStatusStore.get(fileId) ?? fallbackStatus;

export const getPerformanceApprovalHistory = (
  fileId: string
): PerformanceApprovalRecord[] =>
  approvalHistoryStore.filter((record) => record.fileId === fileId);

export const getLatestPerformanceApproval = (
  fileId: string
): PerformanceApprovalRecord | null => getPerformanceApprovalHistory(fileId)[0] ?? null;

export const listPerformanceApprovalHistory = (): PerformanceApprovalRecord[] => [
  ...approvalHistoryStore
];

export const resetPerformanceApprovalStateForTest = () => {
  approvalHistoryStore.length = 0;
  fileStatusStore.clear();
};
