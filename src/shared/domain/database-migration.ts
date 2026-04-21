export type DatabaseMigrationSourceType = "json" | "access";

export const accessMigrationTableOptions = [
  { value: "공휴일", label: "공휴일" },
  { value: "연장근로요율", label: "연장근로요율" },
  { value: "사업조직현황", label: "사업조직현황" },
  { value: "사업조직별근무자현황", label: "사업조직별근무자현황" },
  { value: "근무자별시급관리", label: "근무자별시급관리" },
  { value: "사업조직별근무실적", label: "사업조직별근무실적" },
  { value: "사업조직별패턴", label: "사업조직별패턴" },
  { value: "직무해제자현황", label: "직무해제자현황" }
] as const;

export type AccessMigrationTableName =
  (typeof accessMigrationTableOptions)[number]["value"];

const accessMigrationTableNameSet = new Set<AccessMigrationTableName>(
  accessMigrationTableOptions.map((option) => option.value)
);

export const defaultAccessMigrationTables: AccessMigrationTableName[] =
  accessMigrationTableOptions.map((option) => option.value);

export const normalizeSelectedAccessMigrationTables = (
  tables?: readonly AccessMigrationTableName[]
) => {
  if (!tables) {
    return defaultAccessMigrationTables.slice();
  }

  return Array.from(
    new Set(
      tables.filter((table): table is AccessMigrationTableName =>
        accessMigrationTableNameSet.has(table)
      )
    )
  );
};

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
