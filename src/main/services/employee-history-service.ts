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
