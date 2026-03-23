const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const sampleDir = path.resolve(process.cwd(), "양식샘플");
const sampleFiles = [
  "별첨1_샘플.xlsx",
  "별첨2_샘플.xlsx",
  "근무표_샘플1.xlsx",
  "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx"
];

const seedPendingFiles = (pendingDir) => {
  fs.mkdirSync(pendingDir, { recursive: true });

  for (const fileName of sampleFiles) {
    fs.copyFileSync(path.resolve(sampleDir, fileName), path.resolve(pendingDir, fileName));
  }
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-performance-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "imports", "pending");

  seedPendingFiles(pendingDir);

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

    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForSelector("button:has-text('로그아웃')", { timeout: 60000 });

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('승인대기 목록')");
    await page.waitForFunction(
      () => document.querySelectorAll(".performance-table tbody tr").length > 0,
      { timeout: 60000 }
    );

    const pendingDir = await page
      .locator("label:has-text('승인 대기 폴더') input")
      .first()
      .inputValue();
    const approvedDir = await page
      .locator("label:has-text('승인 완료 폴더') input")
      .first()
      .inputValue();

    if (!pendingDir || pendingDir === "-" || !approvedDir || approvedDir === "-") {
      throw new Error("실적 관리 화면에서 파일 경로 설정을 읽지 못했습니다.");
    }

    const detailButtons = page.locator(".performance-table tbody .icon-button");
    const detailButtonCount = await detailButtons.count();

    if (detailButtonCount === 0) {
      throw new Error("실적 관리 화면에서 승인대기 파일을 찾지 못했습니다.");
    }

    const firstRow = page.locator(".performance-table tbody tr").first();
    const fileName = ((await firstRow.locator("td").nth(1).textContent()) ?? "").trim();

    await firstRow.click();
    await page.waitForSelector(".performance-meta-grid");
    await page.waitForSelector("h3:has-text('승인 이력')");

    const detailFileName = ((await page.locator(".performance-meta-item strong").first().textContent()) ?? "").trim();

    if (!fileName || fileName !== detailFileName) {
      throw new Error(
        `실적 상세 연속성 실패: expected ${fileName || "-"}, got ${detailFileName || "-"}`
      );
    }

    const previewVisible =
      (await page.locator("h3:has-text('미리보기')").count()) > 0 &&
      (await page.locator(".performance-preview-shell").count()) >= 2;
    const historyRowCount = await page.locator(".performance-history-card tbody tr").count();

    if (!previewVisible) {
      throw new Error("실적 상세 미리보기 섹션을 찾지 못했습니다.");
    }

    console.log(`SMOKE_OK file=${fileName} historyRows=${historyRowCount}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
