import type {
  PerformanceAlert,
  PerformanceAlertReasonCode,
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

const WAGE_DERIVED_REASON_CODES = new Set<PerformanceAlertReasonCode>([
  "wage-missing-effective-rate",
  "wage-missing-history"
]);

// Alerts that exist ONLY because of the wage lookup, and disappear the moment a wage covers the
// work date. Two sources have to be read: a freshly parsed row carries the reason code, while an
// alert restored from an approval snapshot - or from the entry store - kept only severity and
// message (both parsers drop unknown fields), so old rows can be classified by message alone.
//
// The message keys are deliberately NARROW: they match the two sentences the parser actually
// writes for a missing wage and nothing else. The keyword filter in
// performance-approval-flow-service (isHourlyRateAlert, used when the operator types a wage in by
// hand) may stay loose - over-matching there only clears one more alert on a row whose wage a
// person just took responsibility for. Over-matching HERE is expensive: an approval that ought to
// have gone back to review would silently stand. The asymmetry is the point; keep this set a
// subset of that one rather than merging the two.
const WAGE_DERIVED_MESSAGE_KEYS = ["적용시급을찾지못했", "시급이력이없"];

export const isWageDerivedAlert = (alert: PerformanceAlert) => {
  if (alert.reasonCode && WAGE_DERIVED_REASON_CODES.has(alert.reasonCode)) {
    return true;
  }

  const normalizedMessage = alert.message.replace(/\s+/g, "");

  return WAGE_DERIVED_MESSAGE_KEYS.some((key) => normalizedMessage.includes(key));
};

// An error alert that is not wage-derived blocks approval (validateApprovalEntry), so a row can only
// carry one after it was already approved - the T-22 case, where the operator moved the hire or
// retire date and the work now falls outside the employment period. A row without a source
// signature already refuses to settle then, because the legacy comparison below reads the alert
// list; a row that carries one would otherwise skip the question entirely. The finalize gate and
// the overview both read this, so the screen and the server never disagree about a blocked file.
export const hasBlockingNonWageAlert = (entry: PerformanceEntryRecord) =>
  entry.alerts.some((alert) => alert.severity === "error" && !isWageDerivedAlert(alert));

// Severity and message only. The reason code stays out: an approval snapshot never carries one
// (its parser keeps two fields), so comparing it would make every legacy approved row differ from
// its freshly parsed self and send the whole database back to review.
const normalizeAlerts = (alerts: PerformanceEntryRecord["alerts"]) =>
  alerts
    .filter((alert) => !isWageDerivedAlert(alert))
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

// The wage is deliberately NOT part of either comparison. An approval is a snapshot: the amount
// it paid is fixed, and a wage corrected afterwards must not flip every approved row of a partly
// approved file back to review on the next refresh (T-2). Paying an approved row at the new wage
// is a decision the operator takes per file, by returning it to 승인대기 and refreshing.
// The alerts the wage lookup produces leave the comparison for the same reason and are exactly
// the set the manual wage override erases: closing a wage line raises "적용 시급을 찾지 못했습니다"
// on a row whose source workbook never moved, and that alone used to send an old approval without
// a source signature back to review. Only wage-derived alerts are dropped - a newly raised
// employment-period error (T-22), a missing schedule reference or any other parser alert still
// counts as a change, which is why isWageDerivedAlert above is narrow.
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
    isPoolWorker: Boolean(entry.isPoolWorker),
    alerts: normalizeAlerts(entry.alerts)
  };
};

