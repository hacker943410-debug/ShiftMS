import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  EmployeeListQuery,
  EmployeeRehireInput,
  EmployeeRetirementCorrectionInput,
  EmployeeUpsertInput
} from "../../shared/bridge/contracts";
import {
  formatEmployeeDisplayName,
  isBpEmploymentType,
  normalizeEmploymentTypeLabel
} from "../../shared/domain/employment-type";
import { normalizeEmployeeRank } from "../../shared/domain/employee-rank";
import { createTodayDateInputValue } from "../../shared/lib/local-date";
import type {
  EmployeeEmploymentPeriod,
  EmployeeRecord,
  EmployeeScheduleRecord,
  SiteRecord
} from "../../shared/domain/model";
import { normalizeTeamLabel } from "../../shared/domain/team-label";
import {
  EARLIEST_HIRE_DATE,
  isCalendarDateValue,
  validateEmployeeDates
} from "../../shared/domain/employee-dates";
import {
  markEmployeeMasterReparseRequired,
  markWageRateReparseRequired
} from "./app-settings-storage-service";
import { saveStoredEmployeeWageRate } from "./employee-history-service";
import { listStoredSites } from "./site-storage-service";
import {
  getSqliteDatabase,
  isSqliteStorageReady,
  runInSqliteTransaction
} from "./sqlite-storage-service";

interface StoredEmployeeListQuery extends EmployeeListQuery {
  includeDeleted?: boolean;
  includeHistoricalAssignments?: boolean;
}

interface EmploymentPeriodRow {
  id: string;
  employee_id: string;
  start_date: string;
  end_date?: string | null;
  closure_provenance_complete: number;
  created_at: string;
  updated_at?: string | null;
}

interface RetirementHistoryClosureRow {
  history_kind: "assignment" | "wage";
  history_id: string;
  previous_status?: string | null;
  previous_end_date?: string | null;
}

const defaultEmployees: EmployeeUpsertInput[] = [
  {
    employeeCode: "EMP-001",
    name: "김현우",
    rank: "사원",
    employmentType: "정규",
    status: "active",
    hireDate: "2023-03-01",
    shiftGroup: "A조",
    hourlyRate: 12800
  },
  {
    employeeCode: "EMP-014",
    name: "이수민",
    rank: "대리",
    employmentType: "계약",
    status: "leave",
    hireDate: "2024-01-15",
    shiftGroup: "B조",
    hourlyRate: 13200
  },
  {
    employeeCode: "EMP-023",
    name: "박정호",
    rank: "과장",
    employmentType: "정규",
    status: "retired",
    hireDate: "2021-06-10",
    retireDate: "2026-02-28",
    shiftGroup: "야간조",
    hourlyRate: 14100
  }
];

const defaultSiteNamesByEmployeeCode: Record<string, string> = {
  "EMP-001": "보라매DC",
  "EMP-014": "동탄센터",
  "EMP-023": "인천허브"
};

const createCurrentDateValue = () => {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
};

const shiftDateValue = (value: string, offsetDays: number) => {
  const [year, month, day] = value.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);

  return `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;
};

const toEmploymentPeriod = (row: EmploymentPeriodRow): EmployeeEmploymentPeriod => ({
  id: row.id,
  startDate: row.start_date,
  endDate: row.end_date ?? undefined,
  closureProvenanceComplete: Boolean(row.closure_provenance_complete)
});

const listEmploymentPeriodsByEmployee = (database: DatabaseSync) => {
  const periodsByEmployee = new Map<string, EmployeeEmploymentPeriod[]>();
  const rows = database.prepare(`
    SELECT *
    FROM employee_employment_periods
    ORDER BY employee_id ASC, start_date ASC, created_at ASC
  `).all() as unknown as EmploymentPeriodRow[];

  rows.forEach((row) => {
    periodsByEmployee.set(row.employee_id, [
      ...(periodsByEmployee.get(row.employee_id) ?? []),
      toEmploymentPeriod(row)
    ]);
  });

  return periodsByEmployee;
};

const getLatestEmploymentPeriodRow = (
  database: DatabaseSync,
  employeeId: string
): EmploymentPeriodRow | undefined =>
  database.prepare(`
    SELECT *
    FROM employee_employment_periods
    WHERE employee_id = ?
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1
  `).get(employeeId) as unknown as EmploymentPeriodRow | undefined;

const recordEmploymentPeriodEvent = (
  database: DatabaseSync,
  input: {
    employeeId: string;
    employmentPeriodId: string;
    eventType: "retired" | "rehired" | "retirement-corrected";
    eventDate: string;
    previousEventDate?: string;
    reason?: string;
    createdAt: string;
  }
) => {
  database.prepare(`
    INSERT INTO employee_employment_period_events (
      id,
      employee_id,
      employment_period_id,
      event_type,
      event_date,
      previous_event_date,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.employeeId,
    input.employmentPeriodId,
    input.eventType,
    input.eventDate,
    input.previousEventDate ?? null,
    input.reason ?? null,
    input.createdAt
  );
};

