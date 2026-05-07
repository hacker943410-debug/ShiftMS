import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ADMIN_BOOTSTRAP_PASSWORD } from "../../shared/config/auth-password-policy";
import { findStoredOperationAuthByLoginId } from "./operations-storage-service";
import { resetAuthStateForTest, signIn } from "./auth-service";
import {
  getAccountRecoveryAvailability,
  recoverAdminAccount,
  rotateAdminAccountRecoveryKey
} from "./account-recovery-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

const authBootstrapEnv = {
  AUTH_BOOTSTRAP_ADMIN_PASSWORD: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD,
  AUTH_BOOTSTRAP_OPERATOR_PASSWORD: "operator1234",
  AUTH_BOOTSTRAP_REVIEWER_PASSWORD: "reviewer1234"
};

const initializeRecoveryTestDatabase = (name: string) => {
  initializeSqliteStorage({
    dbPath: path.resolve(process.cwd(), "artifacts", "tests", `${name}.sqlite`),
    env: authBootstrapEnv,
    userDataPath: path.resolve(process.cwd(), "artifacts", "tests", `${name}-user-data`)
  });
  resetAuthStateForTest();
};

describe("account-recovery-service", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetAuthStateForTest();
    resetSqliteStorageForTest();
  });

  it("should rotate and store only a hashed admin recovery key", () => {
    initializeRecoveryTestDatabase("account-recovery-rotate");

    expect(getAccountRecoveryAvailability()).toMatchObject({
      configured: false,
      adminLoginId: "admin"
    });

    const result = rotateAdminAccountRecoveryKey();

    expect(result.adminLoginId).toBe("admin");
    expect(result.recoveryKey).toMatch(/^SMR-[A-F0-9]{4}/);
    expect(getAccountRecoveryAvailability()).toMatchObject({
      configured: true,
      adminLoginId: "admin",
      issuedAt: result.issuedAt
    });

    const row = getSqliteDatabase()!.prepare(`
      SELECT account_recovery_key_hash
      FROM app_users
      WHERE login_id = 'admin'
    `).get() as { account_recovery_key_hash: string };

    expect(row.account_recovery_key_hash).not.toContain(result.recoveryKey);
    expect(row.account_recovery_key_hash.startsWith("scrypt:")).toBe(true);
  });

  it("should reset and unlock the admin account with a valid recovery key", async () => {
    initializeRecoveryTestDatabase("account-recovery-reset");
    const recoveryKey = rotateAdminAccountRecoveryKey().recoveryKey;

    for (let index = 0; index < 5; index += 1) {
      signIn({
        loginId: "admin",
        password: `wrong-password-${index}`
      });
    }

    expect(findStoredOperationAuthByLoginId("admin")?.signInLockedUntil).toBeTruthy();

    const result = await recoverAdminAccount({
      recoveryKey: recoveryKey.toLowerCase()
    });

    expect(result.adminLoginId).toBe("admin");
    expect(result.temporaryPassword).toMatch(/^Temp-/);
    expect(existsSync(result.backupPath)).toBe(true);
    expect(findStoredOperationAuthByLoginId("admin")?.signInLockedUntil).toBeUndefined();

    expect(
      signIn({
        loginId: "admin",
        password: result.temporaryPassword
      })
    ).toMatchObject({
      ok: true,
      data: {
        loginId: "admin",
        passwordChangeRequired: true
      }
    });
  });

  it("should lock recovery attempts after repeated invalid keys", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T09:00:00+09:00"));
    initializeRecoveryTestDatabase("account-recovery-lock");
    rotateAdminAccountRecoveryKey();

    for (let index = 0; index < 4; index += 1) {
      await expect(
        recoverAdminAccount({
          recoveryKey: `WRONG-${index}`
        })
      ).rejects.toThrow("계정복구키가 올바르지 않습니다.");
    }

    await expect(
      recoverAdminAccount({
        recoveryKey: "WRONG-FINAL"
      })
    ).rejects.toThrow("복구키 입력이 반복 실패하여 잠겼습니다.");

    expect(getAccountRecoveryAvailability().lockedUntil).toBeTruthy();
  });
});
