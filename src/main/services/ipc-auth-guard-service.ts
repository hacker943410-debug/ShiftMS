import type { BridgeFailure, BridgeResult } from "../../shared/bridge/contracts";
import { hasRequiredRole } from "../../shared/domain/authorization";
import type { AuthSession, UserRole } from "../../shared/domain/model";

const createBridgeFailure = (errorCode: string, message: string): BridgeFailure => ({
  ok: false,
  errorCode,
  message
});

export const createSessionRequiredFailure = (): BridgeFailure =>
  createBridgeFailure("AUTH_SESSION_REQUIRED", "濡쒓렇???몄뀡???꾩슂?⑸땲??");

export const createPasswordChangeRequiredFailure = (): BridgeFailure =>
  createBridgeFailure("AUTH_PASSWORD_CHANGE_REQUIRED", "鍮꾨?踰덊샇瑜?癒쇱? 蹂寃쏀빐 二쇱꽭??");

export const createAdminRequiredFailure = (): BridgeFailure =>
  createBridgeFailure("AUTH_FORBIDDEN", "愿由ъ옄 沅뚰븳???꾩슂?⑸땲??");

export const createRoleRequiredFailure = (requiredRole: UserRole): BridgeFailure =>
  requiredRole === "admin"
    ? createAdminRequiredFailure()
    : createBridgeFailure("AUTH_FORBIDDEN", "?ъ슜??沅뚰븳???꾩슂?⑸땲??");

const isSessionExpired = (session: AuthSession) => {
  const expiresAt = Date.parse(session.expiresAt);

  return Number.isNaN(expiresAt) || expiresAt <= Date.now();
};

export const requireAuthenticatedSession = (
  sessionResult: BridgeResult<AuthSession | null>
): BridgeResult<AuthSession> => {
  if (!sessionResult.ok || !sessionResult.data) {
    return createSessionRequiredFailure();
  }

  if (isSessionExpired(sessionResult.data)) {
    return createSessionRequiredFailure();
  }

  return {
    ok: true,
    data: sessionResult.data
  };
};

export const requireOperationalSession = (
  sessionResult: BridgeResult<AuthSession | null>
): BridgeResult<AuthSession> => {
  const authenticatedResult = requireAuthenticatedSession(sessionResult);

  if (!authenticatedResult.ok) {
    return authenticatedResult;
  }

  if (authenticatedResult.data.passwordChangeRequired) {
    return createPasswordChangeRequiredFailure();
  }

  return authenticatedResult;
};

export const requireRoleSession = (
  sessionResult: BridgeResult<AuthSession | null>,
  requiredRole: UserRole
): BridgeResult<AuthSession> => {
  const authenticatedResult = requireOperationalSession(sessionResult);

  if (!authenticatedResult.ok) {
    return authenticatedResult;
  }

  if (!hasRequiredRole(authenticatedResult.data.role, requiredRole)) {
    return createRoleRequiredFailure(requiredRole);
  }

  return authenticatedResult;
};

export const requireAdminSession = (
  sessionResult: BridgeResult<AuthSession | null>
): BridgeResult<AuthSession> => requireRoleSession(sessionResult, "admin");
