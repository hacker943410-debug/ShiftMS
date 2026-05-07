import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

import type {
  AccountRecoveryAvailability,
  AccountRecoveryInput,
  AccountRecoveryKeyRotationResult,
  AccountRecoveryResult
} from "../../shared/bridge/contracts";
import { accessLogActionLabels } from "../../shared/domain/access-log";
import { createSecretHash, isSecretHashValid } from "./auth-password-service";
import { recordAccessLog } from "./access-log-service";
import {
  changeStoredOperationAuthPassword,
  findStoredOperationAuthByLoginId
} from "./operations-storage-service";
import {
  getSqliteDatabase,
  getSqliteStorageContext,
  isSqliteStorageReady
} from "./sqlite-storage-service";

const ADMIN_LOGIN_ID = "admin";
const RECOVERY_KEY_GROUP_COUNT = 10;
const RECOVERY_KEY_GROUP_LENGTH = 4;
const RECOVERY_FAILURE_LOCK_THRESHOLD = 5;
const RECOVERY_FAILURE_LOCK_DURATION_MS = 1000 * 60 * 15;

interface AdminRecoveryRow {
  id: string;
  login_id: string;
  display_name: string;
  role: "admin" | "planner" | "reviewer" | "operator";
  status: "active" | "inactive" | "pending";
  account_recovery_key_hash?: string | null;
  account_recovery_key_issued_at?: string | null;
  account_recovery_failure_count?: number | null;
  account_recovery_locked_until?: string | null;
}

const getTimestampSegment = (date = new Date()) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(
    date.getMinutes()
  ).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;

const generateRecoveryKey = () => {
  const keyBody = Array.from({ length: RECOVERY_KEY_GROUP_COUNT }, () =>
    randomBytes(RECOVERY_KEY_GROUP_LENGTH / 2).toString("hex").toUpperCase()
  ).join("-");

  return `SMR-${keyBody}`;
};

const generateTemporaryPassword = () => `Temp-${randomBytes(9).toString("hex")}!A1`;

const normalizeRecoveryKey = (value: string) => String(value ?? "").trim().toUpperCase();

const parseActiveLock = (value: string | null | undefined, now: number) => {
  if (!value) {
    return null;
  }

  const lockedUntil = Date.parse(value);

  return Number.isNaN(lockedUntil) || lockedUntil <= now ? null : value;
};

const readAdminRecoveryRow = (): AdminRecoveryRow | null => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    return null;
  }

  findStoredOperationAuthByLoginId(ADMIN_LOGIN_ID);

  const row = database.prepare(`
    SELECT
      id,
      login_id,
      display_name,
      role,
      status,
      account_recovery_key_hash,
      account_recovery_key_issued_at,
      account_recovery_failure_count,
      account_recovery_locked_until
    FROM app_users
    WHERE login_id = ?
    LIMIT 1
  `).get(ADMIN_LOGIN_ID) as AdminRecoveryRow | undefined;

  return row ?? null;
};

const ensureAdminRecoveryRow = () => {
  const row = readAdminRecoveryRow();

  if (!row) {
    throw new Error("admin 계정을 찾을 수 없습니다.");
  }

  return row;
};

const setAdminRecoveryFailureState = (input: {
  adminUserId: string;
  failureCount: number;
  lockedUntil: string | null;
}) => {
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  database.prepare(`
    UPDATE app_users
    SET account_recovery_failure_count = ?,
        account_recovery_locked_until = ?,
        updated_at = ?
    WHERE id = ?
  `).run(input.failureCount, input.lockedUntil, new Date().toISOString(), input.adminUserId);
};

const clearAdminRecoveryFailureState = (adminUserId: string) => {
  setAdminRecoveryFailureState({
    adminUserId,
    failureCount: 0,
    lockedUntil: null
  });
};

const recordRecoveryFailure = (row: AdminRecoveryRow, now: number) => {
  const lockedUntil = row.account_recovery_locked_until
    ? Date.parse(row.account_recovery_locked_until)
    : null;
  const baseFailureCount =
    lockedUntil !== null && !Number.isNaN(lockedUntil) && lockedUntil <= now
      ? 0
      : Number(row.account_recovery_failure_count ?? 0);
  const nextFailureCount = baseFailureCount + 1;
  const nextLockedUntil =
    nextFailureCount >= RECOVERY_FAILURE_LOCK_THRESHOLD
      ? new Date(now + RECOVERY_FAILURE_LOCK_DURATION_MS).toISOString()
      : null;

  setAdminRecoveryFailureState({
    adminUserId: row.id,
    failureCount: nextFailureCount,
    lockedUntil: nextLockedUntil
  });

  return {
    failureCount: nextFailureCount,
    lockedUntil: nextLockedUntil
  };
};

