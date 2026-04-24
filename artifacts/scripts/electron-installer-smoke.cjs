const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { defaultAdminAuth, ensureAuthenticated } = require("./electron-auth-helpers.cjs");

const packageJson = require("../../package.json");

const waitForMs = (durationMs) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
};

const deleteIfExists = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 11) {
        console.warn(
          `SMOKE_WARN cleanupFailed path=${targetPath} message=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }

      waitForMs(750);
    }
  }
};

const writeMarkerFile = (targetPath, content) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
};

const findUninstaller = (installDir) => {
  const files = fs.readdirSync(installDir);
  return (
    files.find(
      (fileName) =>
        fileName.toLowerCase().startsWith("uninstall") &&
        fileName.endsWith(".exe"),
    ) ?? null
  );
};

const findUserDataRoot = (appDataDir) => {
  if (!fs.existsSync(appDataDir)) {
    return null;
  }

  const candidates = fs
    .readdirSync(appDataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(appDataDir, entry.name))
    .filter((candidatePath) => {
      if (!path.basename(candidatePath).toLowerCase().startsWith("shiftmgmt")) {
        return false;
      }

      return (
        fs.existsSync(path.join(candidatePath, "data", "shiftmgmt.sqlite")) ||
        fs.existsSync(path.join(candidatePath, "data", "bootstrap-credentials.json"))
      );
    });

  return candidates[0] ?? null;
};

const runSilentInstaller = (installerPath, installDir, label, env) => {
  const installResult = childProcess.spawnSync(
    installerPath,
    ["/S", `/D=${installDir}`],
    {
      cwd: path.dirname(installerPath),
      encoding: "utf8",
      env,
      timeout: 180000,
    },
  );

  if (installResult.status !== 0) {
    throw new Error(
      `${label} install failed: ${
        installResult.stderr?.trim() ||
        installResult.stdout?.trim() ||
        "silent installer returned a non-zero exit code"
      }`,
    );
  }
};

const dismissBlockingModals = async (page) => {
  const releaseNotesConfirmButton = page.locator(
    ".release-notes-overlay .primary-button",
  );

  if (await releaseNotesConfirmButton.count()) {
    await releaseNotesConfirmButton.first().click();
    await page.waitForTimeout(300);
  }

  const updateLaterButton = page.locator(".app-update-overlay .ghost-button");

  if (await updateLaterButton.count()) {
    await updateLaterButton.first().click();
    await page.waitForTimeout(300);
  }
};

const verifyInstalledApp = async (
  installedExecutablePath,
  installDir,
  label,
  env,
) => {
  const app = await electron.launch({
    executablePath: installedExecutablePath,
    cwd: installDir,
    env: {
      ...env,
    },
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    page.on("dialog", (dialog) => dialog.accept());

    await dismissBlockingModals(page);
    await ensureAuthenticated(page, defaultAdminAuth);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".route-button").length >= 6 &&
        document.querySelector(".top-strip-title h2"),
      undefined,
      { timeout: 60000 },
    );
  } catch (error) {
    throw new Error(
      `${label} verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await app.close();
  }
};

(async () => {
  const installerPath = path.resolve(
    process.cwd(),
    "release",
    `ShiftMgmt-Setup-${packageJson.version}-x64.exe`,
  );

  if (!fs.existsSync(installerPath)) {
    throw new Error(`installer not found: ${installerPath}`);
  }

  const tempRootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "shiftmgmt-installer-smoke-"),
  );
  const installDir = path.join(tempRootDir, "install-root");
  const roamingAppDataDir = path.join(tempRootDir, "AppData", "Roaming");
  const localAppDataDir = path.join(tempRootDir, "AppData", "Local");
  const programDataDir = path.join(tempRootDir, "ProgramData");
  const smokeUserDataDir = path.join(roamingAppDataDir, "shiftmgmt-v3-4");
  const desktopShortcutPath = path.join(
    os.homedir(),
    "Desktop",
    "ShiftMgmt.lnk",
  );
  const startMenuShortcutPath = path.join(
    roamingAppDataDir,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "ShiftMgmt.lnk",
  );

  const isolatedEnv = {
    ...process.env,
    APPDATA: roamingAppDataDir,
    AUTH_BOOTSTRAP_ADMIN_PASSWORD: defaultAdminAuth.currentPassword,
    LOCALAPPDATA: localAppDataDir,
    PROGRAMDATA: programDataDir,
    SHIFTMGMT_USER_DATA_DIR: smokeUserDataDir,
  };

  fs.mkdirSync(roamingAppDataDir, { recursive: true });
  fs.mkdirSync(localAppDataDir, { recursive: true });
  fs.mkdirSync(programDataDir, { recursive: true });

  try {
    runSilentInstaller(installerPath, installDir, "first install", isolatedEnv);

    const installedExecutablePath = path.join(installDir, "ShiftMgmt.exe");
    const accessExportScriptPath = path.join(
      installDir,
      "resources",
      "scripts",
      "export-access-db.ps1",
    );

    if (!fs.existsSync(installedExecutablePath)) {
      throw new Error(`installed executable not found: ${installedExecutablePath}`);
    }

    if (!fs.existsSync(accessExportScriptPath)) {
      throw new Error(`installed access export script not found: ${accessExportScriptPath}`);
    }

    await verifyInstalledApp(
      installedExecutablePath,
      installDir,
      "first install build",
      isolatedEnv,
    );

    const userDataRoot = findUserDataRoot(roamingAppDataDir);

    if (!userDataRoot) {
      throw new Error(`installed user data root not found under: ${roamingAppDataDir}`);
    }

    const markerFilePath = path.join(
      userDataRoot,
      "data",
      "installer-smoke-marker.json",
    );
    writeMarkerFile(markerFilePath, '{"reinstall":"preserve"}\n');

    runSilentInstaller(installerPath, installDir, "reinstall", isolatedEnv);

    await verifyInstalledApp(
      installedExecutablePath,
      installDir,
      "reinstall build",
      isolatedEnv,
    );

    if (!fs.existsSync(markerFilePath)) {
      throw new Error(`marker file was not preserved after reinstall: ${markerFilePath}`);
    }

    console.log(
      `SMOKE_OK installerExecutable=${installedExecutablePath} reinstall=verified dataPreserved=true`,
    );
  } finally {
    const uninstallerFileName = fs.existsSync(installDir)
      ? findUninstaller(installDir)
      : null;

    if (uninstallerFileName) {
      childProcess.spawnSync(
        path.join(installDir, uninstallerFileName),
        ["/S"],
        {
          cwd: installDir,
          encoding: "utf8",
          env: isolatedEnv,
          timeout: 180000,
        },
      );
      waitForMs(2000);
    }

    deleteIfExists(desktopShortcutPath);

    deleteIfExists(startMenuShortcutPath);

    deleteIfExists(tempRootDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
