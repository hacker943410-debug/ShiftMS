import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  closeSqliteStorage,
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

describe("sqlite-storage-service", () => {
  it("should initialize the sqlite file and apply runtime tables", () => {
    const dbPath = path.resolve(process.cwd(), "artifacts", "tests", "sqlite-storage.test.sqlite");

    initializeSqliteStorage({ dbPath });

    const database = getSqliteDatabase();

    expect(database).not.toBeNull();

    const tables = database!.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    expect(tables.map((item) => item.name)).toContain("performance_approvals");
    expect(tables.map((item) => item.name)).toContain("allowance_calculation_results");
    expect(tables.map((item) => item.name)).toContain("performance_files");

    closeSqliteStorage();
    resetSqliteStorageForTest();
  });
});
