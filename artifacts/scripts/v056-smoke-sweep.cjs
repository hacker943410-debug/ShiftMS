// v0.5.6 전면 검수 스모크 — 0.5.6이 손댄 판정들이 실제 앱에서 어떻게 동작하는지 확인한다.
// 파일을 일부만 승인해 승인대기에 남겨 둔 채, 운영자가 실제로 하는 변경을 하나씩 가하고
// (시급 · 직급 · 입사일) 승인이 부당하게 뒤집히는지, 지급 금액이 흔들리는지 개요·DB로 본다.
//
// 공허한 통과를 막기 위해 전제(파싱 완료, 승인 2건 성립)를 먼저 단언한다.
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
const say = (line) => {
  console.log(line);
  log.push(line);
};
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  say(`  ${pass ? "통과" : "실패"} · ${name}${detail ? " · " + detail : ""}`);
};

const readDb = (dbPath, sql, params = []) => {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
};

const rowsOf = async (page, scheduleMonth) => {
  const overview = await page.evaluate(
    (month) =>
      window.appBridge.listPerformanceOverview({
        approvalScope: "pending",
        section: "all",
        scheduleMonth: month
      }),
    scheduleMonth
  );
  const groups = overview?.data?.groups ?? [];
  return groups.flatMap((g) =>
    (g.rows ?? []).map((r) => ({
      id: r.entryId,
      who: `${r.entry.employeeName} ${r.entry.workDate}`,
      section: r.entry.section,
      status: r.approvalStatus ?? "-",
      canApprove: r.canApprove,
      needsReapproval: r.needsReapproval ?? false,
      rank: r.entry.employeeRank ?? "-",
      start: r.entry.startTime ?? "-",
      minutes: r.entry.totalWorkMinutes ?? 0,
      rate: r.entry.hourlyRate ?? null,
      errors: (r.entry.alerts ?? []).filter((a) => a.severity === "error").map((a) => a.message)
    }))
  );
};

// 파싱이 끝나 개요에 행이 나타날 때까지 기다린다. 이걸 빼면 승인 0건인 채로 전부 통과한다.
const waitForRows = async (page, scheduleMonth, minimum = 1, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await rowsOf(page, scheduleMonth);
    if (rows.length >= minimum) return rows;
    await page.waitForTimeout(1000);
  }
  return rows;
};

