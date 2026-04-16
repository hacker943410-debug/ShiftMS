const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");

exports.default = async function afterPack(context) {
  if (process.platform !== "win32" || context.electronPlatformName !== "win32") {
    return;
  }

  const executableName = `${context.packager.appInfo.productFilename}.exe`;
  const executablePath = path.join(context.appOutDir, executableName);
  const iconPath = path.resolve(context.packager.info.projectDir, "build", "icon.ico");
  const rceditPath = path.resolve(
    context.packager.info.projectDir,
    "node_modules",
    "electron-winstaller",
    "vendor",
    "rcedit.exe"
  );

  if (!fs.existsSync(executablePath)) {
    throw new Error(`AfterPack icon target not found: ${executablePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`AfterPack icon source not found: ${iconPath}`);
  }

  if (!fs.existsSync(rceditPath)) {
    throw new Error(`AfterPack rcedit tool not found: ${rceditPath}`);
  }

  const result = spawnSync(rceditPath, [executablePath, "--set-icon", iconPath], {
    stdio: "pipe",
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? "";
    const stdout = result.stdout?.trim() ?? "";
    throw new Error(`AfterPack icon update failed for ${executablePath}\n${stderr || stdout}`);
  }

  const stdout = result.stdout?.trim();
  if (stdout) {
    process.stdout.write(`${stdout}\n`);
  }

  process.stdout.write(`AFTER_PACK_ICON_OK executable=${executablePath} icon=${iconPath}\n`);
};
