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
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-guide-batch2-smoke-"));
  await prepareReturnedScheduleFixture({ rootDir: tempDataDir });

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      DATABASE_PATH: "guide-batch2.test.sqlite",
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
      "guide-batch2-dashboard",
      "guide-batch2-performance",
      "guide-batch2-allowance"
    ]);

    await openGuideAndCapture({
      page,
      menuName: "대시보드",
      guideTitle: "대시보드 가이드",
      screenshotPrefix: "guide-batch2-dashboard",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "목차", slug: "toc", readySelector: ".guide-dashboard-toc-overlay" },
        { label: "조회 필터", slug: "filters", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "지표 읽기", slug: "insights", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "내보내기", slug: "export", readySelector: ".guide-focus-highlight[data-guide-focus='1']" }
      ]
    });

    await openGuideAndCapture({
      page,
      menuName: "실적 관리",
      guideTitle: "실적 관리 가이드",
      screenshotPrefix: "guide-batch2-performance",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "목차", slug: "toc", readySelector: ".guide-performance-toc-overlay" },
        { label: "상세 필터", slug: "filters", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "승인 흐름", slug: "approval", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "승인 이력", slug: "history", readySelector: ".guide-focus-highlight[data-guide-focus='1']" }
      ]
    });

    await openGuideAndCapture({
      page,
      menuName: "수당 관리",
      guideTitle: "수당 관리 가이드",
      screenshotPrefix: "guide-batch2-allowance",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "목차", slug: "toc", readySelector: ".guide-allowance-toc-overlay" },
        { label: "상태 검토", slug: "status", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "승인 흐름", slug: "approval", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "품의 승인", slug: "proposal", readySelector: ".guide-focus-highlight[data-guide-focus='1']" },
        { label: "품의 이력", slug: "history", readySelector: ".guide-focus-highlight[data-guide-focus='1']" }
      ]
    });

    console.log("SMOKE_OK batch2-guide");
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
