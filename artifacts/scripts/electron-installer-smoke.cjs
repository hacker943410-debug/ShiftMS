const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const packageJson = require("../../package.json");

const ensureAuthenticated = async (page) => {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.some((button) => {
      const text = button.textContent ?? "";
      return text.includes("로그인") || text.includes("대시보드");
    });
  }, undefined, { timeout: 60000 });

  const dashboardButton = page.getByRole("button", { name: /대시보드/ });

  if ((await dashboardButton.count()) > 0) {
    return;
  }

  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForSelector("button:has-text('대시보드')", { timeout: 60000 });
};

const waitForMs = (durationMs) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
};

const deleteIfExists = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 7) {
        console.warn(`SMOKE_WARN cleanupFailed path=${targetPath} message=${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      waitForMs(500);
    }
  }
};

const findUninstaller = (installDir) => {
  const files = fs.readdirSync(installDir);
  return files.find((fileName) => fileName.toLowerCase().startsWith("uninstall") && fileName.endsWith(".exe")) ?? null;
};

(async () => {
  const installerPath = path.resolve(
    process.cwd(),
    "release",
    `ShiftMgmt-Setup-${packageJson.version}-x64.exe`
  );

  if (!fs.existsSync(installerPath)) {
    throw new Error(`NSIS 설치본을 찾을 수 없습니다: ${installerPath}`);
  }

  const tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-installer-smoke-"));
  const installDir = path.join(tempRootDir, "install-root");
  const tempDataDir = path.join(tempRootDir, "data-root");
  const desktopShortcutPath = path.join(os.homedir(), "Desktop", "ShiftMgmt.lnk");
  const startMenuShortcutPath = path.join(
    process.env.APPDATA ?? "",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "ShiftMgmt.lnk"
  );

  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(tempDataDir, { recursive: true });

  let app = null;

  try {
    const installResult = childProcess.spawnSync(
      installerPath,
      ["/S", `/D=${installDir}`],
      {
        cwd: path.dirname(installerPath),
        encoding: "utf8",
        timeout: 180000
      }
    );

    if (installResult.status !== 0) {
      throw new Error(
        installResult.stderr?.trim() || installResult.stdout?.trim() || "NSIS 설치본 실행에 실패했습니다."
      );
    }

    const installedExecutablePath = path.join(installDir, "ShiftMgmt.exe");

    if (!fs.existsSync(installedExecutablePath)) {
      throw new Error(`설치 후 실행 파일을 찾지 못했습니다: ${installedExecutablePath}`);
    }

    app = await electron.launch({
      executablePath: installedExecutablePath,
      cwd: installDir,
      env: {
        ...process.env,
        DATA_DIR: tempDataDir
      }
    });

    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page);

    await page.getByRole("button", { name: /대시보드/ }).click();
    await page.waitForSelector("h1:has-text('교대근무 및 수당 관리 시스템 - 대시보드')", {
      timeout: 60000
    });

    console.log(`SMOKE_OK installerExecutable=${installedExecutablePath}`);
  } finally {
    if (app) {
      await app.close();
    }

    const uninstallerFileName = fs.existsSync(installDir) ? findUninstaller(installDir) : null;

    if (uninstallerFileName) {
      childProcess.spawnSync(
        path.join(installDir, uninstallerFileName),
        ["/S"],
        {
          cwd: installDir,
          encoding: "utf8",
          timeout: 180000
        }
      );
      waitForMs(1000);
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
