import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const PASSWORD_HASH_PREFIX = "scrypt";
const MIN_PASSWORD_LENGTH = 8;

const isAsciiWhitespaceOnly = (value: string) => value.trim().length === 0;

export const validatePasswordInput = (password: string, label = "비밀번호") => {
  if (password.length < MIN_PASSWORD_LENGTH || isAsciiWhitespaceOnly(password)) {
    throw new Error(`${label}는 8자 이상이어야 합니다.`);
  }
};

export const createPasswordHash = (password: string) => {
  validatePasswordInput(password);

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
