const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { _electron: electron } = require("playwright");
const {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot
} = require("../../dist-electron/main/services/performance-test-helpers.js");

const rootDir = process.cwd();
const outputRoot = path.resolve(rootDir, "artifacts", "releases", "v0.2.1");
const logsRoot = path.join(outputRoot, "logs");
const distMainPath = path.resolve(rootDir, "dist-electron", "main", "main.js");
const distRendererPath = path.resolve(rootDir, "dist", "index.html");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const ensureDirectory = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
};

const pad = (value) => String(value).padStart(2, "0");

const formatTimestamp = (value) =>
  `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}-${pad(
    value.getHours()
  )}${pad(value.getMinutes())}${pad(value.getSeconds())}`;

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

const reloadAndAuthenticate = async (page) => {
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);
  await ensureAuthenticated(page);
};

const clickRouteButton = async (page, label) => {
  await page.getByRole("button", { name: label }).click();
  await page.waitForTimeout(300);
};

const waitForDatePopoverClosed = async (page, featurePath, actionLabel) => {
  try {
    await page.waitForFunction(() => document.querySelector(".date-field-popover") === null, {
      timeout: 5000
    });
  } catch (error) {
    throw new Error(`${featurePath}: ${actionLabel} 클릭 후 DatePicker가 닫히지 않았습니다.`);
  }
};

const getField = (scope, label) => scope.locator(".field").filter({ hasText: label }).first();

const getDateShell = (field) => field.locator(".date-field-shell").first();

const getDateValue = async (field) =>
  getDateShell(field).locator('input[type="hidden"]').first().inputValue();

