#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const saltBytes = 16;
const keyBytes = 64;
const recoveryKeyGroupCount = 10;
const recoveryKeyGroupLength = 4;

const args = process.argv.slice(2);

const readArg = (name) => {
  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] : undefined;
};

const hasFlag = (name) => args.includes(name);

const resolveDefaultDbPath = () => {
  const appData = process.env.APPDATA;

  if (!appData) {
    return null;
  }

  const candidates = [
    path.resolve(appData, "shiftmgmt-v3-4", "data", "shiftmgmt.sqlite"),
    path.resolve(appData, "ShiftMgmt", "data", "shiftmgmt.sqlite"),
    path.resolve(appData, "ShiftMgmt_V3.4", "data", "shiftmgmt.sqlite")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
};

const normalizeRecoveryKey = (value) => String(value ?? "").trim().toUpperCase();

const generateRecoveryKey = () => {
  const keyBody = Array.from({ length: recoveryKeyGroupCount }, () =>
    randomBytes(recoveryKeyGroupLength / 2).toString("hex").toUpperCase()
  ).join("-");

  return `SMR-${keyBody}`;
};

const createSecretHash = (secret) => {
  const salt = randomBytes(saltBytes).toString("hex");
  const hash = scryptSync(secret, salt, keyBytes).toString("hex");

  return `scrypt:${salt}:${hash}`;
};

const buildTimestamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");

const ensureColumn = (database, tableName, columnName, definition) => {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = rows.some((row) => String(row.name) === columnName);

  if (!exists) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
};

const printUsage = () => {
  console.error(
    "Usage: issue-account-recovery-key.mjs [--db <shiftmgmt.sqlite>] [--key <SMR-...>] [--no-backup]"
  );
};

const dbPathInput = readArg("--db") ?? resolveDefaultDbPath();
const dbPath = dbPathInput ? path.resolve(dbPathInput) : null;
const requestedKey = readArg("--key");
const recoveryKey = normalizeRecoveryKey(requestedKey ?? generateRecoveryKey());
const resultFilePath = readArg("--result-file");
const outputLines = [];

const writeOutput = (message) => {
  outputLines.push(message);
  console.log(message);
};

const writeResultFile = (exitCode) => {
  if (!resultFilePath) {
    return;
  }

  const resolvedPath = path.resolve(resultFilePath);

  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `EXIT_CODE=${exitCode}\n${outputLines.join("\n")}\n`, "utf8");
};

if (!dbPath || !existsSync(dbPath)) {
  outputLines.push(
    "Usage: issue-account-recovery-key.mjs [--db <shiftmgmt.sqlite>] [--key <SMR-...>] [--no-backup]"
  );
  outputLines.push("Could not find the database file.");
  writeResultFile(1);
  printUsage();
  console.error("Could not find the database file.");
  process.exit(1);
}

if (!/^SMR(?:-[A-F0-9]{4}){10}$/.test(recoveryKey)) {
  outputLines.push("Recovery key format is invalid. Expected: SMR-XXXX-XXXX-... (10 groups)");
  writeResultFile(1);
  console.error(outputLines.at(-1));
  process.exit(1);
}

const database = new DatabaseSync(dbPath);

try {
  database.exec("PRAGMA busy_timeout = 5000;");

  const appUsersTable = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'app_users'
    LIMIT 1
  `).get();

  if (!appUsersTable) {
    throw new Error("app_users table was not found. Start ShiftMgmt once before running this script.");
  }

  const admin = database.prepare(`
    SELECT id, login_id
    FROM app_users
    WHERE login_id = 'admin'
    LIMIT 1
  `).get();

  if (!admin) {
    throw new Error("admin account was not found.");
  }

  let backupPath = null;

  database.exec("PRAGMA wal_checkpoint(FULL);");

  if (!hasFlag("--no-backup")) {
    const backupDirectory = path.resolve(path.dirname(dbPath), "account-recovery-backups");
    backupPath = path.resolve(
      backupDirectory,
      `shiftmgmt-recovery-key-issue-${buildTimestamp()}.sqlite`
    );

    mkdirSync(backupDirectory, { recursive: true });
    copyFileSync(dbPath, backupPath);
  }

  ensureColumn(database, "app_users", "account_recovery_key_hash", "TEXT");
  ensureColumn(database, "app_users", "account_recovery_key_issued_at", "TEXT");
  ensureColumn(
    database,
    "app_users",
    "account_recovery_failure_count",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(database, "app_users", "account_recovery_locked_until", "TEXT");

  const issuedAt = new Date().toISOString();

  database.prepare(`
    UPDATE app_users
    SET account_recovery_key_hash = ?,
        account_recovery_key_issued_at = ?,
        account_recovery_failure_count = 0,
        account_recovery_locked_until = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(createSecretHash(recoveryKey), issuedAt, issuedAt, String(admin.id));

  writeOutput("Account recovery key issued.");
  if (backupPath) {
    writeOutput(`Database backup: ${backupPath}`);
  }
  writeOutput(`Database: ${dbPath}`);
  writeOutput(`Login ID: ${admin.login_id}`);
  writeOutput(`Recovery key: ${recoveryKey}`);
  writeOutput("Open ShiftMgmt > login screen > Account Recovery, then enter this recovery key.");
  writeOutput("The key cannot be viewed again from the database. Keep it in a safe place.");
  writeResultFile(0);
} catch (error) {
  outputLines.push(error instanceof Error ? error.message : String(error));
  writeResultFile(1);
  console.error(outputLines.at(-1));
  process.exitCode = 1;
} finally {
  database.close();
}
