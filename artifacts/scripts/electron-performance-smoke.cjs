const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");

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

const selectFieldOption = async (page, label, optionName) => {
  await page.locator(`label:has-text('${label}') button`).first().click();
  await page.locator(".app-select-option").filter({ hasText: optionName }).first().click();
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-performance-smoke-"));
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
    const pendingFilesResult = await page.evaluate(async () => window.appBridge.listPendingFiles());

    if (!pendingFilesResult?.ok || pendingFilesResult.data.length === 0) {
      throw new Error(pendingFilesResult?.message ?? "실적 smoke 대상 파일이 없습니다.");
    }

    const [scheduleYear, scheduleMonth] = pendingFilesResult.data[0].scheduleMonth.split("-");

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('실적 현황')");
    await selectFieldOption(page, "연도", scheduleYear);
    await selectFieldOption(page, "월", `${Number(scheduleMonth)}월`);
    await page.waitForFunction(
      () => document.querySelectorAll(".performance-overview-table tbody tr").length > 0,
      undefined,
      { timeout: 60000 }
    );
    const siteSummaryRow = page.locator(".performance-site-summary-row").first();
    await siteSummaryRow.waitFor({ state: "visible", timeout: 60000 });
    const siteName = ((await siteSummaryRow.locator("td").nth(1).textContent()) ?? "").trim();
    const summaryText = ((await siteSummaryRow.textContent()) ?? "").trim();

    if (!siteName || !summaryText.includes("보라매DC")) {
      throw new Error("실적 현황 요약 행의 근무지 정보가 비어 있습니다.");
    }

    const historyRowCount = await page.locator(".performance-history-card tbody tr").count();
    console.log(`SMOKE_OK site=${siteName} historyRows=${historyRowCount}`);
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
