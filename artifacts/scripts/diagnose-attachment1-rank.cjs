// 별첨1에서 직급이 "-"로 찍히는 이유를 인원별로 갈라 보여 준다.
//
// 읽기 전용이다. 데이터베이스에 아무것도 쓰지 않는다.
//
// 별첨1의 직급은 세 곳을 차례로 찾는다:
//   ① 승인된 계산 결과에 함께 저장된 직급
//   ② 사번으로 인력 정보 조회
//   ③ 이름으로 인력 정보 조회(동명이인이면 쓰지 않는다)
// 세 곳 모두 비면 "-"가 된다. 프로그램이 인정하는 직급은 사원·대리·과장·차장·부장 다섯 가지뿐이고,
// 그 밖의 값은 저장할 때 이미 버려지므로 화면에도 별첨1에도 나오지 않는다.
//
// ⚠️ 배포된 0.5.3 판은 위와 다르게 동작한다:
//   · 사번 대조 때 인력 정보 쪽 공백을 털지 않는다(사번 뒤에 공백이 붙어 있으면 영영 못 찾는다)
//   · 삭제 처리된 인력은 조회에서 빠진다
//   · 이름 보조조회(③)가 없다
// 그래서 이 도구는 "수정판 기준"과 "지금 배포판(0.5.3) 기준"을 나란히 판정한다.
// 직급을 채웠는데도 배포판에서 "-"로 나오는 인원이 어느 쪽 결함 때문인지 바로 보인다.
//
// 사용법:
//   node artifacts/scripts/diagnose-attachment1-rank.cjs --month 2026-06
//   node artifacts/scripts/diagnose-attachment1-rank.cjs --db "D:\경로\shiftmgmt.sqlite" --month 2026-06

const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const RANK_OPTIONS = new Set(["사원", "대리", "과장", "차장", "부장"]);

// 문서로 나가는 계산 결과의 상태(exportAllowanceDocuments 의 allowedStatuses 와 같다).
const EXPORTABLE_STATUSES = new Set(["approved", "proposal-approved"]);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = { db: null, month: null };

  args.forEach((value, index) => {
    if (value === "--db" && args[index + 1]) {
      result.db = args[index + 1];
    }

    if (value === "--month" && args[index + 1]) {
      result.month = args[index + 1];
    }
  });

  return result;
};

const resolveDefaultDbPath = () => {
  const appData =
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");

  return path.join(appData, "shiftmgmt-v3-4", "data", "shiftmgmt.sqlite");
};

const normalizeRank = (value) => {
  const normalized = String(value ?? "").trim();

  return RANK_OPTIONS.has(normalized) ? normalized : undefined;
};

// 실적에 실린 이름은 협력사 인원이면 "BP(홍길동)" 꼴로 감싸져 온다. 조회 전에 벗겨낸다.
const normalizeLookupName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^BP\((.*)\)$/i, "$1")
    .trim();

// 사번에 공백·보이지 않는 문자가 섞여 있는지. 0.5.3 판은 이 경우 대조에 실패한다.
const hasHiddenCharacters = (value) => {
  const raw = String(value ?? "");

  return raw !== raw.trim() || /[\s\u00A0\u200B\uFEFF]/.test(raw.trim());
};

