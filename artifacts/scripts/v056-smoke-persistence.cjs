// v0.5.6 남은 검수 — 저장·기동·범위 판정이 앱을 껐다 켜도 버티는가.
//
//   1) G2  달을 골라 조회해도, 그 조회가 열지 않는 폴더의 분석 결과를 지우지 않는가
//   2) 설정 저장이 통째로 남는가 (0.5.6이 트랜잭션으로 묶은 자리)
//   3) G1  운영자가 정한 정책 시작일이 재시작 뒤에도 남는가
//   4) G14 승인·수당이 있는 상태로 다시 켜도 앱이 뜨고 지급 금액이 그대로인가
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
const readDb = (p, sql, params = []) => {
  const db = new DatabaseSync(p, { readOnly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
};

const launch = async (dir) => {
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
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  await ensureAuthenticated(page, defaultAdminAuth);
  return { app, page };
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-persist-"));
  process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD = defaultAdminAuth.currentPassword;
  const fixture = await prepareReturnedScheduleFixture({ rootDir: dir });

  let app;
  let page;

  try {
    ({ app, page } = await launch(dir));

    const pending = await page.evaluate(() => window.appBridge.listPendingFiles());
    const month = pending.data[0].scheduleMonth; // 2026-03
    const fileId = pending.data[0].id;
    say(`대상 파일: ${pending.data[0].fileName} (${month})`);

    // 전체 기간 조회로 한 번 읽어 둔다.
    await page.evaluate(() => window.appBridge.listPerformanceOverview({ approvalScope: "pending" }));
    await page.waitForTimeout(3000);

    // ================= 1) G2 — 다른 달 폴더에 놓인 파일의 분석본을 지우지 않는가 =================
    say("\n[1] 4월 파일을 3월 폴더에 두고 4월을 조회한다 (G2)");
    const marchDir = path.join(fixture.pendingDir, "2026년", "3월");
    fs.mkdirSync(marchDir, { recursive: true });
    const strayName = "2026_4_보라매DC.xlsx";
    const strayPath = path.join(marchDir, strayName);
    fs.copyFileSync(fixture.filePath, strayPath);
    say(`  둔 위치: 승인대기/2026년/3월/${strayName}`);

    // 전체 기간 조회로 그 파일을 한 번 읽혀 분석본을 만든다.
    await page.evaluate(() => window.appBridge.listPerformanceOverview({ approvalScope: "pending" }));
    await page.waitForTimeout(4000);
    const strayBefore = readDb(
      fixture.dbPath,
      "SELECT id, file_name, status FROM performance_files WHERE file_name = ?",
      [strayName]
    );
    say(`  전체 기간 조회 뒤 분석본: ${JSON.stringify(strayBefore)}`);

    if (strayBefore.length === 0) {
      check("G2 전제: 오배치 파일의 분석본이 만들어졌다", false, "분석본이 생기지 않아 검사 불가");
    } else {
      // 이제 4월을 조회한다. 4월 스캔은 3월 폴더를 열지 않으므로, 이 분석본을 지우면 안 된다.
      await page.evaluate(() =>
        window.appBridge.listPerformanceOverview({ approvalScope: "pending", scheduleMonth: "2026-04" })
      );
      await page.waitForTimeout(4000);
      const strayAfter = readDb(
        fixture.dbPath,
        "SELECT id, file_name, status FROM performance_files WHERE file_name = ?",
        [strayName]
      );
      check(
        "달을 골라 조회해도 그 조회가 열지 않는 폴더의 분석본이 남는다 (G2)",
        strayAfter.length === strayBefore.length,
        `조회 전 ${strayBefore.length}건 → 조회 후 ${strayAfter.length}건`
      );

      // 3월 파일(정상 위치)도 그대로여야 한다.
      const marchFile = readDb(
        fixture.dbPath,
        "SELECT COUNT(*) AS c FROM performance_files WHERE id = ?",
        [fileId]
      );
      check("4월 조회가 3월 파일의 분석본을 건드리지 않는다", Number(marchFile[0].c) === 1, `${marchFile[0].c}건`);
    }

    // ================= 2) 설정 저장이 통째로 남는가 =================
    say("\n[2] 설정을 저장하고 다시 켜서 남아 있는지 본다");
    const current = await page.evaluate(() => window.appBridge.getAppSettings());
    const saveRes = await page.evaluate(
      (payload) => window.appBridge.saveAppSettings(payload),
      {
        ...current.data,
        databaseBackupTime: "03:30",
        scheduleWeeklyMaxMinutes: 3000,
        substituteAllowancePolicyEffectiveFrom: "2026-01-01",
        changedSlotPriorityEffectiveFrom: "2026-07-01"
      }
    );
    say(`  저장: ${saveRes?.ok ? "성공" : "실패 · " + (saveRes?.message ?? saveRes?.errorCode)}`);

    // ================= 3~4) 앱을 껐다 켠다 =================
    const amountsBefore = readDb(
      fixture.dbPath,
      `SELECT a.employee_name, c.total_allowance_amount
         FROM allowance_calculations c
         JOIN performance_approvals a ON a.id = c.performance_approval_id
        ORDER BY a.work_date`
    );
    // 승인이 하나도 없으면 G14 검사가 공허해지므로 한 줄 승인해 둔다.
    if (amountsBefore.length === 0) {
      const detail = await page.evaluate((id) => window.appBridge.getPendingFileDetail(id), fileId);
      const first = detail?.data?.entries?.[0];
      if (first) {
        await page.evaluate(
          (payload) => window.appBridge.approvePendingFile(payload),
          { fileId, entryId: first.id }
        );
      }
    }
    const paidBefore = readDb(
      fixture.dbPath,
      `SELECT a.employee_name, c.total_allowance_amount
         FROM allowance_calculations c
         JOIN performance_approvals a ON a.id = c.performance_approval_id
        ORDER BY a.work_date`
    );
    say(`  재시작 전 지급액: ${JSON.stringify(paidBefore)}`);

    await app.close();
    await new Promise((r) => setTimeout(r, 2000));
    say("\n[3] 앱을 다시 켠다");
    ({ app, page } = await launch(dir));
    check("승인·수당이 있는 상태로도 앱이 정상 기동한다 (G14)", true, "로그인 화면까지 도달");

    const restored = await page.evaluate(() => window.appBridge.getAppSettings());
    const s = restored?.data ?? {};
    check(
      "저장한 설정이 재시작 뒤에도 남는다",
      s.databaseBackupTime === "03:30" && Number(s.scheduleWeeklyMaxMinutes) === 3000,
      `백업시각=${s.databaseBackupTime} 주간상한=${s.scheduleWeeklyMaxMinutes}`
    );
    check(
      "운영자가 정한 정책 시작일이 재시작 뒤에도 남는다 (G1)",
      s.substituteAllowancePolicyEffectiveFrom === "2026-01-01" &&
        s.changedSlotPriorityEffectiveFrom === "2026-07-01",
      `대체수당=${s.substituteAllowancePolicyEffectiveFrom} 변경후우선=${s.changedSlotPriorityEffectiveFrom}`
    );

    const paidAfter = readDb(
      fixture.dbPath,
      `SELECT a.employee_name, c.total_allowance_amount
         FROM allowance_calculations c
         JOIN performance_approvals a ON a.id = c.performance_approval_id
        ORDER BY a.work_date`
    );
    say(`  재시작 후 지급액: ${JSON.stringify(paidAfter)}`);
    check(
      "켤 때 도는 보정이 이미 승인된 지급 금액을 바꾸지 않는다 (G14)",
      JSON.stringify(paidBefore) === JSON.stringify(paidAfter),
      JSON.stringify(paidBefore) === JSON.stringify(paidAfter) ? "금액 불변" : "금액이 바뀜 ← 문제"
    );

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForTimeout(2000);
    const shot = path.join(OUT, "지속성_검수.png");
    await page.screenshot({ path: shot, fullPage: true });
    say(`\n[화면] ${shot}`);
  } catch (error) {
    say(`!! 중단: ${error.message}`);
    checks.push({ name: "스모크 실행", pass: false, detail: error.message });
  } finally {
    if (app) await app.close().catch(() => {});
  }

  say("\n================ 요약 ================");
  checks.forEach((c) => say(`${c.pass ? "통과" : "실패"} · ${c.name}${c.detail ? " · " + c.detail : ""}`));
  const failed = checks.filter((c) => !c.pass).length;
  say(`\n${checks.length}개 중 ${failed}개 실패`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "smoke-persistence-log.txt"), log.join("\n"), "utf8");
  process.exit(failed === 0 ? 0 : 1);
})();
