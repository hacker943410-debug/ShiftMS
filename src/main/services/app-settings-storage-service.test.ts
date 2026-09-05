import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  consumeEmployeeEligibilityReparseMarker,
  consumeSubstituteAllowancePolicyReparseMarker,
  markEmployeeEligibilityReparseRequired,
  getStoredAppSettingsSnapshot,
  saveStoredAppSettingEntry,
  saveStoredAppSettings
} from "./app-settings-storage-service";
import { initializeSqliteStorage, resetSqliteStorageForTest } from "./sqlite-storage-service";

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
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(false);

    saveStoredAppSettings(
      { ...baseInput, substituteAllowancePolicyEffectiveFrom: "2026-03-01" },
      context
    );

    // 표시는 한 번만 소비된다(다음 조회에서 또 다시 읽지 않도록).
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(true);
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(false);

    // 같은 값으로 다시 저장하면 표시를 남기지 않는다.
    saveStoredAppSettings(
      { ...baseInput, substituteAllowancePolicyEffectiveFrom: "2026-03-01" },
      context
    );
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(false);

    // 설정 항목을 직접 저장하는 경로에서도 같은 표시가 남는다.
    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-04-01");
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(true);

    // 변경후 우선 적용 시작일도 파싱 시점에 굳으므로 같은 표시를 남겨야 한다.
    saveStoredAppSettings(
      {
        ...baseInput,
        substituteAllowancePolicyEffectiveFrom: "2026-04-01",
        changedSlotPriorityEffectiveFrom: "2026-08-01"
      },
      context
    );
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(true);
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(false);

    saveStoredAppSettingEntry("changed_slot_priority_effective_from", "2026-09-01");
    expect(consumeSubstituteAllowancePolicyReparseMarker()).toBe(true);
  });

  it("leaves a one-shot marker when a hire or retire date changes, consumed by the next overview", () => {
    initializeSqliteStorage({ dbPath: path.resolve(process.cwd(), "artifacts", "tests", "settings-eligibility.test.sqlite") });

    expect(consumeEmployeeEligibilityReparseMarker()).toBe(false);

    markEmployeeEligibilityReparseRequired();

    expect(consumeEmployeeEligibilityReparseMarker()).toBe(true);
    expect(consumeEmployeeEligibilityReparseMarker()).toBe(false);
  });
});
