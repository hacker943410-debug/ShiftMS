import { describe, expect, it, vi } from "vitest";
import { basename, dirname, join } from "node:path";

import {
  recoverOrphanedMigrationBackup,
  removeSqliteSidecars,
  replaceDatabaseFileAtomically
} from "./database-replacement-service";

const createRuntime = (input?: {
  initialPaths?: string[];
  failOnRename?: Array<[string, string]>;
}) => {
  const existingPaths = new Set(input?.initialPaths ?? []);
  const normalizeForCompare = (targetPath: string) => targetPath.replace(/\\/g, "/");
  const failOnRenameSet = new Set(
    (input?.failOnRename ?? []).map(([fromPath, toPath]) => `${fromPath}=>${toPath}`)
  );

  const runtime = {
    existsSync: vi.fn((targetPath: string) => existingPaths.has(targetPath)),
    readdirSync: vi.fn((targetPath: string) =>
      Array.from(existingPaths)
        .filter((existingPath) => normalizeForCompare(dirname(existingPath)) === normalizeForCompare(targetPath))
        .map((existingPath) => basename(existingPath))
    ),
    renameSync: vi.fn((fromPath: string, toPath: string) => {
      if (failOnRenameSet.has(`${fromPath}=>${toPath}`)) {
        throw new Error(`rename failed: ${fromPath} -> ${toPath}`);
      }

      existingPaths.delete(fromPath);
      existingPaths.add(toPath);
    }),
    rmSync: vi.fn((targetPath: string) => {
      existingPaths.delete(targetPath);
    })
  };

  return {
    runtime,
    existingPaths
  };
};

describe("database-replacement-service", () => {
  it("should remove wal and shm sidecars for a database path", () => {
    const { runtime } = createRuntime();

    removeSqliteSidecars("C:/data/shiftmgmt.sqlite", runtime);

    expect(runtime.rmSync).toHaveBeenCalledWith("C:/data/shiftmgmt.sqlite-wal", { force: true });
    expect(runtime.rmSync).toHaveBeenCalledWith("C:/data/shiftmgmt.sqlite-shm", { force: true });
  });

  it("should replace the current database and retain a recent migration backup after success", () => {
    const databasePath = "C:/data/shiftmgmt.sqlite";
    const tempDatabasePath = "C:/data/restore.sqlite";
    const { runtime, existingPaths } = createRuntime({
      initialPaths: [dirname(databasePath), databasePath, tempDatabasePath]
    });

    replaceDatabaseFileAtomically(databasePath, tempDatabasePath, runtime);

    expect(existingPaths.has(databasePath)).toBe(true);
    expect(existingPaths.has(tempDatabasePath)).toBe(false);
    // 복원에 문제가 있어도 되살릴 수 있도록 직전 데이터베이스는 보관 기간 동안 남긴다.
    expect(Array.from(existingPaths).some((value) => value.includes(".migration-backup-"))).toBe(true);
  });

  it("should clean up aged migration backups but keep the recent one on a successful replace", () => {
    const databasePath = "C:/data/shiftmgmt.sqlite";
    const tempDatabasePath = "C:/data/restore.sqlite";
    const agedBackupPath = join(
      dirname(databasePath),
      `${basename(databasePath)}.migration-backup-100`
    );
    const { runtime, existingPaths } = createRuntime({
      initialPaths: [dirname(databasePath), databasePath, tempDatabasePath, agedBackupPath]
    });

    replaceDatabaseFileAtomically(databasePath, tempDatabasePath, runtime);

    // 1970년 타임스탬프(100ms)는 보관 기간이 한참 지났으므로 정리된다.
    expect(existingPaths.has(agedBackupPath)).toBe(false);
    // 방금 만든 최근 백업은 보존된다.
    const retainedBackups = Array.from(existingPaths).filter((value) =>
      value.includes(".migration-backup-")
    );
    expect(retainedBackups).toHaveLength(1);
    expect(retainedBackups[0]).not.toBe(agedBackupPath);
  });

  it("should restore the original database when replacing the temp database fails", () => {
    const databasePath = "C:/data/shiftmgmt.sqlite";
    const tempDatabasePath = "C:/data/restore.sqlite";
    const { runtime, existingPaths } = createRuntime({
      initialPaths: [databasePath, tempDatabasePath],
      failOnRename: [[tempDatabasePath, databasePath]]
    });

    expect(() => replaceDatabaseFileAtomically(databasePath, tempDatabasePath, runtime)).toThrow(
      `rename failed: ${tempDatabasePath} -> ${databasePath}`
    );

    expect(existingPaths.has(databasePath)).toBe(true);
    expect(existingPaths.has(tempDatabasePath)).toBe(false);
    expect(Array.from(existingPaths).some((value) => value.includes(".migration-backup-"))).toBe(false);
  });

  it("should recover the latest orphaned migration backup when the database file is missing", () => {
    const databasePath = "C:/data/shiftmgmt.sqlite";
    const olderBackupPath = join(
      dirname(databasePath),
      `${basename(databasePath)}.migration-backup-100`
    );
    const latestBackupPath = join(
      dirname(databasePath),
      `${basename(databasePath)}.migration-backup-200`
    );
    const { runtime, existingPaths } = createRuntime({
      initialPaths: [dirname(databasePath), olderBackupPath, latestBackupPath]
    });

    const recoveredPath = recoverOrphanedMigrationBackup(databasePath, runtime);

    expect(recoveredPath).toBe(latestBackupPath);
    expect(existingPaths.has(databasePath)).toBe(true);
    expect(existingPaths.has(latestBackupPath)).toBe(false);
    expect(existingPaths.has(olderBackupPath)).toBe(true);
  });
});
