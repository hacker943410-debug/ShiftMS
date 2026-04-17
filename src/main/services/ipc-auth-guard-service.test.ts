import { describe, expect, it } from "vitest";

import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";

import {
  createAdminRequiredFailure,
  createSessionRequiredFailure,
  requireAdminSession,
  requireAuthenticatedSession
} from "./ipc-auth-guard-service";

const createSessionResult = (
  session: AuthSession | null
): BridgeResult<AuthSession | null> => ({
  ok: true,
  data: session
});

describe("ipc-auth-guard-service", () => {
  const adminSession: AuthSession = {
    userId: "admin-user",
    loginId: "admin",
    role: "admin",
    displayName: "관리자",
    expiresAt: "2099-01-01T00:00:00.000Z",
    sessionToken: "admin-token"
  };

  const operatorSession: AuthSession = {
    userId: "operator-user",
    loginId: "operator",
    role: "operator",
    displayName: "운영담당",
    expiresAt: "2099-01-01T00:00:00.000Z",
    sessionToken: "operator-token"
  };

  it("returns a session required failure when the session is missing", () => {
    expect(requireAuthenticatedSession(createSessionResult(null))).toEqual(
      createSessionRequiredFailure()
    );
  });

  it("returns the current session when authentication is satisfied", () => {
    expect(requireAuthenticatedSession(createSessionResult(adminSession))).toEqual({
      ok: true,
      data: adminSession
    });
  });

  it("returns an admin required failure for non-admin users", () => {
    expect(requireAdminSession(createSessionResult(operatorSession))).toEqual(
      createAdminRequiredFailure()
    );
  });

  it("returns the current session for admins", () => {
    expect(requireAdminSession(createSessionResult(adminSession))).toEqual({
      ok: true,
      data: adminSession
    });
  });
});
