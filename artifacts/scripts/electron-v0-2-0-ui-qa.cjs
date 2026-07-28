const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ExcelJS = require("exceljs");
const { _electron: electron } = require("playwright");

const rootDir = process.cwd();
const outputRoot = path.resolve(rootDir, "artifacts", "releases", "v0.2.0");
const logsRoot = path.join(outputRoot, "logs");
const screenshotsRoot = path.join(outputRoot, "screenshots");
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

const formatTimestamp = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}${second}`;
};

const createDateValues = (totalDays) =>
  Array.from({ length: totalDays }, (_, index) => new Date(Date.UTC(2026, 0, index + 1)));

const formatDateValue = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const ensureAuthenticated = async (page) => {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.some((button) => {
      const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return text === "로그인" || text.includes("내 정보");
    });
  }, undefined, { timeout: 60000 });

  const accountButton = page.getByRole("button", { name: /내 정보/ });

  if ((await accountButton.count()) > 0) {
    return;
  }

  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForSelector("button:has-text('내 정보')", { timeout: 60000 });
};

const setOpenDialogQueue = async (app, filePaths) => {
  await app.evaluate(({ dialog }, queuedFilePaths) => {
    const runtime = globalThis;

    if (!runtime.__qaOriginalShowOpenDialog) {
      runtime.__qaOriginalShowOpenDialog = dialog.showOpenDialog.bind(dialog);
      dialog.showOpenDialog = async () => {
        const nextPath = runtime.__qaDialogQueue.shift();

        if (!nextPath) {
          return {
            canceled: true,
            filePaths: []
          };
        }

        return {
          canceled: false,
          filePaths: [nextPath]
        };
      };
    }

    runtime.__qaDialogQueue = queuedFilePaths.slice();
  }, filePaths);
};

const restoreOpenDialog = async (app) => {
  await app.evaluate(({ dialog }) => {
    const runtime = globalThis;

    if (runtime.__qaOriginalShowOpenDialog) {
      dialog.showOpenDialog = runtime.__qaOriginalShowOpenDialog;
      delete runtime.__qaOriginalShowOpenDialog;
    }

    delete runtime.__qaDialogQueue;
  });
};

const clickRouteButton = async (page, label) => {
  await page.getByRole("button", { name: label }).click();
  await page.waitForTimeout(400);
};

const selectCustomOption = async (page, field, controlIndex, optionLabel) => {
  await field.evaluate((element, index) => {
    const control = element.querySelectorAll(".app-select-control")[index];

    if (!(control instanceof HTMLButtonElement)) {
      throw new Error(`커스텀 셀렉트 컨트롤을 찾지 못했습니다: index=${index}`);
    }

    control.click();
  }, controlIndex);
  await page.waitForFunction(
    (label) =>
      [...document.querySelectorAll(".app-select-dropdown [role='option']")].some((option) =>
        option.textContent?.includes(label)
      ),
    optionLabel,
    { timeout: 10000 }
  );
  await page.evaluate((label) => {
    const option = [...document.querySelectorAll(".app-select-dropdown [role='option']")].find(
      (node) => node.textContent?.includes(label)
    );

    if (!(option instanceof HTMLButtonElement)) {
      throw new Error(`커스텀 셀렉트 옵션을 찾지 못했습니다: ${label}`);
    }

    option.click();
  }, optionLabel);
  await page.waitForFunction(
    () => document.querySelector(".app-select-dropdown") === null,
    undefined,
    { timeout: 10000 }
  );
};

const bridgeOk = (result, label) => {
  if (!result?.ok) {
    throw new Error(result?.message ?? `${label} bridge 호출에 실패했습니다.`);
  }

  return result.data;
};

const createWageWorkbookFixture = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("시급업데이트");

  worksheet.getCell("B1").value = "근무지명";
  worksheet.getCell("C1").value = "이름";
  worksheet.getCell("D1").value = "시급";

  const rows = [
    ["보라매DC", "김현우", "13,600"],
    ["보라매DC", "김현우", "13,700"],
    ["동탄센터", "이수민", "13,200"],
    ["없는센터", "김현우", "12,500"],
    ["보라매DC", "없는사람", "12,500"],
    ["보라매DC", "김현우", "시급오류"],
    ["보라매DC", "박중복", "15,000"],
    ["보라매DC", "최퇴사", "14,500"],
    ["보라매DC", "정충돌", "15,000"],
    ["", "", ""]
  ];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    worksheet.getCell(`B${rowNumber}`).value = row[0];
    worksheet.getCell(`C${rowNumber}`).value = row[1];
    worksheet.getCell(`D${rowNumber}`).value = row[2];
  });

  await workbook.xlsx.writeFile(filePath);
};

const createPatternWorkbookFixture = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("표준근무표");
  const dates = createDateValues(14);

  worksheet.getCell("A1").value = "날짜";
  worksheet.getCell("A2").value = "요일";
  worksheet.getCell("A3").value = "공휴일";

  dates.forEach((date, index) => {
    const column = index + 2;

    worksheet.getCell(1, column).value = formatDateValue(date);
    worksheet.getCell(2, column).value = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
    worksheet.getCell(3, column).value = index === 0 ? "신정" : "";
  });

  const workerRows = [
    ["김현중", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"],
    ["이은동", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O"],
    ["송민재", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "N"],
    ["류중록", "D", "D", "D", "D", "D", "O", "O", "D", "D", "D", "D", "D", "O", "O"],
    ["김현중", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"],
    ["빈근무자", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
  ];

  workerRows.forEach((row, rowIndex) => {
    const worksheetRow = rowIndex + 4;

    worksheet.getCell(worksheetRow, 1).value = row[0];
    row.slice(1).forEach((code, index) => {
      worksheet.getCell(worksheetRow, index + 2).value = code;
    });
  });

  await workbook.xlsx.writeFile(filePath);
};

const createInvalidPatternWorkbookFixture = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("패턴없음");
  const dates = createDateValues(10);
  const sequence = ["D", "N", "D", "N", "O", "O", "D", "O", "N", "D"];

  worksheet.getCell("A1").value = "날짜";
  worksheet.getCell("A2").value = "요일";
  worksheet.getCell("A3").value = "공휴일";

  dates.forEach((date, index) => {
    const column = index + 2;

    worksheet.getCell(1, column).value = formatDateValue(date);
    worksheet.getCell(2, column).value = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
    worksheet.getCell(3, column).value = "";
    worksheet.getCell(4, column).value = sequence[index];
  });

  worksheet.getCell("A4").value = "패턴없음";

  await workbook.xlsx.writeFile(filePath);
};

const seedWorkforceFixture = async (page) =>
  page.evaluate(async () => {
    const ok = (result, label) => {
      if (!result?.ok) {
        throw new Error(result?.message ?? `${label} bridge 호출에 실패했습니다.`);
      }

      return result.data;
    };

    const existingSites = ok(await window.appBridge.listSites(), "근무지 목록");
    const siteByName = new Map(existingSites.map((site) => [site.name, site]));

    const upsertSite = async (siteCode, name) => {
      const existing = siteByName.get(name);
      const saved = ok(
        await window.appBridge.saveSite(
          existing
            ? {
                id: existing.id,
                siteCode: existing.siteCode,
                name,
                status: "active",
                timezone: "Asia/Seoul"
              }
            : {
                siteCode,
                name,
                status: "active",
                timezone: "Asia/Seoul"
              }
        ),
        `근무지 ${name}`
      );

      siteByName.set(saved.name, saved);
      return saved;
    };

    const boraSite = await upsertSite("QA-SITE-001", "보라매DC");
    const dongtanSite = await upsertSite("QA-SITE-002", "동탄센터");

    const employees = [
      {
        employeeCode: "QA-EMP-003",
        name: "박중복",
        employmentType: "계약직",
        status: "active",
        hireDate: "2026-01-01",
        retireDate: "",
        siteId: boraSite.id,
        shiftGroup: "A조",
        hourlyRate: 12500,
        effectiveFrom: "2026-01-01"
      },
      {
        employeeCode: "QA-EMP-004",
        name: "박중복",
        employmentType: "계약직",
        status: "active",
        hireDate: "2026-01-01",
        retireDate: "",
        siteId: boraSite.id,
        shiftGroup: "B조",
        hourlyRate: 12600,
        effectiveFrom: "2026-01-01"
      },
      {
        employeeCode: "QA-EMP-005",
        name: "최퇴사",
        employmentType: "정규직",
        status: "retired",
        hireDate: "2025-01-01",
        retireDate: "2026-03-15",
        siteId: boraSite.id,
        shiftGroup: "C조",
        hourlyRate: 12800,
        effectiveFrom: "2026-01-01"
      },
      {
        employeeCode: "QA-EMP-006",
        name: "정충돌",
        employmentType: "정규직",
        status: "active",
        hireDate: "2026-01-01",
        retireDate: "",
        siteId: boraSite.id,
        shiftGroup: "D조",
        hourlyRate: 14000,
        effectiveFrom: "2026-04-15"
      }
    ];

    const savedEmployees = [];

    for (const employee of employees) {
      const savedEmployee = ok(
        await window.appBridge.saveEmployee({
          employeeCode: employee.employeeCode,
          name: employee.name,
          employmentType: employee.employmentType,
          status: employee.status,
          hireDate: employee.hireDate,
          retireDate: employee.retireDate || undefined
        }),
        `직원 ${employee.employeeCode}`
      );

      ok(
        await window.appBridge.saveEmployeeAssignment({
          employeeId: savedEmployee.id,
          siteId: employee.siteId,
          shiftGroup: employee.shiftGroup,
          teamName: employee.shiftGroup,
          startDate: employee.hireDate
        }),
        `배정 ${employee.employeeCode}`
      );

      ok(
        await window.appBridge.saveEmployeeWageRate({
          employeeId: savedEmployee.id,
          hourlyRate: employee.hourlyRate,
          effectiveFrom: employee.effectiveFrom,
          reason: "QA 초기 시급"
        }),
        `시급 ${employee.employeeCode}`
      );

      savedEmployees.push({
        id: savedEmployee.id,
        employeeCode: savedEmployee.employeeCode,
        name: savedEmployee.name
      });
    }

    return {
      sites: [boraSite, dongtanSite].map((site) => ({
        id: site.id,
        name: site.name,
        siteCode: site.siteCode
      })),
      employees: savedEmployees
    };
  });

const readWagePreviewState = async (page) =>
  page.evaluate(() => {
    const summaryCards = [...document.querySelectorAll(".import-preview-summary-card")].map((card) => ({
      title: card.querySelector("span")?.textContent?.trim() ?? "",
      value: card.querySelector("strong")?.textContent?.trim() ?? "",
      note: card.querySelector("em")?.textContent?.trim() ?? ""
    }));
    const previewRows = [...document.querySelectorAll(".excel-import-preview-section table tbody tr")]
      .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""))
      .filter((row) => row.length > 0);
    const statusLabels = [...document.querySelectorAll(".excel-import-preview-section .pill")].map(
      (node) => node.textContent?.trim() ?? ""
    );

    return {
      summaryCards,
      previewRows,
      statusLabels
    };
  });

const readWorkforceDetailState = async (page) =>
  page.evaluate(() => {
    const wageHistoryBox = [...document.querySelectorAll(".detail-history-box")].find((box) =>
      box.textContent?.includes("시급변경이력")
    );

    return {
      currentHourlyRate:
        [...document.querySelectorAll(".detail-summary-card")]
          .find((card) => card.textContent?.includes("현재 시급"))
          ?.querySelector("strong")
          ?.textContent?.trim() ?? "",
      wageHistory: wageHistoryBox
        ? [...wageHistoryBox.querySelectorAll(".timeline-item p")].map(
            (node) => node.textContent?.trim() ?? ""
          )
        : []
    };
  });

const readPatternSummaryState = async (page) =>
  page.evaluate(() => {
    const summaryCards = [...document.querySelectorAll(".pattern-import-summary-grid .import-preview-summary-card")].map(
      (card) => ({
        title: card.querySelector("span")?.textContent?.trim() ?? "",
        value: card.querySelector("strong")?.textContent?.trim() ?? "",
        note: card.querySelector("em")?.textContent?.trim() ?? ""
      })
    );
    const noteLines = [...document.querySelectorAll(".guide-note-box p")].map(
      (node) => node.textContent?.trim() ?? ""
    );
    const analysisReport = document.querySelector(".pattern-import-report-pre")?.textContent?.trim() ?? "";

    return {
      summaryCards,
      noteLines,
      analysisReport
    };
  });

const readSiteStepOneState = async (page) =>
  page.evaluate(() => {
    const cycleSections = [...document.querySelectorAll(".site-cycle-config-section")].map((section) => ({
      title: section.querySelector(".site-config-title")?.textContent?.trim() ?? "",
      breakMinutes:
        [...section.querySelectorAll("label.field")]
          .find((label) => label.textContent?.includes("휴게시간(분)"))
          ?.querySelector("input")
          ?.value?.trim() ?? "",
      patternString:
        section.querySelector(".site-pattern-string-card input")?.value?.trim() ?? "",
      patternStartDate:
        [...section.querySelectorAll("label.field")]
          .find((label) => label.textContent?.includes("패턴 시작일"))
          ?.querySelector("input")
          ?.value?.trim() ?? "",
      teamIndexValues: [...section.querySelectorAll(".site-index-grid input")].map((input) => input.value.trim()),
      shiftTimePreviews: [...section.querySelectorAll(".site-time-range-preview")].map(
        (node) => node.textContent?.trim() ?? ""
      ),
      assignedTeams: [...section.querySelectorAll(".site-cycle-team-chip")].map(
        (chip) => chip.textContent?.trim() ?? ""
      )
    }));

    return {
      header: document.querySelector(".site-stage-header h3")?.textContent?.trim() ?? "",
      teamCount:
        [...document.querySelectorAll(".site-topology-grid input")]
          .find((input) => input.parentElement?.textContent?.includes("조 수"))
          ?.value?.trim() ?? "",
      cycleCount:
        [...document.querySelectorAll(".site-topology-grid input")]
          .find((input) => input.parentElement?.textContent?.includes("Cycle 수"))
          ?.value?.trim() ?? "",
      siteName:
        [...document.querySelectorAll(".site-registration-grid input")]
          .find((input) => input.parentElement?.textContent?.includes("근무지명"))
          ?.value?.trim() ?? "",
      summaryMetrics: [...document.querySelectorAll(".site-summary-box span")].map(
        (node) => node.textContent?.trim() ?? ""
      ),
      calendarCellCount: document.querySelectorAll(".site-calendar-cell").length,
      cycleSections
    };
  });

const readSiteStepTwoState = async (page) =>
  page.evaluate(() => ({
    header: document.querySelector(".site-stage-header h3")?.textContent?.trim() ?? "",
    capacityValues: [...document.querySelectorAll(".assignment-capacity-field input")].map((input) =>
      input.value.trim()
    ),
    columnLabels: [...document.querySelectorAll(".assignment-column-title strong")].map(
      (node) => node.textContent?.trim() ?? ""
    )
  }));

const readSiteDetailState = async (page) =>
  page.evaluate(() => ({
    cycleMeta: [...document.querySelectorAll(".site-detail-cycle-meta")].map((node) =>
      node.textContent?.replace(/\s+/g, " ").trim() ?? ""
    ),
    shiftCards: [...document.querySelectorAll(".site-detail-shift-grid .site-detail-section")].map((card) => ({
      label: card.querySelector("span")?.textContent?.trim() ?? "",
      timeRange: card.querySelector("strong")?.textContent?.trim() ?? "",
      meta: card.querySelector("em")?.textContent?.trim() ?? ""
    })),
    teamCards: [...document.querySelectorAll(".site-detail-team-grid .site-detail-section")].map((card) => ({
      label: card.querySelector("span")?.textContent?.trim() ?? "",
      index: card.querySelector("strong")?.textContent?.trim() ?? "",
      meta: card.querySelector("em")?.textContent?.trim() ?? ""
    }))
  }));

(async () => {
  assert(fs.existsSync(distMainPath), `Electron main build 결과가 없습니다: ${distMainPath}`);
  assert(fs.existsSync(distRendererPath), `Renderer build 결과가 없습니다: ${distRendererPath}`);

  const startedAt = new Date();
  const runId = `electron-ui-qa-${formatTimestamp(startedAt)}`;
  const runLogDir = ensureDirectory(path.join(logsRoot, runId));
  const runScreenshotDir = ensureDirectory(path.join(screenshotsRoot, runId));
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-v020-ui-qa-"));
  const wageWorkbookPath = path.join(runLogDir, "v020-wage-ui-qa.xlsx");
  const patternWorkbookPath = path.join(runLogDir, "v020-pattern-ui-qa.xlsx");
  const invalidPatternWorkbookPath = path.join(runLogDir, "v020-pattern-ui-invalid.xlsx");

  await createWageWorkbookFixture(wageWorkbookPath);
  await createPatternWorkbookFixture(patternWorkbookPath);
  await createInvalidPatternWorkbookFixture(invalidPatternWorkbookPath);

  const app = await electron.launch({
    args: ["."],
    cwd: rootDir,
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

    await seedWorkforceFixture(page);
    const siteCountBeforeDraft = bridgeOk(
      await page.evaluate(() => window.appBridge.listSites()),
      "초기 근무지 목록"
    ).length;

    await clickRouteButton(page, /인력 관리/);
    await page.waitForSelector("h3:has-text('근무 인력 관리')", { timeout: 60000 });

    assert(
      (await page.getByRole("button", { name: "시급 일괄 업데이트", exact: true }).count()) > 0,
      "인력 관리 화면에서 시급 일괄 업데이트 버튼을 찾지 못했습니다."
    );
    await page.getByRole("button", { name: "시급 일괄 업데이트", exact: true }).first().click();
    await page.waitForSelector("h3:has-text('시급 일괄 업데이트')", { timeout: 60000 });

    await page.getByRole("button", { name: "가이드 보기", exact: true }).click();
    await page.waitForSelector("h3:has-text('시급 일괄 업데이트 가이드')", { timeout: 60000 });
    await page.locator(".guide-modal").getByRole("button", { name: "닫기", exact: true }).click();
    await page.waitForSelector("h3:has-text('시급 일괄 업데이트 가이드')", {
      state: "detached",
      timeout: 60000
    });

    await setOpenDialogQueue(app, [wageWorkbookPath]);
    await page.getByRole("button", { name: "파일 가져오기", exact: true }).click();
    await page.waitForFunction(
      (fileName) =>
        document.querySelector(".excel-import-file-card p")?.textContent?.includes(fileName),
      path.basename(wageWorkbookPath),
      { timeout: 60000 }
    );

    await page.locator("label:has-text('근무지명 열') input").fill("B");
    await page.locator("label:has-text('이름 열') input").fill("C");
    await page.locator("label:has-text('시급 열') input").fill("D");
    await page.locator("label:has-text('적용 날짜') .date-field-control").click();
    await page.locator(".date-field-popover .date-field-nav").nth(1).click();
    // 날짜 클릭이 곧 확정이다(별도 '확인' 단계 없음).
    await page
      .locator(".date-field-popover .date-field-day:not(.is-muted)", { hasText: /^1$/ })
      .click();

    await page.getByRole("button", { name: "미리보기", exact: true }).click();
    await page.waitForSelector("h3:has-text('적용 전 → 적용 후')", { timeout: 60000 });

    const wagePreviewState = await readWagePreviewState(page);
    const wageSummaryByTitle = new Map(wagePreviewState.summaryCards.map((item) => [item.title, item]));
    const wageReadyRow = wagePreviewState.previewRows.find((row) => row.includes("김현우"));

    assert(
      wageSummaryByTitle.get("파일 행 수")?.value === "9건",
      `시급 미리보기 총행 수가 기대와 다릅니다: ${JSON.stringify(wagePreviewState.summaryCards)}`
    );
    assert(
      wageSummaryByTitle.get("적용 가능")?.value === "1건",
      `시급 미리보기 적용 가능 건수가 기대와 다릅니다: ${JSON.stringify(wagePreviewState.summaryCards)}`
    );
    assert(
      wageSummaryByTitle.get("제외 대상")?.value === "8건",
      `시급 미리보기 제외 건수가 기대와 다릅니다: ${JSON.stringify(wagePreviewState.summaryCards)}`
    );
    assert(
      [
        "적용 가능",
        "중복 행 제외",
        "기존 시급과 동일",
        "일치 인력 없음",
        "시급 형식 오류",
        "동일 인력 중복",
        "퇴사자 제외",
        "적용일 충돌"
      ].every((label) => wagePreviewState.statusLabels.includes(label)),
      `시급 예외 상태 라벨이 일부 누락되었습니다: ${JSON.stringify(wagePreviewState.statusLabels)}`
    );
    assert(
      wageReadyRow &&
        wageReadyRow[4] === "12,800원" &&
        wageReadyRow[5] === "13,600원" &&
        wageReadyRow[6] === "2023.03.01" &&
        wageReadyRow[7] === "2026.03.31",
      `시급 비교 UI 값이 기대와 다릅니다: ${JSON.stringify(wageReadyRow)}`
    );

    const wagePreviewScreenshotPath = path.join(runScreenshotDir, "workforce-wage-preview.png");
    await page.screenshot({ path: wagePreviewScreenshotPath, fullPage: true });

    await page
      .locator(".wage-bulk-modal")
      .getByRole("button", { name: "시급 일괄 업데이트", exact: true })
      .click();
    await page.waitForSelector(".form-success-text", { timeout: 60000 });

    const wageSuccessText = await page.locator(".form-success-text").innerText();
    assert(
      wageSuccessText.includes("1명의 시급 변경 이력을 반영했습니다."),
      `시급 일괄 적용 성공 문구가 기대와 다릅니다: ${wageSuccessText}`
    );

    await page
      .locator(".wage-bulk-modal")
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    await page.waitForSelector("h3:has-text('시급 일괄 업데이트')", {
      state: "detached",
      timeout: 60000
    });

    let workforceDetailState = null;
    let workforceDetailScreenshotPath = null;
    let workforceDetailUiSkipped = false;

    if ((await page.getByRole("button", { name: "김현우 상세 보기", exact: true }).count()) > 0) {
      await page.getByRole("button", { name: "김현우 상세 보기", exact: true }).click();
      await page.waitForSelector("p:has-text('인력 상세 정보')", { timeout: 60000 });

      workforceDetailState = await readWorkforceDetailState(page);
      assert(
        workforceDetailState.currentHourlyRate === "13,600원",
        `인력 상세 현재 시급이 갱신되지 않았습니다: ${JSON.stringify(workforceDetailState)}`
      );
      assert(
        workforceDetailState.wageHistory.some(
          (line) =>
            line.includes("2026.04.01") &&
            line.includes("13,600원") &&
            line.includes("엑셀 일괄 시급 업데이트 (v020-wage-ui-qa.xlsx)")
        ),
        `시급변경이력에 일괄 업데이트 사유가 보이지 않습니다: ${JSON.stringify(workforceDetailState.wageHistory)}`
      );
      assert(
        workforceDetailState.wageHistory.some(
          (line) => line.includes("2023.03.01") && line.includes("종료 2026.03.31")
        ),
        `기존 시급 종료일 반영이 UI에서 확인되지 않습니다: ${JSON.stringify(workforceDetailState.wageHistory)}`
      );

      workforceDetailScreenshotPath = path.join(runScreenshotDir, "workforce-wage-detail.png");
      await page.screenshot({ path: workforceDetailScreenshotPath, fullPage: true });
      await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
      await page.waitForSelector("h3:has-text('근무 인력 관리')", { timeout: 60000 });
    } else {
      workforceDetailUiSkipped = true;
    }

    const wageHistoryResult = bridgeOk(
      await page.evaluate(async () => {
        const employees = await window.appBridge.listEmployees({ keyword: "김현우" });

        if (!employees.ok) {
          return employees;
        }

        const target = employees.data.find((employee) => employee.name === "김현우");

        if (!target) {
          return {
            ok: false,
            message: "김현우 직원을 찾지 못했습니다."
          };
        }

        return window.appBridge.listEmployeeWageRates(target.id);
      }),
      "시급 이력 재조회"
    );

    assert(
      wageHistoryResult[0]?.hourlyRate === 13600 &&
        wageHistoryResult[0]?.effectiveFrom === "2026-04-01" &&
        wageHistoryResult[1]?.effectiveTo === "2026-03-31",
      `시급 저장 결과 재조회 값이 기대와 다릅니다: ${JSON.stringify(wageHistoryResult)}`
    );

    await clickRouteButton(page, /근무지 관리/);
    await page.waitForSelector("h3:has-text('근무지 관리')", { timeout: 60000 });

    assert(
      (await page.getByRole("button", { name: "패턴 적용된 근무지 추가", exact: true }).count()) > 0,
      "근무지 관리 화면에서 패턴 적용된 근무지 추가 버튼을 찾지 못했습니다."
    );
    await page.getByRole("button", { name: "패턴 적용된 근무지 추가", exact: true }).click();
    await page.waitForSelector("h3:has-text('패턴 적용된 근무지 추가')", { timeout: 60000 });

    await page.getByRole("button", { name: "가이드 보기", exact: true }).click();
    await page.waitForSelector("h3:has-text('패턴 산출 가이드')", { timeout: 60000 });
    await page.locator(".guide-modal").getByRole("button", { name: "닫기", exact: true }).click();
    await page.waitForSelector("h3:has-text('패턴 산출 가이드')", {
      state: "detached",
      timeout: 60000
    });

    await setOpenDialogQueue(app, [invalidPatternWorkbookPath]);
    await page.getByRole("button", { name: "파일 가져오기", exact: true }).click();
    await page.waitForFunction(
      (fileName) =>
        document.querySelector(".excel-import-file-card p")?.textContent?.includes(fileName),
      path.basename(invalidPatternWorkbookPath),
      { timeout: 60000 }
    );
    await page.getByRole("button", { name: "패턴 산출", exact: true }).click();
    await page.waitForSelector(".form-error-text", { timeout: 60000 });
    const invalidPatternError = await page.locator(".form-error-text").innerText();
    assert(
      invalidPatternError.includes("탐지된 패턴이 없습니다."),
      `패턴 미발견 오류 문구가 기대와 다릅니다: ${invalidPatternError}`
    );

    await setOpenDialogQueue(app, [patternWorkbookPath]);
    await page.getByRole("button", { name: "파일 가져오기", exact: true }).click();
    await page.waitForFunction(
      (fileName) =>
        document.querySelector(".excel-import-file-card p")?.textContent?.includes(fileName),
      path.basename(patternWorkbookPath),
      { timeout: 60000 }
    );
    await page.getByRole("button", { name: "패턴 산출", exact: true }).click();
    await page.waitForSelector("h3:has-text('패턴 산출 결과 미리보기')", { timeout: 60000 });

    const patternSummaryState = await readPatternSummaryState(page);
    const patternSummaryByTitle = new Map(
      patternSummaryState.summaryCards.map((item) => [item.title, item])
    );
    assert(
      patternSummaryByTitle.get("분석 기간")?.value === "2026-01-01 ~ 2026-01-14",
      `패턴 분석 기간 카드가 기대와 다릅니다: ${JSON.stringify(patternSummaryState.summaryCards)}`
    );
    assert(
      patternSummaryByTitle.get("분석 대상")?.value === "4명",
      `패턴 분석 대상 카드가 기대와 다릅니다: ${JSON.stringify(patternSummaryState.summaryCards)}`
    );
    assert(
      patternSummaryByTitle.get("발견 Cycle")?.value === "2개",
      `패턴 발견 Cycle 카드가 기대와 다릅니다: ${JSON.stringify(patternSummaryState.summaryCards)}`
    );
    assert(
      patternSummaryByTitle.get("감지 조 수")?.value === "4개",
      `패턴 감지 조 수 카드가 기대와 다릅니다: ${JSON.stringify(patternSummaryState.summaryCards)}`
    );
    assert(
      patternSummaryByTitle.get("공휴일 / 제외")?.value === "1일 / 1명",
      `패턴 공휴일/제외 카드가 기대와 다릅니다: ${JSON.stringify(patternSummaryState.summaryCards)}`
    );
    assert(
      (patternSummaryByTitle.get("고유 근무코드")?.value ?? "")
        .split(",")
        .map((value) => value.trim())
        .sort()
        .join(", ") === "D, N, O",
      `패턴 고유 근무코드 카드가 기대와 다릅니다: ${JSON.stringify(patternSummaryState.summaryCards)}`
    );
    assert(
      patternSummaryState.noteLines.some((line) =>
        line.includes("근무자 이름 '김현중'이 중복되어 마지막 행의 데이터를 사용했습니다.")
      ) &&
        patternSummaryState.noteLines.some((line) =>
          line.includes("빈근무자: 근무코드가 모두 비어 있어 분석에서 제외했습니다.")
        ),
      `경고/제외 안내가 기대와 다릅니다: ${JSON.stringify(patternSummaryState.noteLines)}`
    );
    assert(
      patternSummaryState.analysisReport.includes("근무 사이클 패턴 분석 결과") &&
        patternSummaryState.analysisReport.includes("발견된 사이클 그룹: 2개"),
      "분석 결과 텍스트가 기대 형식과 다릅니다."
    );

    await app.evaluate(({ clipboard }) => clipboard.writeText(""));
    await page.getByRole("button", { name: "텍스트 복사", exact: true }).click();
    await page.waitForSelector(".pattern-import-copy-status", { timeout: 60000 });
    const copyStatusText = await page.locator(".pattern-import-copy-status").innerText();
    const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert(
      copyStatusText.includes("분석 결과 텍스트를 클립보드에 복사했습니다."),
      `텍스트 복사 상태 문구가 기대와 다릅니다: ${copyStatusText}`
    );
    assert(
      clipboardText.includes("근무 사이클 패턴 분석 결과"),
      "클립보드 복사 결과가 비어 있거나 기대 텍스트를 포함하지 않습니다."
    );

    await page.getByRole("button", { name: "그룹별 상세", exact: true }).click();
    await page.waitForSelector("h3:has-text('그룹별 상세')", { timeout: 60000 });
    assert(
      (await page.locator(".info-table.wide tbody tr").count()) > 0,
      "그룹별 상세 탭 데이터가 비어 있습니다."
    );

    await page.getByRole("button", { name: "불일치 내역", exact: true }).click();
    await page.waitForSelector("h3:has-text('불일치 내역')", { timeout: 60000 });
    assert(
      (await page.locator(".info-table.wide tbody tr").count()) > 0,
      "불일치 내역 탭 데이터가 비어 있습니다."
    );

    await page.getByRole("button", { name: "원본 데이터", exact: true }).click();
    await page.waitForSelector("h3:has-text('원본 데이터 미리보기')", { timeout: 60000 });
    assert(
      (await page.locator(".pattern-import-data-table tbody tr").count()) >= 3,
      "원본 데이터 탭 테이블이 비어 있습니다."
    );

    await page.getByRole("button", { name: "분석 결과", exact: true }).click();
    await page.waitForSelector("h3:has-text('분석 결과 텍스트')", { timeout: 60000 });

    const patternPreviewScreenshotPath = path.join(runScreenshotDir, "site-pattern-preview.png");
    await page.screenshot({ path: patternPreviewScreenshotPath, fullPage: true });

    await page.getByRole("button", { name: "근무지 등록(1단계 이동)", exact: true }).click();
    await page.waitForSelector("h3:has-text('근무지 등록 - 1단계: 패턴 등록')", {
      timeout: 60000
    });

    const siteCountAfterDraftApply = bridgeOk(
      await page.evaluate(() => window.appBridge.listSites()),
      "드래프트 적용 전 근무지 목록"
    ).length;
    assert(
      siteCountAfterDraftApply === siteCountBeforeDraft,
      `드래프트 적용만으로 근무지 수가 변경되었습니다: before=${siteCountBeforeDraft}, after=${siteCountAfterDraftApply}`
    );

    const siteStepOneStateBeforeEdit = await readSiteStepOneState(page);
    assert(
      siteStepOneStateBeforeEdit.teamCount === "4",
      `1단계 조 수 자동 입력이 기대와 다릅니다: ${JSON.stringify(siteStepOneStateBeforeEdit)}`
    );
    assert(
      siteStepOneStateBeforeEdit.cycleCount === "2",
      `1단계 Cycle 수 자동 입력이 기대와 다릅니다: ${JSON.stringify(siteStepOneStateBeforeEdit)}`
    );
    assert(
      siteStepOneStateBeforeEdit.cycleSections.length === 2 &&
        siteStepOneStateBeforeEdit.cycleSections.every(
          (section) => section.patternString.length > 0
        ),
      `1단계 Cycle 패턴 문자열 자동 입력이 기대와 다릅니다: ${JSON.stringify(siteStepOneStateBeforeEdit.cycleSections)}`
    );
    assert(
      siteStepOneStateBeforeEdit.cycleSections[0]?.patternStartDate === "2026-01-01",
      `1단계 패턴 시작일 자동 입력이 기대와 다릅니다: ${JSON.stringify(siteStepOneStateBeforeEdit.cycleSections)}`
    );
    assert(
      siteStepOneStateBeforeEdit.cycleSections.reduce(
        (sum, section) => sum + section.teamIndexValues.length,
        0
      ) === 4,
      `1단계 조별 Cycle 배정 자동 입력이 기대와 다릅니다: ${JSON.stringify(siteStepOneStateBeforeEdit.cycleSections)}`
    );
    assert(
      siteStepOneStateBeforeEdit.summaryMetrics.includes("월간 1인 실근무시간"),
      `1단계 시뮬레이션 지표가 렌더링되지 않았습니다: ${JSON.stringify(siteStepOneStateBeforeEdit.summaryMetrics)}`
    );
    assert(
      siteStepOneStateBeforeEdit.calendarCellCount >= 28,
      `1단계 달력 시뮬레이션 셀이 충분히 렌더링되지 않았습니다: ${siteStepOneStateBeforeEdit.calendarCellCount}`
    );

    await page.locator("label:has-text('근무지명') input").fill("패턴QA근무지");
    const firstCycleSection = page.locator(".site-cycle-config-section").first();
    await firstCycleSection.locator("label:has-text('휴게시간(분)') input").fill("45");
    const firstShiftField = firstCycleSection.locator(".site-time-grid label.field").first();
    await selectCustomOption(page, firstShiftField, 0, "08");
    await selectCustomOption(page, firstShiftField, 2, "20");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".site-cycle-config-section .site-time-range-preview")
          ?.textContent?.includes("08:00 - 20:00") ?? false,
      undefined,
      { timeout: 10000 }
    );

    const siteStepOneStateAfterEdit = await readSiteStepOneState(page);
    assert(
      siteStepOneStateAfterEdit.siteName === "패턴QA근무지",
      `1단계 근무지명 입력이 반영되지 않았습니다: ${JSON.stringify(siteStepOneStateAfterEdit)}`
    );
    assert(
      siteStepOneStateAfterEdit.cycleSections[0]?.breakMinutes === "45",
      `1단계 첫 Cycle 휴게시간 수정이 반영되지 않았습니다: ${JSON.stringify(siteStepOneStateAfterEdit.cycleSections)}`
    );
    assert(
      siteStepOneStateAfterEdit.cycleSections[0]?.shiftTimePreviews[0] === "08:00 - 20:00",
      `1단계 첫 근무시간 수정이 반영되지 않았습니다: ${JSON.stringify(siteStepOneStateAfterEdit.cycleSections)}`
    );

    const siteStepOneScreenshotPath = path.join(runScreenshotDir, "site-pattern-step1.png");
    await page.screenshot({ path: siteStepOneScreenshotPath, fullPage: true });

    await page.getByRole("button", { name: "다음 단계", exact: true }).click();
    await page.waitForSelector("h3:has-text('근무지 등록 - 2단계: 조직 구성')", {
      timeout: 60000
    });

    const siteStepTwoState = await readSiteStepTwoState(page);
    assert(
      siteStepTwoState.capacityValues.length === 4 &&
        siteStepTwoState.capacityValues.every((value) => value === "1"),
      `2단계 조별 정원 자동 입력이 기대와 다릅니다: ${JSON.stringify(siteStepTwoState)}`
    );

    await page.getByRole("button", { name: "완료", exact: true }).click();
    await page.waitForSelector("h3:has-text('근무지 관리')", { timeout: 60000 });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".site-list-table tbody tr")].some((row) =>
          row.textContent?.includes("패턴QA근무지")
        ),
      undefined,
      { timeout: 60000 }
    );

    const siteCountAfterSave = bridgeOk(
      await page.evaluate(() => window.appBridge.listSites()),
      "근무지 저장 후 목록"
    ).length;
    assert(
      siteCountAfterSave === siteCountBeforeDraft + 1,
      `근무지 저장 후 근무지 수가 기대와 다릅니다: before=${siteCountBeforeDraft}, after=${siteCountAfterSave}`
    );

    const savedRow = page.locator("tr", { hasText: "패턴QA근무지" }).first();
    await savedRow.getByRole("button", { name: "상세 보기", exact: true }).click();
    await page.waitForSelector(".site-detail-modal", { timeout: 60000 });

    const siteDetailState = await readSiteDetailState(page);
    assert(
      siteDetailState.cycleMeta.length === 2,
      `저장 후 상세에서 Cycle 수가 기대와 다릅니다: ${JSON.stringify(siteDetailState)}`
    );
    assert(
      siteDetailState.teamCards.length === 4 &&
        siteDetailState.teamCards.every(
          (card) => card.index.includes("조별 Index") && card.meta.includes("정원 1명")
        ),
      `저장 후 상세의 조별 Index/정원 정보가 기대와 다릅니다: ${JSON.stringify(siteDetailState)}`
    );
    assert(
      siteDetailState.shiftCards.some(
        (card) =>
          card.timeRange === "08:00 - 20:00" &&
          card.meta.includes("휴게 45분")
      ),
      `저장 후 상세의 근무시간/휴게시간 수정 결과가 기대와 다릅니다: ${JSON.stringify(siteDetailState)}`
    );

    const siteDetailScreenshotPath = path.join(runScreenshotDir, "site-pattern-detail.png");
    await page.screenshot({ path: siteDetailScreenshotPath, fullPage: true });
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.waitForSelector(".site-detail-modal", { state: "detached", timeout: 60000 });

    const summary = {
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      runId,
      tempDataDir,
      fixtures: {
        wageWorkbookPath,
        patternWorkbookPath,
        invalidPatternWorkbookPath
      },
      workforce: {
        wagePreviewState,
        wageSuccessText,
        workforceDetailState,
        workforceDetailUiSkipped,
        wageHistoryResult,
        screenshots: {
          preview: wagePreviewScreenshotPath,
          detail: workforceDetailScreenshotPath
        }
      },
      sitePattern: {
        invalidPatternError,
        patternSummaryState,
        copyStatusText,
        clipboardPreview: clipboardText.slice(0, 120),
        siteCountBeforeDraft,
        siteCountAfterDraftApply,
        siteCountAfterSave,
        siteStepOneStateBeforeEdit,
        siteStepOneStateAfterEdit,
        siteStepTwoState,
        siteDetailState,
        screenshots: {
          preview: patternPreviewScreenshotPath,
          step1: siteStepOneScreenshotPath,
          detail: siteDetailScreenshotPath
        }
      }
    };

    const summaryPath = path.join(runLogDir, "summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

    console.log(`ELECTRON_V020_UI_QA_OK summary=${summaryPath}`);
  } finally {
    await restoreOpenDialog(app);
    await app.close();
    await wait(300);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
