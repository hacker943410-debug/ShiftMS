import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface DatabaseReplacementRuntime {
  existsSync: (targetPath: string) => boolean;
  readdirSync: (targetPath: string) => string[];
  renameSync: (fromPath: string, toPath: string) => void;
  rmSync: (targetPath: string, options: { force: true }) => void;
}

const defaultRuntime: DatabaseReplacementRuntime = {
  existsSync: (targetPath) => existsSync(targetPath),
  readdirSync: (targetPath) => readdirSync(targetPath),
  renameSync: (fromPath, toPath) => renameSync(fromPath, toPath),
  rmSync: (targetPath, options) => rmSync(targetPath, options)
};

export const removeSqliteSidecars = (
  databasePath: string,
  runtime: DatabaseReplacementRuntime = defaultRuntime
) => {
  runtime.rmSync(`${databasePath}-wal`, { force: true });
  runtime.rmSync(`${databasePath}-shm`, { force: true });
};

export const replaceDatabaseFileAtomically = (
  databasePath: string,
  tempDatabasePath: string,
  runtime: DatabaseReplacementRuntime = defaultRuntime
) => {
  const backupPath = `${databasePath}.migration-backup-${Date.now()}`;
  const hadExistingDatabase = runtime.existsSync(databasePath);

  removeSqliteSidecars(databasePath, runtime);
  removeSqliteSidecars(tempDatabasePath, runtime);

  if (hadExistingDatabase) {
    runtime.renameSync(databasePath, backupPath);
  }

  try {
    runtime.renameSync(tempDatabasePath, databasePath);
    removeSqliteSidecars(backupPath, runtime);
    runtime.rmSync(backupPath, { force: true });
  } catch (error) {
    if (!runtime.existsSync(databasePath) && hadExistingDatabase && runtime.existsSync(backupPath)) {
      runtime.renameSync(backupPath, databasePath);
    }

    throw error;
  } finally {
    removeSqliteSidecars(tempDatabasePath, runtime);
    runtime.rmSync(tempDatabasePath, { force: true });
  }
};

export const recoverOrphanedMigrationBackup = (
  databasePath: string,
  runtime: DatabaseReplacementRuntime = defaultRuntime
) => {
  if (runtime.existsSync(databasePath)) {
    return null;
  }

  const databaseDirectory = dirname(databasePath);

  if (!runtime.existsSync(databaseDirectory)) {
    return null;
  }

  const backupPrefix = `${basename(databasePath)}.migration-backup-`;
  const backupFileName = runtime
    .readdirSync(databaseDirectory)
    .filter((fileName) => fileName.startsWith(backupPrefix))
    .sort((left, right) => {
      const leftTimestamp = Number(left.slice(backupPrefix.length));
      const rightTimestamp = Number(right.slice(backupPrefix.length));

      if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)) {
        return rightTimestamp - leftTimestamp;
      }

      return right.localeCompare(left);
    })[0];

  if (!backupFileName) {
    return null;
  }

  const backupPath = join(databaseDirectory, backupFileName);

  removeSqliteSidecars(databasePath, runtime);
  runtime.renameSync(backupPath, databasePath);

  return backupPath;
};
