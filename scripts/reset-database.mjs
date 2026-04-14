import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DATABASE_FILE_NAME = "shiftmgmt.sqlite";
const DEFAULT_DATA_DIR_NAME = "data";
const DEFAULT_USER_DATA_NAMES = ["ShiftMgmt", "shiftmgmt-v3-4", "ShiftMgmt_V3.4"];

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "preview";
const shouldResetAllCandidates = args.includes("--all");
const shouldResetSettings = args.includes("--reset-settings");
const PRESERVED_TABLES = new Set(shouldResetSettings ? [] : ["app_setting_entries"]);
const explicitDbPath =
  process.env.SHIFT_MGMT_DB_PATH?.trim() ||
  args.find((arg) => !arg.startsWith("--"))?.trim() ||
  "";

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const quoteSqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;

const toAbsolutePath = (value) => path.resolve(process.cwd(), value);

const normalizePath = (value) =>
  path.normalize(path.isAbsolute(value) ? value : toAbsolutePath(value));

const getDefaultUserDataRoots = () => {
  const roots = [];

  if (process.env.APPDATA) {
    DEFAULT_USER_DATA_NAMES.forEach((name) => {
      roots.push(path.join(process.env.APPDATA, name));
    });
  }

  roots.push(process.cwd());

  return roots;
};

const resolveEnvDatabasePath = () => {
  const databasePath = process.env.DATABASE_PATH?.trim();

  if (!databasePath) {
    return null;
  }

  if (path.isAbsolute(databasePath)) {
    return path.normalize(databasePath);
  }

  const userDataRoot = getDefaultUserDataRoots()[0] ?? process.cwd();
  const dataDir = process.env.DATA_DIR?.trim() || `.${path.sep}${DEFAULT_DATA_DIR_NAME}`;
  const dataRoot = path.isAbsolute(dataDir) ? dataDir : path.resolve(userDataRoot, dataDir);

  return path.resolve(dataRoot, databasePath);
};

const resolveDefaultDatabaseCandidates = () =>
  getDefaultUserDataRoots().map((root) =>
    path.join(root, DEFAULT_DATA_DIR_NAME, DEFAULT_DATABASE_FILE_NAME)
  );

const uniquePaths = (paths) => [...new Set(paths.filter(Boolean).map((item) => path.normalize(item)))];

const resolveDatabasePaths = () => {
  if (explicitDbPath) {
    return [normalizePath(explicitDbPath)];
  }

  const envDatabasePath = resolveEnvDatabasePath();

  if (envDatabasePath && !shouldResetAllCandidates) {
    return [envDatabasePath];
  }

  const candidates = uniquePaths([
    envDatabasePath,
    ...resolveDefaultDatabaseCandidates()
  ]);

  if (shouldResetAllCandidates) {
    const existingCandidates = candidates.filter((candidate) => existsSync(candidate));

    return existingCandidates.length > 0 ? existingCandidates : [candidates[0]];
  }

  return [candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]];
};

const createBackupPath = (dbPath) => {
  const parsed = path.parse(dbPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return path.join(parsed.dir, `${parsed.name}.reset-backup-${timestamp}${parsed.ext}`);
};

const listResetTables = (database) =>
  database
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `
    )
    .all()
    .map((row) => String(row.name))
    .filter((tableName) => !PRESERVED_TABLES.has(tableName));

const tableExists = (database, tableName) =>
  Boolean(
    database
      .prepare(
        `
          SELECT 1 AS present
          FROM sqlite_master
          WHERE type = 'table'
            AND name = ?
          LIMIT 1
        `
      )
      .get(tableName)
  );

const countRows = (database, tableName) => {
  if (!tableExists(database, tableName)) {
    return 0;
  }

  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`).get();

  return Number(row?.count ?? 0);
};

const previewDatabase = (dbPath) => {
  console.log(`[ShiftMgmt] Target DB: ${dbPath}`);

  if (!existsSync(dbPath)) {
    console.log("[ShiftMgmt] DB file does not exist yet. The app will create it on next launch.");
    return;
  }

  const database = new DatabaseSync(dbPath, { readOnly: true });

  try {
    const tables = listResetTables(database);
    const preservedSettings = countRows(database, "app_setting_entries");

    console.log(`[ShiftMgmt] Tables to clear: ${tables.length}`);
    if (PRESERVED_TABLES.has("app_setting_entries")) {
      console.log(`[ShiftMgmt] Preserved setting rows: ${preservedSettings}`);
      console.log("[ShiftMgmt] Preserved table: app_setting_entries");
    } else {
      console.log(`[ShiftMgmt] Setting rows to clear: ${preservedSettings}`);
      console.log("[ShiftMgmt] Preserved tables: none");
    }
  } finally {
    database.close();
  }
};

const assertTablesCleared = (database, tables) => {
  const unclearedTables = tables
    .map((tableName) => ({
      tableName,
      count: countRows(database, tableName)
    }))
    .filter((item) => item.count > 0);

  if (unclearedTables.length > 0) {
    throw new Error(
      `Reset verification failed: ${unclearedTables
        .map((item) => `${item.tableName}=${item.count}`)
        .join(", ")}`
    );
  }
};

const resetDatabase = (dbPath) => {
  if (!existsSync(dbPath)) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    console.log(`[ShiftMgmt] No DB file was found at ${dbPath}. Nothing was deleted.`);
    console.log("[ShiftMgmt] Launch the app to create a fresh DB.");
    return;
  }

  const database = new DatabaseSync(dbPath);
  const backupPath = createBackupPath(dbPath);

  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    database.exec(`VACUUM INTO ${quoteSqlText(backupPath)};`);

    const tables = listResetTables(database);
    const hasSqliteSequence = tableExists(database, "sqlite_sequence");

    database.exec("PRAGMA foreign_keys = OFF;");
    database.exec("BEGIN IMMEDIATE;");

    try {
      tables.forEach((tableName) => {
        database.exec(`DELETE FROM ${quoteIdentifier(tableName)};`);

        if (hasSqliteSequence) {
          database.prepare("DELETE FROM sqlite_sequence WHERE name = ?;").run(tableName);
        }
      });

      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }

    database.exec("PRAGMA foreign_keys = ON;");
    assertTablesCleared(database, tables);
    database.exec("VACUUM;");

    console.log(`[ShiftMgmt] Backup created: ${backupPath}`);
    console.log(`[ShiftMgmt] Cleared tables: ${tables.length}`);
    console.log(
      PRESERVED_TABLES.has("app_setting_entries")
        ? "[ShiftMgmt] Preserved table: app_setting_entries"
        : "[ShiftMgmt] Preserved tables: none"
    );
  } finally {
    database.close();
  }
};

try {
  const dbPaths = resolveDatabasePaths();

  if (dbPaths.length === 0) {
    throw new Error("Could not resolve the ShiftMgmt SQLite path.");
  }

  dbPaths.forEach((dbPath) => {
    if (mode === "apply") {
      resetDatabase(dbPath);
    } else {
      previewDatabase(dbPath);
    }
  });
} catch (error) {
  console.error(`[ShiftMgmt] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
