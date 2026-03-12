const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const getTrimmedValue = async (locator) => ((await locator.inputValue()) ?? "").trim();

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-operations-settings-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "custom-pending");
  const approvedDir = path.resolve(tempDataDir, "custom-approved");
  const scheduleExportDir = path.resolve(tempDataDir, "custom-schedule-exports");
  const holidayApiBaseUrl = "https://example.com/custom-holidays";

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

    await page.getByRole("button", { name: /운영 관리/ }).click();
    await page.waitForSelector("h3:has-text('파일 감시 및 출력 경로')", { timeout: 60000 });

    await page.locator("label:has-text('승인 대기 폴더') input").fill(pendingDir);
    await page.locator("label:has-text('승인 완료 폴더') input").fill(approvedDir);
    await page.locator("label:has-text('근무표 내보내기 폴더') input").fill(scheduleExportDir);
    await page.locator("label:has-text('공휴일 API 주소') input").fill(holidayApiBaseUrl);
    await page.getByRole("button", { name: "경로 저장", exact: true }).click();

    await page.waitForFunction(() => {
      const message = document.querySelector(".form-success-text");
      return typeof message?.textContent === "string" && message.textContent.includes("운영 경로 설정을 저장했습니다.");
    });

    const pendingValue = await getTrimmedValue(page.locator("label:has-text('승인 대기 폴더') input"));
    const approvedValue = await getTrimmedValue(page.locator("label:has-text('승인 완료 폴더') input"));
    const exportValue = await getTrimmedValue(page.locator("label:has-text('근무표 내보내기 폴더') input"));

    if (pendingValue !== pendingDir || approvedValue !== approvedDir || exportValue !== scheduleExportDir) {
      throw new Error("운영 관리 화면 저장 값이 입력 내용과 다릅니다.");
    }

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('승인대기 목록')", { timeout: 60000 });
    await page.waitForFunction(() => {
      const labels = [...document.querySelectorAll("label")];
      const findInputValue = (labelText) => {
        const matchedLabel = labels.find((label) => label.textContent?.includes(labelText));

        if (!matchedLabel) {
          return null;
        }

        const input = matchedLabel.querySelector("input");

        return input instanceof HTMLInputElement ? input.value.trim() : null;
      };
      const pendingValue = findInputValue("승인 대기 폴더");
      const approvedValue = findInputValue("승인 완료 폴더");

      return (
        typeof pendingValue === "string" &&
        typeof approvedValue === "string" &&
        pendingValue !== "-" &&
        approvedValue !== "-"
      );
    });

    const performancePendingDir = await getTrimmedValue(
      page.locator("label:has-text('승인 대기 폴더') input").first()
    );
    const performanceApprovedDir = await getTrimmedValue(
      page.locator("label:has-text('승인 완료 폴더') input").first()
    );

    if (performancePendingDir !== pendingDir) {
      throw new Error(`실적 관리 화면 승인 대기 폴더 반영 실패: ${performancePendingDir}`);
    }

    if (performanceApprovedDir !== approvedDir) {
      throw new Error(`실적 관리 화면 승인 완료 폴더 반영 실패: ${performanceApprovedDir}`);
    }

    console.log(`SMOKE_OK pending=${pendingDir} approved=${approvedDir}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
