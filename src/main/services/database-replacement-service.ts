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

// 복원이 끝난 뒤 직전 데이터베이스를 즉시 삭제하지 않고 이 기간만큼 보관한다.
// 복원에 문제가 있어도 마지막으로 되살릴 수 있는 안전망을 남기기 위함이다.
export const MIGRATION_BACKUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const removeSqliteSidecars = (
  databasePath: string,
  runtime: DatabaseReplacementRuntime = defaultRuntime
) => {
  runtime.rmSync(`${databasePath}-wal`, { force: true });
  runtime.rmSync(`${databasePath}-shm`, { force: true });
};

// 보관 기간이 지난 과거 마이그레이션 백업만 정리한다(방금 만든 최근 백업은 보존).
export const cleanupAgedMigrationBackups = (
  databasePath: string,
  options: { retentionMs: number; now: number },
  runtime: DatabaseReplacementRuntime = defaultRuntime
) => {
  const databaseDirectory = dirname(databasePath);

  if (!runtime.existsSync(databaseDirectory)) {
    return;
  }

  const backupPrefix = `${basename(databasePath)}.migration-backup-`;

  runtime
    .readdirSync(databaseDirectory)
    .filter((fileName) => fileName.startsWith(backupPrefix))
    .forEach((fileName) => {
      const timestamp = Number(fileName.slice(backupPrefix.length));

      // 타임스탬프를 읽을 수 없는 항목은 보수적으로 보존한다.
      if (!Number.isFinite(timestamp) || options.now - timestamp <= options.retentionMs) {
        return;
      }

      const backupPath = join(databaseDirectory, fileName);
      removeSqliteSidecars(backupPath, runtime);
      runtime.rmSync(backupPath, { force: true });
    });
};

export const replaceDatabaseFileAtomically = (
  databasePath: string,
  tempDatabasePath: string,
  runtime: DatabaseReplacementRuntime = defaultRuntime
) => {
  const replacementNow = Date.now();
  const backupPath = `${databasePath}.migration-backup-${replacementNow}`;
  const hadExistingDatabase = runtime.existsSync(databasePath);

  removeSqliteSidecars(databasePath, runtime);
  removeSqliteSidecars(tempDatabasePath, runtime);

  if (hadExistingDatabase) {
    runtime.renameSync(databasePath, backupPath);
  }

  try {
    runtime.renameSync(tempDatabasePath, databasePath);
    // 직전 데이터베이스(backupPath)는 즉시 지우지 않고 보관 기간 동안 남겨 둔다.
    // 대신 보관 기간이 지난 과거 백업만 정리한다.
    cleanupAgedMigrationBackups(
      databasePath,
      { retentionMs: MIGRATION_BACKUP_RETENTION_MS, now: replacementNow },
      runtime
    );
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
