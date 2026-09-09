import path from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import {
  resetApprovedAllowanceCalculationStateForTest,
  runApprovedAllowanceCalculation
} from "./approved-allowance-calculation-service";
import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { listStoredEmployees } from "./employee-storage-service";
import {
  approvePerformanceFile,
  isPerformanceFileChangeLockedByProposal
} from "./performance-approval-flow-service";
import { listPerformanceOverview } from "./performance-management-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

// 실적 overview asked, once per ROW, questions that only have one answer per FILE, and reached
// those answers by materialising the whole allowance ledger plus one item query per calculation.
// Measured on a copy of the operator's own database: 8,449 SQL statements for a single row, and
// 21 seconds for one refresh of a 125-row month.
//
// These tests pin the SHAPE of the reads, not a stopwatch. A statement budget is the same number
// on a fast machine and a slow one, and it fails the moment a lookup is put back inside the row
// loop or answered by a full-table read.
const testRootBase = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "performance-overview-lock-lookup"
);
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(
    testRootBase,
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );

  allocatedTestRoots.push(root);
  return root;
};

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

interface StatementRecorder {
  executed: string[];
  reset: () => void;
}

// Counts the statements the services actually EXECUTE - preparing alone proves nothing - by
// wrapping database.prepare and the all/get/run of every statement it hands back.
const installStatementRecorder = (): StatementRecorder => {
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("테스트 DB를 초기화하지 못했습니다.");
  }

  const executed: string[] = [];
  const originalPrepare = database.prepare.bind(database);

  (database as unknown as { prepare: unknown }).prepare = (sql: string) => {
    const statement = originalPrepare(sql);
    const normalized = normalizeSql(sql);
    const wrap = (name: "all" | "get" | "run") => {
      const target = statement as unknown as Record<string, (...args: never[]) => unknown>;
      const original = target[name].bind(statement);

      target[name] = (...args: never[]) => {
        executed.push(normalized);
        return original(...args);
      };
    };

    wrap("all");
    wrap("get");
    wrap("run");

    return statement;
  };

  return {
    executed,
    reset: () => {
      executed.length = 0;
    }
  };
};

const insertCalculationSql = `
  INSERT INTO allowance_calculations (
    id, performance_approval_id, performance_entry_id, calculation_version, status,
    file_id, file_name, site_name, employee_code, employee_name, employee_rank,
    work_date, work_type, hourly_rate, rate_version_id, rate_version_label,
    total_work_minutes, base_work_minutes, overtime_minutes, night_minutes,
    holiday_minutes, substitute_minutes, total_allowance_amount, signature,
    snapshot_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const insertItemSql = `
  INSERT INTO allowance_calculation_items (
    id, calculation_id, allowance_code, work_minutes, multiplier, amount
  ) VALUES (?, ?, ?, ?, ?, ?)
