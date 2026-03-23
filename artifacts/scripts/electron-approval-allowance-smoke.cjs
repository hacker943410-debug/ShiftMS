const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");

const getTrimmedText = async (locator) => ((await locator.textContent()) ?? "").trim();
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

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-approval-allowance-smoke-"));
  await prepareReturnedScheduleFixture({ rootDir: tempDataDir });

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
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

    await ensureAuthenticated(page);

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('실적 현황')", { timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelectorAll(".performance-site-summary-row").length > 0,
      { timeout: 60000 }
    );

    const siteRow = page
      .locator(".performance-site-summary-row")
      .filter({ has: page.locator("button.primary-button:not([disabled])") })
      .first();
    await siteRow.waitFor({ state: "visible", timeout: 60000 });
    const siteName = ((await siteRow.locator("td").nth(1).textContent()) ?? "").trim();
    await siteRow.locator("button.primary-button").click();
    await waitForSuccessMessage(page, "건의 실적을 승인하고 수당실적으로 저장했습니다.");

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 }).catch(() => null);
    await page.waitForSelector("button:has-text('미산출 일괄 계산')", { timeout: 60000 });

    const pendingCount = await page.locator(".allowance-run-item").count();

    if (pendingCount > 0) {
      await page.getByRole("button", { name: "미산출 일괄 계산", exact: true }).click();
      await waitForSuccessMessage(page, "건의 승인 실적을 수당 산출했습니다.");
    }

    await page.waitForFunction(
      () => document.querySelectorAll(".allowance-results-table tbody tr").length > 0,
      { timeout: 60000 }
    );

    const resultRow = page.locator(".allowance-results-table tbody tr").first();
    await resultRow.waitFor({ state: "visible", timeout: 60000 });
    const resultRowText = await getTrimmedText(resultRow);

    if (!resultRowText.includes(siteName)) {
      throw new Error(`수당 결과 테이블에 승인한 근무지 ${siteName} 이 보이지 않습니다: ${resultRowText}`);
    }

    console.log(`SMOKE_OK site=${siteName} pendingBefore=${pendingCount}`);
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
