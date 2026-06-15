import type {
  PerformanceApprovalRecord,
  PerformanceEntryRecord
} from "../../shared/domain/performance-file";
import { parsePerformanceApprovalSnapshot } from "./performance-approval-snapshot-service";

interface ResolvedEntryApprovalState {
  approvalStatus: "pending" | "approved";
  approvedEntry: PerformanceEntryRecord | null;
  latestApprovalAt?: string;
  latestApprovalByName?: string;
  needsReapproval: boolean;
  satisfied: boolean;
}

const normalizeText = (value?: string | null) => value?.trim() ?? "";

const normalizeAlerts = (alerts: PerformanceEntryRecord["alerts"]) =>
  alerts
    .map((alert) => `${alert.severity}:${alert.message.trim()}`)
    .sort((left, right) => left.localeCompare(right, "ko"));

const hasSourceSignature = (entry: PerformanceEntryRecord) =>
  normalizeText(entry.sourceSignature).length > 0;

// 근무표에서 파생되는 섹션(법정휴일·대체). 이 섹션의 기본/연장/야간 '분 배분'은 같은 원천(근무시간)에
// 계산식을 적용한 순수 파생값이라, 계산식이 바뀌면(예: 법정휴일 직접근무를 전부 기본근로로) 같은
// 원천에서 다른 배분이 나온다. 이는 원천이 바뀐 것이 아니므로, 서명이 없는 옛 승인분을 다시 승인
// 대상으로 되살려서는 안 된다 — 아래 폴백 비교에서 파생 배분은 제외하고 원천값(시간·총분 등)만 본다.
const SCHEDULE_DERIVED_SECTIONS = new Set<PerformanceEntryRecord["section"]>([
  "legal-holiday",
  "substitute"
]);

const toComparableEntry = (entry: PerformanceEntryRecord) => {
  const omitDerivedBreakdown = SCHEDULE_DERIVED_SECTIONS.has(entry.section);

  return {
    logicalKey: entry.logicalKey,
    employeeCode: normalizeText(entry.employeeCode),
    employeeName: normalizeText(entry.employeeName),
    workDate: entry.workDate,
    workType: entry.workType,
    section: entry.section,
    dutyCode: normalizeText(entry.dutyCode),
    startTime: normalizeText(entry.startTime),
    endTime: normalizeText(entry.endTime),
    breakMinutes: entry.breakMinutes,
    totalWorkMinutes: entry.totalWorkMinutes,
    baseWorkMinutes: omitDerivedBreakdown ? null : entry.baseWorkMinutes,
    overtimeMinutes: omitDerivedBreakdown ? null : entry.overtimeMinutes,
    nightMinutes: omitDerivedBreakdown ? null : entry.nightMinutes,
    reason: normalizeText(entry.reason),
    evidence: normalizeText(entry.evidence),
    hourlyRate: entry.hourlyRate ?? null,
    isPoolWorker: Boolean(entry.isPoolWorker),
    alerts: normalizeAlerts(entry.alerts)
  };
};

const toSourceSignatureComparableEntry = (entry: PerformanceEntryRecord) => ({
  logicalKey: entry.logicalKey,
  sourceSignature: normalizeText(entry.sourceSignature),
  employeeCode: normalizeText(entry.employeeCode),
  employeeName: normalizeText(entry.employeeName),
  workDate: entry.workDate,
  workType: entry.workType,
  section: entry.section,
  dutyCode: normalizeText(entry.dutyCode),
  reason: normalizeText(entry.reason),
  evidence: normalizeText(entry.evidence),
  hourlyRate: entry.hourlyRate ?? null,
  isPoolWorker: Boolean(entry.isPoolWorker)
});

export const arePerformanceEntriesEquivalent = (
  left: PerformanceEntryRecord,
  right: PerformanceEntryRecord
) => {
  // Any entry that carries a RAW source signature (legal-holiday / substitute / overtime) is
  // compared by that signature rather than by derived minutes. A parser/formula change that
  // re-derives different minutes from the SAME source keeps the signature equal (no reapproval),
  // while a real source edit changes the signature (reapproval). Entries without a signature
  // (legacy approvals before backfill) fall back to full field comparison.
  if (hasSourceSignature(left) && hasSourceSignature(right)) {
    return (
      JSON.stringify(toSourceSignatureComparableEntry(left)) ===
      JSON.stringify(toSourceSignatureComparableEntry(right))
    );
  }

  return JSON.stringify(toComparableEntry(left)) === JSON.stringify(toComparableEntry(right));
};

export const resolvePerformanceEntryApprovalState = (input: {
  entry: PerformanceEntryRecord;
  latestApproval: PerformanceApprovalRecord | null;
}): ResolvedEntryApprovalState => {
  if (!input.latestApproval || input.latestApproval.decision !== "approved") {
    return {
      approvalStatus: "pending",
      approvedEntry: null,
      needsReapproval: false,
      satisfied: false
    };
  }

  const approvedSnapshot = parsePerformanceApprovalSnapshot(input.latestApproval.snapshotJson);
  const approvedEntry = approvedSnapshot?.entry ?? null;
  const isEquivalent = approvedEntry
    ? arePerformanceEntriesEquivalent(approvedEntry, input.entry)
    : false;

  if (input.latestApproval.entryId === input.entry.id) {
    return {
      approvalStatus: "approved",
      approvedEntry,
      latestApprovalAt: input.latestApproval.processedAt,
      latestApprovalByName: input.latestApproval.processedByName,
      needsReapproval: approvedEntry ? !isEquivalent : true,
      satisfied: approvedEntry ? isEquivalent : false
    };
  }

  if (!approvedEntry) {
    return {
      approvalStatus: "approved",
      approvedEntry: null,
      latestApprovalAt: input.latestApproval.processedAt,
      latestApprovalByName: input.latestApproval.processedByName,
      needsReapproval: false,
      satisfied: false
    };
  }

  return {
    approvalStatus: "approved",
    approvedEntry,
    latestApprovalAt: input.latestApproval.processedAt,
    latestApprovalByName: input.latestApproval.processedByName,
    needsReapproval: !isEquivalent,
    satisfied: isEquivalent
  };
};