// A raw source signature is `returned-schedule-source:v1:<section>:<json>` (see
// schedule-return-performance-parser createEntrySourceSignature). Its json payload embeds the
// monthly schedule rows the entry was derived from, and those rows carry DISPLAY-ONLY and
// EMPLOYEE-MASTER-DERIVED fields (employeeCode, employeeName, sortOrder, teamLabel) next to the
// fields that actually decide the minutes (workDate, dutyCode, startTime, endTime, breakMinutes).
// Reordering team members, renaming a team, or letting the live employee JOIN return a different
// code therefore rewrote the signature of an untouched workbook and flipped approved
// legal-holiday / substitute rows back to review.
//
// The stored signature string is NEVER rewritten - backfilling approval snapshots would change
// every stored signature at once and cause the exact mass reapproval this guards against.
// Instead both sides are reduced at COMPARISON time only: the reduction is a pure function of the
// string, so two strings that were equal before stay equal, and the comparison only ever gets more
// permissive. A prefix that does not match, or a payload that does not parse, is returned
// unchanged (legacy approvals and arbitrary test signatures stay byte-compared).
const SOURCE_SIGNATURE_PREFIX_PATTERN = /^returned-schedule-source:v1:([a-z-]+):/;

// Never split on ":" - the payload holds times such as "08:00".
const SIGNATURE_SCHEDULE_ITEM_KEYS = [
  "scheduleItem",
  "dutyScheduleItem",
  "directScheduleItem",
  "slotScheduleItem"
] as const;

const DISPLAY_DERIVED_SCHEDULE_ITEM_KEYS = ["employeeCode", "employeeName", "sortOrder"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const reduceSourceSignatureForComparison = (rawSignature: string) => {
  const prefixMatch = SOURCE_SIGNATURE_PREFIX_PATTERN.exec(rawSignature);

  if (!prefixMatch) {
    return rawSignature;
  }

  const prefix = prefixMatch[0];
  const section = prefixMatch[1];

  let payload: unknown;

  try {
    payload = JSON.parse(rawSignature.slice(prefix.length));
  } catch {
    return rawSignature;
  }

  if (!isPlainObject(payload)) {
    return rawSignature;
  }

  for (const itemKey of SIGNATURE_SCHEDULE_ITEM_KEYS) {
    const scheduleItem = payload[itemKey];

    // Whether the schedule row was FOUND (object) or not (null) stays in the comparison: a row
    // that disappears from the schedule is a real change and must still require reapproval.
    if (!isPlainObject(scheduleItem)) {
      continue;
    }

    for (const field of DISPLAY_DERIVED_SCHEDULE_ITEM_KEYS) {
      delete scheduleItem[field];
    }

    // teamLabel is display-only for legal-holiday rows, but on a substitute row it decides the
    // target work type and with it whether the substitute allowance is payable at all - keep it.
    if (section !== "substitute") {
      delete scheduleItem.teamLabel;
    }
  }

  return `${prefix}${JSON.stringify(payload)}`;
};

// employeeCode is an employee-master JOIN result, not a workbook cell, and it is absent from
// logicalKey, so it adds nothing to the identity here while a master edit alone could flip a row.
// employeeName stays: it IS the workbook cell. isPoolWorker only decides payment on a substitute
// row; on every other section it is a live employment-type readout that must not flip an approval.
const toSourceSignatureComparableEntry = (entry: PerformanceEntryRecord) => ({
  logicalKey: entry.logicalKey,
  sourceSignature: reduceSourceSignatureForComparison(normalizeText(entry.sourceSignature)),
  employeeName: normalizeText(entry.employeeName),
  workDate: entry.workDate,
  workType: entry.workType,
  section: entry.section,
  dutyCode: normalizeText(entry.dutyCode),
  reason: normalizeText(entry.reason),
  evidence: normalizeText(entry.evidence),
  isPoolWorker: entry.section === "substitute" ? Boolean(entry.isPoolWorker) : null
});

export const arePerformanceEntriesEquivalent = (
  left: PerformanceEntryRecord,
  right: PerformanceEntryRecord
) => {
  // Any entry that carries a RAW source signature (legal-holiday / substitute / overtime) is
  // compared by that signature rather than by derived minutes. A parser/formula change that
  // re-derives different minutes from the SAME source keeps the signature equal (no reapproval),
  // while a real source edit changes the signature (reapproval). Entries without a signature
  // (legacy approvals before backfill) fall back to full field comparison - the display-only
  // reduction above does NOT reach that fallback, so a legacy approval can still be flipped by a
  // live employee-master or site-name change. That gap is deliberate and left for a later release.
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
