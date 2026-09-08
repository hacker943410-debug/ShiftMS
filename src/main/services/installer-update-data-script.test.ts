import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

const describeIfWindows = process.platform === "win32" ? describe : describe.skip;

const scriptPath = path.resolve(
  process.cwd(),
  "build",
  "installer-update-data.ps1"
);

describeIfWindows("installer-update-data.ps1", () => {
  const createdRoots: string[] = [];

  afterEach(() => {
    createdRoots.splice(0).forEach((rootPath) => {
      rmSync(rootPath, { force: true, recursive: true });
    });
  });

  const runScript = (
    mode: "Backup" | "Restore",
    backupRoot: string | null,
    roamingAppData: string,
    localAppData?: string
  ) =>
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Mode",
        mode,
        ...(backupRoot ? ["-BackupRoot", backupRoot] : []),
        "-RoamingAppData",
        roamingAppData
      ],
      {
        encoding: "utf8",
        ...(localAppData ? { env: { ...process.env, LOCALAPPDATA: localAppData } } : {})
      }
    );

  const createStage = () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "shiftmgmt-installer-update-data-")
    );

    createdRoots.push(tempRoot);

    const roamingAppData = path.join(tempRoot, "AppData", "Roaming");
    const userDataDir = path.join(roamingAppData, "ShiftMgmt");

    return {
      roamingAppData,
      userDataDir,
      backupRoot: path.join(tempRoot, "backup-root"),
      write: (relativePath: string, contents: string) => {
        const target = path.join(userDataDir, relativePath);

        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, contents, "utf8");

        return target;
      }
    };
  };

  it("backs up and restores the packaged user data directory", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "shiftmgmt-installer-update-data-")
    );
    const roamingAppData = path.join(tempRoot, "AppData", "Roaming");
    const userDataDir = path.join(roamingAppData, "ShiftMgmt");
    const backupRoot = path.join(tempRoot, "backup-root");
    const markerPath = path.join(userDataDir, "data", "marker.json");

    createdRoots.push(tempRoot);
    mkdirSync(path.dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, '{"ok":true}\n', "utf8");

    const backupResult = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Mode",
        "Backup",
        "-BackupRoot",
        backupRoot,
        "-RoamingAppData",
        roamingAppData
      ],
      {
        encoding: "utf8"
      }
    );

    expect(backupResult.status).toBe(0);
    expect(existsSync(path.join(backupRoot, "ShiftMgmt", "data", "marker.json"))).toBe(true);

    rmSync(userDataDir, { force: true, recursive: true });

    const restoreResult = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Mode",
        "Restore",
        "-BackupRoot",
        backupRoot,
        "-RoamingAppData",
        roamingAppData
      ],
      {
        encoding: "utf8"
      }
    );

    expect(restoreResult.status).toBe(0);
    expect(readFileSync(markerPath, "utf8")).toContain('"ok":true');
    expect(existsSync(backupRoot)).toBe(false);
  }, 30_000);

  it("leaves a database that survived the install exactly as it is", () => {
    const stage = createStage();
    const databasePath = stage.write("data/shiftmgmt.sqlite", "BEFORE-UPDATE");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The install replaces app files under Program Files and never touches %APPDATA%, so by
    // restore time the live database is the one the operator has been using. Made distinguishable
    // from the pre-install copy here.
    writeFileSync(databasePath, "AFTER-UPDATE", "utf8");

    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Putting the pre-install copy back would move every approval and wage row the operator has
    // backwards to whatever the file held at the moment the installer started.
    expect(readFileSync(databasePath, "utf8")).toBe("AFTER-UPDATE");
  }, 30_000);

  it("fills in only what the install left missing, and keeps what it added", () => {
    const stage = createStage();
    const keptPath = stage.write("data/shiftmgmt.sqlite", "LIVE");
    const missingPath = stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    rmSync(missingPath, { force: true });
    const addedPath = stage.write("data/added-by-update.json", "NEW");

    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    expect(readFileSync(missingPath, "utf8")).toBe("ACCOUNTS");
    expect(readFileSync(keptPath, "utf8")).toBe("LIVE");
    // Deleting the live folder before copying - the old behaviour - would have taken this with it.
    expect(existsSync(addedPath)).toBe(true);
    expect(existsSync(stage.backupRoot)).toBe(false);
  }, 30_000);

  it("never pairs a live database with a write-ahead log from the backup", () => {
    const stage = createStage();
    const databasePath = stage.write("data/shiftmgmt.sqlite", "LIVE");
    const walPath = stage.write("data/shiftmgmt.sqlite-wal", "STALE-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // SQLite removes the log on a clean close, so the live database can outlive its own -wal.
    rmSync(walPath, { force: true });

    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Restoring the log on its own would hand SQLite a database and a journal that never belonged
    // together. The database is untouched, so the log it no longer has must stay gone.
    expect(existsSync(walPath)).toBe(false);
    expect(readFileSync(databasePath, "utf8")).toBe("LIVE");
  }, 30_000);

  it("brings back a missing database with the commits that only its write-ahead log holds", () => {
    const stage = createStage();
    const databasePath = path.join(stage.userDataDir, "data", "shiftmgmt.sqlite");

    mkdirSync(path.dirname(databasePath), { recursive: true });

    const database = new DatabaseSync(databasePath);

    database.exec("PRAGMA journal_mode = WAL");
    database.exec("CREATE TABLE approvals (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)");
    // The schema goes into the database file itself; the approval below stays in the log, exactly
    // as it does on an operator's machine between checkpoints.
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.exec("INSERT INTO approvals (id, amount) VALUES (1, 42)");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    database.close();
    // The install lost the whole live folder - the case the backup exists for.
    rmSync(stage.userDataDir, { force: true, recursive: true });

    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const restored = new DatabaseSync(databasePath);

    try {
      // Restoring the database without its log used to return [] here: the approval was committed,
      // the script exited 0, and the backup was deleted on the way out.
      expect(restored.prepare("SELECT amount FROM approvals ORDER BY id").all()).toEqual([
        { amount: 42 }
      ]);
    } finally {
      restored.close();
    }
  }, 30_000);

  it("leaves the backup where it is when the restore cannot finish", () => {
    const stage = createStage();

    stage.write("data/accounts.json", "ACCOUNTS");
    stage.write("data/sub/report.json", "REPORT");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The install left a FILE where the backup expects a folder, so the copy stops partway.
    rmSync(path.join(stage.userDataDir, "data", "sub"), { force: true, recursive: true });
    writeFileSync(path.join(stage.userDataDir, "data", "sub"), "NOT-A-FOLDER", "utf8");

    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).not.toBe(0);

    // The installer points the operator at this folder when it reports the failure, so the file the
    // restore never managed to put back has to still be sitting in it. Copying the backup somewhere
    // safe AFTER the failure was the earlier design, and that copy can fail too - exactly when it
    // is needed. Nothing is copied now; the backup simply is not deleted.
    expect(readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "sub", "report.json"), "utf8")).toBe(
      "REPORT"
    );
  }, 30_000);

  it("keeps a backup whose restore never finished instead of writing over it", () => {
    const stage = createStage();

    stage.write("data/sub/report.json", "ONLY-COPY");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // That restore fails partway, so its backup stays behind holding the only copy of ONLY-COPY.
    rmSync(path.join(stage.userDataDir, "data", "sub"), { force: true, recursive: true });
    writeFileSync(path.join(stage.userDataDir, "data", "sub"), "NOT-A-FOLDER", "utf8");

    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).not.toBe(0);

    // The next update runs and backs up the live folder - which no longer holds that file.
    rmSync(path.join(stage.userDataDir, "data", "sub"), { force: true });
    stage.write("data/sub/report.json", "REPLACED");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Writing the new backup over the old one would have destroyed the only copy of ONLY-COPY.
    const keptRoots = readdirSync(path.dirname(stage.backupRoot)).filter((name) =>
      name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
    );

    expect(keptRoots).toHaveLength(1);
    expect(
      readFileSync(
        path.join(
          path.dirname(stage.backupRoot),
          keptRoots[0]!,
          "ShiftMgmt",
          "data",
          "sub",
          "report.json"
        ),
        "utf8"
      )
    ).toBe("ONLY-COPY");
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "sub", "report.json"), "utf8")
    ).toBe("REPLACED");
  }, 30_000);

  it("refuses to finish when the backup holds a log with no database to put it beside", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "LIVE");
    stage.write("data/shiftmgmt.sqlite-wal", "WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Backup skips a file it cannot read one at a time, so a backup can end up holding the log
    // without the database itself.
    rmSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), { force: true });
    rmSync(stage.userDataDir, { force: true, recursive: true });

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    // Putting the log back on its own leaves a folder SQLite cannot open, and exiting 0 would
    // report that as a finished restore - then delete the backup on the way out.
    expect(result.status).not.toBe(0);
    expect(existsSync(path.join(stage.userDataDir, "data", "shiftmgmt.sqlite-wal"))).toBe(false);
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 30_000);

  it("refuses a log the live folder still has when neither side has its database", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "LIVE");
    stage.write("data/shiftmgmt.sqlite-wal", "WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Neither side has the database, and the log is sitting at the destination already. Deciding
    // file by file skipped it as "already there" and never reached the database question at all.
    rmSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), { force: true });
    rmSync(path.join(stage.userDataDir, "data", "shiftmgmt.sqlite"), { force: true });

    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).not.toBe(0);
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 30_000);

  it("never pairs a restored database with a log the install left behind", () => {
    const stage = createStage();
    const databasePath = path.join(stage.userDataDir, "data", "shiftmgmt.sqlite");

    mkdirSync(path.dirname(databasePath), { recursive: true });

    const backed = new DatabaseSync(databasePath);

    backed.exec("PRAGMA journal_mode = WAL");
    backed.exec("CREATE TABLE approvals (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)");
    backed.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    backed.exec("INSERT INTO approvals (id, amount) VALUES (1, 42)");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);
    backed.close();

    // A different run of the database leaves its own log behind while the .sqlite itself is gone.
    // Built beside the real one and copied over while still open, because a clean close is exactly
    // what removes a log - the state being reproduced here is one that never got a clean close.
    const strayPath = path.join(stage.userDataDir, "data", "stray.sqlite");
    const stray = new DatabaseSync(strayPath);

    stray.exec("PRAGMA journal_mode = WAL");
    stray.exec("CREATE TABLE approvals (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)");
    stray.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    stray.exec("INSERT INTO approvals (id, amount) VALUES (1, 99)");

    rmSync(databasePath, { force: true });
    copyFileSync(`${strayPath}-wal`, `${databasePath}-wal`);
    copyFileSync(`${strayPath}-shm`, `${databasePath}-shm`);

    const strayLog = readFileSync(`${databasePath}-wal`);

    stray.close();
    rmSync(strayPath, { force: true });

    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}-wal`)).toBe(true);
    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The stray log was already at the destination, so deciding file by file skipped it and left it
    // beside the restored database - a pairing that reads back values neither of them ever held.
    expect(existsSync(`${databasePath}-wal`) && readFileSync(`${databasePath}-wal`).equals(strayLog)).toBe(
      false
    );

    const restored = new DatabaseSync(databasePath);

    try {
      expect(restored.prepare("SELECT amount FROM approvals ORDER BY id").all()).toEqual([
        { amount: 42 }
      ]);
    } finally {
      restored.close();
    }
  }, 30_000);

  it("keeps every backup that still holds a file the live folder is missing", () => {
    const stage = createStage();

    stage.write("data/unique-recovery.txt", "ONLY-COPY");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Its restore never ran, and that file is gone from the live folder - so this backup is the
    // only place it exists. Three more updates follow.
    rmSync(path.join(stage.userDataDir, "data", "unique-recovery.txt"), { force: true });
    stage.write("data/other.txt", "OTHER");

    for (let round = 0; round < 3; round += 1) {
      expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);
    }

    // Keeping only the three newest deleted exactly this on the fourth round, and exited 0.
    const keptRoots = readdirSync(path.dirname(stage.backupRoot)).filter((name) =>
      name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
    );
    const survivors = keptRoots.filter((name) =>
      existsSync(
        path.join(
          path.dirname(stage.backupRoot),
          name,
          "ShiftMgmt",
          "data",
          "unique-recovery.txt"
        )
      )
    );

    expect(survivors).toHaveLength(1);
  }, 30_000);

  it("drops a kept backup once the live folder holds everything it was keeping", () => {
    const stage = createStage();

    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);
    // Its restore never ran, but nothing in it is missing from the live folder, so it can no
    // longer put anything back - restore never overwrites what is already there.
    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const keptRoots = readdirSync(path.dirname(stage.backupRoot)).filter((name) =>
      name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
    );

    expect(keptRoots).toHaveLength(0);
  }, 30_000);

  it("puts the backup in the user's own local folder rather than a shared one", () => {
    const stage = createStage();
    const localAppData = path.join(stage.roamingAppData, "..", "Local");

    stage.write("data/accounts.json", "ACCOUNTS");
    mkdirSync(localAppData, { recursive: true });

    // No -BackupRoot: the script decides. NSIS cannot be trusted to pass one, because an all-users
    // install resolves its $LOCALAPPDATA to C:\ProgramData - readable by every local user and
    // shared between them, while this backup holds the accounts and the database.
    expect(runScript("Backup", null, stage.roamingAppData, localAppData).status).toBe(0);

    expect(
      readFileSync(
        path.join(localAppData, "ShiftMgmt-update-backup", "ShiftMgmt", "data", "accounts.json"),
        "utf8"
      )
    ).toBe("ACCOUNTS");
  }, 30_000);
});
