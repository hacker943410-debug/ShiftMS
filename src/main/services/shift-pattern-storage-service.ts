import { randomUUID } from "node:crypto";

import type {
  ShiftPatternCycleInput,
  ShiftPatternTeamCapacityInput,
  ShiftPatternTeamCycleAssignmentInput,
  ShiftPatternTeamIndexInput,
  ShiftPatternTeamSettingInput,
  ShiftPatternStepInput,
  ShiftPatternUpsertInput
} from "../../shared/bridge/contracts";
import type {
  ShiftPatternCycle,
  ShiftPatternRecord,
  ShiftPatternTeamCapacity,
  ShiftPatternTeamCycleAssignment,
  ShiftPatternTeamSetting,
  SiteRecord
} from "../../shared/domain/model";
import {
  getDefaultTeamWorkType,
  isPoolTeamLabel,
  normalizeTeamWorkType
} from "../../shared/domain/team-work-type";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface ShiftPatternRow {
  id: string;
  site_id: string;
  name: string;
  team_count: number;
  cycle_length: number;
  pattern_code: string;
  start_index_rule: string;
  pattern_start_date?: string | null;
  effective_from?: string | null;
  pool_enabled: number;
  pool_start_time?: string | null;
  pool_end_time?: string | null;
  pool_break_minutes: number;
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

interface ShiftPatternTeamIndexRow {
  id: string;
  pattern_id: string;
  team_label: string;
  team_index: number;
}

interface ShiftPatternCycleRow {
  id: string;
  pattern_id: string;
  cycle_key: string;
  cycle_name: string;
  cycle_order: number;
  shift_count: number;
  cycle_length: number;
  pattern_code: string;
  pattern_string?: string | null;
  pattern_start_date?: string | null;
  holiday_time_mode?: string | null;
  weekday_public_holiday_as_holiday?: number | null;
}

interface ShiftPatternCycleStepRow {
  id: string;
  cycle_id: string;
  step_index: number;
  duty_code: string;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes: number;
  holiday_start_time?: string | null;
  holiday_end_time?: string | null;
  holiday_break_minutes?: number | null;
}

interface ShiftPatternCycleTeamIndexRow {
  id: string;
  cycle_id: string;
  team_label: string;
  team_index: number;
}

interface ShiftPatternTeamCycleRow {
  id: string;
  pattern_id: string;
  team_label: string;
  cycle_key: string;
}

interface ShiftPatternTeamCapacityRow {
  id: string;
  pattern_id: string;
  team_label: string;
  max_headcount: number;
}

interface ShiftPatternTeamSettingRow {
  id: string;
  pattern_id: string;
  team_label: string;
  display_name?: string | null;
  work_type: string;
  is_active: number;
  sort_order: number;
}

interface SeedPatternDefinition {
  siteName: string;
  input: ShiftPatternUpsertInput;
}

interface NormalizedCycleInput {
  cycleKey: string;
  name: string;
  order: number;
  shiftCount: number;
  patternCode: string;
  patternString?: string;
  patternStartDate?: string;
  steps: ShiftPatternStepInput[];
  teamIndexes: ShiftPatternTeamIndexInput[];
  holidayTimeMode?: "unified" | "split";
  weekdayPublicHolidayAsHoliday?: boolean;
}

const OFF_DUTY_CODES = new Set(["X", "OFF", "O"]);

const normalizeDutyCode = (value: string) => value.trim().toUpperCase();

const getTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const createSequentialTeamIndexes = (teamCount: number): ShiftPatternTeamIndexInput[] =>
  getTeamLabels(teamCount).map((teamLabel, index) => ({
    teamLabel,
    index
  }));

const normalizeTeamIndexes = (
  teamCount: number,
  teamIndexes: ShiftPatternTeamIndexInput[],
  extraTeamLabels: string[] = []
): ShiftPatternTeamIndexInput[] => {
  const baseLabels = getTeamLabels(teamCount);
  const fallback = [...baseLabels, ...extraTeamLabels.filter((label) => !baseLabels.includes(label))];

  return fallback.map((teamLabel, index) => ({
    teamLabel,
    index: teamIndexes.find((candidate) => candidate.teamLabel === teamLabel)?.index ?? index
  }));
};

const normalizeTeamCapacities = (
  teamCount: number,
  teamCapacities?: Array<ShiftPatternTeamCapacityInput | ShiftPatternTeamCapacity>,
  extraTeamLabels: string[] = []
): ShiftPatternTeamCapacity[] => {
  const baseLabels = getTeamLabels(teamCount);

  return [
    ...baseLabels,
    ...extraTeamLabels.filter((label) => !baseLabels.includes(label))
  ].map((teamLabel) => {
    const maxHeadcount = teamCapacities?.find((item) => item.teamLabel === teamLabel)?.maxHeadcount;

    return {
      teamLabel,
      maxHeadcount:
        typeof maxHeadcount === "number" &&
        Number.isInteger(maxHeadcount) &&
        maxHeadcount > 0
          ? maxHeadcount
          : undefined
    };
  });
};

const LEGACY_POOL_TEAM_LABEL = "Pool";

// 이 패턴이 실제로 다루는 조 이름 목록. 기본은 A조..N조이고, 조별 설정에 추가된 이름(Pool 등)이 뒤에 붙는다.
const getPatternTeamLabels = (
  teamCount: number,
  teamSettings?: Array<Pick<ShiftPatternTeamSettingInput, "teamLabel">>
) => {
  const baseLabels = getTeamLabels(teamCount);
  const seenLabels = new Set(baseLabels);
  const extraLabels: string[] = [];

  teamSettings?.forEach((item) => {
    const teamLabel = item.teamLabel?.trim();

    if (!teamLabel || seenLabels.has(teamLabel)) {
      return;
    }

    seenLabels.add(teamLabel);
    extraLabels.push(teamLabel);
  });

  return [...baseLabels, ...extraLabels];
};

// 조별 설정 정규화. 저장된 값이 없으면 이름 기준 기본값(Pool 계열 → POOL, 그 외 → ROTATING)으로 채운다.
// poolEnabled만 켜져 있던 기존 패턴에는 Pool 조를 맨 앞에 하나 만들어 준다(Pool → A조 → B조 …).
const normalizeTeamSettings = (
  teamCount: number,
  poolEnabled: boolean,
  teamSettings?: ShiftPatternTeamSettingInput[]
): ShiftPatternTeamSetting[] => {
  const inputByLabel = new Map(
    (teamSettings ?? [])
      .filter((item) => item.teamLabel?.trim())
      .map((item) => [item.teamLabel.trim(), item] as const)
  );
  const labels = getPatternTeamLabels(teamCount, teamSettings);
  const resolvedLabels = poolEnabled && !labels.some(isPoolTeamLabel)
    ? [LEGACY_POOL_TEAM_LABEL, ...labels]
    : labels;

  return resolvedLabels
    .map((teamLabel, index) => {
      const matched = inputByLabel.get(teamLabel);
      const displayName = matched?.displayName?.trim();
      const sortOrder =
        typeof matched?.sortOrder === "number" &&
        Number.isInteger(matched.sortOrder) &&
        matched.sortOrder >= 0
          ? matched.sortOrder
          : index;

      return {
        ordinal: index,
        setting: {
          teamLabel,
          displayName: displayName && displayName !== teamLabel ? displayName : undefined,
          workType: normalizeTeamWorkType(matched?.workType, getDefaultTeamWorkType(teamLabel)),
          isActive: matched?.isActive !== false,
          sortOrder
        } satisfies ShiftPatternTeamSetting
      };
    })
    .sort(
      (left, right) =>
        left.setting.sortOrder - right.setting.sortOrder || left.ordinal - right.ordinal
    )
    .map((item, index) => ({ ...item.setting, sortOrder: index }));
};

const mapTeamSettingRows = (
  teamCount: number,
  poolEnabled: boolean,
  rows: ShiftPatternTeamSettingRow[]
): ShiftPatternTeamSetting[] =>
  normalizeTeamSettings(
    teamCount,
    poolEnabled,
    rows.map((row) => ({
      teamLabel: row.team_label,
      displayName: row.display_name ?? undefined,
      workType: normalizeTeamWorkType(row.work_type, getDefaultTeamWorkType(row.team_label)),
      isActive: Number(row.is_active ?? 1) !== 0,
      sortOrder: Number(row.sort_order ?? 0)
    }))
  );

const getShiftCountFromSteps = (steps: ShiftPatternStepInput[]) => {
  const workingCodes = new Set(
    steps
      .map((step) => normalizeDutyCode(step.dutyCode))
      .filter((dutyCode) => !OFF_DUTY_CODES.has(dutyCode))
  );

  return Math.max(workingCodes.size, 1);
};

const normalizeCycleInput = (
  cycle: ShiftPatternCycleInput,
  order: number,
  teamCount: number,
  extraTeamLabels: string[]
): NormalizedCycleInput => ({
  cycleKey: cycle.cycleKey.trim() || `cycle-${order + 1}`,
  name: cycle.name.trim() || `Cycle ${order + 1}`,
  order,
  shiftCount: Math.max(cycle.shiftCount, getShiftCountFromSteps(cycle.steps)),
  patternCode: cycle.patternCode,
  patternString: cycle.patternString?.trim() || undefined,
  patternStartDate: cycle.patternStartDate,
  steps: cycle.steps,
  teamIndexes: normalizeTeamIndexes(teamCount, cycle.teamIndexes, extraTeamLabels),
  holidayTimeMode: cycle.holidayTimeMode === "split" ? "split" : undefined,
  weekdayPublicHolidayAsHoliday:
    cycle.holidayTimeMode === "split" ? cycle.weekdayPublicHolidayAsHoliday : undefined
});

const normalizeCycles = (
  input: ShiftPatternUpsertInput,
  extraTeamLabels: string[] = []
): NormalizedCycleInput[] => {
  if (input.cycles && input.cycles.length > 0) {
    return input.cycles
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((cycle, index) =>
        normalizeCycleInput(cycle, index, input.teamCount, extraTeamLabels)
      );
  }

  return [
    {
      cycleKey: "cycle-1",
      name: "Cycle 1",
      order: 0,
      shiftCount: getShiftCountFromSteps(input.steps),
      patternCode: input.patternCode,
      patternStartDate: input.patternStartDate,
      steps: input.steps,
      teamIndexes: normalizeTeamIndexes(input.teamCount, input.teamIndexes, extraTeamLabels)
    }
  ];
};

// 조 → Cycle 배정. Pool 성격 조는 명시적으로 배정했을 때만 Cycle을 갖는다
// (배정이 없으면 기존처럼 근무표 자동생성 대상에서 빠진다).
const normalizeTeamCycleAssignments = (
  teamSettings: ShiftPatternTeamSetting[],
  cycles: NormalizedCycleInput[],
  assignments?: ShiftPatternTeamCycleAssignmentInput[]
): ShiftPatternTeamCycleAssignment[] => {
  const firstCycleKey = cycles[0]?.cycleKey ?? "cycle-1";
  const availableCycleKeys = new Set(cycles.map((cycle) => cycle.cycleKey));

  return teamSettings.flatMap((setting) => {
    const matchedCycleKey = assignments?.find(
      (item) => item.teamLabel === setting.teamLabel
    )?.cycleKey;
    const resolvedCycleKey =
      typeof matchedCycleKey === "string" && availableCycleKeys.has(matchedCycleKey)
        ? matchedCycleKey
        : undefined;

    if (resolvedCycleKey) {
      return [{ teamLabel: setting.teamLabel, cycleKey: resolvedCycleKey }];
    }

    if (setting.workType === "POOL") {
      return [];
    }

    return [{ teamLabel: setting.teamLabel, cycleKey: firstCycleKey }];
  });
};

const mapStepRows = (rows: Array<ShiftPatternStepRow | ShiftPatternCycleStepRow>) =>
  rows
    .slice()
    .sort((left, right) => left.step_index - right.step_index)
    .map((step) => {
      // 휴일 칸은 cycle step 테이블에만 있고 legacy step 테이블엔 없다 → 없으면 undefined로 떨어져 평일값을 그대로 쓴다.
      const cycleStep = step as ShiftPatternCycleStepRow;

      return {
        id: step.id,
        stepIndex: Number(step.step_index),
        dutyCode: step.duty_code,
        startTime: step.start_time ?? undefined,
        endTime: step.end_time ?? undefined,
        breakMinutes: Number(step.break_minutes),
        holidayStartTime: cycleStep.holiday_start_time ?? undefined,
        holidayEndTime: cycleStep.holiday_end_time ?? undefined,
        holidayBreakMinutes:
          cycleStep.holiday_break_minutes === undefined ||
          cycleStep.holiday_break_minutes === null
            ? undefined
            : Number(cycleStep.holiday_break_minutes)
      };
    });

const mapTeamIndexRows = (
  rows: Array<ShiftPatternTeamIndexRow | ShiftPatternCycleTeamIndexRow>
) =>
  rows
    .slice()
    .sort((left, right) => left.team_label.localeCompare(right.team_label, "ko-KR", { numeric: true }))
    .map((item) => ({
      teamLabel: item.team_label,
      index: Number(item.team_index)
    }));

const buildDefaultTeamCycleAssignments = (
  teamSettings: ShiftPatternTeamSetting[],
  cycles: ShiftPatternCycle[]
): ShiftPatternTeamCycleAssignment[] => {
  const firstCycleKey = cycles[0]?.cycleKey ?? "cycle-1";
  const mappedAssignments = new Map<string, string>();

  cycles.forEach((cycle) => {
    cycle.teamIndexes.forEach((item) => {
      if (!mappedAssignments.has(item.teamLabel)) {
        mappedAssignments.set(item.teamLabel, cycle.cycleKey);
      }
    });
  });

  return teamSettings.flatMap((setting) => {
    const mappedCycleKey = mappedAssignments.get(setting.teamLabel);

    if (mappedCycleKey) {
      return [{ teamLabel: setting.teamLabel, cycleKey: mappedCycleKey }];
    }

    // Pool 성격 조는 배정 이력이 없으면 Cycle을 만들어 주지 않는다.
    if (setting.workType === "POOL") {
      return [];
    }

    return [{ teamLabel: setting.teamLabel, cycleKey: firstCycleKey }];
  });
};

const toLegacyCycle = (
  row: ShiftPatternRow,
  steps: ShiftPatternStepRow[],
  teamIndexes: ShiftPatternTeamIndexRow[]
): ShiftPatternCycle => ({
  id: `${row.id}-legacy`,
  cycleKey: "cycle-1",
  name: "Cycle 1",
  order: 0,
  shiftCount: getShiftCountFromSteps(mapStepRows(steps)),
  cycleLength: Number(row.cycle_length),
  patternCode: row.pattern_code,
  patternStartDate: row.pattern_start_date ?? undefined,
  steps: mapStepRows(steps),
  teamIndexes: mapTeamIndexRows(teamIndexes)
});

const toShiftPatternRecord = (
  row: ShiftPatternRow,
  legacySteps: ShiftPatternStepRow[],
  legacyTeamIndexes: ShiftPatternTeamIndexRow[],
  cycleRows: ShiftPatternCycleRow[],
  cycleStepsByCycleId: Map<string, ShiftPatternCycleStepRow[]>,
  cycleTeamIndexesByCycleId: Map<string, ShiftPatternCycleTeamIndexRow[]>,
  teamCycleAssignments: ShiftPatternTeamCycleRow[],
  teamCapacityRows: ShiftPatternTeamCapacityRow[],
  teamSettingRows: ShiftPatternTeamSettingRow[]
): ShiftPatternRecord => {
  const cycles =
    cycleRows.length > 0
      ? cycleRows
          .slice()
          .sort((left, right) => left.cycle_order - right.cycle_order)
          .map((cycleRow) => ({
            id: cycleRow.id,
            cycleKey: cycleRow.cycle_key,
            name: cycleRow.cycle_name,
            order: Number(cycleRow.cycle_order),
            shiftCount: Number(cycleRow.shift_count),
            cycleLength: Number(cycleRow.cycle_length),
            patternCode: cycleRow.pattern_code,
            patternString: cycleRow.pattern_string ?? undefined,
            patternStartDate: cycleRow.pattern_start_date ?? undefined,
            steps: mapStepRows(cycleStepsByCycleId.get(cycleRow.id) ?? []),
            teamIndexes: mapTeamIndexRows(cycleTeamIndexesByCycleId.get(cycleRow.id) ?? []),
            holidayTimeMode:
              cycleRow.holiday_time_mode === "split"
                ? ("split" as const)
                : cycleRow.holiday_time_mode === "unified"
                  ? ("unified" as const)
                  : undefined,
            weekdayPublicHolidayAsHoliday:
              cycleRow.weekday_public_holiday_as_holiday === undefined ||
              cycleRow.weekday_public_holiday_as_holiday === null
                ? undefined
                : Number(cycleRow.weekday_public_holiday_as_holiday) !== 0
          }))
      : [toLegacyCycle(row, legacySteps, legacyTeamIndexes)];
  const primaryCycle = cycles[0] ?? toLegacyCycle(row, legacySteps, legacyTeamIndexes);
  const teamSettings = mapTeamSettingRows(
    Number(row.team_count),
    Boolean(row.pool_enabled),
    teamSettingRows
  );
  const extraTeamLabels = teamSettings
    .map((setting) => setting.teamLabel)
    .filter((teamLabel) => !getTeamLabels(Number(row.team_count)).includes(teamLabel));

  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    teamCount: Number(row.team_count),
    cycleLength: primaryCycle.cycleLength,
    patternCode: primaryCycle.patternCode,
    startIndexRule: row.start_index_rule,
    patternStartDate: primaryCycle.patternStartDate,
    // 적용 시작일이 저장돼 있지 않은 예전 행은 패턴 시작일을 그대로 쓴다.
    effectiveFrom: row.effective_from ?? primaryCycle.patternStartDate,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    steps: primaryCycle.steps,
    teamIndexes: normalizeTeamIndexes(
      Number(row.team_count),
      primaryCycle.teamIndexes,
      extraTeamLabels
    ),
    cycles,
    teamCycleAssignments:
      teamCycleAssignments.length > 0
        ? teamCycleAssignments
            .slice()
            .sort((left, right) =>
              left.team_label.localeCompare(right.team_label, "ko-KR", { numeric: true })
            )
            .map((item) => ({
              teamLabel: item.team_label,
              cycleKey: item.cycle_key
            }))
        : buildDefaultTeamCycleAssignments(teamSettings, cycles),
    teamCapacities: normalizeTeamCapacities(
      Number(row.team_count),
      teamCapacityRows.map((item) => ({
        teamLabel: item.team_label,
        maxHeadcount: Number(item.max_headcount)
      })),
      extraTeamLabels
    ),
    teamSettings,
    poolEnabled: Boolean(row.pool_enabled),
    poolStartTime: row.pool_start_time ?? undefined,
    poolEndTime: row.pool_end_time ?? undefined,
    poolBreakMinutes: Number(row.pool_break_minutes ?? 0)
  };
};

