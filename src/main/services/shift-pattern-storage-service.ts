import { randomUUID } from "node:crypto";

import type {
  ShiftPatternStepInput,
  ShiftPatternUpsertInput
} from "../../shared/bridge/contracts";
import type { ShiftPatternRecord, SiteRecord } from "../../shared/domain/model";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface ShiftPatternRow {
  id: string;
  site_id: string;
  site_name: string;
  name: string;
  cycle_length: number;
  pattern_code: string;
  start_index_rule: string;
  status: ShiftPatternRecord["status"];
  created_at: string;
  updated_at?: string | null;
}

interface ShiftPatternStepRow {
  id: string;
  pattern_id: string;
  step_index: number;
  duty_code: string;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes: number;
}

const defaultPatterns: Array<{
  siteName: string;
  name: string;
  patternCode: string;
  startIndexRule: string;
  status: ShiftPatternRecord["status"];
  steps: ShiftPatternStepInput[];
}> = [
  {
    siteName: "보라매DC",
    name: "보라매 4조 2교대",
    patternCode: "DDNNXX",
    startIndexRule: "team-sequence",
    status: "active",
    steps: [
      { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
      { stepIndex: 2, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
      { stepIndex: 3, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
      { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
      { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
    ]
  },
  {
    siteName: "동탄센터",
    name: "동탄 주간 순환",
    patternCode: "DDDXX",
    startIndexRule: "calendar-start",
    status: "active",
    steps: [
      { stepIndex: 0, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
      { stepIndex: 1, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
      { stepIndex: 2, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
      { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
      { stepIndex: 4, dutyCode: "X", breakMinutes: 0 }
    ]
  }
];

const toShiftPatternRecord = (
  row: ShiftPatternRow,
  steps: ShiftPatternStepRow[]
): ShiftPatternRecord => ({
  id: row.id,
  siteId: row.site_id,
  name: row.name,
  cycleLength: Number(row.cycle_length),
  patternCode: row.pattern_code,
  startIndexRule: row.start_index_rule,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  steps: steps
    .sort((left, right) => left.step_index - right.step_index)
    .map((step) => ({
      id: step.id,
      stepIndex: Number(step.step_index),
      dutyCode: step.duty_code,
      startTime: step.start_time ?? undefined,
      endTime: step.end_time ?? undefined,
      breakMinutes: Number(step.break_minutes)
    }))
});

const insertPatternSteps = (
  patternId: string,
  steps: ShiftPatternStepInput[],
  createdAt: string
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const insertStep = database.prepare(`
    INSERT INTO shift_pattern_steps (
      id,
      pattern_id,
      step_index,
      duty_code,
      start_time,
      end_time,
      break_minutes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  steps.forEach((step) => {
    insertStep.run(
      randomUUID(),
      patternId,
      step.stepIndex,
      step.dutyCode,
      step.startTime ?? null,
      step.endTime ?? null,
      step.breakMinutes,
      createdAt
    );
  });
};

const requireReadyDatabase = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database;
};

const requireShiftPattern = (patternId: string) => {
  const database = requireReadyDatabase();
  const row = database.prepare(`
    SELECT id, site_id, status
    FROM shift_patterns
    WHERE id = ?
    LIMIT 1
  `).get(patternId) as
    | { id: string; site_id: string; status: ShiftPatternRecord["status"] }
    | undefined;

  if (!row) {
    throw new Error("Shift pattern not found.");
  }

  return row;
};

const ensureShiftPatternSeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const row = database.prepare("SELECT COUNT(*) as count FROM shift_patterns").get() as {
    count: number;
  };

  if (row.count > 0) {
    return;
  }

  const sites = listStoredSites();
  const siteMap = new Map<string, SiteRecord>(sites.map((site) => [site.name, site]));
  const insertPattern = database.prepare(`
    INSERT INTO shift_patterns (
      id,
      site_id,
      name,
      cycle_length,
      pattern_code,
      start_index_rule,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();

  defaultPatterns.forEach((pattern) => {
    const targetSite = siteMap.get(pattern.siteName);

    if (!targetSite) {
      return;
    }

    const patternId = randomUUID();
    insertPattern.run(
      patternId,
      targetSite.id,
      pattern.name,
      pattern.steps.length,
      pattern.patternCode,
      pattern.startIndexRule,
      pattern.status,
      now,
      now
    );
    insertPatternSteps(patternId, pattern.steps, now);
  });
};

export const listStoredShiftPatterns = (siteId?: string): ShiftPatternRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureShiftPatternSeed();

  const patternRows = database.prepare(`
    SELECT
      shift_patterns.*,
      sites.name as site_name
    FROM shift_patterns
    INNER JOIN sites
      ON sites.id = shift_patterns.site_id
    ${siteId ? "WHERE shift_patterns.site_id = ?" : ""}
    ORDER BY sites.name ASC, shift_patterns.name ASC
  `).all(...(siteId ? [siteId] : [])) as unknown as ShiftPatternRow[];

  const stepRows = database.prepare(`
    SELECT *
    FROM shift_pattern_steps
    ORDER BY pattern_id ASC, step_index ASC
  `).all() as unknown as ShiftPatternStepRow[];

  const stepsByPatternId = new Map<string, ShiftPatternStepRow[]>();

  stepRows.forEach((step) => {
    const current = stepsByPatternId.get(step.pattern_id) ?? [];
    current.push(step);
    stepsByPatternId.set(step.pattern_id, current);
  });

  return patternRows.map((row) =>
    toShiftPatternRecord(row, stepsByPatternId.get(row.id) ?? [])
  );
};

export const saveStoredShiftPattern = (input: ShiftPatternUpsertInput): ShiftPatternRecord => {
  const database = requireReadyDatabase();

  ensureShiftPatternSeed();

  const existing = input.id
    ? (database.prepare(`
        SELECT *
        FROM shift_patterns
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as Record<string, unknown> | undefined)
    : undefined;
  const id = existing ? String(existing.id) : randomUUID();
  const createdAt = existing ? String(existing.created_at) : new Date().toISOString();
  const updatedAt = new Date().toISOString();

  database.prepare(`
    INSERT INTO shift_patterns (
      id,
      site_id,
      name,
      cycle_length,
      pattern_code,
      start_index_rule,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      site_id = excluded.site_id,
      name = excluded.name,
      cycle_length = excluded.cycle_length,
      pattern_code = excluded.pattern_code,
      start_index_rule = excluded.start_index_rule,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    id,
    input.siteId,
    input.name,
    input.steps.length,
    input.patternCode,
    input.startIndexRule,
    input.status,
    createdAt,
    updatedAt
  );

  database.prepare(`
    DELETE FROM shift_pattern_steps
    WHERE pattern_id = ?
  `).run(id);
  insertPatternSteps(id, input.steps, updatedAt);

  return listStoredShiftPatterns(input.siteId).find((pattern) => pattern.id === id) as ShiftPatternRecord;
};

export const deactivateStoredShiftPattern = (patternId: string): ShiftPatternRecord => {
  const database = requireReadyDatabase();

  ensureShiftPatternSeed();

  const existing = requireShiftPattern(patternId);

  if (existing.status === "inactive") {
    throw new Error("Shift pattern is already inactive.");
  }

  const updatedAt = new Date().toISOString();

  database.prepare(`
    UPDATE shift_patterns
    SET status = 'inactive',
        updated_at = ?
    WHERE id = ?
  `).run(updatedAt, patternId);

  return listStoredShiftPatterns(existing.site_id).find(
    (pattern) => pattern.id === patternId
  ) as ShiftPatternRecord;
};

export const resetShiftPatternStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM shift_pattern_steps;");
    database.exec("DELETE FROM shift_patterns;");
  }
};
