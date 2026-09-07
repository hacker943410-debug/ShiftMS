// v0.5.6 회귀 스모크 #3 — 같은 근무지·같은 달의 파일이 이미 승인완료에 있을 때 재제출본을 전부 승인하면?
// 자동 보관은 !hasApprovedArchiveForSchedule 조건을 달고 있어, 이 경우 보관을 보류한다.
// 신고 증상("줄은 전부 승인 완료인데 파일이 승인대기에 남고, 수당관리에는 정상")과 맞는지 확인한다.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { defaultAdminAuth, ensureAuthenticated } = require("./electron-auth-helpers.cjs");
const {
  prepareReturnedScheduleFixture
} = require("../../dist-electron/main/services/performance-test-helpers.js");

const OUT = process.env.SMOKE_OUT_DIR || __dirname;
const log = [];
const say = (line) => {
  console.log(line);
  log.push(line);
};

const readDb = (dbPath, sql, params = []) => {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
};

const approveEveryEntry = async (page, fileId) => {
  const detail = await page.evaluate((id) => window.appBridge.getPendingFileDetail(id), fileId);
  const entries = detail?.data?.entries ?? [];
  let approved = 0;
  const refused = [];

  for (const entry of entries) {
    const res = await page.evaluate(
      (payload) => window.appBridge.approvePendingFile(payload),
      { fileId, entryId: entry.id }
    );

    if (res?.ok) approved += 1;
    else refused.push(`${entry.employeeName} ${entry.workDate} → ${res?.message ?? res?.errorCode}`);
  }

  return { approved, refused, total: entries.length };
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-dup-smoke-"));
  const prevPw = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = defaultAdminAuth.currentPassword;
  const fixture = await prepareReturnedScheduleFixture({ rootDir: tempDataDir });
  if (prevPw === undefined) delete process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  else process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = prevPw;

  // 재제출본으로 쓸 원본 사본을 미리 떠 둔다(1차 승인 때 원본이 승인완료 폴더로 이동하므로).
  const resubmitSource = path.join(tempDataDir, "resubmit-source.xlsx");
  fs.copyFileSync(fixture.filePath, resubmitSource);
  const pendingTarget = path.join(fixture.pendingDir, path.basename(fixture.filePath));

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: defaultAdminAuth.currentPassword,
      DATABASE_PATH: "performance.test.sqlite",
      WATCH_PENDING_DIR: "imports/pending",
      WATCH_APPROVED_DIR: "imports/approved",
      SCHEDULE_EXPORT_DIR: "exports"
    }
  });
  const page = await app.firstWindow();
  let verdict = 1;

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page, defaultAdminAuth);

    // ---------- 1차: 원본을 전부 승인해 승인완료로 보낸다 ----------
    const pending = await page.evaluate(() => window.appBridge.listPendingFiles());
    const firstId = pending.data[0].id;
    say(`1차 대상: ${pending.data[0].fileName}`);
    const first = await approveEveryEntry(page, firstId);
    say(`1차 승인: ${first.approved}/${first.total}`);
    say(
      `[DB] 1차 후: ${JSON.stringify(
        readDb(fixture.dbPath, "SELECT status, directory_type, schedule_key FROM performance_files WHERE id = ?", [firstId])
      )}`
    );

    // ---------- 같은 근무지·달의 재제출본을 승인대기에 다시 넣는다 ----------
    fs.copyFileSync(resubmitSource, pendingTarget);
    say(`\n재제출본 투입: ${pendingTarget}`);
    await page.waitForTimeout(3000);
    // 감시가 놓칠 수 있으니 조회로 스캔을 강제한다.
    await page.evaluate(() => window.appBridge.listPerformanceOverview({}));
    await page.waitForTimeout(3000);

    const pendingAgain = await page.evaluate(() => window.appBridge.listPendingFiles());
    say(`승인대기 목록: ${JSON.stringify(pendingAgain.data.map((f) => ({ name: f.fileName, id: f.id })))}`);
    const resubmitted = pendingAgain.data[0];

    if (!resubmitted) {
      throw new Error("재제출본이 승인대기로 잡히지 않았습니다.");
    }

    say(`재제출본 id: ${resubmitted.id} (1차와 같은 id인가: ${resubmitted.id === firstId})`);
    say(
      `[DB] 승인완료로 남아있는 같은 달 파일: ${JSON.stringify(
        readDb(
          fixture.dbPath,
          "SELECT file_name, status, directory_type, schedule_key FROM performance_files WHERE directory_type='approved'"
        )
      )}`
    );

    // ---------- 2차: 재제출본을 전부 승인 ----------
    const second = await approveEveryEntry(page, resubmitted.id);
    say(`\n2차 승인: ${second.approved}/${second.total}, 거부 ${second.refused.length}`);
    second.refused.forEach((r) => say(`  거부: ${r}`));

    const afterSecond = await page.evaluate(() => window.appBridge.listPendingFiles());
    const stillPending = afterSecond.data.some((f) => f.id === resubmitted.id);
    say(`\n[핵심] 전부 승인했는데도 승인대기에 남아있는가: ${stillPending ? "예 ← 신고 재현" : "아니오"}`);
    say(
      `[DB] 2차 후: ${JSON.stringify(
        readDb(
          fixture.dbPath,
          "SELECT file_name, status, directory_type, approved_entry_count FROM performance_files WHERE id = ?",
          [resubmitted.id]
        )
      )}`
    );
    say(
      `[DB] 이 파일의 승인 레코드: ${JSON.stringify(
        readDb(
          fixture.dbPath,
          "SELECT COUNT(*) AS c FROM performance_approvals WHERE file_id = ? AND decision='approved'",
          [resubmitted.id]
        )
      )}`
    );

    if (stillPending) {
      const finalize = await page.evaluate(
        (id) => window.appBridge.finalizeReapprovedFile({ fileId: id }),
        resubmitted.id
      );
      say(
        `확정("이대로 승인완료"): ${finalize?.ok ? "성공 — 운영자가 빠져나갈 길 있음" : "거부 · " + (finalize?.message ?? finalize?.errorCode)}`
      );
      say(
        `[DB] 확정 후: ${JSON.stringify(
          readDb(fixture.dbPath, "SELECT status, directory_type FROM performance_files WHERE id = ?", [resubmitted.id])
        )}`
      );
    }

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForTimeout(2500);
    const shot = path.join(OUT, "같은달_재제출.png");
    await page.screenshot({ path: shot, fullPage: true });
    say(`[화면] 캡처: ${shot}`);

    verdict = stillPending ? 1 : 0;
  } catch (error) {
    say(`!! 실패: ${error.message}`);
  } finally {
    await app.close().catch(() => {});
    fs.writeFileSync(path.join(OUT, "smoke-duplicate-log.txt"), log.join("\n"), "utf8");
  }

  process.exit(verdict);
})();
