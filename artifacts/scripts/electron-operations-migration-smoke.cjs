const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { defaultAdminAuth, ensureAuthenticated } = require("./electron-auth-helpers.cjs");

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-operations-migration-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "pending");
  const approvedDir = path.resolve(tempDataDir, "approved");
  const scheduleExportDir = path.resolve(tempDataDir, "exports", "schedule");
  const allowanceProposalExportDir = path.resolve(tempDataDir, "exports", "allowance", "proposal");
  const allowanceAttachment1ExportDir = path.resolve(tempDataDir, "exports", "allowance", "attachment1");
  const allowanceAttachment2ExportDir = path.resolve(tempDataDir, "exports", "allowance", "attachment2");
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
              id: "site-restore-smoke",
              site_code: "RESTORE-001",
              name: "복원근무지",
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
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: defaultAdminAuth.currentPassword
    }
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page, defaultAdminAuth);

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
      throw new Error(settingsResult?.message ?? "마이그레이션 설정 저장에 실패했습니다.");
    }

    const oldSiteResult = await page.evaluate(async () =>
      window.appBridge.saveSite({
        siteCode: "OLD-001",
        name: "기존근무지",
        status: "active",
        timezone: "Asia/Seoul"
      })
    );

    if (!oldSiteResult?.ok) {
      throw new Error(oldSiteResult?.message ?? "사전 데이터 생성에 실패했습니다.");
    }

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await ensureAuthenticated(page, defaultAdminAuth);

    await page.getByRole("button", { name: /운영 관리/ }).click();
    await page.waitForSelector("h3:has-text('경로 설정')", { timeout: 60000 });

    await page.getByRole("button", { name: "DB업데이트", exact: true }).click();
    await page.waitForSelector(".database-migration-modal", { timeout: 60000 });
    await page
      .locator(".database-migration-modal")
      .getByRole("button", { name: "승인", exact: true })
      .click();

    await page.waitForFunction(() => {
      const message = document.querySelector(".database-migration-modal .form-success-text");
      return typeof message?.textContent === "string" && message.textContent.includes("DB업데이트를 완료했습니다.");
    }, undefined, { timeout: 60000 });

    const siteResult = await page.evaluate(async () => window.appBridge.listSites());
    const appSettings = await page.evaluate(async () => window.appBridge.getAppSettings());

    if (!siteResult?.ok) {
      throw new Error(siteResult?.message ?? "DB업데이트 후 근무지 조회에 실패했습니다.");
    }

    if (!appSettings?.ok) {
      throw new Error(appSettings?.message ?? "DB업데이트 후 설정 재조회에 실패했습니다.");
    }

    const restoredSiteNames = siteResult.data.map((site) => site.name);

    if (
      !restoredSiteNames.includes("복원근무지") ||
      restoredSiteNames.includes("기존근무지")
    ) {
      throw new Error("DB업데이트 후 근무지 교체 결과가 기대와 다릅니다.");
    }

    if (appSettings.data.migrationFilePath !== migrationFilePath) {
      throw new Error("DB업데이트 후 마이그레이션 파일 경로가 유지되지 않았습니다.");
    }

    console.log(`SMOKE_OK migration=${migrationFilePath} restoredSite=복원근무지`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
