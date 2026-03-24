const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const currentYear = new Date().getFullYear();
const rateVersionLabel = `${currentYear} smoke-active`;

const buildRateItems = () => {
  const matrix = {
    "legal-holiday": { base: 1.5, overtime: 1.5, night: 1.5 },
    "weekday-substitute": { base: 1.5, overtime: 2, night: 2.5 },
    "holiday-substitute": { base: 1.5, overtime: 2, night: 2.5 },
    "weekday-overtime": { base: 0, overtime: 1.5, night: 2 },
    "holiday-overtime": { base: 0, overtime: 0, night: 0 }
  };

  return Object.entries(matrix).flatMap(([categoryCode, axes]) =>
    Object.entries(axes).map(([axis, multiplier]) => ({
      allowanceCode: `${categoryCode}:${axis}`,
      multiplier
    }))
  );
};

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
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-operations-config-smoke-"));
  const holidayDate = `${currentYear}-11-29`;

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir
    }
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page);

    const holidayResult = await page.evaluate(
      async ({ year, holidayDate: nextHolidayDate }) =>
        window.appBridge.addHolidayItem({
          year,
          holidayDate: nextHolidayDate,
          name: "스모크 공휴일"
        }),
      {
        year: currentYear,
        holidayDate
      }
    );

    if (!holidayResult?.ok) {
      throw new Error(holidayResult?.message ?? "공휴일 seed 생성에 실패했습니다.");
    }

    const rateResult = await page.evaluate(
      async ({ year, versionLabel, items }) =>
        window.appBridge.saveAllowanceRateVersion({
          year,
          versionLabel,
          status: "active",
          effectiveFrom: `${year}-01-01`,
          items
        }),
      {
        year: currentYear,
        versionLabel: rateVersionLabel,
        items: buildRateItems()
      }
    );

    if (!rateResult?.ok) {
      throw new Error(rateResult?.message ?? "요율 seed 생성에 실패했습니다.");
    }

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await ensureAuthenticated(page);

    await page.getByRole("button", { name: /운영 관리/ }).click();

    await page.getByRole("tab", { name: /공휴일 관리/ }).click();
    await page.waitForSelector("h3:has-text('저장 공휴일과 API 공휴일 동기화')", {
      timeout: 60000
    });
    await page.waitForFunction(
      (value) => {
        const summaryCards = [...document.querySelectorAll(".operations-summary-card strong")];
        const tableRows = [...document.querySelectorAll(".holiday-table tbody tr")];
        return (
          summaryCards.some((item) => item.textContent?.includes("1건")) &&
          tableRows.some((row) => row.textContent?.includes(value))
        );
      },
      holidayDate,
      { timeout: 60000 }
    );

    await page.getByRole("tab", { name: /요율 관리/ }).click();
    await page.waitForSelector("h3:has-text('요율 설정')", { timeout: 60000 });
    await page.waitForFunction(
      (versionLabel) => {
        const statusCards = [...document.querySelectorAll(".rate-admin-status-card")];
        const versionCards = [...document.querySelectorAll(".rate-version-card")];
        return (
          statusCards.some((card) => card.textContent?.includes("사용중")) &&
          versionCards.some((card) => card.textContent?.includes(versionLabel))
        );
      },
      rateVersionLabel,
      { timeout: 60000 }
    );

    await page.getByRole("tab", { name: /양식 관리/ }).click();
    await page.waitForSelector("h3:has-text('양식 등록과 사용 순서')", { timeout: 60000 });
    await page.waitForFunction(() => {
      const groups = [...document.querySelectorAll(".template-type-group-head strong")].map((node) =>
        node.textContent?.trim()
      );

      return (
        groups.includes("근무표 양식") &&
        groups.includes("품의서 양식") &&
        groups.includes("별첨1 양식") &&
        groups.includes("별첨2 양식")
      );
    }, { timeout: 60000 });

    console.log(
      `SMOKE_OK holiday=${holidayDate} rateVersion=${rateVersionLabel} templateGroups=4`
    );
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
