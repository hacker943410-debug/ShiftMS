// 실적근무표 본표에서 "변경후" 칸에 적힌 사람을 실제 근무자로 인정할지 판정한다.
//
// 옛 규칙: 변경전(정규) 칸이 홍길동/빈칸/"-"/휴무/None 일 때만 변경후 사람을 인정하고,
//          변경전에 실제 이름이 남아 있으면 변경후를 버리고 변경전 사람에게 크레딧했다.
// 새 규칙: 변경전에 무엇이 적혀 있든 변경후에 실제 근무자가 있으면 그 사람을 인정한다.
//          (운영 확인: 현장에서 실제로 일한 사람은 변경후이고, 변경후 칸은 근무 스케줄상
//           근무자 변동을 알리는 칸이다. 법정휴일근로수당 산출은 그대로 살아 있다.)
//
// 새 규칙은 적용 시작일 이후 "근무일"에만 걸린다. 그 전 근무일은 옛 규칙 그대로여서
// 이미 승인·지급된 과거분의 근무자가 바뀌지 않는다(forward-only).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 판정 당시 어떤 규칙이 적용됐는지 기록하기 위한 값. 규칙이 바뀌면 올린다.
export const CHANGED_SLOT_PRIORITY_POLICY_VERSION = "2026-07-changed-slot-priority";

// 시작일이 비어 있거나 형식이 어긋나면 새 규칙을 적용하지 않는다(안전한 기본값).
export const isChangedSlotPriorityApplicable = (input: {
  workDate: string;
  effectiveFrom?: string;
}) => {
  const effectiveFrom = input.effectiveFrom?.trim() ?? "";

  if (!DATE_PATTERN.test(effectiveFrom) || !DATE_PATTERN.test(input.workDate)) {
    return false;
  }

  return input.workDate >= effectiveFrom;
};
