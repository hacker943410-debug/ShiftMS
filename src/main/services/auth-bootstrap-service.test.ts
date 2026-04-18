import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureAuthBootstrapCredentials,
  getAuthBootstrapCredentialsFilePath,
  retireAuthBootstrapCredential,
  resetAuthBootstrapCredentialsFileForTest
} from "./auth-bootstrap-service";

const testUserDataPath = path.resolve(process.cwd(), "artifacts", "tests", "auth-bootstrap-user-data");
const bootstrapCredentialsFilePath = path.resolve(
  testUserDataPath,
  "data",
  "bootstrap-credentials.json"
);

afterEach(() => {
  resetAuthBootstrapCredentialsFileForTest({
    userDataPath: testUserDataPath
  });
  rmSync(testUserDataPath, { force: true, recursive: true });
});

describe("auth-bootstrap-service", () => {
  it("should generate a per-install bootstrap credentials file when env passwords are absent", () => {
    const result = ensureAuthBootstrapCredentials({
      userDataPath: testUserDataPath,
      env: {
        DATA_DIR: "./data"
      }
    });

    const filePath = getAuthBootstrapCredentialsFilePath({
      userDataPath: testUserDataPath,
      env: {
        DATA_DIR: "./data"
      }
    });

    expect(result.filePath).toBe(filePath);
    expect(filePath).toBeTruthy();
    expect(existsSync(filePath!)).toBe(true);
    expect(Object.keys(result.credentials)).toEqual([
      "user-admin",
      "user-operator",
      "user-pending-review"
    ]);

    const fileContents = JSON.parse(readFileSync(filePath!, "utf8")) as {
      credentials: Record<string, { loginId: string; password: string }>;
    };

    expect(fileContents.credentials["user-admin"].loginId).toBe("admin");
    expect(fileContents.credentials["user-admin"].password.length).toBeGreaterThanOrEqual(10);
  });

  it("should prefer explicit env bootstrap passwords without creating a file", () => {
    const result = ensureAuthBootstrapCredentials({
      userDataPath: testUserDataPath,
      env: {
        AUTH_BOOTSTRAP_ADMIN_PASSWORD: "admin-env-1234",
        AUTH_BOOTSTRAP_OPERATOR_PASSWORD: "operator-env-1234",
        AUTH_BOOTSTRAP_REVIEWER_PASSWORD: "reviewer-env-1234"
      }
    });

    expect(result.filePath).toBeUndefined();
    expect(result.credentials["user-admin"].password).toBe("admin-env-1234");
    expect(
      existsSync(
        bootstrapCredentialsFilePath
      )
    ).toBe(false);
  });

  it("should retire a used bootstrap credential without regenerating it on the next read", () => {
    ensureAuthBootstrapCredentials({
      userDataPath: testUserDataPath,
      env: {
        DATA_DIR: "./data"
      }
    });

    retireAuthBootstrapCredential(
      {
        userDataPath: testUserDataPath,
        env: {
          DATA_DIR: "./data"
        }
      },
      "user-admin"
    );

    const retiredFile = JSON.parse(readFileSync(bootstrapCredentialsFilePath, "utf8")) as {
      credentials: Record<string, { loginId: string; password: string }>;
      retiredUserIds: string[];
    };

    expect(retiredFile.credentials["user-admin"]).toBeUndefined();
    expect(retiredFile.retiredUserIds).toContain("user-admin");

    const nextResult = ensureAuthBootstrapCredentials({
      userDataPath: testUserDataPath,
      env: {
        DATA_DIR: "./data"
      }
    });

    expect(nextResult.credentials["user-admin"]).toBeUndefined();
    expect(nextResult.credentials["user-operator"]).toBeTruthy();
  });

  it("should reactivate retired bootstrap credentials when a fresh seed explicitly requests them", () => {
    ensureAuthBootstrapCredentials({
      userDataPath: testUserDataPath,
      env: {
        DATA_DIR: "./data"
      }
    });
    retireAuthBootstrapCredential(
      {
        userDataPath: testUserDataPath,
        env: {
          DATA_DIR: "./data"
        }
      },
      "user-admin"
    );

    const reactivated = ensureAuthBootstrapCredentials(
      {
        userDataPath: testUserDataPath,
        env: {
          DATA_DIR: "./data"
        }
      },
      {
        reactivateRetiredUsers: true
      }
    );

    expect(reactivated.credentials["user-admin"]).toBeTruthy();

    const reactivatedFile = JSON.parse(readFileSync(bootstrapCredentialsFilePath, "utf8")) as {
      credentials: Record<string, { loginId: string; password: string }>;
      retiredUserIds: string[];
    };

    expect(reactivatedFile.credentials["user-admin"]).toBeTruthy();
    expect(reactivatedFile.retiredUserIds).not.toContain("user-admin");
  });
});
