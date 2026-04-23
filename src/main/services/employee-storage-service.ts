import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  EmployeeListQuery,
  EmployeeUpsertInput
} from "../../shared/bridge/contracts";
import {
  formatEmployeeDisplayName,
  isBpEmploymentType,
  normalizeEmploymentTypeLabel
} from "../../shared/domain/employment-type";
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

const createCurrentDateValue = () => {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
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

const toEmployeeRecord = (row: Record<string, unknown>): EmployeeRecord => ({
  id: String(row.id),
  employeeCode: String(row.employee_code),
  name: String(row.name),
  employmentType: normalizeEmploymentTypeLabel(
    row.employment_type ? String(row.employment_type) : undefined
  ),
  status: row.status as EmployeeRecord["status"],
  hireDate: row.hire_date ? String(row.hire_date) : undefined,
  retireDate: row.retire_date ? String(row.retire_date) : undefined,
  currentSiteId: row.current_site_id ? String(row.current_site_id) : undefined,
  currentSiteName: row.current_site_name ? String(row.current_site_name) : undefined,
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
        sort_order,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          AND latest_assignments.status = 'active'
        ORDER BY latest_assignments.start_date DESC, latest_assignments.sort_order ASC, latest_assignments.created_at DESC
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
    .filter((employee) => {
      if (normalizedKeyword.length === 0) {
        return true;
      }

      const displayName = formatEmployeeDisplayName(employee).toLowerCase();

      return (
        employee.name.toLowerCase().includes(normalizedKeyword) ||
        displayName.includes(normalizedKeyword) ||
        employee.employeeCode.toLowerCase().includes(normalizedKeyword)
      );
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
  const isBpEmployee = isBpEmploymentType(normalizedEmploymentType);
  const existingEmployeeCode = existing ? String(existing.employee_code) : "";
  let normalizedEmployeeCode = input.employeeCode.trim();
  const normalizedShiftGroup = normalizeTeamLabel(input.shiftGroup);
  const shouldCreateInitialAssignment = Boolean(input.siteId && normalizedShiftGroup);
  const assignmentSiteId = shouldCreateInitialAssignment ? input.siteId ?? null : null;

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
    normalizedEmployeeCode,
    input.name,
    normalizedEmploymentType,
    input.status,
    input.hireDate ?? null,
    input.retireDate ?? null,
    createdAt,
    updatedAt
  );

  if (assignmentSiteId) {
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
        sort_order,
        start_date,
        end_date,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      id,
      assignmentSiteId,
      null,
      normalizedShiftGroup ?? null,
      getNextAssignmentSortOrder(database, assignmentSiteId, normalizedShiftGroup),
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

export const deleteStoredEmployee = (employeeId: string): EmployeeRecord => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  ensureEmployeeSeed();

  const employee = listStoredEmployees().find((item) => item.id === employeeId);

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
    database
      .prepare(
        `
          DELETE FROM wage_rates
          WHERE employee_id = ?
        `
      )
      .run(employeeId);
    database
      .prepare(
        `
          DELETE FROM employee_site_assignments
          WHERE employee_id = ?
        `
      )
      .run(employeeId);
    database
      .prepare(
        `
          DELETE FROM employees
          WHERE id = ?
        `
      )
      .run(employeeId);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  return employee;
};

export const resetEmployeeStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM wage_rates;");
    database.exec("DELETE FROM employee_site_assignments;");
    database.exec("DELETE FROM employees;");
  }
};
