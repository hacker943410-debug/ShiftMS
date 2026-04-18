const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const adminPassword = "admin1234";
const adminChangedPassword = "AdminChanged123!";

const ensureAuthenticated = async (page) => {
  const dashboardButton = page.getByRole("button", { name: "대시보드", exact: true });

  if ((await dashboardButton.count()) > 0) {
    return;
  }

  await page.locator("label:has-text('ID') input").fill("admin");
  await page.locator("label:has-text('비밀번호') input").fill(adminPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();

  const currentPasswordInput = page.locator("label:has-text('현재 비밀번호') input");

  if ((await currentPasswordInput.count()) > 0) {
    await currentPasswordInput.waitFor({ state: "visible", timeout: 60000 });
    await page.locator("label:has-text('현재 비밀번호') input").fill(adminPassword);
    await page.locator("label:has-text('새 비밀번호') input").nth(0).fill(adminChangedPassword);
    await page.locator("label:has-text('새 비밀번호 확인') input").fill(adminChangedPassword);
    await page.getByRole("button", { name: "비밀번호 변경", exact: true }).click();
  }

  await page.waitForSelector("button:has-text('대시보드')", { timeout: 60000 });
};

(async () => {
  const executablePath = path.resolve(process.cwd(), "release", "win-unpacked", "ShiftMgmt.exe");
  const accessExportScriptPath = path.resolve(
    process.cwd(),
    "release",
    "win-unpacked",
    "resources",
    "scripts",
    "export-access-db.ps1"
  );

  if (!fs.existsSync(executablePath)) {
    throw new Error(`?⑦궎吏뺣맂 unpacked ?ㅽ뻾 ?뚯씪??李얠쓣 ???놁뒿?덈떎: ${executablePath}`);
  }

  if (!fs.existsSync(accessExportScriptPath)) {
    throw new Error(`?⑦궎吏뺣맂 Access 蹂듦뎄 ?ㅽ겕由쏀듃瑜?李얠쓣 ???놁뒿?덈떎: ${accessExportScriptPath}`);
  }

  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-packaged-smoke-"));
  const app = await electron.launch({
    executablePath,
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: adminPassword
    }
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    page.on("dialog", (dialog) => dialog.accept());
    await ensureAuthenticated(page);

    const pathSettingsHeading = page.locator("h3:has-text('경로 설정')");

    if ((await pathSettingsHeading.count()) === 0) {
      await page.getByRole("button", { name: /운영 관리/ }).click();
      await page.waitForSelector("h3:has-text('경로 설정')", { timeout: 60000 });
    }

    const titleText = ((await page.locator(".title-line strong").textContent()) ?? "").trim();

    if (titleText !== "경로 설정") {
      throw new Error(`패키징된 앱 실행 후 운영 관리 화면 제목이 기대값과 다릅니다: ${titleText}`);
    }

    console.log(`SMOKE_OK packagedExecutable=${executablePath}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
