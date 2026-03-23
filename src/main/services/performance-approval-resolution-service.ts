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

const toComparableEntry = (entry: PerformanceEntryRecord) => ({
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
  baseWorkMinutes: entry.baseWorkMinutes,
  overtimeMinutes: entry.overtimeMinutes,
  nightMinutes: entry.nightMinutes,
  reason: normalizeText(entry.reason),
  evidence: normalizeText(entry.evidence),
  hourlyRate: entry.hourlyRate ?? null,
  note: normalizeText(entry.note),
  isPoolWorker: Boolean(entry.isPoolWorker),
  alerts: normalizeAlerts(entry.alerts)
});

export const arePerformanceEntriesEquivalent = (
  left: PerformanceEntryRecord,
  right: PerformanceEntryRecord
) => JSON.stringify(toComparableEntry(left)) === JSON.stringify(toComparableEntry(right));

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
      needsReapproval: approvedEntry ? !isEquivalent : false,
      satisfied: approvedEntry ? isEquivalent : true
    };
  }

  if (!approvedEntry) {
    return {
      approvalStatus: "approved",
      approvedEntry: null,
      latestApprovalAt: input.latestApproval.processedAt,
      latestApprovalByName: input.latestApproval.processedByName,
      needsReapproval: true,
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