const closeEmployeeHistoryAtRetirement = (
  database: DatabaseSync,
  employeeId: string,
  retireDate: string,
  employmentPeriodId?: string
) => {
  const assignmentRows = database.prepare(`
    SELECT id, status, end_date
    FROM employee_site_assignments
    WHERE employee_id = ?
      AND (? IS NULL OR employment_period_id = ? OR employment_period_id IS NULL)
      AND (
        status <> 'ended'
        OR end_date IS NULL
        OR (start_date < ? AND end_date > ?)
        OR (start_date >= ? AND end_date <> start_date)
      )
  `).all(
    employeeId,
    employmentPeriodId ?? null,
    employmentPeriodId ?? null,
    retireDate,
    retireDate,
    retireDate
  ) as Array<{
    id: string;
    status: string;
    end_date?: string | null;
  }>;
  const wageRows = database.prepare(`
    SELECT id, effective_to
    FROM wage_rates
    WHERE employee_id = ?
      AND (? IS NULL OR employment_period_id = ? OR employment_period_id IS NULL)
      AND effective_from < ?
      AND (effective_to IS NULL OR effective_to >= ?)
  `).all(
    employeeId,
    employmentPeriodId ?? null,
    employmentPeriodId ?? null,
    retireDate,
    retireDate
  ) as Array<{
    id: string;
    effective_to?: string | null;
  }>;

  if (employmentPeriodId) {
    const insertClosure = database.prepare(`
      INSERT OR IGNORE INTO employee_retirement_history_closures (
        id,
        employment_period_id,
        history_kind,
        history_id,
        previous_status,
        previous_end_date,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const createdAt = new Date().toISOString();

    assignmentRows.forEach((row) => {
      insertClosure.run(
        randomUUID(),
        employmentPeriodId,
        "assignment",
        row.id,
        row.status,
        row.end_date ?? null,
        createdAt
      );
    });
    wageRows.forEach((row) => {
      insertClosure.run(
        randomUUID(),
        employmentPeriodId,
        "wage",
        row.id,
        null,
        row.effective_to ?? null,
        createdAt
      );
    });
  }

  const assignmentResult = database
    .prepare(
      `
        UPDATE employee_site_assignments
        SET status = 'ended',
            end_date = CASE
              WHEN start_date >= ? THEN start_date
              WHEN end_date IS NULL OR end_date > ? THEN ?
              ELSE end_date
            END,
            employment_period_id = COALESCE(employment_period_id, ?)
        WHERE employee_id = ?
          AND (? IS NULL OR employment_period_id = ? OR employment_period_id IS NULL)
          AND (
            status <> 'ended'
            OR end_date IS NULL
            OR (start_date < ? AND end_date > ?)
            OR (start_date >= ? AND end_date <> start_date)
          )
      `
    )
    .run(
      retireDate,
      retireDate,
      retireDate,
      employmentPeriodId ?? null,
      employeeId,
      employmentPeriodId ?? null,
      employmentPeriodId ?? null,
      retireDate,
      retireDate,
      retireDate
    );
  const wageEffectiveTo = shiftDateValue(retireDate, -1);
  const wageResult = database
    .prepare(
      `
        UPDATE wage_rates
        SET effective_to = ?,
            employment_period_id = COALESCE(employment_period_id, ?)
        WHERE employee_id = ?
          AND (? IS NULL OR employment_period_id = ? OR employment_period_id IS NULL)
          AND effective_from < ?
          AND (effective_to IS NULL OR effective_to >= ?)
      `
    )
    .run(
      wageEffectiveTo,
      employmentPeriodId ?? null,
      employeeId,
      employmentPeriodId ?? null,
      employmentPeriodId ?? null,
      retireDate,
      retireDate
    );

  return {
    assignmentChanges: Number(assignmentResult.changes ?? 0),
    wageChanges: Number(wageResult.changes ?? 0)
  };
};

const getNextAssignmentSortOrder = (
  database: DatabaseSync,
  siteId: string,
  teamLabel?: string
) => {
  if (!teamLabel) {
    return 0;
  }

  const row = database.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort_order
    FROM employee_site_assignments
    WHERE site_id = ?
      AND shift_group = ?
      AND status = 'active'
  `).get(siteId, teamLabel) as { next_sort_order?: number } | undefined;

  return Math.max(Number(row?.next_sort_order ?? 0), 0);
};

const generateInternalBpEmployeeCode = (database: DatabaseSync) => {
  const rows = database.prepare(`
    SELECT employee_code
    FROM employees
    WHERE employee_code LIKE 'BP-%'
  `).all() as Array<{ employee_code?: string }>;
  let maxSequence = 0;

  rows.forEach((row) => {
    const matched = String(row.employee_code ?? "").match(/^BP-(\d+)$/i);

    if (!matched) {
      return;
    }

    maxSequence = Math.max(maxSequence, Number(matched[1]));
  });

  return `BP-${String(maxSequence + 1).padStart(4, "0")}`;
};

const toEmployeeRecord = (
  row: Record<string, unknown>,
  employmentPeriods: EmployeeEmploymentPeriod[] = []
): EmployeeRecord => ({
  id: String(row.id),
  employeeCode: String(row.employee_code),
  name: String(row.name),
  contact: row.contact ? String(row.contact) : undefined,
  rank: normalizeEmployeeRank(row.rank ? String(row.rank) : undefined),
  employmentType: normalizeEmploymentTypeLabel(
    row.employment_type ? String(row.employment_type) : undefined
  ),
  status: row.status as EmployeeRecord["status"],
  hireDate: row.hire_date ? String(row.hire_date) : undefined,
  retireDate: row.retire_date ? String(row.retire_date) : undefined,
  employmentPeriods,
  deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  currentSiteId: row.current_site_id ? String(row.current_site_id) : undefined,
  currentSiteName: row.current_site_name ? String(row.current_site_name) : undefined,
  currentSiteDeletedAt: row.current_site_deleted_at
    ? String(row.current_site_deleted_at)
    : undefined,
  currentShiftGroup: normalizeTeamLabel(
    row.current_shift_group ? String(row.current_shift_group) : undefined
  ),
  currentAssignmentOrder:
    row.current_assignment_order !== null && row.current_assignment_order !== undefined
      ? Number(row.current_assignment_order)
      : undefined,
  currentAssignmentStartDate: row.current_assignment_start_date
    ? String(row.current_assignment_start_date)
    : undefined,
  currentAssignmentEndDate: row.current_assignment_end_date
    ? String(row.current_assignment_end_date)
    : undefined,
  currentHourlyRate:
    row.current_hourly_rate !== null && row.current_hourly_rate !== undefined
      ? Number(row.current_hourly_rate)
      : undefined,
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined
});

const ensureEmployeeSeed = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return;
  }

  const row = database.prepare("SELECT COUNT(*) as count FROM employees").get() as {
    count: number;
  };

  if (row.count > 0) {
    return;
  }

  const sites = listStoredSites({ includeDeleted: true });
  const siteMap = new Map<string, SiteRecord>(sites.map((site) => [site.name, site]));
  const now = new Date().toISOString();
  const insertEmployee = database.prepare(`
    INSERT INTO employees (
      id,
      employee_code,
      name,
      contact,
      rank,
      employment_type,
      status,
      hire_date,
      retire_date,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAssignment = database.prepare(`
      INSERT INTO employee_site_assignments (
        id,
        employee_id,
        employment_period_id,
        site_id,
        team_name,
        shift_group,
        sort_order,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  const insertWageRate = database.prepare(`
    INSERT INTO wage_rates (
      id,
      employee_id,
      employment_period_id,
      hourly_rate,
      effective_from,
      effective_to,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEmploymentPeriod = database.prepare(`
    INSERT INTO employee_employment_periods (
      id,
      employee_id,
      start_date,
      end_date,
      closure_provenance_complete,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  defaultEmployees.forEach((employee) => {
    const employeeId = randomUUID();
    const employmentPeriodId = randomUUID();
    insertEmployee.run(
      employeeId,
      employee.employeeCode,
      employee.name,
      null,
      normalizeEmployeeRank(employee.rank) ?? null,
      employee.employmentType,
      employee.status,
      employee.hireDate ?? null,
      employee.retireDate ?? null,
      now,
      now
    );
    insertEmploymentPeriod.run(
      employmentPeriodId,
      employeeId,
      employee.hireDate,
      employee.retireDate ?? null,
      employee.status === "retired" ? 0 : 1,
      now,
      now
    );

    const targetSite = siteMap.get(defaultSiteNamesByEmployeeCode[employee.employeeCode] ?? "");

    if (targetSite) {
      insertAssignment.run(
        randomUUID(),
        employeeId,
        employmentPeriodId,
        targetSite.id,
        null,
        employee.shiftGroup ?? null,
        getNextAssignmentSortOrder(database, targetSite.id, normalizeTeamLabel(employee.shiftGroup)),
        employee.hireDate ?? "2026-01-01",
        employee.retireDate ?? null,
        employee.status === "retired" ? "ended" : "active",
        now
      );
    }

    if (employee.hourlyRate) {
      insertWageRate.run(
        randomUUID(),
        employeeId,
        employmentPeriodId,
        employee.hourlyRate,
        employee.hireDate ?? "2026-01-01",
        employee.retireDate ?? null,
        "초기 시드",
        now
      );
    }
  });
};

export const listStoredEmployees = (query?: StoredEmployeeListQuery): EmployeeRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureEmployeeSeed();

  const includeHistoricalAssignments = Boolean(query?.includeHistoricalAssignments);
  const assignmentStatusFilter = includeHistoricalAssignments
    ? ""
    : "AND latest_assignments.status = 'active'";
  // "Current wage" has to be the row in force today. Taking whichever row simply has no end date
  // surfaced a not-yet-started future wage as the current one, so the screen and the payroll
  // calculation disagreed.
  const today = createTodayDateInputValue();

  const rows = database.prepare(`
    SELECT
      employees.*,
      sites.id as current_site_id,
      sites.name as current_site_name,
      sites.deleted_at as current_site_deleted_at,
      assignments.shift_group as current_shift_group,
      assignments.sort_order as current_assignment_order,
      assignments.start_date as current_assignment_start_date,
      assignments.end_date as current_assignment_end_date,
      wage_rates.hourly_rate as current_hourly_rate
    FROM employees
    LEFT JOIN employee_site_assignments as assignments
      ON assignments.id = (
        SELECT latest_assignments.id
        FROM employee_site_assignments as latest_assignments
        WHERE latest_assignments.employee_id = employees.id
          ${assignmentStatusFilter}
        ORDER BY
          CASE latest_assignments.status WHEN 'active' THEN 0 ELSE 1 END ASC,
          latest_assignments.start_date DESC,
          latest_assignments.sort_order ASC,
          latest_assignments.created_at DESC
        LIMIT 1
      )
    LEFT JOIN sites
      ON sites.id = assignments.site_id
    LEFT JOIN wage_rates
      ON wage_rates.id = (
        SELECT latest_wage_rates.id
        FROM wage_rates as latest_wage_rates
        WHERE latest_wage_rates.employee_id = employees.id
          AND latest_wage_rates.effective_from <= ?
          AND (
            latest_wage_rates.effective_to IS NULL
            OR latest_wage_rates.effective_to >= ?
          )
          AND (
            latest_wage_rates.employment_period_id = (
              SELECT current_periods.id
              FROM employee_employment_periods as current_periods
              WHERE current_periods.employee_id = employees.id
                AND current_periods.start_date <= ?
                AND (current_periods.end_date IS NULL OR current_periods.end_date > ?)
              ORDER BY current_periods.start_date DESC, current_periods.created_at DESC
              LIMIT 1
            )
            OR (
              latest_wage_rates.employment_period_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM employee_employment_periods WHERE employee_id = employees.id
              )
            )
          )
        ORDER BY latest_wage_rates.effective_from DESC, latest_wage_rates.created_at DESC, latest_wage_rates.id DESC
        LIMIT 1
      )
    ORDER BY employees.name ASC
  `).all(today, today, today, today) as Array<Record<string, unknown>>;

  const normalizedKeyword = query?.keyword?.trim().toLowerCase() ?? "";
  const periodsByEmployee = listEmploymentPeriodsByEmployee(database);

  return rows
    .map((row) => toEmployeeRecord(row, periodsByEmployee.get(String(row.id)) ?? []))
    .filter((employee) => query?.includeDeleted || !employee.deletedAt)
    .filter((employee) => !query?.status || employee.status === query.status)
    .filter((employee) => !query?.siteId || employee.currentSiteId === query.siteId)
    .filter((employee) => {
      if (normalizedKeyword.length === 0) {
        return true;
      }

      const displayName = formatEmployeeDisplayName(employee).toLowerCase();

      return (
        employee.name.toLowerCase().includes(normalizedKeyword) ||
        displayName.includes(normalizedKeyword) ||
        employee.employeeCode.toLowerCase().includes(normalizedKeyword) ||
        (employee.contact?.toLowerCase().includes(normalizedKeyword) ?? false) ||
        (employee.rank?.toLowerCase().includes(normalizedKeyword) ?? false)
      );
    });
};

const resolveMonthBoundaryDates = (scheduleMonth: string) => {
  const matched = scheduleMonth.match(/^(\d{4})-(\d{2})$/);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const monthEnd = new Date(Date.UTC(year, month, 0));

  return {
    startDate: `${scheduleMonth}-01`,
    endDate: `${monthEnd.getUTCFullYear()}-${String(monthEnd.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(monthEnd.getUTCDate()).padStart(2, "0")}`
  };
};

export const listStoredEmployeesForSiteMonth = (
  siteId: string,
  scheduleMonth: string
): EmployeeScheduleRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureEmployeeSeed();

  const monthBoundary = resolveMonthBoundaryDates(scheduleMonth);

  if (!monthBoundary) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      employees.*,
      sites.id as current_site_id,
      sites.name as current_site_name,
      sites.deleted_at as current_site_deleted_at,
      assignments.shift_group as current_shift_group,
      assignments.sort_order as current_assignment_order,
      assignments.start_date as current_assignment_start_date,
      assignments.end_date as current_assignment_end_date,
      wage_rates.hourly_rate as current_hourly_rate
    FROM employees
    INNER JOIN employee_site_assignments as assignments
      ON assignments.employee_id = employees.id
      AND assignments.site_id = ?
      AND assignments.start_date <= ?
      AND (
        assignments.end_date IS NULL
        OR assignments.end_date > ?
      )
      AND (
        assignments.end_date IS NULL
        OR assignments.end_date > assignments.start_date
      )
    LEFT JOIN sites
      ON sites.id = assignments.site_id
    LEFT JOIN wage_rates
      ON wage_rates.id = (
        SELECT matched_wage_rates.id
        FROM wage_rates as matched_wage_rates
        WHERE matched_wage_rates.employee_id = employees.id
          AND matched_wage_rates.effective_from <= ?
          AND (
            matched_wage_rates.effective_to IS NULL
            OR matched_wage_rates.effective_to >= ?
          )
          AND (
            matched_wage_rates.employment_period_id = (
              SELECT current_periods.id
              FROM employee_employment_periods as current_periods
              WHERE current_periods.employee_id = employees.id
                AND current_periods.start_date <= ?
                AND (current_periods.end_date IS NULL OR current_periods.end_date > ?)
              ORDER BY current_periods.start_date DESC, current_periods.created_at DESC
              LIMIT 1
            )
            OR (
              matched_wage_rates.employment_period_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM employee_employment_periods WHERE employee_id = employees.id
              )
            )
          )
        ORDER BY matched_wage_rates.effective_from DESC, matched_wage_rates.created_at DESC, matched_wage_rates.id DESC
        LIMIT 1
      )
    ORDER BY employees.name ASC, assignments.start_date ASC, assignments.created_at ASC
  `).all(
    siteId,
    monthBoundary.endDate,
    monthBoundary.startDate,
    monthBoundary.endDate,
    monthBoundary.startDate,
    monthBoundary.endDate,
    monthBoundary.endDate
  ) as Array<Record<string, unknown>>;

  const periodsByEmployee = listEmploymentPeriodsByEmployee(database);

  return rows.map((row) => {
    const employee = toEmployeeRecord(row, periodsByEmployee.get(String(row.id)) ?? []);

    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      employmentType: employee.employmentType,
      status: employee.status,
      hireDate: employee.hireDate,
      retireDate: employee.retireDate,
      employmentPeriods: employee.employmentPeriods,
      currentSiteId: employee.currentSiteId,
      currentSiteName: employee.currentSiteName,
      currentShiftGroup: employee.currentShiftGroup,
      currentAssignmentOrder: employee.currentAssignmentOrder,
      currentAssignmentStartDate: employee.currentAssignmentStartDate,
      currentAssignmentEndDate: employee.currentAssignmentEndDate
    } satisfies EmployeeScheduleRecord;
  });
};

export const saveStoredEmployee = (input: EmployeeUpsertInput): EmployeeRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureEmployeeSeed();

  const existing = input.id
    ? (database.prepare(`
        SELECT *
        FROM employees
        WHERE id = ?
        LIMIT 1
      `).get(input.id) as Record<string, unknown> | undefined)
    : undefined;

  const id = existing ? String(existing.id) : randomUUID();
  const createdAt = existing ? String(existing.created_at) : new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const normalizedEmploymentType = normalizeEmploymentTypeLabel(input.employmentType);
  const normalizedRank = normalizeEmployeeRank(input.rank) ?? null;
  // The rank the parser currently sees for this person. toEmployeeRecord hands the parser the
  // normalized rank, so the stored value has to be normalized too before the two are compared.
  const existingParserRank = normalizeEmployeeRank(existing?.rank ? String(existing.rank) : undefined);
  const isBpEmployee = isBpEmploymentType(normalizedEmploymentType);
  const existingEmployeeCode = existing ? String(existing.employee_code) : "";
  let normalizedEmployeeCode = input.employeeCode.trim();
  const normalizedContact = input.contact?.trim() || null;
  const normalizedShiftGroup = normalizeTeamLabel(input.shiftGroup);

  if (existing && (input.siteId || normalizedShiftGroup)) {
    throw new Error("기존 인력의 근무지 배정은 전용 배정 기능에서 변경해야 합니다.");
  }

  const shouldCreateInitialAssignment = !existing && Boolean(input.siteId && normalizedShiftGroup);
  const assignmentSiteId = shouldCreateInitialAssignment ? input.siteId ?? null : null;

  // The hire date gates schedules and performance credit, so a typo here silently drops a person
  // from both. The screen bounds the calendar; this is the same rule, enforced where the row is
  // written, for callers that never saw the calendar. The dates are normalized once and that value
  // is what gets checked AND stored: checking a blank as "absent" while storing it as "" let a
  // person in with no hire date at all (R10 #1).
  const hireDate = String(input.hireDate ?? "").trim() || undefined;
  const retireDate = String(input.retireDate ?? "").trim() || undefined;

  const existingHireDate = existing?.hire_date ? String(existing.hire_date) : undefined;
  const isLegacyBlankHireDate = Boolean(existing && !existingHireDate && !hireDate);

  if (!hireDate && !isLegacyBlankHireDate) {
    throw new Error("입사일을 입력해야 합니다.");
  }

  if (input.status === "retired" && !retireDate) {
    throw new Error("퇴사 처리일을 입력해야 합니다.");
  }

  if (input.status !== "retired" && retireDate) {
    throw new Error("퇴사 처리일은 퇴사 상태에서만 입력할 수 있습니다.");
  }

  const dateError = validateEmployeeDates({
    hireDate,
    retireDate,
    today: createTodayDateInputValue()
  });

  if (dateError) {
    throw new Error(dateError);
  }

  const existingStatus = existing ? String(existing.status) : undefined;
  const existingRetireDate = existing?.retire_date ? String(existing.retire_date) : undefined;

  if (input.status === "retired" && existingStatus !== "retired" && !hireDate) {
    throw new Error("입사일을 입력해야 합니다.");
  }

  if (existingStatus === "retired" && input.status !== "retired") {
    throw new Error("퇴사 상태 해제는 재입사 기능에서 처리해야 합니다.");
  }
  if (
    existingStatus === "retired" &&
    input.status === "retired" &&
    existingRetireDate &&
    retireDate !== existingRetireDate
  ) {
    throw new Error("퇴사 처리일 변경은 전용 퇴사 정정 기능에서 처리해야 합니다.");
  }
  if (
    input.status === "retired" &&
    existingStatus !== undefined &&
    existingStatus !== "retired" &&
    typeof input.hourlyRate === "number"
  ) {
    throw new Error("퇴사 처리와 시급 변경은 한 번에 저장할 수 없습니다. 시급을 먼저 저장하세요.");
  }

  if (normalizedEmployeeCode.length === 0) {
    if (!isBpEmployee) {
      throw new Error("Employee code is required.");
    }

    normalizedEmployeeCode = existingEmployeeCode || generateInternalBpEmployeeCode(database);
  }

  const duplicateEmployee = database.prepare(`
    SELECT id
    FROM employees
    WHERE employee_code = ?
      AND id <> ?
    LIMIT 1
  `).get(normalizedEmployeeCode, id) as { id: string } | undefined;

  if (duplicateEmployee) {
    throw new Error("이미 사용 중인 사원번호입니다.");
  }

  const employmentPeriodRows = existing
    ? (database.prepare(`
        SELECT *
        FROM employee_employment_periods
        WHERE employee_id = ?
        ORDER BY start_date DESC, created_at DESC
        LIMIT 2
      `).all(id) as unknown as EmploymentPeriodRow[])
    : [];
  const latestEmploymentPeriod = employmentPeriodRows[0];
  const previousEmploymentPeriod = employmentPeriodRows[1];

  if (
    hireDate &&
    previousEmploymentPeriod?.end_date &&
    hireDate < String(previousEmploymentPeriod.end_date)
  ) {
    throw new Error(
      `최근 입사일은 직전 고용기간의 퇴사 처리일(${previousEmploymentPeriod.end_date})보다 빠를 수 없습니다.`
    );
  }
  if (
    existingStatus !== "retired" &&
    latestEmploymentPeriod?.end_date
  ) {
    throw new Error("현재 재직 상태와 고용기간 이력이 일치하지 않습니다. 고용기간을 먼저 확인하세요.");
  }

  const employmentPeriodId = latestEmploymentPeriod?.id ?? randomUUID();

  // One operator action, one transaction: the person, the optional first assignment and the
  // optional first wage line land together or not at all. Without this a failure on the last
  // write left the person half-registered, and the retry was refused for a duplicate code.
  database.exec("BEGIN");

  try {
    let retirementHistoryChanges = { assignmentChanges: 0, wageChanges: 0 };

    database.prepare(`
      INSERT INTO employees (
        id,
        employee_code,
        name,
        contact,
        rank,
        employment_type,
        status,
        hire_date,
        retire_date,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        employee_code = excluded.employee_code,
        name = excluded.name,
        contact = excluded.contact,
        rank = excluded.rank,
        employment_type = excluded.employment_type,
        status = excluded.status,
        hire_date = excluded.hire_date,
        retire_date = excluded.retire_date,
        updated_at = excluded.updated_at
    `).run(
      id,
      normalizedEmployeeCode,
      input.name,
      normalizedContact,
      normalizedRank,
      normalizedEmploymentType,
      input.status,
      hireDate ?? null,
      retireDate ?? null,
      createdAt,
      updatedAt
    );

    if (hireDate) {
      if (latestEmploymentPeriod) {
        database.prepare(`
          UPDATE employee_employment_periods
          SET start_date = ?,
              end_date = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          hireDate,
          input.status === "retired" ? retireDate ?? null : null,
          updatedAt,
          employmentPeriodId
        );
      } else {
        database.prepare(`
          INSERT INTO employee_employment_periods (
            id,
            employee_id,
            start_date,
            end_date,
            closure_provenance_complete,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?)
        `).run(
          employmentPeriodId,
          id,
          hireDate,
          input.status === "retired" ? retireDate ?? null : null,
          createdAt,
          updatedAt
        );
      }
    }

    if (assignmentSiteId) {
      if (!hireDate) {
        throw new Error("입사일을 입력해야 합니다.");
      }
      database.prepare(`
        UPDATE employee_site_assignments
        SET status = 'ended',
            end_date = COALESCE(end_date, ?)
        WHERE employee_id = ?
          AND status = 'active'
      `).run(updatedAt.slice(0, 10), id);

      database.prepare(`
        INSERT INTO employee_site_assignments (
          id,
          employee_id,
          employment_period_id,
          site_id,
          team_name,
          shift_group,
          sort_order,
          start_date,
          end_date,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        id,
        employmentPeriodId,
        assignmentSiteId,
        null,
        normalizedShiftGroup ?? null,
        getNextAssignmentSortOrder(database, assignmentSiteId, normalizedShiftGroup),
        hireDate,
        null,
        "active",
        updatedAt
      );
    }

    if (typeof input.hourlyRate === "number") {
      if (!hireDate) {
        throw new Error("입사일을 입력해야 합니다.");
      }
      // The same rule as the wage screen, through the same function: the line starts on the hire
      // date and any line crossing that date is cut the day before. This path used to close open
      // lines on today's date and insert from the hire date, which can overlap - and an overlap
      // pays the later-starting line while the screen shows the other.
      saveStoredEmployeeWageRate({
        employeeId: id,
        hourlyRate: input.hourlyRate,
        effectiveFrom: hireDate,
        reason: "직원 등록/수정"
      });
    }

    if (input.status === "retired" && retireDate && existingStatus !== "retired") {
      retirementHistoryChanges = closeEmployeeHistoryAtRetirement(
        database,
        id,
        retireDate,
        employmentPeriodId
      );
      recordEmploymentPeriodEvent(database, {
        employeeId: id,
        employmentPeriodId,
        eventType: "retired",
        eventDate: retireDate,
        createdAt: updatedAt
      });
    }

    // The parser finds a person by code or name, judges them by the dates, and stamps the rank it
    // reads onto the row; rows parsed before this save were judged by the old master. A new person
    // or a changed key field leaves the reparse marker in the SAME transaction, so the person and
    // the marker land together (R10 #2, #5).
    //
    // The rank used to sit on the "no marker" side of this list, read as an employee-screen field.
    // It is not: the parser reads it (schedule-return-performance-parser), it is written onto the
    // pending row, and on approval it is the 직급 the 별첨1 document prints. A rank corrected after
    // a file was parsed has to reach that file's pending rows, so it belongs here. Only a contact
    // or a status alone still leaves no marker - and a wage is not a key field either (T-1: the
    // wage change asks for a manual refresh).
    //
    // Both ranks pass through normalizeEmployeeRank first, because the question is whether the
    // value the PARSER sees changed and the parser only ever sees the normalized rank
    // (toEmployeeRecord). A stored value outside the five known ranks is already invisible to it,
    // so clearing such a value must not force a re-read.
    const changesParserView =
      !existing ||
      String(existing.employee_code) !== normalizedEmployeeCode ||
      String(existing.name) !== input.name ||
      (normalizedRank ?? undefined) !== existingParserRank ||
      String(existing.hire_date ?? "") !== (hireDate ?? "") ||
      String(existing.retire_date ?? "") !== (retireDate ?? "");

    if (changesParserView || retirementHistoryChanges.assignmentChanges > 0) {
      markEmployeeMasterReparseRequired();
    }
    if (retirementHistoryChanges.wageChanges > 0) {
      markWageRateReparseRequired();
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return listStoredEmployees().find((employee) => employee.id === id) as EmployeeRecord;
};

const requireEmploymentActionReason = (reason: string) => {
  const normalizedReason = String(reason ?? "").trim();

  if (!normalizedReason) {
    throw new Error("처리 사유를 입력해야 합니다.");
  }

  return normalizedReason;
};

const requireRehireDate = (rehireDate: string) => {
  if (!isCalendarDateValue(rehireDate)) {
    throw new Error("재입사일 형식이 올바르지 않습니다.");
  }
  if (rehireDate < EARLIEST_HIRE_DATE) {
    throw new Error(`재입사일은 ${EARLIEST_HIRE_DATE} 이후여야 합니다.`);
  }
  if (rehireDate > createTodayDateInputValue()) {
    throw new Error("재입사일은 오늘 이후 날짜로 넣을 수 없습니다.");
  }
};

const getStoredEmployeeAfterEmploymentAction = (employeeId: string) =>
  listStoredEmployees({
    includeDeleted: true
  }).find((employee) => employee.id === employeeId) as EmployeeRecord;

export const rehireStoredEmployee = (input: EmployeeRehireInput): EmployeeRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureEmployeeSeed();

  const reason = requireEmploymentActionReason(input.reason);
  const rehireDate = String(input.rehireDate ?? "").trim();
  requireRehireDate(rehireDate);

  const employee = database.prepare(`
    SELECT id, status, deleted_at
    FROM employees
    WHERE id = ?
    LIMIT 1
  `).get(input.employeeId) as
    | { id: string; status: string; deleted_at?: string | null }
    | undefined;

  if (!employee) {
    throw new Error("재입사 처리할 인력을 찾을 수 없습니다.");
  }
  if (employee.deleted_at) {
    throw new Error("삭제된 인력은 재입사 처리할 수 없습니다.");
  }
  if (employee.status !== "retired") {
    throw new Error("퇴사 처리된 인력만 재입사 처리할 수 있습니다.");
  }

  const previousPeriod = getLatestEmploymentPeriodRow(database, input.employeeId);

  if (!previousPeriod?.end_date) {
    throw new Error("종료된 최근 고용기간을 찾을 수 없습니다.");
  }
  if (rehireDate < previousPeriod.end_date) {
    throw new Error(
      `재입사일은 직전 퇴사 처리일(${previousPeriod.end_date})보다 빠를 수 없습니다.`
    );
  }

  const employmentPeriodId = randomUUID();
  const createdAt = new Date().toISOString();

  runInSqliteTransaction(database, () => {
    database.prepare(`
      INSERT INTO employee_employment_periods (
        id,
        employee_id,
        start_date,
        end_date,
        closure_provenance_complete,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, NULL, 1, ?, ?)
    `).run(employmentPeriodId, input.employeeId, rehireDate, createdAt, createdAt);
    database.prepare(`
      UPDATE employees
      SET status = 'active',
          hire_date = ?,
          retire_date = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(rehireDate, createdAt, input.employeeId);
    recordEmploymentPeriodEvent(database, {
      employeeId: input.employeeId,
      employmentPeriodId,
      eventType: "rehired",
      eventDate: rehireDate,
      reason,
      createdAt
    });
    markEmployeeMasterReparseRequired();
  });

  return getStoredEmployeeAfterEmploymentAction(input.employeeId);
};

