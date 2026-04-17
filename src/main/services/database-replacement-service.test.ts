import { describe, expect, it, vi } from "vitest";

import {
  removeSqliteSidecars,
  replaceDatabaseFileAtomically
} from "./database-replacement-service";

const createRuntime = (input?: {
  initialPaths?: string[];
  failOnRename?: Array<[string, string]>;
}) => {
  const existingPaths = new Set(input?.initialPaths ?? []);
  const failOnRenameSet = new Set(
    (input?.failOnRename ?? []).map(([fromPath, toPath]) => `${fromPath}=>${toPath}`)
  );

  const runtime = {
    existsSync: vi.fn((targetPath: string) => existingPaths.has(targetPath)),
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

  it("should replace the current database and remove the migration backup after success", () => {
    const databasePath = "C:/data/shiftmgmt.sqlite";
    const tempDatabasePath = "C:/data/restore.sqlite";
    const { runtime, existingPaths } = createRuntime({
      initialPaths: [databasePath, tempDatabasePath]
    });

    replaceDatabaseFileAtomically(databasePath, tempDatabasePath, runtime);

    expect(existingPaths.has(databasePath)).toBe(true);
    expect(existingPaths.has(tempDatabasePath)).toBe(false);
    expect(Array.from(existingPaths).some((value) => value.includes(".migration-backup-"))).toBe(false);
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
});
