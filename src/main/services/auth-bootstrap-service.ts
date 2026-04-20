import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { DEFAULT_ADMIN_BOOTSTRAP_PASSWORD } from "../../shared/config/auth-password-policy";
import { resolveAppSettings } from "./app-settings-service";
import { seededOperationUsers } from "./auth-seed-users";

interface AuthBootstrapContext {
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
  userDataPath?: string;
}

interface BootstrapCredentialEntry {
  loginId: string;
  password: string;
}

interface BootstrapCredentialsFile {
  credentials: Record<string, BootstrapCredentialEntry>;
  generatedAt: string;
  retiredUserIds: string[];
  schemaVersion: 2;
}

interface EnsureAuthBootstrapCredentialsOptions {
  reactivateRetiredUsers?: boolean;
}

const BOOTSTRAP_CREDENTIALS_FILE_NAME = "bootstrap-credentials.json";
const seededOperationUserIdSet = new Set(seededOperationUsers.map((user) => user.id));

const BOOTSTRAP_PASSWORD_ENV_BY_USER_ID: Record<string, string> = {
  "user-admin": "AUTH_BOOTSTRAP_ADMIN_PASSWORD",
  "user-operator": "AUTH_BOOTSTRAP_OPERATOR_PASSWORD",
  "user-pending-review": "AUTH_BOOTSTRAP_REVIEWER_PASSWORD"
};

const DEFAULT_BOOTSTRAP_PASSWORD_BY_USER_ID: Partial<Record<string, string>> = {
  "user-admin": DEFAULT_ADMIN_BOOTSTRAP_PASSWORD
};

const createBootstrapPassword = () => {
  const token = randomBytes(12).toString("base64url");

  return `Sm!${token}7a`;
};

const resolveBootstrapCredentialsFilePath = (context: AuthBootstrapContext) => {
  if (!context.userDataPath && context.dbPath) {
    return path.resolve(path.dirname(context.dbPath), BOOTSTRAP_CREDENTIALS_FILE_NAME);
  }

  const settings = resolveAppSettings({
    userDataPath: context.userDataPath ?? process.cwd(),
    env: context.env
  });

  return path.resolve(settings.dataDir, BOOTSTRAP_CREDENTIALS_FILE_NAME);
};

const createEmptyBootstrapCredentialsFile = (): BootstrapCredentialsFile => ({
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  retiredUserIds: [],
  credentials: {}
});

