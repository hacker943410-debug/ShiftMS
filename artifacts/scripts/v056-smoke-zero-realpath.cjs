// 신고 재현 — 운영자가 실제로 밟는 경로만 사용한다(DB 직접 조작 없음).
//
// 시나리오: 근무 설정에 시간이 없는 채로 근무표를 만들면, 근무표 항목의 시간이 빈다.
//           그 상태에서 승인대기 실적을 다시 읽으면 이미 저장돼 있던 시각이 사라진다.
//           그리고 그때 운영자에게 아무 알림도 가지 않는다.
// 마지막으로 시간을 채워 근무표를 다시 저장하면 복구되는지까지 확인한다.
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
const checks = [];
const say = (l) => {
  console.log(l);
  log.push(l);
};
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  say(`  ${pass ? "통과" : "실패"} · ${name}${detail ? " · " + detail : ""}`);
};

const readDb = (p, sql) => {
  const db = new DatabaseSync(p, { readOnly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
};
const entryTimes = (p) =>
  readDb(
    p,
    "SELECT employee_name, section, start_time, total_work_minutes FROM performance_entries ORDER BY work_date"
  );
const fmt = (rows) =>
  rows.map((r) => `${r.employee_name}[${r.section}] ${r.start_time ?? "(없음)"}(${r.total_work_minutes}분)`).join(" / ");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-realpath-"));
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = defaultAdminAuth.currentPassword;
  const fixture = await prepareReturnedScheduleFixture({ rootDir: dir });

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: dir,
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: defaultAdminAuth.currentPassword,
      DATABASE_PATH: "performance.test.sqlite",
      WATCH_PENDING_DIR: "imports/pending",
      WATCH_APPROVED_DIR: "imports/approved",
      SCHEDULE_EXPORT_DIR: "exports"
    }
  });
  const page = await app.firstWindow();

  const reparse = async (month) => {
    await page.evaluate(
      (m) =>
        window.appBridge.listPerformanceOverview({
          approvalScope: "pending",
          scheduleMonth: m,
          forceReparse: true
        }),
      month
    );
    await page.waitForTimeout(4000);
  };
  const alertsOf = async (month) => {
    const ov = await page.evaluate(
      (m) => window.appBridge.listPerformanceOverview({ approvalScope: "pending", scheduleMonth: m }),
      month
    );
    return (ov?.data?.groups ?? []).flatMap((g) =>
      (g.rows ?? []).flatMap((r) =>
        (r.entry.alerts ?? []).map((a) => `${r.entry.employeeName}: [${a.severity}] ${a.message}`)
      )
    );
  };

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page, defaultAdminAuth);

    const pending = await page.evaluate(() => window.appBridge.listPendingFiles());
    const month = pending.data[0].scheduleMonth;
    await reparse(month);
    const normal = entryTimes(fixture.dbPath);
    say(`1) 정상 상태\n   ${fmt(normal)}`);
    check(
      "준비: 시각이 정상 저장돼 있다",
      normal.length > 0 && normal.every((r) => r.start_time),
      normal.map((r) => r.start_time).join(",")
    );

    // ---- 현재 근무표를 읽어, 시간만 뺀 채로 다시 저장한다 (운영자 경로) ----
    const schedules = await page.evaluate(() => window.appBridge.listMonthlySchedules());
    const schedule = (schedules?.data ?? [])[0];
    say(`\n2) 현재 근무표: ${schedule ? `${schedule.scheduleMonth} (항목 ${schedule.items?.length ?? "?"}개)` : "없음"}`);

    if (!schedule) throw new Error("근무표를 읽지 못했습니다.");

    const originalItems = (schedule.items ?? []).map((i) => ({
      employeeCode: i.employeeCode,
      teamLabel: i.teamLabel,
      sortOrder: i.sortOrder,
      workDate: i.workDate,
      dutyCode: i.dutyCode,
      startTime: i.startTime,
      endTime: i.endTime,
      breakMinutes: i.breakMinutes ?? 0
    }));
    say(`   원본 항목 예: ${JSON.stringify(originalItems.slice(0, 2))}`);

    const timelessItems = originalItems.map((i) => ({
      employeeCode: i.employeeCode,
      teamLabel: i.teamLabel,
      sortOrder: i.sortOrder,
      workDate: i.workDate,
      dutyCode: i.dutyCode,
      breakMinutes: i.breakMinutes
      // startTime / endTime 을 넣지 않는다 = 근무 설정에 시간이 없을 때 만들어지는 근무표
    }));

    const saveTimeless = await page.evaluate(
      (payload) => window.appBridge.saveMonthlySchedule(payload),
      {
        id: schedule.id,
        siteId: schedule.siteId,
        scheduleMonth: schedule.scheduleMonth,
        patternId: schedule.patternId,
        generatedBy: "smoke",
        items: timelessItems
      }
    );
    say(`3) 시간 없는 근무표로 다시 저장: ${saveTimeless?.ok ? "성공" : "실패 · " + (saveTimeless?.message ?? saveTimeless?.errorCode)}`);
    const savedTimes = readDb(
      fixture.dbPath,
      "SELECT COUNT(*) AS c FROM monthly_schedule_items WHERE start_time IS NOT NULL"
    );
    say(`   근무표 항목 중 시간이 있는 것: ${savedTimes[0].c}개`);

    await reparse(month);
    const broken = entryTimes(fixture.dbPath);
    say(`4) 실적을 다시 읽은 뒤\n   ${fmt(broken)}`);
    const brokenAlerts = await alertsOf(month);
    if (brokenAlerts.length) brokenAlerts.forEach((a) => say(`   알림 · ${a}`));
    else say("   알림 · 없음");

    const lost = broken.filter((r) => !r.start_time || r.total_work_minutes === 0);
    check(
      "저장돼 있던 시각이 지워지지 않는다",
      lost.length === 0,
      lost.length ? `${lost.length}개 줄이 시각을 잃음 ← 신고 재현: ${lost.map((r) => r.employee_name).join(", ")}` : "유지됨"
    );
    check(
      "시각을 지울 때 운영자에게 알린다",
      lost.length === 0 || brokenAlerts.length > 0,
      brokenAlerts.length ? `알림 ${brokenAlerts.length}건` : "무경고로 지움 ← 운영자가 알 방법이 없음"
    );

    // ---- 0분이 된 줄을 승인할 수 있는가 (0원 지급이 굳으면 안 된다) ----
    const detail = await page.evaluate((id) => window.appBridge.getPendingFileDetail(id), pending.data[0].id);
    const zeroEntries = (detail?.data?.entries ?? []).filter(
      (e) => (e.section === "legal-holiday" || e.section === "substitute") && !e.startTime
    );
    const approvalResults = [];
    for (const entry of zeroEntries) {
      const res = await page.evaluate(
        (payload) => window.appBridge.approvePendingFile(payload),
        { fileId: pending.data[0].id, entryId: entry.id }
      );
      approvalResults.push({ who: `${entry.employeeName} ${entry.workDate}`, ok: res?.ok, message: res?.message });
    }
    approvalResults.forEach((r) => say(`   승인 시도 · ${r.who} → ${r.ok ? "통과 ← 0원이 굳는다" : "거부: " + r.message}`));
    check(
      "시각이 0분이 된 줄은 승인되지 않는다",
      zeroEntries.length > 0 && approvalResults.every((r) => !r.ok),
      approvalResults.length ? `${approvalResults.filter((r) => !r.ok).length}/${approvalResults.length} 거부` : "대상 줄 없음"
    );

    // ---- 시간을 채워 근무표를 다시 저장하면 복구되는가 ----
    const restore = await page.evaluate(
      (payload) => window.appBridge.saveMonthlySchedule(payload),
      {
        id: schedule.id,
        siteId: schedule.siteId,
        scheduleMonth: schedule.scheduleMonth,
        patternId: schedule.patternId,
        generatedBy: "smoke",
        items: originalItems
      }
    );
    say(`\n5) 시간을 채워 근무표 다시 저장: ${restore?.ok ? "성공" : "실패 · " + (restore?.message ?? restore?.errorCode)}`);
    await reparse(month);
    const recovered = entryTimes(fixture.dbPath);
    say(`6) 복구 확인\n   ${fmt(recovered)}`);
    check(
      "근무표를 고쳐 다시 저장하면 시각이 복구된다",
      recovered.every((r) => r.start_time && r.total_work_minutes > 0),
      recovered.map((r) => r.start_time ?? "(없음)").join(",")
    );

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForTimeout(2000);
    const shot = path.join(OUT, "실경로_재현.png");
    await page.screenshot({ path: shot, fullPage: true });
    say(`\n[화면] ${shot}`);
  } catch (error) {
    say(`!! 중단: ${error.message}`);
    checks.push({ name: "스모크 실행", pass: false, detail: error.message });
  } finally {
    await app.close().catch(() => {});
  }

  say("\n================ 요약 ================");
  checks.forEach((c) => say(`${c.pass ? "통과" : "실패"} · ${c.name}${c.detail ? " · " + c.detail : ""}`));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "smoke-realpath-log.txt"), log.join("\n"), "utf8");
  process.exit(0);
})();
