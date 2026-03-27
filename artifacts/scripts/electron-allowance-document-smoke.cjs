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
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-allowance-doc-smoke-"));
  const fixture = await prepareReturnedScheduleFixture({ rootDir: tempDataDir });

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
    const siteName = ((await siteRow.locator("td").nth(1).textContent()) ?? "").trim();
    await siteRow.locator("button.primary-button").click();
    await waitForSuccessMessage(page, "건의 실적을 승인하고 수당 이력에 반영했습니다.");

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 }).catch(() => null);
    await page.waitForFunction(
      () => document.querySelectorAll(".allowance-results-table tbody tr").length > 0,
      { timeout: 60000 }
    );

    await page.getByRole("button", { name: /Excel 출력/ }).click();
    await waitForSuccessMessage(page, "Excel 문서 출력이 완료되었습니다. 품의서/별첨1/별첨2 지정 경로에 저장했습니다.");

    const exportsResult = await page.evaluate(async () => window.appBridge.listAllowanceDocumentExports());
    if (!exportsResult?.ok || exportsResult.data.length === 0) {
      throw new Error(exportsResult?.message ?? "문서 출력 이력을 찾지 못했습니다.");
    }

    const latestExport = exportsResult.data[0];
    const expectedFiles = [
      latestExport.proposalPath,
      latestExport.attachment1Path,
      latestExport.attachment2Path
    ];

    for (const filePath of expectedFiles) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`문서 출력 파일이 생성되지 않았습니다: ${filePath}`);
      }
    }

    await page.getByRole("button", { name: "수당 이력", exact: true }).click();
    await page.waitForSelector("h3:has-text('수당 이력')", { timeout: 60000 });

    const historySummaryRow = page
      .locator(".allowance-summary-row-item")
      .filter({ hasText: siteName })
      .first();
    await historySummaryRow.getByRole("button").click();

    const historyRowText = (
      (await page
        .locator(".allowance-detail-row-item")
        .filter({ hasText: fixture.workers.overtime.name })
        .first()
        .textContent()) ?? ""
    ).trim();

    if (!historyRowText.includes("문서") && !historyRowText.includes("XLS")) {
      throw new Error(`수당 이력 문서 출력 상태 반영 실패: ${historyRowText}`);
    }

    console.log(
      `SMOKE_OK site=${siteName} proposal=${path.basename(latestExport.proposalPath)} attachment1=${path.basename(latestExport.attachment1Path)} attachment2=${path.basename(latestExport.attachment2Path)}`
    );
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
