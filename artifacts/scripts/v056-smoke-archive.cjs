// v0.5.6 회귀 스모크 #1 — 승인대기 파일의 모든 줄을 승인하면 승인완료로 넘어가는가.
// 신고: "승인했는데 계속 승인대기에 남아있다(수당관리에는 정상)".
// 화면 · 브리지 · DB 세 곳을 모두 확인한다.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");

const REPO = "C:/Users/pangyo/orca/workspaces/ShiftMgmt_V3.4/tropicbird";
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

const scenario = async (name, fixtureOptions) => {
  say(`\n================ ${name} ================`);
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-archive-smoke-"));
  const prevPw = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = defaultAdminAuth.currentPassword;
  const fixture = await prepareReturnedScheduleFixture({ rootDir: tempDataDir, ...fixtureOptions });
  if (prevPw === undefined) delete process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  else process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = prevPw;

  const app = await electron.launch({
    args: ["."],
    cwd: REPO,
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
  const result = { name, ok: false, notes: [] };

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page, defaultAdminAuth);

    // --- 1. 승인 전 상태 ---
    const pending = await page.evaluate(() => window.appBridge.listPendingFiles());
    if (!pending?.ok || pending.data.length === 0) {
      throw new Error("승인대기 파일이 없습니다: " + JSON.stringify(pending));
    }
    const fileId = pending.data[0].id;
    say(`승인대기 파일: ${pending.data[0].fileName} (${pending.data.length}건)`);

    const detailBefore = await page.evaluate(
      (id) => window.appBridge.getPendingFileDetail(id),
      fileId
    );
    const entries = detailBefore.data.entries;
    say(`전체 줄 수: ${entries.length}`);

    // 분모(승인 대상)와 각 줄의 상태를 그대로 찍는다.
    for (const e of entries) {
      const errs = (e.alerts ?? []).filter((a) => a.severity === "error");
      say(
        `  - ${e.employeeName} ${e.workDate} [${e.section}] ` +
          `pool=${e.isPoolWorker ?? false} eligible=${e.substituteAllowanceEligible ?? "-"} ` +
          `rate=${e.hourlyRate ?? "없음"} 오류=${errs.length}${errs.length ? " :: " + errs.map((a) => a.message).join(" | ") : ""}`
      );
    }

    // --- 2. 모든 줄을 승인 시도 ---
    let approved = 0;
    const refused = [];
    for (const e of entries) {
      const res = await page.evaluate(
        (payload) => window.appBridge.approvePendingFile(payload),
        { fileId, entryId: e.id }
      );
      if (res?.ok) approved += 1;
      else refused.push(`${e.employeeName} ${e.workDate} → ${res?.message ?? res?.errorCode}`);
    }
    say(`\n승인 성공: ${approved} / 거부: ${refused.length}`);
    refused.forEach((r) => say(`  거부: ${r}`));

    // --- 3. 승인 후 파일이 넘어갔는가 (브리지) ---
    const pendingAfter = await page.evaluate(() => window.appBridge.listPendingFiles());
    const stillPending = pendingAfter.data.some((f) => f.id === fileId);
    say(`\n[브리지] 승인 후에도 승인대기에 남아있는가: ${stillPending ? "예 ← 문제" : "아니오"}`);

    // --- 4. DB 실제 값 ---
    const rows = readDb(
      fixture.dbPath,
      "SELECT id, file_name, status, directory_type, approved_entry_count FROM performance_files WHERE id = ?",
      [fileId]
    );
    say(`[DB] performance_files: ${JSON.stringify(rows)}`);
    const approvals = readDb(
      fixture.dbPath,
      "SELECT COUNT(*) AS c FROM performance_approvals WHERE file_id = ? AND decision = 'approved'",
      [fileId]
    );
    say(`[DB] 승인 레코드 수: ${approvals[0].c}`);
    let calcs = "조회실패";
    try {
      calcs = JSON.stringify(
        readDb(
          fixture.dbPath,
          `SELECT COUNT(*) AS c FROM allowance_calculations c
           JOIN performance_approvals a ON a.id = c.performance_approval_id
           WHERE a.file_id = ?`,
          [fileId]
        )
      );
    } catch (dbError) {
      calcs = "조회실패: " + dbError.message;
    }
    say(`[DB] 수당 계산 수: ${calcs}`);

    // --- 5. 화면 확인 ---
    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForTimeout(2500);
    const shot = path.join(OUT, `${name.replace(/[^\w가-힣]+/g, "_")}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    say(`[화면] 캡처: ${shot}`);

    result.ok = !stillPending && refused.length === 0;
    result.notes.push(
      `승인 ${approved}/${entries.length}, 거부 ${refused.length}, 승인대기잔류=${stillPending}`
    );
  } catch (error) {
    say(`!! 실패: ${error.message}`);
    result.notes.push(error.message);
  } finally {
    await app.close().catch(() => {});
  }

  return result;
};

(async () => {
  const results = [];
  // A. 기본 파일 (Pool 대체 없음)
  results.push(await scenario("A_기본파일_전체승인", {}));
  // B. 대체 투입자를 Pool 조에 두어 T-24 경로를 태운다
  results.push(await scenario("B_Pool대체_전체승인", { substituteReplacementShiftGroup: "P조" }));

  say("\n\n================ 요약 ================");
  results.forEach((r) => say(`${r.ok ? "통과" : "실패"} · ${r.name} · ${r.notes.join(" / ")}`));
  fs.writeFileSync(path.join(OUT, "smoke-archive-log.txt"), log.join("\n"), "utf8");
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
