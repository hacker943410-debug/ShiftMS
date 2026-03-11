import { mkdirSync } from "node:fs";
import path from "node:path";

import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import { resolveAppSettings } from "./app-settings-service";
import { getSampleSchedulePlanPath, writeSchedulePlanWorkbook } from "./schedule-plan-adapter";
import { previewMonthlySchedulePlan } from "./schedule-plan-preview-service";

const sanitizeFileSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "_");

export const exportMonthlySchedulePlan = async (input: {
  scheduleId: string;
  userDataPath: string;
  outputDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SchedulePlanExportRecord | null> => {
  const preview = await previewMonthlySchedulePlan(input.scheduleId);

  if (!preview) {
    return null;
  }

  const outputDir =
    input.outputDir ??
    resolveAppSettings({
      userDataPath: input.userDataPath,
      env: input.env
    }).scheduleExportDir;
  mkdirSync(outputDir, { recursive: true });

  const outputFileName = `${sanitizeFileSegment(preview.siteName)}_${sanitizeFileSegment(
    preview.scheduleMonth
  )}_${sanitizeFileSegment(preview.patternName)}.xlsx`;
  const outputPath = path.resolve(outputDir, outputFileName);

  await writeSchedulePlanWorkbook({
    templatePath: getSampleSchedulePlanPath(),
    outputPath,
    updates: preview.updates
  });

  return {
    scheduleId: preview.scheduleId,
    scheduleMonth: preview.scheduleMonth,
    siteName: preview.siteName,
    patternName: preview.patternName,
    outputFileName,
    outputPath,
    updateCount: preview.updateCount,
    exportedAt: new Date().toISOString()
  };
};
