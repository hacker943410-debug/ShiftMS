// 통상시급 장부(wage_rates)와 입사일이 성한지 한 번에 훑어본다.
//
// 읽기 전용이다. 데이터베이스에 아무것도 쓰지 않는다. 앱이 켜져 있어도 안전하다.
//
// 검사하는 것 (규칙 근거는 docs/rules/wage-and-workforce.md):
//   1. 시급 구간 겹침        — 같은 사람의 [적용일~종료일]이 서로 겹치는가 (R-7이 막아야 하는 것)
//   2. 시급 구간 구멍        — 앞 줄 종료 다음 날부터 뒤 줄 시작 전까지 비는 날이 있는가 (T-14)
//   3. 열린 줄 중복          — 종료일이 빈 줄이 한 사람에게 둘 이상인가
//   4. 금액 이상             — 0원·빈값·음수·소수점
//   5. 시급 없는 재직자      — 지금 근무 중인데 시급 이력이 0줄 (Pool·BP는 정상일 수 있음)
//   6. 입사일 이상           — 비었거나, 미래이거나, 1990년 이전
//   7. 입사일 vs 시급 시작일 — 어긋난 사람 수와 그 방향 (R-20 이관 흔적)
//   8. 적용일 쏠림           — 특정 날짜에 시급 시작일이 몰려 있는가 (일괄 이관·오조작 흔적)
//   9. 중복 저장 흔적        — 같은 사람에게 짧은 시간 안에 여러 줄이 들어갔는가 (T-13)
//  10. 실적 시급 공백        — 저장된 실적 중 그 근무일을 덮는 시급 구간이 없는 건 (T-15)
//
// 사용법:
//   node artifacts/scripts/diagnose-wage-history.cjs
//   node artifacts/scripts/diagnose-wage-history.cjs --db "D:\경로\shiftmgmt.sqlite"
//   node artifacts/scripts/diagnose-wage-history.cjs --json     (기계가 읽을 형태로)

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = { db: null, json: false };

  args.forEach((value, index) => {
    if (value === "--db" && args[index + 1]) {
      result.db = args[index + 1];
    }

    if (value === "--json") {
      result.json = true;
    }
  });

  return result;
};

const resolveDbCandidates = () => {
  const appData =
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");

  return [
    path.join(appData, "shiftmgmt-v3-4", "data", "shiftmgmt.sqlite"), // 개발 실행본
    path.join(appData, "ShiftMgmt", "data", "shiftmgmt.sqlite") // 설치본
  ];
};