const pickAlternativeDate = async (page) => {
  const popover = page.locator(".date-field-popover").last();
  const target = await popover.evaluate((element) => {
    const headerText = element.querySelector(".date-field-popover-head strong")?.textContent ?? "";
    const match = headerText.match(/(\d+)년\s+(\d+)월/);

    if (!match) {
      throw new Error(`DatePicker 헤더를 해석하지 못했습니다: ${headerText}`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const buttons = [...element.querySelectorAll("button.date-field-day")];
    const candidate = buttons.find(
      (button) =>
        !button.classList.contains("is-selected") &&
        !button.classList.contains("is-disabled") &&
        !button.classList.contains("is-muted")
    );

    if (!(candidate instanceof HTMLButtonElement)) {
      throw new Error("선택 가능한 날짜 버튼을 찾지 못했습니다.");
    }

    const dayText = candidate.querySelector("span")?.textContent?.trim() ?? "";
    const day = Number(dayText);

    if (!day) {
      throw new Error("선택 가능한 날짜 값을 읽지 못했습니다.");
    }

    return { year, month, day };
  });

  await popover
    .locator("button.date-field-day:not(.is-selected):not(.is-disabled):not(.is-muted)")
    .first()
    .click();

  return `${target.year}-${pad(target.month)}-${pad(target.day)}`;
};

const verifyDateFieldBehavior = async ({ page, scope, fieldLabel, featurePath, results }) => {
  console.log(`DATEPICKER_CHECK_START ${featurePath}`);
  const field = getField(scope, fieldLabel);
  await field.waitFor({ state: "visible", timeout: 20000 });

  const control = getDateShell(field).locator(".date-field-control").first();
  const initialValue = await getDateValue(field);

  await control.click();
  await page.locator(".date-field-popover").last().waitFor({ state: "visible", timeout: 5000 });

  const confirmedValue = await pickAlternativeDate(page);
  await page
    .locator(".date-field-popover")
    .last()
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await waitForDatePopoverClosed(page, featurePath, "확인");

  const actualConfirmedValue = await getDateValue(field);
  assert(
    actualConfirmedValue === confirmedValue,
    `${featurePath}: 확인 후 값이 반영되지 않았습니다. expected=${confirmedValue}, actual=${actualConfirmedValue}`
  );

  await control.click();
  await page.locator(".date-field-popover").last().waitFor({ state: "visible", timeout: 5000 });

  const canceledDraftValue = await pickAlternativeDate(page);
  await page
    .locator(".date-field-popover")
    .last()
    .getByRole("button", { name: "취소", exact: true })
    .click();
  await waitForDatePopoverClosed(page, featurePath, "취소");

  const actualCanceledValue = await getDateValue(field);
  assert(
    actualCanceledValue === actualConfirmedValue,
    `${featurePath}: 취소 후 값이 복원되지 않았습니다. expected=${actualConfirmedValue}, actual=${actualCanceledValue}`
  );

  results.push({
    fieldLabel,
    featurePath,
    initialValue,
    confirmedValue: actualConfirmedValue,
    canceledDraftValue,
    status: "passed"
  });
  console.log(`DATEPICKER_CHECK_OK ${featurePath}`);
};

const seedDatepickerFixtures = async (page) =>
  page.evaluate(async () => {
    const ok = (result, label) => {
      if (!result?.ok) {
        throw new Error(result?.message ?? `${label} bridge 호출에 실패했습니다.`);
      }

      return result.data;
    };

    const suffix = Date.now().toString().slice(-6);
    const site = ok(
      await window.appBridge.saveSite({
        siteCode: `DP-${suffix}`,
        name: `DatePicker QA 근무지 ${suffix}`,
        status: "active",
        timezone: "Asia/Seoul"
      }),
      "DatePicker QA 근무지"
    );

    ok(
      await window.appBridge.saveShiftPattern({
        siteId: site.id,
        name: `${site.name} 3조 2교대`,
        teamCount: 3,
        patternCode: "DNX",
        startIndexRule: "manual-seed",
        patternStartDate: "2026-03-01",
        status: "active",
        steps: [
          { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
          { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
          { stepIndex: 2, dutyCode: "X", breakMinutes: 0 }
        ],
        teamIndexes: ["A조", "B조", "C조"].map((teamLabel, index) => ({
          teamLabel,
          index
        })),
        cycles: [
          {
            cycleKey: "cycle-1",
            name: "Cycle 1",
            order: 0,
            shiftCount: 2,
            patternCode: "DNX",
            patternStartDate: "2026-03-01",
            steps: [
              { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
              { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
              { stepIndex: 2, dutyCode: "X", breakMinutes: 0 }
            ],
            teamIndexes: ["A조", "B조", "C조"].map((teamLabel, index) => ({
              teamLabel,
              index
            }))
          }
        ],
        teamCycleAssignments: ["A조", "B조", "C조"].map((teamLabel) => ({
          teamLabel,
          cycleKey: "cycle-1"
        })),
        poolEnabled: false,
        poolBreakMinutes: 0
      }),
      "DatePicker QA 패턴"
    );

    const employee = ok(
      await window.appBridge.saveEmployee({
        employeeCode: `DP-EMP-${suffix}`,
        name: `날짜검증${suffix}`,
        employmentType: "정규",
        status: "active",
        hireDate: "2024-01-15"
      }),
      "DatePicker QA 직원"
    );

    ok(
      await window.appBridge.saveEmployeeAssignment({
        employeeId: employee.id,
        siteId: site.id,
        shiftGroup: "A조",
        teamName: "A조",
        startDate: "2024-01-15"
      }),
      "DatePicker QA 배정"
    );

    ok(
      await window.appBridge.saveEmployeeWageRate({
        employeeId: employee.id,
        hourlyRate: 13200,
        effectiveFrom: "2026-03-01",
        reason: "DatePicker QA 시급"
      }),
      "DatePicker QA 시급"
    );

    return {
      employeeName: employee.name,
      siteName: site.name
    };
  });

const seedAllowanceFixtureViaUi = async (page) => {
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
  await siteRow.locator("button.primary-button").click();
  await page.waitForFunction(
    () => {
      const message = document.querySelector(".form-success-text");
      return (
        typeof message?.textContent === "string" &&
        message.textContent.includes("건의 실적을 승인하고 수당 이력에 반영했습니다.")
      );
    },
    { timeout: 60000 }
  );
};

const openWorkforceScreen = async (page) => {
  await clickRouteButton(page, /인력 관리/);
  await page.waitForSelector("h3:has-text('근무 인력 관리')", { timeout: 60000 });
};

const openWorkforceDetail = async (page, employeeName) => {
  await openWorkforceScreen(page);
  const detailButton = page.getByRole("button", { name: `${employeeName} 상세 보기` }).first();
  await detailButton.waitFor({ state: "visible", timeout: 30000 });
  await detailButton.click();
  await page.getByRole("button", { name: "기본 정보 저장", exact: true }).waitFor({
    state: "visible",
    timeout: 30000
  });
};

const openSiteEditStepOne = async (page, siteName) => {
  await clickRouteButton(page, /근무지 관리/);
  await page.waitForSelector("h3:has-text('근무지 관리')", { timeout: 60000 });
  const siteRow = page.locator(".site-list-table tbody tr").filter({ hasText: siteName }).first();
  await siteRow.waitFor({ state: "visible", timeout: 30000 });
  await siteRow.getByRole("button", { name: "상세 보기", exact: true }).click();
  await page.waitForSelector(".site-detail-modal", { timeout: 30000 });
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.waitForSelector("h3:has-text('근무지 수정 - 1단계: 패턴 등록')", {
    timeout: 30000
  });
};

const openSiteEditStepTwo = async (page, siteName) => {
  await openSiteEditStepOne(page, siteName);
  await page.getByRole("button", { name: "다음 단계", exact: true }).click();
  await page.waitForSelector("h3:has-text('근무지 수정 - 2단계: 조직 구성')", {
    timeout: 30000
  });
};

const openAllowanceScreen = async (page) => {
  await clickRouteButton(page, /수당 관리/);
  await page.waitForSelector("h3:has-text('상세 수당 내역')", { timeout: 60000 });
};

const openEarlyPayoutModal = async (page) => {
  await openAllowanceScreen(page);
  const expandButton = page.locator(".allowance-summary-row-item .allowance-expand-button").first();
  await expandButton.waitFor({ state: "visible", timeout: 30000 });
  await expandButton.click();
  const payoutButton = page.locator('button[title="퇴직자 선지급 설정"]').first();
  await payoutButton.waitFor({ state: "visible", timeout: 30000 });
  await payoutButton.click();
  await page.waitForSelector(".allowance-early-payout-modal", { timeout: 30000 });
};

const openOperationsScreen = async (page) => {
  await clickRouteButton(page, /운영 관리/);
  await page.waitForSelector("strong:has-text('경로 설정')", { timeout: 60000 });
};

const writeSummary = (summaryPath, payload) => {
  fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2), "utf8");
};

(async () => {
  assert(fs.existsSync(distMainPath), `Electron main build 결과가 없습니다: ${distMainPath}`);
  assert(fs.existsSync(distRendererPath), `Renderer build 결과가 없습니다: ${distRendererPath}`);

  const startedAt = new Date();
  const runId = `electron-datepicker-qa-${formatTimestamp(startedAt)}`;
  const runLogDir = ensureDirectory(path.join(logsRoot, runId));
  const summaryPath = path.join(runLogDir, "summary.json");
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-datepicker-qa-"));
  await prepareReturnedScheduleFixture({ rootDir: tempDataDir });

  const app = await electron.launch({
    args: ["."],
    cwd: rootDir,
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
  const results = [];
  let fixture;

  try {
    await page.setViewportSize({ width: 1680, height: 1200 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page);

    fixture = await seedDatepickerFixtures(page);
    await seedAllowanceFixtureViaUi(page);

    await reloadAndAuthenticate(page);

    await openWorkforceScreen(page);
    await page.getByRole("button", { name: "신규 인력 등록", exact: true }).click();
    const createModal = page.locator(".modal-card").filter({ hasText: "신규 인력 등록" }).first();
    await verifyDateFieldBehavior({
      page,
      scope: createModal,
      fieldLabel: "입사일",
      featurePath: "인력 관리 > 신규 인력 등록 > 입사일",
      results
    });
    await createModal.getByRole("button", { name: "취소", exact: true }).click();

    await page.getByRole("button", { name: "시급 일괄 업데이트", exact: true }).click();
    const wageBulkModal = page.locator(".wage-bulk-modal").first();
    await verifyDateFieldBehavior({
      page,
      scope: wageBulkModal,
      fieldLabel: "적용 날짜",
      featurePath: "인력 관리 > 시급 일괄 업데이트 > 적용 날짜",
      results
    });
    await wageBulkModal.getByRole("button", { name: "닫기", exact: true }).click();

    await openWorkforceDetail(page, fixture.employeeName);
    await verifyDateFieldBehavior({
      page,
      scope: page.locator("body"),
      fieldLabel: "퇴사 처리일",
      featurePath: "인력 관리 > 인력 상세 > 퇴사 처리일",
      results
    });
    await verifyDateFieldBehavior({
      page,
      scope: page.locator("body"),
      fieldLabel: "시급 적용일",
      featurePath: "인력 관리 > 인력 상세 > 시급 적용일",
      results
    });

    await reloadAndAuthenticate(page);

    await openSiteEditStepOne(page, fixture.siteName);
    await verifyDateFieldBehavior({
      page,
      scope: page.locator("body"),
      fieldLabel: "패턴 시작일",
      featurePath: "근무지 관리 > 근무지 수정 1단계 > 패턴 시작일",
      results
    });
    await page.getByRole("button", { name: "다음 단계", exact: true }).click();
    await page.waitForSelector("h3:has-text('근무지 수정 - 2단계: 조직 구성')", {
      timeout: 30000
    });
    await verifyDateFieldBehavior({
      page,
      scope: page.locator("body"),
      fieldLabel: "적용 일자",
      featurePath: "근무지 관리 > 근무지 수정 2단계 > 적용 일자",
      results
    });

    await reloadAndAuthenticate(page);

    await openAllowanceScreen(page);
    await openEarlyPayoutModal(page);
    await verifyDateFieldBehavior({
      page,
      scope: page.locator(".allowance-early-payout-modal").first(),
      fieldLabel: "선지급 날짜",
      featurePath: "수당 관리 > 퇴직자 선지급 설정 > 선지급 날짜",
      results
    });
    await page.locator(".allowance-early-payout-modal").getByRole("button", { name: "취소", exact: true }).click();

    await reloadAndAuthenticate(page);

    await openOperationsScreen(page);
    await page.getByRole("tab", { name: /공휴일 관리/ }).click();
    await page.waitForSelector("h3:has-text('저장 공휴일과 API 공휴일 동기화')", {
      timeout: 30000
    });
    await page.getByRole("button", { name: "신규 등록", exact: true }).click();
    const holidayModal = page.locator(".holiday-create-modal").first();
    await verifyDateFieldBehavior({
      page,
      scope: holidayModal,
      fieldLabel: "공휴일 날짜",
      featurePath: "운영 관리 > 공휴일 관리 > 공휴일 신규 등록 > 공휴일 날짜",
      results
    });
    await holidayModal.getByRole("button", { name: "닫기", exact: true }).click();

    await page.getByRole("tab", { name: /요율 관리/ }).click();
    await page.waitForSelector("h3:has-text('요율 관리')", { timeout: 30000 });
    await page.getByRole("button", { name: "신규 요율 추가", exact: true }).click();
    const rateModal = page.locator(".rate-editor-modal").first();
    await verifyDateFieldBehavior({
      page,
      scope: rateModal,
      fieldLabel: "적용 시작일",
      featurePath: "운영 관리 > 요율 관리 > 신규 요율 추가 > 적용 시작일",
      results
    });
    await verifyDateFieldBehavior({
      page,
      scope: rateModal,
      fieldLabel: "적용 종료일",
      featurePath: "운영 관리 > 요율 관리 > 신규 요율 추가 > 적용 종료일",
      results
    });

    const summary = {
      checkedAt: new Date().toISOString(),
      featureCount: results.length,
      runId,
      status: "passed",
      targetVersion: "0.2.1",
      checkedFeatures: results
    };

    writeSummary(summaryPath, summary);
    console.log(`ELECTRON_DATEPICKER_QA_OK summary=${summaryPath}`);
  } finally {
    await app.close();
    resetPreparedReturnedScheduleRoot(tempDataDir);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