const insertPatternSteps = (patternId: string, steps: ShiftPatternStepInput[], createdAt: string) => {
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

const insertPatternTeamIndexes = (
  patternId: string,
  teamIndexes: ShiftPatternTeamIndexInput[],
  createdAt: string
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const insertTeamIndex = database.prepare(`
    INSERT INTO shift_pattern_team_indexes (
      id,
      pattern_id,
      team_label,
      team_index,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `);

  teamIndexes.forEach((item) => {
    insertTeamIndex.run(randomUUID(), patternId, item.teamLabel, item.index, createdAt);
  });
};

const insertPatternCycles = (
  patternId: string,
  cycles: NormalizedCycleInput[],
  createdAt: string
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const insertCycle = database.prepare(`
    INSERT INTO shift_pattern_cycles (
      id,
      pattern_id,
      cycle_key,
      cycle_name,
      cycle_order,
      shift_count,
      cycle_length,
      pattern_code,
      pattern_string,
      pattern_start_date,
      holiday_time_mode,
      weekday_public_holiday_as_holiday,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertStep = database.prepare(`
    INSERT INTO shift_pattern_cycle_steps (
      id,
      cycle_id,
      step_index,
      duty_code,
      start_time,
      end_time,
      break_minutes,
      holiday_start_time,
      holiday_end_time,
      holiday_break_minutes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTeamIndex = database.prepare(`
    INSERT INTO shift_pattern_cycle_team_indexes (
      id,
      cycle_id,
      team_label,
      team_index,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `);

  cycles.forEach((cycle) => {
    const cycleId = randomUUID();

    insertCycle.run(
      cycleId,
      patternId,
      cycle.cycleKey,
      cycle.name,
      cycle.order,
      cycle.shiftCount,
      cycle.steps.length,
      cycle.patternCode,
      cycle.patternString ?? null,
      cycle.patternStartDate ?? null,
      cycle.holidayTimeMode ?? null,
      cycle.weekdayPublicHolidayAsHoliday === undefined
        ? null
        : cycle.weekdayPublicHolidayAsHoliday
          ? 1
          : 0,
      createdAt
    );

    cycle.steps.forEach((step) => {
      insertStep.run(
        randomUUID(),
        cycleId,
        step.stepIndex,
        step.dutyCode,
        step.startTime ?? null,
        step.endTime ?? null,
        step.breakMinutes,
        step.holidayStartTime ?? null,
        step.holidayEndTime ?? null,
        step.holidayBreakMinutes ?? null,
        createdAt
      );
    });

    cycle.teamIndexes.forEach((item) => {
      insertTeamIndex.run(randomUUID(), cycleId, item.teamLabel, item.index, createdAt);
    });
  });
};

const insertPatternTeamCycles = (
  patternId: string,
  assignments: ShiftPatternTeamCycleAssignment[],
  createdAt: string
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const insertAssignment = database.prepare(`
    INSERT INTO shift_pattern_team_cycles (
      id,
      pattern_id,
      team_label,
      cycle_key,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `);

  assignments.forEach((item) => {
    insertAssignment.run(randomUUID(), patternId, item.teamLabel, item.cycleKey, createdAt);
  });
};

const insertPatternTeamCapacities = (
  patternId: string,
  teamCapacities: ShiftPatternTeamCapacity[],
  createdAt: string
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const insertCapacity = database.prepare(`
    INSERT INTO shift_pattern_team_capacities (
      id,
      pattern_id,
      team_label,
      max_headcount,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `);

  teamCapacities
    .filter((item) => typeof item.maxHeadcount === "number" && item.maxHeadcount > 0)
    .forEach((item) => {
      insertCapacity.run(randomUUID(), patternId, item.teamLabel, item.maxHeadcount!, createdAt);
    });
};

const insertPatternTeamSettings = (
  patternId: string,
  teamSettings: ShiftPatternTeamSetting[],
  createdAt: string
) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const insertTeamSetting = database.prepare(`
    INSERT INTO shift_pattern_team_settings (
      id,
      pattern_id,
      team_label,
      display_name,
      work_type,
      is_active,
      sort_order,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  teamSettings.forEach((item) => {
    insertTeamSetting.run(
      randomUUID(),
      patternId,
      item.teamLabel,
      item.displayName ?? null,
      item.workType,
      item.isActive ? 1 : 0,
      item.sortOrder,
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

const defaultPatterns: SeedPatternDefinition[] = [
  {
    siteName: "보라매DC",
    input: {
      siteId: "",
      name: "보라매 4조 2교대",
      teamCount: 4,
      patternCode: "DDNNXX",
      startIndexRule: "team-sequence",
      patternStartDate: "2024-09-01",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 2, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
        { stepIndex: 3, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
        { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: createSequentialTeamIndexes(4),
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 2,
          patternCode: "DDNNXX",
          patternStartDate: "2024-09-01",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
            { stepIndex: 1, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
            { stepIndex: 2, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
            { stepIndex: 3, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
            { stepIndex: 4, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 5, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: createSequentialTeamIndexes(4)
        }
      ],
      teamCycleAssignments: getTeamLabels(4).map((teamLabel) => ({
        teamLabel,
        cycleKey: "cycle-1"
      })),
      poolEnabled: false,
      poolBreakMinutes: 0
    }
  },
  {
    siteName: "동탄센터",
    input: {
      siteId: "",
      name: "동탄 주간 순환",
      teamCount: 3,
      patternCode: "DDDXX",
      startIndexRule: "calendar-start",
      patternStartDate: "2024-10-01",
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
        { stepIndex: 2, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
        { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
        { stepIndex: 4, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: createSequentialTeamIndexes(3),
      cycles: [
        {
          cycleKey: "cycle-1",
          name: "Cycle 1",
          order: 0,
          shiftCount: 1,
          patternCode: "DDDXX",
          patternStartDate: "2024-10-01",
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
            { stepIndex: 1, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
            { stepIndex: 2, dutyCode: "D", startTime: "08:00", endTime: "17:00", breakMinutes: 60 },
            { stepIndex: 3, dutyCode: "X", breakMinutes: 0 },
            { stepIndex: 4, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: createSequentialTeamIndexes(3)
        }
      ],
      teamCycleAssignments: getTeamLabels(3).map((teamLabel) => ({
        teamLabel,
        cycleKey: "cycle-1"
      })),
      poolEnabled: false,
      poolBreakMinutes: 0
    }
  }
];

const writeShiftPattern = (
  input: ShiftPatternUpsertInput,
  options?: { id?: string; createdAt?: string }
) => {
  const database = requireReadyDatabase();
  // 조별 설정을 먼저 정규화해야 A조..N조 외의 조(Pool 등)도 Cycle 배정·시작 인덱스를 가질 수 있다.
  const teamSettings = normalizeTeamSettings(
    input.teamCount,
    Boolean(input.poolEnabled),
    input.teamSettings
  );
  const baseTeamLabels = getTeamLabels(input.teamCount);
  const extraTeamLabels = teamSettings
    .map((setting) => setting.teamLabel)
    .filter((teamLabel) => !baseTeamLabels.includes(teamLabel));
  const cycles = normalizeCycles(input, extraTeamLabels);
  const primaryCycle = cycles[0]!;
  const assignments = normalizeTeamCycleAssignments(
    teamSettings,
    cycles,
    input.teamCycleAssignments
  );
  const teamCapacities = normalizeTeamCapacities(
    input.teamCount,
    input.teamCapacities,
    extraTeamLabels
  );
  const id = options?.id ?? randomUUID();
  const createdAt = options?.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();

  database.prepare(`
    INSERT INTO shift_patterns (
      id,
      site_id,
      name,
      team_count,
      cycle_length,
      pattern_code,
      start_index_rule,
      pattern_start_date,
      effective_from,
      pool_enabled,
      pool_start_time,
      pool_end_time,
      pool_break_minutes,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      site_id = excluded.site_id,
      name = excluded.name,
      team_count = excluded.team_count,
      cycle_length = excluded.cycle_length,
      pattern_code = excluded.pattern_code,
      start_index_rule = excluded.start_index_rule,
      pattern_start_date = excluded.pattern_start_date,
      effective_from = excluded.effective_from,
      pool_enabled = excluded.pool_enabled,
      pool_start_time = excluded.pool_start_time,
      pool_end_time = excluded.pool_end_time,
      pool_break_minutes = excluded.pool_break_minutes,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    id,
    input.siteId,
    input.name,
    input.teamCount,
    primaryCycle.steps.length,
    primaryCycle.patternCode,
    input.startIndexRule,
    primaryCycle.patternStartDate ?? null,
    input.effectiveFrom?.trim() || primaryCycle.patternStartDate || null,
    input.poolEnabled ? 1 : 0,
    input.poolStartTime ?? null,
    input.poolEndTime ?? null,
    input.poolBreakMinutes ?? 0,
    input.status,
    createdAt,
    updatedAt
  );

  database.prepare(`
    DELETE FROM shift_pattern_steps
    WHERE pattern_id = ?
  `).run(id);
  database.prepare(`
    DELETE FROM shift_pattern_team_indexes
    WHERE pattern_id = ?
  `).run(id);
  database.prepare(`
    DELETE FROM shift_pattern_team_cycles
    WHERE pattern_id = ?
  `).run(id);
  database.prepare(`
    DELETE FROM shift_pattern_team_capacities
    WHERE pattern_id = ?
  `).run(id);
  database.prepare(`
    DELETE FROM shift_pattern_team_settings
    WHERE pattern_id = ?
  `).run(id);
  database.prepare(`
    DELETE FROM shift_pattern_cycle_steps
    WHERE cycle_id IN (
      SELECT id
      FROM shift_pattern_cycles
      WHERE pattern_id = ?
    )
  `).run(id);
  database.prepare(`
    DELETE FROM shift_pattern_cycle_team_indexes
    WHERE cycle_id IN (
      SELECT id
      FROM shift_pattern_cycles
      WHERE pattern_id = ?
    )
  `).run(id);
  database.prepare(`
    DELETE FROM shift_pattern_cycles
    WHERE pattern_id = ?
  `).run(id);

  insertPatternSteps(id, primaryCycle.steps, updatedAt);
  insertPatternTeamIndexes(id, primaryCycle.teamIndexes, updatedAt);
  insertPatternCycles(id, cycles, updatedAt);
  insertPatternTeamCycles(id, assignments, updatedAt);
  insertPatternTeamCapacities(id, teamCapacities, updatedAt);
  insertPatternTeamSettings(id, teamSettings, updatedAt);

  return id;
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

  const sites = listStoredSites({ includeDeleted: true });
  const siteMap = new Map<string, SiteRecord>(sites.map((site) => [site.name, site]));

  defaultPatterns.forEach((pattern) => {
    const targetSite = siteMap.get(pattern.siteName);

    if (!targetSite) {
      return;
    }

    writeShiftPattern({
      ...pattern.input,
      siteId: targetSite.id
    });
  });
};

export const listStoredShiftPatterns = (siteId?: string): ShiftPatternRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureShiftPatternSeed();

  const patternRows = database.prepare(`
    SELECT shift_patterns.*
    FROM shift_patterns
    ${siteId ? "WHERE shift_patterns.site_id = ?" : ""}
    ORDER BY shift_patterns.name ASC
  `).all(...(siteId ? [siteId] : [])) as unknown as ShiftPatternRow[];
  const legacyStepRows = database.prepare(`
    SELECT *
    FROM shift_pattern_steps
    ORDER BY pattern_id ASC, step_index ASC
  `).all() as unknown as ShiftPatternStepRow[];
  const legacyTeamIndexRows = database.prepare(`
    SELECT *
    FROM shift_pattern_team_indexes
    ORDER BY pattern_id ASC, team_label ASC
  `).all() as unknown as ShiftPatternTeamIndexRow[];
  const cycleRows = database.prepare(`
    SELECT *
    FROM shift_pattern_cycles
    ORDER BY pattern_id ASC, cycle_order ASC
  `).all() as unknown as ShiftPatternCycleRow[];
  const cycleStepRows = database.prepare(`
    SELECT *
    FROM shift_pattern_cycle_steps
    ORDER BY cycle_id ASC, step_index ASC
  `).all() as unknown as ShiftPatternCycleStepRow[];
  const cycleTeamIndexRows = database.prepare(`
    SELECT *
    FROM shift_pattern_cycle_team_indexes
    ORDER BY cycle_id ASC, team_label ASC
  `).all() as unknown as ShiftPatternCycleTeamIndexRow[];
  const teamCycleRows = database.prepare(`
    SELECT *
    FROM shift_pattern_team_cycles
    ORDER BY pattern_id ASC, team_label ASC
  `).all() as unknown as ShiftPatternTeamCycleRow[];
  const teamCapacityRows = database.prepare(`
    SELECT *
    FROM shift_pattern_team_capacities
    ORDER BY pattern_id ASC, team_label ASC
  `).all() as unknown as ShiftPatternTeamCapacityRow[];
  const teamSettingRows = database.prepare(`
    SELECT *
    FROM shift_pattern_team_settings
    ORDER BY pattern_id ASC, sort_order ASC, team_label ASC
  `).all() as unknown as ShiftPatternTeamSettingRow[];

  const legacyStepsByPatternId = new Map<string, ShiftPatternStepRow[]>();
  const legacyTeamIndexesByPatternId = new Map<string, ShiftPatternTeamIndexRow[]>();
  const cyclesByPatternId = new Map<string, ShiftPatternCycleRow[]>();
  const cycleStepsByCycleId = new Map<string, ShiftPatternCycleStepRow[]>();
  const cycleTeamIndexesByCycleId = new Map<string, ShiftPatternCycleTeamIndexRow[]>();
  const teamCyclesByPatternId = new Map<string, ShiftPatternTeamCycleRow[]>();
  const teamCapacitiesByPatternId = new Map<string, ShiftPatternTeamCapacityRow[]>();
  const teamSettingsByPatternId = new Map<string, ShiftPatternTeamSettingRow[]>();

  legacyStepRows.forEach((step) => {
    const current = legacyStepsByPatternId.get(step.pattern_id) ?? [];
    current.push(step);
    legacyStepsByPatternId.set(step.pattern_id, current);
  });

  legacyTeamIndexRows.forEach((item) => {
    const current = legacyTeamIndexesByPatternId.get(item.pattern_id) ?? [];
    current.push(item);
    legacyTeamIndexesByPatternId.set(item.pattern_id, current);
  });

  cycleRows.forEach((item) => {
    const current = cyclesByPatternId.get(item.pattern_id) ?? [];
    current.push(item);
    cyclesByPatternId.set(item.pattern_id, current);
  });

  cycleStepRows.forEach((item) => {
    const current = cycleStepsByCycleId.get(item.cycle_id) ?? [];
    current.push(item);
    cycleStepsByCycleId.set(item.cycle_id, current);
  });

  cycleTeamIndexRows.forEach((item) => {
    const current = cycleTeamIndexesByCycleId.get(item.cycle_id) ?? [];
    current.push(item);
    cycleTeamIndexesByCycleId.set(item.cycle_id, current);
  });

  teamCycleRows.forEach((item) => {
    const current = teamCyclesByPatternId.get(item.pattern_id) ?? [];
    current.push(item);
    teamCyclesByPatternId.set(item.pattern_id, current);
  });

  teamCapacityRows.forEach((item) => {
    const current = teamCapacitiesByPatternId.get(item.pattern_id) ?? [];
    current.push(item);
    teamCapacitiesByPatternId.set(item.pattern_id, current);
  });

  teamSettingRows.forEach((item) => {
    const current = teamSettingsByPatternId.get(item.pattern_id) ?? [];
    current.push(item);
    teamSettingsByPatternId.set(item.pattern_id, current);
  });

  return patternRows.map((row) =>
    toShiftPatternRecord(
      row,
      legacyStepsByPatternId.get(row.id) ?? [],
      legacyTeamIndexesByPatternId.get(row.id) ?? [],
      cyclesByPatternId.get(row.id) ?? [],
      cycleStepsByCycleId,
      cycleTeamIndexesByCycleId,
      teamCyclesByPatternId.get(row.id) ?? [],
      teamCapacitiesByPatternId.get(row.id) ?? [],
      teamSettingsByPatternId.get(row.id) ?? []
    )
  );
};

// 근무지 설정 저장. 적용 시작일이 그대로면 그 설정을 고치고, 날짜가 바뀌면
// 예전 설정은 그대로 둔 채 그 날짜부터 적용되는 새 버전을 하나 더 만든다.
// 과거 날짜의 근무 계산은 예전 버전으로 남는다(forward-only).
export const saveStoredShiftPattern = (input: ShiftPatternUpsertInput): ShiftPatternRecord => {
  requireReadyDatabase();
  ensureShiftPatternSeed();

  const database = getSqliteDatabase()!;
  const existing = input.id
    ? (database.prepare(`
        SELECT id, created_at, effective_from, pattern_start_date
        FROM shift_patterns
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as
        | {
            id: string;
            created_at: string;
            effective_from?: string | null;
            pattern_start_date?: string | null;
          }
        | undefined)
    : undefined;

  const requestedEffectiveFrom = input.effectiveFrom?.trim();
  const existingEffectiveFrom = existing
    ? existing.effective_from ?? existing.pattern_start_date ?? undefined
    : undefined;
  const startsNewVersion = Boolean(
    existing && requestedEffectiveFrom && requestedEffectiveFrom !== existingEffectiveFrom
  );

  if (startsNewVersion && requestedEffectiveFrom) {
    const conflicting = database.prepare(`
      SELECT id
      FROM shift_patterns
      WHERE site_id = ?
        AND status = 'active'
        AND id <> ?
        AND COALESCE(effective_from, pattern_start_date) = ?
      LIMIT 1
    `).get(input.siteId, existing!.id, requestedEffectiveFrom) as { id: string } | undefined;

    if (conflicting) {
      throw new Error(
        `${requestedEffectiveFrom}부터 적용되는 설정이 이미 있습니다. 다른 날짜를 고르거나 그 설정을 수정하세요.`
      );
    }
  }

  const patternId = writeShiftPattern(input, {
    id: startsNewVersion ? undefined : existing?.id,
    createdAt: startsNewVersion ? undefined : existing?.created_at
  });

  return listStoredShiftPatterns(input.siteId).find((pattern) => pattern.id === patternId) as ShiftPatternRecord;
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
    database.exec("DELETE FROM shift_pattern_team_settings;");
    database.exec("DELETE FROM shift_pattern_team_capacities;");
    database.exec("DELETE FROM shift_pattern_team_cycles;");
    database.exec("DELETE FROM shift_pattern_cycle_team_indexes;");
    database.exec("DELETE FROM shift_pattern_cycle_steps;");
    database.exec("DELETE FROM shift_pattern_cycles;");
    database.exec("DELETE FROM shift_pattern_team_indexes;");
    database.exec("DELETE FROM shift_pattern_steps;");
    database.exec("DELETE FROM shift_patterns;");
  }
};