`;

const calculationValues = (input: {
  calculationId: string;
  approvalId: string;
  fileId: string;
  status: string;
  createdAt: string;
}) => [
  input.calculationId,
  input.approvalId,
  `${input.approvalId}-entry`,
  1,
  input.status,
  input.fileId,
  `${input.fileId}.xlsx`,
  "테스트근무지",
  "E1",
  "직원1",
  "사원",
  "2026-03-01",
  "overtime",
  14100,
  "rate-version",
  "요율",
  270,
  120,
  150,
  150,
  0,
  0,
  100000,
  `signature-${input.calculationId}`,
  JSON.stringify({
    performanceApprovalId: input.approvalId,
    createdAt: input.createdAt,
    breakdown: { totalWorkMinutes: 270 },
    lines: []
  }),
  input.createdAt
];

// A synthetic approval history, written straight into the tables. This is a COST probe, not a
// data fixture: four thousand approvals cannot be produced through the Excel intake queue, and the
// rows never leave this temp database. The behavioural tests below go through the real intake
// helpers (prepareReturnedScheduleFixture -> approvePerformanceFile -> runApprovedAllowanceCalculation).
const seedApprovalHistory = (input: {
  dbPath: string;
  fileCount: number;
  approvalsPerFile: number;
}) => {
  initializeSqliteStorage({ dbPath: input.dbPath });
  const database = getSqliteDatabase();

  if (!database) {
    throw new Error("테스트 DB를 초기화하지 못했습니다.");
  }

  const insertApproval = database.prepare(`
    INSERT INTO performance_approvals (
      id, file_id, entry_id, logical_key, file_name, schedule_key, employee_code,
      employee_name, work_date, work_type, decision, processed_at, processed_by,
      processed_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCalculation = database.prepare(insertCalculationSql);
  const insertItem = database.prepare(insertItemSql);
  const fileIds: string[] = [];

  database.exec("BEGIN");

  for (let fileIndex = 0; fileIndex < input.fileCount; fileIndex += 1) {
    const fileId = `seeded-file-${fileIndex}`;
    fileIds.push(fileId);

    for (let approvalIndex = 0; approvalIndex < input.approvalsPerFile; approvalIndex += 1) {
      const approvalId = `${fileId}-approval-${approvalIndex}`;
      const calculationId = `${fileId}-calculation-${approvalIndex}`;
      // Only the very first file carries a 품의승인. Every other file is ordinary approved work.
      const status = fileIndex === 0 && approvalIndex === 0 ? "proposal-approved" : "calculated";

      insertApproval.run(
        approvalId,
        fileId,
        `${approvalId}-entry`,
        `${approvalId}-logical`,
        `${fileId}.xlsx`,
        `2026-03:${fileId}`,
        "E1",
        "직원1",
        "2026-03-01",
        "overtime",
        "approved",
        `2026-03-01T00:00:0${approvalIndex % 10}.000Z`,
        "admin",
        "관리자"
      );
      insertCalculation.run(
        ...(calculationValues({
          calculationId,
          approvalId,
          fileId,
          status,
          createdAt: `2026-03-01T00:00:0${approvalIndex % 10}.000Z`
        }) as never[])
      );

      for (let itemIndex = 0; itemIndex < 2; itemIndex += 1) {
        insertItem.run(
          `${calculationId}-item-${itemIndex}`,
          calculationId,
          `code-${itemIndex}`,
          120,
          1.5,
          50000
        );
      }
    }
  }

  database.exec("COMMIT");

  return { fileIds };
};

const measureLockLookup = (input: {
  rootDir: string;
  fileCount: number;
  approvalsPerFile: number;
}) => {
  const seeded = seedApprovalHistory({
    dbPath: path.resolve(input.rootDir, "lock-lookup.sqlite"),
    fileCount: input.fileCount,
    approvalsPerFile: input.approvalsPerFile
  });
  const recorder = installStatementRecorder();
  const lockedFileId = seeded.fileIds[0];
  const unlockedFileId = seeded.fileIds[seeded.fileIds.length - 1];

  const locked = isPerformanceFileChangeLockedByProposal(lockedFileId);
  const unlocked = isPerformanceFileChangeLockedByProposal(unlockedFileId);

  recorder.reset();
  isPerformanceFileChangeLockedByProposal(unlockedFileId);

  return { locked, unlocked, executed: [...recorder.executed] };
};

const countUnscoped = (executed: string[], table: string) =>
  executed.filter((sql) => sql.includes(`FROM ${table}`) && !sql.includes("WHERE")).length;

// countUnscoped 로는 잠금을 줄마다 묻는 자리로 되돌려도 아무 숫자가 변하지 않는다. 고친 뒤의
// 조회는 전부 범위가 지정돼 있어서(WHERE) 세는 대상이 아니기 때문이다. 그래서 잠금 자체를 센다.
//
// This SQL has exactly one author in the program - listLatestAllowanceCalculationStatusesByApprovalIds -
// and that function has exactly two callers: listPerformanceOverview asks it once at the start of a
// render, and isPerformanceFileChangeLockedByProposal asks it once per lock it actually resolves.
// So per render, this count is "one, plus however many times the lock was asked".
const LATEST_STATUS_READ_SQL =
  "SELECT performance_approval_id, status FROM allowance_calculations WHERE performance_approval_id IN";

