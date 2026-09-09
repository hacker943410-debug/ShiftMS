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

// SHIFTMGMT_PS1_PATH points this suite at another copy of the script - typically an older one
// extracted with `git show <sha>:build/installer-update-data.ps1 > prefix.ps1` - so proving that a
// regression test really fails against pre-fix code is an environment variable rather than an edit
// of this committed line that somebody then has to remember to revert.
const scriptPath =
  process.env.SHIFTMGMT_PS1_PATH ??
  path.resolve(process.cwd(), "build", "installer-update-data.ps1");

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
    const failedUpdates = 5;

    // In every backup and never removed from the live folder, so it can never be the reason a
    // backup is kept.
    stage.write("data/accounts.json", "ACCOUNTS");

    for (let update = 1; update <= failedUpdates; update += 1) {
      stage.write(`data/unrecovered-${update}.txt`, `ONLY-COPY-${update}`);

      expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

      // That update failed: its restore never ran and the file is gone from the live folder, so
      // this backup is now the only place it exists.
      rmSync(path.join(stage.userDataDir, "data", `unrecovered-${update}.txt`), {
        force: true
      });
    }

    // One more failed update, so the last backup above is moved aside as well.
    stage.write("data/unrecovered-final.txt", "ONLY-COPY-FINAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    rmSync(path.join(stage.userDataDir, "data", "unrecovered-final.txt"), { force: true });

    // The invariant, not one constant: a kept backup holding a file the live folder lacks is never
    // deleted - not by age and not by count. Five is above both the keep-3 rule this replaces and a
    // keep-4 written in its place. Recovery is checked by CONTENT, so deduplicating by path cannot
    // satisfy it with an empty or truncated file, and the number of kept roots is checked too, so
    // a rule that keeps the folder but empties it fails as well.
    const parent = path.dirname(stage.backupRoot);
    const keptRoots = readdirSync(parent).filter((name) =>
      name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
    );
    const recoverable: string[] = [];

    for (let update = 1; update <= failedUpdates; update += 1) {
      const fileName = `unrecovered-${update}.txt`;
      const held = keptRoots.find((root) =>
        existsSync(path.join(parent, root, "ShiftMgmt", "data", fileName))
      );

      if (
        held &&
        readFileSync(path.join(parent, held, "ShiftMgmt", "data", fileName), "utf8") ===
          `ONLY-COPY-${update}`
      ) {
        recoverable.push(fileName);
      }
    }

    expect(recoverable).toHaveLength(failedUpdates);
    expect(keptRoots).toHaveLength(failedUpdates);
    // Six powershell spawns, not four.
  }, 60_000);

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

  it("keeps a backup the live folder only appears to hold, because it is the same file seen twice", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);

    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // That update failed and the live copy is gone, so this backup is now the only place
    // accounts.json exists. The next run moves it aside.
    rmSync(path.join(stage.userDataDir, "data", "accounts.json"), { force: true });
    stage.write("data/other.txt", "OTHER");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const keptRoots = readdirSync(parent).filter((name) =>
      name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
    );

    expect(keptRoots).toHaveLength(1);

    const keptPath = path.join(parent, keptRoots[0]);

    expect(existsSync(path.join(keptPath, "ShiftMgmt", "data", "accounts.json"))).toBe(true);

    // The hand recovery the installer points the operator at, done with a link instead of a copy -
    // a junction needs no administrator rights, so an operator really can end up here. The live
    // folder now SHOWS the file, but there is still only one of it.
    rmSync(stage.userDataDir, { recursive: true, force: true });

    const linked = spawnSync("cmd", [
      "/c",
      "mklink",
      "/J",
      stage.userDataDir,
      path.join(keptPath, "ShiftMgmt")
    ]);

    try {
      expect(linked.status).toBe(0);
      expect(readFileSync(path.join(stage.userDataDir, "data", "accounts.json"), "utf8")).toBe(
        "ACCOUNTS"
      );

      // Size and SHA-256 agree here because both sides are the SAME file. Identical bytes are not
      // proof of a second copy, and this is the verdict whose True answer runs Remove-Item
      // -Recurse -Force over the only one there is.
      expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

      expect(existsSync(path.join(keptPath, "ShiftMgmt", "data", "accounts.json"))).toBe(true);
      expect(readFileSync(path.join(stage.userDataDir, "data", "accounts.json"), "utf8")).toBe(
        "ACCOUNTS"
      );
    } finally {
      // Take the junction down as a link, not as a folder, before afterEach walks the temp tree.
      spawnSync("cmd", ["/c", "rmdir", stage.userDataDir]);
    }
  }, 60_000);

  it("will not call a backup redundant when it never looked inside it", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const payload = path.join(parent, "outside-payload");

    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Content this backup holds only through a junction. PowerShell 5.1 declines to descend into a
    // reparse point and raises NO error while declining, so the walk reports a backup holding
    // nothing but accounts.json - which the live folder does have. This is why the enumeration
    // error gate cannot stand in for this check: there is no error to gate on.
    mkdirSync(payload, { recursive: true });
    writeFileSync(path.join(payload, "only-copy.txt"), "ONLY-COPY", "utf8");

    const linked = spawnSync("cmd", [
      "/c",
      "mklink",
      "/J",
      path.join(stage.backupRoot, "ShiftMgmt", "linked"),
      payload
    ]);

    try {
      expect(linked.status).toBe(0);

      const second = runScript("Backup", stage.backupRoot, stage.roamingAppData);

      expect(second.status).toBe(0);
      expect(second.stdout).not.toContain("DROPPED");

      const keptRoots = readdirSync(parent).filter((name) =>
        name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
      );

      expect(keptRoots).toHaveLength(1);
      expect(
        existsSync(path.join(parent, keptRoots[0], "ShiftMgmt", "linked", "only-copy.txt"))
      ).toBe(true);
      expect(readFileSync(path.join(payload, "only-copy.txt"), "utf8")).toBe("ONLY-COPY");
    } finally {
      readdirSync(parent)
        .filter((name) => name.startsWith(path.basename(stage.backupRoot)))
        .forEach((name) =>
          spawnSync("cmd", ["/c", "rmdir", path.join(parent, name, "ShiftMgmt", "linked")])
        );
    }
  }, 60_000);

  it("keeps a backup whose file list it could not read in full", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const account = `${process.env.USERDOMAIN ?? ""}\\${process.env.USERNAME ?? ""}`;

    stage.write("accounts/only-copy.json", "ONLY-COPY");
    stage.write("data/shared.txt", "SHARED");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Unique to the backup from here on, but the live FOLDER survives, so the directory gate sees
    // accounts\ on both sides and agrees. Only the enumeration gate can save this file.
    rmSync(path.join(stage.userDataDir, "accounts", "only-copy.json"), { force: true });

    const denied = path.join(stage.backupRoot, "ShiftMgmt", "accounts");

    expect(spawnSync("icacls", [denied, "/deny", `${account}:(RD)`]).status).toBe(0);

    try {
      // Asserted rather than assumed: if the deny ACE did not bite - an elevated runner, a
      // different account name - this test would pass while testing nothing at all.
      const probe = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `@(Get-ChildItem -LiteralPath '${stage.backupRoot}' -Recurse -File -Force -ErrorAction SilentlyContinue).Name -join ','`
        ],
        { encoding: "utf8" }
      );

      expect(probe.stdout).not.toContain("only-copy.json");
      expect(existsSync(path.join(denied, "only-copy.json"))).toBe(true);

      const second = runScript("Backup", stage.backupRoot, stage.roamingAppData);

      expect(second.status).toBe(0);
      // The VERDICT is what is broken, and DROPPED is the verdict made visible. Survival is not the
      // assertion: while the deny ACE is still in place Remove-Item fails for the same reason the
      // walk did, so the folder outlives a wrong verdict by luck. It does not outlive one when the
      // obstruction is a scanner's handle that lets go a moment later.
      expect(second.stdout).not.toContain("DROPPED");
    } finally {
      // Not optional: afterEach cannot delete a tree it is not allowed to list, and every later
      // test in this file would then fail on an undeletable temp root. The ACE travelled with the
      // folder when the backup was renamed aside, so clear it wherever it now is.
      [
        denied,
        ...readdirSync(parent)
          .filter((name) => name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`))
          .map((name) => path.join(parent, name, "ShiftMgmt", "accounts"))
      ]
        .filter((candidate) => existsSync(candidate))
        .forEach((candidate) => spawnSync("icacls", [candidate, "/remove:d", account]));
    }
  }, 60_000);

  it("keeps a backup that still holds a folder the live side lost", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);

    stage.write("data/accounts.json", "ACCOUNTS");
    // Backup copies empty folders on purpose: imports\pending and imports\approved are watched, so
    // the app expects them to exist even with nothing in them. A folder only the backup has is
    // therefore content the live side is still missing, even though no file is missing.
    mkdirSync(path.join(stage.userDataDir, "imports", "pending"), { recursive: true });

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    rmSync(path.join(stage.userDataDir, "imports", "pending"), {
      recursive: true,
      force: true
    });

    const second = runScript("Backup", stage.backupRoot, stage.roamingAppData);

    expect(second.status).toBe(0);
    expect(second.stdout).not.toContain("DROPPED");

    const keptRoots = readdirSync(parent).filter((name) =>
      name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
    );

    expect(keptRoots).toHaveLength(1);
    expect(existsSync(path.join(parent, keptRoots[0], "ShiftMgmt", "imports", "pending"))).toBe(
      true
    );
  }, 30_000);

  it("does not say it dropped a backup that is still standing there", () => {
    const stage = createStage();
    const account = `${process.env.USERDOMAIN ?? ""}\\${process.env.USERNAME ?? ""}`;
    const keptRoot = `${stage.backupRoot}-unrestored-20260101-000000`;
    const keptShiftMgmt = path.join(keptRoot, "ShiftMgmt");

    stage.write("data/accounts.json", "ACCOUNTS");

    // The cleanup only runs when there is a backup to move aside, so make one first.
    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // A kept backup that really IS redundant - the live folder holds the same file byte for byte -
    // so the verdict is a genuine True and the deletion is genuinely attempted. It just cannot
    // finish: DELETE is denied on the folder and DELETE_CHILD on its parent, which is what an
    // ACL-awkward or momentarily locked folder looks like from here. Nothing about the WALK is
    // obstructed, so this is the reporting, not the verdict.
    mkdirSync(path.join(keptShiftMgmt, "data"), { recursive: true });
    writeFileSync(path.join(keptShiftMgmt, "data", "accounts.json"), "ACCOUNTS", "utf8");

    expect(spawnSync("icacls", [keptShiftMgmt, "/deny", `${account}:(DE)`]).status).toBe(0);
    expect(spawnSync("icacls", [keptRoot, "/deny", `${account}:(DC)`]).status).toBe(0);

    try {
      const second = runScript("Backup", stage.backupRoot, stage.roamingAppData);

      expect(second.status).toBe(0);
      expect(existsSync(keptRoot)).toBe(true);
      expect(second.stdout).not.toContain(`DROPPED ${keptRoot}`);
      expect(second.stdout).toContain(`KEPT ${keptRoot}`);

      // Not blanket KEPT either: the backup this run really did delete is still reported dropped,
      // and it really is gone.
      const dropped = second.stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith("DROPPED "))
        .map((line) => line.slice("DROPPED ".length).trim());

      expect(dropped).toHaveLength(1);
      expect(existsSync(dropped[0])).toBe(false);
    } finally {
      // afterEach cannot delete a tree it is not allowed to delete from.
      spawnSync("icacls", [keptShiftMgmt, "/remove:d", account]);
      spawnSync("icacls", [keptRoot, "/remove:d", account]);
    }
  }, 60_000);

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
