import { randomUUID } from "node:crypto";

import type {
  EmployeeAssignmentCloseInput,
  EmployeeAssignmentInput,
  EmployeeAssignmentReorderInput,
  EmployeeWageRateCloseInput,
  EmployeeWageRateInput
} from "../../shared/bridge/contracts";
import type { EmployeeSiteAssignment, WageRateRecord } from "../../shared/domain/model";
import { normalizeTeamLabel } from "../../shared/domain/team-label";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

interface WageRateRow {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  hourly_rate: number;
  effective_from: string;
  effective_to?: string | null;
  reason?: string | null;
  created_at: string;
}

interface EmployeeAssignmentRow {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  site_id: string;
  site_name: string;
  team_name?: string | null;
  shift_group?: string | null;
  sort_order?: number | null;
  start_date: string;
  end_date?: string | null;
  status: "active" | "ended";
  created_at: string;
}

interface TeamAssignmentOrderRow {
  id: string;
  employee_id: string;
  sort_order: number;
  created_at: string;
}

const toWageRateRecord = (row: WageRateRow): WageRateRecord => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeCode: row.employee_code,
  employeeName: row.employee_name,
  hourlyRate: Number(row.hourly_rate),
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to ?? undefined,
  reason: row.reason ?? undefined,
  createdAt: row.created_at
});

const toAssignmentRecord = (row: EmployeeAssignmentRow): EmployeeSiteAssignment => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeCode: row.employee_code,
  employeeName: row.employee_name,
  siteId: row.site_id,
  siteName: row.site_name,
  teamName: row.team_name ?? undefined,
  shiftGroup: normalizeTeamLabel(row.shift_group ?? undefined),
  sortOrder:
    row.sort_order !== null && row.sort_order !== undefined
      ? Number(row.sort_order)
      : undefined,
  startDate: row.start_date,
  endDate: row.end_date ?? undefined,
  status: row.status,
  createdAt: row.created_at
});

const requireReadyDatabase = () => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  return database;
};

const requireEmployee = (employeeId: string) => {
  const database = requireReadyDatabase();
  const employee = database.prepare(`
    SELECT id
    FROM employees
    WHERE id = ?
    LIMIT 1
  `).get(employeeId) as { id: string } | undefined;

  if (!employee) {
    throw new Error("Employee not found.");
  }
};

const requireSite = (siteId: string) => {
  const database = requireReadyDatabase();
  const site = database.prepare(`
    SELECT id
    FROM sites
    WHERE id = ?
    LIMIT 1
  `).get(siteId) as { id: string } | undefined;

  if (!site) {
    throw new Error("Site not found.");
  }
};

const getActiveTeamCapacity = (siteId: string, teamLabel?: string) => {
  if (!teamLabel) {
    return undefined;
  }

  const database = requireReadyDatabase();
  const row = database.prepare(`
    SELECT shift_pattern_team_capacities.max_headcount
    FROM shift_pattern_team_capacities
    INNER JOIN shift_patterns
      ON shift_patterns.id = shift_pattern_team_capacities.pattern_id
    WHERE shift_patterns.site_id = ?
      AND shift_patterns.status = 'active'
      AND shift_pattern_team_capacities.team_label = ?
    ORDER BY COALESCE(shift_patterns.updated_at, shift_patterns.created_at) DESC
    LIMIT 1
  `).get(siteId, teamLabel) as { max_headcount: number } | undefined;

  return row && Number(row.max_headcount) > 0 ? Number(row.max_headcount) : undefined;
};

const ensureTeamCapacity = (siteId: string, teamLabel: string | undefined, employeeId: string) => {
  const maxHeadcount = getActiveTeamCapacity(siteId, teamLabel);

  if (!maxHeadcount || !teamLabel) {
    return;
  }

  const database = requireReadyDatabase();
  const row = database.prepare(`
    SELECT COUNT(*) as count
    FROM employee_site_assignments
    WHERE site_id = ?
      AND shift_group = ?
      AND status = 'active'
      AND employee_id <> ?
  `).get(siteId, teamLabel, employeeId) as { count: number };

  if (Number(row.count) >= maxHeadcount) {
    throw new Error(`${teamLabel} 정원(${maxHeadcount}명)을 초과할 수 없습니다.`);
  }
};

