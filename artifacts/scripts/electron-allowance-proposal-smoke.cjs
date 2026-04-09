const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");

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

const confirmQuestionDialogFor = async (page, action, confirmLabel) => {
  const dialog = page.locator(".question-dialog-overlay");
  await action();
  await dialog.waitFor({ state: "visible", timeout: 60000 });
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
};

const closeQuestionDialog = async (page, confirmLabel = "확인") => {
  const dialog = page.locator(".question-dialog-overlay");
  await dialog.waitFor({ state: "visible", timeout: 60000 });
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
};

const expandAllowanceSite = async (page, siteName) => {
  const summaryRow = page
    .locator(".allowance-summary-row-item")
    .filter({ hasText: siteName })
    .first();
  await summaryRow.waitFor({ state: "visible", timeout: 60000 });
  await summaryRow.locator(".allowance-expand-button").click();
};

const selectFieldOption = async (page, label, optionName) => {
  await page.locator(`label:has-text('${label}') button`).first().click();
  await page.locator(".app-select-option").filter({ hasText: optionName }).first().click();
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-allowance-proposal-smoke-"));
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
    await siteRow.waitFor({ state: "visible", timeout: 60000 });
    const siteName = ((await siteRow.locator("td").nth(1).textContent()) ?? "").trim();
    await siteRow.locator("button.primary-button").click();
    await waitForSuccessMessage(page, "품의 이력에 반영했습니다.");

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 }).catch(() => null);
    await page.waitForFunction(
      () => document.querySelectorAll(".allowance-summary-row-item").length > 0,
      undefined,
      { timeout: 60000 }
    );

    await expandAllowanceSite(page, siteName);

    const detailRow = page.locator(".allowance-detail-row-item").first();
    await detailRow.waitFor({ state: "visible", timeout: 60000 });
    const employeeName = ((await detailRow.locator("td").nth(2).textContent()) ?? "").trim();

    await confirmQuestionDialogFor(page, async () => {
      await detailRow.getByRole("button", { name: "승인", exact: true }).click();
    }, "승인");
    await waitForSuccessMessage(page, "승인 1건을 반영했습니다.");

    await page.waitForFunction(
      ({ siteName: expectedSiteName, employeeName: expectedEmployeeName }) => {
        const rows = [...document.querySelectorAll(".allowance-detail-row-item")];
        return rows.some((row) => {
          const text = row.textContent ?? "";
          return text.includes(expectedSiteName) && text.includes(expectedEmployeeName) && text.includes("승인");
        });
      },
      { siteName, employeeName },
      { timeout: 60000 }
    );

    await page.getByRole("button", { name: "품의 승인", exact: true }).click();
    await page.waitForSelector(".allowance-proposal-modal", { timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelectorAll(".allowance-proposal-preview-scroll tbody tr").length > 0,
      undefined,
      { timeout: 60000 }
    );

    await page.locator(".allowance-proposal-comment-field textarea").fill("smoke proposal approval");

    await confirmQuestionDialogFor(page, async () => {
      await page.getByRole("button", { name: "최종 품의 승인", exact: true }).click();
    }, "품의 승인");
    await closeQuestionDialog(page, "확인");
    await waitForSuccessMessage(page, "품의 승인을 완료했습니다.");

    const proposalApprovals = await page.evaluate(async () =>
      window.appBridge.listAllowanceProposalApprovals()
    );

    if (!proposalApprovals?.ok || proposalApprovals.data.length === 0) {
      throw new Error(proposalApprovals?.message ?? "품의 승인 기록을 찾지 못했습니다.");
    }

    const latestProposalApproval = proposalApprovals.data[0];

    if (!fs.existsSync(latestProposalApproval.backupSummary.jsonBackupPath)) {
      throw new Error(
        `자동 백업 JSON 파일이 생성되지 않았습니다: ${latestProposalApproval.backupSummary.jsonBackupPath}`
      );
    }

    const exportsResult = await page.evaluate(async () => window.appBridge.listAllowanceDocumentExports());

    if (!exportsResult?.ok || exportsResult.data.length === 0) {
      throw new Error(exportsResult?.message ?? "품의 승인 후 문서 출력 이력을 찾지 못했습니다.");
    }

    const latestExport = exportsResult.data.find(
      (record) => record.id === latestProposalApproval.exportRecordId
    );

    if (!latestExport) {
      throw new Error("품의 승인 기록과 연결된 문서 출력 이력을 찾지 못했습니다.");
    }

    [latestExport.proposalPath, latestExport.attachment1Path, latestExport.attachment2Path].forEach(
      (filePath) => {
        if (!fs.existsSync(filePath)) {
          throw new Error(`품의 승인 출력 파일이 생성되지 않았습니다: ${filePath}`);
        }
      }
    );

    await page.getByRole("button", { name: "품의 이력", exact: true }).click();
    await page.waitForSelector("h3:has-text('품의 이력')", { timeout: 60000 });
    await expandAllowanceSite(page, siteName);

    const historyRow = page
      .locator(".allowance-detail-row-item")
      .filter({ hasText: employeeName })
      .first();
    await historyRow.waitFor({ state: "visible", timeout: 60000 });
    const historyText = ((await historyRow.textContent()) ?? "").trim();

    if (!historyText.includes("품의승인")) {
      throw new Error(`품의 이력 상태 반영 실패: ${historyText}`);
    }

    console.log(
      `SMOKE_OK site=${siteName} employee=${employeeName} proposal=${path.basename(latestExport.proposalPath)} backup=${path.basename(latestProposalApproval.backupSummary.jsonBackupPath)}`
    );
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
