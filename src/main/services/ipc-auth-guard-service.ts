import type { BridgeFailure, BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";

const createBridgeFailure = (errorCode: string, message: string): BridgeFailure => ({
  ok: false,
  errorCode,
  message
});

export const createSessionRequiredFailure = (): BridgeFailure =>
  createBridgeFailure("AUTH_SESSION_REQUIRED", "로그인 세션이 필요합니다.");

export const createAdminRequiredFailure = (): BridgeFailure =>
  createBridgeFailure("AUTH_FORBIDDEN", "관리자 권한이 필요합니다.");

export const requireAuthenticatedSession = (
  sessionResult: BridgeResult<AuthSession | null>
): BridgeResult<AuthSession> => {
  if (!sessionResult.ok || !sessionResult.data) {
    return createSessionRequiredFailure();
  }

  return {
    ok: true,
    data: sessionResult.data
  };
};

export const requireAdminSession = (
  sessionResult: BridgeResult<AuthSession | null>
): BridgeResult<AuthSession> => {
  const authenticatedResult = requireAuthenticatedSession(sessionResult);

  if (!authenticatedResult.ok) {
    return authenticatedResult;
  }

  if (authenticatedResult.data.role !== "admin") {
    return createAdminRequiredFailure();
  }

  return authenticatedResult;
};