const requireWageRate = (wageRateId: string) => {
  const database = requireReadyDatabase();
  const wageRate = database.prepare(`
    SELECT *
    FROM wage_rates
    WHERE id = ?
    LIMIT 1
  `).get(wageRateId) as
    | { id: string; employee_id: string; effective_from: string; effective_to?: string | null }
    | undefined;

  if (!wageRate) {
    throw new Error("Wage rate not found.");
  }

  return wageRate;
};

const requireAssignment = (assignmentId: string) => {
  const database = requireReadyDatabase();
  const assignment = database.prepare(`
    SELECT *
    FROM employee_site_assignments
    WHERE id = ?
    LIMIT 1
  `).get(assignmentId) as
    | {
        id: string;
        employee_id: string;
        site_id: string;
        shift_group?: string | null;
        sort_order?: number | null;
        start_date: string;
        end_date?: string | null;
        status: "active" | "ended";
      }
    | undefined;

  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  return assignment;
};

const sanitizeAssignmentSortOrder = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0;

const listActiveAssignmentsForTeam = (
  database: ReturnType<typeof requireReadyDatabase>,
  siteId: string,
  teamLabel?: string
) => {
  if (!teamLabel) {
    return [];
  }

  return database.prepare(`
    SELECT id, employee_id, sort_order, created_at
    FROM employee_site_assignments
    WHERE site_id = ?
      AND shift_group = ?
      AND status = 'active'
    ORDER BY sort_order ASC, created_at ASC
  `).all(siteId, teamLabel) as unknown as TeamAssignmentOrderRow[];
};

const getNextAssignmentSortOrder = (
  database: ReturnType<typeof requireReadyDatabase>,
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

  return sanitizeAssignmentSortOrder(Number(row?.next_sort_order ?? 0));
};

const normalizeActiveTeamSortOrders = (
  database: ReturnType<typeof requireReadyDatabase>,
  siteId: string,
  teamLabel?: string
) => {
  if (!teamLabel) {
    return;
  }

  const orderedAssignments = listActiveAssignmentsForTeam(database, siteId, teamLabel);
  const updateSortOrder = database.prepare(`
    UPDATE employee_site_assignments
    SET sort_order = ?
    WHERE id = ?
  `);

  orderedAssignments.forEach((assignment, index) => {
    if (assignment.sort_order === index) {
      return;
    }

    updateSortOrder.run(index, assignment.id);
  });
};

const listStoredTeamAssignments = (
  siteId: string,
  teamLabel: string
): EmployeeSiteAssignment[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      employee_site_assignments.*,
      employees.employee_code,
      employees.name as employee_name,
      sites.name as site_name
    FROM employee_site_assignments
    INNER JOIN employees
      ON employees.id = employee_site_assignments.employee_id
    INNER JOIN sites
      ON sites.id = employee_site_assignments.site_id
    WHERE employee_site_assignments.site_id = ?
      AND employee_site_assignments.shift_group = ?
      AND employee_site_assignments.status = 'active'
    ORDER BY employee_site_assignments.sort_order ASC, employee_site_assignments.created_at ASC
  `).all(siteId, teamLabel) as unknown as EmployeeAssignmentRow[];

  return rows.map(toAssignmentRecord);
};

const shiftDateValue = (value: string, offsetDays: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid date value.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);

  return `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;
};

export const listStoredEmployeeWageRates = (employeeId: string): WageRateRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      wage_rates.*,
      employees.employee_code,
      employees.name as employee_name
    FROM wage_rates
    INNER JOIN employees
      ON employees.id = wage_rates.employee_id
    WHERE wage_rates.employee_id = ?
    ORDER BY wage_rates.effective_from DESC, wage_rates.created_at DESC
  `).all(employeeId) as unknown as WageRateRow[];

  return rows.map(toWageRateRecord);
};

export const listStoredEmployeeAssignments = (
  employeeId: string
): EmployeeSiteAssignment[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      employee_site_assignments.*,
      employees.employee_code,
      employees.name as employee_name,
      sites.name as site_name
    FROM employee_site_assignments
    INNER JOIN employees
      ON employees.id = employee_site_assignments.employee_id
    INNER JOIN sites
      ON sites.id = employee_site_assignments.site_id
    WHERE employee_site_assignments.employee_id = ?
    ORDER BY
      CASE employee_site_assignments.status WHEN 'active' THEN 0 ELSE 1 END ASC,
      employee_site_assignments.start_date DESC,
      employee_site_assignments.sort_order ASC,
      employee_site_assignments.created_at DESC
  `).all(employeeId) as unknown as EmployeeAssignmentRow[];

  return rows.map(toAssignmentRecord);
};

