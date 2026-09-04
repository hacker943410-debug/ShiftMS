import type { WageRateRecord } from "../../../shared/domain/model";

export interface WageSavePreview {
  effectiveFrom: string;
  /** A row on the same start date is edited in place instead of inserting a new one. */
  sameDateRate: WageRateRecord | null;
  /** The row still spanning the new date; it gets cut to the day before. */
  previousRate: WageRateRecord | null;
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
  const previousRate =
    wageRates.find(
      (wageRate) =>
        wageRate.effectiveFrom < effectiveFrom &&
        (!wageRate.effectiveTo || wageRate.effectiveTo >= effectiveFrom)
    ) ?? null;
  const nextRate = findUpcomingWageRate(wageRates, effectiveFrom);

  return {
    effectiveFrom,
    sameDateRate,
    previousRate,
    newRateEndDate: nextRate ? shiftWageDate(nextRate.effectiveFrom, -1) : "",
    previousRateEndDate: !sameDateRate && previousRate ? shiftWageDate(effectiveFrom, -1) : ""
  };
};
