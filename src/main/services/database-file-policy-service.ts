import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { AppSettingsSnapshot } from "../../shared/bridge/contracts";
import {
  resolveDatabaseMigrationSourceType,
  type DatabaseMigrationSourceType
} from "../../shared/domain/database-migration";

type DatabaseMigrationExtension = ".accdb" | ".json";

type ConfiguredMigrationPathSettings = Pick<AppSettingsSnapshot, "migrationFilePath" | "dataDir">;

export type ConfiguredAccessSourceState =
  | { status: "missing-config" }
  | { status: "not-access"; filePath: string }
  | { status: "missing-file"; filePath: string }
  | { status: "not-file"; filePath: string }
  | { status: "ready"; filePath: string };

const toDatabaseMigrationExtension = (
  sourceType: DatabaseMigrationSourceType
): DatabaseMigrationExtension => (sourceType === "json" ? ".json" : ".accdb");

export const resolveConfiguredMigrationFilePath = (settings: ConfiguredMigrationPathSettings) => {
  const migrationFilePath = settings.migrationFilePath.trim();

  if (!migrationFilePath) {
    return "";
  }

  return path.isAbsolute(migrationFilePath)
    ? migrationFilePath
    : path.resolve(settings.dataDir, migrationFilePath);
};

export const resolveConfiguredAccessSourceState = (
  settings: ConfiguredMigrationPathSettings
): ConfiguredAccessSourceState => {
  const filePath = resolveConfiguredMigrationFilePath(settings);

  if (!filePath) {
    return { status: "missing-config" };
  }

  if (resolveDatabaseMigrationSourceType(filePath) !== "access") {
    return {
      status: "not-access",
      filePath
    };
  }

  if (!existsSync(filePath)) {
    return {
      status: "missing-file",
      filePath
    };
  }

  if (!statSync(filePath).isFile()) {
    return {
      status: "not-file",
      filePath
    };
  }

  return {
    status: "ready",
    filePath
  };
};

export const resolveDatabaseMigrationInput = (input: { migrationFilePath: string }) => {
  const trimmedMigrationFilePath = input.migrationFilePath.trim();

  if (!trimmedMigrationFilePath) {
    throw new Error("복원 파일 경로를 입력하세요.");
  }

  const migrationFilePath = path.resolve(trimmedMigrationFilePath);

  if (!existsSync(migrationFilePath)) {
    throw new Error("복원 파일을 찾을 수 없습니다.");
  }

  if (!statSync(migrationFilePath).isFile()) {
    throw new Error("복원 경로가 파일이 아닙니다.");
  }

  const sourceType = resolveDatabaseMigrationSourceType(migrationFilePath);

  if (!sourceType) {
    throw new Error(
      "지원하지 않는 복원 파일 형식입니다. JSON 백업(.json) 또는 Access DB(.accdb)만 사용할 수 있습니다."
    );
  }

  return {
    migrationFilePath,
    sourceType,
    extension: toDatabaseMigrationExtension(sourceType)
  };
};
