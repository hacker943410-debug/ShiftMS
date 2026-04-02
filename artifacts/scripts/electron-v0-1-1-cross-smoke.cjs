const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");
const {
  runDatabaseBackupNow
} = require("../../dist-electron/main/services/database-backup-service.js");

const screenshotsDir = path.resolve(process.cwd(), "artifacts", "screenshots");

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

const clickRouteButton = async (page, labelPattern) => {
  await page.getByRole("button", { name: labelPattern }).click();
  await page.waitForTimeout(400);
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const verifyOperationsBackupSettings = async (page, fixture, appEnv) => {
  const backupDir = path.resolve(fixture.rootDir, "db-backups");
  const accessSourcePath = path.resolve(fixture.rootDir, "backup-source.accdb");
  fs.writeFileSync(accessSourcePath, "access-backup-fixture", "utf8");

  await clickRouteButton(page, /운영 관리/);
  await page.waitForSelector("h3:has-text('경로 설정')", { timeout: 60000 });

  const saveResult = await page.evaluate(
    async (settings) => window.appBridge.saveAppSettings(settings),
    {
      pendingDir: path.resolve(fixture.rootDir, "imports", "pending"),
      approvedDir: path.resolve(fixture.rootDir, "imports", "approved"),
      scheduleExportDir: path.resolve(fixture.rootDir, "exports"),
      allowanceProposalExportDir: path.resolve(fixture.rootDir, "exports", "allowance", "proposal"),
      allowanceAttachment1ExportDir: path.resolve(fixture.rootDir, "exports", "allowance", "attachment1"),
      allowanceAttachment2ExportDir: path.resolve(fixture.rootDir, "exports", "allowance", "attachment2"),
      holidayApiBaseUrl: "https://example.com/holidays",
      migrationFilePath: accessSourcePath,
      databaseBackupDir: backupDir,
      databaseBackupSchedule: "weekly",
      databaseBackupTime: "03:30"
    }
  );

  if (!saveResult?.ok) {
    throw new Error(saveResult?.message ?? "DB 자동 백업 설정 저장에 실패했습니다.");
  }

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);
  await ensureAuthenticated(page);
  await clickRouteButton(page, /운영 관리/);
  await page.waitForSelector("h3:has-text('경로 설정')", { timeout: 60000 });

  const backupUiState = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".surface-card")];
    const backupCard = cards.find((card) => card.textContent?.includes("DB 자동 백업 설정"));
    const getFieldValue = (label) => {
      const field = [...(backupCard?.querySelectorAll(".field") ?? [])].find((node) =>
        node.textContent?.includes(label)
      );
      const control = field?.querySelector("input, select");
      return control?.value?.trim() ?? "";
    };

    return {
      schedule: getFieldValue("백업 주기"),
      time: getFieldValue("백업 시간"),
      directory: getFieldValue("백업 저장 폴더"),
      mode: getFieldValue("백업 방식")
    };
  });

  if (
    backupUiState.directory !== backupDir ||
    backupUiState.schedule !== "weekly" ||
    backupUiState.time !== "03:30" ||
    !backupUiState.mode.includes("JSON 스냅샷")
  ) {
    throw new Error(`DB 자동 백업 설정 UI 반영 실패: ${JSON.stringify(backupUiState)}`);
  }

  const backupSummary = await runDatabaseBackupNow({
    userDataPath: fixture.userDataPath,
    env: appEnv
  });

  if (!fs.existsSync(backupSummary.jsonBackupPath)) {
    throw new Error(`JSON 백업 파일이 생성되지 않았습니다: ${backupSummary.jsonBackupPath}`);
  }

  if (!backupSummary.accessBackupPath || !fs.existsSync(backupSummary.accessBackupPath)) {
    throw new Error(`Access 백업 파일이 생성되지 않았습니다: ${backupSummary.accessBackupPath ?? "-"}`);
  }

  return {
    accessBackupPath: backupSummary.accessBackupPath,
    backupDir,
    jsonBackupPath: backupSummary.jsonBackupPath,
    schedule: backupUiState.schedule,
    time: backupUiState.time
  };
};

