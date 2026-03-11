import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import { resolveAppSettings } from "./app-settings-service";
import {
  listStoredSchedulePlanExports,
  markStoredSchedulePlanExportPublished
} from "./schedule-plan-export-history-service";

export const publishSchedulePlanExport = (input: {
  exportId: string;
  userDataPath: string;
  outputDir?: string;
  env?: NodeJS.ProcessEnv;
}): SchedulePlanExportRecord | null => {
  const exportRecord = listStoredSchedulePlanExports().find((item) => item.id === input.exportId);

  if (!exportRecord) {
    return null;
  }

  const outputDir =
    input.outputDir ??
    resolveAppSettings({
      userDataPath: input.userDataPath,
      env: input.env
    }).approvedDir;
  mkdirSync(outputDir, { recursive: true });

  const publishedPath = path.resolve(outputDir, exportRecord.outputFileName);
  copyFileSync(exportRecord.outputPath, publishedPath);

  return markStoredSchedulePlanExportPublished({
    exportId: input.exportId,
    publishedPath
  });
};
