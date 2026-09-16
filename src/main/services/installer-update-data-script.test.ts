import {
  chmodSync,
  copyFileSync,
  linkSync,
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

  const resolvePowerShellCwd = (backupRoot: string | null, roamingAppData: string) => {
    const tempRoot = backupRoot
      ? path.dirname(backupRoot)
      : path.dirname(path.dirname(roamingAppData));
    const isolatedCwd = path.join(tempRoot, "powershell-cwd");

    mkdirSync(isolatedCwd, { recursive: true });

    return isolatedCwd;
  };

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
        cwd: resolvePowerShellCwd(backupRoot, roamingAppData),
        ...(localAppData ? { env: { ...process.env, LOCALAPPDATA: localAppData } } : {})
      }
    );

  // The same run, from a copy of the script that stops dead at a named point. A power cut inside a
  // window a few microseconds wide cannot be waited for, and every attempt to catch one with a lock
  // or a timer measures the timer instead. This runs the real code up to the exact line the crash
  // goes before and then leaves the disk exactly as it stood there.
  //
  // The anchor is content, not a line number, so the same test can be pointed at an older copy
  // through SHIFTMGMT_PS1_PATH: the first anchor that copy actually contains is the one used. That
  // is what lets a window this version closed still be MEASURED on the version that had it.
  const runScriptCrashingBefore = (
    anchors: string[],
    stage: { backupRoot: string; roamingAppData: string },
    mode: "Backup" | "Restore"
  ) => {
    const source = readFileSync(scriptPath, "utf8");
    const anchor = anchors.find((candidate) => source.includes(candidate));

    if (!anchor) {
      throw new Error(`no crash anchor is in this script: ${anchors.join(" | ")}`);
    }

    if (source.indexOf(anchor) !== source.lastIndexOf(anchor)) {
      throw new Error(`crash anchor is not unique: ${anchor}`);
    }

    const crashingPath = path.join(path.dirname(stage.backupRoot), "installer-update-data-crash.ps1");

    mkdirSync(path.dirname(crashingPath), { recursive: true });
    writeFileSync(crashingPath, source.replace(anchor, `exit 99\n\n${anchor}`), "utf8");

    return spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        crashingPath,
        "-Mode",
        mode,
        "-BackupRoot",
        stage.backupRoot,
        "-RoamingAppData",
        stage.roamingAppData
      ],
      {
        encoding: "utf8",
        cwd: resolvePowerShellCwd(stage.backupRoot, stage.roamingAppData)
      }
    );
  };

  const runScriptWithInjectedCode = (
    anchor: string,
    injectedCode: string,
    stage: { backupRoot: string; roamingAppData: string },
    mode: "Backup" | "Restore"
  ) => {
    const source = readFileSync(scriptPath, "utf8");

    if (!source.includes(anchor)) {
      throw new Error(`anchor is not in this script: ${anchor}`);
    }

    if (source.indexOf(anchor) !== source.lastIndexOf(anchor)) {
      throw new Error(`anchor is not unique: ${anchor}`);
    }

    const modifiedPath = path.join(path.dirname(stage.backupRoot), "installer-update-data-injected.ps1");

    mkdirSync(path.dirname(modifiedPath), { recursive: true });
    writeFileSync(modifiedPath, source.replace(anchor, `${injectedCode}\n\n${anchor}`), "utf8");

    return spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        modifiedPath,
        "-Mode",
        mode,
        "-BackupRoot",
        stage.backupRoot,
        "-RoamingAppData",
        stage.roamingAppData
      ],
      {
        encoding: "utf8",
        cwd: resolvePowerShellCwd(stage.backupRoot, stage.roamingAppData)
      }
    );
  };

  // The line the marker is put at its own name by - this version's write, and the rename the
  // version before it used. Crashing BEFORE either one lands in the same window: the group is
  // halfway and the run is about to say so.
  const markerLandsAnchors = [
    "Write-V1RestoreMarker -MarkerPath $markerPath -MainPath $Group.MainPath",
    "Move-Item -LiteralPath $markingPath -Destination $markerPath -Force",
    "Set-Content -LiteralPath $markerPath -Value $Group.MainPath -Encoding UTF8"
  ];

  // And the line the record is first put on disk by, whatever name that version writes it under.
  // These two anchors are the two ends of the window a rewrite of an existing record opens; a
  // version that never rewrites one has a single line, so both lists resolve to it.
  const recordWrittenAnchors = [
    "Write-V1RestoreMarker -MarkerPath $markerPath -MainPath $Group.MainPath",
    "Set-Content -LiteralPath $markingPath -Value $Group.MainPath -Encoding UTF8",
    "Set-Content -LiteralPath $markerPath -Value $Group.MainPath -Encoding UTF8"
  ];

  // The first line of the flip: every staged copy is on disk, the marker has been written, the live
  // sidecars have been dealt with, and not one name has been renamed into place yet.
  const flipStartsAnchor = "$pair.CommitReplace($pair.FinalPath)";

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

  // What powershell.exe itself says about a name - the exact property the staged-name guard used to
  // rest on - asked from here so a test can prove the blind spot instead of assuming it.
  const linkTypeOf = (target: string) => {
    const probe = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${target}' -Force).LinkType`],
      { encoding: "utf8" }
    );

    return probe.stdout.trim();
  };

  // Windows can hold a file open for a moment right after it is renamed - a scanner sees a new
  // name and looks inside it - so a read taken immediately after the restore is occasionally
  // refused. Retrying briefly keeps the assertion about what is IN the file instead of about the
  // scanner's timing; every attempt is the same synchronous read the tests would do anyway.
  const readWhenAvailable = (target: string) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return readFileSync(target, "utf8");
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }

    return readFileSync(target, "utf8");
  };

  // Holds real FileShare.None handles from a separate process, which is what an antivirus scanner,
  // an indexer or the app itself looks like to the restore. Assert on exit codes and file state
  // only - this host's powershell.exe writes its error text in Korean.
  // The access and share mode are arguments because one thing this script has to survive is a
  // holder that is not exclusive at all: a handle opened for writing that still lets others write
  // is what an open spreadsheet looks like, and it is enough to make PowerShell answer nothing at
  // all when asked whether a name is a second name for that file.
  const holdExclusiveHandles = async (
    targets: string[],
    signalDirectory: string,
    hold: { access: string; share: string } = { access: "ReadWrite", share: "None" }
  ) => {
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
        `$streams = @(${quoted}) | ForEach-Object { [System.IO.File]::Open($_, 'Open', '${hold.access}', '${hold.share}') };` +
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
      expect(existsSync(stage.backupRoot)).toBe(true);
      // The staged copies are still on disk, and that is not new and not this index's doing. The
      // live log is set ASIDE, and a set-aside happens in the commit phase, which the
      // replaceability gate has never covered - so a log another process is holding has always
      // stopped the run after the marker was written. Measured on this same fixture with the index
      // removed and only the log locked: shiftmgmt.sqlite.restore-part,
      // shiftmgmt.sqlite-wal.restore-part and shiftmgmt.sqlite.restore-incomplete all left behind,
      // identically before and after the index stopped being gated. What was ever load-bearing is
      // the line above it, and the marker here is what makes the leftovers recoverable rather than
      // permanent.
      expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(true);
    } finally {
      await holder.release();
    }

    // 3 rather than 0: the live log had content, so it was set aside instead of written over.
    const retry = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(retry.status).toBe(3);
    expect(readdirSync(liveData).filter((name) => name.includes("-wal-unrestored-"))).toHaveLength(1);
    // And nothing of the stopped run outlives it: the next run clears whatever is standing at its
    // own staged names before it stages anything, and drops the marker once the group is whole.
    expect(readdirSync(liveData).filter((name) => name.endsWith(".restore-part"))).toEqual([]);
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(false);

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
    const v1Marker = [
      "SHIFTMGMT_RESTORE_RECORD_V1",
      Buffer.from(databasePath, "utf8").toString("base64"),
      "a1b2c3d4e5f678901234567890abcdef"
    ].join("\n");
    writeFileSync(`${databasePath}.restore-incomplete`, v1Marker, "utf8");
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

    // A DIRECTORY where the staged copy is about to be written, with something inside it. Nothing
    // in this app makes one - and that is the point: Copy-Item onto a directory copies INSIDE it
    // instead of over it, and the flip then renamed that directory onto the database's own name.
    // The run reported a finished restore, deleted the backup, and left a FOLDER called
    // shiftmgmt.sqlite with the body buried in it - which every later update reads as a database
    // that survived the install. What is inside it is not this script's to remove, so this is the
    // shape the staged name cannot be cleared of, and the only answer left is to refuse.
    const strayPath = path.join(`${databasePath}.restore-part`, "operator-note.txt");

    mkdirSync(`${databasePath}.restore-part`, { recursive: true });
    writeFileSync(strayPath, "OPERATOR-NOTE", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBe(3);
    expect(existsSync(databasePath) && statSync(databasePath).isDirectory()).toBe(false);
    // The body still exists somewhere, which is the whole assertion.
    expect(readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")).toBe("ONLY-DB-BODY");
    expect(existsSync(stage.backupRoot)).toBe(true);
    // And the refusal walked past what was in there without touching it.
    expect(readFileSync(strayPath, "utf8")).toBe("OPERATOR-NOTE");
    // Everything the backup could put back is still put back before the refusal.
    expect(readFileSync(path.join(liveData, "accounts.json"), "utf8")).toBe("ACCOUNTS");

    // Emptied, the same directory holds nothing that could be lost, and a name that holds nothing
    // of its own is cleared instead of refused - so the update after the operator moves their file
    // out of the way finishes on its own, with a FILE and not a folder at the database's name.
    rmSync(strayPath, { force: true });

    const retry = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(retry.status).toBe(0);
    expect(statSync(databasePath).isFile()).toBe(true);
    expect(readWhenAvailable(databasePath)).toBe("ONLY-DB-BODY");
    expect(existsSync(`${databasePath}.restore-part`)).toBe(false);
  }, 30_000);

  it("never writes a staged copy through a name that is a second name for another file", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const payrollPath = path.join(stage.userDataDir, "payroll-2026.xlsx");

    mkdirSync(backupData, { recursive: true });
    writeFileSync(path.join(backupData, "shiftmgmt.sqlite"), "THE-ONLY-DATABASE-BODY", "utf8");
    writeFileSync(path.join(backupData, "accounts.json"), "ACCOUNTS", "utf8");

    mkdirSync(liveData, { recursive: true });
    writeFileSync(payrollPath, "OPERATOR-PAYROLL-YEAR-OF-WORK", "utf8");

    // A HARD link at the staged name: a second name for one of the operator's own files. It needs
    // no administrator and no developer mode, it is not a folder, and it carries no attribute of
    // its own - so a guard that asks "is this a folder" walks straight past it. Copy-Item then
    // wrote the database body THROUGH it into the payroll file, the flip renamed it onto the
    // database's name, the run exited 0 and deleted the backup: the payroll content existed
    // nowhere afterwards. A file symbolic link does the same and additionally leaves the database's
    // name a reparse point, which the size check after the flip cannot see - it reads 0 on both
    // sides of the flip and agrees with itself.
    //
    // The name is cleared before anything is copied now, and clearing it removes the NAME only:
    // every byte lives at the other end, under the operator's own name, and stays there. So the run
    // finishes instead of refusing - which is also the only answer that does not depend on being
    // able to tell this was a link at all. The test after this one holds a handle that makes
    // telling impossible, and that is the case a refusal could not have covered.
    linkSync(payrollPath, `${databasePath}.restore-part`);

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(0);
    expect(readWhenAvailable(payrollPath)).toBe("OPERATOR-PAYROLL-YEAR-OF-WORK");
    expect(readWhenAvailable(databasePath)).toBe("THE-ONLY-DATABASE-BODY");
    expect(statSync(databasePath).isFile()).toBe(true);
    expect(existsSync(`${databasePath}.restore-part`)).toBe(false);
    // Nothing set aside and nothing left unchecked, so the backup has nothing left to give.
    expect(existsSync(stage.backupRoot)).toBe(false);
  }, 60_000);

  it("does not write a staged copy through a second name it cannot be told is one", async () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const payrollPath = path.join(stage.userDataDir, "payroll-2026.xlsx");

    mkdirSync(backupData, { recursive: true });
    writeFileSync(path.join(backupData, "shiftmgmt.sqlite"), "THE-ONLY-DATABASE-BODY", "utf8");
    writeFileSync(path.join(backupData, "accounts.json"), "ACCOUNTS", "utf8");

    mkdirSync(liveData, { recursive: true });
    writeFileSync(payrollPath, "OPERATOR-PAYROLL-YEAR-OF-WORK", "utf8");
    linkSync(payrollPath, `${databasePath}.restore-part`);

    // The same second name as the test above, with the operator's own file OPEN while the update
    // runs. The only way to see a hard link from powershell.exe is $Item.LinkType, and PowerShell
    // computes that by OPENING the file - so a handle that denies reads makes the second name read
    // as an ordinary file, and any guard resting on that property is off exactly when somebody is
    // using the file it exists to protect. This is not an exotic holder either: writing while still
    // letting others write is what a spreadsheet open on screen looks like, and it does not stop
    // Copy-Item. Measured against the guard this replaces: the payroll read back as
    // THE-ONLY-DATABASE-BODY, the run exited 0, the backup was deleted, and nothing was said.
    const holder = await holdExclusiveHandles([payrollPath], stage.userDataDir, {
      access: "Write",
      share: "Write"
    });

    let result: ReturnType<typeof runScript> | undefined;

    try {
      // Asserted, not assumed: if the handle did not blind it, this is only the test above again.
      expect(linkTypeOf(`${databasePath}.restore-part`)).toBe("");

      result = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    } finally {
      // The holder denies reads, which is exactly why it blinds the link check - and it means the
      // file it is holding cannot be read back from here either until it lets go.
      await holder.release();
    }

    expect(result?.status).toBe(0);
    expect(readWhenAvailable(payrollPath)).toBe("OPERATOR-PAYROLL-YEAR-OF-WORK");
    expect(readWhenAvailable(databasePath)).toBe("THE-ONLY-DATABASE-BODY");
    expect(existsSync(`${databasePath}.restore-part`)).toBe(false);
  }, 60_000);

  it("never leaves a folder standing at the log's name and calls that a finished update", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    mkdirSync(backupData, { recursive: true });
    writeFileSync(path.join(backupData, "shiftmgmt.sqlite"), "ONLY-DB-BODY", "utf8");

    // A FOLDER at the live -wal name, with one of the operator's own files inside it. Left standing
    // beside a restored body it is not a harmless stray: SQLite answers "unable to open database
    // file", so the rows are on disk and unreachable - and the run that left it there reported a
    // finished update and deleted the only safety copy. It cannot simply be deleted either: what
    // is inside it is not this script's to remove. Renaming is the one answer that is safe for a
    // folder, a junction and a link alike.
    mkdirSync(`${databasePath}-wal`, { recursive: true });
    writeFileSync(path.join(`${databasePath}-wal`, "note.txt"), "OPERATOR-NOTE", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(3);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(statSync(databasePath).isFile()).toBe(true);
    expect(readWhenAvailable(databasePath)).toBe("ONLY-DB-BODY");

    const setAside = readdirSync(liveData).filter((name) => name.includes("-wal-unrestored-"));

    expect(setAside).toHaveLength(1);
    expect(readWhenAvailable(path.join(liveData, setAside[0]!, "note.txt"))).toBe("OPERATOR-NOTE");
    // Something was set aside, so the backup is kept one more cycle - never dropped on the way out.
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 30_000);

  it("sets aside a folder at the index's name instead of handing it to Remove-Item", () => {
    const stage = createStage();
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    stage.write("data/shiftmgmt.sqlite", "REAL-DB-BODY");
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    rmSync(databasePath, { force: true });

    // The same shape as the test above, at the OTHER sidecar's name - the branch a guard added to
    // the -wal was left off. Its member went to Remove-Item -Force in the commit phase, which on a
    // folder with children produced a raw .NET error in the middle of the operator's install log,
    // no database restored, and a marker plus a full-size staged copy left behind on every
    // attempt. Once it sat on the prompt for over three minutes, which under nsExec - which has no
    // timeout - would hang the installer with the app files already replaced.
    mkdirSync(`${databasePath}-shm`, { recursive: true });
    writeFileSync(path.join(`${databasePath}-shm`, "payroll.xlsx"), "OPERATOR-PAYROLL", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(3);
    expect(readWhenAvailable(databasePath)).toBe("REAL-DB-BODY");
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(false);
    expect(existsSync(`${databasePath}.restore-part`)).toBe(false);

    const setAside = readdirSync(liveData).filter((name) => name.includes("-shm-unrestored-"));

    expect(setAside).toHaveLength(1);
    expect(readWhenAvailable(path.join(liveData, setAside[0]!, "payroll.xlsx"))).toBe(
      "OPERATOR-PAYROLL"
    );
    expect(existsSync(stage.backupRoot)).toBe(true);
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
    const markerBody = [
      "SHIFTMGMT_RESTORE_RECORD_V1",
      Buffer.from(databasePath, "utf8").toString("base64"),
      "a1b2c3d4e5f678901234567890abcdef"
    ].join("\n");
    writeFileSync(`${databasePath}.restore-incomplete`, markerBody, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(0);
    expect(readdirSync(liveData).filter((name) => name.includes("-unrestored-"))).toEqual([]);
    expect(readFileSync(`${databasePath}-wal`, "utf8")).toBe("LIVE-WAL");
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(false);
    expect(existsSync(stage.backupRoot)).toBe(false);
  }, 30_000);

  it("does not refuse a whole restore over a live log it was never going to touch", () => {
    const stage = createStage();
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    stage.write("data/shiftmgmt.sqlite", "REAL-DB-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL-WITH-COMMITS");
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The install left no .sqlite at all - the disaster the backup exists for - and the live log is
    // byte for byte the one this same install copied into the backup minutes ago. Nothing has to
    // happen to that log: an identical copy written over an identical file changes nothing. Asking
    // for it to be replaceable anyway turned a read-only attribute - one bit, no second process -
    // into a refusal that left the operator a log and NO DATABASE, and says nothing at all on an
    // unattended update.
    rmSync(databasePath, { force: true });
    chmodSync(`${databasePath}-wal`, 0o444);

    try {
      const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

      expect(result.status).toBe(0);
      expect(readWhenAvailable(databasePath)).toBe("REAL-DB-BODY");
      // Left exactly as it was, and not duplicated: no -unrestored- copy of a file that was never
      // at risk, which is the other half of the same rule.
      expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL-WITH-COMMITS");
      expect(readdirSync(liveData).filter((name) => name.includes("-unrestored-"))).toEqual([]);
      // Nothing set aside and nothing left unchecked, so the backup has nothing left to give.
      expect(existsSync(stage.backupRoot)).toBe(false);
    } finally {
      chmodSync(`${databasePath}-wal`, 0o666);
    }
  }, 30_000);

  it("does not refuse a whole restore over a live index it was never going to keep", () => {
    const stage = createStage();
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    stage.write("data/shiftmgmt.sqlite", "REAL-DB-BODY");
    stage.write("data/shiftmgmt.sqlite-shm", "INDEX-BYTES");
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // The same disaster as the test above - the install left no .sqlite at all - at the OTHER
    // sidecar, which is where the same rule was left off. An index is a rebuildable view over the
    // log: it carries no commits by definition, and this run was going to write over it either way.
    // Sent to the replaceability gate anyway, one read-only bit - no second process, nothing wrong
    // with the machine - refused the WHOLE restore and left the operator a stale index and NO
    // DATABASE, on the first attempt and on every retry after it.
    rmSync(databasePath, { force: true });
    writeFileSync(`${databasePath}-shm`, "STALE-INDEX", "utf8");
    chmodSync(`${databasePath}-shm`, 0o444);

    try {
      const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

      expect(result.status).toBe(0);
      expect(readWhenAvailable(databasePath)).toBe("REAL-DB-BODY");
      // The stale index is gone and the one that belongs with this body is in its place. A stale
      // index left beside a restored body is the one thing that must not happen here.
      expect(readWhenAvailable(`${databasePath}-shm`)).toBe("INDEX-BYTES");
      // And not set aside either: an index is not an artefact the operator has to be told about,
      // and a -unrestored- copy of one is a dialog about nothing plus a backup kept for good.
      expect(readdirSync(liveData).filter((name) => name.includes("-unrestored-"))).toEqual([]);
      expect(existsSync(stage.backupRoot)).toBe(false);
    } finally {
      if (existsSync(`${databasePath}-shm`)) {
        chmodSync(`${databasePath}-shm`, 0o666);
      }
    }
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

  it("never writes its own progress note through a second name for the operator's file", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "THE-ONLY-DATABASE-BODY");
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const databasePath = path.join(stage.userDataDir, "data", "shiftmgmt.sqlite");

    // the install removed the body, so the group is restored and the commit phase runs
    rmSync(databasePath, { force: true });

    // An unrelated operator file, and a HARD LINK to it standing at the name this script writes its
    // own progress note to. A hard link carries no attribute saying so, and Set-Content writes
    // THROUGH the second name into the body the two names share - so the note used to overwrite the
    // operator's file, and the run still reported a finished update and deleted the safety copy.
    const operatorPath = path.join(stage.roamingAppData, "operator-payroll.txt");

    mkdirSync(stage.roamingAppData, { recursive: true });
    writeFileSync(operatorPath, "OPERATOR-PAYROLL-YEAR-OF-WORK", "utf8");
    linkSync(operatorPath, `${databasePath}.restore-incomplete`);

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    // The content is the assertion, not the exit code: a script that destroyed the file and then
    // exited non-zero would still have destroyed it. Under R34 commit gate, an occupied unknown
    // marker (including a hardlink) refuses before touching live files, so the operator link and
    // content are preserved, exit is 1, and backup is kept.
    expect(readFileSync(operatorPath, "utf8")).toBe("OPERATOR-PAYROLL-YEAR-OF-WORK");
    expect(result.status).toBe(1);
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(true);
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 30_000);

  it("does not call a stopped restore finished once a real update cycle has run over it", async () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "");
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    // the state an interrupted install leaves: no body, a log with commits, and an index
    rmSync(databasePath, { force: true });
    writeFileSync(`${databasePath}-wal`, "LIVE-WAL-WITH-COMMITS", "utf8");
    writeFileSync(`${databasePath}-shm`, "SHM", "utf8");

    const holder = await holdExclusiveHandles([`${databasePath}-shm`], liveData);
    let stopped;

    try {
      stopped = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    } finally {
      await holder.release();
    }

    expect(stopped.status).not.toBe(0);
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(true);

    // THE POINT OF THIS TEST. Every other commit-failure case here retries Restore directly. A real
    // update never does that - it runs a fresh Backup first. That Backup sets the good safety copy
    // aside as "-unrestored-" and makes a new one from the body-less live folder, so the Restore
    // after it sees no body on either side and a group that looks like litter. It used to call that
    // nothing-to-restore, delete the last remaining safety copy and exit 0, leaving the operator's
    // database recoverable only by hand from a folder nothing pointed at. Exit codes across the
    // cycle were 1 -> 0 -> 0 where the baseline gave 1 -> 0 -> 1.
    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const afterRealCycle = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(afterRealCycle.status).not.toBe(0);
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("refuses a database it can see nothing of but its own interrupted work", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    // What the install does to the folder this restore is there to put back.
    rmSync(databasePath, { force: true });

    // And the machine dies in the commit phase, after the marker and the staged copy are on disk
    // and before the first rename. This database was closed cleanly, so it had no -wal and no -shm
    // to leave behind: what is on the live side now is a marker and a staged part, and NOTHING that
    // Get-DatabaseMainPath recognises. That is the whole point of the case - the previous version
    // built its database groups from .sqlite/-wal/-shm names only, so this folder produced no group
    // at all, the marker was never asked about, and the verdict pass it belonged in never ran.
    const stopped = runScriptCrashingBefore([flipStartsAnchor], stage, "Restore");

    expect(stopped.status).toBe(99);
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(true);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);

    // The real next update, not another Restore: a fresh Backup runs first and changes what both
    // sides hold. It sets the good copy aside as "-unrestored-" and makes a new backup of the
    // body-less live folder, so the Restore after it has the operator's database on NEITHER side.
    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const afterRealCycle = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    // Measured on the version before this pass existed: 0, database absent, current backup deleted.
    // The exact code is pinned, not just "not zero" - 0 and 3 and 4 all mean the restore FINISHED
    // and 3 and 4 keep the backup for reasons that have nothing to do with an unrecovered database.
    expect(afterRealCycle.status).toBe(1);
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(stage.backupRoot)).toBe(true);

    // Both halves of the operator's only remaining copy are still there: the set-aside backup that
    // holds the body, and the current backup that has not been deleted out from under it.
    const tempRoot = path.dirname(stage.backupRoot);
    const asides = readdirSync(tempRoot).filter((name) => name.includes("-unrestored-"));

    expect(asides.length).toBe(1);
    expect(
      readFileSync(
        path.join(tempRoot, asides[0], "ShiftMgmt", "data", "shiftmgmt.sqlite"),
        "utf8"
      )
    ).toBe("REAL-DATABASE-BODY");
    expect(existsSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "accounts.json"))).toBe(true);
  }, 60_000);

  it.each([
    ["shiftmgmt.sqlite-wal", "the log"],
    ["shiftmgmt.sqlite-shm", "the index"]
  ])(
    "will not call an update finished and delete the backup with a junction standing where %s belongs",
    (memberName) => {
      const stage = createStage();

      stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");
      stage.write("data/accounts.json", "ACCOUNTS");

      expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

      const liveData = path.join(stage.userDataDir, "data");
      const operatorFolder = path.join(stage.roamingAppData, "operator-scans");

      mkdirSync(operatorFolder, { recursive: true });
      writeFileSync(path.join(operatorFolder, "scan.txt"), "OPERATOR-SCAN", "utf8");

      // Whatever put it here, it is not this script's and it is not a database. The body beside it
      // survived the install, so the group is finished without being touched at all - and that is
      // the verdict that never looked at this name. Measured before this check: exit 0 and the
      // backup deleted, on a live folder holding a database the app cannot open.
      const junctionPath = path.join(liveData, memberName);

      expect(
        spawnSync("cmd.exe", ["/c", "mklink", "/J", junctionPath, operatorFolder], {
          encoding: "utf8"
        }).status
      ).toBe(0);

      const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

      // Finished, and honest about what it could not say: the backup is kept for a run that can.
      expect(result.status).toBe(4);
      expect(result.stdout).toContain(`UNCHECKED ${junctionPath}`);
      expect(existsSync(stage.backupRoot)).toBe(true);

      // And the operator's own folder is exactly as it was - not moved, not emptied, not renamed.
      expect(readFileSync(path.join(operatorFolder, "scan.txt"), "utf8")).toBe("OPERATOR-SCAN");
      expect(readFileSync(path.join(junctionPath, "scan.txt"), "utf8")).toBe("OPERATOR-SCAN");
      expect(readFileSync(path.join(liveData, "shiftmgmt.sqlite"), "utf8")).toBe("REAL-DATABASE-BODY");
    },
    60_000
  );

  it("sees a folder standing where a database belongs even when no database is left to find", () => {
    const stage = createStage();

    // No database on either side - the verdict that used to walk away from this folder without a
    // word. And what is at the log's name is a FOLDER, which a walk that asks only for files cannot
    // see at all: there was no group, so there was nothing for any verdict to be reached about.
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const folderPath = path.join(liveData, "shiftmgmt.sqlite-wal");

    mkdirSync(folderPath, { recursive: true });
    writeFileSync(path.join(folderPath, "operator.txt"), "OPERATOR-FILE", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(4);
    expect(result.stdout).toContain(`UNCHECKED ${folderPath}`);
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(readFileSync(path.join(folderPath, "operator.txt"), "utf8")).toBe("OPERATOR-FILE");
  }, 60_000);

  it("keeps a record of the halfway group through two interruptions in a row", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "WAL-WITH-COMMITTED-ROWS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const markingPath = `${databasePath}.restore-incomplete-new`;

    // An earlier restore was interrupted: the body is back, the log that belongs with it is not,
    // and the record is the only thing that says the two do not match.
    rmSync(`${databasePath}-wal`, { force: true });
    const v1Marker = [
      "SHIFTMGMT_RESTORE_RECORD_V1",
      Buffer.from(databasePath, "utf8").toString("base64"),
      "a1b2c3d4e5f678901234567890abcdef"
    ].join("\n");
    writeFileSync(markerPath, v1Marker, "utf8");
    writeFileSync(`${databasePath}-wal.restore-part`, "WAL-WITH-COMMITTED-ROWS", "utf8");

    const groupIsWhole = () =>
      existsSync(`${databasePath}-wal`) &&
      readWhenAvailable(`${databasePath}-wal`) === "WAL-WITH-COMMITTED-ROWS";

    // What has to hold after every interruption, however many there are, and it is deliberately not
    // an assertion about the exit code: a version that never rewrites an existing record does not
    // reach the injected line at all and simply finishes the restore, which satisfies this just as
    // well. Either something on disk still says the group is halfway, or it is not halfway - and
    // while it IS halfway, the backup holding the other half is still there.
    const invariantHolds = () => {
      const whole = groupIsWhole();

      expect(existsSync(markerPath) || existsSync(markingPath) || whole).toBe(true);

      if (!whole) {
        expect(existsSync(stage.backupRoot)).toBe(true);
      }
    };

    // ONE interruption. A version that rewrites an existing record has left its new note under the
    // other name by now and deleted the old one.
    runScriptCrashingBefore(markerLandsAnchors, stage, "Restore");
    invariantHolds();

    // TWO. This is the one that was missed: the retry arrives with that note as the ONLY record,
    // and a version that starts by clearing the name it is about to write deletes it. Measured on
    // 75d7517 - both names gone, and the run after it read the half-flipped body as a database that
    // survived the install, never put the log back and deleted the backup with exit 0.
    runScriptCrashingBefore(recordWrittenAnchors, stage, "Restore");
    invariantHolds();

    // And the run that is allowed to finish acts on that record instead of walking past it.
    const finished = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(finished.status).toBe(0);
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("WAL-WITH-COMMITTED-ROWS");
    expect(readWhenAvailable(databasePath)).toBe("REAL-DATABASE-BODY");
    expect(existsSync(markerPath)).toBe(false);
    expect(existsSync(markingPath)).toBe(false);
    expect(existsSync(`${databasePath}-wal.restore-part`)).toBe(false);
  }, 90_000);

  it("still has a record after being stopped three times at the first rename", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "WAL-WITH-COMMITTED-ROWS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    rmSync(databasePath, { force: true });
    rmSync(`${databasePath}-wal`, { force: true });

    // The interruption point every version reaches, and reaches again on every retry: the marker is
    // written, the live sidecars are dealt with, and the first name is about to be renamed into
    // place. Three times in a row, because a record that survives one interruption and not the next
    // is the whole shape of the two defects this block has had.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const stopped = runScriptCrashingBefore([flipStartsAnchor], stage, "Restore");

      expect(stopped.status).toBe(99);
      expect(
        existsSync(`${databasePath}.restore-incomplete`) ||
          existsSync(`${databasePath}.restore-incomplete-new`)
      ).toBe(true);
      expect(existsSync(stage.backupRoot)).toBe(true);
    }

    const finished = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(finished.status).toBe(0);
    expect(readWhenAvailable(databasePath)).toBe("REAL-DATABASE-BODY");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("WAL-WITH-COMMITTED-ROWS");
    expect(existsSync(`${databasePath}.restore-incomplete`)).toBe(false);
    expect(existsSync(`${databasePath}.restore-incomplete-new`)).toBe(false);
  }, 90_000);

  it("reads a record an older build left under its own name as an interrupted restore", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "WAL-WITH-COMMITTED-ROWS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    // Nothing writes this name any more. A build that did could have left one on the machine this
    // update is running on, next to a body it had already flipped - and a record nobody recognises
    // is worse than no record, because the run walks past it calling that body a survivor.
    rmSync(`${databasePath}-wal`, { force: true });
    writeFileSync(`${databasePath}.restore-incomplete-new`, databasePath, "utf8");
    writeFileSync(`${databasePath}-wal.restore-part`, "WAL-WITH-COMMITTED-ROWS", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(4);
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("WAL-WITH-COMMITTED-ROWS");
    expect(existsSync(`${databasePath}.restore-incomplete-new`)).toBe(true);
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("does not refuse an update over a staged copy left beside a database that survived", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");

    // A staged copy with no record beside it, and the body still here. This is deliberately NOT
    // treated as a halfway group, and the reason is an ordering one: the record is written before
    // the first live change and cleared only after the last rename is verified, so a group that is
    // halfway always has one. A part with no record can therefore only be a crash from BEFORE the
    // commit phase - which touched nothing live - and refusing here would refuse an update whose
    // database is demonstrably intact, every time, until somebody deleted the leftover by hand.
    writeFileSync(`${databasePath}.restore-part`, "REAL-DATABASE-BODY", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(0);
    expect(readWhenAvailable(databasePath)).toBe("REAL-DATABASE-BODY");
  }, 60_000);

  // Every one of these asserts the BYTES of the live database, not the exit code. A run that
  // reports itself correctly and keeps the backup has still destroyed the operator's newer rows if
  // it wrote the older ones over them first, and the exit code cannot tell those two apart.
  it.each([
    ["a folder of the operator's own files", "folder"],
    ["a junction pointing at the operator's own folder", "junction"],
    ["a second name for one of the operator's files", "hardlink"]
  ])(
    "leaves a database that survived the install alone when the marker's name is taken by %s",
    (_description, shape) => {
      const stage = createStage();

      // The live body is NEWER than the backup's on purpose: this is the one case where restoring a
      // group that did not need it can be seen from outside.
      stage.write("data/shiftmgmt.sqlite", "BACKUP-OLDER");

      expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

      const liveData = path.join(stage.userDataDir, "data");
      const databasePath = path.join(liveData, "shiftmgmt.sqlite");
      const markerPath = `${databasePath}.restore-incomplete`;

      writeFileSync(databasePath, "LIVE-SURVIVED-NEWER", "utf8");

      const operatorFolder = path.join(stage.roamingAppData, "operator-scans");
      const operatorFile = path.join(stage.roamingAppData, "operator-payroll.txt");

      mkdirSync(operatorFolder, { recursive: true });
      writeFileSync(path.join(operatorFolder, "scan.txt"), "OPERATOR-SCAN", "utf8");
      writeFileSync(operatorFile, "OPERATOR-PAYROLL-YEAR-OF-WORK", "utf8");

      if (shape === "folder") {
        mkdirSync(markerPath, { recursive: true });
        writeFileSync(path.join(markerPath, "operator.txt"), "OPERATOR-CONTENT", "utf8");
      } else if (shape === "junction") {
        expect(
          spawnSync("cmd.exe", ["/c", "mklink", "/J", markerPath, operatorFolder], {
            encoding: "utf8"
          }).status
        ).toBe(0);
      } else {
        linkSync(operatorFile, markerPath);
      }

      const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

      // THE ASSERTION. Measured on 1c06c1f, where a taken name was evidence of an interrupted
      // restore all by itself: the database that survived the install was judged as caught halfway,
      // the group was restored instead of kept, and the live body came back reading BACKUP-OLDER.
      // Exit 4 and a kept backup were reported afterwards, which put nothing back.
      expect(readWhenAvailable(databasePath)).toBe("LIVE-SURVIVED-NEWER");
      expect(result.status).toBe(0);

      // And whatever was standing at the name is still standing there, untouched.
      expect(readFileSync(operatorFile, "utf8")).toBe("OPERATOR-PAYROLL-YEAR-OF-WORK");
      expect(readFileSync(path.join(operatorFolder, "scan.txt"), "utf8")).toBe("OPERATOR-SCAN");

      if (shape === "folder") {
        expect(readFileSync(path.join(markerPath, "operator.txt"), "utf8")).toBe("OPERATOR-CONTENT");
      }
    },
    60_000
  );

  it("refuses before it touches anything when the marker's name is taken and the database has to come back", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "REAL-DATABASE-BODY");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    rmSync(databasePath, { force: true });
    mkdirSync(markerPath, { recursive: true });
    writeFileSync(path.join(markerPath, "operator.txt"), "OPERATOR-CONTENT", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    // This group really does need restoring, and it cannot be: the one name this run has to write
    // is held by something that is not ours to move. The refusal comes BEFORE the first live change
    // rather than after it, so the operator is left with a backup that still holds everything.
    expect(result.status).toBe(1);
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), "utf8")
    ).toBe("REAL-DATABASE-BODY");
    expect(readFileSync(path.join(markerPath, "operator.txt"), "utf8")).toBe("OPERATOR-CONTENT");
  }, 60_000);

  it("leaves a database that survived the install alone when an ordinary marker holds the exact legacy database path", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "BACKUP-OLDER");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    writeFileSync(databasePath, "LIVE-SURVIVED-NEWER", "utf8");
    writeFileSync(markerPath, databasePath, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(readWhenAvailable(databasePath)).toBe("LIVE-SURVIVED-NEWER");
    expect(result.status).toBe(4);
    expect(readFileSync(markerPath, "utf8")).toBe(databasePath);
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-OLDER");
  }, 60_000);

  it("leaves a database that survived the install alone when the marker is a hardlink holding the exact database path", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "BACKUP-OLDER");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const operatorFile = path.join(stage.roamingAppData, "operator-payload.txt");

    writeFileSync(databasePath, "LIVE-SURVIVED-NEWER", "utf8");
    writeFileSync(operatorFile, databasePath, "utf8");
    linkSync(operatorFile, markerPath);

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(readWhenAvailable(databasePath)).toBe("LIVE-SURVIVED-NEWER");
    expect(result.status).toBe(0);
    expect(readFileSync(operatorFile, "utf8")).toBe(databasePath);
    expect(existsSync(stage.backupRoot)).toBe(false);
  }, 60_000);

  it("leaves a database that survived the install alone when the new marker name holds the exact legacy database path", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "BACKUP-OLDER");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markingPath = `${databasePath}.restore-incomplete-new`;

    writeFileSync(databasePath, "LIVE-SURVIVED-NEWER", "utf8");
    writeFileSync(markingPath, databasePath, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(readWhenAvailable(databasePath)).toBe("LIVE-SURVIVED-NEWER");
    expect(result.status).toBe(4);
    expect(readFileSync(markingPath, "utf8")).toBe(databasePath);
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-OLDER");
  }, 60_000);

  it("refuses before touching live files when a genuine V1 marker is locked during a partial restore", async () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL-COMMITS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    writeFileSync(databasePath, "LIVE-MAIN-INITIAL", "utf8");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL-INITIAL");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM-INITIAL");
    writeFileSync(`${databasePath}.restore-part`, "LIVE-MAIN-STAGED", "utf8");

    const normalizedPath = path.resolve(databasePath);
    const pathBase64 = Buffer.from(normalizedPath, "utf8").toString("base64");
    const v1Content = `SHIFTMGMT_RESTORE_RECORD_V1\n${pathBase64}\n1234567890abcdef1234567890abcdef\n`;
    writeFileSync(markerPath, v1Content, "utf8");

    const lock = await holdExclusiveHandles([markerPath], stage.roamingAppData, {
      access: "ReadWrite",
      share: "None"
    });

    let result;
    try {
      result = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    } finally {
      await lock.release();
    }

    expect(result.status).toBe(1);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-INITIAL");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL-INITIAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM-INITIAL");
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN-BODY");
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL-COMMITS");
    expect(readFileSync(markerPath, "utf8")).toBe(v1Content);
  }, 60_000);

  it("refuses before touching live files when an invalid or oversize marker accompanies partial scratch", () => {
    const stage = createStage();

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL-COMMITS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    writeFileSync(databasePath, "LIVE-MAIN-SURVIVED", "utf8");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL-SURVIVED");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM-SURVIVED");
    writeFileSync(`${databasePath}.restore-part`, "STAGED-PART", "utf8");

    const malformedMarker = "NOT_A_VALID_V1_MARKER_CONTENT";
    writeFileSync(markerPath, malformedMarker, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM-SURVIVED");
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN-BODY");
    expect(
      readFileSync(path.join(stage.backupRoot, "ShiftMgmt", "data", "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL-COMMITS");
    expect(readFileSync(markerPath, "utf8")).toBe(malformedMarker);
  }, 60_000);

  it("refuses and preserves operator file when an unknown ordinary file occupies the marker name and a restore is needed", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-DATABASE");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Live database is missing - this group really needs a restore.
    rmSync(databasePath, { force: true });
    writeFileSync(markerPath, "OPERATOR-IRREPLACEABLE-CONTENT", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(existsSync(databasePath)).toBe(false);
    expect(readFileSync(markerPath, "utf8")).toBe("OPERATOR-IRREPLACEABLE-CONTENT");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-DATABASE");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("refuses before touching live files when primary marker is owned current but secondary is an occupied directory", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const markingPath = `${databasePath}.restore-incomplete-new`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM");
    writeFileSync(`${databasePath}-wal.restore-part`, "STAGED-SCRATCH", "utf8");

    const normalizedPath = path.resolve(databasePath);
    const pathBase64 = Buffer.from(normalizedPath, "utf8").toString("base64");
    const v1Content = `SHIFTMGMT_RESTORE_RECORD_V1\n${pathBase64}\n11112222333344445555666677778888\n`;
    writeFileSync(markerPath, v1Content, "utf8");

    mkdirSync(markingPath, { recursive: true });
    writeFileSync(path.join(markingPath, "child.txt"), "CHILD-DATA", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(readFileSync(markerPath, "utf8")).toBe(v1Content);
    expect(readFileSync(path.join(markingPath, "child.txt"), "utf8")).toBe("CHILD-DATA");
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("refuses before touching live files when primary marker is absent but secondary is occupied unknown", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const markingPath = `${databasePath}.restore-incomplete-new`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    rmSync(databasePath, { force: true });
    writeFileSync(markingPath, "OPERATOR-SECONDARY-CONTENT", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(existsSync(markerPath)).toBe(false);
    expect(readFileSync(markingPath, "utf8")).toBe("OPERATOR-SECONDARY-CONTENT");
    expect(existsSync(databasePath)).toBe(false);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("preserves operator replacement file and reports exit 4 when marker path is replaced before identity cleanup", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Live database is missing, requiring a successful restore.
    rmSync(databasePath, { force: true });

    // Inject code right before marker cleanup loop:
    // move genuine marker to .moved and plant operator replacement file at original marker path
    const injectionCode = [
      `$targetMarker = "${markerPath.replace(/\\/g, "\\\\")}"`,
      `if (Test-Path -LiteralPath $targetMarker) {`,
      `  Move-Item -LiteralPath $targetMarker -Destination "$targetMarker.moved" -Force`,
      `  Set-Content -LiteralPath $targetMarker -Value "OPERATOR-REPLACEMENT" -Encoding UTF8`,
      `}`
    ].join("\n");

    const cleanupAnchor = "foreach ($recordPath in $markerToCleanup) {";
    const result = runScriptWithInjectedCode(cleanupAnchor, injectionCode, stage, "Restore");

    expect(result.status).toBe(4);
    expect(readWhenAvailable(databasePath)).toBe("BACKUP-MAIN");
    expect(readFileSync(markerPath, "utf8")).toContain("OPERATOR-REPLACEMENT");
    expect(existsSync(`${markerPath}.moved`)).toBe(true);
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
  }, 60_000);

  it("refuses rollback and keeps live newer when legacy marker has scratch but live main bytes differ from backup", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN-NEWER");
    writeFileSync(markerPath, databasePath, "utf8");
    writeFileSync(`${databasePath}-wal.restore-part`, "STAGED-WAL", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-NEWER");
    expect(readFileSync(markerPath, "utf8")).toBe(databasePath);
    expect(readFileSync(`${databasePath}-wal.restore-part`, "utf8")).toBe("STAGED-WAL");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("leaves live database alone and reports exit 4 when genuine V1 marker is locked without scratch", async () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN-SURVIVED");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");

    const normalizedPath = path.resolve(databasePath);
    const pathBase64 = Buffer.from(normalizedPath, "utf8").toString("base64");
    const v1Content = `SHIFTMGMT_RESTORE_RECORD_V1\n${pathBase64}\n99998888777766665555444433332222\n`;
    writeFileSync(markerPath, v1Content, "utf8");

    const lock = await holdExclusiveHandles([markerPath], stage.roamingAppData, {
      access: "ReadWrite",
      share: "None"
    });

    let result;
    try {
      result = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    } finally {
      await lock.release();
    }

    expect(result.status).toBe(4);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readFileSync(markerPath, "utf8")).toBe(v1Content);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("refuses before touching live files when marker size exceeds real cap of 256KB", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN");
    writeFileSync(`${databasePath}.restore-part`, "STAGED", "utf8");

    // Real cap is 262144 bytes, so 262145 bytes is TooLarge
    const oversizeMarker = "X".repeat(262145);
    writeFileSync(markerPath, oversizeMarker, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN");
    expect(readFileSync(markerPath, "utf8")).toBe(oversizeMarker);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("refuses and keeps live when primary marker is owned current but secondary is occupied directory without scratch", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const markingPath = `${databasePath}.restore-incomplete-new`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN-SURVIVED");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM");

    const normalizedPath = path.resolve(databasePath);
    const pathBase64 = Buffer.from(normalizedPath, "utf8").toString("base64");
    const v1Content = `SHIFTMGMT_RESTORE_RECORD_V1\n${pathBase64}\n11112222333344445555666677778888\n`;
    writeFileSync(markerPath, v1Content, "utf8");

    mkdirSync(markingPath, { recursive: true });
    writeFileSync(path.join(markingPath, "child.txt"), "OPERATOR-CHILD", "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM");
    expect(readFileSync(markerPath, "utf8")).toBe(v1Content);
    expect(readFileSync(path.join(markingPath, "child.txt"), "utf8")).toBe("OPERATOR-CHILD");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-shm"), "utf8")
    ).toBe("BACKUP-SHM");
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect((result.stderr + result.stdout).replace(/\r?\n\s*/g, "")).toContain(markingPath);
  }, 60_000);

  it("refuses and keeps live when primary marker is occupied directory but secondary is owned current without scratch", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const markingPath = `${databasePath}.restore-incomplete-new`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN-SURVIVED");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM");

    mkdirSync(markerPath, { recursive: true });
    writeFileSync(path.join(markerPath, "child.txt"), "OPERATOR-CHILD", "utf8");

    const normalizedPath = path.resolve(databasePath);
    const pathBase64 = Buffer.from(normalizedPath, "utf8").toString("base64");
    const v1Content = `SHIFTMGMT_RESTORE_RECORD_V1\n${pathBase64}\n11112222333344445555666677778888\n`;
    writeFileSync(markingPath, v1Content, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(1);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM");
    expect(readFileSync(path.join(markerPath, "child.txt"), "utf8")).toBe("OPERATOR-CHILD");
    expect(readFileSync(markingPath, "utf8")).toBe(v1Content);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-shm"), "utf8")
    ).toBe("BACKUP-SHM");
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect((result.stderr + result.stdout).replace(/\r?\n\s*/g, "")).toContain(markerPath);
  }, 60_000);

  it("leaves live database alone and reports exit 4 when malformed primary is paired with locked current secondary without scratch", async () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const markingPath = `${databasePath}.restore-incomplete-new`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN-SURVIVED");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM");

    writeFileSync(markerPath, "GENERIC-FOREIGN-CONTENT-WITHOUT-MAGIC", "utf8");

    const normalizedPath = path.resolve(databasePath);
    const pathBase64 = Buffer.from(normalizedPath, "utf8").toString("base64");
    const v1Content = `SHIFTMGMT_RESTORE_RECORD_V1\n${pathBase64}\n22223333444455556666777788889999\n`;
    writeFileSync(markingPath, v1Content, "utf8");

    const lock = await holdExclusiveHandles([markingPath], stage.roamingAppData, {
      access: "ReadWrite",
      share: "None"
    });

    let result;
    try {
      result = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    } finally {
      await lock.release();
    }

    expect(result.status).toBe(4);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM");
    expect(readFileSync(markerPath, "utf8")).toBe("GENERIC-FOREIGN-CONTENT-WITHOUT-MAGIC");
    expect(readFileSync(markingPath, "utf8")).toBe(v1Content);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-shm"), "utf8")
    ).toBe("BACKUP-SHM");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("leaves live database alone and reports exit 4 when primary marker has V1 magic but is malformed without scratch", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN-SURVIVED");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM");

    const malformedV1 = "SHIFTMGMT_RESTORE_RECORD_V1\nNOT-VALID-BASE64\nINVALID-GUID\n";
    writeFileSync(markerPath, malformedV1, "utf8");

    const result = runScript("Restore", stage.backupRoot, stage.roamingAppData);

    expect(result.status).toBe(4);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM");
    expect(readFileSync(markerPath, "utf8")).toBe(malformedV1);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-shm"), "utf8")
    ).toBe("BACKUP-SHM");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("leaves live database alone and reports exit 4 reporting all uncertain unknown aliases when both are uncertain", async () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const markingPath = `${databasePath}.restore-incomplete-new`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    stage.write("data/shiftmgmt.sqlite", "LIVE-MAIN-SURVIVED");
    stage.write("data/shiftmgmt.sqlite-wal", "LIVE-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "LIVE-SHM");

    const malformedV1 = "SHIFTMGMT_RESTORE_RECORD_V1\nBAD-BASE64\nBAD-GUID\n";
    writeFileSync(markerPath, malformedV1, "utf8");

    const normalizedPath = path.resolve(databasePath);
    const pathBase64 = Buffer.from(normalizedPath, "utf8").toString("base64");
    const v1Content = `SHIFTMGMT_RESTORE_RECORD_V1\n${pathBase64}\n33334444555566667777888899990000\n`;
    writeFileSync(markingPath, v1Content, "utf8");

    const lock = await holdExclusiveHandles([markingPath], stage.roamingAppData, {
      access: "ReadWrite",
      share: "None"
    });

    let result;
    try {
      result = runScript("Restore", stage.backupRoot, stage.roamingAppData);
    } finally {
      await lock.release();
    }

    expect(result.status).toBe(4);
    expect(readWhenAvailable(databasePath)).toBe("LIVE-MAIN-SURVIVED");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM");
    expect(readFileSync(markerPath, "utf8")).toBe(malformedV1);
    expect(readFileSync(markingPath, "utf8")).toBe(v1Content);
    expect(existsSync(markerPath)).toBe(true);
    expect(existsSync(markingPath)).toBe(true);
    expect(existsSync(stage.backupRoot)).toBe(true);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-shm"), "utf8")
    ).toBe("BACKUP-SHM");
    expect(result.stdout).toContain(`UNCHECKED ${markerPath}`);
    expect(result.stdout).toContain(`UNCHECKED ${markingPath}`);
  }, 60_000);

  it("blocks stage replacement before marker-gate failure and deletes only held handle", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markingPath = `${databasePath}.restore-incomplete-new`;
    const stagedMain = `${databasePath}.restore-part`;
    const sentinelPath = path.join(stage.roamingAppData, "sentinel-41.txt");

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Live main is missing so restore is needed
    rmSync(databasePath, { force: true });
    writeFileSync(`${databasePath}-wal`, "LIVE-WAL", "utf8");
    writeFileSync(`${databasePath}-shm`, "LIVE-SHM", "utf8");

    const injectionCode = [
      `$targetStaged = "${stagedMain.replace(/\\/g, "\\\\")}"`,
      `$targetSentinel = "${sentinelPath.replace(/\\/g, "\\\\")}"`,
      `$targetMarking = "${markingPath.replace(/\\/g, "\\\\")}"`,
      `try {`,
      `  Remove-Item -LiteralPath $targetStaged -Force -ErrorAction Stop`,
      `  Set-Content -LiteralPath $targetStaged -Value "ATTACKER-REPLACEMENT" -Encoding UTF8 -ErrorAction Stop`,
      `  Set-Content -LiteralPath $targetSentinel -Value "REPLACED" -Encoding UTF8`,
      `} catch {`,
      `  Set-Content -LiteralPath $targetSentinel -Value "BLOCKED" -Encoding UTF8`,
      `}`,
      `New-Item -ItemType Directory -Force -Path $targetMarking | Out-Null`,
      `Set-Content -LiteralPath "$targetMarking/child.txt" -Value "OPERATOR-CHILD" -Encoding UTF8`
    ].join("\n");

    const gateAnchor = "$markerPath = Get-RestoreMarkerPath -MainPath $Group.MainPath";
    const result = runScriptWithInjectedCode(gateAnchor, injectionCode, stage, "Restore");

    expect(readFileSync(sentinelPath, "utf8").trim()).toBe("BLOCKED");
    expect(result.status).toBe(1);
    expect(existsSync(databasePath)).toBe(false);
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("LIVE-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("LIVE-SHM");
    expect(readFileSync(path.join(markingPath, "child.txt"), "utf8").replace(/^\ufeff/, "").trim()).toBe("OPERATOR-CHILD");
    expect(readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")).toBe("BACKUP-MAIN");
    expect(readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")).toBe("BACKUP-WAL");
    expect(readFileSync(path.join(backupData, "shiftmgmt.sqlite-shm"), "utf8")).toBe("BACKUP-SHM");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("blocks stage replacement immediately before commit and commits backup bytes", () => {
    const stage = createStage();
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const stagedMain = `${databasePath}.restore-part`;
    const sentinelPath = path.join(stage.roamingAppData, "sentinel-42.txt");

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN-EXACT-BODY");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Live main is missing
    rmSync(databasePath, { force: true });

    const injectionCode = [
      `$targetStaged = "${stagedMain.replace(/\\/g, "\\\\")}"`,
      `$targetSentinel = "${sentinelPath.replace(/\\/g, "\\\\")}"`,
      `try {`,
      `  $fs = [System.IO.File]::Open($targetStaged, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)`,
      `  $payload = [System.Text.Encoding]::UTF8.GetBytes("ATTACKER-PAYLOAD-MATCH")`,
      `  $fs.Write($payload, 0, $payload.Length)`,
      `  $fs.Close()`,
      `  Set-Content -LiteralPath $targetSentinel -Value "REPLACED" -Encoding UTF8`,
      `} catch {`,
      `  Set-Content -LiteralPath $targetSentinel -Value "BLOCKED" -Encoding UTF8`,
      `}`
    ].join("\n");

    const commitAnchor = "$pair.CommitReplace($pair.FinalPath)";
    const result = runScriptWithInjectedCode(commitAnchor, injectionCode, stage, "Restore");

    expect(readFileSync(sentinelPath, "utf8").trim()).toBe("BLOCKED");
    expect(result.status).toBe(0);
    expect(readWhenAvailable(databasePath)).toBe("BACKUP-MAIN-EXACT-BODY");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("BACKUP-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("BACKUP-SHM");
    expect(existsSync(stage.backupRoot)).toBe(false);
  }, 60_000);

  it("refuses cleanup and keeps backup when current marker is overwritten in place before cleanup", () => {
    const stage = createStage();
    const backupData = path.join(stage.backupRoot, "ShiftMgmt", "data");
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;

    stage.write("data/shiftmgmt.sqlite", "BACKUP-MAIN");
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    // Live database is missing, requiring a successful restore.
    rmSync(databasePath, { force: true });

    // Overwrite marker IN-PLACE (same file identity: same volume serial and file index)
    const injectionCode = [
      `$targetMarker = "${markerPath.replace(/\\/g, "\\\\")}"`,
      `if (Test-Path -LiteralPath $targetMarker) {`,
      `  $fs = [System.IO.File]::Open($targetMarker, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)`,
      `  $payload = [System.Text.Encoding]::UTF8.GetBytes("OPERATOR-IN-PLACE-OVERWRITE")`,
      `  $fs.SetLength(0)`,
      `  $fs.Write($payload, 0, $payload.Length)`,
      `  $fs.Close()`,
      `}`
    ].join("\n");

    const cleanupAnchor = "foreach ($recordPath in $markerToCleanup) {";
    const result = runScriptWithInjectedCode(cleanupAnchor, injectionCode, stage, "Restore");

    expect(result.status).toBe(4);
    expect(readWhenAvailable(databasePath)).toBe("BACKUP-MAIN");
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("BACKUP-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("BACKUP-SHM");
    expect(readFileSync(markerPath, "utf8")).toBe("OPERATOR-IN-PLACE-OVERWRITE");
    expect(result.stdout).toContain(`UNCHECKED ${markerPath}`);
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite"), "utf8")
    ).toBe("BACKUP-MAIN");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-wal"), "utf8")
    ).toBe("BACKUP-WAL");
    expect(
      readFileSync(path.join(backupData, "shiftmgmt.sqlite-shm"), "utf8")
    ).toBe("BACKUP-SHM");
    expect(existsSync(stage.backupRoot)).toBe(true);
  }, 60_000);

  it("keeps committed stage handles open until marker cleanup and isolates the child cwd", () => {
    const stage = createStage();
    const liveData = path.join(stage.userDataDir, "data");
    const databasePath = path.join(liveData, "shiftmgmt.sqlite");
    const markerPath = `${databasePath}.restore-incomplete`;
    const sentinelPath = path.join(stage.roamingAppData, "sentinel-51.txt");
    const isolatedCwd = resolvePowerShellCwd(stage.backupRoot, stage.roamingAppData);
    const backupMain = "BACKUP-MAIN-1234";
    const operatorMain = "OPERATOR-BYTES!!";

    expect(Buffer.byteLength(operatorMain)).toBe(Buffer.byteLength(backupMain));

    stage.write("data/shiftmgmt.sqlite", backupMain);
    stage.write("data/shiftmgmt.sqlite-wal", "BACKUP-WAL");
    stage.write("data/shiftmgmt.sqlite-shm", "BACKUP-SHM");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    rmSync(databasePath, { force: true });
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });

    const injectionCode = [
      `$targetFinal = "${databasePath.replace(/\\/g, "\\\\")}"`,
      `$targetSentinel = "${sentinelPath.replace(/\\/g, "\\\\")}"`,
      `$replacementStream = $null`,
      `try {`,
      `  $replacementStream = [System.IO.File]::Open($targetFinal, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)`,
      `  $payload = [System.Text.Encoding]::UTF8.GetBytes("${operatorMain}")`,
      `  $replacementStream.SetLength(0)`,
      `  $replacementStream.Write($payload, 0, $payload.Length)`,
      `  Set-Content -LiteralPath $targetSentinel -Value "REPLACED" -Encoding UTF8`,
      `} catch {`,
      `  Set-Content -LiteralPath $targetSentinel -Value "BLOCKED" -Encoding UTF8`,
      `} finally {`,
      `  if ($null -ne $replacementStream) { $replacementStream.Dispose() }`,
      `}`
    ].join("\n");

    const cleanupAnchor = "foreach ($recordPath in $markerToCleanup) {";
    const result = runScriptWithInjectedCode(cleanupAnchor, injectionCode, stage, "Restore");

    expect(result.status).toBe(0);
    expect(readFileSync(sentinelPath, "utf8").trim()).toBe("BLOCKED");
    expect(readWhenAvailable(databasePath)).toBe(backupMain);
    expect(readWhenAvailable(`${databasePath}-wal`)).toBe("BACKUP-WAL");
    expect(readWhenAvailable(`${databasePath}-shm`)).toBe("BACKUP-SHM");
    expect(existsSync(markerPath)).toBe(false);
    expect(existsSync(`${databasePath}.restore-part`)).toBe(false);
    expect(existsSync(`${databasePath}-wal.restore-part`)).toBe(false);
    expect(existsSync(`${databasePath}-shm.restore-part`)).toBe(false);
    expect(existsSync(stage.backupRoot)).toBe(false);
    expect(
      readdirSync(isolatedCwd).filter((name) => name.startsWith("shiftmgmt.sqlite"))
    ).toEqual([]);
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

  it("never deletes a kept backup holding the only copy of a file, however many there are", () => {
    // The test above builds five kept backups and asserts five survive, which cannot fail a rule
    // that keeps five - measured, in review, against a reintroduced keep-newest-5. This one raises
    // the number until no plausible cap can hide under it, and it does that without paying for one
    // powershell run per kept backup: the sweep enumerates whatever carries the prefix and judges
    // it by what is inside it, with no memory of how it got there, so the kept backups can be built
    // by hand. The redundant control at the end is what proves a hand-built one really does go
    // through the same verdict as a script-made one.
    //
    // The bound, stated rather than implied: this catches a keep-newest-N and a keep-oldest-N rule
    // for every N below 201, and an age rule for any cutoff shorter than the year and a half these
    // are dated. Above 201 nothing here bites, and no text rule can be written that cannot be
    // phrased around - see the reading aid at the bottom of this file, which says the same.
    const stage = createStage();
    const parent = path.dirname(stage.backupRoot);
    const base = path.basename(stage.backupRoot);
    const keptBackups = 200;

    // In every kept backup and never missing from the live folder, so it can never be the reason
    // one of them is kept.
    stage.write("data/accounts.json", "ACCOUNTS");

    expect(runScript("Backup", stage.backupRoot, stage.roamingAppData).status).toBe(0);

    const plant = (stamp: string, onlyCopy: string | null) => {
      const root = path.join(parent, `${base}-unrestored-${stamp}`);
      const dataDir = path.join(root, "ShiftMgmt", "data");

      mkdirSync(dataDir, { recursive: true });
      writeFileSync(path.join(dataDir, "accounts.json"), "ACCOUNTS", "utf8");

      if (onlyCopy) {
        writeFileSync(path.join(dataDir, onlyCopy), `ONLY-COPY-${onlyCopy}`, "utf8");
      }

      return root;
    };

    const planted: string[] = [];

    for (let index = 1; index <= keptBackups; index += 1) {
      planted.push(
        plant(`20240102-${String(index).padStart(6, "0")}`, `unrecovered-${index}.txt`)
      );
    }

    // Holds nothing the live folder is missing, so the redundancy verdict has to drop this one.
    // Without it the test would pass against a script that simply never deletes anything, which is
    // not the rule either - a kept backup with nothing left to give has to be reclaimed.
    const redundant = plant("20240101-000000", null);

    planted.push(redundant);

    const stale = "2024-01-15T03:00:00";
    const backdated = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$stale = [datetime]'${stale}'; ` +
          `$roots = @(Get-ChildItem -LiteralPath '${parent}' -Directory | ` +
          `Where-Object { $_.Name -like '${base}-unrestored-*' }); ` +
          "$roots | ForEach-Object { $_.CreationTime = $stale; $_.LastWriteTime = $stale }; " +
          "@($roots | Where-Object { ($_.CreationTime -eq $stale) -and " +
          "($_.LastWriteTime -eq $stale) }).Count"
      ],
      { encoding: "utf8" }
    );

    // Asserted rather than assumed: node cannot set a creation time, and if this step quietly did
    // nothing the age half of this test would be testing nothing at all.
    expect(backdated.stdout.trim()).toBe(String(planted.length));

    const second = runScript("Backup", stage.backupRoot, stage.roamingAppData);

    expect(second.status).toBe(0);

    const keptRoots = readdirSync(parent).filter((name) =>
      name.startsWith(`${base}-unrestored-`)
    );
    const recoverable: string[] = [];

    for (let index = 1; index <= keptBackups; index += 1) {
      const fileName = `unrecovered-${index}.txt`;
      const held = keptRoots.find((root) =>
        existsSync(path.join(parent, root, "ShiftMgmt", "data", fileName))
      );

      if (
        held &&
        readFileSync(path.join(parent, held, "ShiftMgmt", "data", fileName), "utf8") ===
          `ONLY-COPY-${fileName}`
      ) {
        recoverable.push(fileName);
      }
    }

    // By CONTENT, so a rule that keeps the folder and empties it fails here too.
    expect(recoverable).toHaveLength(keptBackups);
    // And by count: the 200 that hold something unique, and neither of the two that do not - the
    // control planted above and the one this run set aside on its way in.
    expect(keptRoots).toHaveLength(keptBackups);
    expect(existsSync(redundant)).toBe(false);
    // Two powershell runs of the script for two hundred kept backups, plus the one that back-dates.
  }, 180_000);

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

  // What is left of a line once a trailing comment is taken off it. The quote state is tracked so a
  // ';' or a '#' inside a STRING is not mistaken for the start of one: build/installer.nsh carries
  // whole PowerShell one-liners, semicolons and all, inside single-quoted NSIS strings.
  const codeOf = (line: string, commentStarters: string) => {
    let quote = "";

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;

      if (quote) {
        if (character === quote) {
          quote = "";
        }

        continue;
      }

      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }

      if (commentStarters.includes(character)) {
        return line.slice(0, index);
      }
    }

    return line;
  };

  // One arm of the script's `switch ($Mode)`. Both arms are indented exactly two spaces and close
  // with a "}" at that same indent - every brace inside them is deeper - so this needs no parser.
  const modeArmText = (text: string, mode: string) => {
    const start = text.indexOf(`  "${mode}" {`);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = text.indexOf("\n  }", start);

    expect(end).toBeGreaterThan(start);

    return text.slice(start, end + 4);
  };

  const nsisFunctionText = (text: string, name: string) => {
    const start = text.indexOf(`Function ${name}`);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = text.indexOf("FunctionEnd", start);

    expect(end).toBeGreaterThan(start);

    return text.slice(start, end);
  };

  // Both ways a PowerShell script can hand a number back. `exit <n>` at the end of a code line is
  // the house style here; `[Environment]::Exit(<n>)` ends the process just as dead, and was
  // measured walking straight past the earlier reader, which knew only the first form.
  const exitCodesIn = (text: string) =>
    new Set(
      codeLines(text)
        .map((line) => codeOf(line, "#"))
        .flatMap((line) => [
          ...Array.from(line.matchAll(/(?:^|\s)exit\s+(\d+)\s*$/g)),
          ...Array.from(line.matchAll(/\[(?:System\.)?Environment\]::Exit\(\s*(\d+)\s*\)/g))
        ])
        .map((match) => match[1]!)
    );

  // An exit whose value this reader cannot resolve to a literal - `exit $code`, a bare `exit`,
  // `[Environment]::Exit($code)`. That is not the same as "no exit here": it is an exit nothing
  // below can compare against the installer's branches, so it fails on its own rather than being
  // counted as zero exits and disappearing. It reads code lines, so the word inside a STRING would
  // be flagged too - noisy, but in the safe direction, and the failure names the line.
  const unresolvedExitsIn = (text: string) =>
    codeLines(text)
      .map((line) => codeOf(line, "#").trim())
      .filter(
        (line) =>
          (/(?:^|\s)exit\b/.test(line) && !/(?:^|\s)exit\s+\d+\s*$/.test(line)) ||
          (/\[(?:System\.)?Environment\]::Exit\(/.test(line) &&
            !/\[(?:System\.)?Environment\]::Exit\(\s*\d+\s*\)/.test(line))
      );

  // Where a branch GOES, not merely that one exists. NSIS reads
  // `StrCmp str1 str2 jump_if_equal [jump_if_not_equal]`, so the third word is the answer this code
  // gets. A code whose equal-branch lands on the phase's own failure label is not answered - it is
  // routed to the bad-news message, which in the backup phase means Abort. Asking only whether the
  // number is MENTIONED in a StrCmp was measured passing a mutant that sent the backup phase's
  // exit 3 straight to update_backup_failed: green suite, aborted update, no message when silent.
  //
  // Known limit, stated rather than implied: this follows one hop. A branch that jumps to some
  // other label which then falls into the failure label is still counted as an answer.
  const answeredCodesIn = (text: string, failureLabel: string) =>
    new Set(
      codeLines(text)
        .map((line) => codeOf(line, ";#"))
        .flatMap((line) => Array.from(line.matchAll(/StrCmp\s+\$0\s+"(\d+)"\s+(\S+)/g)))
        .filter((match) => match[2] !== failureLabel)
        .map((match) => match[1]!)
    );

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

  it("has an answer for every exit code the script can produce, in the phase that produces it", () => {
    // The exit code is the whole contract between the two files, and "anything else" is the failure
    // message - which says the fill-in step did not run to completion. A number the script exits
    // with that nothing there branches on therefore tells the operator the opposite of the truth,
    // which is exactly what code 3 did before it got a branch of its own.
    //
    // Asked once per PHASE, not once for the pair. The two phases read the same number through
    // different eyes: PrepareUpdateBackup branches on "0" alone and sends everything else to Abort,
    // so a code that is good news during the restore - 3, "finished, something was set aside" -
    // would stop an ordinary update dead if the backup phase ever produced it. One flat set over
    // both NSIS functions calls that pair correct, which was measured.
    //
    // Both sides read CODE lines only, and both have any trailing comment taken off first. A
    // commented-out StrCmp is not a branch, and `exit 5  # a reason` - the house style everywhere
    // else in that script - is still an exit. Both of those were measured slipping through before.
    const nsh = readFileSync(nshPath, "utf8");
    const script = readFileSync(scriptPath, "utf8");
    // Everything outside both arms - the parameter block, every function body, anything after the
    // switch - is reachable from either mode, so it counts towards both.
    const shared = script
      .replace(modeArmText(script, "Backup"), "")
      .replace(modeArmText(script, "Restore"), "");
    const phases = [
      { mode: "Backup", nsisFunction: "PrepareUpdateBackup", failureLabel: "update_backup_failed" },
      {
        mode: "Restore",
        nsisFunction: "RestoreUpdateBackup",
        failureLabel: "restore_backup_failed"
      }
    ].map((phase) => {
      const functionText = nsisFunctionText(nsh, phase.nsisFunction);

      // The failure label is what "answered" is measured against, so a rename has to go red here
      // rather than quietly turn every branch into an answer.
      expect(codeLines(functionText).map((line) => line.trim())).toContain(
        `${phase.failureLabel}:`
      );

      return {
        mode: phase.mode,
        produced: Array.from(
          new Set([...exitCodesIn(modeArmText(script, phase.mode)), ...exitCodesIn(shared)])
        ),
        answered: answeredCodesIn(functionText, phase.failureLabel)
      };
    });

    // Neither half may be vacuous: a renamed NSIS function or a rewritten switch would otherwise
    // turn this into a test that passes because it found nothing to compare.
    expect(phases.map((phase) => phase.produced.length)).not.toContain(0);
    expect(phases.map((phase) => phase.answered.size)).not.toContain(0);

    // An exit the reader cannot resolve is a hole in the comparison, not an absence of exits.
    expect(unresolvedExitsIn(script)).toEqual([]);

    expect(
      phases.flatMap((phase) =>
        phase.produced
          .filter((code) => !phase.answered.has(code))
          .map((code) => `${phase.mode} exit ${code}`)
      )
    ).toEqual([]);
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
    // and not by count". The BEHAVIOURAL test enforces it - "never deletes a kept backup holding
    // the only copy of a file, however many there are" - and that is the one that bites. This is a
    // reading aid over the same function, and it is worth being exact about what it can and cannot
    // see, because saying otherwise is how this guard came to be written too small twice.
    //
    // It cannot see: a rule phrased in arithmetic this list does not name, and any deletion written
    // OUTSIDE this function. Both were measured. What it does see is the shape of the historical
    // rule, in the place a maintainer would rewrite it, and any second deletion inside the function
    // - which is what all three of the rewrites tried in review needed.
    const sweep = functionText(readFileSync(scriptPath, "utf8"), "Move-UnrestoredBackupAside");
    const lines = sweep.split(/\r?\n/).filter((line) => !line.trim().startsWith("#"));
    const arithmetic = lines.filter(
      (line) =>
        /\.Count\s*-(gt|ge|lt|le)\b/i.test(line) ||
        /Select-Object[^|]*-(Skip|First|Last)\b/i.test(line) ||
        /\bMeasure-Object\b/i.test(line)
    );

    expect(arithmetic).toEqual([]);

    // The structural half: this function may delete exactly one thing, and only where the
    // redundancy verdict is what said so. A keep-newest-N rule or an age cutoff needs a deletion of
    // its own, whatever arithmetic it is phrased in, so this half catches all three rewrites the
    // list above misses.
    const deletionIndexes = lines
      .map((line, index) =>
        /\bRemove-Item\b/i.test(line) ||
        /\[System\.IO\.(File|Directory)\]::Delete\b/i.test(line) ||
        /\.Delete\(\)/i.test(line)
          ? index
          : -1
      )
      .filter((index) => index >= 0);

    expect(deletionIndexes).toHaveLength(1);
    expect(
      lines
        .slice(0, deletionIndexes[0])
        .reverse()
        .find((line) => /^\s*if\s*\(/.test(line)) ?? "nothing decides the one deletion here"
    ).toContain("Test-KeptBackupIsRedundant");
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
