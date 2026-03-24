const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const getTrimmedValue = async (locator) => ((await locator.inputValue()) ?? "").trim();
const fieldInput = (page, label) =>
  page.locator(".field").filter({ hasText: label }).locator("input").first();

const ensureAuthenticated = async (page) => {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.some((button) => {
      const text = button.textContent?.trim();
      return text === "로그인" || text === "로그아웃";
    });
  }, { timeout: 60000 });

  const logoutButton = page.getByRole("button", { name: "로그아웃", exact: true });

  if ((await logoutButton.count()) > 0) {
    return;
  }

  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForSelector("button:has-text('로그아웃')", { timeout: 60000 });
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-operations-settings-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "custom-pending");
  const approvedDir = path.resolve(tempDataDir, "custom-approved");
  const scheduleExportDir = path.resolve(tempDataDir, "custom-schedule-exports");
  const allowanceProposalExportDir = path.resolve(tempDataDir, "allowance-proposal");
  const allowanceAttachment1ExportDir = path.resolve(tempDataDir, "allowance-attachment1");
  const allowanceAttachment2ExportDir = path.resolve(tempDataDir, "allowance-attachment2");
  const holidayApiBaseUrl = "https://example.com/custom-holidays";

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
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

    const saveResult = await page.evaluate(
      async (settings) => window.appBridge.saveAppSettings(settings),
      {
        pendingDir,
        approvedDir,
        scheduleExportDir,
        allowanceProposalExportDir,
        allowanceAttachment1ExportDir,
        allowanceAttachment2ExportDir,
        holidayApiBaseUrl,
        migrationFilePath: ""
      }
    );

    if (!saveResult?.ok) {
      throw new Error(saveResult?.message ?? "운영 경로 저장 bridge 호출에 실패했습니다.");
    }

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await ensureAuthenticated(page);

    await page.getByRole("button", { name: /운영 관리/ }).click();
    await page.waitForSelector("h3:has-text('경로 설정')", { timeout: 60000 });

    const pendingValue = await getTrimmedValue(fieldInput(page, "승인 대기 폴더"));
    const approvedValue = await getTrimmedValue(fieldInput(page, "승인 완료 폴더"));
    const exportValue = await getTrimmedValue(fieldInput(page, "근무표 내보내기 폴더"));
    const proposalValue = await getTrimmedValue(fieldInput(page, "품의서 저장 폴더"));

    if (
      pendingValue !== pendingDir ||
      approvedValue !== approvedDir ||
      exportValue !== scheduleExportDir ||
      proposalValue !== allowanceProposalExportDir
    ) {
      throw new Error("운영 관리 화면 저장 값이 기대 값과 다릅니다.");
    }

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('승인 이력')", { timeout: 60000 });

    const appSettings = await page.evaluate(async () => window.appBridge.getAppSettings());

    if (!appSettings?.ok) {
      throw new Error(appSettings?.message ?? "실적 관리 전환 후 설정 재조회에 실패했습니다.");
    }

    if (
      appSettings.data.pendingDir !== pendingDir ||
      appSettings.data.approvedDir !== approvedDir ||
      appSettings.data.allowanceProposalExportDir !== allowanceProposalExportDir
    ) {
      throw new Error("저장된 운영 경로가 preload 재조회 기준으로 일치하지 않습니다.");
    }

    console.log(`SMOKE_OK pending=${pendingDir} approved=${approvedDir} proposal=${allowanceProposalExportDir}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
