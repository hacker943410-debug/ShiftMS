const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  restageReturnedScheduleFixture
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

const getAllowanceRowValues = async (page, employeeName) => {
  const row = page
    .locator(".allowance-detail-row-item")
    .filter({ hasText: employeeName })
    .first();
  await row.waitFor({ state: "visible", timeout: 60000 });

  const cells = row.locator("td");
  return {
    hourlyRate: ((await cells.nth(7).textContent()) ?? "").trim(),
    totalAllowance: ((await cells.nth(8).textContent()) ?? "").trim()
  };
};

const selectFieldOption = async (page, label, optionName) => {
  await page.locator(`label:has-text('${label}') button`).first().click();
  await page.locator(".app-select-option").filter({ hasText: optionName }).first().click();
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-reapproval-smoke-"));
  const fixture = await prepareReturnedScheduleFixture({ rootDir: tempDataDir });
  const targetEmployeeName = fixture.workers.overtime.name;
  const manualHourlyRate = "20000";

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
    const siteName = ((await siteRow.locator("td").nth(1).textContent()) ?? "").trim();
    await siteRow.locator("button.primary-button").click();
    await waitForSuccessMessage(page, "건의 실적을 승인하고 품의 이력에 반영했습니다.");

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 }).catch(() => null);
    await page.waitForFunction(
      () => document.querySelectorAll(".allowance-summary-row-item").length > 0,
      undefined,
      { timeout: 60000 }
    );

    const allowanceSummaryRow = page
      .locator(".allowance-summary-row-item")
      .filter({ hasText: siteName })
      .first();
    await allowanceSummaryRow.getByRole("button").click();

    const before = await getAllowanceRowValues(page, targetEmployeeName);

    await restageReturnedScheduleFixture(fixture);
    await page.waitForFunction(
      async (fileName) => {
        const result = await window.appBridge.listPendingFiles();
        return result.ok && result.data.some((item) => item.fileName === fileName);
      },
      fixture.fileName,
      { timeout: 60000 }
    );

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await ensureAuthenticated(page);
    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('실적 현황')", { timeout: 60000 });
    await page.locator("label:has-text('조회구분') button").first().click();
    await page.getByRole("option", { name: "승인대기", exact: true }).click();
    await page.waitForTimeout(400);

    const reopenedSiteRow = page
      .locator(".performance-site-summary-row")
      .filter({ hasText: siteName })
      .first();
    const toggleButton = reopenedSiteRow.getByRole("button", { name: /펼치기|접기/ });
    const toggleLabel = ((await toggleButton.textContent()) ?? "").trim();
    if (toggleLabel.includes("펼치기")) {
      await toggleButton.click();
    }

    const employeeRow = page
      .locator(".performance-entry-row")
      .filter({ hasText: targetEmployeeName })
      .first();
    await employeeRow.waitFor({ state: "visible", timeout: 60000 });
    await employeeRow.getByRole("button", { name: "승인본 비교" }).click();
    await page.waitForSelector(".performance-compare-modal", { timeout: 60000 });

    await page.getByRole("button", { name: "임의지정", exact: true }).click();
    await page.waitForSelector(".performance-hourly-rate-modal", { timeout: 60000 });
    await page.locator(".performance-hourly-rate-modal input").fill(manualHourlyRate);
    await page.getByRole("button", { name: "확인", exact: true }).click();

    await page.waitForFunction(
      (value) => {
        const note = document.querySelector(".performance-compare-value-note");
        return typeof note?.textContent === "string" && note.textContent.includes(value);
      },
      "₩20,000",
      { timeout: 60000 }
    );

    await page
      .locator(".performance-compare-actions .primary-button")
      .filter({ hasText: "재승인" })
      .click();
    await waitForSuccessMessage(page, "실적을 재승인하고 품의 이력을 갱신했습니다.");

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: "품의 이력", exact: true }).click();
    await page.waitForSelector("h3:has-text('품의 이력')", { timeout: 60000 });

    const historySummaryRow = page
      .locator(".allowance-summary-row-item")
      .filter({ hasText: siteName })
      .first();
    await historySummaryRow.getByRole("button").click();

    const after = await getAllowanceRowValues(page, targetEmployeeName);

    if (before.hourlyRate === after.hourlyRate) {
      throw new Error(`재승인 후 시급이 갱신되지 않았습니다: ${before.hourlyRate}`);
    }

    if (before.totalAllowance === after.totalAllowance) {
      throw new Error(`재승인 후 총 수당이 갱신되지 않았습니다: ${before.totalAllowance}`);
    }

    if (after.hourlyRate !== "₩20,000") {
      throw new Error(`재승인 후 시급 표시가 예상과 다릅니다: ${after.hourlyRate}`);
    }

    console.log(
      `SMOKE_OK site=${siteName} employee=${targetEmployeeName} before=${before.totalAllowance} after=${after.totalAllowance}`
    );
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
