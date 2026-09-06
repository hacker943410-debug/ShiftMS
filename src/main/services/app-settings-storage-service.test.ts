import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acknowledgeReparseMarker,
  getStoredAppSettingEntry,
  getStoredAppSettingsSnapshot,
  isReparseMonthCovered,
  markEmployeeMasterReparseRequired,
  peekReparseMarker,
  recordReparseMonth,
  saveStoredAppSettingEntry,
  saveStoredAppSettings
} from "./app-settings-storage-service";
import {
  getSqliteDatabase,
  initializeSqliteStorage,
  resetSqliteStorageForTest
} from "./sqlite-storage-service";

// Reads the marker the way a full-period overview does: peek, then acknowledge the token read.
const spendSubstituteMarker = () => {
  const token = peekReparseMarker("substitute-policy");

  if (token) {
    acknowledgeReparseMarker("substitute-policy", token);
  }

  return Boolean(token);
};

const testRoot = path.resolve(process.cwd(), "artifacts", "tests", "app-settings-storage");
const dbPath = path.resolve(testRoot, "app-settings-storage.test.sqlite");
const userDataPath = path.resolve(testRoot, "user-data");

describe("app-settings-storage-service", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should persist resolved directory settings in sqlite and create the directories", () => {
    initializeSqliteStorage({ dbPath });

    const saved = saveStoredAppSettings(
      {
        holidayApiBaseUrl: "https://example.com/holidays",
        pendingDir: "./runtime/pending-custom",
        approvedDir: "./runtime/approved-custom",
        scheduleExportDir: "./runtime/schedule-exports",
        allowanceProposalExportDir: "./runtime/allowance/proposal",
        allowanceAttachment1ExportDir: "./runtime/allowance/attachment1",
        allowanceAttachment2ExportDir: "./runtime/allowance/attachment2",
        databaseBackupDir: "./runtime/backups",
        databaseBackupSchedule: "weekly",
        databaseBackupTime: "03:15",
        migrationFilePath: "./backup/access.accdb",
        scheduleConsecutiveNightLimit: 4,
        scheduleMinimumRestMinutes: 720,
        scheduleRequireWeeklyHoliday: false,
        scheduleWeeklyMaxMinutes: 3000
      },
      {
        userDataPath,
        env: {
          DATA_DIR: "./data-root"
        }
      }
    );

    expect(saved.holidayApiBaseUrl).toBe("https://example.com/holidays");
    expect(saved.pendingDir).toBe(path.resolve(saved.dataDir, "./runtime/pending-custom"));
    expect(saved.approvedDir).toBe(path.resolve(saved.dataDir, "./runtime/approved-custom"));
    expect(saved.scheduleExportDir).toBe(
      path.resolve(saved.dataDir, "./runtime/schedule-exports")
    );
    expect(saved.allowanceProposalExportDir).toBe(
      path.resolve(saved.dataDir, "./runtime/allowance/proposal")
    );
    expect(saved.allowanceAttachment1ExportDir).toBe(
      path.resolve(saved.dataDir, "./runtime/allowance/attachment1")
    );
    expect(saved.allowanceAttachment2ExportDir).toBe(
      path.resolve(saved.dataDir, "./runtime/allowance/attachment2")
    );
    expect(saved.databaseBackupDir).toBe(path.resolve(saved.dataDir, "./runtime/backups"));
    expect(saved.databaseBackupSchedule).toBe("weekly");
    expect(saved.databaseBackupTime).toBe("03:15");
    expect(saved.migrationFilePath).toBe("./backup/access.accdb");
    expect(saved.scheduleConsecutiveNightLimit).toBe(4);
    expect(saved.scheduleMinimumRestMinutes).toBe(720);
    expect(saved.scheduleRequireWeeklyHoliday).toBe(false);
    expect(saved.scheduleWeeklyMaxMinutes).toBe(3000);
    expect(existsSync(saved.pendingDir)).toBe(true);
    expect(existsSync(saved.approvedDir)).toBe(true);
    expect(existsSync(saved.scheduleExportDir)).toBe(true);
    expect(existsSync(saved.allowanceProposalExportDir)).toBe(true);
    expect(existsSync(saved.allowanceAttachment1ExportDir)).toBe(true);
    expect(existsSync(saved.allowanceAttachment2ExportDir)).toBe(true);
    expect(existsSync(saved.databaseBackupDir)).toBe(true);

    expect(
      getStoredAppSettingsSnapshot({
        userDataPath,
        env: {
          DATA_DIR: "./data-root"
        }
      })
    ).toEqual(saved);
  });

  it("should reject using the same path for pending and approved directories", () => {
    initializeSqliteStorage({ dbPath });

    expect(() =>
      saveStoredAppSettings(
        {
          holidayApiBaseUrl: "https://example.com/holidays",
          pendingDir: "./runtime/shared",
          approvedDir: "./runtime/shared",
          scheduleExportDir: "./runtime/schedule-exports",
          allowanceProposalExportDir: "./runtime/allowance/proposal",
          allowanceAttachment1ExportDir: "./runtime/allowance/attachment1",
          allowanceAttachment2ExportDir: "./runtime/allowance/attachment2",
          databaseBackupDir: "./runtime/backups",
          databaseBackupSchedule: "daily",
          databaseBackupTime: "02:00",
          migrationFilePath: "",
          scheduleConsecutiveNightLimit: 3,
          scheduleMinimumRestMinutes: 660,
          scheduleRequireWeeklyHoliday: true,
          scheduleWeeklyMaxMinutes: 3120
        },
        {
          userDataPath,
          env: {
            DATA_DIR: "./data-root"
          }
        }
      )
    ).toThrow("승인 대기 폴더와 승인 완료 폴더는 서로 달라야 합니다.");
  });

  // 정책 시작일이 바뀌면 이미 읽어 둔 대기 파일을 한 번 다시 읽어야 하므로 표시가 남아야 한다.
  it("should flag a reparse once the substitute allowance policy date changes", () => {
    initializeSqliteStorage({ dbPath });

    const baseInput = {
      holidayApiBaseUrl: "https://example.com/holidays",
      pendingDir: "./runtime/pending-policy",
      approvedDir: "./runtime/approved-policy",
      scheduleExportDir: "./runtime/schedule-exports",
      allowanceProposalExportDir: "./runtime/allowance/proposal",
      allowanceAttachment1ExportDir: "./runtime/allowance/attachment1",
      allowanceAttachment2ExportDir: "./runtime/allowance/attachment2",
      databaseBackupDir: "./runtime/backups",
      databaseBackupSchedule: "daily" as const,
      databaseBackupTime: "02:00",
      migrationFilePath: "",
      scheduleConsecutiveNightLimit: 3,
      scheduleMinimumRestMinutes: 660,
      scheduleRequireWeeklyHoliday: true,
      scheduleWeeklyMaxMinutes: 3120
    };
    const context = { userDataPath, env: { DATA_DIR: "./data-root" } };

    saveStoredAppSettings(baseInput, context);
    expect(spendSubstituteMarker()).toBe(false);

    saveStoredAppSettings(
      { ...baseInput, substituteAllowancePolicyEffectiveFrom: "2026-03-01" },
      context
    );

    // 표시는 한 번만 소비된다(다음 조회에서 또 다시 읽지 않도록).
    expect(spendSubstituteMarker()).toBe(true);
    expect(spendSubstituteMarker()).toBe(false);

    // 같은 값으로 다시 저장하면 표시를 남기지 않는다.
    saveStoredAppSettings(
      { ...baseInput, substituteAllowancePolicyEffectiveFrom: "2026-03-01" },
      context
    );
    expect(spendSubstituteMarker()).toBe(false);

    // 설정 항목을 직접 저장하는 경로에서도 같은 표시가 남는다.
    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-04-01");
    expect(spendSubstituteMarker()).toBe(true);

    // 변경후 우선 적용 시작일도 파싱 시점에 굳으므로 같은 표시를 남겨야 한다.
    saveStoredAppSettings(
      {
        ...baseInput,
        substituteAllowancePolicyEffectiveFrom: "2026-04-01",
        changedSlotPriorityEffectiveFrom: "2026-08-01"
      },
      context
    );
    expect(spendSubstituteMarker()).toBe(true);
    expect(spendSubstituteMarker()).toBe(false);

    saveStoredAppSettingEntry("changed_slot_priority_effective_from", "2026-09-01");
    expect(spendSubstituteMarker()).toBe(true);
  });

  // R10 #5: the marker is a token. Peeking does not spend it, and only the token that was read
  // removes it - so a change made while the re-read runs leaves a marker that survives the
  // acknowledgement of the earlier one.
  it("keeps a marker left during the re-read when only the earlier token is acknowledged", () => {
    initializeSqliteStorage({ dbPath: path.resolve(process.cwd(), "artifacts", "tests", "settings-eligibility.test.sqlite") });

    expect(peekReparseMarker("employee-master")).toBeNull();

    markEmployeeMasterReparseRequired();

    const first = peekReparseMarker("employee-master");

    expect(first).not.toBeNull();
    expect(peekReparseMarker("employee-master")).toBe(first);

    markEmployeeMasterReparseRequired();

    const second = peekReparseMarker("employee-master");

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);

    acknowledgeReparseMarker("employee-master", first!);
    expect(peekReparseMarker("employee-master")).toBe(second);

    acknowledgeReparseMarker("employee-master", second!);
    expect(peekReparseMarker("employee-master")).toBeNull();
  });

  // R11 self-check: a month-scoped overview cannot spend the marker (it read one month only). It
  // records the month under the token; a new token starts the record over; the acknowledgement of
  // a token drops its own record and leaves a newer one alone.
  it("records the months re-read under a token, starts over on a new token, and drops the record with it", () => {
    initializeSqliteStorage({ dbPath: path.resolve(process.cwd(), "artifacts", "tests", "settings-eligibility.test.sqlite") });

    expect(isReparseMonthCovered("employee-master", "no-such-token", "2026-03")).toBe(false);

    markEmployeeMasterReparseRequired();

    const first = peekReparseMarker("employee-master")!;

    recordReparseMonth("employee-master", first, "2026-03");
    expect(isReparseMonthCovered("employee-master", first, "2026-03")).toBe(true);
    expect(isReparseMonthCovered("employee-master", first, "2026-04")).toBe(false);

    recordReparseMonth("employee-master", first, "2026-04");
    recordReparseMonth("employee-master", first, "2026-04");
    expect(isReparseMonthCovered("employee-master", first, "2026-03")).toBe(true);
    expect(isReparseMonthCovered("employee-master", first, "2026-04")).toBe(true);
    // The other marker keeps its own record.
    expect(isReparseMonthCovered("substitute-policy", first, "2026-03")).toBe(false);

    markEmployeeMasterReparseRequired();

    const second = peekReparseMarker("employee-master")!;

    // A new change: every month is stale again, and the old record does not vouch for it.
    expect(isReparseMonthCovered("employee-master", second, "2026-03")).toBe(false);

    recordReparseMonth("employee-master", second, "2026-05");
    expect(isReparseMonthCovered("employee-master", second, "2026-05")).toBe(true);
    expect(isReparseMonthCovered("employee-master", first, "2026-03")).toBe(false);

    // Acknowledging the earlier token touches neither the marker nor the newer record.
    acknowledgeReparseMarker("employee-master", first);
    expect(peekReparseMarker("employee-master")).toBe(second);
    expect(isReparseMonthCovered("employee-master", second, "2026-05")).toBe(true);

    acknowledgeReparseMarker("employee-master", second);
    expect(peekReparseMarker("employee-master")).toBeNull();
    expect(isReparseMonthCovered("employee-master", second, "2026-05")).toBe(false);
  });
});

