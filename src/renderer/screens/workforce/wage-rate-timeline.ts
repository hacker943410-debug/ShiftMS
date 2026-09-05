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

  return {
    effectiveFrom,
    sameDateRate,
    previousRate,
    previousRates: sameDateRate ? [] : previousRates,
    newRateEndDate: nextRate ? shiftWageDate(nextRate.effectiveFrom, -1) : "",
    previousRateEndDate: !sameDateRate && previousRate ? shiftWageDate(effectiveFrom, -1) : ""
  };
};

export interface WageHistoryIssue {
  rateId: string;
  kind: "overlap" | "gap";
  message: string;
}

// Overlaps and gaps in one person's wage history, attached to the line where each begins. The
// screen used to print the lines one under another, in which neither can be seen; and there is no
// delete (R-13), so knowing which date to save on is the whole repair. Judged with the same tie
// rule as the reads: on a shared start date the line created later is the one in force.
export const describeWageHistoryIssues = (
  wageRates: WageRateRecord[],
  today: string
): WageHistoryIssue[] => {
  const ordered = [...wageRates].sort(
    (left, right) =>
      left.effectiveFrom.localeCompare(right.effectiveFrom) ||
      left.createdAt.localeCompare(right.createdAt)
  );
  const issues: WageHistoryIssue[] = [];

  ordered.forEach((rate, index) => {
    const previous = ordered[index - 1];

    if (!previous) {
      return;
    }

    if (previous.effectiveFrom === rate.effectiveFrom) {
      issues.push({
        rateId: rate.id,
        kind: "overlap",
        message: "같은 시작일의 줄이 둘입니다. 나중에 만든 이 줄로 계산됩니다."
      });
      return;
    }

    if (!previous.effectiveTo || previous.effectiveTo >= rate.effectiveFrom) {
      issues.push({
        rateId: rate.id,
        kind: "overlap",
        message: `앞 줄(${previous.effectiveFrom}~)과 기간이 겹칩니다. 겹치는 날은 시작일이 늦은 이 줄로 계산됩니다.`
      });
      return;
    }

    const gapStart = shiftWageDate(previous.effectiveTo, 1);
    const gapEnd = shiftWageDate(rate.effectiveFrom, -1);

    if (gapStart <= gapEnd) {
      issues.push({
        rateId: rate.id,
        kind: "gap",
        message: `앞 줄과 사이에 시급이 없는 기간(${gapStart}~${gapEnd})이 있습니다. 그 기간 근무는 승인이 막힙니다.`
      });
    }
  });

  const last = ordered[ordered.length - 1];

  // A history that ends in the past with nothing after it is a gap that grows every day (T-14).
  if (last?.effectiveTo && last.effectiveTo < today) {
    issues.push({
      rateId: last.id,
      kind: "gap",
      message: `${last.effectiveTo}에 끝난 뒤 이어지는 시급 줄이 없습니다. 그 뒤 근무는 승인이 막힙니다.`
    });
  }

  return issues;
};
