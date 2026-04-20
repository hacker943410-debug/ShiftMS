import { describe, expect, it } from "vitest";

import { getPasswordPolicyErrorMessage } from "../../shared/config/auth-password-policy";

import {
  createBootstrapPasswordHash,
  isPasswordHashValid,
  validatePasswordInput
} from "./auth-password-service";

describe("auth-password-service", () => {
  it("accepts passwords that satisfy the strengthened policy", () => {
    expect(() => validatePasswordInput("Valid-Pass-123!")).not.toThrow();
  });

  it("rejects passwords that do not satisfy the strengthened policy", () => {
    expect(() => validatePasswordInput("valid-pass-123!")).toThrowError(
      getPasswordPolicyErrorMessage("비밀번호")
    );
  });

  it("allows bootstrap passwords to use the relaxed bootstrap policy", () => {
    const passwordHash = createBootstrapPasswordHash("1234");

    expect(isPasswordHashValid("1234", passwordHash)).toBe(true);
  });
});