const countLatestStatusReads = (executed: string[]) =>
  executed.filter((sql) => sql.includes(LATEST_STATUS_READ_SQL)).length;

// 품의 잠금을 묻는 유일한 이유가 이 안내다. 안내가 붙은 줄 수를 함께 재야, 숫자가 낮은 이유가
// "잠금을 한 번만 물어서"인지 "물을 줄이 아예 없어서"인지 구별된다.
const STILL_PAID_SINCE_APPROVAL_ALERT = "이미 승인된 수당은 그대로 지급됩니다";

const countStillPaidSinceApprovalAlertRows = (
  overview: Awaited<ReturnType<typeof listPerformanceOverview>>
) =>
  overview.groups
    .flatMap((group) => group.rows)
    .filter((row) =>
      row.entry.alerts.some((alert) => alert.message.includes(STILL_PAID_SINCE_APPROVAL_ALERT))
    ).length;

const buildApprovedFixture = async (rootDir: string) => {
  const fixture = await prepareReturnedScheduleFixture({
    rootDir,
    templateVariant: "sample1"
  });
  const detail = await syncPreparedReturnedSchedule(fixture);

  for (const entry of detail.entries) {
    const approved = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: entry.id
      },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approved.ok).toBe(true);
  }

  for (const entry of detail.entries) {
    await runApprovedAllowanceCalculation({ entryId: entry.id });
  }

  return {
    settings: { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir },
    query: { approvalScope: "approved" as const, scheduleMonth: "2026-03" }
  };
};

// 한 파일 안에 "승인 뒤에 미지급으로 바뀌었지만 승인분이라 돈은 그대로 나가는" 대체근무 줄을 둘
// 만든다. 그런 줄이 둘이라야 "파일마다 한 번 묻기"와 "줄마다 한 번 묻기"가 서로 다른 숫자가 된다.
//
// 순서는 운영에서 실제로 일어나는 순서 그대로다(substitute-allowance-team-policy.test.ts 와 같다):
// 승인할 때는 둘 다 교대조라 정상 지급 대상이고, 승인이 끝난 뒤에 배정 이력이 Pool 로 소급 정정돼
// 지금 기준으로는 미지급이 된다. 승인분이라 금액은 그대로 나가므로 두 줄 모두 안내가 붙는다.
const buildTwoStillPaidSubstituteRowsFixture = async (rootDir: string) => {
  const fixture = await prepareReturnedScheduleFixture({
    rootDir,
    templateVariant: "sample1"
  });

  // 양식 1의 대체근무 칸은 BA~BJ 11~26행이고, 헬퍼는 첫 줄만 채운다. 여기서 둘째 줄을 채워 같은
  // 파일에 대체근무 행을 둘로 만든다. 대체 투입자는 이 픽스처에서 아직 아무 행에도 쓰이지 않은
  // 사람(holidayReplacement)이라, 다른 줄의 판정을 건드리지 않는다.
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(fixture.filePath);

  const worksheet = workbook.getWorksheet("교대 근무 계획표") ?? workbook.worksheets[0];

  worksheet.getCell("BA12").value = "2026-03-02";
  worksheet.getCell("BC12").value = fixture.workers.substituteOriginal.name;
  worksheet.getCell("BE12").value = fixture.workers.holidayReplacement.name;
  worksheet.getCell("BG12").value = "교육";
  worksheet.getCell("BJ12").value = "대체증적";

  await workbook.xlsx.writeFile(fixture.filePath);

  const detail = await syncPreparedReturnedSchedule(fixture);

  expect(detail.entries.filter((entry) => entry.section === "substitute")).toHaveLength(2);

  for (const entry of detail.entries) {
    const approved = await approvePerformanceFile(
      {
        fileId: detail.id,
        entryId: entry.id
      },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approved.ok).toBe(true);
  }

  for (const entry of detail.entries) {
    await runApprovedAllowanceCalculation({ entryId: entry.id });
  }

  // 승인이 끝난 뒤에 두 대체 투입자의 배정이 Pool 로 소급 정정된다.
  for (const employeeCode of [
    fixture.workers.substituteReplacement.employeeCode,
    fixture.workers.holidayReplacement.employeeCode
  ]) {
    const employee = listStoredEmployees().find((item) => item.employeeCode === employeeCode);

    if (!employee?.currentSiteId) {
      throw new Error(`테스트 직원을 찾지 못했습니다: ${employeeCode}`);
    }

    saveStoredEmployeeAssignment({
      employeeId: employee.id,
      siteId: employee.currentSiteId,
      shiftGroup: "Pool",
      startDate: "2026-02-01"
    });
  }

  const settings = { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir };
  const query = {
    approvalScope: "approved" as const,
    section: "all" as const,
    scheduleMonth: "2026-03"
  };

  // 소급 정정을 반영해 한 번 다시 읽는다(보관 폴더 동기화까지 여기서 끝난다). 재는 것은 그 다음의
  // 평범한 조회다.
  await listPerformanceOverview({ ...query, forceReparse: true }, settings);

  return { settings, query };
};

