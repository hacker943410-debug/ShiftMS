const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const uniqueLoginId = `smoke-user-${Date.now()}`;

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-operations-user-smoke-"));

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
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForSelector("button:has-text('대시보드')", { timeout: 60000 });

    await page.getByRole("button", { name: /운영 관리/ }).click();
    await page.getByRole("tab", { name: /사용자 관리/ }).click();
    await page.waitForSelector("h3:has-text('권한 및 상태별 사용자 목록')", { timeout: 60000 });

    await page.getByRole("button", { name: "신규 사용자 추가", exact: true }).click();
    await page.locator("label:has-text('계정명') input").fill(uniqueLoginId);
    await page.locator("label:has-text('이름') input").fill("스모크 사용자");
    await page.locator("label:has-text('연락처') input").fill("010-5555-7777");
    await page.locator("label:has-text('메일주소') input").fill("smoke-user@company.local");
    await page.getByRole("button", { name: "등록", exact: true }).click();

    await page.waitForFunction(
      (loginId) => {
        const message = document.querySelector(".form-success-text");
        const rows = [...document.querySelectorAll("table tbody tr")];
        return (
          typeof message?.textContent === "string" &&
          message.textContent.includes("사용자 정보를 저장했습니다.") &&
          rows.some((row) => row.textContent?.includes(loginId))
        );
      },
      uniqueLoginId,
      { timeout: 60000 }
    );

    const userRow = page.locator("table tbody tr").filter({ hasText: uniqueLoginId }).first();
    await userRow.getByRole("button", { name: "수정", exact: true }).click();
    await page.locator("label:has-text('연락처') input").fill("010-1111-9999");
    await page.locator("label:has-text('상태') select").selectOption("inactive");
    await page.getByRole("button", { name: "저장", exact: true }).click();

    await page.waitForFunction(
      (loginId) => {
        const rows = [...document.querySelectorAll("table tbody tr")];
        return rows.some(
          (row) =>
            row.textContent?.includes(loginId) &&
            row.textContent?.includes("010-1111-9999") &&
            row.textContent?.includes("중지")
        );
      },
      uniqueLoginId,
      { timeout: 60000 }
    );

    await userRow.getByRole("button", { name: "삭제", exact: true }).click();
    await page.locator(".question-dialog-overlay").getByRole("button", { name: "삭제", exact: true }).click();
    await page.waitForFunction(
      (loginId) => {
        const rows = [...document.querySelectorAll("table tbody tr")];
        return rows.every((row) => !row.textContent?.includes(loginId));
      },
      uniqueLoginId,
      { timeout: 60000 }
    );

    console.log(`SMOKE_OK createdAndDeleted=${uniqueLoginId}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