const verifySiteStepOne = async (page) => {
  await clickRouteButton(page, /근무지 관리/);
  await page.waitForSelector("h3:has-text('근무지 관리')", { timeout: 60000 });
  await page.getByRole("button", { name: "근무지 등록", exact: true }).click();
  await page.waitForSelector("h3:has-text('근무지 등록 - 1단계: 패턴 등록')", { timeout: 60000 });

  await page.locator("label:has-text('근무지명') input").first().fill("V011 QA 근무지");
  await page.locator("label:has-text('조 수') input").first().fill("4");
  await page.locator(".site-pattern-string-card input").first().fill("주주야야휴휴");
  await page.locator(".site-index-grid input").nth(0).fill("0");
  await page.locator(".site-index-grid input").nth(1).fill("2");
  await page.locator(".site-index-grid input").nth(2).fill("4");
  await page.locator(".site-index-grid input").nth(3).fill("0");
  await page.waitForTimeout(500);

  const siteStepOneState = await page.evaluate(() => {
    const metricLabels = [...document.querySelectorAll(".site-summary-strip .site-summary-box span")].map(
      (node) => node.textContent?.trim() ?? ""
    );
    const simulationPanel = document.querySelector(".site-simulation-panel-expanded");
    const leftPanel = document.querySelector(".site-step-one-layout > section");
    const cycleIndexInput = document.querySelector(".site-cycle-index-panel.compact input");
    const teamCountInput = [...document.querySelectorAll("label.field")].find((node) =>
      node.textContent?.includes("조 수")
    )?.querySelector("input");

    return {
      metricLabels,
      simulationWidth: Math.round(simulationPanel?.getBoundingClientRect().width ?? 0),
      leftPanelWidth: Math.round(leftPanel?.getBoundingClientRect().width ?? 0),
      cycleIndexWidth: Math.round(cycleIndexInput?.getBoundingClientRect().width ?? 0),
      teamCountWidth: Math.round(teamCountInput?.getBoundingClientRect().width ?? 0)
    };
  });

  if (!siteStepOneState.metricLabels.includes("월간 1인 근무시간")) {
    throw new Error(`1인 기준 시뮬레이션 지표가 보이지 않습니다: ${siteStepOneState.metricLabels.join(", ")}`);
  }

  if (siteStepOneState.simulationWidth < 420 || siteStepOneState.cycleIndexWidth >= siteStepOneState.teamCountWidth) {
    throw new Error(`근무지 1단계 UI 비율 검증 실패: ${JSON.stringify(siteStepOneState)}`);
  }

  const screenshotPath = path.resolve(screenshotsDir, "v0.1.1-site-step1.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    screenshotPath,
    simulationWidth: siteStepOneState.simulationWidth,
    metricLabels: siteStepOneState.metricLabels
  };
};

