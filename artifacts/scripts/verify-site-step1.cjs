const path = require("node:path");
const { _electron: electron } = require("playwright");

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
  const app = await electron.launch({ args: ["."], cwd: process.cwd() });
  const page = await app.firstWindow();

  try {
    await page.setViewportSize({ width: 1600, height: 1400 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    await ensureAuthenticated(page);
    await page.getByRole("button", { name: /근무지 관리/ }).click();
    await page.waitForSelector("h3:has-text('근무지 관리')");
    await page.getByRole("button", { name: "근무지 등록", exact: true }).click();
    await page.waitForSelector("h3:has-text('근무지 등록 - 1단계: 패턴 등록')");
    await page.waitForTimeout(400);

    const codeInput = page.locator("label:has-text('근무지 코드') input").first();
    const nameInput = page.locator("label:has-text('근무지명') input").first();
    const teamCountInput = page.locator("label:has-text('조 수') input").first();
    const patternInput = page.locator(".site-pattern-string-card input").first();

    const initialIndexCount = await page.locator(".site-index-grid label").count();
    await teamCountInput.fill("6");
    await page.waitForTimeout(250);
    const updatedIndexCount = await page.locator(".site-index-grid label").count();
    await teamCountInput.fill("4");
    await page.waitForTimeout(250);

    await patternInput.fill("주주주휴휴휴야야야휴휴휴");
    const teamIndexInputs = page.locator(".site-index-grid input");
    await teamIndexInputs.nth(0).fill("0");
    await teamIndexInputs.nth(1).fill("3");
    await teamIndexInputs.nth(2).fill("6");
    await teamIndexInputs.nth(3).fill("9");
    await page.waitForTimeout(300);

    const result = {
      codeValue: await codeInput.inputValue(),
      codeReadOnly: await codeInput.evaluate((node) => node.readOnly),
      codeWidth: await codeInput.evaluate((node) => Math.round(node.getBoundingClientRect().width)),
      nameWidth: await nameInput.evaluate((node) => Math.round(node.getBoundingClientRect().width)),
      patternValue: await patternInput.inputValue(),
      startRuleExists: await page.getByText("패턴 시작 기준", { exact: true }).count(),
      initialIndexCount,
      updatedIndexCount,
      calendarHeadCount: await page.locator(".site-calendar-head span").count(),
      calendarCellCount: await page.locator(".site-calendar-grid .site-calendar-cell").count(),
      firstCurrentCell: await page
        .locator(".site-calendar-grid .site-calendar-cell:not(.muted)")
        .first()
        .locator(".shift-chip")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? "")),
      shiftChipSample: await page
        .locator(".site-calendar-grid .shift-chip")
        .evaluateAll((nodes) => nodes.slice(0, 8).map((node) => node.textContent?.trim() ?? "")),
      simulationTitle: (await page.locator(".site-simulation-header h3").textContent())?.trim(),
      simulationMonth: (await page.locator(".simulation-month-label").textContent())?.trim(),
      metricLabels: await page
        .locator(".site-summary-strip .site-summary-box span")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ""))
    };

    await page.screenshot({
      path: path.join(process.cwd(), "artifacts", "playwright-site-step1-simulation.png"),
      fullPage: true
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
