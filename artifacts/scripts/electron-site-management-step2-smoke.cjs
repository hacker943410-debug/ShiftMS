const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

const ensureStepTwoScreen = async (page, siteName) => {
  await page.getByRole("button", { name: /근무지 관리/ }).click();
  await page.waitForSelector("h3:has-text('근무지 관리')", { timeout: 60000 });

  const siteRow = page.locator(".site-list-table tbody tr").filter({ hasText: siteName }).first();
  await siteRow.waitFor({ state: "visible", timeout: 60000 });
  await siteRow.getByRole("button", { name: "상세 보기", exact: true }).click();
  await page.waitForSelector(".site-detail-modal", { timeout: 60000 });
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.waitForSelector("h3:has-text('근무지 수정 - 1단계: 패턴 등록')", { timeout: 60000 });
  await page.getByRole("button", { name: "다음 단계", exact: true }).click();
  await page.waitForSelector("h3:has-text('근무지 수정 - 2단계: 조직 구성')", { timeout: 60000 });
};

const seedSiteFixture = async (page) =>
  page.evaluate(async () => {
    const suffix = Date.now().toString().slice(-6);
    const siteCode = `SMK-${suffix}`;
    const siteName = `스모크 근무지 ${suffix}`;
    const assignmentDate = "2026-03-01";
    const teamLabels = ["A조", "B조", "C조"];

    const siteResult = await window.appBridge.saveSite({
      siteCode,
      name: siteName,
      status: "active",
      timezone: "Asia/Seoul"
    });

    if (!siteResult.ok) {
      throw new Error(siteResult.message);
    }

    const patternResult = await window.appBridge.saveShiftPattern({
      siteId: siteResult.data.id,
      name: `${siteName} 3조 2교대`,
      teamCount: 3,
      patternCode: "DNX",
      startIndexRule: "manual-seed",
      patternStartDate: assignmentDate,
      status: "active",
      steps: [
        { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
        { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
        { stepIndex: 2, dutyCode: "X", breakMinutes: 0 }
      ],
      teamIndexes: teamLabels.map((teamLabel, index) => ({
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
          patternStartDate: assignmentDate,
          steps: [
            { stepIndex: 0, dutyCode: "D", startTime: "06:00", endTime: "18:00", breakMinutes: 60 },
            { stepIndex: 1, dutyCode: "N", startTime: "18:00", endTime: "06:00", breakMinutes: 90 },
            { stepIndex: 2, dutyCode: "X", breakMinutes: 0 }
          ],
          teamIndexes: teamLabels.map((teamLabel, index) => ({
            teamLabel,
            index
          }))
        }
      ],
      teamCycleAssignments: teamLabels.map((teamLabel) => ({
        teamLabel,
        cycleKey: "cycle-1"
      })),
      poolEnabled: false,
      poolBreakMinutes: 0
    });

    if (!patternResult.ok) {
      throw new Error(patternResult.message);
    }

    const employees = [
      {
        employeeCode: `SMK-A-${suffix}`,
        name: "박가람",
        employmentType: "정규",
        status: "active",
        hireDate: "2024-01-01",
        siteId: siteResult.data.id,
        shiftGroup: "A조",
        hourlyRate: 12000
      },
      {
        employeeCode: `SMK-C-${suffix}`,
        name: "김동희",
        employmentType: "정규",
        status: "active",
        hireDate: "2024-01-01",
        siteId: siteResult.data.id,
        shiftGroup: "C조",
        hourlyRate: 12100
      },
      {
        employeeCode: `SMK-P-${suffix}`,
        name: "이나래",
        employmentType: "계약",
        status: "active",
        hireDate: "2024-02-01",
        hourlyRate: 11900
      }
    ];

    for (const employee of employees) {
      const result = await window.appBridge.saveEmployee(employee);

      if (!result.ok) {
        throw new Error(result.message);
      }
    }

    return {
      siteName,
      employeeName: "김동희"
    };
  });

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-site-step2-smoke-"));
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
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const seeded = await seedSiteFixture(page);
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await ensureAuthenticated(page);
    await ensureStepTwoScreen(page, seeded.siteName);

    const searchInput = page.locator("label:has-text('검색') input").first();
    await searchInput.click();
    const focused = await searchInput.evaluate((input) => document.activeElement === input);

    if (!focused) {
      throw new Error("근무지 관리 2단계 검색 입력창이 포커싱되지 않습니다.");
    }

    await searchInput.fill(seeded.employeeName);
    const searchValue = await searchInput.inputValue();
    if (searchValue !== seeded.employeeName) {
      throw new Error(`검색 입력값 반영 실패: expected ${seeded.employeeName}, got ${searchValue}`);
    }

    const columnByLabel = (label) =>
      page.locator(".assignment-column").filter({ has: page.locator(".assignment-column-title strong", { hasText: label }) }).first();

    const moveResult = await page.evaluate(
      async ({ siteName, employeeName }) => {
        const [employeesResult, sitesResult] = await Promise.all([
          window.appBridge.listEmployees(),
          window.appBridge.listSites()
        ]);

        if (!employeesResult.ok) {
          throw new Error(employeesResult.message);
        }

        if (!sitesResult.ok) {
          throw new Error(sitesResult.message);
        }

        const employee = employeesResult.data.find((item) => item.name === employeeName);
        const site = sitesResult.data.find((item) => item.name === siteName);

        if (!employee || !site) {
          throw new Error("조 이동 검증용 데이터를 찾지 못했습니다.");
        }

        return window.appBridge.saveEmployeeAssignment({
          employeeId: employee.id,
          siteId: site.id,
          shiftGroup: "A조",
          startDate: "2026-03-01"
        });
      },
      {
        siteName: seeded.siteName,
        employeeName: seeded.employeeName
      }
    );

    if (!moveResult?.ok) {
      throw new Error(moveResult?.message ?? "조 이동 저장에 실패했습니다.");
    }

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await ensureAuthenticated(page);
    await ensureStepTwoScreen(page, seeded.siteName);

    const aColumn = columnByLabel("A조");
    const cColumn = columnByLabel("C조");

    await page.waitForFunction(
      ({ employeeName }) => {
        const columns = [...document.querySelectorAll(".assignment-column")];
        const findColumn = (label) =>
          columns.find((column) =>
            column.querySelector(".assignment-column-title strong")?.textContent?.includes(label)
          );
        const aColumn = findColumn("A조");
        const cColumn = findColumn("C조");
        const countIn = (column) =>
          [...(column?.querySelectorAll(".assigned-member-card") ?? [])].filter((card) =>
            card.textContent?.includes(employeeName)
          ).length;

        const boardCount = [...document.querySelectorAll(".assignment-board-card .assigned-member-card")].filter(
          (card) => card.textContent?.includes(employeeName)
        ).length;
        const poolCount = [...document.querySelectorAll(".assignment-pool-card .pool-item")].filter((card) =>
          card.textContent?.includes(employeeName)
        ).length;

        return countIn(aColumn) === 1 && countIn(cColumn) === 0 && boardCount === 1 && poolCount === 0;
      },
      { employeeName: seeded.employeeName },
      { timeout: 60000 }
    );

    const aColumnText = ((await aColumn.textContent()) ?? "").replace(/\s+/g, " ");
    const cColumnText = ((await cColumn.textContent()) ?? "").replace(/\s+/g, " ");
    if (!aColumnText.includes("2명") || cColumnText.includes(seeded.employeeName)) {
      throw new Error(`조 이동 후 보드 반영 확인 실패: A=${aColumnText} / C=${cColumnText}`);
    }

    console.log(`SMOKE_OK site=${seeded.siteName} moved=${seeded.employeeName} target=A조`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