const paidAmounts = (dbPath, fileId) =>
  readDb(
    dbPath,
    `SELECT a.employee_name, a.work_date, c.total_allowance_amount, c.hourly_rate
       FROM allowance_calculations c
       JOIN performance_approvals a ON a.id = c.performance_approval_id
      WHERE a.file_id = ? AND a.decision = 'approved'
      ORDER BY a.work_date`,
    [fileId]
  );

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-sweep-"));
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

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await ensureAuthenticated(page, defaultAdminAuth);

    const pending = await page.evaluate(() => window.appBridge.listPendingFiles());
    const fileId = pending.data[0].id;
    say(`대상 파일: ${pending.data[0].fileName}\n`);

    const scheduleMonth = pending.data[0].scheduleMonth;
    say(`대상 월: ${scheduleMonth}`);
    const before = await waitForRows(page, scheduleMonth, 3);
    before.forEach((e) =>
      say(`  초기 · ${e.who} [${e.section}] 시각=${e.start} ${e.minutes}분 시급=${e.rate} 직급=${e.rank}`)
    );
    check("전제: 실적 3줄이 개요에 나타난다", before.length === 3, `행 ${before.length}개`);

    if (before.length < 3) throw new Error("파싱이 끝나지 않아 검수를 진행할 수 없습니다.");

    // ---- 3줄 중 2줄만 승인해서 파일을 승인대기에 남긴다 ----
    say("\n[준비] 3줄 중 2줄만 승인해 파일을 승인대기에 남긴다");
    const approvedIds = [];
    for (const e of before.slice(0, 2)) {
      const res = await page.evaluate(
        (payload) => window.appBridge.approvePendingFile(payload),
        { fileId, entryId: e.id }
      );
      if (res?.ok) approvedIds.push(e.id);
      else say(`  승인 실패: ${e.who} → ${res?.message}`);
    }
    check("전제: 2줄이 실제로 승인됐다", approvedIds.length === 2, `승인 ${approvedIds.length}건`);

    if (approvedIds.length !== 2) throw new Error("승인 전제가 성립하지 않아 이후 검사가 무의미합니다.");

    const baseline = await rowsOf(page, scheduleMonth);
    const baseApproved = baseline.filter((e) => approvedIds.includes(e.id));
    check(
      "승인한 줄이 approved 로 보인다",
      baseApproved.length === 2 && baseApproved.every((e) => e.status === "approved"),
      baseApproved.map((e) => `${e.who}=${e.status}`).join(", ")
    );

    const stillFlagged = (list) =>
      list.filter((e) => approvedIds.includes(e.id) && e.needsReapproval).map((e) => e.who);

    // ================= 1. 시급 변경 (T-2 / F7) =================
    say("\n[1] 시급을 바꾼다 — 승인이 뒤집히면 안 되고 지급 금액도 그대로여야 한다");
    const amountsBefore = paidAmounts(fixture.dbPath, fileId);
    say(`  변경 전 지급액: ${JSON.stringify(amountsBefore)}`);

    const employees = await page.evaluate(() => window.appBridge.listEmployees());
    const target = employees.data.items?.[0] ?? employees.data[0];
    const wageRes = await page.evaluate(
      (payload) => window.appBridge.saveEmployeeWageRate(payload),
      { employeeId: target.id, hourlyRate: 99999, effectiveFrom: "2026-03-01" }
    );
    say(`  시급 저장(${target.name} → 99999): ${wageRes?.ok ? "성공" : "실패 · " + (wageRes?.message ?? wageRes?.errorCode)}`);
    await page.waitForTimeout(2500);
    const afterWage = await rowsOf(page, scheduleMonth);
    check(
      "시급을 바꿔도 승인한 줄이 재검토로 돌아가지 않는다",
      stillFlagged(afterWage).length === 0,
      stillFlagged(afterWage).join(", ") || "뒤집힌 줄 없음"
    );

    const amountsAfter = paidAmounts(fixture.dbPath, fileId);
    say(`  변경 후 지급액: ${JSON.stringify(amountsAfter)}`);
    check(
      "시급을 바꿔도 이미 승인한 줄의 지급 금액이 그대로다",
      JSON.stringify(amountsBefore) === JSON.stringify(amountsAfter),
      JSON.stringify(amountsBefore) === JSON.stringify(amountsAfter) ? "금액 불변" : "금액이 바뀜 ← 승인분이 흔들림"
    );

    // ================= 2. 직급 변경 (F6) =================
    // 아직 승인하지 않은 줄의 '그 사람' 직급을 바꿔야 반영 여부를 볼 수 있다.
    // (승인한 줄은 승인 당시 사진을 보여주므로 옛 직급이 남는 것이 맞다.)
    say("\n[2] 아직 승인 안 한 줄의 직급을 바꾼다 — 다시 읽혀 새 직급이 반영돼야 한다");
    const unapprovedRow = afterWage.find((e) => !approvedIds.includes(e.id));
    const unapprovedName = unapprovedRow.who.split(" ")[0];
    const employeeList = employees.data.items ?? employees.data;
    const rankTarget = employeeList.find((e) => e.name === unapprovedName);
    say(`  대상: ${unapprovedName} (아직 승인 안 한 줄)`);
    const rankBefore = afterWage.map((e) => `${e.who}=${e.rank}`).join(", ");
    const saveRank = await page.evaluate(
      (payload) => window.appBridge.saveEmployee(payload),
      { ...rankTarget, rank: "대리" }
    );
    say(`  인력 저장: ${saveRank?.ok ? "성공" : "실패 · " + (saveRank?.message ?? saveRank?.errorCode)}`);
    await page.waitForTimeout(3000);
    const afterRank = await rowsOf(page, scheduleMonth);
    say(`  직급: ${rankBefore}`);
    say(`     →  ${afterRank.map((e) => `${e.who}=${e.rank}`).join(", ")}`);
    check(
      "직급을 바꿔도 승인한 줄이 재검토로 돌아가지 않는다",
      stillFlagged(afterRank).length === 0,
      stillFlagged(afterRank).join(", ") || "뒤집힌 줄 없음"
    );
    check(
      "직급 변경이 그 사람의 아직 승인 안 한 줄에 반영된다 (F6 재파싱)",
      afterRank.some((e) => e.who.startsWith(unapprovedName) && e.rank === "대리"),
      afterRank.filter((e) => e.who.startsWith(unapprovedName)).map((e) => `${e.who}=${e.rank}`).join(", ")
    );

    // ================= 3. 입사일을 근무일 이후로 (T-22) =================
    say("\n[3] 입사일을 근무일보다 뒤로 바꾼다 — 오류가 붙어야 한다");
    const saveHire = await page.evaluate(
      (payload) => window.appBridge.saveEmployee(payload),
      { ...target, rank: "대리", hireDate: "2026-06-01" }
    );
    say(`  입사일 저장(${target.name} → 2026-06-01): ${saveHire?.ok ? "성공" : "실패 · " + (saveHire?.message ?? saveHire?.errorCode)}`);
    await page.waitForTimeout(3000);
    const afterHire = await rowsOf(page, scheduleMonth);
    const withErrors = afterHire.filter((e) => e.errors.length > 0);
    say(`  오류가 붙은 줄: ${withErrors.length}`);
    withErrors.forEach((e) => say(`    ${e.who} :: ${e.errors.join(" | ")}`));
    check(
      "입사일 이전 근무에 오류가 붙는다 (T-22)",
      withErrors.length > 0,
      withErrors.length ? withErrors.map((e) => e.who).join(", ") : "오류가 하나도 안 붙음"
    );
    check(
      "입사일을 바꿔도 이미 승인한 줄의 지급 금액이 그대로다",
      JSON.stringify(paidAmounts(fixture.dbPath, fileId)) === JSON.stringify(amountsBefore),
      JSON.stringify(paidAmounts(fixture.dbPath, fileId)) === JSON.stringify(amountsBefore)
        ? "금액 불변"
        : "금액이 바뀜 ← 문제"
    );

    // ================= 4. DB 실제 값 =================
    say("\n[4] DB 실제 값");
    const dbEntries = readDb(
      fixture.dbPath,
      "SELECT employee_name, work_date, start_time, end_time, total_work_minutes, hourly_rate FROM performance_entries WHERE performance_file_id = ? ORDER BY work_date",
      [fileId]
    );
    dbEntries.forEach((r) =>
      say(`  ${r.employee_name} ${r.work_date} ${r.start_time}~${r.end_time} ${r.total_work_minutes}분 시급=${r.hourly_rate}`)
    );
    check(
      "DB의 실적 줄에 시각이 남아 있다 (0:00 신고 대조)",
      dbEntries.length > 0 && dbEntries.every((r) => r.start_time && r.start_time !== "00:00"),
      dbEntries.map((r) => r.start_time).join(",")
    );
    const dbApprovals = readDb(
      fixture.dbPath,
      "SELECT COUNT(*) AS c FROM performance_approvals WHERE file_id = ? AND decision='approved'",
      [fileId]
    );
    check(
      "승인 레코드 수가 승인한 줄 수와 같다",
      Number(dbApprovals[0].c) === approvedIds.length,
      `DB=${dbApprovals[0].c} / 승인=${approvedIds.length}`
    );

    await page.getByRole("button", { name: /실적 관리/ }).click();
    await page.waitForTimeout(2500);
    const shot = path.join(OUT, "전면검수_실적관리.png");
    await page.screenshot({ path: shot, fullPage: true });
    say(`\n[화면] 캡처: ${shot}`);
  } catch (error) {
    say(`!! 중단: ${error.message}`);
    checks.push({ name: "스모크 실행", pass: false, detail: error.message });
  } finally {
    await app.close().catch(() => {});
  }

  say("\n================ 요약 ================");
  checks.forEach((c) => say(`${c.pass ? "통과" : "실패"} · ${c.name}${c.detail ? " · " + c.detail : ""}`));
  const failed = checks.filter((c) => !c.pass).length;
  say(`\n${checks.length}개 중 ${failed}개 실패`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "smoke-sweep-log.txt"), log.join("\n"), "utf8");
  process.exit(failed === 0 ? 0 : 1);
})();
