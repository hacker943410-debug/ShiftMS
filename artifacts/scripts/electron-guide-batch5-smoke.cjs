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
  waitForGuideTitle
} = require("./guide-smoke-helpers.cjs");

const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");

const captureGuidePages = async ({
  page,
  guideTitle,
  screenshotPrefix,
  pageCaptures
}) => {
  await waitForGuideTitle(page, guideTitle);

  for (const capture of pageCaptures) {
    const button = page.locator(".guide-flow-outline-button").filter({ hasText: capture.label }).first();
    await button.waitFor({
      state: "visible",
      timeout: 60000
    });
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

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-guide-batch5-smoke-"));
  const fixture = await prepareReturnedScheduleFixture({ rootDir: tempDataDir });

  const pendingDir = path.resolve(tempDataDir, "imports", "pending");
  const approvedDir = path.resolve(tempDataDir, "imports", "approved");
  const scheduleExportDir = path.resolve(tempDataDir, "exports", "schedule");
  const allowanceProposalExportDir = path.resolve(tempDataDir, "exports", "allowance", "proposal");
  const allowanceAttachment1ExportDir = path.resolve(
    tempDataDir,
    "exports",
    "allowance",
    "attachment1"
  );
  const allowanceAttachment2ExportDir = path.resolve(
    tempDataDir,
    "exports",
    "allowance",
    "attachment2"
  );
  const databaseBackupDir = path.resolve(tempDataDir, "backups");
  const migrationFilePath = path.resolve(tempDataDir, "backup.json");

  fs.mkdirSync(path.dirname(migrationFilePath), { recursive: true });
  fs.writeFileSync(
    migrationFilePath,
    JSON.stringify(
      {
        tables: {
          sites: [
            {
              id: "site-guide-smoke",
              site_code: "GUIDE-001",
              name: "가이드검증근무지",
              status: "active",
              timezone: "Asia/Seoul",
              deleted_at: null,
              created_at: "2026-03-24T01:00:00.000Z",
              updated_at: null
            }
          ]
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      DATABASE_PATH: "guide-batch5.test.sqlite",
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
      "guide-batch5-allowance-proposal",
      "guide-batch5-operations-db-update",
      "guide-batch5-operations-template",
      "guide-batch5-operations-template-wizard"
    ]);

    const settingsResult = await page.evaluate(
      async (settings) => window.appBridge.saveAppSettings(settings),
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir,
        approvedDir,
        scheduleExportDir,
        allowanceProposalExportDir,
        allowanceAttachment1ExportDir,
        allowanceAttachment2ExportDir,
        databaseBackupDir,
        databaseBackupSchedule: "daily",
        databaseBackupTime: "02:00",
        migrationFilePath
      }
    );

    if (!settingsResult?.ok) {
      throw new Error(settingsResult?.message ?? "운영 설정 저장에 실패했습니다.");
    }

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /품의 승인 가이드/ }).click();

    await captureGuidePages({
      page,
      guideTitle: "품의 승인 가이드",
      screenshotPrefix: "guide-batch5-allowance-proposal",
      pageCaptures: [
        { label: "가이드 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "목차", slug: "toc" },
        { label: "미리보기 검토", slug: "preview", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='2']" },
        { label: "최종 승인·백업", slug: "finalize", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='3']" }
      ]
    });

    await page.getByRole("button", { name: /운영 관리/ }).click();
    await page.waitForSelector("h3:has-text('경로 설정')", { timeout: 60000 });

    await page.getByRole("button", { name: "DB업데이트", exact: true }).click();
    await page.waitForSelector(".database-migration-modal", { timeout: 60000 });
    await page
      .locator(".database-migration-modal")
      .getByRole("button", { name: "가이드 보기", exact: true })
      .click();

    await captureGuidePages({
      page,
      guideTitle: "DB업데이트 가이드",
      screenshotPrefix: "guide-batch5-operations-db-update",
      pageCaptures: [
        { label: "가이드 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "목차", slug: "toc" },
        { label: "미리보기 검토", slug: "preview", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='2']" },
        { label: "승인 실행", slug: "run", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='3']" }
      ]
    });

    await page
      .locator(".database-migration-modal")
      .getByRole("button", { name: "취소", exact: true })
      .click();
    await page.waitForSelector(".database-migration-modal", { state: "detached", timeout: 60000 });

    await page.getByRole("tab", { name: /양식 관리/ }).click();
    await page.waitForSelector("h3:has-text('양식 등록과 사용 순서')", { timeout: 60000 });
    await page
      .locator("section.surface-card")
      .filter({ hasText: "양식 등록과 사용 순서" })
      .first()
      .getByRole("button", { name: "가이드 보기", exact: true })
      .click();

    await captureGuidePages({
      page,
      guideTitle: "양식 관리 가이드",
      screenshotPrefix: "guide-batch5-operations-template",
      pageCaptures: [
        { label: "가이드 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "목차", slug: "toc" },
        { label: "양식 등록", slug: "register", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "승인", slug: "approve", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='2']" },
        { label: "기본 사용", slug: "default", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='3']" }
      ]
    });

    await page
      .locator("section.surface-card")
      .filter({ hasText: "양식 등록과 사용 순서" })
      .first()
      .getByRole("button", { name: "양식등록", exact: true })
      .click();
    await page.waitForSelector(".template-wizard-modal", { timeout: 60000 });
    await page
      .locator(".template-wizard-modal")
      .getByRole("button", { name: "가이드 보기", exact: true })
      .click();

    await captureGuidePages({
      page,
      guideTitle: "양식 관리 가이드",
      screenshotPrefix: "guide-batch5-operations-template-wizard",
      pageCaptures: [
        { label: "가이드 소개", slug: "intro", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "목차", slug: "toc" },
        { label: "양식 등록", slug: "register", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='1']" },
        { label: "승인", slug: "approve", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='2']" },
        { label: "기본 사용", slug: "default", readySelector: ".guide-focus-highlight.is-active[data-guide-focus='3']" }
      ]
    });

    await page
      .locator(".template-wizard-modal")
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    await page.waitForSelector(".template-wizard-modal", { state: "detached", timeout: 60000 });

    console.log(`SMOKE_OK batch5-guide fixture=${fixture.rootDir ?? tempDataDir}`);
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
