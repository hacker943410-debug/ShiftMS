// Capture the 시급 일괄 업데이트 modal after the R5-R7 changes: header auto-detection, the split
// 이전/새 시급 종료일 columns, the 미배정 label, and the duplicate-header warning. Requires a BUILT
// app (npm run build:renderer && npm run build:electron).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ExcelJS = require("exceljs");
const { _electron: electron } = require("playwright");

const rootDir = process.cwd();
const outDir = path.resolve(rootDir, "artifacts", "wage-bulk-capture");
const distMainPath = path.resolve(rootDir, "dist-electron", "main", "main.js");
const distRendererPath = path.resolve(rootDir, "dist", "index.html");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (file, ok, extra) => {
  results.push({ file, ok, ...extra });
  console.log(`${ok ? "CAPTURED" : "FAILED  "} ${file}${extra?.error ? " :: " + extra.error : ""}`);
};

const setWindowSize = async (app, page, width, height) => {
  await app.evaluate(async ({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isMaximized()) win.unmaximize();
    win.setContentSize(size.width, size.height);
  }, { width, height });
  await page.waitForTimeout(400);
};

// The renderer opens the file through the main-process dialog, so the chosen path is set here.
const installFileDialog = async (app, filePath) => {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, filePath);
};

const dismissOverlays = async (page) => {
  for (let i = 0; i < 6; i += 1) {
    const releaseNotes = page.locator(".release-notes-overlay");
    if ((await releaseNotes.count()) > 0 && (await releaseNotes.first().isVisible())) {
      await releaseNotes.locator(".release-notes-actions .primary-button").first().click().catch(() => {});
      await page.waitForTimeout(150); continue;
    }
    const appUpdate = page.locator(".app-update-overlay");
    if ((await appUpdate.count()) > 0 && (await appUpdate.first().isVisible())) {
      const later = appUpdate.getByRole("button", { name: "나중에" });
      if ((await later.count()) > 0) { await later.first().click().catch(() => {}); await page.waitForTimeout(150); continue; }
    }
    return;
  }
};

const shot = async (page, file, selector) => {
  await page.waitForTimeout(400);
  const target = selector ? page.locator(selector).first() : page;
  await target.screenshot({ path: path.join(outDir, `${file}.png`) });
  record(file, true);
};

const writeWorkbook = async (file, { headers, rows }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("시급업데이트");

  headers.forEach((label, index) => {
    ws.getCell(1, index + 1).value = label;
  });
  rows.forEach((row, rowIndex) => {
    row.forEach((value, index) => {
      ws.getCell(rowIndex + 2, index + 1).value = value;
    });
  });

  await wb.xlsx.writeFile(file);
  return file;
};

// Whether the apply button is genuinely disabled, not merely styled that way.
const readApplyButtonState = (page) =>
  page.evaluate(() => {
    const button = [...document.querySelectorAll(".wage-bulk-modal .button-row button")].find(
      (el) => el.textContent?.trim() === "시급 일괄 업데이트"
    );
    return button ? { disabled: button.disabled, label: button.textContent?.trim() } : null;
  });

const readNotice = (page) =>
  page.locator(".wage-bulk-modal .field-hint").first().textContent().catch(() => null);

const readMapping = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".wage-bulk-modal .excel-import-grid .compact-site-field")].map(
      (field) => ({
        label: field.querySelector("span")?.textContent?.trim(),
        value: field.querySelector("input")?.value ?? null
      })
    )
  );

const readReadyTable = (page) =>
  page.evaluate(() => {
    const section = document.querySelectorAll(".wage-bulk-modal .excel-import-preview-section")[0];
    if (!section) return null;
    const head = [...section.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
    const rows = [...section.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim())
    );
    return { head, rows };
  });

const readSkippedTable = (page) =>
  page.evaluate(() => {
    const section = document.querySelectorAll(".wage-bulk-modal .excel-import-preview-section")[1];
    if (!section) return null;
    const head = [...section.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
    const rows = [...section.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim())
    );
    return { head, rows };
  });

const openBulkModal = async (page) => {
  await page.getByRole("button", { name: "시급 일괄 업데이트", exact: true }).first().click();
  await page.waitForSelector(".wage-bulk-modal", { timeout: 20000 });
  await page.waitForTimeout(500);
};

const closeBulkModal = async (page) => {
  await page.locator(".wage-bulk-modal .button-row .ghost-button", { hasText: "닫기" }).first().click();
  await page.waitForTimeout(400);
};

const pickFile = async (app, page, filePath) => {
  await installFileDialog(app, filePath);
  await page.getByRole("button", { name: "파일 가져오기", exact: true }).first().click();
  // The header row is read after the dialog returns.
  await page.waitForTimeout(1200);
};

