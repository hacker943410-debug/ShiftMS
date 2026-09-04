import type { WageRateRecord } from "../../../shared/domain/model";

export interface WageSavePreview {
  effectiveFrom: string;
  /** 같은 적용일 줄이 있으면 새 줄을 만들지 않고 그 줄을 고쳐 쓴다. */
  sameDateRate: WageRateRecord | null;
  /** 새 적용일 바로 앞의 줄. 이 줄이 새 적용일 전날로 끊긴다. */
  previousRate: WageRateRecord | null;
  /** 새 줄이 끝나는 날. 뒤에 줄이 없으면 빈 문자열(계속). */
  newRateEndDate: string;
  /** 앞줄이 끊기는 날. 앞줄이 없거나 같은 날짜를 고쳐 쓰는 경우 빈 문자열. */
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

// 시급 이력은 시작일 내림차순으로 온다(listStoredEmployeeWageRates).
// 그날 유효한 줄은 "시작일이 그날 이하이고, 끝나는 날이 없거나 그날 이상"인 첫 줄이다.
// 끝나는 날이 빈 줄을 그냥 집으면 아직 시작도 하지 않은 미래 시급이 '현재 시급'으로 보인다.
export const findWageRateOnDate = (wageRates: WageRateRecord[], date: string) =>
  wageRates.find(
    (wageRate) =>
      wageRate.effectiveFrom <= date && (!wageRate.effectiveTo || wageRate.effectiveTo >= date)
  ) ?? null;

// 아직 시작하지 않은 줄 중 가장 먼저 시작하는 것. 내림차순 목록이라 뒤에서 찾는다.
export const findUpcomingWageRate = (wageRates: WageRateRecord[], date: string) => {
  for (let index = wageRates.length - 1; index >= 0; index -= 1) {
    if (wageRates[index].effectiveFrom > date) {
      return wageRates[index];
    }
  }

  return null;
};

// 저장하면 실제로 어떤 구간이 되는지 그대로 미리 계산한다(saveStoredEmployeeWageRate와 같은 규칙).
// 예전 화면은 고른 적용일의 전날을 기계적으로 보여줘서, 지난 날짜를 넣으면 시작일보다
// 앞선 종료일 같은 값이 나왔다.
export const buildWageSavePreview = (
  wageRates: WageRateRecord[],
  effectiveFrom: string
): WageSavePreview | null => {
  if (!isWageDateValue(effectiveFrom)) {
    return null;
  }

  const sameDateRate =
    wageRates.find((wageRate) => wageRate.effectiveFrom === effectiveFrom) ?? null;
  const previousRate =
    wageRates.find((wageRate) => wageRate.effectiveFrom < effectiveFrom) ?? null;
  const nextRate = findUpcomingWageRate(wageRates, effectiveFrom);

  return {
    effectiveFrom,
    sameDateRate,
    previousRate,
    newRateEndDate: nextRate ? shiftWageDate(nextRate.effectiveFrom, -1) : "",
    previousRateEndDate: !sameDateRate && previousRate ? shiftWageDate(effectiveFrom, -1) : ""
  };
};
