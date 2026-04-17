import { existsSync, renameSync, rmSync } from "node:fs";

export interface DatabaseReplacementRuntime {
  existsSync: (targetPath: string) => boolean;
  renameSync: (fromPath: string, toPath: string) => void;
  rmSync: (targetPath: string, options: { force: true }) => void;
}

const defaultRuntime: DatabaseReplacementRuntime = {
  existsSync: (targetPath) => existsSync(targetPath),
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
