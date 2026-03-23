const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const approvedFileName = "별첨1_샘플.xlsx";
const rejectedFileName = "DT사업1팀 교대근무 조직 연장근로 수당 품의서_수정분.xlsx";
const approvedComment = "통합 승인 스모크 메모";
const rejectedComment = "통합 반려 스모크 메모";
const rejectionReason = "통합 반려 스모크 사유";
const sampleDir = path.resolve(process.cwd(), "양식샘플");

const getTrimmedText = async (locator) => ((await locator.textContent()) ?? "").trim();

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

const waitForRowByFileName = async (page, fileName) => {
  const row = page.locator(".performance-table tbody tr").filter({ hasText: fileName }).first();
  await row.waitFor({ state: "visible", timeout: 60000 });
  return row;
};

const rejectPendingFile = async (page, fileName) => {
  const row = await waitForRowByFileName(page, fileName);

  await row.click();
  await page.locator("label:has-text('검토 메모') input").fill(rejectedComment);
  await page.locator("label:has-text('반려 사유') textarea").fill(rejectionReason);
  await page.getByRole("button", { name: "반려", exact: true }).click();
  await waitForSuccessMessage(page, `${fileName} 파일을 반려했습니다.`);

  const remainingCount = await page
    .locator(".performance-table tbody tr")
    .filter({ hasText: fileName })
    .count();

  if (remainingCount !== 0) {
    throw new Error(`반려 처리 후에도 ${fileName} 이 승인대기 목록에 남아 있습니다.`);
  }

  const historyRow = page
    .locator(".performance-history-card tbody tr")
    .filter({ hasText: fileName })
    .first();
  await historyRow.waitFor({ state: "visible", timeout: 60000 });

  const historyText = await getTrimmedText(historyRow);

  if (!historyText.includes("반려") || !historyText.includes(rejectionReason)) {
    throw new Error(`반려 이력 표시 실패: ${historyText}`);
  }
};

const approvePendingFile = async (page, fileName) => {
  const row = await waitForRowByFileName(page, fileName);

  await row.click();
  await page.locator("label:has-text('검토 메모') input").fill(approvedComment);
  await page.getByRole("button", { name: "승인", exact: true }).click();
  await waitForSuccessMessage(page, `${fileName} 파일을 승인했습니다.`);

  const remainingCount = await page
    .locator(".performance-table tbody tr")
    .filter({ hasText: fileName })
    .count();

  if (remainingCount !== 0) {
    throw new Error(`승인 처리 후에도 ${fileName} 이 승인대기 목록에 남아 있습니다.`);
  }

  const historyRow = page
    .locator(".performance-history-card tbody tr")
    .filter({ hasText: fileName })
    .first();
  await historyRow.waitFor({ state: "visible", timeout: 60000 });

  const historyText = await getTrimmedText(historyRow);

  if (!historyText.includes("승인") || !historyText.includes(approvedComment)) {
    throw new Error(`승인 이력 표시 실패: ${historyText}`);
  }
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-approval-allowance-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "imports", "pending");

  fs.mkdirSync(pendingDir, { recursive: true });
  fs.copyFileSync(path.resolve(sampleDir, approvedFileName), path.resolve(pendingDir, approvedFileName));
  fs.copyFileSync(path.resolve(sampleDir, rejectedFileName), path.resolve(pendingDir, rejectedFileName));

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
    await page.waitForSelector("button:has-text('로그아웃')", { timeout: 60000 });

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('승인대기 목록')", { timeout: 60000 });

    await rejectPendingFile(page, rejectedFileName);
    await approvePendingFile(page, approvedFileName);

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('미산출 승인 목록')", { timeout: 60000 });

    const approvedPendingItem = page
      .locator(".allowance-run-item")
      .filter({ hasText: approvedFileName })
      .first();
    await approvedPendingItem.waitFor({ state: "visible", timeout: 60000 });

    const rejectedPendingCount = await page
      .locator(".allowance-run-item")
      .filter({ hasText: rejectedFileName })
      .count();

    if (rejectedPendingCount !== 0) {
      throw new Error(`반려 파일 ${rejectedFileName} 이 수당 산출 대상에 노출되었습니다.`);
    }

    await approvedPendingItem.getByRole("button", { name: "수당 산출", exact: true }).click();
    await waitForSuccessMessage(page, `${approvedFileName} 수당 산출을 완료했습니다.`);

    const approvedPendingAfterCount = await page
      .locator(".allowance-run-item")
      .filter({ hasText: approvedFileName })
      .count();

    if (approvedPendingAfterCount !== 0) {
      throw new Error(`산출 완료 후에도 ${approvedFileName} 이 미산출 목록에 남아 있습니다.`);
    }

    const resultRow = page
      .locator(".allowance-results-table tbody tr")
      .filter({ hasText: approvedFileName })
      .first();
    await resultRow.waitFor({ state: "visible", timeout: 60000 });

    const resultRowText = await getTrimmedText(resultRow);

    if (!resultRowText.includes(approvedFileName)) {
      throw new Error(`수당 결과 테이블에 ${approvedFileName} 이 표시되지 않습니다.`);
    }

    const detailCard = page.locator(".allowance-expanded-card").first();
    await detailCard.waitFor({ state: "visible", timeout: 60000 });
    const detailText = await getTrimmedText(detailCard);

    if (!detailText.includes(`승인 메모 ${approvedComment}`)) {
      throw new Error(`수당 상세에 승인 메모가 반영되지 않았습니다: ${detailText}`);
    }

    console.log(`SMOKE_OK approved=${approvedFileName} rejected=${rejectedFileName}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