const main = () => {
  const { db: dbArg, month } = parseArgs();
  const dbPath = dbArg ?? resolveDefaultDbPath();

  let database;

  try {
    database = new DatabaseSync(dbPath, { readOnly: true });
  } catch (error) {
    console.error(`데이터베이스를 열지 못했습니다: ${dbPath}`);
    console.error(String(error && error.message ? error.message : error));
    process.exitCode = 1;
    return;
  }

  console.log(`데이터베이스: ${dbPath}`);

  // ── 1. 인력 정보의 직급 현황 ─────────────────────────────────────────────
  const employees = database
    .prepare(
      `SELECT employee_code, name, rank, deleted_at
         FROM employees
        ORDER BY employee_code`
    )
    .all();

  const blankRank = [];
  const rejectedRank = [];
  let validRank = 0;

  employees.forEach((row) => {
    const raw = row.rank === null || row.rank === undefined ? "" : String(row.rank).trim();

    if (!raw) {
      blankRank.push(row);
      return;
    }

    if (!RANK_OPTIONS.has(raw)) {
      rejectedRank.push({ ...row, raw });
      return;
    }

    validRank += 1;
  });

  const dirtyCodes = employees.filter((row) => hasHiddenCharacters(row.employee_code));
  const deletedWithRank = employees.filter(
    (row) => row.deleted_at && normalizeRank(row.rank)
  );

  console.log("");
  console.log("[1] 인력 정보의 직급 현황");
  console.log(`  전체 인력: ${employees.length}명`);
  console.log(`  · 직급 정상(사원·대리·과장·차장·부장): ${validRank}명`);
  console.log(`  · 직급이 비어 있음: ${blankRank.length}명`);
  console.log(`  · 인정하지 않는 표기라 버려짐: ${rejectedRank.length}명`);

  if (rejectedRank.length > 0) {
    console.log("      (아래 값은 저장돼 있어도 화면·문서에 나오지 않습니다)");
    const byValue = new Map();
    rejectedRank.forEach((row) => {
      byValue.set(row.raw, (byValue.get(row.raw) ?? 0) + 1);
    });
    Array.from(byValue.entries())
      .sort((left, right) => right[1] - left[1])
      .forEach(([value, count]) => console.log(`      "${value}" ${count}명`));
  }

  console.log(`  · 사번에 공백·숨은 문자가 섞임: ${dirtyCodes.length}명`);

  if (dirtyCodes.length > 0) {
    console.log("      (0.5.3 판은 이 인원의 직급을 영영 찾지 못합니다. 따옴표 안이 실제 저장값)");
    dirtyCodes.slice(0, 10).forEach((row) => {
      console.log(`      ${JSON.stringify(String(row.employee_code))}  ${row.name}`);
    });
    if (dirtyCodes.length > 10) {
      console.log(`      ... 외 ${dirtyCodes.length - 10}명`);
    }
  }

  if (deletedWithRank.length > 0) {
    console.log(
      `  · 삭제 처리됐지만 직급은 있는 인력: ${deletedWithRank.length}명 (0.5.3 판은 조회에서 제외)`
    );
  }

  // ── 2. 조회표 두 벌: 수정판 방식 + 배포판(0.5.3) 방식 ────────────────────
  // 수정판: 사번 양쪽 trim + 삭제분 포함 + 이름 보조조회.
  const rankByCode = new Map();
  employees.forEach((row) => {
    const rank = normalizeRank(row.rank);

    if (rank) {
      rankByCode.set(String(row.employee_code ?? "").trim(), rank);
    }
  });

  const rankByNameDraft = new Map();
  const ambiguousNames = new Set();
  employees.forEach((row) => {
    const key = normalizeLookupName(row.name);

    if (!key) {
      return;
    }

    if (rankByNameDraft.has(key)) {
      ambiguousNames.add(key);
      return;
    }

    rankByNameDraft.set(key, normalizeRank(row.rank));
  });
  ambiguousNames.forEach((name) => rankByNameDraft.delete(name));

  const rankByName = new Map(
    Array.from(rankByNameDraft.entries()).filter((entry) => Boolean(entry[1]))
  );

  // 배포판(0.5.3): 저장된 사번을 그대로 키로 쓰고(공백 미제거), 삭제 인력 제외, 이름조회 없음.
  const rankByCodeShipped = new Map();
  employees.forEach((row) => {
    if (row.deleted_at) {
      return;
    }

    const rank = normalizeRank(row.rank);

    if (rank) {
      rankByCodeShipped.set(String(row.employee_code ?? ""), rank);
    }
  });

  // 배포판에서만 "-"인 인원의 원인을 짚기 위한 보조 표.
  const activeRankedRawByTrimmed = new Map();
  const deletedRankedTrimmed = new Set();
  employees.forEach((row) => {
    if (!normalizeRank(row.rank)) {
      return;
    }

    const raw = String(row.employee_code ?? "");
    const trimmed = raw.trim();

    if (row.deleted_at) {
      deletedRankedTrimmed.add(trimmed);
      return;
    }

    if (!activeRankedRawByTrimmed.has(trimmed)) {
      activeRankedRawByTrimmed.set(trimmed, raw);
    }
  });

  const codeExists = new Set(employees.map((row) => String(row.employee_code ?? "").trim()));
  const rawRankByCode = new Map(
    employees.map((row) => [
      String(row.employee_code ?? "").trim(),
      row.rank === null || row.rank === undefined ? "" : String(row.rank).trim()
    ])
  );

  // ── 3. 대상 월의 승인된 계산 결과를 훑는다 ──────────────────────────────
  const months = database
    .prepare(
      `SELECT DISTINCT substr(work_date, 1, 7) AS ym
         FROM allowance_calculations
        WHERE status IN ('approved', 'proposal-approved')
        ORDER BY ym DESC`
    )
    .all()
    .map((row) => row.ym)
    .filter(Boolean);

  console.log("");
  console.log("[2] 문서로 낼 수 있는(승인 완료) 달");
  console.log(months.length > 0 ? `  ${months.join(", ")}` : "  (없음)");

  const targetMonth = month ?? months[0];

  if (!targetMonth) {
    console.log("");
    console.log("승인된 수당이 없어 더 볼 것이 없습니다.");
    return;
  }

  const rows = database
    .prepare(
      `SELECT employee_code, employee_name, employee_rank, status, site_name, work_date
         FROM allowance_calculations
        WHERE substr(work_date, 1, 7) = ?
        ORDER BY employee_code, work_date`
    )
    .all(targetMonth)
    .filter((row) => EXPORTABLE_STATUSES.has(String(row.status)));

  console.log("");
  console.log(`[3] ${targetMonth} 별첨1 직급 판정 (승인 완료 ${rows.length}행)`);

  if (rows.length === 0) {
    console.log(`  ${targetMonth} 에는 승인 완료된 수당이 없습니다. --month 로 다른 달을 지정해 보세요.`);
    return;
  }

  const perPerson = new Map();

  rows.forEach((row) => {
    const code = String(row.employee_code ?? "").trim();
    const name = String(row.employee_name ?? "").trim();
    const key = `${code}|${name}`;

    if (perPerson.has(key)) {
      perPerson.get(key).count += 1;
      return;
    }

    const fromCalc = normalizeRank(row.employee_rank);
    const fromCode = rankByCode.get(code);
    const fromName = rankByName.get(normalizeLookupName(name));
    const resolved = fromCalc ?? fromCode ?? fromName;
    const resolvedShipped = fromCalc ?? rankByCodeShipped.get(code);

    let reason = null;

    if (!resolved) {
      const rawStored = rawRankByCode.get(code);

      if (!codeExists.has(code)) {
        reason = ambiguousNames.has(normalizeLookupName(name))
          ? "사번으로 인력을 찾지 못했고, 같은 이름이 둘 이상이라 이름으로도 확정 불가"
          : "사번으로 인력을 찾지 못했고, 이름으로도 직급을 찾지 못함";
      } else if (rawStored && !RANK_OPTIONS.has(rawStored)) {
        reason = `인력 정보의 직급 "${rawStored}" 이(가) 인정하지 않는 표기라 버려짐`;
      } else {
        reason = "인력 정보에 직급이 비어 있음";
      }
    }

    // 수정판에서는 나오는데 배포판(0.5.3)에서만 "-"인 경우의 원인.
    let shippedGapReason = null;

    if (resolved && !resolvedShipped) {
      const rawActive = activeRankedRawByTrimmed.get(code);

      if (rawActive !== undefined && rawActive !== code) {
        shippedGapReason = `인력 정보의 사번에 숨은 공백 (저장값 ${JSON.stringify(rawActive)})`;
      } else if (rawActive === undefined && deletedRankedTrimmed.has(code)) {
        shippedGapReason = "인력이 삭제 처리돼 있음 (수정판은 삭제분도 조회)";
      } else if (!fromCalc && !fromCode && fromName) {
        shippedGapReason = "사번으로는 인력을 못 찾아 이름으로 보완 (수정판 기능)";
      } else {
        shippedGapReason = "사번 대조 방식 차이";
      }
    }

    perPerson.set(key, {
      code,
      name,
      siteName: row.site_name ?? "-",
      resolved,
      resolvedShipped,
      source: fromCalc ? "계산결과" : fromCode ? "사번조회" : fromName ? "이름조회" : null,
      reason,
      shippedGapReason,
      count: 1
    });
  });

  const people = Array.from(perPerson.values());
  const missing = people.filter((person) => !person.resolved);
  const found = people.filter((person) => person.resolved);
  const shippedMissing = people.filter((person) => !person.resolvedShipped);
  const shippedOnlyGap = people.filter((person) => person.resolved && !person.resolvedShipped);

  console.log(`  인원 ${people.length}명 중`);
  console.log(`  · 지금 배포판(0.5.3)에서 "-" 로 나옴: ${shippedMissing.length}명`);
  console.log(`  · 수정판(미배포)에서도 "-" 로 나옴: ${missing.length}명`);
  console.log(`  · 수정판에서는 해결됨: ${shippedOnlyGap.length}명`);

  if (found.length > 0) {
    const bySource = new Map();
    found.forEach((person) => {
      bySource.set(person.source, (bySource.get(person.source) ?? 0) + 1);
    });
    console.log(
      `      (수정판이 찾은 경로: ${Array.from(bySource.entries())
        .map(([source, count]) => `${source} ${count}명`)
        .join(", ")})`
    );
  }

  if (shippedOnlyGap.length > 0) {
    console.log("");
    console.log('[4] 지금 배포판(0.5.3)에서만 "-" — 수정판을 배포하면 해결되는 인원');
    const byGapReason = new Map();
    shippedOnlyGap.forEach((person) => {
      if (!byGapReason.has(person.shippedGapReason)) {
        byGapReason.set(person.shippedGapReason, []);
      }
      byGapReason.get(person.shippedGapReason).push(person);
    });
    Array.from(byGapReason.entries())
      .sort((left, right) => right[1].length - left[1].length)
      .forEach(([gapReason, group]) => {
        console.log("");
        console.log(`  ▶ ${gapReason} — ${group.length}명`);
        group
          .slice()
          .sort((left, right) => left.code.localeCompare(right.code))
          .forEach((person) =>
            console.log(
              `      ${person.code || "(사번없음)"}  ${person.name}  [${person.siteName}]  → 수정판에선 "${person.resolved}"`
            )
          );
      });
  }

  if (missing.length === 0 && shippedOnlyGap.length === 0) {
    console.log("");
    console.log(`${targetMonth} 별첨1은 어느 판에서든 전원 직급이 나옵니다.`);
    return;
  }

  if (missing.length > 0) {
    const byReason = new Map();
    missing.forEach((person) => {
      if (!byReason.has(person.reason)) {
        byReason.set(person.reason, []);
      }
      byReason.get(person.reason).push(person);
    });

    console.log("");
    console.log('[5] 어느 판에서든 "-" 로 나오는 이유별 목록');
    Array.from(byReason.entries())
      .sort((left, right) => right[1].length - left[1].length)
      .forEach(([reason, group]) => {
        console.log("");
        console.log(`  ▶ ${reason} — ${group.length}명`);
        group
          .slice()
          .sort((left, right) => left.code.localeCompare(right.code))
          .forEach((person) =>
            console.log(`      ${person.code || "(사번없음)"}  ${person.name}  [${person.siteName}]`)
          );
      });
  }

  console.log("");
  console.log("[6] 무엇을 하면 되는가");

  if (shippedOnlyGap.length > 0) {
    console.log(
      `  · [4]의 ${shippedOnlyGap.length}명은 인력 정보를 고칠 필요가 없습니다. 프로그램 새 판을 배포하면 그대로 해결됩니다.`
    );
    console.log("    (당장 급하면: 인력 관리에서 그 사람 사번의 앞뒤 공백을 지워 다시 저장해도 됩니다)");
  }

  console.log("  · '인력 정보에 직급이 비어 있음' → 인력 관리에서 그 사람의 직급을 채우고 별첨1을 다시 출력하세요.");
  console.log("  · '인정하지 않는 표기' → 사원·대리·과장·차장·부장 중 하나로 바꿔 저장하세요.");
  console.log("  · '사번으로 인력을 찾지 못함' → 실적의 사번과 인력 정보의 사번이 같은지 확인하세요.");
  console.log("  ※ 직급은 표시 전용입니다. 채워 넣어도 계산 금액과 승인 상태는 바뀌지 않습니다.");
};

main();