const shiftDate = (value, days) => {
  const target = new Date(`${value}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);

  return target.toISOString().slice(0, 10);
};

const todayLocal = () => {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const isDateValue = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const openDatabase = (explicitPath) => {
  const candidates = explicitPath ? [explicitPath] : resolveDbCandidates();
  const found = candidates.find((candidate) => fs.existsSync(candidate));

  if (!found) {
    console.error("데이터베이스 파일을 찾지 못했습니다. 찾아본 곳:");
    candidates.forEach((candidate) => console.error(`  ${candidate}`));
    console.error("\n--db 로 경로를 직접 지정할 수 있습니다.");
    process.exit(1);
  }

  return { database: new DatabaseSync(found, { readOnly: true }), dbPath: found };
};

const collect = (database) => {
  const today = todayLocal();

  const employees = database
    .prepare(
      `SELECT id, employee_code, name, status, employment_type, hire_date, retire_date, deleted_at
       FROM employees
       ORDER BY name ASC`
    )
    .all();

  const rates = database
    .prepare(
      `SELECT id, employee_id, hourly_rate, effective_from, effective_to, reason, created_at
       FROM wage_rates
       ORDER BY employee_id ASC, effective_from ASC, created_at ASC`
    )
    .all();

  const byEmployee = new Map();
  rates.forEach((rate) => {
    const bucket = byEmployee.get(rate.employee_id) ?? [];
    bucket.push(rate);
    byEmployee.set(rate.employee_id, bucket);
  });

  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const label = (employeeId) => {
    const employee = employeeById.get(employeeId);

    return employee ? `${employee.name}(${employee.employee_code})` : `알 수 없는 인력 ${employeeId}`;
  };

  const overlaps = [];
  const gaps = [];
  const openDuplicates = [];
  const rapidDuplicates = [];

  byEmployee.forEach((bucket, employeeId) => {
    const openRows = bucket.filter((rate) => !rate.effective_to);

    if (openRows.length > 1) {
      openDuplicates.push({
        employee: label(employeeId),
        count: openRows.length,
        starts: openRows.map((rate) => rate.effective_from)
      });
    }

    bucket.forEach((rate, index) => {
      const next = bucket[index + 1];

      if (!next) {
        return;
      }

      const end = rate.effective_to;

      if (!end || end >= next.effective_from) {
        overlaps.push({
          employee: label(employeeId),
          earlier: `${rate.effective_from}~${end ?? "계속"}`,
          later: `${next.effective_from}~${next.effective_to ?? "계속"}`
        });

        return;
      }

      if (isDateValue(end) && shiftDate(end, 1) !== next.effective_from) {
        gaps.push({
          employee: label(employeeId),
          from: shiftDate(end, 1),
          to: shiftDate(next.effective_from, -1)
        });
      }
    });

    // 같은 사람에게 10분 안에 두 줄 이상 들어간 흔적 (저장 버튼 중복 클릭)
    const sorted = bucket
      .filter((rate) => rate.created_at)
      .slice()
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    sorted.forEach((rate, index) => {
      const next = sorted[index + 1];

      if (!next) {
        return;
      }

      const gapMs = Date.parse(next.created_at) - Date.parse(rate.created_at);

      if (Number.isFinite(gapMs) && gapMs >= 0 && gapMs <= 10 * 60 * 1000) {
        rapidDuplicates.push({
          employee: label(employeeId),
          seconds: Math.round(gapMs / 1000),
          first: `${rate.effective_from} / ${rate.hourly_rate}`,
          second: `${next.effective_from} / ${next.hourly_rate}`
        });
      }
    });
  });

  // 0원·빈값·음수는 승인을 막는 실제 문제다.
  const badAmounts = rates
    .filter(
      (rate) =>
        rate.hourly_rate === null ||
        rate.hourly_rate === undefined ||
        !Number.isFinite(Number(rate.hourly_rate)) ||
        Number(rate.hourly_rate) <= 0
    )
    .map((rate) => ({
      employee: label(rate.employee_id),
      amount: rate.hourly_rate ?? "(비어 있음)",
      from: rate.effective_from
    }));

  // 소수점은 금액 오류가 아니다 — 화면·서류·계산이 모두 소수를 그대로 쓴다. 참고로만 센다.
  const decimalAmounts = rates
    .filter(
      (rate) =>
        Number.isFinite(Number(rate.hourly_rate)) &&
        Number(rate.hourly_rate) > 0 &&
        !Number.isInteger(Number(rate.hourly_rate))
    )
    .map((rate) => ({
      employee: label(rate.employee_id),
      amount: rate.hourly_rate,
      from: rate.effective_from
    }));

  const activeEmployees = employees.filter(
    (employee) => !employee.deleted_at && employee.status !== "retired"
  );

  const missingWage = activeEmployees
    .filter((employee) => !byEmployee.has(employee.id))
    .map((employee) => ({
      employee: `${employee.name}(${employee.employee_code})`,
      employmentType: employee.employment_type,
      hireDate: employee.hire_date ?? "(없음)"
    }));

  const badHireDates = employees
    .filter((employee) => !employee.deleted_at)
    .filter((employee) => {
      const value = employee.hire_date;

      if (!value) {
        return true;
      }

      return !isDateValue(value) || value > today || value < "1990-01-01";
    })
    .map((employee) => ({
      employee: `${employee.name}(${employee.employee_code})`,
      hireDate: employee.hire_date ?? "(없음)"
    }));

  const hireVsWage = { same: 0, wageLater: 0, wageEarlier: 0, samples: [] };
  activeEmployees.forEach((employee) => {
    const bucket = byEmployee.get(employee.id);

    if (!bucket || !bucket.length || !isDateValue(employee.hire_date)) {
      return;
    }

    const firstStart = bucket[0].effective_from;

    if (firstStart === employee.hire_date) {
      hireVsWage.same += 1;
      return;
    }

    const key = firstStart > employee.hire_date ? "wageLater" : "wageEarlier";
    hireVsWage[key] += 1;

    if (hireVsWage.samples.length < 8) {
      hireVsWage.samples.push({
        employee: `${employee.name}(${employee.employee_code})`,
        hireDate: employee.hire_date,
        firstWageStart: firstStart,
        direction: key === "wageLater" ? "시급이 늦게 시작" : "시급이 먼저 시작"
      });
    }
  });

  const startClusters = new Map();
  rates.forEach((rate) => {
    startClusters.set(rate.effective_from, (startClusters.get(rate.effective_from) ?? 0) + 1);
  });

  const topClusters = [...startClusters.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([date, count]) => ({ date, count }));

  // 실적 중 근무일을 덮는 시급 구간이 없는 건
  let uncovered = { total: 0, samples: [], byEmployee: [] };

  try {
    const entries = database
      .prepare(
        `SELECT performance_entries.employee_code,
                performance_entries.employee_name,
                performance_entries.work_date,
                performance_entries.hourly_rate,
                performance_entries.is_pool_worker,
                performance_files.status as file_status
         FROM performance_entries
         LEFT JOIN performance_files
           ON performance_files.id = performance_entries.performance_file_id`
      )
      .all();

    const byCode = new Map();
    employees.forEach((employee) => {
      byCode.set(String(employee.employee_code).trim(), employee.id);
    });

    const counter = new Map();

    entries.forEach((entry) => {
      const employeeId = byCode.get(String(entry.employee_code ?? "").trim());
      const bucket = employeeId ? byEmployee.get(employeeId) : undefined;
      const covered =
        bucket &&
        bucket.some(
          (rate) =>
            entry.work_date >= rate.effective_from &&
            (!rate.effective_to || entry.work_date <= rate.effective_to)
        );

      if (covered) {
        return;
      }

      uncovered.total += 1;
      const key = `${entry.employee_name}(${entry.employee_code || "사번없음"})`;
      counter.set(key, (counter.get(key) ?? 0) + 1);

      if (uncovered.samples.length < 8) {
        uncovered.samples.push({
          employee: key,
          workDate: entry.work_date,
          storedRate: entry.hourly_rate ?? "(비어 있음)",
          status: entry.file_status ?? "(상태 없음)",
          isPool: Boolean(entry.is_pool_worker)
        });
      }
    });

    uncovered.byEmployee = [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([employee, count]) => ({ employee, count }));
    uncovered.entryTotal = entries.length;
  } catch (error) {
    uncovered = { total: 0, samples: [], byEmployee: [], error: String(error.message ?? error) };
  }

  return {
    today,
    counts: {
      employees: employees.length,
      activeEmployees: activeEmployees.length,
      wageRows: rates.length,
      employeesWithWage: byEmployee.size
    },
    overlaps,
    gaps,
    openDuplicates,
    badAmounts,
    decimalAmounts,
    missingWage,
    badHireDates,
    hireVsWage,
    topClusters,
    rapidDuplicates,
    uncovered
  };
};

const section = (title, rows, formatter, okMessage) => {
  console.log(`\n── ${title}`);

  if (!rows.length) {
    console.log(`   ${okMessage}`);
    return;
  }

  console.log(`   ${rows.length}건`);
  rows.slice(0, 10).forEach((row) => console.log(`   · ${formatter(row)}`));

  if (rows.length > 10) {
    console.log(`   … 외 ${rows.length - 10}건`);
  }
};

const main = () => {
  const args = parseArgs();
  const { database, dbPath } = openDatabase(args.db);
  const report = collect(database);

  if (args.json) {
    console.log(JSON.stringify({ dbPath, ...report }, null, 2));
    return;
  }

  console.log("통상시급 장부 점검");
  console.log(`데이터베이스: ${dbPath}`);
  console.log(`기준 날짜: ${report.today}`);
  console.log(
    `\n인력 ${report.counts.employees}명(재직 ${report.counts.activeEmployees}명) · ` +
      `시급 이력 ${report.counts.wageRows}줄 · 시급이 있는 인력 ${report.counts.employeesWithWage}명`
  );

  section(
    "1. 시급 구간이 겹치는 곳",
    report.overlaps,
    (row) => `${row.employee}: ${row.earlier} ↔ ${row.later}`,
    "없음 ✓"
  );

  section(
    "2. 시급이 비는 기간",
    report.gaps,
    (row) => `${row.employee}: ${row.from} ~ ${row.to} 사이에 시급 없음`,
    "없음 ✓"
  );

  section(
    "3. 끝나는 날이 빈 줄이 둘 이상인 인력",
    report.openDuplicates,
    (row) => `${row.employee}: ${row.count}줄 (${row.starts.join(", ")})`,
    "없음 ✓"
  );

  section(
    "4. 금액이 0원이거나 비어 있는 줄 (승인을 막는다)",
    report.badAmounts,
    (row) => `${row.employee}: ${row.amount} (${row.from}부터)`,
    "없음 ✓"
  );

  console.log(`\n── 4-1. 소수점 시급 (참고 — 금액 오류 아님)`);
  if (!report.decimalAmounts.length) {
    console.log("   없음");
  } else {
    console.log(
      `   ${report.decimalAmounts.length}건 — 화면·서류·계산 모두 소수를 그대로 쓰므로 금액은 맞습니다.`
    );
    report.decimalAmounts
      .slice(0, 5)
      .forEach((row) => console.log(`   · ${row.employee}: ${row.amount} (${row.from}부터)`));
    if (report.decimalAmounts.length > 5) {
      console.log(`   … 외 ${report.decimalAmounts.length - 5}건`);
    }
  }

  section(
    "5. 근무 중인데 시급 이력이 없는 인력",
    report.missingWage,
    (row) => `${row.employee} [${row.employmentType}] 입사일 ${row.hireDate}`,
    "없음 ✓"
  );
  if (report.missingWage.length) {
    console.log("   ※ Pool·BP 인력은 시급 없이 동작하도록 설계돼 있어 정상일 수 있습니다.");
  }

  section(
    "6. 입사일이 비었거나 이상한 인력",
    report.badHireDates,
    (row) => `${row.employee}: ${row.hireDate}`,
    "없음 ✓"
  );

  console.log("\n── 7. 입사일과 첫 시급 시작일 비교");
  console.log(
    `   같음 ${report.hireVsWage.same}명 · 시급이 늦게 시작 ${report.hireVsWage.wageLater}명 · ` +
      `시급이 먼저 시작 ${report.hireVsWage.wageEarlier}명`
  );
  report.hireVsWage.samples.forEach((row) =>
    console.log(`   · ${row.employee}: 입사 ${row.hireDate} / 시급 ${row.firstWageStart} (${row.direction})`)
  );
  if (report.hireVsWage.wageLater > 0) {
    console.log("   ※ 시급이 늦게 시작한 인력은 그 이전 기간을 다시 불러오면 승인이 막힙니다.");
  }

  console.log("\n── 8. 시급 시작일이 몰린 날짜 (상위 10개)");
  report.topClusters.forEach((row) => console.log(`   ${row.date}  ${row.count}건`));

  section(
    "9. 10분 안에 연달아 저장된 흔적 (저장 버튼 중복 클릭)",
    report.rapidDuplicates,
    (row) => `${row.employee}: ${row.seconds}초 간격 — [${row.first}] → [${row.second}]`,
    "없음 ✓"
  );

  console.log("\n── 10. 실적 중 근무일을 덮는 시급이 없는 건");
  if (report.uncovered.error) {
    console.log(`   확인 불가: ${report.uncovered.error}`);
  } else {
    console.log(`   ${report.uncovered.total}건 / 전체 실적 ${report.uncovered.entryTotal}건`);
    report.uncovered.byEmployee.forEach((row) => console.log(`   · ${row.employee}: ${row.count}건`));
    report.uncovered.samples.slice(0, 5).forEach((row) =>
      console.log(
        `     예) ${row.employee} ${row.workDate} — 저장된 시급 ${row.storedRate}, 파일 상태 ${row.status}` +
          (row.isPool ? " [Pool 근무]" : "")
      )
    );
    if (report.uncovered.total > 0) {
      console.log(
        "   ※ 이미 승인된 건은 저장된 시급이 그대로 유지됩니다. 그 달을 다시 불러올 때만 막힙니다."
      );
    }
  }

  const problems =
    report.overlaps.length +
    report.gaps.length +
    report.openDuplicates.length +
    report.badHireDates.length;

  console.log(
    `\n종합: 장부 구조 문제 ${problems}건${problems === 0 ? " — 시급 구간 자체는 성합니다 ✓" : ""}`
  );
  console.log("규칙 설명은 docs/rules/wage-and-workforce.md 를 보십시오.");
};

main();
