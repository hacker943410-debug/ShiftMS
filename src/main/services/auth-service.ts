import { randomUUID } from "node:crypto";

import type {
  AuthPasswordChangeInput,
  BridgeResult,
  SignInInput
} from "../../shared/bridge/contracts";
import { AUTH_SESSION_DURATION_MS } from "../../shared/config/auth-session-policy";
import type { AuthSession } from "../../shared/domain/model";
import { isPasswordHashValid } from "./auth-password-service";
import { retireAuthBootstrapCredential } from "./auth-bootstrap-service";
import {
  changeStoredOperationAuthPassword,
  clearStoredOperationAuthFailures,
  findStoredOperationAuthByLoginId,
  findStoredOperationAuthByUserId,
  recordStoredOperationAuthFailure
} from "./operations-storage-service";
import { getSqliteStorageContext } from "./sqlite-storage-service";

let currentSession: AuthSession | null = null;

const createSessionExpiration = (now: number) =>
  new Date(now + AUTH_SESSION_DURATION_MS).toISOString();

const buildInvalidCredentialsFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_INVALID_CREDENTIALS",
  message: "로그인 ID 또는 비밀번호가 올바르지 않습니다."
});

const buildSessionRequiredFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_SESSION_REQUIRED",
  message: "로그인 세션이 필요합니다."
});

const buildAccountLockedFailure = (lockedUntil: string): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_ACCOUNT_LOCKED",
  message: `로그인 시도가 너무 많아 계정이 잠겼습니다. ${lockedUntil} 이후 다시 시도해 주세요.`
});

const buildCurrentPasswordFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_INVALID_CREDENTIALS",
  message: "현재 비밀번호가 올바르지 않습니다."
});

const buildPasswordReuseFailure = (): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_PASSWORD_REUSED",
  message: "새 비밀번호는 현재 비밀번호와 달라야 합니다."
});

const buildPasswordPolicyFailure = (message: string): BridgeResult<AuthSession> => ({
  ok: false,
  errorCode: "AUTH_PASSWORD_POLICY_FAILED",
  message
});

const parseSessionExpiration = (session: AuthSession) => {
  const expiresAt = Date.parse(session.expiresAt);

  return Number.isNaN(expiresAt) ? null : expiresAt;
};

const resolveActiveSession = (input?: {
  now?: number;
  renew?: boolean;
}) => {
  if (!currentSession) {
    return null;
  }

  const now = input?.now ?? Date.now();
  const expiresAt = parseSessionExpiration(currentSession);

  if (expiresAt === null || expiresAt <= now) {
    currentSession = null;
    return null;
  }

  if (input?.renew) {
    currentSession = {
      ...currentSession,
      expiresAt: createSessionExpiration(now)
    };
  }

  return currentSession;
};

const createSession = (input: {
  userId: string;
  loginId: string;
  role: AuthSession["role"];
  displayName: string;
  passwordChangeRequired: boolean;
}): AuthSession => ({
  userId: input.userId,
  loginId: input.loginId,
  role: input.role,
  displayName: input.displayName,
  expiresAt: createSessionExpiration(Date.now()),
  sessionToken: randomUUID(),
  passwordChangeRequired: input.passwordChangeRequired
});

export const signIn = (input: SignInInput): BridgeResult<AuthSession> => {
  const now = Date.now();
  const user = findStoredOperationAuthByLoginId(input.loginId);
  const lockedUntil =
    user?.signInLockedUntil && Date.parse(user.signInLockedUntil) > now
      ? user.signInLockedUntil
      : undefined;

  if (lockedUntil) {
    return buildAccountLockedFailure(lockedUntil);
  }

  if (
    !user ||
    user.status !== "active" ||
    !user.passwordHash ||
    !isPasswordHashValid(input.password, user.passwordHash)
  ) {
    if (user && user.status === "active" && user.passwordHash) {
      const updatedUser = recordStoredOperationAuthFailure(user.id, now);

      if (updatedUser?.signInLockedUntil && Date.parse(updatedUser.signInLockedUntil) > now) {
        return buildAccountLockedFailure(updatedUser.signInLockedUntil);
      }
    }

    return buildInvalidCredentialsFailure();
  }

  clearStoredOperationAuthFailures(user.id);

  currentSession = createSession({
    userId: user.id,
    loginId: user.loginId,
    role: user.role,
    displayName: user.displayName,
    passwordChangeRequired: user.mustChangePassword
  });

  return {
    ok: true,
    data: currentSession
  };
};

export const changePassword = (
  input: AuthPasswordChangeInput
): BridgeResult<AuthSession> => {
  const activeSession = resolveActiveSession();

  if (!activeSession) {
    return buildSessionRequiredFailure();
  }

  const user = findStoredOperationAuthByUserId(activeSession.userId);

  if (!user || user.status !== "active" || !user.passwordHash) {
    currentSession = null;
    return buildSessionRequiredFailure();
  }

  if (!isPasswordHashValid(input.currentPassword, user.passwordHash)) {
    return buildCurrentPasswordFailure();
  }

  if (input.currentPassword === input.nextPassword) {
    return buildPasswordReuseFailure();
  }

  try {
    const updatedUser = changeStoredOperationAuthPassword({
      userId: user.id,
      nextPassword: input.nextPassword,
      mustChangePassword: false
    });

    if (user.mustChangePassword) {
      try {
        retireAuthBootstrapCredential(getSqliteStorageContext() ?? {}, user.id);
      } catch (error) {
        console.error("Failed to retire bootstrap credential after password change.", error);
      }
    }

    currentSession = createSession({
      userId: updatedUser.id,
      loginId: updatedUser.loginId,
      role: updatedUser.role,
      displayName: updatedUser.displayName,
      passwordChangeRequired: false
    });

    return {
      ok: true,
      data: currentSession
    };
  } catch (error) {
    return buildPasswordPolicyFailure(error instanceof Error ? error.message : String(error));
  }
};

export const signOut = (): BridgeResult<null> => {
  currentSession = null;

  return {
    ok: true,
    data: null
  };
};

export const getSession = (): BridgeResult<AuthSession | null> => ({
  ok: true,
  data: resolveActiveSession()
});

export const getSessionWithRenewal = (): BridgeResult<AuthSession | null> => ({
  ok: true,
  data: resolveActiveSession({
    renew: true
  })
});

export const resetAuthStateForTest = () => {
  currentSession = null;
};
