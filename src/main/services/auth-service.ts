import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type { BridgeResult, SignInInput } from "../../shared/bridge/contracts";
import type { AuthSession, UserRole } from "../../shared/domain/model";

interface LocalUserAccount {
  id: string;
  loginId: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
}

const createPasswordHash = (password: string) => {
  const salt = "shiftmgmt-v3-4";
  return scryptSync(password, salt, 64).toString("hex");
};

const LOCAL_USERS: LocalUserAccount[] = [
  {
    id: "user-admin",
    loginId: "admin",
    displayName: "관리자",
    role: "admin",
    passwordHash: createPasswordHash("admin1234")
  },
  {
    id: "user-operator",
    loginId: "operator",
    displayName: "운영담당",
    role: "operator",
    passwordHash: createPasswordHash("operator1234")
  }
];

let currentSession: AuthSession | null = null;

const isPasswordValid = (password: string, passwordHash: string) => {
  const hashedInput = Buffer.from(createPasswordHash(password), "hex");
  const hashedStored = Buffer.from(passwordHash, "hex");

  return timingSafeEqual(hashedInput, hashedStored);
};

export const signIn = (input: SignInInput): BridgeResult<AuthSession> => {
  const user = LOCAL_USERS.find((account) => account.loginId === input.loginId);

  if (!user || !isPasswordValid(input.password, user.passwordHash)) {
    return {
      ok: false,
      errorCode: "AUTH_INVALID_CREDENTIALS",
      message: "로그인 ID 또는 비밀번호가 올바르지 않습니다."
    };
  }

  currentSession = {
    userId: user.id,
    loginId: user.loginId,
    role: user.role,
    displayName: user.displayName,
    expiresAt: new Date(Date.now() + (1000 * 60 * 60 * 8)).toISOString(),
    sessionToken: randomUUID()
  };

  return {
    ok: true,
    data: currentSession
  };
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
  data: currentSession
});

export const resetAuthStateForTest = () => {
  currentSession = null;
};
