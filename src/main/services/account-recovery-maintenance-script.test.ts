import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { isSecretHashValid } from "./auth-password-service";

describe("issue-account-recovery-key maintenance script", () => {
  const createdRoots: string[] = [];

  afterEach(() => {
    createdRoots.splice(0).forEach((rootPath) => {
      rmSync(rootPath, { force: true, recursive: true });
    });
  });

  it("backs up the db, adds missing recovery columns, and stores only the key hash", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-recovery-key-"));
    const dbPath = path.join(tempRoot, "shiftmgmt.sqlite");
    const scriptPath = path.resolve(process.cwd(), "scripts", "issue-account-recovery-key.mjs");
    createdRoots.push(tempRoot);

    const database = new DatabaseSync(dbPath);
    database.exec(`
      CREATE TABLE app_users (
        id TEXT PRIMARY KEY,
        login_id TEXT NOT NULL UNIQUE,
        updated_at TEXT
      );
      INSERT INTO app_users (id, login_id, updated_at)
      VALUES ('admin-user', 'admin', '2026-05-07T00:00:00.000Z');
    `);
    database.close();

    const result = spawnSync(process.execPath, [scriptPath, "--db", dbPath], {
      encoding: "utf8"
    });

    expect(result.status).toBe(0);

    const recoveryKey = result.stdout.match(/Recovery key: (SMR(?:-[A-F0-9]{4}){10})/)?.[1];
    const backupPath = result.stdout.match(/Database backup: (.+)/)?.[1]?.trim();

    expect(recoveryKey).toBeTruthy();
    expect(backupPath && existsSync(backupPath)).toBe(true);

    const verifyDatabase = new DatabaseSync(dbPath);
    const row = verifyDatabase.prepare(`
      SELECT
        account_recovery_key_hash,
        account_recovery_key_issued_at,
        account_recovery_failure_count,
        account_recovery_locked_until
      FROM app_users
      WHERE login_id = 'admin'
      LIMIT 1
    `).get() as {
      account_recovery_key_hash: string;
      account_recovery_key_issued_at: string;
      account_recovery_failure_count: number;
      account_recovery_locked_until: string | null;
    };
    verifyDatabase.close();

    expect(row.account_recovery_key_hash).not.toContain(String(recoveryKey));
    expect(isSecretHashValid(String(recoveryKey), row.account_recovery_key_hash)).toBe(true);
    expect(row.account_recovery_key_issued_at).toBeTruthy();
    expect(row.account_recovery_failure_count).toBe(0);
    expect(row.account_recovery_locked_until).toBeNull();
  }, 30_000);
});
