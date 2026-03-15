import { randomUUID } from "node:crypto";

import type {
  EmployeeAssignmentCloseInput,
  EmployeeAssignmentInput,
  EmployeeWageRateCloseInput,
  EmployeeWageRateInput
} from "../../shared/bridge/contracts";
import type { EmployeeSiteAssignment, WageRateRecord } from "../../shared/domain/model";
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
  start_date: string;
  end_date?: string | null;
  status: "active" | "ended";
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
  shiftGroup: row.shift_group ?? undefined,
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
    ORDER BY employee_site_assignments.start_date DESC, employee_site_assignments.created_at DESC
  `).all(employeeId) as unknown as EmployeeAssignmentRow[];

  return rows.map(toAssignmentRecord);
};

export const saveStoredEmployeeWageRate = (
  input: EmployeeWageRateInput
): WageRateRecord => {
  const database = requireReadyDatabase();
  requireEmployee(input.employeeId);
  const activeWageRate = database.prepare(`
    SELECT id, effective_from
    FROM wage_rates
    WHERE employee_id = ?
      AND effective_to IS NULL
    ORDER BY effective_from DESC, created_at DESC
    LIMIT 1
  `).get(input.employeeId) as { id: string; effective_from: string } | undefined;

  if (activeWageRate && input.effectiveFrom <= activeWageRate.effective_from) {
    throw new Error("Effective date must be later than current wage rate.");
  }

  const previousWageEffectiveTo = shiftDateValue(input.effectiveFrom, -1);

  const createdAt = new Date().toISOString();
  const id = randomUUID();

  database.prepare(`
    UPDATE wage_rates
    SET effective_to = COALESCE(effective_to, ?)
    WHERE employee_id = ?
      AND effective_to IS NULL
  `).run(previousWageEffectiveTo, input.employeeId);

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
    null,
    input.reason ?? null,
    createdAt
  );

  return listStoredEmployeeWageRates(input.employeeId).find((item) => item.id === id) as WageRateRecord;
};

export const saveStoredEmployeeAssignment = (
  input: EmployeeAssignmentInput
): EmployeeSiteAssignment => {
  const database = requireReadyDatabase();
  requireEmployee(input.employeeId);
  requireSite(input.siteId);
  ensureTeamCapacity(input.siteId, input.shiftGroup, input.employeeId);

  const createdAt = new Date().toISOString();
  const id = randomUUID();

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
      start_date,
      end_date,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.employeeId,
    input.siteId,
    input.teamName ?? null,
    input.shiftGroup ?? null,
    input.startDate,
    null,
    "active",
    createdAt
  );

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

  return listStoredEmployeeAssignments(assignment.employee_id).find(
    (item) => item.id === input.assignmentId
  ) as EmployeeSiteAssignment;
};