// 시급은 이력 어느 자리에나 넣을 수 있다(소급 인상·오등록 정정). 넣은 뒤에도 기간이 겹치지
// 않도록 앞뒤 줄을 맞춘다: 시작일이 같은 줄은 고쳐 쓰고, 새 시작일을 물고 있던 앞줄은 전날로
// 끊고, 새 줄은 다음 줄 시작일 전날에서 끝난다(다음 줄이 없으면 계속).
export const saveStoredEmployeeWageRate = (
  input: EmployeeWageRateInput
): WageRateRecord => {
  const database = requireReadyDatabase();
  requireEmployee(input.employeeId);

  const existingRates = database.prepare(`
    SELECT id, effective_from, effective_to
    FROM wage_rates
    WHERE employee_id = ?
    ORDER BY effective_from ASC, created_at ASC
  `).all(input.employeeId) as Array<{
    id: string;
    effective_from: string;
    effective_to: string | null;
  }>;

  const sameStartRate = existingRates.find((rate) => rate.effective_from === input.effectiveFrom);
  const previousWageEffectiveTo = shiftDateValue(input.effectiveFrom, -1);
  const nextRate = existingRates.find((rate) => rate.effective_from > input.effectiveFrom);
  const nextEffectiveTo = nextRate ? shiftDateValue(nextRate.effective_from, -1) : null;
  const createdAt = new Date().toISOString();

  // 시작일이 같으면 새 줄을 만들지 않고 그 줄을 고쳐 쓴다(잘못 넣은 시급 정정).
  if (sameStartRate) {
    database.prepare(`
      UPDATE wage_rates
      SET hourly_rate = ?,
          effective_to = ?,
          reason = ?
      WHERE id = ?
    `).run(input.hourlyRate, nextEffectiveTo, input.reason ?? null, sameStartRate.id);

    return listStoredEmployeeWageRates(input.employeeId).find(
      (item) => item.id === sameStartRate.id
    ) as WageRateRecord;
  }

  const id = randomUUID();

  // 새 시작일을 걸치고 있는 앞줄(끝이 없거나 새 시작일 이후까지 가는 줄)은 전날로 끊는다.
  database.prepare(`
    UPDATE wage_rates
    SET effective_to = ?
    WHERE employee_id = ?
      AND effective_from < ?
      AND (effective_to IS NULL OR effective_to >= ?)
  `).run(previousWageEffectiveTo, input.employeeId, input.effectiveFrom, input.effectiveFrom);

  database.prepare(`
    INSERT INTO wage_rates (
      id,
      employee_id,
      hourly_rate,
      effective_from,
      effective_to,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.employeeId,
    input.hourlyRate,
    input.effectiveFrom,
    nextEffectiveTo,
    input.reason ?? null,
    createdAt
  );

  return listStoredEmployeeWageRates(input.employeeId).find((item) => item.id === id) as WageRateRecord;
};

export const saveStoredEmployeeAssignment = (
  input: EmployeeAssignmentInput
): EmployeeSiteAssignment => {
  const database = requireReadyDatabase();
  const normalizedShiftGroup = normalizeTeamLabel(input.shiftGroup);
  requireEmployee(input.employeeId);
  requireSite(input.siteId);
  ensureTeamCapacity(input.siteId, normalizedShiftGroup, input.employeeId);

  const previousActiveAssignment = database.prepare(`
    SELECT site_id, shift_group
    FROM employee_site_assignments
    WHERE employee_id = ?
      AND status = 'active'
    ORDER BY start_date DESC, sort_order ASC, created_at DESC
    LIMIT 1
  `).get(input.employeeId) as { site_id: string; shift_group?: string | null } | undefined;

  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const nextSortOrder =
    typeof input.sortOrder === "number"
      ? sanitizeAssignmentSortOrder(input.sortOrder)
      : getNextAssignmentSortOrder(database, input.siteId, normalizedShiftGroup);

  database.prepare(`
    UPDATE employee_site_assignments
    SET status = 'ended',
        end_date = COALESCE(end_date, ?)
    WHERE employee_id = ?
      AND status = 'active'
  `).run(input.startDate, input.employeeId);

  database.prepare(`
    INSERT INTO employee_site_assignments (
      id,
      employee_id,
      site_id,
      team_name,
      shift_group,
      sort_order,
      start_date,
      end_date,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.employeeId,
    input.siteId,
    input.teamName ?? normalizedShiftGroup ?? null,
    normalizedShiftGroup ?? null,
    nextSortOrder,
    input.startDate,
    null,
    "active",
    createdAt
  );

  if (previousActiveAssignment) {
    normalizeActiveTeamSortOrders(
      database,
      previousActiveAssignment.site_id,
      normalizeTeamLabel(previousActiveAssignment.shift_group)
    );
  }
  normalizeActiveTeamSortOrders(database, input.siteId, normalizedShiftGroup);

  return listStoredEmployeeAssignments(input.employeeId).find(
    (item) => item.id === id
  ) as EmployeeSiteAssignment;
};

export const closeStoredEmployeeWageRate = (
  input: EmployeeWageRateCloseInput
): WageRateRecord => {
  const database = requireReadyDatabase();
  const wageRate = requireWageRate(input.wageRateId);

  if (wageRate.effective_to) {
    throw new Error("Closed wage rate cannot be updated.");
  }

  if (input.effectiveTo < wageRate.effective_from) {
    throw new Error("Close date cannot be earlier than effective_from.");
  }

  database.prepare(`
    UPDATE wage_rates
    SET effective_to = ?
    WHERE id = ?
  `).run(input.effectiveTo, input.wageRateId);

  return listStoredEmployeeWageRates(wageRate.employee_id).find(
    (item) => item.id === input.wageRateId
  ) as WageRateRecord;
};

export const closeStoredEmployeeAssignment = (
  input: EmployeeAssignmentCloseInput
): EmployeeSiteAssignment => {
  const database = requireReadyDatabase();
  const assignment = requireAssignment(input.assignmentId);
  const normalizedShiftGroup = normalizeTeamLabel(assignment.shift_group);

  if (assignment.status !== "active") {
    throw new Error("Closed assignment cannot be updated.");
  }

  if (input.endDate < assignment.start_date) {
    throw new Error("Close date cannot be earlier than start_date.");
  }

  database.prepare(`
    UPDATE employee_site_assignments
    SET status = 'ended',
        end_date = ?
    WHERE id = ?
  `).run(input.endDate, input.assignmentId);

  normalizeActiveTeamSortOrders(database, assignment.site_id, normalizedShiftGroup);

  return listStoredEmployeeAssignments(assignment.employee_id).find(
    (item) => item.id === input.assignmentId
  ) as EmployeeSiteAssignment;
};

export const reorderStoredEmployeeAssignment = (
  input: EmployeeAssignmentReorderInput
): EmployeeSiteAssignment[] => {
  const database = requireReadyDatabase();
  const assignment = requireAssignment(input.assignmentId);

  if (assignment.status !== "active") {
    throw new Error("Closed assignment cannot be reordered.");
  }

  const normalizedShiftGroup = normalizeTeamLabel(assignment.shift_group);

  if (!normalizedShiftGroup) {
    throw new Error("근무조가 지정된 활성 배정만 순서를 변경할 수 있습니다.");
  }

  const orderedAssignments = listActiveAssignmentsForTeam(
    database,
    assignment.site_id,
    normalizedShiftGroup
  );
  const currentIndex = orderedAssignments.findIndex((item) => item.id === input.assignmentId);

  if (currentIndex < 0) {
    throw new Error("순서를 변경할 현재 배정을 찾을 수 없습니다.");
  }

  const targetIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= orderedAssignments.length) {
    return listStoredTeamAssignments(assignment.site_id, normalizedShiftGroup);
  }

  const reorderedAssignments = orderedAssignments.slice();
  const [movedAssignment] = reorderedAssignments.splice(currentIndex, 1);

  reorderedAssignments.splice(targetIndex, 0, movedAssignment!);

  const updateSortOrder = database.prepare(`
    UPDATE employee_site_assignments
    SET sort_order = ?
    WHERE id = ?
  `);

  reorderedAssignments.forEach((item, index) => {
    updateSortOrder.run(index, item.id);
  });

  return listStoredTeamAssignments(assignment.site_id, normalizedShiftGroup);
};
