export type DatabaseMigrationSourceType = "json" | "access";

export const databaseMigrationSourceLabels: Record<DatabaseMigrationSourceType, string> = {
  json: "JSON 백업 복원",
  access: "Access DB 복원"
};

export const resolveDatabaseMigrationSourceType = (
  filePath: string
): DatabaseMigrationSourceType | null => {
  const normalized = filePath.trim().toLowerCase();

  if (normalized.endsWith(".json")) {
    return "json";
  }

  if (normalized.endsWith(".accdb")) {
    return "access";
  }

  return null;
};

export const isSupportedDatabaseMigrationFilePath = (filePath: string) =>
  resolveDatabaseMigrationSourceType(filePath) !== null;
