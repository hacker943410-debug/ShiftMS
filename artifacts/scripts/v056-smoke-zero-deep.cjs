// 근무표가 "있는데도" 시각이 사라지는 경우를 찾는다.
// 운영자 확인: 근무지 이름도 달도 맞는 근무표가 근무지 관리에 있다.
// 그렇다면 근무표 안에서 그 사람의 그 날 근무를 못 찾는 경로가 남는다.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { defaultAdminAuth, ensureAuthenticated } = require("./electron-auth-helpers.cjs");
const { prepareReturnedScheduleFixture } = require("../../dist-electron/main/services/performance-test-helpers.js");

const OUT = process.env.SMOKE_OUT_DIR || __dirname;
const log = [];
const say = (l) => { console.log(l); log.push(l); };
const withDb = (p, fn, ro = true) => { const db = new DatabaseSync(p, { readOnly: ro }); try { return fn(db); } finally { db.close(); } };
const times = (p) => withDb(p, (db) => db.prepare("SELECT employee_name, section, start_time, total_work_minutes FROM performance_entries ORDER BY work_date").all());
const fmt = (rows) => rows.map(r => `${r.employee_name}[${r.section}] ${r.start_time ?? "(없음)"}(${r.total_work_minutes}분)`).join(" / ");

const launch = async (dir) => {
  const app = await electron.launch({ args: ["."], cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: dir, AUTH_BOOTSTRAP_ADMIN_PASSWORD: defaultAdminAuth.currentPassword,
      DATABASE_PATH: "performance.test.sqlite", WATCH_PENDING_DIR: "imports/pending",
      WATCH_APPROVED_DIR: "imports/approved", SCHEDULE_EXPORT_DIR: "exports" } });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  await ensureAuthenticated(page, defaultAdminAuth);
  return { app, page };
};
const reparse = async (page, month) => {
  await page.evaluate((m) => window.appBridge.listPerformanceOverview({ approvalScope: "pending", scheduleMonth: m, forceReparse: true }), month);
  await page.waitForTimeout(4000);
};
const alertsOf = async (page, month) => {
  const ov = await page.evaluate((m) => window.appBridge.listPerformanceOverview({ approvalScope: "pending", scheduleMonth: m }), month);
  return (ov?.data?.groups ?? []).flatMap(g => (g.rows ?? []).flatMap(r => (r.entry.alerts ?? []).map(a => `${r.entry.employeeName}: [${a.severity}] ${a.message}`)));
};

const run = async (name, breakIt) => {
  say(`\n================ ${name} ================`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-deep-"));
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = defaultAdminAuth.currentPassword;
  const fixture = await prepareReturnedScheduleFixture({ rootDir: dir });
  let { app, page } = await launch(dir);
  const pending = await page.evaluate(() => window.appBridge.listPendingFiles());
  const month = pending.data[0].scheduleMonth;
  await reparse(page, month);
  say(`정상: ${fmt(times(fixture.dbPath))}`);
  await app.close(); await new Promise(r => setTimeout(r, 1500));

  const what = withDb(fixture.dbPath, (db) => breakIt(db), false);
  say(`조건: ${what}`);
  const scheduleCount = withDb(fixture.dbPath, (db) => db.prepare("SELECT COUNT(*) c FROM monthly_schedules").get().c);
  say(`(근무표 저장본은 ${scheduleCount}건 남아 있음)`);

  ({ app, page } = await launch(dir));
  await reparse(page, month);
  const after = times(fixture.dbPath);
  say(`이후: ${fmt(after)}`);
  const alerts = await alertsOf(page, month);
  if (alerts.length) alerts.forEach(a => say(`  알림 · ${a}`));
  else say("  알림 없음");
  const lost = after.filter(r => !r.start_time || r.total_work_minutes === 0);
  say(`>> 시각 잃은 줄: ${lost.length}개 ${lost.length ? "← 재현" : ""}`);
  await app.close();
};

(async () => {
  // C. 근무표는 있는데 그 사람의 그 날 항목만 사라진 경우
  await run("C_근무표는_있고_해당일_항목만_없음", (db) => {
    const info = db.prepare("SELECT COUNT(*) c FROM monthly_schedule_items").get();
    db.exec("DELETE FROM monthly_schedule_items WHERE work_date = '2026-03-01' OR work_date = '2026-03-02';");
    const after = db.prepare("SELECT COUNT(*) c FROM monthly_schedule_items").get();
    return `근무표 항목 ${info.c} → ${after.c} (3/1·3/2 항목만 삭제)`;
  });

  // D. 근무표 항목의 근무코드가 패턴과 어긋난 경우
  await run("D_근무코드_불일치", (db) => {
    const n = db.prepare("SELECT COUNT(*) c FROM monthly_schedule_items WHERE duty_code IS NOT NULL").get().c;
    db.exec("UPDATE monthly_schedule_items SET duty_code = 'ZZ' WHERE duty_code IS NOT NULL;");
    return `근무코드 ${n}건을 ZZ 로 바꿈`;
  });

  // E. 근무표 항목은 있는데 시간만 비어 있는 경우
  await run("E_근무표_시간만_비움", (db) => {
    const n = db.prepare("SELECT COUNT(*) c FROM monthly_schedule_items WHERE start_time IS NOT NULL").get().c;
    db.exec("UPDATE monthly_schedule_items SET start_time = NULL, end_time = NULL;");
    return `근무표 항목 ${n}건의 시간을 비움`;
  });

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "smoke-zero-deep-log.txt"), log.join("\n"), "utf8");
  process.exit(0);
})();
