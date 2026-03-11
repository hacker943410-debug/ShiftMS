import { randomUUID } from "node:crypto";

import type { SchedulePlanExportRecord } from "../../shared/domain/schedule-plan";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface SchedulePlanExportRow {
  id: string;
  schedule_id: string;
  schedule_month: string;
  site_name: string;
  pattern_name: string;
  output_file_name: string;
  output_path: string;
  update_count: number;
  publish_status: "draft" | "published";
  published_path?: string | null;
  exported_at: string;
}

const toSchedulePlanExportRecord = (
  row: SchedulePlanExportRow
): SchedulePlanExportRecord => ({
  id: row.id,
  scheduleId: row.schedule_id,
  scheduleMonth: row.schedule_month,
  siteName: row.site_name,
  patternName: row.pattern_name,
  outputFileName: row.output_file_name,
  outputPath: row.output_path,
  updateCount: Number(row.update_count),
  publishStatus: row.publish_status,
  publishedPath: row.published_path ?? undefined,
  exportedAt: row.exported_at
});

export const listStoredSchedulePlanExports = (scheduleId?: string): SchedulePlanExportRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT *
    FROM schedule_plan_exports
    ${scheduleId ? "WHERE schedule_id = ?" : ""}
    ORDER BY exported_at DESC
  `).all(...(scheduleId ? [scheduleId] : [])) as unknown as SchedulePlanExportRow[];

  return rows.map(toSchedulePlanExportRecord);
};

export const saveStoredSchedulePlanExport = (
  input: Omit<SchedulePlanExportRecord, "id">
): SchedulePlanExportRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const id = randomUUID();

  database.prepare(`
    INSERT INTO schedule_plan_exports (
      id,
      schedule_id,
      schedule_month,
      site_name,
      pattern_name,
      output_file_name,
      output_path,
      update_count,
      publish_status,
      published_path,
      exported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.scheduleId,
    input.scheduleMonth,
    input.siteName,
    input.patternName,
    input.outputFileName,
    input.outputPath,
    input.updateCount,
    input.publishStatus ?? "draft",
    input.publishedPath ?? null,
    input.exportedAt
  );

  return listStoredSchedulePlanExports(input.scheduleId).find((item) => item.id === id) as SchedulePlanExportRecord;
};

export const resetSchedulePlanExportHistoryForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM schedule_plan_exports;");
  }
};