describe("performance overview lock lookup", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("answers the file lock question with scoped reads only", () => {
    const measured = measureLockLookup({
      rootDir: createTestRoot(),
      fileCount: 40,
      approvalsPerFile: 10
    });

    // Behaviour first: the batched lookup must give the same answers the per-row helper gave.
    expect(measured.locked).toBe(true);
    expect(measured.unlocked).toBe(false);

    // One question about one file must not read whole tables.
    expect(measured.executed.length).toBeLessThanOrEqual(3);
    expect(measured.executed.every((sql) => sql.includes("WHERE"))).toBe(true);
  }, 300_000);

  it("keeps the file lock question the same size when the approval history grows ten times", () => {
    const small = measureLockLookup({
      rootDir: createTestRoot(),
      fileCount: 40,
      approvalsPerFile: 10
    });

    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetSqliteStorageForTest();

    const large = measureLockLookup({
      rootDir: createTestRoot(),
      fileCount: 400,
      approvalsPerFile: 10
    });

    expect(large.locked).toBe(true);
    expect(large.unlocked).toBe(false);
    // Same file, same question, ten times the history: the cost belongs to the file, not the table.
    expect(large.executed.length).toBe(small.executed.length);
  }, 300_000);

  it("builds the whole overview without re-reading the ledgers once per row", async () => {
    const { settings, query } = await buildApprovedFixture(createTestRoot());

    // Warm-up: the first approved read also syncs the archive folder into storage, a one-off cost
    // that is not what this test is about.
    await listPerformanceOverview(query, settings);

    const recorder = installStatementRecorder();
    recorder.reset();
    const overview = await listPerformanceOverview(query, settings);
    const executed = [...recorder.executed];

    expect(overview.rowCount).toBe(3);
    // Building the latest-approval map is the only unscoped approval scan the overview needs. The
    // lock used to add one more per ROW, by reading the whole approval history and filtering it in
    // JavaScript. (A file-scoped read is not counted here: two unrelated per-file checks issue the
    // exact same SQL, so counting "file_id = ?" would measure them, not the lock.)
    expect(countUnscoped(executed, "performance_approvals")).toBeLessThanOrEqual(1);
    // And no lookup may reach its answer by materialising the whole allowance ledger.
    expect(countUnscoped(executed, "allowance_calculations")).toBe(0);
    expect(executed.filter((sql) => sql.includes("FROM allowance_calculation_items")).length).toBe(
      0
    );
  }, 300_000);

  it("keeps the overview the same size when the allowance ledger grows by a thousand rows", async () => {
    const { settings, query } = await buildApprovedFixture(createTestRoot());

    await listPerformanceOverview(query, settings);

    const recorder = installStatementRecorder();
    recorder.reset();
    await listPerformanceOverview(query, settings);
    const before = recorder.executed.length;

    const database = getSqliteDatabase();

    if (!database) {
      throw new Error("테스트 DB를 초기화하지 못했습니다.");
    }

    // A thousand calculations that belong to no row on screen. A per-row full-table read pays for
    // every one of them; a scoped read pays for none.
    const insertCalculation = database.prepare(insertCalculationSql);
    const insertItem = database.prepare(insertItemSql);

    database.exec("BEGIN");
    for (let index = 0; index < 1_000; index += 1) {
      insertCalculation.run(
        ...(calculationValues({
          calculationId: `unrelated-${index}`,
          approvalId: `unrelated-approval-${index}`,
          fileId: `unrelated-file-${index}`,
          status: "calculated",
          createdAt: "2026-03-01T00:00:00.000Z"
        }) as never[])
      );
      insertItem.run(`unrelated-item-${index}`, `unrelated-${index}`, "code-0", 120, 1.5, 50000);
    }
    database.exec("COMMIT");

    recorder.reset();
    const grownOverview = await listPerformanceOverview(query, settings);

    expect(grownOverview.rowCount).toBe(3);
    expect(recorder.executed.length).toBe(before);
  }, 300_000);

  // 위 네 시험은 "표를 통째로 읽지 않는가"만 본다. 잠금을 줄마다 묻는 자리로 되돌려도 그 조회는
  // 여전히 범위가 지정돼 있어서 네 시험 모두 통과한다. 아래 두 시험이 잠금 자체를 센다.
  it("does not ask the proposal lock for rows that could never show its warning", async () => {
    const { settings, query } = await buildApprovedFixture(createTestRoot());

    await listPerformanceOverview(query, settings);

    const recorder = installStatementRecorder();

    recorder.reset();

    const overview = await listPerformanceOverview(query, settings);
    const executed = [...recorder.executed];

    expect(overview.rowCount).toBe(3);
    // 이 세 줄에는 품의 잠금 안내를 띄울 이유가 없다(승인 뒤에 미지급으로 바뀐 대체근무가 없다).
    expect(countStillPaidSinceApprovalAlertRows(overview)).toBe(0);
    // 그러니 잠금은 한 번도 묻지 말아야 한다. 남는 것은 목록이 시작할 때 한 번 모으는 조회뿐이다.
    // 안내를 결코 보여 줄 수 없는 줄까지 묻던 자리로 되돌리면 이 숫자가 줄 수만큼 커진다.
    expect(countLatestStatusReads(executed)).toBe(1);
  }, 300_000);

  it("asks the proposal lock once for a file, not once for every row that shows its warning", async () => {
    const { settings, query } = await buildTwoStillPaidSubstituteRowsFixture(createTestRoot());

    const recorder = installStatementRecorder();

    recorder.reset();

    const overview = await listPerformanceOverview(query, settings);
    const executed = [...recorder.executed];

    expect(overview.rowCount).toBe(4);
    // 안내가 붙은 줄이 둘이다 = 잠금을 물어야 하는 줄이 둘이다. 이 줄이 하나뿐이면 아래 숫자는
    // 잠금을 어디서 묻든 같아져서, 아무것도 고정하지 못한다.
    expect(countStillPaidSinceApprovalAlertRows(overview)).toBe(2);
    // 답은 파일마다 하나뿐이므로 조회도 파일마다 한 번이어야 한다. 목록이 모으는 한 번 + 잠금 한 번.
    // 줄마다 묻는 자리로 되돌리면 3이 된다.
    expect(countLatestStatusReads(executed)).toBe(2);
  }, 300_000);
});
