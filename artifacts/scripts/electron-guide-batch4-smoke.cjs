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
      await page.waitForTimeout(400);
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

const openNestedGuideAndCapture = async ({
  page,
  openTriggerName,
  modalHeadingText,
  guideTitle,
  screenshotPrefix,
  pageCaptures
}) => {
  await page.getByRole("button", { name: openTriggerName, exact: true }).click();

  const modal = page
    .locator('[role="dialog"], .modal-card')
    .filter({ hasText: modalHeadingText })
    .first();
  await modal.waitFor({ state: "visible", timeout: 60000 });

  await modal.getByRole("button", { name: "가이드 보기", exact: true }).click();
  await waitForGuideTitle(page, guideTitle);

  for (const capture of pageCaptures) {
    const button = page.locator(".guide-flow-outline-button").filter({ hasText: capture.label }).first();
    await button.waitFor({ state: "visible", timeout: 60000 });
    await button.click();

    if (capture.readySelector) {
      await page.waitForSelector(capture.readySelector, { state: "visible", timeout: 60000 });
    } else {
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(180);
    await assertGuideTabSwitch(page, `${screenshotPrefix}/${capture.slug}/tabs`);
    await assertGuideFigureViewport(page, `${screenshotPrefix}/${capture.slug}`);

    await page.screenshot({
      path: path.join("artifacts", "screenshots", `${screenshotPrefix}-${capture.slug}.png`)
    });
  }

  await closeGuide(page);
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  await modal.waitFor({ state: "detached", timeout: 60000 });
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-guide-batch4-smoke-"));
  await prepareReturnedScheduleFixture({ rootDir: tempDataDir });

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      DATABASE_PATH: "guide-batch4.test.sqlite",
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
      "guide-batch4-workforce",
      "guide-batch4-workforce-wage-bulk",
      "guide-batch4-site",
      "guide-batch4-site-pattern-import"
    ]);

    await openGuideAndCapture({
      page,
      menuName: "인력 관리",
      guideTitle: "인력 관리 가이드",
      screenshotPrefix: "guide-batch4-workforce",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active" },
        { label: "목차", slug: "toc", readySelector: ".guide-workforce-toc-overlay" },
        { label: "목록 조회", slug: "filters", readySelector: ".guide-focus-highlight.is-active" },
        { label: "신규 등록", slug: "create", readySelector: ".guide-focus-highlight.is-active" },
        { label: "프로필·이력", slug: "detail", readySelector: ".guide-focus-highlight.is-active" },
        { label: "시급 일괄 업데이트", slug: "wage-bulk", readySelector: ".guide-focus-highlight.is-active" }
      ]
    });

    await openNestedGuideAndCapture({
      page,
      openTriggerName: "시급 일괄 업데이트",
      modalHeadingText: "시급 일괄 업데이트",
      guideTitle: "시급 일괄 업데이트 가이드",
      screenshotPrefix: "guide-batch4-workforce-wage-bulk",
      pageCaptures: [
        { label: "가이드 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active" },
        { label: "목차", slug: "toc", readySelector: ".guide-workforce-toc-overlay" },
        { label: "파일·열 매핑", slug: "sheet", readySelector: ".guide-focus-highlight.is-active" },
        { label: "미리보기·반영", slug: "preview", readySelector: ".guide-focus-highlight.is-active" }
      ]
    });

    await openGuideAndCapture({
      page,
      menuName: "근무지 관리",
      guideTitle: "근무지 관리 가이드",
      screenshotPrefix: "guide-batch4-site",
      pageCaptures: [
        { label: "메뉴 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active" },
        { label: "목차", slug: "toc", readySelector: ".guide-site-toc-overlay" },
        { label: "목록 확인", slug: "list", readySelector: ".guide-focus-highlight.is-active" },
        { label: "1단계 패턴 등록", slug: "step1", readySelector: ".guide-focus-highlight.is-active" },
        { label: "2단계 조직 구성", slug: "step2", readySelector: ".guide-focus-highlight.is-active" },
        { label: "상세 보기", slug: "detail", readySelector: ".guide-focus-highlight.is-active" },
        { label: "패턴 산출", slug: "pattern-import", readySelector: ".guide-focus-highlight.is-active" }
      ]
    });

    await openNestedGuideAndCapture({
      page,
      openTriggerName: "패턴 적용된 근무지 추가",
      modalHeadingText: "패턴 적용된 근무지 추가",
      guideTitle: "패턴 적용된 근무지 추가 가이드",
      screenshotPrefix: "guide-batch4-site-pattern-import",
      pageCaptures: [
        { label: "가이드 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active" },
        { label: "목차", slug: "toc", readySelector: ".guide-site-toc-overlay" },
        { label: "파일·분석 시작", slug: "sheet", readySelector: ".guide-focus-highlight.is-active" },
        { label: "미리보기·1단계 이동", slug: "preview", readySelector: ".guide-focus-highlight.is-active" }
      ]
    });

    console.log("SMOKE_OK batch4-guide");
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
