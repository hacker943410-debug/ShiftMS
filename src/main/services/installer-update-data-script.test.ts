import {
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
    backupRoot: string,
    roamingAppData: string,
    rescueRoot?: string
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
        "-BackupRoot",
        backupRoot,
        "-RoamingAppData",
        roamingAppData,
        ...(rescueRoot ? ["-RescueRoot", rescueRoot] : [])
      ],
      { encoding: "utf8" }
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

  it("parks the safety copy where it outlives the installer when the restore cannot finish", () => {
    const stage = createStage();

    stage.write("data/accounts.json", "ACCOUNTS");
    stage.write("data/sub/report.json", "REPORT");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The install left a FILE where the backup expects a folder, so the copy stops partway.
    rmSync(path.join(stage.userDataDir, "data", "sub"), { force: true, recursive: true });
    writeFileSync(path.join(stage.userDataDir, "data", "sub"), "NOT-A-FOLDER", "utf8");

    const rescueRoot = path.join(stage.roamingAppData, "..", "rescue");
    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData, rescueRoot);

    expect(result.status).not.toBe(0);
    // The installer's own backup folder is deleted the moment the installer exits, so a copy that
    // outlives it is the only thing standing between a half-finished restore and lost data.
    expect(existsSync(rescueRoot)).toBe(true);
    expect(
      readdirSync(rescueRoot).some((stamp) =>
        existsSync(path.join(rescueRoot, stamp, "ShiftMgmt", "data", "sub", "report.json"))
      )
    ).toBe(true);
  }, 30_000);
});