const verifyScheduleManagement = async (page, fixture) => {
  await clickRouteButton(page, /근무표 배포/);
  await page.waitForFunction(
    () =>
      document.querySelector(".top-strip-title h2")?.textContent?.includes("근무표 배포") &&
      document.querySelector(".schedule-filter-shell"),
    { timeout: 60000 }
  );
  const siteControl = page.locator(".schedule-filter-grid .schedule-filter-field").nth(1).locator(".app-select-control");
  const currentSiteLabel = ((await siteControl.textContent()) ?? "").trim();
  if (currentSiteLabel !== fixture.siteName) {
    await siteControl.click();
    await page.locator(".app-select-option", { hasText: fixture.siteName }).click();
  }
  await page.waitForFunction(
    (siteName) =>
      document.querySelector(".schedule-selection-card")?.textContent?.includes(siteName) &&
      document.querySelectorAll(".schedule-summary-card-toggle").length >= 2,
    fixture.siteName,
    { timeout: 60000 }
  );
  const toggles = page.locator(".schedule-summary-card-toggle");
  const toggleCount = await toggles.count();
  for (let index = 0; index < toggleCount; index += 1) {
    const button = toggles.nth(index);
    const label = ((await button.textContent()) ?? "").trim();
    if (label.includes("펼치기")) {
      await button.click();
    }
  }
  await page.waitForFunction(
    () => document.querySelectorAll(".schedule-summary-side table tbody tr").length > 0,
    { timeout: 60000 }
  );

  const filterState = await page.evaluate(async () => {
    const main = document.querySelector(".console-main");
    const fieldLabels = [...document.querySelectorAll(".schedule-filter-grid .field > span:first-child")].map(
      (node) => node.textContent?.trim() ?? ""
    );
    const fieldNodes = [...document.querySelectorAll(".schedule-filter-grid .schedule-filter-field")];
    const dateField = fieldNodes[0];
    const siteField = fieldNodes[1];
    const templateField = fieldNodes[2];
    const summaryHeaders = [...document.querySelectorAll(".schedule-summary-side thead th")].map(
      (node) => node.textContent?.trim() ?? ""
    );
    const totalValues = [...document.querySelectorAll(".schedule-summary-side tbody tr td:last-child")]
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);

    main.scrollTop = 960;
    const beforeScrollTop = main.scrollTop;

    const monthControl = dateField?.querySelectorAll(".app-select-control")[1];
    const currentValue = monthControl?.textContent?.trim() ?? "";
    monthControl?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const option = [...document.querySelectorAll(".schedule-filter-grid .app-select-option")].find(
      (node) => {
        const label = node.textContent?.trim() ?? "";
        return label && !label.includes(currentValue);
      }
    );
    option?.click();
    await new Promise((resolve) => setTimeout(resolve, 150));

    return {
      activeElementMatches: document.activeElement?.classList.contains("app-select-control") ?? false,
      afterScrollTop: main.scrollTop,
      beforeScrollTop,
      dateWidth: Math.round(dateField?.getBoundingClientRect().width ?? 0),
      fieldLabels,
      siteWidth: Math.round(siteField?.getBoundingClientRect().width ?? 0),
      summaryHeaders,
      templateWidth: Math.round(templateField?.getBoundingClientRect().width ?? 0),
      totalValues
    };
  });

  if (
    filterState.fieldLabels.includes("교대 패턴") ||
    filterState.fieldLabels.includes("생성자") ||
    filterState.fieldLabels.length !== 3
  ) {
    throw new Error(`근무표 배포 필터 정리 실패: ${filterState.fieldLabels.join(", ")}`);
  }

  if (filterState.templateWidth <= filterState.siteWidth || filterState.dateWidth < 190) {
    throw new Error(`근무표 배포 필터 너비 검증 실패: ${JSON.stringify(filterState)}`);
  }

  if (Math.abs(filterState.afterScrollTop - filterState.beforeScrollTop) > 24 || !filterState.activeElementMatches) {
    throw new Error(`필터 포커스 유지 실패: ${JSON.stringify(filterState)}`);
  }

  const totalWorkHourHeaderCount = filterState.summaryHeaders.filter((header) => header === "총근로시간").length;
  if (totalWorkHourHeaderCount < 2 || filterState.totalValues.length === 0) {
    throw new Error(`총근로시간 열 검증 실패: ${JSON.stringify(filterState)}`);
  }

  const screenshotToggles = page.locator(".schedule-summary-card-toggle");
  const screenshotToggleCount = await screenshotToggles.count();
  for (let index = 0; index < screenshotToggleCount; index += 1) {
    const button = screenshotToggles.nth(index);
    const label = ((await button.textContent()) ?? "").trim();
    if (label.includes("펼치기")) {
      await button.click();
    }
  }
  await page.waitForFunction(
    () => document.querySelectorAll(".schedule-summary-side table tbody tr").length > 0,
    { timeout: 60000 }
  );

  const screenshotPath = path.resolve(screenshotsDir, "v0.1.1-schedule-management.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    screenshotPath,
    templateWidth: filterState.templateWidth,
    dateWidth: filterState.dateWidth,
    totalWorkHourHeaderCount
  };
};

