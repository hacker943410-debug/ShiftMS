import type { PerformanceStartupRecoveryStatusSnapshot } from "../../shared/domain/performance-file";

// Holds the result of the most recent app-startup performance recovery pass in memory so the
// renderer can read it over IPC and surface unrecovered months. Mirrors the in-memory holder
// pattern used for the file-sync state snapshot.

const EMPTY_STATUS: PerformanceStartupRecoveryStatusSnapshot = {
  hasRun: false,
  completedAt: null,
  restoredScheduleCount: 0,
  skippedScheduleCount: 0,
  approvedSyncIssueCount: 0,
  issues: [],
  missingSourceCount: 0,
  removedDirectoryCount: 0,
  prunedArchiveCount: 0
};

let startupRecoveryStatus: PerformanceStartupRecoveryStatusSnapshot = EMPTY_STATUS;

interface RecordStartupRecoveryStatusInput {
  restoredScheduleCount: number;
  skippedScheduleCount: number;
  approvedSyncIssueCount: number;
  issues: string[];
  completedAt?: string;
  missingSourceCount?: number;
  removedDirectoryCount?: number;
  prunedArchiveCount?: number;
}

export const recordPerformanceStartupRecoveryStatus = (
  input: RecordStartupRecoveryStatusInput
): PerformanceStartupRecoveryStatusSnapshot => {
  startupRecoveryStatus = {
    hasRun: true,
    completedAt: input.completedAt ?? new Date().toISOString(),
    restoredScheduleCount: input.restoredScheduleCount,
    skippedScheduleCount: input.skippedScheduleCount,
    approvedSyncIssueCount: input.approvedSyncIssueCount,
    issues: [...input.issues],
    missingSourceCount: input.missingSourceCount ?? 0,
    removedDirectoryCount: input.removedDirectoryCount ?? 0,
    prunedArchiveCount: input.prunedArchiveCount ?? 0
  };

  return startupRecoveryStatus;
};

export const getPerformanceStartupRecoveryStatusSnapshot =
  (): PerformanceStartupRecoveryStatusSnapshot => startupRecoveryStatus;

export const resetPerformanceStartupRecoveryStatusForTest = () => {
  startupRecoveryStatus = EMPTY_STATUS;
};