const restoreRetirementHistoryClosures = (
  database: DatabaseSync,
  employmentPeriodId: string
) => {
  const closures = database.prepare(`
    SELECT history_kind, history_id, previous_status, previous_end_date
    FROM employee_retirement_history_closures
    WHERE employment_period_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(employmentPeriodId) as unknown as RetirementHistoryClosureRow[];

  closures.forEach((closure) => {
    if (closure.history_kind === "assignment") {
      database.prepare(`
        UPDATE employee_site_assignments
        SET status = ?, end_date = ?
        WHERE id = ?
      `).run(closure.previous_status ?? "active", closure.previous_end_date ?? null, closure.history_id);
      return;
    }

    database.prepare(`
      UPDATE wage_rates
      SET effective_to = ?
      WHERE id = ?
    `).run(closure.previous_end_date ?? null, closure.history_id);
  });

  return {
    assignmentChanges: closures.filter((closure) => closure.history_kind === "assignment").length,
    wageChanges: closures.filter((closure) => closure.history_kind === "wage").length
  };
};

export const correctStoredEmployeeRetirement = (
  input: EmployeeRetirementCorrectionInput
): EmployeeRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureEmployeeSeed();

  const reason = requireEmploymentActionReason(input.reason);
  const retireDate = String(input.retireDate ?? "").trim();

  if (!isCalendarDateValue(retireDate)) {
    throw new Error("퇴사 처리일 형식이 올바르지 않습니다.");
  }

  const employee = database.prepare(`
    SELECT id, status, retire_date, deleted_at
    FROM employees
    WHERE id = ?
    LIMIT 1
  `).get(input.employeeId) as
    | { id: string; status: string; retire_date?: string | null; deleted_at?: string | null }
    | undefined;

  if (!employee) {
    throw new Error("퇴사일을 정정할 인력을 찾을 수 없습니다.");
  }
  if (employee.deleted_at) {
    throw new Error("삭제된 인력의 퇴사일은 정정할 수 없습니다.");
  }
  if (employee.status !== "retired" || !employee.retire_date) {
    throw new Error("퇴사 처리된 인력만 퇴사일을 정정할 수 있습니다.");
  }
  const previousRetireDate = employee.retire_date;

  const employmentPeriod = getLatestEmploymentPeriodRow(database, input.employeeId);

  if (!employmentPeriod?.end_date) {
    throw new Error("종료된 최근 고용기간을 찾을 수 없습니다.");
  }
  if (retireDate < employmentPeriod.start_date) {
    throw new Error("퇴사 처리일은 최근 입사일보다 빠를 수 없습니다.");
  }
  if (retireDate === previousRetireDate) {
    throw new Error("현재 퇴사 처리일과 같은 날짜입니다.");
  }

  const hasCompleteProvenance = Boolean(employmentPeriod.closure_provenance_complete);

  if (!hasCompleteProvenance && retireDate > previousRetireDate) {
    throw new Error(
      "이 퇴사 기록은 이전 버전에서 처리되어 자동 종료 이력을 안전하게 복원할 수 없습니다. 퇴사일을 뒤로 미루는 정정은 지원하지 않습니다."
    );
  }

  const createdAt = new Date().toISOString();

  runInSqliteTransaction(database, () => {
    const restoredChanges = hasCompleteProvenance
      ? restoreRetirementHistoryClosures(database, employmentPeriod.id)
      : { assignmentChanges: 0, wageChanges: 0 };

    database.prepare(`
      UPDATE employee_employment_periods
      SET end_date = ?, updated_at = ?
      WHERE id = ?
    `).run(retireDate, createdAt, employmentPeriod.id);
    database.prepare(`
      UPDATE employees
      SET retire_date = ?, updated_at = ?
      WHERE id = ?
    `).run(retireDate, createdAt, input.employeeId);

    const retirementChanges = closeEmployeeHistoryAtRetirement(
      database,
      input.employeeId,
      retireDate,
      hasCompleteProvenance ? employmentPeriod.id : undefined
    );

    recordEmploymentPeriodEvent(database, {
      employeeId: input.employeeId,
      employmentPeriodId: employmentPeriod.id,
      eventType: "retirement-corrected",
      eventDate: retireDate,
      previousEventDate: previousRetireDate,
      reason,
      createdAt
    });
    markEmployeeMasterReparseRequired();
    if (restoredChanges.wageChanges > 0 || retirementChanges.wageChanges > 0) {
      markWageRateReparseRequired();
    }
  });

  return getStoredEmployeeAfterEmploymentAction(input.employeeId);
};

export const deleteStoredEmployee = (employeeId: string): EmployeeRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureEmployeeSeed();

  const employee = listStoredEmployees({
    includeDeleted: true,
    includeHistoricalAssignments: true
  }).find((item) => item.id === employeeId);

  if (!employee) {
    throw new Error("삭제할 인력을 찾을 수 없습니다.");
  }

  if (employee.status !== "retired" || !employee.retireDate) {
    throw new Error("퇴사 처리된 인력만 삭제할 수 있습니다.");
  }

  if (employee.retireDate >= createCurrentDateValue()) {
    throw new Error("퇴사 처리일이 지난 인력만 삭제할 수 있습니다.");
  }

  database.exec("BEGIN;");

  try {
    closeEmployeeHistoryAtRetirement(database, employeeId, employee.retireDate);
    const deletedAt = new Date().toISOString();

    database
      .prepare(
        `
          UPDATE employees
          SET deleted_at = COALESCE(deleted_at, ?),
              updated_at = ?
          WHERE id = ?
        `
      )
      .run(deletedAt, deletedAt, employeeId);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  return (
    listStoredEmployees({
      includeDeleted: true,
      includeHistoricalAssignments: true
    }).find((item) => item.id === employeeId) ?? employee
  );
};

export const resetEmployeeStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM employee_employment_period_events;");
    database.exec("DELETE FROM employee_retirement_history_closures;");
    database.exec("DELETE FROM employee_employment_periods;");
    database.exec("DELETE FROM wage_rates;");
    database.exec("DELETE FROM employee_site_assignments;");
    database.exec("DELETE FROM employees;");
  }
};