const verifyPerformanceAndAllowance = async (page) => {
  await clickRouteButton(page, /실적 관리/);
  await page.waitForSelector("h3:has-text('실적 현황')", { timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".performance-site-summary-row").length > 0,
    { timeout: 60000 }
  );

  const siteRow = page
    .locator(".performance-site-summary-row")
    .filter({ has: page.locator("button.primary-button:not([disabled])") })
    .first();
  await siteRow.waitFor({ state: "visible", timeout: 60000 });
  const siteName = ((await siteRow.locator("td").nth(1).textContent()) ?? "").trim();
  const toggleButton = siteRow.getByRole("button", { name: /펼치기|접기/ });
  const toggleLabel = ((await toggleButton.textContent()) ?? "").trim();
  if (toggleLabel.includes("펼치기")) {
    await toggleButton.click();
  }
  await page.waitForSelector(".performance-entry-row", { timeout: 60000 });

  const performanceTableState = await page.evaluate(() => ({
    excelButtonCount: document.querySelectorAll(".performance-action-icon-button.excel").length,
    headerAlignments: [...document.querySelectorAll(".performance-overview-table thead th")].map((node) =>
      getComputedStyle(node).textAlign
    )
  }));

  if (performanceTableState.excelButtonCount === 0) {
    throw new Error("실적 관리 Excel 열기 아이콘이 보이지 않습니다.");
  }

  if (!performanceTableState.headerAlignments.every((value) => value === "center")) {
    throw new Error(`실적 관리 헤더 정렬이 중앙이 아닙니다: ${performanceTableState.headerAlignments.join(", ")}`);
  }

  await page.getByRole("button", { name: "Excel 파일 열기" }).first().click();
  await waitForSuccessMessage(page, "원본 Excel 파일을 열었습니다.");

  await siteRow.locator("button.primary-button").click();
  await waitForSuccessMessage(page, "건의 실적을 승인하고 품의 이력에 반영했습니다.");

  await clickRouteButton(page, /수당 관리/);
  await page.waitForSelector("h3:has-text('수당 관리')", { timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".allowance-summary-row-item").length > 0,
    { timeout: 60000 }
  );

  const allowanceSummaryRow = page
    .locator(".allowance-summary-row-item")
    .filter({ hasText: siteName })
    .first();
  await allowanceSummaryRow.getByRole("button").click();
  await page.locator(".allowance-detail-row-item .allowance-row-action-button").first().click();
  await page.waitForSelector(".allowance-evidence-panel", { timeout: 60000 });

  const allowanceCardState = await page.evaluate(() => {
    const card = document.querySelector(".allowance-evidence-total-card");
    const strong = card?.querySelector("strong");
    const em = card?.querySelector("em");
    const cardRect = card?.getBoundingClientRect();
    const strongRect = strong?.getBoundingClientRect();
    const emRect = em?.getBoundingClientRect();

    return {
      cardWidth: Math.round(cardRect?.width ?? 0),
      emOverflow:
        !cardRect || !emRect ? true : emRect.right > cardRect.right - 8 || emRect.left < cardRect.left + 8,
      strongOverflow:
        !cardRect || !strongRect
          ? true
          : strongRect.right > cardRect.right - 8 || strongRect.left < cardRect.left + 8
    };
  });

  if (allowanceCardState.strongOverflow || allowanceCardState.emOverflow || allowanceCardState.cardWidth < 220) {
    throw new Error(`수당 상세 총 수당 카드 잘림 검증 실패: ${JSON.stringify(allowanceCardState)}`);
  }

  const allowanceScreenshotPath = path.resolve(screenshotsDir, "v0.1.1-allowance-detail.png");
  await page.screenshot({ path: allowanceScreenshotPath, fullPage: true });

  await page.getByRole("button", { name: /PDF 출력/ }).click();
  await waitForSuccessMessage(page, "PDF 문서 출력이 완료되었습니다. 품의서/별첨1/별첨2 지정 경로에 저장했습니다.");

  const exportResult = await page.evaluate(async () => window.appBridge.listAllowanceDocumentExports());
  if (!exportResult?.ok || exportResult.data.length === 0) {
    throw new Error(exportResult?.message ?? "수당 문서 출력 이력을 찾지 못했습니다.");
  }

  const latestPdfExport = exportResult.data.find((record) => record.outputFormat === "pdf");
  if (!latestPdfExport) {
    throw new Error("PDF 출력 이력이 생성되지 않았습니다.");
  }

  const proposalStat = fs.statSync(latestPdfExport.proposalPath);
  if (!fs.existsSync(latestPdfExport.attachment1Path) || !fs.existsSync(latestPdfExport.attachment2Path)) {
    throw new Error("PDF 별첨 출력 파일이 생성되지 않았습니다.");
  }

  if (proposalStat.size < 8_000) {
    throw new Error(`PDF 품의서 파일 크기가 비정상적으로 작습니다: ${proposalStat.size}`);
  }

  return {
    allowanceScreenshotPath,
    pdfAttachment1Path: latestPdfExport.attachment1Path,
    pdfAttachment2Path: latestPdfExport.attachment2Path,
    pdfProposalPath: latestPdfExport.proposalPath,
    proposalSize: proposalStat.size,
    siteName
  };
};

(async () => {
  ensureDir(screenshotsDir);

  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-v011-cross-smoke-"));
  const fixture = await prepareReturnedScheduleFixture({ rootDir: tempDataDir });
  const appEnv = {
    ...process.env,
    DATA_DIR: tempDataDir,
    DATABASE_PATH: "performance.test.sqlite",
    WATCH_PENDING_DIR: "imports/pending",
    WATCH_APPROVED_DIR: "imports/approved",
    SCHEDULE_EXPORT_DIR: "exports"
  };

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: appEnv
  });
  const page = await app.firstWindow();

  try {
    await page.setViewportSize({ width: 1680, height: 1320 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page);

    const operations = await verifyOperationsBackupSettings(page, fixture, appEnv);
    const siteStepOne = await verifySiteStepOne(page);
    const schedule = await verifyScheduleManagement(page, fixture);
    const performanceAndAllowance = await verifyPerformanceAndAllowance(page);

    console.log(
      JSON.stringify(
        {
          ok: true,
          operations,
          performanceAndAllowance,
          schedule,
          siteStepOne
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
