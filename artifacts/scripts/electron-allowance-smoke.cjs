const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const sampleDir = path.resolve(process.cwd(), "양식샘플");

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-allowance-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "imports", "pending");

  fs.mkdirSync(pendingDir, { recursive: true });
  fs.copyFileSync(
    path.resolve(sampleDir, "별첨1_샘플.xlsx"),
    path.resolve(pendingDir, "별첨1_샘플.xlsx")
  );

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

    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector("button:has-text('로그아웃')", { timeout: 60000 });
    } catch (error) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      console.error(`LOGIN_STATE ${bodyText}`);
      throw error;
    }

    await page.waitForFunction(async () => {
      const pending = await window.appBridge.listPendingFiles();
      return pending.ok && pending.data.length > 0;
    }, { timeout: 60000 });

    const seeded = await page.evaluate(async () => {
      const pending = await window.appBridge.listPendingFiles();

      if (!pending.ok || pending.data.length === 0) {
        throw new Error("승인 가능한 실적 파일이 없습니다.");
      }

      const target = pending.data.find((item) => item.fileName.includes("별첨1")) ?? pending.data[0];
      const approved = await window.appBridge.approvePendingFile({
        fileId: target.id,
        comment: "allowance smoke"
      });

      if (!approved.ok) {
        throw new Error(approved.message);
      }

      const calculated = await window.appBridge.runApprovedCalculation(target.id);

      if (!calculated.ok) {
        throw new Error(calculated.message);
      }

      return {
        fileName: calculated.data.fileName,
        employeeName: calculated.data.employeeName
      };
    });

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('상세 수당 내역')");
    await page.waitForSelector(".allowance-results-table tbody tr");

    const fileCell = await page
      .locator(".allowance-results-table tbody tr td")
      .nth(1)
      .textContent();
    const employeeCell = await page
      .locator(".allowance-results-table tbody tr td")
      .nth(2)
      .textContent();

    if ((fileCell ?? "").trim() !== seeded.fileName) {
      throw new Error(
        `수당 화면 파일 표시 실패: expected ${seeded.fileName}, got ${(fileCell ?? "").trim()}`
      );
    }

    if ((employeeCell ?? "").trim() !== seeded.employeeName) {
      throw new Error(
        `수당 화면 성명 표시 실패: expected ${seeded.employeeName}, got ${(employeeCell ?? "").trim()}`
      );
    }

    const totalBoxText = await page.locator(".allowance-total-box strong").first().textContent();

    if (!totalBoxText || totalBoxText.trim() === "₩0") {
      throw new Error("수당 화면 총 지급수당 표시가 비어 있습니다.");
    }

    console.log(`SMOKE_OK file=${seeded.fileName} employee=${seeded.employeeName}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
