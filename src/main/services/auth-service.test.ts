import { describe, expect, it } from "vitest";

import {
  getSession,
  resetAuthStateForTest,
  signIn,
  signOut
} from "./auth-service";

describe("auth-service", () => {
  it("should sign in with the seeded admin account", () => {
    resetAuthStateForTest();

    const result = signIn({
      loginId: "admin",
      password: "admin1234"
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.loginId).toBe("admin");
      expect(result.data.role).toBe("admin");
      expect(result.data.sessionToken).toBeTruthy();
    }
  });

  it("should reject invalid credentials", () => {
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

  it("should clear the session on sign out", () => {
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
