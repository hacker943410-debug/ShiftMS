import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import {
  restoreMissingMonthlySchedulesFromExportedPlans,
  type RestoreMissingMonthlySchedulesSummary
} from "./monthly-schedule-restore-service";
import { syncApprovedPerformanceFilesToStorage } from "./performance-file-intake-service";

interface PerformanceStartupRecoveryInput {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
}

interface PerformanceStartupRecoverySummary {
  monthlyScheduleRestore: RestoreMissingMonthlySchedulesSummary;
  approvedSyncIssueCount: number;
}

export const recoverPerformanceDataOnStartup = async (
  input: PerformanceStartupRecoveryInput
): Promise<PerformanceStartupRecoverySummary> => {
  const settings = getStoredAppSettingsSnapshot(input);
  const monthlyScheduleRestore = await restoreMissingMonthlySchedulesFromExportedPlans({
    scheduleExportDir: settings.scheduleExportDir
  });
  const approvedSyncIssues = await syncApprovedPerformanceFilesToStorage({
    settings,
    forceReparse: monthlyScheduleRestore.restoredScheduleCount > 0
  });

  return {
    monthlyScheduleRestore,
    approvedSyncIssueCount: approvedSyncIssues.length
  };
};
