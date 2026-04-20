import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import {
  getPasswordPolicyErrorMessage,
  isStrongPasswordSatisfied,
  MIN_BOOTSTRAP_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH
} from "../../shared/config/auth-password-policy";

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const PASSWORD_HASH_PREFIX = "scrypt";

const isAsciiWhitespaceOnly = (value: string) => value.trim().length === 0;

export const validatePasswordInput = (
  password: string,
  label = "비밀번호",
  input?: {
    minimumLength?: number;
    requireStrongPolicy?: boolean;
  }
) => {
  const minimumLength = input?.minimumLength ?? MIN_PASSWORD_LENGTH;
  const requireStrongPolicy = input?.requireStrongPolicy ?? minimumLength >= MIN_PASSWORD_LENGTH;

  if (password.length < minimumLength || isAsciiWhitespaceOnly(password)) {
    if (requireStrongPolicy) {
      throw new Error(getPasswordPolicyErrorMessage(label));
    }

    throw new Error(`${label}는 ${minimumLength}자 이상이어야 합니다.`);
  }

  if (requireStrongPolicy && !isStrongPasswordSatisfied(password)) {
    throw new Error(getPasswordPolicyErrorMessage(label));
  }
};

export const createPasswordHash = (
  password: string,
  input?: {
    label?: string;
    minimumLength?: number;
    requireStrongPolicy?: boolean;
  }
) => {
  validatePasswordInput(password, input?.label, {
    minimumLength: input?.minimumLength,
    requireStrongPolicy: input?.requireStrongPolicy
  });

  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, PASSWORD_KEY_BYTES).toString("hex");

  return `${PASSWORD_HASH_PREFIX}:${salt}:${hash}`;
};

export const isPasswordHashValid = (password: string, passwordHash: string) => {
  const [prefix, salt, storedHash] = String(passwordHash).split(":");

  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !storedHash) {
    return false;
  }

  const hashedInput = Buffer.from(
    scryptSync(password, salt, PASSWORD_KEY_BYTES).toString("hex"),
    "hex"
  );
  const hashedStored = Buffer.from(storedHash, "hex");

  if (hashedInput.length !== hashedStored.length) {
    return false;
  }

  return timingSafeEqual(hashedInput, hashedStored);
};

export const createBootstrapPasswordHash = (password: string, label = "초기 비밀번호") =>
  createPasswordHash(password, {
    label,
    minimumLength: MIN_BOOTSTRAP_PASSWORD_LENGTH,
    requireStrongPolicy: false
  });
