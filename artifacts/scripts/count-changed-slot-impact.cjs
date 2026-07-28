// 변경후 우선 규칙(changedSlotPriorityEffectiveFrom)을 켰을 때 영향을 받는 승인분을 세어 본다.
//
// 읽기 전용이다. 데이터베이스에 아무것도 쓰지 않는다.
//
// 세는 대상: 휴일 그리드에서 "변경전 칸에 실제 사람 이름 + 변경후 칸에 다른 실제 사람 이름"으로
// 들어와, 옛 규칙에서는 변경전 사람에게 크레딧된 실적. 새 규칙에서는 변경후 사람으로 바뀐다.
//
// 사용법:
//   node artifacts/scripts/count-changed-slot-impact.cjs
//   node artifacts/scripts/count-changed-slot-impact.cjs --db "D:\경로\shiftmgmt.sqlite" --from 2026-07-01

const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = { db: null, from: "2026-07-01" };

  args.forEach((value, index) => {
    if (value === "--db" && args[index + 1]) {
      result.db = args[index + 1];
    }

    if (value === "--from" && args[index + 1]) {
      result.from = args[index + 1];
    }
  });

  return result;
};

const resolveDefaultDbPath = () => {
  const appData =
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");

  return path.join(appData, "shiftmgmt-v3-4", "data", "shiftmgmt.sqlite");
};

// 파서가 "정해진 원근무자 없음"으로 보는 표기들. 이 값이면 옛 규칙에서도 이미 변경후가 인정됐다.
const EMPTY_MARKERS = new Set(["", "-", "--", "휴무", "없음", "none", "홍길동"]);

const isPlaceholderName = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (EMPTY_MARKERS.has(normalized)) {
    return true;
  }

  // BP(홍길동) 같은 협력사 표기도 원근무자 실명이 아니다.
  return /^bp(\(|$)/.test(normalized);
};

const readSignatureSource = (signature) => {
  const marker = ":legal-holiday:";
  const at = String(signature ?? "").indexOf(marker);

  if (at < 0) {
    return null;
  }

  try {
    return JSON.parse(signature.slice(at + marker.length));
  } catch {
    return null;
  }
};

const main = () => {
  const { db: dbArg, from } = parseArgs();
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

  // 품의 승인이 끝난 달은 실적관리 화면에서 "변경불가"로 잠긴다.
  const lockedMonths = new Set(
    database
      .prepare("SELECT DISTINCT work_month FROM allowance_proposal_approvals")
      .all()
      .map((row) => row.work_month)
  );

  const rows = database
    .prepare(
      `
      SELECT
        entries.work_date,
        entries.site_name,
        entries.employee_name,
        entries.source_signature,
        approvals.decision
      FROM performance_entries AS entries
      LEFT JOIN performance_approvals AS approvals
        ON approvals.entry_id = entries.id
      WHERE entries.section = 'legal-holiday'
        AND entries.source_signature IS NOT NULL
    `
    )
    .all();

  const affected = [];

  rows.forEach((row) => {
    const source = readSignatureSource(row.source_signature);

    if (!source) {
      return;
    }

    const regularName = String(source.regularName ?? "").trim();
    const changedName = String(source.changedName ?? "").trim();

    if (!regularName || !changedName || regularName === changedName) {
      return;
    }

    // 변경전이 자리표시자면 옛 규칙에서도 이미 변경후가 인정됐다 → 바뀌는 것이 없다.
    if (isPlaceholderName(regularName) || isPlaceholderName(changedName)) {
      return;
    }

    affected.push({
      workDate: row.work_date,
      siteName: row.site_name,
      creditedNow: row.employee_name,
      willBecome: changedName,
      approved: row.decision === "approved",
      workMonth: String(row.work_date ?? "").slice(0, 7)
    });
  });

  const onOrAfter = affected.filter((item) => item.workDate >= from);
  const before = affected.filter((item) => item.workDate < from);
  const approvedOnOrAfter = onOrAfter.filter((item) => item.approved);
  const lockedOnOrAfter = approvedOnOrAfter.filter((item) => lockedMonths.has(item.workMonth));

  console.log(`데이터베이스: ${dbPath}`);
  console.log(`적용 시작일: ${from}`);
  console.log("");
  console.log(`변경전·변경후에 서로 다른 실제 이름이 적힌 휴일 실적: 총 ${affected.length}건`);
  console.log(`  · 시작일 이전 근무일 (바뀌지 않음): ${before.length}건`);
  console.log(`  · 시작일 이후 근무일 (새 규칙 대상): ${onOrAfter.length}건`);
  console.log(`      - 그중 이미 승인된 건: ${approvedOnOrAfter.length}건`);
  console.log(`      - 그중 품의 승인까지 끝나 잠긴 건: ${lockedOnOrAfter.length}건`);
  console.log("");

  if (onOrAfter.length === 0) {
    console.log("시작일 이후 근무일에는 해당 건이 없습니다.");
    return;
  }

  console.log("시작일 이후 근무일 목록 (근무일 · 근무지 · 지금 잡힌 사람 → 바뀔 사람 · 상태)");
  onOrAfter
    .slice()
    .sort((left, right) => left.workDate.localeCompare(right.workDate))
    .forEach((item) => {
      const state = !item.approved
        ? "승인 전"
        : lockedMonths.has(item.workMonth)
          ? "승인 완료(품의까지 끝나 잠김)"
          : "승인 완료";

      console.log(
        `  ${item.workDate}  ${item.siteName ?? "-"}  ${item.creditedNow} → ${item.willBecome}  [${state}]`
      );
    });
};

main();
