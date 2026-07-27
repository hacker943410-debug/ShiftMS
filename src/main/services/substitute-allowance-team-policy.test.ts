import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { saveStoredAppSettingEntry } from "./app-settings-storage-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { resetApprovedAllowanceCalculationStateForTest } from "./approved-allowance-calculation-service";
import { resetPerformanceApprovalStateForTest } from "./performance-approval-service";
import { resetPerformanceFileStorageForTest } from "./performance-file-storage-service";
import {
  prepareReturnedScheduleFixture,
  resetPreparedReturnedScheduleRoot,
  syncPreparedReturnedSchedule,
  testAdminSession
} from "./performance-test-helpers";
import { resetSqliteStorageForTest } from "./sqlite-storage-service";

// 대체근무수당 제외 정책(Pool·주간고정조) 검증.
// 픽스처는 B조(교대) 근무를 다른 조 사람이 대체한 행을 만들고, 그 사람의 조 근무유형만 바꿔 가며 확인한다.
const testRootBase = path.resolve(
  process.cwd(),
  "artifacts",
  "tests",
  "substitute-allowance-team-policy"
);
const allocatedTestRoots: string[] = [];

const createTestRoot = () => {
  const root = path.resolve(testRootBase, `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);

  allocatedTestRoots.push(root);
  return root;
};

const fixedDayTeamSettings = [
  { teamLabel: "A조", workType: "FIXED_DAY" as const },
  { teamLabel: "B조", workType: "ROTATING" as const },
  { teamLabel: "C조", workType: "ROTATING" as const },
  { teamLabel: "D조", workType: "ROTATING" as const }
];

const getSubstituteEntry = (entries: Array<{ section: string }>) =>
  entries.find((entry) => entry.section === "substitute");

describe("substitute allowance team policy", () => {
  afterEach(() => {
    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();
    allocatedTestRoots.splice(0).forEach((rootDir) => {
      resetPreparedReturnedScheduleRoot(rootDir);
    });
  });

  it("should exclude a day-fixed team substitute once the policy date is set", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "A조",
      teamSettings: fixedDayTeamSettings
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry).toBeDefined();
    expect(substituteEntry?.substituteWorkType).toBe("FIXED_DAY");
    expect(substituteEntry?.targetWorkType).toBe("ROTATING");
    expect(substituteEntry?.substituteAllowanceEligible).toBe(false);
    expect(substituteEntry?.substituteAllowanceReasonCode).toBe("FIXED_DAY_SUBSTITUTE_EXCLUDED");
    expect(substituteEntry?.substituteAllowancePolicyVersion).toBe("2026-07-team-work-type");
    expect(substituteEntry?.note).toContain("수당 미지급");

    const blocked = await approvePerformanceFile(
      { fileId: detail.id, entryId: substituteEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false ? blocked.message : "").toContain("주간고정조");
  }, 60_000);

  it("should keep paying a rotating team substitute", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "C조",
      teamSettings: fixedDayTeamSettings
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.substituteWorkType).toBe("ROTATING");
    expect(substituteEntry?.substituteAllowanceEligible).toBe(true);
    expect(substituteEntry?.substituteAllowanceReasonCode).toBe("ROTATING_SUBSTITUTE_ELIGIBLE");

    const approved = await approvePerformanceFile(
      { fileId: detail.id, entryId: substituteEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approved.ok).toBe(true);
  }, 60_000);

  it("should keep a day-fixed substitute payable while the policy date is not reached", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "A조",
      teamSettings: fixedDayTeamSettings
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-04-01");

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.substituteWorkType).toBe("FIXED_DAY");
    expect(substituteEntry?.substituteAllowanceEligible).toBe(true);
    expect(substituteEntry?.substituteAllowanceReasonCode).toBe("ROTATING_SUBSTITUTE_ELIGIBLE");
  }, 60_000);

  it("should keep the existing pool exclusion even without a policy date", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "Pool",
      teamSettings: fixedDayTeamSettings
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.isPoolWorker).toBe(true);
    expect(substituteEntry?.substituteWorkType).toBe("POOL");
    expect(substituteEntry?.substituteAllowanceEligible).toBe(false);
    expect(substituteEntry?.substituteAllowanceReasonCode).toBe("POOL_SUBSTITUTE_EXCLUDED");
  }, 60_000);
});
