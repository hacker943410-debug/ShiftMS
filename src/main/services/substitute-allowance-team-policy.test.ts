import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import { saveStoredAppSettingEntry } from "./app-settings-storage-service";
import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { listStoredEmployees } from "./employee-storage-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { listPerformanceOverview } from "./performance-management-service";
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

const getSubstituteEntry = (entries: PerformanceEntryRecord[]) =>
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

  // 파일을 먼저 읽어 둔 뒤에 정책 시작일을 켜면, 옛 판정이 그대로 남아 승인될 수 있었다.
  // 설정이 바뀌면 다음 실적 조회에서 대기 파일을 다시 읽어 판정을 새 기준으로 맞춘다.
  it("should re-judge already parsed pending files after the policy date is set", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "A조",
      teamSettings: fixedDayTeamSettings
    });

    // 1) 정책 시작일이 없는 상태에서 먼저 읽는다 → 기존 규칙대로 지급 판정.
    const detail = await syncPreparedReturnedSchedule(fixture);
    const parsedBefore = getSubstituteEntry(detail.entries);

    expect(parsedBefore?.substituteWorkType).toBe("FIXED_DAY");
    expect(parsedBefore?.substituteAllowanceEligible).toBe(true);

    // 2) 운영 관리에서 정책 시작일을 설정한다.
    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    // 3) 실적 화면을 열면(새로고침을 누르지 않아도) 판정이 새 기준으로 바뀐다.
    const overview = await listPerformanceOverview(
      { approvalScope: "pending", section: "all", scheduleMonth: "2026-03" },
      { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir }
    );
    const reparsed = overview.groups
      .flatMap((group) => group.rows)
      .map((row) => row.entry)
      .find((entry) => entry.section === "substitute");

    expect(reparsed?.substituteAllowanceEligible).toBe(false);
    expect(reparsed?.substituteAllowanceReasonCode).toBe("FIXED_DAY_SUBSTITUTE_EXCLUDED");
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

  it("should treat the covered shift as the substitute's own duty only when the duty code matches", async () => {
    const sameDutyFixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "C조",
      teamSettings: fixedDayTeamSettings,
      substituteReplacementOwnDutyCode: "E"
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const sameDutyDetail = await syncPreparedReturnedSchedule(sameDutyFixture);
    const sameDutyEntry = getSubstituteEntry(sameDutyDetail.entries);

    // 대체한 근무(E)를 원래 자기 근무로 하고 있었으므로 추가근무가 아니다.
    expect(sameDutyEntry?.substituteAllowanceEligible).toBe(false);
    expect(sameDutyEntry?.substituteAllowanceReasonCode).toBe("NOT_ADDITIONAL_WORK");

    resetPerformanceApprovalStateForTest();
    resetApprovedAllowanceCalculationStateForTest();
    resetPerformanceFileStorageForTest();
    resetSqliteStorageForTest();

    const otherDutyFixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "C조",
      teamSettings: fixedDayTeamSettings,
      substituteReplacementOwnDutyCode: "D"
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const otherDutyDetail = await syncPreparedReturnedSchedule(otherDutyFixture);
    const otherDutyEntry = getSubstituteEntry(otherDutyDetail.entries);

    // 자기 주간근무를 하고 추가로 다른 근무를 대체한 경우는 그대로 지급 대상이다.
    expect(otherDutyEntry?.substituteAllowanceEligible).toBe(true);
    expect(otherDutyEntry?.substituteAllowanceReasonCode).toBe("ROTATING_SUBSTITUTE_ELIGIBLE");
  }, 90_000);

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
  // G10: 조를 옮긴 사람의 옛 조 시절 대체근무는 지급 대상으로 남아야 하고, 승인까지 통과해야
  // 한다. Pool 로 옮겼다는 이유만으로 과거 행이 미지급으로 뒤집히면 되돌릴 방법이 없다.
  it("should still approve a past substitute row after the person later moves into Pool", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "C조",
      teamSettings: fixedDayTeamSettings
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const employee = listStoredEmployees().find(
      (item) => item.employeeCode === fixture.workers.substituteReplacement.employeeCode
    );

    if (!employee?.currentSiteId) {
      throw new Error("테스트 직원을 찾지 못했습니다.");
    }

    // 근무지 설정 2단계(조직 구성)에서 시작일을 넣어 Pool 로 옮긴 경로. 대체근무는 2026-03-02.
    saveStoredEmployeeAssignment({
      employeeId: employee.id,
      siteId: employee.currentSiteId,
      shiftGroup: "Pool",
      startDate: "2026-09-01"
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.isPoolWorker).toBe(false);
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
});
