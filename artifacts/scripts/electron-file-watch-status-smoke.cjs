const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const getTrimmedValue = async (locator) => ((await locator.inputValue()) ?? "").trim();

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-file-watch-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "runtime-pending");
  const approvedDir = path.resolve(tempDataDir, "runtime-approved");
  const scheduleExportDir = path.resolve(tempDataDir, "runtime-exports");
  const sampleFileName = "watch-event-sample.xlsx";
  const sampleFilePath = path.resolve(pendingDir, sampleFileName);

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

    await page.getByRole("textbox", { name: "승인 대기 폴더", exact: true }).fill(pendingDir);
    await page.getByRole("textbox", { name: "승인 완료 폴더", exact: true }).fill(approvedDir);
    await page.getByRole("textbox", { name: "근무표 내보내기 폴더", exact: true }).fill(scheduleExportDir);
    await page.getByRole("textbox", { name: "공휴일 API 주소", exact: true }).fill("https://example.com/watch");
    await page.getByRole("button", { name: "경로 저장", exact: true }).click();

    await page.waitForFunction(() => {
      const message = document.querySelector(".form-success-text");

      return (
        typeof message?.textContent === "string" &&
        message.textContent.includes("운영 경로 설정을 저장했습니다.")
      );
    });

    await page.getByRole("button", { name: "감시 재시작", exact: true }).click();
    await page.waitForFunction(() => {
      const message = document.querySelector(".form-success-text");
      const pills = [...document.querySelectorAll(".pill")];

      return (
        typeof message?.textContent === "string" &&
        message.textContent.includes("파일 감시를 재시작했습니다.") &&
        pills.some((pill) => pill.textContent?.includes("감시 중"))
      );
    });

    const activePendingDir = await getTrimmedValue(
      page.locator("label:has-text('활성 승인 대기 폴더') input")
    );
    const activeApprovedDir = await getTrimmedValue(
      page.locator("label:has-text('활성 승인 완료 폴더') input")
    );

    if (activePendingDir !== pendingDir || activeApprovedDir !== approvedDir) {
      throw new Error("운영 관리 화면 감시 상태가 저장된 경로를 반영하지 않았습니다.");
    }

    fs.writeFileSync(sampleFilePath, "watch-event-sample");

    await page.waitForFunction(
      (fileName) => {
        const rows = [...document.querySelectorAll("tbody tr")];

        return rows.some((row) => row.textContent?.includes(fileName));
      },
      sampleFileName
    );

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForSelector("h3:has-text('승인대기 목록')", { timeout: 60000 });
    await page.waitForFunction(
      (fileName) => {
        const labels = [...document.querySelectorAll("label")];
        const getInputValue = (labelText) => {
          const matchedLabel = labels.find((label) => label.textContent?.includes(labelText));

          if (!matchedLabel) {
            return null;
          }

          const input = matchedLabel.querySelector("input");

          return input instanceof HTMLInputElement ? input.value.trim() : null;
        };
        const text = document.body.textContent ?? "";
        const pendingValue = getInputValue("승인 대기 폴더");
        const approvedValue = getInputValue("승인 완료 폴더");

        return (
          typeof pendingValue === "string" &&
          typeof approvedValue === "string" &&
          pendingValue !== "-" &&
          approvedValue !== "-" &&
          text.includes("감시 중") &&
          text.includes("최근 이벤트") &&
          text.includes(fileName)
        );
      },
      sampleFileName
    );

    console.log(`SMOKE_OK pending=${pendingDir} event=${sampleFileName}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
