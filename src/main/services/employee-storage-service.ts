import { randomUUID } from "node:crypto";

import type {
  EmployeeListQuery,
  EmployeeUpsertInput
} from "../../shared/bridge/contracts";
import type { EmployeeRecord, SiteRecord } from "../../shared/domain/model";
import { normalizeTeamLabel } from "../../shared/domain/team-label";
import { listStoredSites } from "./site-storage-service";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const defaultEmployees: EmployeeUpsertInput[] = [
  {
    employeeCode: "EMP-001",
    name: "김현우",
    employmentType: "정규",
    status: "active",
    hireDate: "2023-03-01",
    shiftGroup: "A조",
    hourlyRate: 12800
  },
  {
    employeeCode: "EMP-014",
    name: "이수민",
    employmentType: "계약",
    status: "leave",
    hireDate: "2024-01-15",
    shiftGroup: "B조",
    hourlyRate: 13200
  },
  {
    employeeCode: "EMP-023",
    name: "박정호",
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

const toEmployeeRecord = (row: Record<string, unknown>): EmployeeRecord => ({
  id: String(row.id),
  employeeCode: String(row.employee_code),
  name: String(row.name),
  employmentType: String(row.employment_type),
  status: row.status as EmployeeRecord["status"],
  hireDate: row.hire_date ? String(row.hire_date) : undefined,
  retireDate: row.retire_date ? String(row.retire_date) : undefined,
  currentSiteId: row.current_site_id ? String(row.current_site_id) : undefined,
  currentSiteName: row.current_site_name ? String(row.current_site_name) : undefined,
  currentShiftGroup: normalizeTeamLabel(
    row.current_shift_group ? String(row.current_shift_group) : undefined
  ),
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
      employment_type,
      status,
      hire_date,
      retire_date,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAssignment = database.prepare(`
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
  `);
  const insertWageRate = database.prepare(`
    INSERT INTO wage_rates (
      id,
      employee_id,
      hourly_rate,
      effective_from,
      effective_to,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  defaultEmployees.forEach((employee) => {
    const employeeId = randomUUID();
    insertEmployee.run(
      employeeId,
      employee.employeeCode,
      employee.name,
      employee.employmentType,
      employee.status,
      employee.hireDate ?? null,
      employee.retireDate ?? null,
      now,
      now
    );

    const targetSite = siteMap.get(defaultSiteNamesByEmployeeCode[employee.employeeCode] ?? "");

    if (targetSite) {
      insertAssignment.run(
        randomUUID(),
        employeeId,
        targetSite.id,
        null,
        employee.shiftGroup ?? null,
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
        employee.hourlyRate,
        employee.hireDate ?? "2026-01-01",
        employee.retireDate ?? null,
        "초기 시드",
        now
      );
    }
  });
};

export const listStoredEmployees = (query?: EmployeeListQuery): EmployeeRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureEmployeeSeed();

  const rows = database.prepare(`
    SELECT
      employees.*,
      sites.id as current_site_id,
      sites.name as current_site_name,
      assignments.shift_group as current_shift_group,
      assignments.start_date as current_assignment_start_date,
      assignments.end_date as current_assignment_end_date,
      wage_rates.hourly_rate as current_hourly_rate
    FROM employees
    LEFT JOIN employee_site_assignments as assignments
      ON assignments.id = (
        SELECT latest_assignments.id
        FROM employee_site_assignments as latest_assignments
        WHERE latest_assignments.employee_id = employees.id
          AND latest_assignments.status = 'active'
        ORDER BY latest_assignments.start_date DESC, latest_assignments.created_at DESC
        LIMIT 1
      )
    LEFT JOIN sites
      ON sites.id = assignments.site_id
    LEFT JOIN wage_rates
      ON wage_rates.id = (
        SELECT latest_wage_rates.id
        FROM wage_rates as latest_wage_rates
        WHERE latest_wage_rates.employee_id = employees.id
          AND latest_wage_rates.effective_to IS NULL
        ORDER BY latest_wage_rates.effective_from DESC, latest_wage_rates.created_at DESC
        LIMIT 1
      )
    ORDER BY employees.name ASC
  `).all() as Array<Record<string, unknown>>;

  const normalizedKeyword = query?.keyword?.trim().toLowerCase() ?? "";

  return rows
    .map(toEmployeeRecord)
    .filter((employee) => !query?.status || employee.status === query.status)
    .filter((employee) => !query?.siteId || employee.currentSiteId === query.siteId)
    .filter((employee) =>
      normalizedKeyword.length === 0
        ? true
        : employee.name.toLowerCase().includes(normalizedKeyword) ||
          employee.employeeCode.toLowerCase().includes(normalizedKeyword)
    );
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
  const normalizedShiftGroup = normalizeTeamLabel(input.shiftGroup);

  database.prepare(`
    INSERT INTO employees (
      id,
      employee_code,
      name,
      employment_type,
      status,
      hire_date,
      retire_date,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      employee_code = excluded.employee_code,
      name = excluded.name,
      employment_type = excluded.employment_type,
      status = excluded.status,
      hire_date = excluded.hire_date,
      retire_date = excluded.retire_date,
      updated_at = excluded.updated_at
  `).run(
    id,
    input.employeeCode,
    input.name,
    input.employmentType,
    input.status,
    input.hireDate ?? null,
    input.retireDate ?? null,
    createdAt,
    updatedAt
  );

  if (input.siteId) {
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
        site_id,
        team_name,
        shift_group,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      id,
      input.siteId,
      null,
      normalizedShiftGroup ?? null,
      input.hireDate ?? updatedAt.slice(0, 10),
      null,
      "active",
      updatedAt
    );
  }

  if (typeof input.hourlyRate === "number") {
    database.prepare(`
      UPDATE wage_rates
      SET effective_to = COALESCE(effective_to, ?)
      WHERE employee_id = ?
        AND effective_to IS NULL
    `).run(updatedAt.slice(0, 10), id);

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
      randomUUID(),
      id,
      input.hourlyRate,
      input.hireDate ?? updatedAt.slice(0, 10),
      null,
      "직원 등록/수정",
      updatedAt
    );
  }

  return listStoredEmployees().find((employee) => employee.id === id) as EmployeeRecord;
};

export const resetEmployeeStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM wage_rates;");
    database.exec("DELETE FROM employee_site_assignments;");
    database.exec("DELETE FROM employees;");
  }
};
