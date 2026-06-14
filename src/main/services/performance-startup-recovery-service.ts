import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import {
  restoreMissingMonthlySchedulesFromExportedPlans,
  type RestoreMissingMonthlySchedulesSummary
} from "./monthly-schedule-restore-service";
import {
  pruneExpiredArchivedPerformanceFiles,
  type ArchiveRetentionSummary
} from "./performance-archive-retention-service";
import { syncApprovedPerformanceFilesToStorage } from "./performance-file-intake-service";
import {
  normalizeLegacyPerformanceSiteNames,
  type LegacyPerformanceNameNormalizationSummary
} from "./performance-legacy-name-normalization-service";
import {
  healOrphanPerformanceFiles,
  type OrphanPerformanceFileHealingSummary
} from "./performance-orphan-file-healing-service";
import { recordPerformanceStartupRecoveryStatus } from "./performance-startup-recovery-status-service";

interface PerformanceStartupRecoveryInput {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}

interface PerformanceStartupRecoverySummary {
  legacyNameNormalization: LegacyPerformanceNameNormalizationSummary;
  monthlyScheduleRestore: RestoreMissingMonthlySchedulesSummary;
  approvedSyncIssueCount: number;
  orphanHealing: OrphanPerformanceFileHealingSummary;
  archiveRetention: ArchiveRetentionSummary;
}

export const recoverPerformanceDataOnStartup = async (
  input: PerformanceStartupRecoveryInput
): Promise<PerformanceStartupRecoverySummary> => {
  const settings = getStoredAppSettingsSnapshot(input);
  // Clean up legacy duplicate-suffixed site names (and their hidden matching keys) BEFORE the
  // schedule restore runs, so restore and the approved resync both work against the canonical name.
  const legacyNameNormalization = normalizeLegacyPerformanceSiteNames();
  const monthlyScheduleRestore = await restoreMissingMonthlySchedulesFromExportedPlans({
    scheduleExportDir: settings.scheduleExportDir
  });
  const approvedSyncIssues = await syncApprovedPerformanceFilesToStorage({
    settings,
    forceReparse: monthlyScheduleRestore.restoredScheduleCount > 0
  });
  // Reconcile on-disk files left inconsistent by an interrupted move (surface missing sources,
  // reclaim crash-leftover duplicates, tidy empty folders) AFTER the approved resync has registered
  // every workbook present on disk.
  const orphanHealing = await healOrphanPerformanceFiles({
    userDataPath: input.userDataPath,
    env: input.env
  });
  // Bound the archive folder by reclaiming superseded, long-expired workbooks (in-use copies and all
  // approval/pay records are preserved).
  const archiveRetention = await pruneExpiredArchivedPerformanceFiles();

  recordPerformanceStartupRecoveryStatus({
    restoredScheduleCount: monthlyScheduleRestore.restoredScheduleCount,
    skippedScheduleCount: monthlyScheduleRestore.skippedScheduleCount,
    approvedSyncIssueCount: approvedSyncIssues.length,
    issues: [
      ...monthlyScheduleRestore.issueMessages,
      ...legacyNameNormalization.issueMessages,
      ...orphanHealing.issueMessages,
      ...archiveRetention.issueMessages
    ],
    missingSourceCount: orphanHealing.missingEffectiveSourceCount,
    removedDirectoryCount: orphanHealing.removedEmptyDirectoryCount,
    prunedArchiveCount: archiveRetention.deletedFileCount
  });

  return {
    legacyNameNormalization,
    monthlyScheduleRestore,
    approvedSyncIssueCount: approvedSyncIssues.length,
    orphanHealing,
    archiveRetention
  };
};
