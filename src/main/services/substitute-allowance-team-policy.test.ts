import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import { saveStoredAppSettingEntry } from "./app-settings-storage-service";
import { saveStoredEmployeeAssignment } from "./employee-history-service";
import { listStoredEmployees } from "./employee-storage-service";
import { reviewAllowanceCalculations } from "./allowance-approval-service";
import { approvePerformanceFile } from "./performance-approval-flow-service";
import { listPerformanceOverview } from "./performance-management-service";
import {
  listApprovedAllowanceCalculationResults,
  resetApprovedAllowanceCalculationStateForTest
} from "./approved-allowance-calculation-service";
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

  it("should not tell the operator an already approved substitute is unpaid when it is still being paid", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "A조",
      teamSettings: fixedDayTeamSettings
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.substituteAllowanceEligible).toBe(true);

    const approval = await approvePerformanceFile(
      { fileId: detail.id, entryId: substituteEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approval.ok).toBe(true);

    // 운영자가 "이 조는 대체수당 안 준다"로 규칙을 바꾼다. 수당 관리는 승인 당시 스냅샷으로
    // 판정하므로 이미 승인된 이 행의 금액은 계속 지급되고 품의서에도 실린다.
    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const overview = await listPerformanceOverview(
      { approvalScope: "pending", section: "all", scheduleMonth: "2026-03" },
      { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir }
    );
    const row = overview.groups
      .flatMap((group) => group.rows)
      .find((item) => item.entry.section === "substitute");

    // 다시 읽은 값으로 판정하면 이 행이 "수당 미지급"으로 보인다. 돈은 나가는데 화면은 안 나간다고
    // 말하는 셈이라, 운영자는 손쓸 것이 없다고 믿게 된다.
    expect(row?.approvalStatus).toBe("approved");
    expect(row?.approvalStatus).not.toBe("non-payable");

    // 대신 규칙이 바뀌었다는 것과 멈추는 방법을 알린다. 표시 전용이라 승인은 막지 않는다.
    const notice = row?.entry.alerts.find((alert) =>
      alert.message.includes("이미 승인된 수당은 그대로 지급됩니다")
    );

    expect(notice?.severity).toBe("warning");
    // 이 파일은 아직 승인대기다. "승인대기로 되돌리기"도 "근무지 반려"도 승인완료 파일에만 열려
    // 있어서, 되돌리기를 시키는 문구를 그대로 붙이면 눌러도 막히는 조치를 안내하게 된다.
    expect(notice?.message).toContain("이 파일은 아직 승인대기라 되돌리기를 쓸 수 없습니다");
    expect(row?.canApprove).toBe(false);
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

  it("should still call an approved substitute unpaid once its own facts change, matching what approving now refuses", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "C조",
      teamSettings: fixedDayTeamSettings
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.substituteAllowanceEligible).toBe(true);

    const approved = await approvePerformanceFile(
      { fileId: detail.id, entryId: substituteEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approved.ok).toBe(true);

    const employee = listStoredEmployees().find(
      (item) => item.employeeCode === fixture.workers.substituteReplacement.employeeCode
    );

    if (!employee?.currentSiteId) {
      throw new Error("테스트 직원을 찾지 못했습니다.");
    }

    // 승인 뒤에 배정 이력이 소급 정정돼 근무일(2026-03-02)이 Pool 로 다시 판정된다. 정책만 바뀐
    // 경우와 다르다 - 행의 원천값이 달라져 승인 동등성 비교가 재검토를 건다.
    saveStoredEmployeeAssignment({
      employeeId: employee.id,
      siteId: employee.currentSiteId,
      shiftGroup: "Pool",
      startDate: "2026-02-01"
    });

    const overview = await listPerformanceOverview(
      { approvalScope: "pending", section: "all", scheduleMonth: "2026-03" },
      { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir }
    );
    const row = overview.groups
      .flatMap((group) => group.rows)
      .find((item) => item.entry.section === "substitute");

    // 승인 관문은 이 행을 여전히 "Pool은 … 지급 대상이 아닙니다"로 막는다. 화면이 "재검토만 하면
    // 된다"고 말하면 운영자는 눌러 보고 이유 없이 막힌다 - 스냅샷 판정을 여기까지 넓히면 안 된다.
    expect(row?.approvalStatus).toBe("non-payable");
    expect(row?.needsReapproval).toBe(false);

    const retry = await approvePerformanceFile(
      { fileId: detail.id, entryId: substituteEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(retry.ok).toBe(false);
  }, 60_000);

  it("should keep an archived substitute row judged by its approval even after its own facts change", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "C조",
      teamSettings: fixedDayTeamSettings
    });

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.substituteAllowanceEligible).toBe(true);

    // 파일 전체를 승인해 승인완료로 보관한다. 보관된 뒤에는 이 화면에서 다시 승인할 길이 없다.
    for (const entry of detail.entries) {
      const result = await approvePerformanceFile(
        { fileId: detail.id, entryId: entry.id },
        testAdminSession,
        { userDataPath: fixture.userDataPath }
      );

      expect(result.ok).toBe(true);
    }

    const employee = listStoredEmployees().find(
      (item) => item.employeeCode === fixture.workers.substituteReplacement.employeeCode
    );

    if (!employee?.currentSiteId) {
      throw new Error("테스트 직원을 찾지 못했습니다.");
    }

    // 보관된 뒤에 배정 이력이 소급 정정돼 근무일이 Pool 로 다시 판정된다.
    saveStoredEmployeeAssignment({
      employeeId: employee.id,
      siteId: employee.currentSiteId,
      shiftGroup: "Pool",
      startDate: "2026-02-01"
    });

    const overview = await listPerformanceOverview(
      {
        approvalScope: "approved",
        section: "all",
        scheduleMonth: "2026-03",
        forceReparse: true
      },
      { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir }
    );
    const row = overview.groups
      .flatMap((group) => group.rows)
      .find((item) => item.entry.section === "substitute");

    // 승인대기 행과 달리, 보관본은 다시 승인할 관문이 없어서 원천이 달라져도 돈은 승인 당시
    // 스냅샷대로 계속 나간다. 화면만 "수당 미지급"으로 돌려놓으면 돈의 방향을 반대로 말한다.
    expect(row?.approvalStatus).not.toBe("non-payable");

    const notice = row?.entry.alerts.find((alert) =>
      alert.message.includes("이미 승인된 수당은 그대로 지급됩니다")
    );

    expect(notice?.severity).toBe("warning");
    expect(notice?.message).toContain("\"승인대기로 되돌리기\" 한 뒤 다시 승인하세요");
  }, 60_000);

  it("should not promise continued payment for a substitute whose allowance was rejected", async () => {
    const fixture = await prepareReturnedScheduleFixture({
      rootDir: createTestRoot(),
      templateVariant: "sample1",
      substituteReplacementShiftGroup: "A조",
      teamSettings: fixedDayTeamSettings
    });

    const detail = await syncPreparedReturnedSchedule(fixture);
    const substituteEntry = getSubstituteEntry(detail.entries);

    expect(substituteEntry?.substituteAllowanceEligible).toBe(true);

    const approval = await approvePerformanceFile(
      { fileId: detail.id, entryId: substituteEntry!.id },
      testAdminSession,
      { userDataPath: fixture.userDataPath }
    );

    expect(approval.ok).toBe(true);

    const calculations = listApprovedAllowanceCalculationResults();

    expect(calculations.length).toBeGreaterThan(0);

    const rejected = await reviewAllowanceCalculations(
      { calculationIds: calculations.map((record) => record.id), decision: "rejected" },
      testAdminSession
    );

    expect(rejected.ok).toBe(true);

    saveStoredAppSettingEntry("substitute_allowance_policy_effective_from", "2026-03-01");

    const overview = await listPerformanceOverview(
      { approvalScope: "pending", section: "all", scheduleMonth: "2026-03" },
      { pendingDir: fixture.pendingDir, approvedDir: fixture.approvedDir }
    );
    const row = overview.groups
      .flatMap((group) => group.rows)
      .find((item) => item.entry.section === "substitute");

    // 반려된 계산은 돈이 나가지 않는다(문서 출력·품의 대상에서도 빠진다). "그대로 지급됩니다"는
    // 실제 지급 관문과 반대되는 말이다.
    expect(row?.approvalStatus).toBe("rejected");
    expect(
      row?.entry.alerts.some((alert) =>
        alert.message.includes("이미 승인된 수당은 그대로 지급됩니다")
      )
    ).toBe(false);
  }, 60_000);
});