(async () => {
  if (!fs.existsSync(distMainPath) || !fs.existsSync(distRendererPath)) {
    throw new Error("build 결과가 없습니다. npm run build:renderer && npm run build:electron 먼저 실행하세요.");
  }

  fs.mkdirSync(outDir, { recursive: true });

  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-wagebulk-"));
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-wagebulk-files-"));
  const app = await electron.launch({ args: ["."], cwd: rootDir, env: { ...process.env, DATA_DIR: tempDataDir } });
  const page = await app.firstWindow();
  const observed = {};

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await dismissOverlays(page);

    await page.waitForSelector(".login-layout .login-form", { timeout: 30000 });
    const loginForm = page.locator(".login-layout .login-form");
    await loginForm.locator("input").nth(0).fill("admin");
    await loginForm.locator("input").nth(1).fill("1234");
    await loginForm.locator(".login-submit").click();
    await page.waitForSelector(".login-panel .login-form .button-row", { timeout: 30000 });
    const pwForm = page.locator(".login-panel .login-form");
    await pwForm.locator("input").nth(0).fill("1234");
    await pwForm.locator("input").nth(1).fill("AdminChanged123!");
    await pwForm.locator("input").nth(2).fill("AdminChanged123!");
    await pwForm.locator(".button-row .primary-button").click();

    await page.waitForFunction(
      () => document.querySelectorAll(".route-list .route-button").length >= 1 && document.querySelector(".top-strip-title h2"),
      undefined, { timeout: 60000 },
    );
    await setWindowSize(app, page, 1500, 1050);
    await dismissOverlays(page);

    await page.getByRole("button", { name: /인력 관리/ }).first().click();
    await page.waitForFunction(
      () => document.querySelector(".top-strip-title h2")?.textContent?.trim() === "인력 관리",
      undefined, { timeout: 30000 },
    );
    await page.waitForTimeout(900);

    // The site name written here is deliberately wrong: only the employee code can find this person.
    const codeFile = await writeWorkbook(path.join(workDir, "with-code.xlsx"), {
      headers: ["사번", "근무지명", "이름", "시급"],
      rows: [
        ["EMP-001", "보라매DC(옛이름)", "김현우", "14,500"],
        ["EMP-023", "보라매DC", "박정호", "14,500"],
        ["EMP-없음", "보라매DC", "김현우", "14,500"],
        ["EMP-001", "보라매DC", "다른사람", "14,500"]
      ]
    });
    const noCodeFile = await writeWorkbook(path.join(workDir, "no-code-header.xlsx"), {
      headers: ["연번", "근무지명", "성명", "통상시급"],
      rows: [[1, "보라매DC", "김현우", "14,500"]]
    });
    const duplicateFile = await writeWorkbook(path.join(workDir, "duplicate-header.xlsx"), {
      headers: ["사번", "근무지명", "이름", "시급", "시급"],
      rows: [["EMP-001", "보라매DC", "김현우", "14,500", "9,000"]]
    });

    // 1) modal as opened, before any file
    await openBulkModal(page);
    await shot(page, "wage-bulk-01-empty", ".wage-bulk-modal");
    observed.emptyMapping = await readMapping(page);

    // 2) a workbook whose header row names the employee code
    await pickFile(app, page, codeFile);
    observed.detectedMapping = await readMapping(page);
    observed.detectedNotice = await readNotice(page);
    await shot(page, "wage-bulk-02-header-detected", ".wage-bulk-modal");

    // 3) preview: the split end-date columns and the code-matching notes
    await page.getByRole("button", { name: "미리보기", exact: true }).first().click();
    await page.waitForTimeout(2500);
    observed.applyEnabledAfterPreview = await readApplyButtonState(page);
    observed.readyTable = await readReadyTable(page);
    observed.skippedTable = await readSkippedTable(page);
    await shot(page, "wage-bulk-03-preview", ".wage-bulk-modal");

    // 4) a workbook with no 사번 header at all
    await pickFile(app, page, noCodeFile);
    observed.noCodeMapping = await readMapping(page);
    observed.noCodeNotice = await readNotice(page);
    await shot(page, "wage-bulk-04-no-code-header", ".wage-bulk-modal");

    // 5) two columns both headed 시급
    await pickFile(app, page, duplicateFile);
    observed.duplicateMapping = await readMapping(page);
    observed.duplicateNotice = await readNotice(page);
    observed.applyDisabledWithoutPreview = await readApplyButtonState(page);
    await shot(page, "wage-bulk-05-duplicate-header", ".wage-bulk-modal");

    await closeBulkModal(page);

    fs.writeFileSync(path.join(outDir, "_observed.json"), JSON.stringify(observed, null, 2), "utf8");
    fs.writeFileSync(path.join(outDir, "_manifest.json"), JSON.stringify(results, null, 2), "utf8");
    console.log("OBSERVED", JSON.stringify(observed, null, 2));
    const okN = results.filter((r) => r.ok).length;
    console.log(`CAPTURE_WAGE_BULK_DONE ok=${okN}/${results.length} dir=${outDir}`);
  } finally {
    await app.close();
    await wait(300);
  }
})().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1; });