const normalizeBootstrapCredentialEntry = (
  userId: string,
  entry: unknown
): BootstrapCredentialEntry | null => {
  if (!seededOperationUserIdSet.has(userId) || !entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Partial<BootstrapCredentialEntry>;
  const loginId = typeof record.loginId === "string" ? record.loginId.trim() : "";
  const password = typeof record.password === "string" ? record.password.trim() : "";

  if (!loginId || !password) {
    return null;
  }

  return {
    loginId,
    password
  };
};

const normalizeBootstrapCredentialsFile = (parsed: unknown): BootstrapCredentialsFile | null => {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const rawCredentials =
    record.credentials && typeof record.credentials === "object"
      ? (record.credentials as Record<string, unknown>)
      : null;

  if (!rawCredentials) {
    return null;
  }

  const credentials = Object.entries(rawCredentials).reduce<Record<string, BootstrapCredentialEntry>>(
    (result, [userId, entry]) => {
      const normalizedEntry = normalizeBootstrapCredentialEntry(userId, entry);

      if (normalizedEntry) {
        result[userId] = normalizedEntry;
      }

      return result;
    },
    {}
  );
  const generatedAt =
    typeof record.generatedAt === "string" && record.generatedAt.trim().length > 0
      ? record.generatedAt
      : new Date().toISOString();

  if (record.schemaVersion === 1) {
    return {
      schemaVersion: 2,
      generatedAt,
      retiredUserIds: [],
      credentials
    };
  }

  if (record.schemaVersion !== 2) {
    return null;
  }

  const retiredUserIds = Array.isArray(record.retiredUserIds)
    ? [...new Set(
        record.retiredUserIds
          .filter((userId): userId is string => typeof userId === "string")
          .map((userId) => userId.trim())
          .filter((userId) => seededOperationUserIdSet.has(userId))
      )].sort()
    : [];

  return {
    schemaVersion: 2,
    generatedAt,
    retiredUserIds,
    credentials
  };
};

const readBootstrapCredentialsFile = (filePath: string): BootstrapCredentialsFile | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return normalizeBootstrapCredentialsFile(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
};

const writeBootstrapCredentialsFile = (
  filePath: string,
  file: BootstrapCredentialsFile
) => {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
};

export const ensureAuthBootstrapCredentials = (
  context: AuthBootstrapContext,
  options?: EnsureAuthBootstrapCredentialsOptions
): {
  credentials: Record<string, BootstrapCredentialEntry>;
  filePath?: string;
} => {
  const env = context.env ?? process.env;
  const filePath = resolveBootstrapCredentialsFilePath(context);
  const file = readBootstrapCredentialsFile(filePath) ?? createEmptyBootstrapCredentialsFile();
  let shouldWriteFile = false;
  let usesFileCredentials = false;
  const resolvedCredentials: Record<string, BootstrapCredentialEntry> = {};
  const retiredUserIds = new Set(file.retiredUserIds);

  if (options?.reactivateRetiredUsers && retiredUserIds.size > 0) {
    retiredUserIds.clear();
    shouldWriteFile = true;
  }

  seededOperationUsers.forEach((user) => {
    const envPassword = env[BOOTSTRAP_PASSWORD_ENV_BY_USER_ID[user.id]]?.trim();
    const defaultPassword = DEFAULT_BOOTSTRAP_PASSWORD_BY_USER_ID[user.id];

    if (envPassword) {
      resolvedCredentials[user.id] = {
        loginId: user.loginId,
        password: envPassword
      };
      return;
    }

    const existingEntry = file.credentials[user.id];

    if (defaultPassword) {
      if (retiredUserIds.has(user.id) && !options?.reactivateRetiredUsers) {
        return;
      }

      if (existingEntry?.loginId !== user.loginId || existingEntry?.password !== defaultPassword) {
        file.credentials[user.id] = {
          loginId: user.loginId,
          password: defaultPassword
        };
        shouldWriteFile = true;
      }

      resolvedCredentials[user.id] = {
        loginId: user.loginId,
        password: defaultPassword
      };
      usesFileCredentials = true;
      retiredUserIds.delete(user.id);
      return;
    }

    if (existingEntry?.password?.trim()) {
      resolvedCredentials[user.id] = {
        loginId: user.loginId,
        password: existingEntry.password
      };
      usesFileCredentials = true;
      retiredUserIds.delete(user.id);
      return;
    }

    if (retiredUserIds.has(user.id) && !options?.reactivateRetiredUsers) {
      return;
    }

    const generatedPassword = createBootstrapPassword();
    file.credentials[user.id] = {
      loginId: user.loginId,
      password: generatedPassword
    };
    resolvedCredentials[user.id] = {
      loginId: user.loginId,
      password: generatedPassword
    };
    usesFileCredentials = true;
    retiredUserIds.delete(user.id);
    shouldWriteFile = true;
  });

  const normalizedRetiredUserIds = [...retiredUserIds].sort();

  if (file.retiredUserIds.join("\u0000") !== normalizedRetiredUserIds.join("\u0000")) {
    file.retiredUserIds = normalizedRetiredUserIds;
    shouldWriteFile = true;
  }

  if (shouldWriteFile) {
    if (usesFileCredentials || file.retiredUserIds.length > 0) {
      writeBootstrapCredentialsFile(filePath, file);
    } else {
      rmSync(filePath, { force: true });
    }
  }

  return {
    credentials: resolvedCredentials,
    filePath: usesFileCredentials ? filePath : undefined
  };
};

export const retireAuthBootstrapCredential = (
  context: AuthBootstrapContext,
  userId: string
) => {
  if (!seededOperationUserIdSet.has(userId)) {
    return;
  }

  const filePath = resolveBootstrapCredentialsFilePath(context);
  const file = readBootstrapCredentialsFile(filePath) ?? createEmptyBootstrapCredentialsFile();
  const retiredUserIds = new Set(file.retiredUserIds);

  delete file.credentials[userId];
  retiredUserIds.add(userId);
  file.retiredUserIds = [...retiredUserIds].sort();

  writeBootstrapCredentialsFile(filePath, file);
};

export const getAuthBootstrapCredentialsFilePath = (context: AuthBootstrapContext) =>
  ensureAuthBootstrapCredentials(context).filePath;

export const resetAuthBootstrapCredentialsFileForTest = (context: AuthBootstrapContext) => {
  rmSync(resolveBootstrapCredentialsFilePath(context), { force: true });
};
