const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const packageJson = require("../../package.json");

const adminPassword = "admin1234";
const adminChangedPassword = "AdminChanged123!";

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

const runSilentInstaller = (installerPath, installDir, label) => {
  const installResult = childProcess.spawnSync(
    installerPath,
    ["/S", `/D=${installDir}`],
    {
      cwd: path.dirname(installerPath),
      encoding: "utf8",
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

const detectStage = async (page) =>
  page.evaluate(() => {
    if (document.querySelector(".console-shell")) {
      return "dashboard";
    }

    const form = document.querySelector(".login-form");

    if (!(form instanceof HTMLFormElement)) {
      return "unknown";
    }

    const inputCount = form.querySelectorAll("input").length;
    const hasPasswordChangeButtons = Boolean(form.querySelector(".button-row"));
    const hasLoginLayout = Boolean(document.querySelector(".login-layout"));
    const hasLoginError = Boolean(form.querySelector(".error-copy"));
    const hasPasswordChangeError = Boolean(form.querySelector(".form-error-text"));

    if (hasPasswordChangeButtons && inputCount >= 3) {
      return hasPasswordChangeError ? "password-change-error" : "password-change";
    }

    if (hasLoginLayout && inputCount >= 2) {
      return hasLoginError ? "login-error" : "login";
    }

    return "unknown";
  });

const waitForStageChange = async (page) => {
  await page.waitForFunction(
    () => {
      if (document.querySelector(".console-shell")) {
        return true;
      }

      const form = document.querySelector(".login-form");

      if (!(form instanceof HTMLFormElement)) {
        return false;
      }

      const inputCount = form.querySelectorAll("input").length;
      const hasPasswordChangeButtons = Boolean(form.querySelector(".button-row"));

      if (hasPasswordChangeButtons && inputCount >= 3) {
        return true;
      }

      if (form.querySelector(".error-copy") || form.querySelector(".form-error-text")) {
        return true;
      }

      return false;
    },
    undefined,
    { timeout: 60000 },
  );

  return detectStage(page);
};

const submitLogin = async (page, password) => {
  const form = page.locator(".login-layout .login-form");
  const inputs = form.locator("input");

  await inputs.nth(0).fill("admin");
  await inputs.nth(1).fill(password);
  await form.locator(".login-submit").click();
  return waitForStageChange(page);
};

const submitPasswordChange = async (page, currentPassword, nextPassword) => {
  const form = page.locator(".login-panel .login-form");
  const inputs = form.locator("input");

  await inputs.nth(0).fill(currentPassword);
  await inputs.nth(1).fill(nextPassword);
  await inputs.nth(2).fill(nextPassword);
  await form.locator(".button-row .primary-button").click();
  return waitForStageChange(page);
};

const ensureAuthenticated = async (page) => {
  await page.waitForFunction(
    () => Boolean(document.querySelector(".login-form")) || Boolean(document.querySelector(".console-shell")),
    undefined,
    { timeout: 60000 },
  );

  let stage = await detectStage(page);

  if (stage === "dashboard") {
    return;
  }

  if (stage === "login" || stage === "login-error") {
    stage = await submitLogin(page, adminPassword);
  }

  if (stage === "dashboard") {
    return;
  }

  if (stage === "password-change" || stage === "password-change-error") {
    stage = await submitPasswordChange(page, adminPassword, adminChangedPassword);
  }

  if (stage === "dashboard") {
    return;
  }

  if (stage === "login" || stage === "login-error") {
    stage = await submitLogin(page, adminChangedPassword);
  }

  if (stage !== "dashboard") {
    throw new Error(`authentication did not reach dashboard; finalStage=${stage}`);
  }
};

const verifyInstalledApp = async (
  installedExecutablePath,
  installDir,
  tempDataDir,
  label,
) => {
  const app = await electron.launch({
    executablePath: installedExecutablePath,
    cwd: installDir,
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
    },
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    page.on("dialog", (dialog) => dialog.accept());

    await ensureAuthenticated(page);
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
  const tempDataDir = path.join(tempRootDir, "data-root");
  const desktopShortcutPath = path.join(
    os.homedir(),
    "Desktop",
    "ShiftMgmt.lnk",
  );
  const startMenuShortcutPath = path.join(
    process.env.APPDATA ?? "",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "ShiftMgmt.lnk",
  );

  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(tempDataDir, { recursive: true });

  try {
    runSilentInstaller(installerPath, installDir, "first install");

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
      tempDataDir,
      "first install build",
    );

    runSilentInstaller(installerPath, installDir, "reinstall");

    await verifyInstalledApp(
      installedExecutablePath,
      installDir,
      tempDataDir,
      "reinstall build",
    );

    console.log(
      `SMOKE_OK installerExecutable=${installedExecutablePath} reinstall=verified`,
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
          timeout: 180000,
        },
      );
      waitForMs(2000);
    }

    deleteIfExists(desktopShortcutPath);

    if (process.env.APPDATA) {
      deleteIfExists(startMenuShortcutPath);
    }

    deleteIfExists(tempRootDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
