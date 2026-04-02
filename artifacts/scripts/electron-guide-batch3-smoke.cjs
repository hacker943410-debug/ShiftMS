const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const {
  assertGuideTabSwitch,
  assertGuideFigureViewport,
  closeGuide,
  cleanupGuideScreenshots,
  ensureAuthenticated,
  openRouteMenu,
  waitForGuideTitle
} = require("./guide-smoke-helpers.cjs");

const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");

const openGuideAndCapture = async ({
  page,
  menuName,
  guideTitle,
  screenshotPrefix,
  pageCaptures
}) => {
  await openRouteMenu(page, menuName);

  const guideButton = page.getByRole("button", { name: /가이드 보기/ }).last();
  await guideButton.waitFor({ state: "visible", timeout: 60000 });
  await guideButton.click();
  await waitForGuideTitle(page, guideTitle);

  for (const capture of pageCaptures) {
    const button = page.locator(".guide-flow-outline-button").filter({ hasText: capture.label }).first();
    await button.waitFor({ state: "visible", timeout: 60000 });
    await button.click();

    if (capture.readySelector) {
      await page.waitForSelector(capture.readySelector, { state: "visible", timeout: 60000 });
    } else {
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(180);
    await assertGuideTabSwitch(page, `${screenshotPrefix}/${capture.slug}/tabs`);
    await assertGuideFigureViewport(page, `${screenshotPrefix}/${capture.slug}`);

    await page.screenshot({
      path: path.join("artifacts", "screenshots", `${screenshotPrefix}-${capture.slug}.png`)
    });
  }

  await closeGuide(page);
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-guide-batch3-smoke-"));
  await prepareReturnedScheduleFixture({ rootDir: tempDataDir });

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      DATABASE_PATH: "guide-batch3.test.sqlite",
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
    cleanupGuideScreenshots([
      "guide-batch3-schedule",
      "guide-batch3-operations",
      "guide-batch3-access-history"
    ]);

    await openGuideAndCapture({
      page,
      menuName: "근무표 배포",
      guideTitle: "근무표 배포 가이드",
      screenshotPrefix: "guide-batch3-schedule",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "목차", slug: "toc", readySelector: ".guide-schedule-toc-overlay" },
        { label: "월·근무지 선택", slug: "month-site", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "양식 선택·배포", slug: "distribute", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "배포 이력", slug: "history", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" }
      ]
    });

    await openGuideAndCapture({
      page,
      menuName: "운영 관리",
      guideTitle: "운영 관리 가이드",
      screenshotPrefix: "guide-batch3-operations",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "목차", slug: "toc", readySelector: ".guide-operations-toc-overlay" },
        { label: "경로 설정", slug: "settings", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "공휴일·요율", slug: "holiday-rate", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "사용자 관리", slug: "user", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "양식 관리", slug: "template", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "DB업데이트", slug: "db-update", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" }
      ]
    });

    await openGuideAndCapture({
      page,
      menuName: "활동 이력",
      guideTitle: "활동 이력 가이드",
      screenshotPrefix: "guide-batch3-access-history",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "목차", slug: "toc", readySelector: ".guide-access-toc-overlay" },
        { label: "필터 조합", slug: "filters", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "이력 해석", slug: "interpret", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" }
      ]
    });

    console.log("SMOKE_OK batch3-guide");
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