const createSqliteFileBackup = async () => {
  const context = getSqliteStorageContext();
  const database = getSqliteDatabase();

  if (!context?.dbPath || !database || !isSqliteStorageReady()) {
    throw new Error("데이터베이스 백업 경로를 확인할 수 없습니다.");
  }

  const backupDirectory = path.resolve(path.dirname(context.dbPath), "account-recovery-backups");
  const backupPath = path.resolve(
    backupDirectory,
    `shiftmgmt-account-recovery-${getTimestampSegment()}.sqlite`
  );

  await mkdir(backupDirectory, { recursive: true });
  database.exec("PRAGMA wal_checkpoint(FULL);");
  await copyFile(context.dbPath, backupPath);

  for (const suffix of ["-wal", "-shm"]) {
    const sourcePath = `${context.dbPath}${suffix}`;

    if (existsSync(sourcePath)) {
      await copyFile(sourcePath, `${backupPath}${suffix}`);
    }
  }

  return backupPath;
};

export const getAccountRecoveryAvailability = (): AccountRecoveryAvailability => {
  const row = readAdminRecoveryRow();
  const now = Date.now();

  return {
    configured: Boolean(row?.account_recovery_key_hash),
    adminLoginId: row?.login_id ?? ADMIN_LOGIN_ID,
    issuedAt: row?.account_recovery_key_issued_at ?? undefined,
    lockedUntil: parseActiveLock(row?.account_recovery_locked_until, now) ?? undefined
  };
};

export const rotateAdminAccountRecoveryKey = (): AccountRecoveryKeyRotationResult => {
  const row = ensureAdminRecoveryRow();
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  const recoveryKey = generateRecoveryKey();
  const issuedAt = new Date().toISOString();

  database.prepare(`
    UPDATE app_users
    SET account_recovery_key_hash = ?,
        account_recovery_key_issued_at = ?,
        account_recovery_failure_count = 0,
        account_recovery_locked_until = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(createSecretHash(recoveryKey), issuedAt, issuedAt, row.id);

  return {
    adminLoginId: row.login_id,
    recoveryKey,
    issuedAt
  };
};

export const recoverAdminAccount = async (
  input: AccountRecoveryInput
): Promise<AccountRecoveryResult> => {
  const row = ensureAdminRecoveryRow();
  const now = Date.now();
  const activeLock = parseActiveLock(row.account_recovery_locked_until, now);
  const recoveryKey = normalizeRecoveryKey(input.recoveryKey);

  if (!row.account_recovery_key_hash) {
    throw new Error(
      "발급된 계정복구키가 없습니다. 운영 관리 > 사용자 관리에서 복구키를 먼저 발급하거나 유지보수 복구 스크립트를 사용하세요."
    );
  }

  if (activeLock) {
    throw new Error(`복구키 입력이 반복 실패하여 잠겼습니다. ${activeLock} 이후 다시 시도해 주세요.`);
  }

  if (!recoveryKey || !isSecretHashValid(recoveryKey, row.account_recovery_key_hash)) {
    const failure = recordRecoveryFailure(row, now);

    if (failure.lockedUntil) {
      throw new Error(
        `복구키 입력이 반복 실패하여 잠겼습니다. ${failure.lockedUntil} 이후 다시 시도해 주세요.`
      );
    }

    throw new Error("계정복구키가 올바르지 않습니다.");
  }

  const backupPath = await createSqliteFileBackup();
  const temporaryPassword = generateTemporaryPassword();
  const recoveredAt = new Date().toISOString();
  const database = getSqliteDatabase();

  if (!database || !isSqliteStorageReady()) {
    throw new Error("SQLite storage is not initialized.");
  }

  database.prepare(`
    UPDATE app_users
    SET status = 'active',
        updated_at = ?
    WHERE id = ?
  `).run(recoveredAt, row.id);

  changeStoredOperationAuthPassword({
    userId: row.id,
    nextPassword: temporaryPassword,
    mustChangePassword: true
  });
  clearAdminRecoveryFailureState(row.id);

  recordAccessLog(
    {
      actionType: "account-recovery",
      actionLabel: accessLogActionLabels["account-recovery"],
      routeKey: "login",
      routeLabel: "로그인",
      details: `admin 계정 복구 · DB 백업: ${backupPath}`
    },
    {
      userId: row.id,
      loginId: row.login_id,
      displayName: row.display_name,
      role: "admin"
    }
  );

  return {
    adminLoginId: row.login_id,
    temporaryPassword,
    backupPath,
    recoveredAt
  };
};
