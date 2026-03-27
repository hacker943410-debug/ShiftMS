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
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page);

    await page.getByRole("button", { name: /인력 관리/ }).click();
    await page.waitForSelector("h3:has-text('근무 인력 관리')");

    const targetSiteLabel = ((await page.locator(".workforce-select-field .app-select-value").first().textContent()) ?? "").trim();

    if (!targetSiteLabel) {
      throw new Error("인력 관리 화면에서 현재 선택된 근무지를 읽지 못했습니다.");
    }

    await page.getByRole("button", { name: "선택 근무표 보기" }).click();
    await page.waitForFunction(
      () => [...document.querySelectorAll(".schedule-filter-copy strong")].some((node) =>
        node.textContent?.includes("근무표 배포")
      ),
      { timeout: 60000 }
    );

    const scheduleSiteLabel = ((await page.locator("label:has-text('근무지') .app-select-value").first().textContent()) ?? "").trim();
    const selectionCardText = ((await page.locator(".schedule-selection-card").first().textContent()) ?? "").trim();

    if (scheduleSiteLabel !== targetSiteLabel) {
      throw new Error(
        `근무표 화면 근무지 연속성 실패: expected ${targetSiteLabel}, got ${scheduleSiteLabel}`
      );
    }

    if (!selectionCardText.includes(targetSiteLabel)) {
      throw new Error(`근무표 배포 선택 정보 카드가 근무지를 반영하지 않습니다: ${selectionCardText}`);
    }

    console.log(`SMOKE_OK site=${targetSiteLabel}`);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
