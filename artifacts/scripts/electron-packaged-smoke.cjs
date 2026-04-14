const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

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

(async () => {
  const executablePath = path.resolve(process.cwd(), "release", "win-unpacked", "ShiftMgmt.exe");

  if (!fs.existsSync(executablePath)) {
    throw new Error(`패키징된 unpacked 실행 파일을 찾을 수 없습니다: ${executablePath}`);
  }

  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-packaged-smoke-"));
  const app = await electron.launch({
    executablePath,
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir
    }
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page);

    await page.getByRole("button", { name: /운영 관리/ }).click();
    await page.waitForSelector("h3:has-text('경로 설정')", { timeout: 60000 });

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
