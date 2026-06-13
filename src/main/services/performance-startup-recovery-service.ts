import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import {
  restoreMissingMonthlySchedulesFromExportedPlans,
  type RestoreMissingMonthlySchedulesSummary
} from "./monthly-schedule-restore-service";
import { syncApprovedPerformanceFilesToStorage } from "./performance-file-intake-service";
import {
  normalizeLegacyPerformanceSiteNames,
  type LegacyPerformanceNameNormalizationSummary
} from "./performance-legacy-name-normalization-service";
import { recordPerformanceStartupRecoveryStatus } from "./performance-startup-recovery-status-service";

interface PerformanceStartupRecoveryInput {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}

interface PerformanceStartupRecoverySummary {
  legacyNameNormalization: LegacyPerformanceNameNormalizationSummary;
  monthlyScheduleRestore: RestoreMissingMonthlySchedulesSummary;
  approvedSyncIssueCount: number;
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

  recordPerformanceStartupRecoveryStatus({
    restoredScheduleCount: monthlyScheduleRestore.restoredScheduleCount,
    skippedScheduleCount: monthlyScheduleRestore.skippedScheduleCount,
    approvedSyncIssueCount: approvedSyncIssues.length,
    issues: [...monthlyScheduleRestore.issueMessages, ...legacyNameNormalization.issueMessages]
  });

  return {
    legacyNameNormalization,
    monthlyScheduleRestore,
    approvedSyncIssueCount: approvedSyncIssues.length
  };
};