// F5: 설정 값과 재분석 표식은 함께 남거나 함께 없던 일이 돼야 한다. 표식만 빠지면 이미 읽어 둔
// 승인대기 파일이 옛 정책 시작일로 계산된 채 남는다.
describe("app-settings-storage-service · settings and reparse marker save together", () => {
  afterEach(() => {
    resetSqliteStorageForTest();
    rmSync(testRoot, { recursive: true, force: true });
  });

  const context = { userDataPath, env: { DATA_DIR: "./data-root" } };
  const baseInput = {
    holidayApiBaseUrl: "https://example.com/holidays",
    pendingDir: "./runtime/pending-atomic",
    approvedDir: "./runtime/approved-atomic",
    scheduleExportDir: "./runtime/schedule-exports",
    allowanceProposalExportDir: "./runtime/allowance/proposal",
    allowanceAttachment1ExportDir: "./runtime/allowance/attachment1",
    allowanceAttachment2ExportDir: "./runtime/allowance/attachment2",
    databaseBackupDir: "./runtime/backups",
    databaseBackupSchedule: "daily" as const,
    databaseBackupTime: "02:00",
    migrationFilePath: "",
    scheduleConsecutiveNightLimit: 3,
    scheduleMinimumRestMinutes: 660,
    scheduleRequireWeeklyHoliday: true,
    scheduleWeeklyMaxMinutes: 3120
  };
  const createFailingMarkerTrigger = () =>
    "CREATE TRIGGER fail_policy_marker_for_test BEFORE INSERT ON app_setting_entries WHEN NEW.setting_key = 'substitute_allowance_policy_reparse_marker' BEGIN SELECT RAISE(ABORT, 'marker failed for test'); END;";

  it("keeps a policy start date as it was when its reparse marker cannot be left", () => {
    initializeSqliteStorage({ dbPath });

    const database = getSqliteDatabase()!;

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-01-01");
    expect(spendSubstituteMarker()).toBe(true);

    database.exec(createFailingMarkerTrigger());

    try {
      expect(() =>
        saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01")
      ).toThrowError("marker failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_policy_marker_for_test");
    }

    expect(getStoredAppSettingEntry("substitute_allowance_policy_effective_from")).toBe(
      "2026-01-01"
    );
    expect(peekReparseMarker("substitute-policy")).toBeNull();
    expect(database.isTransaction).toBe(false);

    // 다시 저장하면 값과 표식이 함께 남는다.
    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");
    expect(getStoredAppSettingEntry("substitute_allowance_policy_effective_from")).toBe(
      "2026-03-01"
    );
    expect(spendSubstituteMarker()).toBe(true);
  });

  it("rolls every setting back when the reparse marker cannot be left", () => {
    initializeSqliteStorage({ dbPath });

    const database = getSqliteDatabase()!;
    const saved = saveStoredAppSettings(baseInput, context);

    expect(spendSubstituteMarker()).toBe(false);

    database.exec(createFailingMarkerTrigger());

    try {
      expect(() =>
        saveStoredAppSettings(
          {
            ...baseInput,
            holidayApiBaseUrl: "https://example.com/holidays-changed",
            scheduleExportDir: "./runtime/schedule-exports-changed",
            changedSlotPriorityEffectiveFrom: "2026-08-01"
          },
          context
        )
      ).toThrowError("marker failed for test");
    } finally {
      database.exec("DROP TRIGGER fail_policy_marker_for_test");
    }

    // 폴더 경로를 비롯한 열일곱 개 설정이 전부 이전 값이어야 한다.
    expect(getStoredAppSettingsSnapshot(context)).toEqual(saved);
    expect(peekReparseMarker("substitute-policy")).toBeNull();
    expect(database.isTransaction).toBe(false);
  });

  it("rejects the same pending and approved folder before it changes any setting", () => {
    initializeSqliteStorage({ dbPath });

    const database = getSqliteDatabase()!;
    const saved = saveStoredAppSettings(baseInput, context);

    expect(() =>
      saveStoredAppSettings(
        {
          ...baseInput,
          holidayApiBaseUrl: "https://example.com/holidays-changed",
          pendingDir: "./runtime/shared-folder",
          approvedDir: "./runtime/shared-folder"
        },
        context
      )
    ).toThrowError("승인 대기 폴더와 승인 완료 폴더는 서로 달라야 합니다.");

    expect(getStoredAppSettingsSnapshot(context)).toEqual(saved);
    expect(database.isTransaction).toBe(false);
  });
});
