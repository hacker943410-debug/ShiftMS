const { _electron: electron } = require("playwright");

(async () => {
  const app = await electron.launch({ args: ["."], cwd: process.cwd() });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForSelector("h2:has-text('대시보드')");

    await page.getByRole("button", { name: /인력 관리/ }).click();
    await page.waitForSelector("h3:has-text('근무 인력 관리')");

    const workforceSiteSelect = page.locator("label:has-text('근무지') select").first();
    const options = await workforceSiteSelect.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => ({
        value: node.getAttribute("value") ?? "",
        label: node.textContent?.trim() ?? ""
      }))
    );
    const targetOption = options.find((option) => option.value && option.value !== "all");

    if (!targetOption) {
      throw new Error("인력 관리 화면에서 선택 가능한 근무지를 찾지 못했습니다.");
    }

    await workforceSiteSelect.selectOption(targetOption.value);
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "선택 근무표 보기" }).click();
    await page.waitForSelector("h3:has-text('배포 상태')");

    const scheduleSiteSelect = page.locator("label:has-text('근무지') select").first();
    const scheduleMonthInput = page.locator("input[type='month']").first();
    const selectedSiteValue = await scheduleSiteSelect.inputValue();

    if (selectedSiteValue !== targetOption.value) {
      throw new Error(
        `근무표 화면 근무지 연속성 실패: expected ${targetOption.value}, got ${selectedSiteValue}`
      );
    }

    await scheduleMonthInput.fill("2026-05");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "근무지 관리 열기" }).click();
    await page.waitForSelector(".site-detail-modal");

    const modalTitle = (await page.locator(".site-detail-modal h3").first().textContent())?.trim();

    if (modalTitle !== targetOption.label) {
      throw new Error(
        `근무지 상세 연속성 실패: expected ${targetOption.label}, got ${modalTitle ?? "-"}`
      );
    }

    await page.getByRole("button", { name: "근무표 배포", exact: true }).click();
    await page.waitForSelector("h3:has-text('배포 상태')");
    await page.waitForTimeout(300);

    const returnedSiteValue = await scheduleSiteSelect.inputValue();
    const returnedMonthValue = await scheduleMonthInput.inputValue();

    if (returnedSiteValue !== targetOption.value) {
      throw new Error(
        `근무표 복귀 후 근무지 유지 실패: expected ${targetOption.value}, got ${returnedSiteValue}`
      );
    }

    if (returnedMonthValue !== "2026-05") {
      throw new Error(
        `근무표 복귀 후 근무월 유지 실패: expected 2026-05, got ${returnedMonthValue}`
      );
    }

    console.log(`SMOKE_OK site=${targetOption.label} month=${returnedMonthValue}`);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
