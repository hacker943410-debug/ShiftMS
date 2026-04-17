import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveConfiguredAccessSourceState,
  resolveConfiguredMigrationFilePath,
  resolveDatabaseMigrationInput
} from "./database-file-policy-service";

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "database-file-policy");

describe("database-file-policy-service", () => {
  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should resolve a configured relative migration path against the data directory", () => {
    const dataDir = path.resolve(testRoot, "data");
    const sourcePath = path.resolve(dataDir, "migration", "source.accdb");

    expect(
      resolveConfiguredMigrationFilePath({
        dataDir,
        migrationFilePath: path.relative(dataDir, sourcePath)
      })
    ).toBe(sourcePath);
  });

  it("should classify configured access source directories as not-file", () => {
    const dataDir = path.resolve(testRoot, "data");
    const sourceDirectoryPath = path.resolve(dataDir, "migration.accdb");

    mkdirSync(sourceDirectoryPath, { recursive: true });

    expect(
      resolveConfiguredAccessSourceState({
        dataDir,
        migrationFilePath: path.relative(dataDir, sourceDirectoryPath)
      })
    ).toEqual({
      status: "not-file",
      filePath: sourceDirectoryPath
    });
  });

  it("should reject directory inputs and accept supported migration files", () => {
    const migrationDirectoryPath = path.resolve(testRoot, "migration-dir");
    const jsonFilePath = path.resolve(testRoot, "backup.json");

    mkdirSync(migrationDirectoryPath, { recursive: true });
    writeFileSync(jsonFilePath, JSON.stringify({ tables: {} }, null, 2), "utf8");

    expect(() =>
      resolveDatabaseMigrationInput({
        migrationFilePath: migrationDirectoryPath
      })
    ).toThrow("복원 경로가 파일이 아닙니다.");

    expect(
      resolveDatabaseMigrationInput({
        migrationFilePath: jsonFilePath
      })
    ).toMatchObject({
      migrationFilePath: jsonFilePath,
      sourceType: "json",
      extension: ".json"
    });
  });
});
