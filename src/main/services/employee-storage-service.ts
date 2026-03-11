import { randomUUID } from "node:crypto";

import type {
  EmployeeListQuery,
  EmployeeUpsertInput
} from "../../shared/bridge/contracts";
import type { EmployeeRecord } from "../../shared/domain/model";
import { getSqliteDatabase, isSqliteStorageReady } from "./sqlite-storage-service";

const defaultEmployees: EmployeeUpsertInput[] = [
  {
    employeeCode: "EMP-001",
    name: "김현우",
    employmentType: "정규",
    status: "active",
    hireDate: "2023-03-01"
  },
  {
    employeeCode: "EMP-014",
    name: "이수민",
    employmentType: "계약",
    status: "leave",
    hireDate: "2024-01-15"
  },
  {
    employeeCode: "EMP-023",
    name: "박정호",
    employmentType: "정규",
    status: "retired",
    hireDate: "2021-06-10",
    retireDate: "2026-02-28"
  }
];

const toEmployeeRecord = (row: Record<string, unknown>): EmployeeRecord => ({
  id: String(row.id),
  employeeCode: String(row.employee_code),
  name: String(row.name),
  employmentType: String(row.employment_type),
  status: row.status as EmployeeRecord["status"],
  hireDate: row.hire_date ? String(row.hire_date) : undefined,
  retireDate: row.retire_date ? String(row.retire_date) : undefined,
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

  const now = new Date().toISOString();
  const insert = database.prepare(`
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

  defaultEmployees.forEach((employee) => {
    insert.run(
      randomUUID(),
      employee.employeeCode,
      employee.name,
      employee.employmentType,
      employee.status,
      employee.hireDate ?? null,
      employee.retireDate ?? null,
      now,
      now
    );
  });
};

export const listStoredEmployees = (query?: EmployeeListQuery): EmployeeRecord[] => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return [];
  }

  ensureEmployeeSeed();

  const rows = database.prepare(`
    SELECT *
    FROM employees
    ORDER BY name ASC
  `).all() as Array<Record<string, unknown>>;

  const normalizedKeyword = query?.keyword?.trim().toLowerCase() ?? "";

  return rows
    .map(toEmployeeRecord)
    .filter((employee) => !query?.status || employee.status === query.status)
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

  const row = database.prepare(`
    SELECT *
    FROM employees
    WHERE id = ?
    LIMIT 1
  `).get(id) as Record<string, unknown>;

  return toEmployeeRecord(row);
};

export const resetEmployeeStorageForTest = () => {
  const database = getSqliteDatabase();

  if (database && isSqliteStorageReady()) {
    database.exec("DELETE FROM employees;");
  }
};
