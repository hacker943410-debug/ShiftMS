const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const sampleDir = path.resolve(process.cwd(), "양식샘플");

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

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-allowance-doc-smoke-"));
  const pendingDir = path.resolve(tempDataDir, "imports", "pending");
  const exportDir = path.resolve(tempDataDir, "exports", "schedules", "allowance-documents", "2024-10");

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
    await page.waitForSelector("button:has-text('로그아웃')", { timeout: 60000 });

    await page.waitForFunction(async () => {
      const pending = await window.appBridge.listPendingFiles();
      return pending.ok && pending.data.some((item) => item.fileName === "별첨1_샘플.xlsx");
    }, { timeout: 60000 });

    const seeded = await page.evaluate(async () => {
      const pending = await window.appBridge.listPendingFiles();

      if (!pending.ok) {
        throw new Error(pending.message);
      }

      const target = pending.data.find((item) => item.fileName === "별첨1_샘플.xlsx");

      if (!target) {
        throw new Error("승인 가능한 별첨1 샘플 파일이 없습니다.");
      }

      const approved = await window.appBridge.approvePendingFile({
        fileId: target.id,
        comment: "allowance document smoke"
      });

      if (!approved.ok) {
        throw new Error(approved.message);
      }

      const calculated = await window.appBridge.runApprovedCalculation(target.id);

      if (!calculated.ok) {
        throw new Error(calculated.message);
      }

      return {
        calculationId: calculated.data.id,
        fileName: calculated.data.fileName
      };
    });

    await page.getByRole("button", { name: /수당 관리/ }).click();
    await page.waitForSelector("h3:has-text('상세 수당 내역')", { timeout: 60000 });
    await page.waitForSelector(".allowance-results-table tbody tr", { timeout: 60000 });

    await page.getByRole("button", { name: "품의 신청", exact: true }).click();
    await waitForSuccessMessage(page, "품의서/별첨1/별첨2 출력이 완료되었습니다.");
    await page.waitForSelector(".allowance-export-item", { timeout: 60000 });

    const exportCardText = ((await page.locator(".allowance-export-item").first().textContent()) ?? "").trim();

    if (!exportCardText.includes("2024-10 출력") || !exportCardText.includes("별첨1_2024-10.xlsx")) {
      throw new Error(`문서 출력 카드 반영 실패: ${exportCardText}`);
    }

    const expectedFiles = [
      path.resolve(exportDir, "품의서_2024-10.xlsx"),
      path.resolve(exportDir, "별첨1_2024-10.xlsx"),
      path.resolve(exportDir, "별첨2_2024-10.xlsx")
    ];

    for (const filePath of expectedFiles) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`문서 출력 파일이 생성되지 않았습니다: ${filePath}`);
      }
    }

    console.log(`SMOKE_OK file=${seeded.fileName} exportDir=${exportDir}`);
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
