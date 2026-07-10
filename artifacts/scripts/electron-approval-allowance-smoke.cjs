const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { defaultAdminAuth, ensureAuthenticated } = require("./electron-auth-helpers.cjs");
const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");

const getTrimmedText = async (locator) => ((await locator.textContent()) ?? "").trim();

const waitForSuccessMessage = async (page, expectedText) => {
  await page.waitForFunction(
    (text) => {
      const message = document.querySelector(".form-success-text");
      return typeof message?.textContent === "string" && message.textContent.includes(text);
    },
    expectedText,
    { timeout: 60000 }
  );
};

const selectFieldOption = async (page, label, optionName) => {
  await page.locator(`label:has-text('${label}') button`).first().click();
  await page.locator(".app-select-option").filter({ hasText: optionName }).first().click();
};

const dismissOpenQuestionDialogs = async (page) => {
  // Action-result dialogs (e.g. "N건의 실적을 승인...") stay open on top of the
  // console and intercept the next click; close every one that is showing.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const overlay = page.locator(".question-dialog-overlay");

    if ((await overlay.count()) === 0) {
      return;
    }

    await overlay
      .last()
      .locator(".question-dialog-actions button")
      .last()
      .click({ timeout: 5000 })
      .catch(() => null);
    await page.waitForTimeout(200);
  }
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-approval-allowance-smoke-"));
  const previousBootstrapAdminPassword = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = defaultAdminAuth.currentPassword;
  await prepareReturnedScheduleFixture({ rootDir: tempDataDir });
  if (previousBootstrapAdminPassword === undefined) {
    delete process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  } else {
    process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = previousBootstrapAdminPassword;
  }

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: defaultAdminAuth.currentPassword,
      DATABASE_PATH: "performance.test.sqlite",
      WATCH_PENDING_DIR: "imports/pending",
      WATCH_APPROVED_DIR: "imports/approved",
      SCHEDULE_EXPORT_DIR: "exports"
    }
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    await ensureAuthenticated(page, defaultAdminAuth);
    const pendingFilesResult = await page.evaluate(async () => window.appBridge.listPendingFiles());

    if (!pendingFilesResult?.ok || pendingFilesResult.data.length === 0) {
      throw new Error(pendingFilesResult?.message ?? "실적 smoke 대상 파일이 없습니다.");
    }

    const [scheduleYear, scheduleMonth] = pendingFilesResult.data[0].scheduleMonth.split("-");

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('실적 현황')", { timeout: 60000 });
    await selectFieldOption(page, "연도", scheduleYear);
    await selectFieldOption(page, "월", `${Number(scheduleMonth)}월`);
    await page.waitForFunction(
      () => document.querySelectorAll(".performance-site-summary-row").length > 0,
      undefined,
      { timeout: 60000 }
    );

    const siteRow = page
      .locator(".performance-site-summary-row")
      .filter({ has: page.locator("button.primary-button:not([disabled])") })
      .first();
    await siteRow.waitFor({ state: "visible", timeout: 60000 });
    const siteName = ((await siteRow.locator("td").nth(1).textContent()) ?? "").trim();
    await siteRow.locator("button.primary-button").click();
    await waitForSuccessMessage(page, "건의 실적을 승인하고 품의 이력에 반영했습니다.");
    await dismissOpenQuestionDialogs(page);

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 }).catch(() => null);

    await page.waitForFunction(
      () => document.querySelectorAll(".allowance-results-table tbody tr").length > 0,
      undefined,
      { timeout: 60000 }
    );

    const resultRow = page.locator(".allowance-results-table tbody tr").first();
    await resultRow.waitFor({ state: "visible", timeout: 60000 });
    const resultRowText = await getTrimmedText(resultRow);

    if (!resultRowText.includes(siteName)) {
      throw new Error(`수당 결과 테이블에 승인한 근무지 ${siteName} 이 보이지 않습니다: ${resultRowText}`);
    }

    console.log(`SMOKE_OK site=${siteName}`);
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
