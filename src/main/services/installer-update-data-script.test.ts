import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
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

// The same override for the installer script that reads the exit code and writes the words the
// operator sees. Both files are checked against each other below, so both need one.
const nshPath =
  process.env.SHIFTMGMT_NSH_PATH ?? path.resolve(process.cwd(), "build", "installer.nsh");

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

  // A real WAL database, built OUTSIDE the live folder on purpose. Opening a WAL database replays
  // its log into the body and deletes the log on close, so a test that opens the files it is
  // measuring erases the very thing it came to measure. Everything below copies from here instead.
  //
  // After buildWalFixture the body holds 42 and the log has been truncated to nothing - the state a
  // backup taken just after a checkpoint captures. commitToLogOnly() then puts 99 in the log alone,
  // which is the commit only the live log can still produce.
  const buildWalFixture = (directory: string) => {
    mkdirSync(directory, { recursive: true });

    const source = path.join(directory, "shiftmgmt.sqlite");
    const database = new DatabaseSync(source);

    database.exec("PRAGMA journal_mode = WAL");
    database.exec("CREATE TABLE approvals (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)");
    database.exec("INSERT INTO approvals (id, amount) VALUES (1, 42)");
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");

    return {
      source,
      commitToLogOnly: () => {
        database.exec("INSERT INTO approvals (id, amount) VALUES (2, 99)");
      },
      close: () => database.close()
    };
  };

  // Exactly the probe Test-PathIsReplaceable performs, run from here so a test can assert that a
  // lock really bit instead of assuming it did.
  const probeIsLocked = (target: string) => {
    const probe = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `try { $s = [System.IO.File]::Open('${target}', 'Open', 'ReadWrite', 'None'); $s.Dispose(); 'OPEN' } catch { 'LOCKED' }`
      ],
      { encoding: "utf8" }
    );

    return probe.stdout.includes("LOCKED");
  };

  // Holds real FileShare.None handles from a separate process, which is what an antivirus scanner,
  // an indexer or the app itself looks like to the restore. Assert on exit codes and file state
  // only - this host's powershell.exe writes its error text in Korean.
  const holdExclusiveHandles = async (targets: string[], signalDirectory: string) => {
    const readyPath = path.join(signalDirectory, "lock-ready");
    const releasePath = path.join(signalDirectory, "lock-release");
    const quoted = targets.map((target) => `'${target}'`).join(",");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `$streams = @(${quoted}) | ForEach-Object { [System.IO.File]::Open($_, 'Open', 'ReadWrite', 'None') };` +
          ` New-Item -ItemType File -Path '${readyPath}' -Force | Out-Null;` +
          ` while (-not (Test-Path -LiteralPath '${releasePath}')) { Start-Sleep -Milliseconds 50 };` +
          ` $streams | ForEach-Object { $_.Dispose() }`
      ],
      { stdio: "ignore" }
    );
    const exited = new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });
    const release = async () => {
      writeFileSync(releasePath, "", "utf8");
      await exited;
    };

    for (let waited = 0; waited < 20_000 && !existsSync(readyPath); waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!existsSync(readyPath)) {
      await release();

      throw new Error("the lock holder never took its handles");
    }

    return { release };
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

    // 3, not 0. This line used to say 0 while the stray log was being DESTROYED, so it pinned the
    // defect rather than the fix - and anyone "restoring green" by putting 0 back here reopens
    // exactly the hole the next two assertions describe. 3 means the restore finished AND something
    // was set aside, so the backup is kept one more cycle.
    expect(runScript("Restore", stage.backupRoot, stage.roamingAppData).status).toBe(3);

    // The stray log was already at the destination, so deciding file by file skipped it and left it
    // beside the restored database - a pairing that reads back values neither of them ever held.
    expect(existsSync(`${databasePath}-wal`) && readFileSync(`${databasePath}-wal`).equals(strayLog)).toBe(
      false
    );

    // Not paired with the restored body, and not destroyed either. A log with content can be the
    // newest thing on the machine, so it survives under a name nothing reads as part of a database.
    const liveData = path.dirname(databasePath);
    const setAside = readdirSync(liveData).filter((name) => name.includes("-wal-unrestored-"));

    expect(setAside).toHaveLength(1);
    expect(readFileSync(path.join(liveData, setAside[0]!)).equals(strayLog)).toBe(true);

    const restored = new DatabaseSync(databasePath);

    try {
      expect(restored.prepare("SELECT amount FROM approvals ORDER BY id").all()).toEqual([
        { amount: 42 }
      ]);
    } finally {
      restored.close();
    }
  }, 30_000);

  it("keeps a live log holding commits the backup body does not have", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const liveData = path.join(stage.userDataDir, "data");
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const fixture = buildWalFixture(path.join(parent, "scratch-db"));

    // The backup holds the checkpointed body and NOTHING else - the shape Backup produces when it
    // could not read the log (it skips an unreadable file one at a time and prints SKIPPED).
    mkdirSync(backupData, { recursive: true });
    copyFileSync(fixture.source, path.join(backupData, "shiftmgmt.sqlite"));

    fixture.commitToLogOnly();

    // The install lost the body. What is left live is a log holding a commit the backup body has
    // never seen - and the comment this replaces claimed such a log "cannot be read anyway".
    mkdirSync(liveData, { recursive: true });
    copyFileSync(`${fixture.source}-wal`, path.join(liveData, "shiftmgmt.sqlite-wal"));
    copyFileSync(`${fixture.source}-shm`, path.join(liveData, "shiftmgmt.sqlite-shm"));

    const liveLog = readFileSync(path.join(liveData, "shiftmgmt.sqlite-wal"));

    fixture.close();

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    const setAside = readdirSync(liveData).filter((name) => name.includes("-wal-unrestored-"));

    expect(setAside).toHaveLength(1);
    expect(result.status).toBe(3);
    expect(readFileSync(path.join(liveData, setAside[0]!)).equals(liveLog)).toBe(true);
    // Kept one more cycle, because this run could not prove where that log came from.
    expect(existsSync(stage.backupRoot)).toBe(true);

    // The assertion a script that deletes the log and merely exits 3 cannot satisfy: read the value
    // back out of the pair. On COPIES in a fresh folder - opening a WAL database checkpoints it.
    const recovery = path.join(parent, "recovery");

    mkdirSync(recovery, { recursive: true });
    copyFileSync(path.join(liveData, "shiftmgmt.sqlite"), path.join(recovery, "x.sqlite"));
    copyFileSync(path.join(liveData, setAside[0]!), path.join(recovery, "x.sqlite-wal"));

    const recovered = new DatabaseSync(path.join(recovery, "x.sqlite"));

    try {
      expect(recovered.prepare("SELECT amount FROM approvals ORDER BY id").all()).toEqual([
        { amount: 42 },
        { amount: 99 }
      ]);
    } finally {
      recovered.close();
    }
  }, 30_000);

  it("does not write a backup's log over a newer live one", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const liveData = path.join(stage.userDataDir, "data");
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const fixture = buildWalFixture(path.join(parent, "scratch-db"));

    // This time the backup has a log of its own: the empty one the checkpoint left behind. The
    // destroying step here is not a delete but a copy - writing this 0-byte log over the live one
    // loses the same commits just as completely, which is why the rename aside cannot be made
    // conditional on the backup lacking a log.
    mkdirSync(backupData, { recursive: true });
    copyFileSync(fixture.source, path.join(backupData, "shiftmgmt.sqlite"));
    copyFileSync(`${fixture.source}-wal`, path.join(backupData, "shiftmgmt.sqlite-wal"));
    copyFileSync(`${fixture.source}-shm`, path.join(backupData, "shiftmgmt.sqlite-shm"));

    expect(statSync(path.join(backupData, "shiftmgmt.sqlite-wal")).size).toBe(0);

    fixture.commitToLogOnly();

    mkdirSync(liveData, { recursive: true });
    copyFileSync(`${fixture.source}-wal`, path.join(liveData, "shiftmgmt.sqlite-wal"));
    copyFileSync(`${fixture.source}-shm`, path.join(liveData, "shiftmgmt.sqlite-shm"));

    const liveLogSize = statSync(path.join(liveData, "shiftmgmt.sqlite-wal")).size;

    expect(liveLogSize).toBeGreaterThan(0);

    fixture.close();

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    const setAside = readdirSync(liveData).filter((name) => name.includes("-wal-unrestored-"));

    expect(setAside).toHaveLength(1);
    expect(result.status).toBe(3);
    // The size is what proves the LIVE log is the one that survived, rather than the backup's empty
    // one being renamed into place and the real one thrown away.
    expect(statSync(path.join(liveData, setAside[0]!)).size).toBe(liveLogSize);

    const recovery = path.join(parent, "recovery");

    mkdirSync(recovery, { recursive: true });
    copyFileSync(path.join(liveData, "shiftmgmt.sqlite"), path.join(recovery, "x.sqlite"));
    copyFileSync(path.join(liveData, setAside[0]!), path.join(recovery, "x.sqlite-wal"));

    const recovered = new DatabaseSync(path.join(recovery, "x.sqlite"));

    try {
      expect(recovered.prepare("SELECT amount FROM approvals ORDER BY id").all()).toEqual([
        { amount: 42 },
        { amount: 99 }
      ]);
    } finally {
      recovered.close();
    }
  }, 30_000);

  it("does not read its own half-finished restore back as a database that survived the install", async () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const fixture = buildWalFixture(path.join(parent, "scratch-db"));

    mkdirSync(liveData, { recursive: true });
    copyFileSync(fixture.source, databasePath);
    copyFileSync(`${fixture.source}-wal`, `${databasePath}-wal`);
    copyFileSync(`${fixture.source}-shm`, `${databasePath}-shm`);

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The install lost the body and left a different run's log and index behind.
    fixture.commitToLogOnly();
    copyFileSync(`${fixture.source}-wal`, `${databasePath}-wal`);
    copyFileSync(`${fixture.source}-shm`, `${databasePath}-shm`);
    rmSync(databasePath, { force: true });
    fixture.close();

    const holder = await holdExclusiveHandles([`${databasePath}-shm`, `${databasePath}-wal`], parent);

    try {
      // Asserted, not assumed: without a lock that really bites, the restore below simply succeeds
      // and this test proves nothing at all.
      expect(probeIsLocked(`${databasePath}-shm`)).toBe(true);

      const first = runScript("Restore", stage.backupRoot, stage.roamingAppData);

      expect(first.status).not.toBe(0);
      expect(first.status).not.toBe(3);
      // THE atomicity assertion. Copying the group one file at a time put the backup's body in the
      // live folder before finding out the rest could not be written; the retry then read that body
      // as a database that survived the install, skipped the group in silence, exited 0 and deleted
      // the backup that still held the matching pair.
      expect(existsSync(databasePath)).toBe(false);
      expect(existsSync(`${databasePath}.restore-part`)).toBe(false);
      expect(existsSync(stage.backupRoot)).toBe(true);
    } finally {
      await holder.release();
    }

    // 3 rather than 0: the live log had content, so it was set aside instead of written over.
    const retry = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(retry.status).toBe(3);
    expect(readdirSync(liveData).filter((name) => name.includes("-wal-unrestored-"))).toHaveLength(1);

    const restored = new DatabaseSync(databasePath);

    try {
      // 42, the pair the backup holds. 99 is the stray log's value, and reading it here would mean
      // the restored body had been paired with a log that was never written against it.
      expect(restored.prepare("SELECT amount FROM approvals ORDER BY id").all()).toEqual([
        { amount: 42 }
      ]);
    } finally {
      restored.close();
    }
  }, 60_000);

  it("finishes a restore that a crash stopped between the files of one database", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const fixture = buildWalFixture(path.join(parent, "scratch-db"));

    mkdirSync(liveData, { recursive: true });
    copyFileSync(fixture.source, databasePath);
    copyFileSync(`${fixture.source}-wal`, `${databasePath}-wal`);
    copyFileSync(`${fixture.source}-shm`, `${databasePath}-shm`);

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    fixture.commitToLogOnly();
    copyFileSync(`${fixture.source}-wal`, `${databasePath}-wal`);
    copyFileSync(`${fixture.source}-shm`, `${databasePath}-shm`);
    fixture.close();

    // The state a death between two of the group's renames leaves behind: the backup's body already
    // in place, the OLD live log still beside it, this run's scratch not cleaned up, and a marker
    // saying the group was caught halfway. Test-Path on its own reads that body as a survivor.
    copyFileSync(path.join(backupData, "shiftmgmt.sqlite"), databasePath);
    writeFileSync(`${databasePath}.restore-incomplete`, databasePath, "utf8");
    writeFileSync(`${databasePath}-wal.restore-part`, "SCRATCH", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(3);
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(false);
    expect(readdirSync(liveData).filter((name) => name.includes("-wal-unrestored-"))).toHaveLength(1);

    const restored = new DatabaseSync(databasePath);

    try {
      expect(restored.prepare("SELECT amount FROM approvals ORDER BY id").all()).toEqual([
        { amount: 42 }
      ]);
    } finally {
      restored.close();
    }

    // And the scratch is never mistaken for the operator's data: a backup taken over a live folder
    // that still holds a part file and a marker copies neither of them.
    writeFileSync(`${databasePath}.restore-incomplete`, databasePath, "utf8");
    writeFileSync(`${databasePath}-wal.restore-part`, "SCRATCH", "utf8");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const backedUp = readdirSync(backupData);

    expect(backedUp).toContain("shiftmgmt.sqlite");
    expect(
      backedUp.filter(
        (name) => name.endsWith(".restore-part") || name.endsWith(".restore-incomplete")
      )
    ).toEqual([]);
  }, 60_000);

  it("never hands the database's name to a folder that was sitting at the staged name", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    mkdirSync(backupData, { recursive: true });
    writeFileSync(path.join(backupData, "shiftmgmt.sqlite"), "ONLY-DB-BODY", "utf8");
    writeFileSync(path.join(backupData, "accounts.json"), "ACCOUNTS", "utf8");

    // A DIRECTORY where the staged copy is about to be written. Nothing in this app makes one - and
    // that is the point: Copy-Item onto a directory copies INSIDE it instead of over it, and the
    // flip then renamed that directory onto the database's own name. The run reported a finished
    // restore, deleted the backup, and left a FOLDER called shiftmgmt.sqlite with the body buried
    // in it - which every later update reads as a database that survived the install.
    mkdirSync(`${databasePath}.restore-part`, { recursive: true });

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBe(3);
    expect(existsSync(databasePath) && statSync(databasePath).isDirectory()).toBe(false);
    // The body still exists somewhere, which is the whole assertion.
    expect(readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")).toBe("ONLY-DB-BODY");
    expect(existsSync(stage.backupRoot)).toBe(true);
    // Everything the backup could put back is still put back before the refusal.
    expect(readFileSync(path.join(liveData, "accounts.json"), "utf8")).toBe("ACCOUNTS");
  }, 30_000);

  it("does not call a directory or an empty file the database that survived the install", () => {
    const emptyLive = createStage();
    const emptyBackupData = path.join(emptyLive.backupRoot, "ShiftMgmt", "data");

    mkdirSync(emptyBackupData, { recursive: true });
    writeFileSync(path.join(emptyBackupData, "shiftmgmt.sqlite"), "A-YEAR-OF-APPROVALS", "utf8");
    // What the app writes on its next start once the database is gone: the name is there, the rows
    // are not. Test-Path answers yes to it, so the group was skipped, the run exited 0 and the
    // backup holding the only real body was deleted on the way out.
    emptyLive.write("data/shiftmgmt.sqlite", "");

    expect(runScript("Restore", emptyLive.backupRoot, emptyLive.roamingAppData).status).toBe(0);
    expect(
      readFileSync(path.join(emptyLive.userDataDir, "data", "shiftmgmt.sqlite"), "utf8")
    ).toBe("A-YEAR-OF-APPROVALS");

    const directoryLive = createStage();
    const directoryBackupData = path.join(directoryLive.backupRoot, "ShiftMgmt", "data");
    const directoryMain = path.join(directoryLive.userDataDir, "data", "shiftmgmt.sqlite");

    mkdirSync(directoryBackupData, { recursive: true });
    writeFileSync(
      path.join(directoryBackupData, "shiftmgmt.sqlite"),
      "A-YEAR-OF-APPROVALS",
      "utf8"
    );
    mkdirSync(directoryMain, { recursive: true });

    // Nothing can be read out of a directory, so it is not a survivor either. The restore refuses
    // rather than writing anything, and the backup stays where the operator is told to look.
    const result = runScript("Restore", directoryLive.backupRoot, directoryLive.roamingAppData);

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBe(3);
    expect(
      readFileSync(path.join(directoryBackupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("A-YEAR-OF-APPROVALS");
    expect(existsSync(directoryLive.backupRoot)).toBe(true);
  }, 60_000);

  it("does not set a live log aside when it is the copy this same install just made", () => {
    const stage = createStage();
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    stage.write("data/shiftmgmt.sqlite", "REAL-DB");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // A marker left behind by a restore a power cut stopped, on a machine where the database, its
    // log and its index are all present and consistent. The marker is right to say "do not call
    // this a survivor" - but the log beside it is byte for byte the one this same install copied
    // into the backup minutes ago, so setting it aside deposits a duplicate nobody will ever
    // remove, tells the operator a file was rescued from nothing, and keeps a full-size backup for
    // good on a machine where nothing is wrong.
    writeFileSync(`${databasePath}.restore-incomplete`, databasePath, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(0);
    expect(readdirSync(liveData).filter((name) => name.includes("-unrestored-"))).toEqual([]);
    expect(readFileSync(`${databasePath}-wal`, "utf8")).toBe("LIVE-WAL");
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(false);
    expect(existsSync(stage.backupRoot)).toBe(false);
  }, 30_000);

  it("finishes an update over a leftover sidecar that cannot hold a commit", () => {
    const stage = createStage();
    const strayLog = path.join(stage.userDataDir, "data", "old", "archived.sqlite-wal");
    const strayIndex = path.join(stage.userDataDir, "data", "old", "archived.sqlite-shm");

    stage.write("data/accounts.json", "ACCOUNTS");
    // Both are already on the machine, so the backup copies them too. A -shm is a rebuildable index
    // and a 0-byte -wal has no header and no frames, so there is no .sqlite to find for either and
    // nothing that could be put back - yet the run refused the whole update, on every update, and
    // told the operator it had not finished.
    stage.write("data/old/archived.sqlite-wal", "");
    stage.write("data/old/archived.sqlite-shm", "");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    rmSync(path.join(stage.userDataDir, "data", "accounts.json"), { force: true });

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(0);
    expect(readFileSync(path.join(stage.userDataDir, "data", "accounts.json"), "utf8")).toBe(
      "ACCOUNTS"
    );
    // Left exactly where it was: this run was never asked to delete a live file, and the app
    // removes or rebuilds its own sidecars when it starts.
    expect(existsSync(strayLog)).toBe(true);
    expect(existsSync(strayIndex)).toBe(true);
    expect(existsSync(stage.backupRoot)).toBe(false);
  }, 30_000);

  it("refuses to finish when the live folder holds a log whose database is in neither side", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "LIVE");
    stage.write("data/shiftmgmt.sqlite-wal", "WAL");
    stage.write("config.json", '{"n":1}');

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Backup skips a file it cannot read one at a time, so it can end up holding NOTHING of a
    // database - not even its log. Discovery that starts from the backup then forms no group for
    // that database at all, so nobody ever asks the question: the run exited 0 and deleted the
    // backup, and the app's next start created a 0-byte database and deleted the log.
    rmSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), { force: true });
    rmSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite-wal"), { force: true });
    rmSync(path.join(stage.userDataDir, "data", "shiftmgmt.sqlite"), { force: true });

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBe(3);
    // "Neither side has the database" means change nothing anywhere and keep the backup - not even
    // the log is set aside, because this run is refusing to touch the group at all.
    expect(readFileSync(path.join(stage.userDataDir, "data", "shiftmgmt.sqlite-wal"), "utf8")).toBe(
      "WAL"
    );
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 30_000);

  it("refuses an orphan log in a live folder the backup never held", () => {
    const stage = createStage();
    const otherLive = path.join(stage.roamingAppData, "ShiftMgmt_V3.4", "data");

    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // A second user-data folder that exists only live. The restore walked the BACKUP's subfolders
    // and nothing else, so this one was never examined at all: exit 0, backup deleted.
    rmSync(path.join(stage.userDataDir, "data", "accounts.json"), { force: true });
    mkdirSync(otherLive, { recursive: true });
    writeFileSync(path.join(otherLive, "shiftmgmt.sqlite-wal"), "WAL", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBe(3);
    expect(readFileSync(path.join(otherLive, "shiftmgmt.sqlite-wal"), "utf8")).toBe("WAL");
    expect(existsSync(stage.backupRoot)).toBe(true);
    // Raised last, so everything the backup could put back is already back before the refusal.
    expect(readFileSync(path.join(stage.userDataDir, "data", "accounts.json"), "utf8")).toBe(
      "ACCOUNTS"
    );
  }, 30_000);

  it("finishes and keeps the backup when a folder in the LIVE tree cannot be read", () => {
    const stage = createStage();
    const account = `${process.env.USERDOMAIN ?? ""}\\${process.env.USERNAME ?? ""}`;
    const denied = path.join(stage.userDataDir, "cache");

    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The backup was taken while everything was readable, so nothing is missing from it. The
    // unreadable folder appears only afterwards, on the LIVE side - which means one QUESTION about
    // what is already there went unanswered, not that anything was left unrestored. Failing the
    // run there told the operator that a restore which had put everything back had not finished:
    // on an attended install a failure box on every future update, and on the silent auto-update
    // path no message at all while one full copy of the user data is left behind per update.
    rmSync(path.join(stage.userDataDir, "data", "accounts.json"), { force: true });
    mkdirSync(denied, { recursive: true });
    writeFileSync(path.join(denied, "cache.bin"), "CACHE", "utf8");

    expect(
      spawnSync("icacls", [denied, "/inheritance:d", "/deny", `${account}:(OI)(CI)(RD,RA,REA,X)`])
        .status
    ).toBe(0);

    try {
      // Asserted rather than assumed: without a deny that really bites - an elevated runner, a
      // different account name - this test would pass while testing nothing at all.
      const probe = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$e = $null; Get-ChildItem -LiteralPath '${stage.userDataDir}' -Recurse -File -Force -ErrorAction SilentlyContinue -ErrorVariable e | Out-Null; @($e).Count`
        ],
        { encoding: "utf8" }
      );

      expect(Number(probe.stdout.trim())).toBeGreaterThan(0);

      const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

      // 4, not 1: finished, nothing set aside, backup deliberately held until a run can read that
      // folder. installer.nsh has a branch of its own for it, because the words for a renamed file
      // and the words for an unread folder are not interchangeable.
      expect(result.status).toBe(4);
      expect(result.stdout).toContain("UNCHECKED ");
      // The folder is named in the output, because the operator's message cannot carry a path.
      expect(result.stdout).toContain(denied);
      expect(readFileSync(path.join(stage.userDataDir, "data", "accounts.json"), "utf8")).toBe(
        "ACCOUNTS"
      );
      expect(existsSync(stage.backupRoot)).toBe(true);
    } finally {
      // afterEach cannot delete a tree it is not allowed to list.
      spawnSync("icacls", [denied, "/remove:d", account]);
    }
  }, 60_000);

  it("says so instead of finishing silently when this account has no backup", () => {
    const stage = createStage();

    // Nothing was ever backed up for this profile - the shape an elevated stage running as a
    // DIFFERENT administrator sees. It used to exit 0 with no output whatsoever, which is
    // indistinguishable from "the restore put everything back".
    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^NOBACKUP /);
  }, 30_000);

  it("says so instead of finishing silently when there is nothing to copy", () => {
    const stage = createStage();

    mkdirSync(stage.roamingAppData, { recursive: true });

    const result = runScript("Backup", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^NODATA/);
    expect(existsSync(stage.backupRoot)).toBe(false);
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

  it("keeps a backup of folders the live side only reaches through a junction", () => {
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const keptRoot = `${stage.backupRoot}-unrestored-20200101-000000`;
    const keptShiftMgmt = path.join(keptRoot, "ShiftMgmt");

    // A kept backup with no files in it at all - only the watched folders Backup copies on purpose.
    // Every file in a kept backup is proved to be a second physical copy before it counts as held
    // live, so one file anywhere in here would already have saved it. Folders have no such probe:
    // Test-Path -PathType Container follows a junction without a word, so the sweep compared this
    // backup against itself through the live path and deleted it - the live-side half of the very
    // case the review reported, left behind when the file branch was fixed on its own.
    mkdirSync(path.join(keptShiftMgmt, "imports", "pending"), { recursive: true });
    mkdirSync(path.join(keptShiftMgmt, "imports", "approved"), { recursive: true });

    // The sweep only runs when there is a backup to move aside, so leave one behind.
    mkdirSync(path.join(stage.backupRoot, "ShiftMgmt"), { recursive: true });
    writeFileSync(path.join(stage.backupRoot, "ShiftMgmt", "stale.txt"), "STALE", "utf8");
    mkdirSync(stage.roamingAppData, { recursive: true });

    // The hand recovery the installer points the operator at, done with a link instead of a copy.
    const linked = spawnSync("cmd", ["/c", "mklink", "/J", stage.userDataDir, keptShiftMgmt]);

    try {
      expect(linked.status).toBe(0);

      const second = runScript("Backup", stage.backupRoot, stage.roamingAppData);

      expect(second.status).toBe(0);
      expect(second.stdout).not.toContain(`DROPPED ${keptRoot}`);
      expect(existsSync(path.join(keptShiftMgmt, "imports", "pending"))).toBe(true);
      expect(existsSync(path.join(keptShiftMgmt, "imports", "approved"))).toBe(true);
      expect(
        readdirSync(parent).filter((name) =>
          name.startsWith(`${path.basename(stage.backupRoot)}-unrestored-`)
        ).length
      ).toBeGreaterThanOrEqual(1);
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

// build/installer.nsh is the only place the operator reads words from, and the only consumer of the
// script's exit code. Two rules below are plain string comparisons over both files, so they run on
// every platform on purpose: the CI runner is Linux, and a Windows-gated anti-drift guard would be
// skipped exactly where drift is cheapest to introduce.
describe("installer.nsh", () => {
  // A line counts as a comment only when it STARTS with ';' or '#'. Everything else is examined
  // whole rather than truncated at the first ';', so no rule here can be evaded by putting code
  // after one.
  const codeLines = (text: string) =>
    text.split(/\r?\n/).filter((line) => {
      const trimmed = line.trim();

      return trimmed !== "" && !trimmed.startsWith(";") && !trimmed.startsWith("#");
    });

  const operatorFacingText = (text: string) =>
    codeLines(text)
      .filter(
        (line) =>
          (/^\s*MessageBox\b/.test(line) || /MUI_WELCOMEPAGE_(TEXT|TITLE)/.test(line)) &&
          line.includes('"')
      )
      .map((line) => line.slice(line.indexOf('"') + 1, line.lastIndexOf('"')));

  const displayTemplateOf = (text: string) =>
    text.match(/ExpandEnvStrings\s+\$\w+\s+"([^"]+)"/)?.[1];

  it("never shows the operator a placeholder that nothing on that path expands", () => {
    // NSIS stores string literals verbatim and MessageBox hands them straight to Windows; no step in
    // between calls ExpandEnvironmentStrings. A %VAR% written into a message is therefore read out
    // to the operator as those literal characters - measured once, in a real compiled installer.
    const offending = operatorFacingText(readFileSync(nshPath, "utf8")).filter((message) =>
      /%[A-Za-z_][A-Za-z0-9_()]*%/.test(message)
    );

    expect(offending).toEqual([]);
  });

  it("has an answer for every exit code the script can produce", () => {
    // The exit code is the whole contract between the two files, and "anything else" is the failure
    // message - which says the fill-in step did not run to completion. A number the script exits
    // with that nothing here branches on therefore tells the operator the opposite of the truth,
    // which is exactly what code 3 did before it got a branch of its own.
    const nsh = readFileSync(nshPath, "utf8");
    const branched = new Set(
      Array.from(nsh.matchAll(/StrCmp\s+\$0\s+"(\d+)"/g)).map((match) => match[1]!)
    );
    const produced = Array.from(
      new Set(
        codeLines(readFileSync(scriptPath, "utf8"))
          .flatMap((line) => Array.from(line.matchAll(/(?:^|\s)exit\s+(\d+)\s*$/g)))
          .map((match) => match[1]!)
      )
    );

    expect(produced).not.toEqual([]);
    expect(produced.filter((code) => !branched.has(code))).toEqual([]);
  });

  it("names the same folder the script actually backs up to", () => {
    // The folder name now lives in two files, which is the drift this test exists to prevent: the
    // installer must not be able to name one folder while the script writes to another.
    const nsh = readFileSync(nshPath, "utf8");
    const backupFolder = readFileSync(scriptPath, "utf8").match(
      /\[string\]\$BackupRoot\s*=\s*\(Join-Path\s+\$env:LOCALAPPDATA\s+"([^"]+)"\)/
    )?.[1];

    expect(typeof backupFolder).toBe("string");
    expect(displayTemplateOf(nsh)).toBe(`%LOCALAPPDATA%\\${backupFolder}`);

    // $LOCALAPPDATA is the NSIS SHELL variable, not the environment one. electron-builder's
    // initMultiUser puts this installer in the all-users shell context before any of this runs, and
    // there it resolves to C:\ProgramData - a folder shared by every local user, which the backup is
    // never in. ExpandEnvStrings on the environment variable is the only correct form here.
    expect(codeLines(nsh).filter((line) => /\$LOCALAPPDATA\b/.test(line))).toEqual([]);
  });

  // This last one runs the real script, so it needs a real powershell.exe.
  describeIfWindows("the folder it names", () => {
    const createdRoots: string[] = [];

    afterEach(() => {
      createdRoots.splice(0).forEach((rootPath) => {
        rmSync(rootPath, { force: true, recursive: true });
      });
    });

    it("is where the backup really is", () => {
      const tempRoot = mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-installer-nsh-"));

      createdRoots.push(tempRoot);

      const roamingAppData = path.join(tempRoot, "AppData", "Roaming");
      const localAppData = path.join(tempRoot, "AppData", "Local");

      mkdirSync(path.join(roamingAppData, "ShiftMgmt", "data"), { recursive: true });
      mkdirSync(localAppData, { recursive: true });
      writeFileSync(
        path.join(roamingAppData, "ShiftMgmt", "data", "accounts.json"),
        "ACCOUNTS",
        "utf8"
      );

      const template = displayTemplateOf(readFileSync(nshPath, "utf8")) ?? "";

      // No -BackupRoot: the script decides for itself, from LOCALAPPDATA in this environment block.
      expect(
        spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            scriptPath,
            "-Mode",
            "Backup",
            "-RoamingAppData",
            roamingAppData
          ],
          { encoding: "utf8", env: { ...process.env, LOCALAPPDATA: localAppData } }
        ).status
      ).toBe(0);

      // Expanded by Windows in that same environment block - which is the block nsExec's child
      // powershell.exe inherits (verified: nsExec passes no environment of its own to
      // CreateProcess), so this is the string the installer's ExpandEnvStrings produces.
      const expanded = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "[Environment]::ExpandEnvironmentVariables($env:SHIFTMGMT_DISPLAY_TEMPLATE)"
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            LOCALAPPDATA: localAppData,
            SHIFTMGMT_DISPLAY_TEMPLATE: template
          }
        }
      ).stdout.trim();

      expect(expanded).not.toBe("");
      expect(
        readFileSync(path.join(expanded, "ShiftMgmt", "data", "accounts.json"), "utf8")
      ).toBe("ACCOUNTS");
    }, 30_000);
  });
});

// Two rules about the script AS A FILE, not about anything it does, so they run on every platform.
// Neither can be reverse-verified: both already held before this change and are pinned here so a
// later edit cannot quietly break them - which is precisely how each of them was broken once.
describe("installer-update-data.ps1 as a file", () => {
  it("is pure ASCII", () => {
    // The installer runs this through powershell.exe on whatever code page the machine has. A
    // non-ASCII byte in here is a mangled string or a parse error on somebody else's PC, which is
    // why every word the operator reads lives in build/installer.nsh instead.
    const bytes = readFileSync(scriptPath);
    const offending: number[] = [];

    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index]! > 0x7e) {
        offending.push(index);
      }
    }

    expect(offending).toEqual([]);
  });

  // One top-level function's own text. Every function in the script starts at column 0 and ends at
  // the first "}" in column 0, so the slice needs no parser.
  const functionText = (text: string, name: string) => {
    const start = text.indexOf(`function ${name} {`);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = text.indexOf("\n}", start);

    expect(end).toBeGreaterThan(start);

    return text.slice(start, end + 2);
  };

  it("never counts the kept backups it is deciding about", () => {
    // The rule is "a kept backup holding a file the live folder lacks is never deleted - not by age
    // and not by count", and a test that builds N kept roots and asserts N survive cannot fail a
    // rule that keeps N. It catches keep-3 and keep-4 and nothing above them; the commit that added
    // it said otherwise, which is the second time this campaign has stated a reverse-verification
    // result that was not true. This is the half no arithmetic can express: the deletion sweep must
    // not compare the NUMBER of kept backups against anything, nor take a slice of the list. Same
    // shape as the Get-FileHash guard above, which does bite.
    const sweep = functionText(readFileSync(scriptPath, "utf8"), "Move-UnrestoredBackupAside");
    const offending = sweep
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("#"))
      .filter(
        (line) =>
          /\.Count\s*-(gt|ge|lt|le)\b/i.test(line) ||
          /Select-Object[^|]*-(Skip|First|Last)\b/i.test(line) ||
          /\bMeasure-Object\b/i.test(line)
      );

    expect(offending).toEqual([]);
  });

  it("never calls Get-FileHash", () => {
    // Get-FileHash lives in a module the installer's powershell.exe cannot always resolve. It threw
    // exactly that way on this host and the catch around it read the exception as "these files
    // differ" - so the hashing is done through [System.Security.Cryptography.SHA256] directly.
    const offending = readFileSync(scriptPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("Get-FileHash") && !line.trim().startsWith("#"));

    expect(offending).toEqual([]);
  });
});
