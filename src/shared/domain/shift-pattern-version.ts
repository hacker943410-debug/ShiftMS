import type { ShiftPatternRecord } from "./model";

// 근무지의 패턴 규칙은 "적용 시작일"이 다른 버전으로 쌓인다.
// 규칙을 고쳐도 과거 버전은 그대로 남고, 어떤 날짜의 근무는 그 날짜에 유효했던 버전으로 계산한다.
//
// 종료일은 따로 저장하지 않고 다음 버전의 시작일 전날로 계산한다.
// 저장값이 하나뿐이라 두 값이 어긋날 일이 없다.

export interface ShiftPatternVersion {
  pattern: ShiftPatternRecord;
  effectiveFrom: string;
  // 마지막 적용 날짜. 뒤에 다른 버전이 없으면 undefined(계속 적용).
  effectiveTo?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isPatternDateValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && DATE_PATTERN.test(value.trim());

// 이 버전이 언제부터 적용되는지. 저장값이 없으면 패턴 시작일을 쓴다(예전 데이터 호환).
export const getShiftPatternEffectiveFrom = (
  pattern: Pick<ShiftPatternRecord, "effectiveFrom" | "patternStartDate">
): string | undefined => {
  const effectiveFrom = pattern.effectiveFrom?.trim();

  if (isPatternDateValue(effectiveFrom)) {
    return effectiveFrom;
  }

  const patternStartDate = pattern.patternStartDate?.trim();

  return isPatternDateValue(patternStartDate) ? patternStartDate : undefined;
};

export const getPreviousDateValue = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));

  target.setUTCDate(target.getUTCDate() - 1);

  return target.toISOString().slice(0, 10);
};

// 같은 근무지의 패턴들을 적용 시작일 순으로 세운다. 시작일이 없는 예전 데이터는 맨 앞에 둔다.
const sortByEffectiveFrom = (patterns: ShiftPatternRecord[]) =>
  patterns
    .map((pattern, ordinal) => ({
      ordinal,
      effectiveFrom: getShiftPatternEffectiveFrom(pattern),
      pattern
    }))
    .sort((left, right) => {
      if (left.effectiveFrom === right.effectiveFrom) {
        return left.ordinal - right.ordinal;
      }

      if (!left.effectiveFrom) {
        return -1;
      }

      if (!right.effectiveFrom) {
        return 1;
      }

      return left.effectiveFrom.localeCompare(right.effectiveFrom);
    });

// 이 날짜에 적용되는 패턴 버전. 날짜보다 늦게 시작하는 버전은 쓰지 않는다.
//
// 날짜가 모든 버전의 시작일보다 앞서면 가장 이른 버전을 쓴다.
// 버전이 하나뿐인 기존 근무지가 지금과 똑같이 동작하도록 남겨 둔 규칙이다.
export const resolveShiftPatternForDate = (
  patterns: ShiftPatternRecord[],
  date: string
): ShiftPatternRecord | null => {
  const sorted = sortByEffectiveFrom(patterns.filter((pattern) => pattern.status === "active"));

  if (sorted.length === 0) {
    return null;
  }

  const applicable = sorted.filter(
    (item) => !item.effectiveFrom || item.effectiveFrom <= date
  );

  return (applicable[applicable.length - 1] ?? sorted[0])?.pattern ?? null;
};

// 그 달 1일에 유효한 버전. 근무표는 달 단위로 만들기 때문에 달의 첫날을 기준으로 잡는다.
export const resolveShiftPatternForMonth = (
  patterns: ShiftPatternRecord[],
  scheduleMonth: string
): ShiftPatternRecord | null =>
  resolveShiftPatternForDate(patterns, `${scheduleMonth.slice(0, 7)}-01`);

// 운영중인 버전만 시간순으로. 중지된 패턴은 이력에서 뺀다.
export const buildShiftPatternVersions = (
  patterns: ShiftPatternRecord[]
): ShiftPatternVersion[] => {
  const sorted = sortByEffectiveFrom(patterns.filter((pattern) => pattern.status === "active"));

  return sorted.map((item, index) => {
    const nextEffectiveFrom = sorted[index + 1]?.effectiveFrom;

    return {
      pattern: item.pattern,
      effectiveFrom: item.effectiveFrom ?? "",
      effectiveTo: nextEffectiveFrom ? getPreviousDateValue(nextEffectiveFrom) : undefined
    };
  });
};

// 새 적용 시작일이 쓸 수 있는 값인지. 같은 근무지에 같은 시작일이 두 개일 수 없다.
export const getShiftPatternEffectiveFromError = ({
  editingPatternId,
  effectiveFrom,
  patterns
}: {
  editingPatternId?: string;
  effectiveFrom: string;
  patterns: ShiftPatternRecord[];
}): string | null => {
  const trimmed = effectiveFrom.trim();

  if (!trimmed) {
    return "적용 시작일을 입력해야 합니다.";
  }

  if (!isPatternDateValue(trimmed)) {
    return "적용 시작일은 2026-08-01 형식으로 입력해야 합니다.";
  }

  const duplicated = patterns.some(
    (pattern) =>
      pattern.status === "active" &&
      pattern.id !== editingPatternId &&
      getShiftPatternEffectiveFrom(pattern) === trimmed
  );

  if (duplicated) {
    return `${trimmed}부터 적용되는 설정이 이미 있습니다. 다른 날짜를 고르거나 그 설정을 수정하세요.`;
  }

  return null;
};
