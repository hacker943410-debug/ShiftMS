// Capture the site-registration wizard steps (기본 설정 / 근무 시간 설정 / 조직 구성)
// next to the redesign mockups (step1 / step1c / step2). Requires a BUILT app.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { _electron: electron } = require("playwright");

const rootDir = process.cwd();
const outDir = path.resolve(rootDir, "artifacts", "site-wizard-mockups", "_actual");
const distMainPath = path.resolve(rootDir, "dist-electron", "main", "main.js");
const distRendererPath = path.resolve(rootDir, "dist", "index.html");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ensureDir = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
const results = [];
const record = (file, ok, extra) => {
  results.push({ file, ok, ...extra });
  console.log(`${ok ? "CAPTURED" : "FAILED  "} ${file}${extra?.error ? " :: " + extra.error : ""}`);
};

const setWindowSize = async (app, page, width, height) => {
  await app.evaluate(async ({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isMaximized()) win.unmaximize();
    win.setContentSize(size.width, size.height);
  }, { width, height });
  await page.waitForTimeout(400);
};

const installCancelDialog = async (app) => {
  await app.evaluate(({ dialog }) => {
    const rt = globalThis;
    if (!rt.__capOrig) {
      rt.__capOrig = dialog.showOpenDialog.bind(dialog);
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    }
  });
};

const dismissOverlays = async (page) => {
  for (let i = 0; i < 6; i += 1) {
    const releaseNotes = page.locator(".release-notes-overlay");
    if ((await releaseNotes.count()) > 0 && (await releaseNotes.first().isVisible())) {
      await releaseNotes.locator(".release-notes-actions .primary-button").first().click().catch(() => {});
      await page.waitForTimeout(150); continue;
    }
    const appUpdate = page.locator(".app-update-overlay");
    if ((await appUpdate.count()) > 0 && (await appUpdate.first().isVisible())) {
      const later = appUpdate.getByRole("button", { name: "나중에" });
      if ((await later.count()) > 0) { await later.first().click().catch(() => {}); await page.waitForTimeout(150); continue; }
    }
    return;
  }
};

const shot = async (page, file) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${file}.png`), fullPage: true });
  record(file, true);
};

const gotoRoute = async (page, label) => {
  await page.getByRole("button", { name: new RegExp(label) }).first().click();
  await page.waitForFunction(
    (l) => document.querySelector(".top-strip-title h2")?.textContent?.trim() === l,
    label, { timeout: 30000 },
  );
  await page.waitForTimeout(700);
};

(async () => {
  if (!fs.existsSync(distMainPath) || !fs.existsSync(distRendererPath)) {
    throw new Error("build 결과가 없습니다. npm run build:renderer && npm run build:electron 먼저 실행하세요.");
  }
  ensureDir(outDir);
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-capwiz-"));
  const app = await electron.launch({ args: ["."], cwd: rootDir, env: { ...process.env, DATA_DIR: tempDataDir } });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await installCancelDialog(app);
    await dismissOverlays(page);

    // 로그인 + 초기 비번 변경
    await page.waitForSelector(".login-layout .login-form", { timeout: 30000 });
    const loginForm = page.locator(".login-layout .login-form");
    await loginForm.locator("input").nth(0).fill("admin");
    await loginForm.locator("input").nth(1).fill("1234");
    await loginForm.locator(".login-submit").click();
    await page.waitForSelector(".login-panel .login-form .button-row", { timeout: 30000 });
    const pwForm = page.locator(".login-panel .login-form");
    await pwForm.locator("input").nth(0).fill("1234");
    await pwForm.locator("input").nth(1).fill("AdminChanged123!");
    await pwForm.locator("input").nth(2).fill("AdminChanged123!");
    await pwForm.locator(".button-row .primary-button").click();

    await page.waitForFunction(
      () => document.querySelectorAll(".route-list .route-button").length >= 1 && document.querySelector(".top-strip-title h2"),
      undefined, { timeout: 60000 },
    );
    await setWindowSize(app, page, 1440, 1000);
    await dismissOverlays(page);

    // 근무지 관리 진입 -> 근무지 등록
    await gotoRoute(page, "근무지 관리");
    await page.getByRole("button", { name: "근무지 등록", exact: true }).first().click();
    await page.waitForSelector(".site-stage-header", { timeout: 20000 });
    await page.waitForTimeout(700);

    // 1) 기본 설정 (step1)
    try { await shot(page, "wizard-step1-basics"); }
    catch (e) { record("wizard-step1-basics", false, { error: e.message }); }

    // 근무지명 입력(다음 단계 진행용)
    try {
      const nameInput = page.locator(".site-name-field input").first();
      if ((await nameInput.count()) > 0) await nameInput.fill("평택 제1공장");
    } catch { /* ignore */ }

    // 2) 근무 시간 설정 (step1c)
    try {
      await page.getByRole("button", { name: /다음: ?근무시간 설정/ }).first().click();
      await page.waitForTimeout(900);
      await shot(page, "wizard-step1-times");
    } catch (e) { record("wizard-step1-times", false, { error: e.message }); }

    // 3) 조직 구성 (step2)
    try {
      await page.getByRole("button", { name: "다음 단계", exact: true }).first().click();
      await page.waitForSelector(".assignment-board-card", { timeout: 20000 });
      await page.waitForTimeout(900);
      await shot(page, "wizard-step2-org");
    } catch (e) { record("wizard-step2-org", false, { error: e.message }); }

    fs.writeFileSync(path.join(outDir, "_capture-wizard-manifest.json"), JSON.stringify(results, null, 2), "utf8");
    const okN = results.filter((r) => r.ok).length;
    console.log(`CAPTURE_WIZARD_DONE ok=${okN}/${results.length} dir=${outDir}`);
  } finally {
    await app.close();
    await wait(300);
  }
})().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1; });
