import { describe, expect, it } from "vitest";

import {
  databaseMigrationSourceLabels,
  isSupportedDatabaseMigrationFilePath,
  resolveDatabaseMigrationSourceType
} from "./database-migration";

describe("database-migration source helpers", () => {
  it("resolves json backup files", () => {
    expect(resolveDatabaseMigrationSourceType("C:/backup/shiftmgmt-backup.json")).toBe("json");
    expect(isSupportedDatabaseMigrationFilePath("C:/backup/shiftmgmt-backup.json")).toBe(true);
  });

  it("resolves access database files", () => {
    expect(resolveDatabaseMigrationSourceType("C:/backup/shiftmgmt-source.accdb")).toBe("access");
    expect(isSupportedDatabaseMigrationFilePath("C:/backup/shiftmgmt-source.accdb")).toBe(true);
  });

  it("rejects unsupported restore file types", () => {
    expect(resolveDatabaseMigrationSourceType("C:/backup/shiftmgmt-source.xlsx")).toBeNull();
    expect(isSupportedDatabaseMigrationFilePath("C:/backup/shiftmgmt-source.xlsx")).toBe(false);
  });

  it("provides user-facing labels for each supported source type", () => {
    expect(databaseMigrationSourceLabels.json).toBe("JSON 백업 복원");
    expect(databaseMigrationSourceLabels.access).toBe("Access DB 복원");
  });
});
