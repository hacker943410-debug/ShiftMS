import type { WageRateRecord } from "../../../shared/domain/model";

export interface WageSavePreview {
  effectiveFrom: string;
  /** A row on the same start date is edited in place instead of inserting a new one. */
  sameDateRate: WageRateRecord | null;
  /** The row still spanning the new date; it gets cut to the day before. */
  previousRate: WageRateRecord | null;
  /**
   * EVERY row still spanning the new date. Nothing stops the history from overlapping, and the
   * save cuts all of them - describing only the first understated how much a save would rewrite.
   */
  previousRates: WageRateRecord[];
  /** Where the new row ends. Empty when nothing follows it (open ended). */
  newRateEndDate: string;
  /** Where the preceding row is cut. Empty when there is none, or on an in-place edit. */
  previousRateEndDate: string;
}

export const isWageDateValue = (value?: string): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export const shiftWageDate = (value: string, offsetDays: number) => {
  if (!isWageDateValue(value)) {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);

  return `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;
};

// listStoredEmployeeWageRates hands the history back newest start first, so the first row
// whose span covers the date is the one in force. Taking whichever row simply has no end date
// surfaced a future-dated wage as today's.
export const findWageRateOnDate = (wageRates: WageRateRecord[], date: string) =>
  wageRates.find(
    (wageRate) =>
      wageRate.effectiveFrom <= date && (!wageRate.effectiveTo || wageRate.effectiveTo >= date)
  ) ?? null;

// The soonest row that has not started yet. Scanning from the end walks the future rows in
// ascending start order, and `<=` keeps the later-seen row when two share a start date - which is
// the lower index, i.e. the newest created_at. That matches how findWageRateOnDate and the storage
// service break the same tie; taking the first hit returned the oldest duplicate instead.
export const findUpcomingWageRate = (wageRates: WageRateRecord[], date: string) => {
  let soonest: WageRateRecord | null = null;

  for (let index = wageRates.length - 1; index >= 0; index -= 1) {
    const wageRate = wageRates[index];

    if (wageRate.effectiveFrom <= date) {
      continue;
    }

    if (!soonest || wageRate.effectiveFrom <= soonest.effectiveFrom) {
      soonest = wageRate;
    }
  }

  return soonest;
};

// Mirrors saveStoredEmployeeWageRate so the screen can promise exactly what will be stored.
// The old screen just showed "chosen date minus one day", which produced an end date before
// the start date whenever the operator backdated.
export const buildWageSavePreview = (
  wageRates: WageRateRecord[],
  effectiveFrom: string
): WageSavePreview | null => {
  if (!isWageDateValue(effectiveFrom)) {
    return null;
  }

  const sameDateRate =
    wageRates.find((wageRate) => wageRate.effectiveFrom === effectiveFrom) ?? null;
  // Only a row that still spans the new date gets cut short. The save statement narrows on
  // `effective_from < new AND (effective_to IS NULL OR effective_to >= new)`; picking the
  // nearest earlier row unconditionally lied whenever the history had a gap before it.
  const previousRates = wageRates.filter(
    (wageRate) =>
      wageRate.effectiveFrom < effectiveFrom &&
      (!wageRate.effectiveTo || wageRate.effectiveTo >= effectiveFrom)
  );
  const previousRate = previousRates[0] ?? null;
  const nextRate = findUpcomingWageRate(wageRates, effectiveFrom);

  // The cut applies on a same-date rewrite too. A healthy history has nothing crossing that date
  // (the earlier line already ends the day before), so the rewrite reports no cut; a migrated
  // overlap does get cut - which is the repair the T-19 notice promises.
  return {
    effectiveFrom,
    sameDateRate,
    previousRate,
    previousRates,
    newRateEndDate: nextRate ? shiftWageDate(nextRate.effectiveFrom, -1) : "",
    previousRateEndDate: previousRate ? shiftWageDate(effectiveFrom, -1) : ""
  };
};

export type WageHistoryIssueCode =
  | "duplicate-start"
  | "range-overlap"
  | "range-gap"
  | "trailing-gap";

export interface WageHistoryIssue {
  /** Stable and unique per line: one code occurs at most once on a line, so `${code}:${rateId}`. */
  id: string;
  rateId: string;
  code: WageHistoryIssueCode;
  /** The operator-facing grouping of the code: 겹침 or 공백. */
  kind: "overlap" | "gap";
  /**
   * What the operator has to fix, once. Lines sharing a start date are ONE cause (one date to
   * re-save), so they share a key; every other issue is its own cause.
   */
  causeKey: string;
  message: string;
}

export interface WageHistoryIssueSummary {
  overlapCount: number;
  gapCount: number;
}

const WAGE_HISTORY_ISSUE_KIND: Record<WageHistoryIssueCode, WageHistoryIssue["kind"]> = {
  "duplicate-start": "overlap",
  "range-overlap": "overlap",
  "range-gap": "gap",
  "trailing-gap": "gap"
};

const createWageHistoryIssue = (input: {
  rateId: string;
  code: WageHistoryIssueCode;
  causeKey?: string;
  message: string;
}): WageHistoryIssue => {
  const id = `${input.code}:${input.rateId}`;

  return {
    id,
    rateId: input.rateId,
    code: input.code,
    kind: WAGE_HISTORY_ISSUE_KIND[input.code],
    causeKey: input.causeKey ?? id,
    message: input.message
  };
};

// "겹침 N건 · 공백 N건" counts causes, not sentences: three lines on one start date are one
// overlap to fix, and a line that both shares a start date and overlaps the range before it is
// two (R10 #4). Counting sentences overstated the first and hid the second.
export const summarizeWageHistoryIssues = (issues: WageHistoryIssue[]): WageHistoryIssueSummary => {
  const overlapCauses = new Set<string>();
  const gapCauses = new Set<string>();

  for (const issue of issues) {
    (issue.kind === "overlap" ? overlapCauses : gapCauses).add(issue.causeKey);
  }

  return { overlapCount: overlapCauses.size, gapCount: gapCauses.size };
};

// Wide open: a line with no end covers every later date.
const OPEN_END = "9999-12-31";

const compareByCreatedAt = (left: WageRateRecord, right: WageRateRecord) =>
  left.createdAt.localeCompare(right.createdAt);

// Overlaps and gaps in one person's wage history, attached to the line where each begins. The
// screen used to print the lines one under another, in which neither can be seen; and there is no
// delete (R-13), so knowing which date to save on is the whole repair.
//
// The judgement sweeps start dates in order and carries the furthest end covered so far - not the
// previous line's end. A line that is still open covers every later line, so "1/1~계속, 2/1~2/28,
// 4/1~계속" has no March gap and the April line overlaps; comparing with the February line alone
// said the opposite. On a shared start date the line created last is the one the reads use.
export const describeWageHistoryIssues = (
  wageRates: WageRateRecord[],
  today: string
): WageHistoryIssue[] => {
  const groups = new Map<string, WageRateRecord[]>();

  [...wageRates]
    .sort(
      (left, right) =>
        left.effectiveFrom.localeCompare(right.effectiveFrom) || compareByCreatedAt(left, right)
    )
    .forEach((rate) => {
      groups.set(rate.effectiveFrom, [...(groups.get(rate.effectiveFrom) ?? []), rate]);
    });

  const issues: WageHistoryIssue[] = [];
  // The furthest end covered so far, and the line that reached it.
  let coverage: { end: string; owner: WageRateRecord } | null = null;

  for (const members of groups.values()) {
    const winner = members[members.length - 1];

    if (members.length > 1) {
      for (const member of members) {
        issues.push(
          createWageHistoryIssue({
            rateId: member.id,
            code: "duplicate-start",
            causeKey: `duplicate-start:${winner.effectiveFrom}`,
            message:
              member === winner
                ? `같은 시작일의 줄이 ${members.length}개입니다. 가장 나중에 만든 이 줄로 계산됩니다.`
                : `같은 시작일의 줄이 ${members.length}개입니다. 이 줄은 계산에 쓰이지 않습니다(가장 나중에 만든 줄이 우선).`
          })
        );
      }
    }

    if (coverage) {
      if (winner.effectiveFrom <= coverage.end) {
        issues.push(
          createWageHistoryIssue({
            rateId: winner.id,
            code: "range-overlap",
            message: `앞 줄(${coverage.owner.effectiveFrom}~${
              coverage.owner.effectiveTo ?? "계속"
            })과 기간이 겹칩니다. 겹치는 날은 시작일이 늦은 이 줄로 계산됩니다.`
          })
        );
      } else {
        const gapStart = shiftWageDate(coverage.end, 1);
        const gapEnd = shiftWageDate(winner.effectiveFrom, -1);

        if (gapStart <= gapEnd) {
          issues.push(
            createWageHistoryIssue({
              rateId: winner.id,
              code: "range-gap",
              message: `앞 줄과 사이에 시급이 없는 기간(${gapStart}~${gapEnd})이 있습니다. 그 기간 근무는 승인이 막힙니다.`
            })
          );
        }
      }
    }

    // Every member covers dates, a shadowed one included: the reads take any line spanning the
    // date, so the furthest end among them is what the next start is judged against.
    for (const member of members) {
      const memberEnd = member.effectiveTo ?? OPEN_END;

      if (!coverage || memberEnd > coverage.end) {
        coverage = { end: memberEnd, owner: member };
      }
    }
  }

  // A history whose furthest end is in the past has nothing after it - a gap that grows every day
  // (T-14). It belongs to the line that ends last, whichever start date that is.
  if (coverage && coverage.end !== OPEN_END && coverage.end < today) {
    issues.push(
      createWageHistoryIssue({
        rateId: coverage.owner.id,
        code: "trailing-gap",
        message: `${coverage.end}에 끝난 뒤 이어지는 시급 줄이 없습니다. 그 뒤 근무는 승인이 막힙니다.`
      })
    );
  }

  return issues;
};

// The hire date and the first wage line are entered separately and nothing keeps them in step.
// Both directions matter, and the dangerous one is the hire date BEFORE the first line: from the
// hire date to the day before it there is no wage, and work in that stretch cannot be approved
// (R-11). A hire date after the first line only leaves a line that starts before the person did.
// The screen warns rather than moves the line (R-13).
export const describeHireDateAgainstWages = (
  hireDate: string,
  wageRates: WageRateRecord[]
): string | null => {
  if (!isWageDateValue(hireDate) || wageRates.length === 0) {
    return null;
  }

  const earliest = wageRates.reduce((first, rate) =>
    rate.effectiveFrom < first.effectiveFrom ? rate : first
  );

  if (hireDate > earliest.effectiveFrom) {
    return `입사일이 첫 시급 시작일(${earliest.effectiveFrom})보다 늦습니다. 입사일 이전의 시급 줄은 그대로 남습니다.`;
  }

  if (hireDate < earliest.effectiveFrom) {
    return `입사일부터 첫 시급 시작일 전날까지(${hireDate}~${shiftWageDate(
      earliest.effectiveFrom,
      -1
    )}) 시급이 없습니다. 그 기간 근무는 승인이 막히니, 시급 변경에서 ${hireDate}자 시급을 넣으세요.`;
  }

  return null;
};
