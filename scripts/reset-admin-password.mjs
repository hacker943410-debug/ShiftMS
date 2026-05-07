#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const saltBytes = 16;
const keyBytes = 64;

const args = process.argv.slice(2);
const readArg = (name) => {
  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] : undefined;
};

const resolveDefaultDbPath = () => {
  const appData = process.env.APPDATA;

  return appData ? path.resolve(appData, "ShiftMgmt", "data", "shiftmgmt.sqlite") : null;
};

const dbPathInput = readArg("--db") ?? resolveDefaultDbPath();
const dbPath = dbPathInput ? path.resolve(dbPathInput) : null;

if (!dbPath || !existsSync(dbPath)) {
  console.error("Usage: node scripts/reset-admin-password.mjs --db <shiftmgmt.sqlite> [--password <new-password>]");
  console.error("Could not find the database file.");
  process.exit(1);
}

const generatedPassword = `Temp-${randomBytes(9).toString("hex")}!A1`;
const nextPassword = readArg("--password") ?? generatedPassword;

if (
  nextPassword.length < 8 ||
  !/[A-Z]/.test(nextPassword) ||
  !/[a-z]/.test(nextPassword) ||
  !/[0-9]/.test(nextPassword) ||
  !/[^A-Za-z0-9]/.test(nextPassword)
) {
  console.error("The password must include uppercase, lowercase, number, and special characters.");
  process.exit(1);
}

const createPasswordHash = (password) => {
  const salt = randomBytes(saltBytes).toString("hex");
  const hash = scryptSync(password, salt, keyBytes).toString("hex");

  return `scrypt:${salt}:${hash}`;
};

const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
const backupDirectory = path.resolve(path.dirname(dbPath), "account-recovery-backups");
const backupPath = path.resolve(backupDirectory, `shiftmgmt-maintenance-reset-${timestamp}.sqlite`);

mkdirSync(backupDirectory, { recursive: true });

const database = new DatabaseSync(dbPath);

try {
  const admin = database.prepare(`
    SELECT id, login_id
    FROM app_users
    WHERE login_id = 'admin'
    LIMIT 1
  `).get();

  if (!admin) {
    throw new Error("admin account was not found.");
  }

  database.exec("PRAGMA wal_checkpoint(FULL);");
  copyFileSync(dbPath, backupPath);

  database.prepare(`
    UPDATE app_users
    SET password_hash = ?,
        must_change_password = 1,
        sign_in_failure_count = 0,
        sign_in_locked_until = NULL,
        status = 'active',
        updated_at = ?
    WHERE id = ?
  `).run(createPasswordHash(nextPassword), new Date().toISOString(), String(admin.id));

  console.log("Admin account reset completed.");
  console.log(`Database backup: ${backupPath}`);
  console.log(`Login ID: ${admin.login_id}`);
  console.log(`Temporary password: ${nextPassword}`);
  console.log("Sign in with the temporary password, then change it immediately.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  database.close();
}
