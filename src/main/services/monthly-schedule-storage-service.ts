import { randomUUID } from "node:crypto";

import type { MonthlyScheduleUpsertInput } from "../../shared/bridge/contracts";
import type { MonthlyScheduleItem, MonthlyScheduleRecord } from "../../shared/domain/model";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface MonthlyScheduleRow {
  id: string;
  site_id: string;
  site_name: string;
  schedule_month: string;
  pattern_id: string;
  pattern_name: string;
  generated_at: string;
  generated_by: string;
  template_version_id?: string | null;
}

interface MonthlyScheduleItemRow {
  id: string;
  schedule_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  work_date: string;
  duty_code: string;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes: number;
}

const toScheduleItem = (row: MonthlyScheduleItemRow): MonthlyScheduleItem => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeCode: row.employee_code,
  employeeName: row.employee_name,
  workDate: row.work_date,
  dutyCode: row.duty_code,
  startTime: row.start_time ?? undefined,
  endTime: row.end_time ?? undefined,
  breakMinutes: Number(row.break_minutes)
});

const toScheduleRecord = (
  row: MonthlyScheduleRow,
  items: MonthlyScheduleItem[]
): MonthlyScheduleRecord => ({
  id: row.id,
  siteId: row.site_id,
  siteName: row.site_name,
  scheduleMonth: row.schedule_month,
  patternId: row.pattern_id,
  patternName: row.pattern_name,
  generatedAt: row.generated_at,
  generatedBy: row.generated_by,
  templateVersionId: row.template_version_id ?? undefined,
  items
});

export const listStoredMonthlySchedules = (siteId?: string): MonthlyScheduleRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const scheduleRows = database.prepare(`
    SELECT
      monthly_schedules.*,
      sites.name as site_name,
      shift_patterns.name as pattern_name
    FROM monthly_schedules
    INNER JOIN sites
      ON sites.id = monthly_schedules.site_id
    INNER JOIN shift_patterns
      ON shift_patterns.id = monthly_schedules.pattern_id
    ${siteId ? "WHERE monthly_schedules.site_id = ?" : ""}
    ORDER BY monthly_schedules.schedule_month DESC, monthly_schedules.generated_at DESC
  `).all(...(siteId ? [siteId] : [])) as unknown as MonthlyScheduleRow[];

  const itemRows = database.prepare(`
    SELECT
      monthly_schedule_items.*,
      employees.employee_code,
      employees.name as employee_name
    FROM monthly_schedule_items
    INNER JOIN employees
      ON employees.id = monthly_schedule_items.employee_id
    ORDER BY monthly_schedule_items.work_date ASC
  `).all() as unknown as MonthlyScheduleItemRow[];

  const itemsByScheduleId = new Map<string, MonthlyScheduleItem[]>();

  itemRows.forEach((itemRow) => {
    const currentItems = itemsByScheduleId.get(itemRow.schedule_id) ?? [];
    currentItems.push(toScheduleItem(itemRow));
    itemsByScheduleId.set(itemRow.schedule_id, currentItems);
  });

  return scheduleRows.map((row) => toScheduleRecord(row, itemsByScheduleId.get(row.id) ?? []));
};

export const saveStoredMonthlySchedule = (
  input: MonthlyScheduleUpsertInput
): MonthlyScheduleRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const existing = input.id
    ? (database.prepare(`
        SELECT *
        FROM monthly_schedules
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as Record<string, unknown> | undefined)
    : undefined;

  const id = existing ? String(existing.id) : randomUUID();
  const generatedAt = existing ? String(existing.generated_at) : new Date().toISOString();

  database.prepare(`
    INSERT INTO monthly_schedules (
      id,
      site_id,
      schedule_month,
      pattern_id,
      generated_at,
      generated_by,
      template_version_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      site_id = excluded.site_id,
      schedule_month = excluded.schedule_month,
      pattern_id = excluded.pattern_id,
      generated_by = excluded.generated_by,
      template_version_id = excluded.template_version_id
  `).run(
    id,
    input.siteId,
    input.scheduleMonth,
    input.patternId,
    generatedAt,
    input.generatedBy,
    input.templateVersionId ?? null
  );

  database.prepare(`
    DELETE FROM monthly_schedule_items
    WHERE schedule_id = ?
  `).run(id);

  const employeeRows = database.prepare(`
    SELECT id, employee_code
    FROM employees
  `).all() as Array<{ id: string; employee_code: string }>;
  const employeeMap = new Map(employeeRows.map((row) => [row.employee_code, row.id]));
  const insertItem = database.prepare(`
    INSERT INTO monthly_schedule_items (
      id,
      schedule_id,
      employee_id,
      work_date,
      duty_code,
      start_time,
      end_time,
      break_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  input.items.forEach((item) => {
    const employeeId = employeeMap.get(item.employeeCode);

    if (!employeeId) {
      throw new Error(`직원 사번을 찾을 수 없습니다: ${item.employeeCode}`);
    }

    insertItem.run(
      randomUUID(),
      id,
      employeeId,
      item.workDate,
      item.dutyCode,
      item.startTime ?? null,
      item.endTime ?? null,
      item.breakMinutes
    );
  });

  return listStoredMonthlySchedules(input.siteId).find((schedule) => schedule.id === id) as MonthlyScheduleRecord;
};

export const resetMonthlyScheduleStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM monthly_schedule_items;");
    database.exec("DELETE FROM monthly_schedules;");
  }
};
