import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ADMIN_BOOTSTRAP_PASSWORD } from "../../shared/config/auth-password-policy";

import {
  changePassword,
  getSession,
  getSessionWithRenewal,
  resetAuthStateForTest,
  signIn,
  signOut
} from "./auth-service";
import { getAuthBootstrapCredentialsFilePath } from "./auth-bootstrap-service";
import {
  findStoredOperationAuthByLoginId,
  saveStoredOperationUser
} from "./operations-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

const authBootstrapEnv = {
  AUTH_BOOTSTRAP_ADMIN_PASSWORD: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD,
  AUTH_BOOTSTRAP_OPERATOR_PASSWORD: "operator1234",
  AUTH_BOOTSTRAP_REVIEWER_PASSWORD: "reviewer1234"
};

describe("auth-service", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetAuthStateForTest();
    resetSqliteStorageForTest();
  });

  it("should sign in with the seeded admin account", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    const result = signIn({
      loginId: "admin",
      password: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.loginId).toBe("admin");
      expect(result.data.role).toBe("admin");
      expect(result.data.sessionToken).toBeTruthy();
      expect(result.data.passwordChangeRequired).toBe(true);
    }
  });

  it("should rotate the bootstrap password after a successful password change", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    expect(
      signIn({
        loginId: "admin",
        password: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD
      })
    ).toMatchObject({
      ok: true,
      data: {
        passwordChangeRequired: true
      }
    });

    const changeResult = changePassword({
      currentPassword: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD,
      nextPassword: "AdminChanged123!"
    });

    expect(changeResult).toMatchObject({
      ok: true
    });

    if (changeResult.ok) {
      expect(changeResult.data.passwordChangeRequired).toBe(false);
    }

    signOut();

    expect(
      signIn({
        loginId: "admin",
        password: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD
      })
    ).toMatchObject({
      ok: false,
      errorCode: "AUTH_INVALID_CREDENTIALS"
    });

    expect(
      signIn({
        loginId: "admin",
        password: "AdminChanged123!"
      })
    ).toMatchObject({
      ok: true,
      data: {
        passwordChangeRequired: false
      }
    });
  });

  it("should reject password change when the current password is incorrect", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    signIn({
      loginId: "operator",
      password: "operator1234"
    });

    expect(
      changePassword({
        currentPassword: "wrong-current-password",
        nextPassword: "OperatorChanged123!"
      })
    ).toMatchObject({
      ok: false,
      errorCode: "AUTH_INVALID_CREDENTIALS"
    });
  });

  it("should retire the seeded bootstrap file entry after the first password change", () => {
    const userDataPath = path.resolve(
      process.cwd(),
      "artifacts",
      "tests",
      "auth-service-bootstrap-user-data"
    );

    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: {
        DATA_DIR: "./data"
      },
      userDataPath
    });
    resetAuthStateForTest();

    const bootstrapFilePath = getAuthBootstrapCredentialsFilePath({
      userDataPath,
      env: {
        DATA_DIR: "./data"
      }
    });
    const bootstrapFile = JSON.parse(readFileSync(bootstrapFilePath!, "utf8")) as {
      credentials: Record<string, { loginId: string; password: string }>;
      retiredUserIds: string[];
    };
    const adminBootstrapPassword = bootstrapFile.credentials["user-admin"].password;

    expect(
      signIn({
        loginId: "admin",
        password: adminBootstrapPassword
      })
    ).toMatchObject({
      ok: true,
      data: {
        passwordChangeRequired: true
      }
    });

    expect(
      changePassword({
        currentPassword: adminBootstrapPassword,
        nextPassword: "AdminRotatedFromFile123!"
      })
    ).toMatchObject({
      ok: true
    });

    const updatedBootstrapFile = JSON.parse(readFileSync(bootstrapFilePath!, "utf8")) as {
      credentials: Record<string, { loginId: string; password: string }>;
      retiredUserIds: string[];
    };

    expect(updatedBootstrapFile.credentials["user-admin"]).toBeUndefined();
    expect(updatedBootstrapFile.retiredUserIds).toContain("user-admin");
  });

  it("should reject invalid credentials", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    const result = signIn({
      loginId: "admin",
      password: "wrong-password"
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "AUTH_INVALID_CREDENTIALS"
    });
  });

  it("should lock the account after repeated invalid password attempts and release it after the cooldown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T09:00:00+09:00"));

    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    for (let index = 0; index < 4; index += 1) {
      expect(
        signIn({
          loginId: "admin",
          password: `wrong-password-${index}`
        })
      ).toMatchObject({
        ok: false,
        errorCode: "AUTH_INVALID_CREDENTIALS"
      });
    }

    expect(findStoredOperationAuthByLoginId("admin")?.signInFailureCount).toBe(4);

    expect(
      signIn({
        loginId: "admin",
        password: "wrong-password-final"
      })
    ).toMatchObject({
      ok: false,
      errorCode: "AUTH_ACCOUNT_LOCKED"
    });

    const lockedUser = findStoredOperationAuthByLoginId("admin");
    expect(lockedUser?.signInFailureCount).toBe(5);
    expect(lockedUser?.signInLockedUntil).toBeTruthy();

    expect(
      signIn({
        loginId: "admin",
        password: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD
      })
    ).toMatchObject({
      ok: false,
      errorCode: "AUTH_ACCOUNT_LOCKED"
    });

    vi.advanceTimersByTime(1000 * 60 * 15);

    const successResult = signIn({
      loginId: "admin",
      password: DEFAULT_ADMIN_BOOTSTRAP_PASSWORD
    });

    expect(successResult.ok).toBe(true);
    expect(findStoredOperationAuthByLoginId("admin")?.signInFailureCount).toBe(0);
    expect(findStoredOperationAuthByLoginId("admin")?.signInLockedUntil).toBeUndefined();
  });

  it("should clear prior failure counts after a successful login", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    signIn({
      loginId: "operator",
      password: "wrong-password-1"
    });
    signIn({
      loginId: "operator",
      password: "wrong-password-2"
    });

    expect(findStoredOperationAuthByLoginId("operator")?.signInFailureCount).toBe(2);

    expect(
      signIn({
        loginId: "operator",
        password: "operator1234"
      })
    ).toMatchObject({
      ok: true
    });

    expect(findStoredOperationAuthByLoginId("operator")?.signInFailureCount).toBe(0);
    expect(findStoredOperationAuthByLoginId("operator")?.signInLockedUntil).toBeUndefined();
  });

  it("should clear the session after the expiration time passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T09:00:00+09:00"));

    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    expect(
      signIn({
        loginId: "operator",
        password: "operator1234"
      })
    ).toMatchObject({
      ok: true
    });

    vi.advanceTimersByTime(1000 * 60 * 60 * 8 + 1);

    expect(getSession()).toEqual({
      ok: true,
      data: null
    });
  });

  it("should renew the session expiration for authenticated main-process access", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T09:00:00+09:00"));

    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    const signInResult = signIn({
      loginId: "operator",
      password: "operator1234"
    });

    expect(signInResult.ok).toBe(true);

    if (!signInResult.ok) {
      return;
    }

    const originalExpiresAt = signInResult.data.expiresAt;

    vi.advanceTimersByTime(1000 * 60 * 60 * 7);

    const renewedSession = getSessionWithRenewal();

    expect(renewedSession.ok).toBe(true);

    if (!renewedSession.ok) {
      return;
    }

    expect(renewedSession.data?.loginId).toBe("operator");
    expect(renewedSession.data?.sessionToken).toBe(signInResult.data.sessionToken);
    expect(Date.parse(renewedSession.data!.expiresAt)).toBeGreaterThan(Date.parse(originalExpiresAt));
  });

  it("should reject non-active users even when the password matches", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();

    saveStoredOperationUser({
      loginId: "inactive-user",
      displayName: "비활성 사용자",
      role: "operator",
      status: "inactive",
      password: "Inactive-Pass-123!"
    });

    expect(
      signIn({
        loginId: "inactive-user",
        password: "Inactive-Pass-123!"
      })
    ).toMatchObject({
      ok: false,
      errorCode: "AUTH_INVALID_CREDENTIALS"
    });
  });

  it("should clear the session on sign out", () => {
    initializeSqliteStorage({
      dbPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service.test.sqlite"),
      env: authBootstrapEnv,
      userDataPath: path.resolve(process.cwd(), "artifacts", "tests", "auth-service-user-data")
    });
    resetAuthStateForTest();
    signIn({
      loginId: "operator",
      password: "operator1234"
    });

    expect(getSession()).toMatchObject({
      ok: true,
      data: {
        loginId: "operator"
      }
    });

    expect(signOut()).toEqual({
      ok: true,
      data: null
    });
    expect(getSession()).toEqual({
      ok: true,
      data: null
    });
  });
});
