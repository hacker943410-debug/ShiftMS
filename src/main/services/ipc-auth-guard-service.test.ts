import { describe, expect, it } from "vitest";

import type { BridgeResult } from "../../shared/bridge/contracts";
import type { AuthSession } from "../../shared/domain/model";

import {
  createAdminRequiredFailure,
  createPasswordChangeRequiredFailure,
  createRoleRequiredFailure,
  createSessionRequiredFailure,
  requireAdminSession,
  requireAuthenticatedSession,
  requireOperationalSession,
  requireRoleSession
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
    displayName: "愿由ъ옄",
    expiresAt: "2099-01-01T00:00:00.000Z",
    sessionToken: "admin-token",
    passwordChangeRequired: false
  };

  const operatorSession: AuthSession = {
    userId: "operator-user",
    loginId: "operator",
    role: "operator",
    displayName: "?댁쁺?대떦",
    expiresAt: "2099-01-01T00:00:00.000Z",
    sessionToken: "operator-token",
    passwordChangeRequired: false
  };

  const plannerSession: AuthSession = {
    ...operatorSession,
    userId: "planner-user",
    loginId: "planner",
    role: "planner",
    sessionToken: "planner-token"
  };

  const reviewerSession: AuthSession = {
    ...operatorSession,
    userId: "reviewer-user",
    loginId: "reviewer",
    role: "reviewer",
    sessionToken: "reviewer-token"
  };

  const passwordChangeRequiredSession: AuthSession = {
    ...operatorSession,
    passwordChangeRequired: true
  };

  const expiredSession: AuthSession = {
    ...operatorSession,
    expiresAt: "2000-01-01T00:00:00.000Z"
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

  it("blocks operational access until the password is changed", () => {
    expect(requireOperationalSession(createSessionResult(passwordChangeRequiredSession))).toEqual(
      createPasswordChangeRequiredFailure()
    );
  });

  it("rejects expired sessions even when a session object is present", () => {
    expect(requireAuthenticatedSession(createSessionResult(expiredSession))).toEqual(
      createSessionRequiredFailure()
    );
  });

  it("returns an admin required failure for non-admin users", () => {
    expect(requireAdminSession(createSessionResult(operatorSession))).toEqual(
      createAdminRequiredFailure()
    );
  });

  it("allows operators when the required role is operator", () => {
    expect(requireRoleSession(createSessionResult(operatorSession), "operator")).toEqual({
      ok: true,
      data: operatorSession
    });
  });

  it("allows specialized roles on their own action scope", () => {
    expect(requireRoleSession(createSessionResult(plannerSession), "planner")).toEqual({
      ok: true,
      data: plannerSession
    });
    expect(requireRoleSession(createSessionResult(reviewerSession), "reviewer")).toEqual({
      ok: true,
      data: reviewerSession
    });
  });

  it("blocks cross-role access between planner and reviewer", () => {
    expect(requireRoleSession(createSessionResult(plannerSession), "reviewer")).toEqual(
      createRoleRequiredFailure("reviewer")
    );
    expect(requireRoleSession(createSessionResult(reviewerSession), "planner")).toEqual(
      createRoleRequiredFailure("planner")
    );
  });

  it("returns a role failure when the required role is not satisfied", () => {
    expect(requireRoleSession(createSessionResult(operatorSession), "admin")).toEqual(
      createRoleRequiredFailure("admin")
    );
  });

  it("returns the current session for admins", () => {
    expect(requireAdminSession(createSessionResult(adminSession))).toEqual({
      ok: true,
      data: adminSession
    });
  });
});
