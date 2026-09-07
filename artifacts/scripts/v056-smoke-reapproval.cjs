// v0.5.6 회귀 스모크 #2 — 재승인 경로.
// 신고: "승인했는데 계속 승인대기에 남아있다. 줄은 '승인 완료'로 표기되고 승인 버튼은 비활성화.
//        수당관리에는 정상." 0.5.6이 완료 판정에 두 조건을 더한 곳이 바로 이 경로다.
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

const fileState = (dbPath, fileId) =>
  JSON.stringify(
    readDb(
      dbPath,
      "SELECT status, directory_type, approved_entry_count FROM performance_files WHERE id = ?",
      [fileId]
    )
  );

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
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-reapproval-smoke-"));
  const prevPw = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = defaultAdminAuth.currentPassword;
  const fixture = await prepareReturnedScheduleFixture({ rootDir: tempDataDir });
  if (prevPw === undefined) delete process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  else process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = prevPw;

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

    // ---------- 1차 승인 ----------
    const pending = await page.evaluate(() => window.appBridge.listPendingFiles());
    const fileId = pending.data[0].id;
    say(`대상 파일: ${pending.data[0].fileName}`);

    const first = await approveEveryEntry(page, fileId);
    say(`1차 승인: ${first.approved}/${first.total}, 거부 ${first.refused.length}`);
    say(`[DB] 1차 후: ${fileState(fixture.dbPath, fileId)}`);

    // ---------- 승인완료 → 승인대기 되돌리기 ----------
    const returned = await page.evaluate(
      (id) => window.appBridge.returnApprovedFileToPending({ fileId: id }),
      fileId
    );
    say(`\n되돌리기: ${returned?.ok ? "성공" : "실패 · " + (returned?.message ?? returned?.errorCode)}`);
    say(`[DB] 되돌린 뒤: ${fileState(fixture.dbPath, fileId)}`);

    if (!returned?.ok) throw new Error("되돌리기 실패로 재승인 경로를 태울 수 없음");

    // ---------- 2차 승인 (재승인 파일 경로) ----------
    await page.waitForTimeout(1000);
    const pendingAgain = await page.evaluate(() => window.appBridge.listPendingFiles());
    const reFileId = pendingAgain.data[0]?.id ?? fileId;
    say(`\n재승인 대상 파일 id: ${reFileId}`);

    const detail = await page.evaluate((id) => window.appBridge.getPendingFileDetail(id), reFileId);
    say(`재승인 파일 줄 수: ${detail?.data?.entries?.length ?? 0}`);
    for (const e of detail?.data?.entries ?? []) {
      const errs = (e.alerts ?? []).filter((a) => a.severity === "error");
      say(
        `  - ${e.employeeName} ${e.workDate} [${e.section}] 상태=${e.approvalStatus ?? "-"} ` +
          `재검토필요=${e.needsReapproval ?? "-"} 오류=${errs.length}` +
          (errs.length ? " :: " + errs.map((a) => a.message).join(" | ") : "")
      );
    }

    const second = await approveEveryEntry(page, reFileId);
    say(`\n2차 승인: ${second.approved}/${second.total}, 거부 ${second.refused.length}`);
    second.refused.forEach((r) => say(`  거부: ${r}`));

    const afterSecond = await page.evaluate(() => window.appBridge.listPendingFiles());
    const stillPending = afterSecond.data.some((f) => f.id === reFileId);
    say(`\n[핵심] 2차 승인 후에도 승인대기에 남아있는가: ${stillPending ? "예 ← 신고 재현" : "아니오"}`);
    say(`[DB] 2차 후: ${fileState(fixture.dbPath, reFileId)}`);

    // ---------- 남아있다면 확정 단추가 풀어주는가 ----------
    if (stillPending) {
      const finalize = await page.evaluate(
        (id) => window.appBridge.finalizeReapprovedFile({ fileId: id }),
        reFileId
      );
      say(
        `확정("이대로 승인완료") 시도: ${finalize?.ok ? "성공" : "거부 · " + (finalize?.message ?? finalize?.errorCode)}`
      );
      say(`[DB] 확정 후: ${fileState(fixture.dbPath, reFileId)}`);
    }

    // ---------- 화면 ----------
    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForTimeout(2500);
    const shot = path.join(OUT, "재승인_경로.png");
    await page.screenshot({ path: shot, fullPage: true });
    say(`[화면] 캡처: ${shot}`);

    verdict = stillPending ? 1 : 0;
  } catch (error) {
    say(`!! 실패: ${error.message}`);
  } finally {
    await app.close().catch(() => {});
    fs.writeFileSync(path.join(OUT, "smoke-reapproval-log.txt"), log.join("\n"), "utf8");
  }

  process.exit(verdict);
})();
