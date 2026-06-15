import { describe, expect, it } from "vitest";

import { calculateWorkBreakdown } from "../../shared/domain/calculation";
import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";
import { arePerformanceEntriesEquivalent } from "./performance-approval-resolution-service";

// 적대검증(2026-06-15) 후속 가드:
//  - 법정휴일 직접근무는 야간이 걸쳐도 전부 기본근로(연장/야간 0)이며 총 근로분은 보존된다.
//  - 대체근무는 같은 시간대라도 연장·야간 가산을 유지한다(전부-기본 규칙이 새지 않음).
//  - 서명 없는 옛 승인분: 근무표 파생 섹션(법정휴일/대체)은 계산식 변경으로 분 배분만 달라져도
//    '원천 동일'이면 재승인 대상이 되지 않는다. 반대로 총분/시간이 바뀌면 재승인된다.
//    연장(overtime) 섹션은 파생 분 배분을 그대로 비교해 보호 범위가 새지 않음을 확인한다.

const makeEntry = (overrides: Partial<PerformanceEntryRecord>): PerformanceEntryRecord => ({
  id: "file-1:holiday:12:D:0",
  performanceFileId: "file-1",
  logicalKey: "2026-03:site:holiday:12:D:0",
  scheduleMonth: "2026-03",
  scheduleKey: "2026-03:site",
  siteName: "국사",
  employeeCode: "EMP-1",
  employeeName: "김영희",
  workDate: "2026-03-01",
  workType: "holiday",
  section: "legal-holiday",
  dutyCode: "D",
  startTime: "06:00",
  endTime: "18:00",
  breakMinutes: 60,
  totalWorkMinutes: 660,
  baseWorkMinutes: 660,
  overtimeMinutes: 0,
  nightMinutes: 0,
  sourceRowNumber: 12,
  sortOrder: 1,
  alerts: [],
  status: "pending",
  ...overrides
});

describe("법정휴일 직접근무 전부-기본 계산", () => {
  it("야간이 걸쳐도 법정휴일 직접근무는 전부 기본근로(연장/야간 0)이고 총분은 보존된다", () => {
    const breakdown = calculateWorkBreakdown({
      isHoliday: true,
      workType: "holiday",
      timeRange: { startTime: "14:00", endTime: "02:00", breakMinutes: 60 }
    });

    expect(breakdown.totalWorkMinutes).toBe(660);
    expect(breakdown.baseWorkMinutes).toBe(660);
    expect(breakdown.overtimeMinutes).toBe(0);
    expect(breakdown.nightMinutes).toBe(0);
  });

  it("대체근무는 같은 시간대라도 야간·연장 가산을 유지한다(전부-기본 규칙이 새지 않음)", () => {
    const breakdown = calculateWorkBreakdown({
      isHoliday: true,
      workType: "substitute",
      timeRange: { startTime: "14:00", endTime: "02:00", breakMinutes: 60 }
    });

    expect(breakdown.totalWorkMinutes).toBe(660);
    expect(breakdown.nightMinutes).toBe(180);
    expect(breakdown.overtimeMinutes).toBe(180);
    expect(breakdown.baseWorkMinutes).toBe(300);
  });
});

describe("서명 없는 옛 승인분의 재승인 폴백 비교 범위", () => {
  it("법정휴일: 원천 동일(시간·총분)이면 분 배분(480/180→660/0)이 달라도 재승인 대상이 아니다", () => {
    const approved = makeEntry({ baseWorkMinutes: 480, overtimeMinutes: 180, nightMinutes: 0 });
    const reparsed = makeEntry({ baseWorkMinutes: 660, overtimeMinutes: 0, nightMinutes: 0 });

    expect(arePerformanceEntriesEquivalent(approved, reparsed)).toBe(true);
  });

  it("법정휴일이라도 총 근로분이 바뀌면(원천 변경) 재승인 대상이다", () => {
    const approved = makeEntry({ totalWorkMinutes: 660, baseWorkMinutes: 660 });
    const reparsed = makeEntry({ totalWorkMinutes: 600, baseWorkMinutes: 600 });

    expect(arePerformanceEntriesEquivalent(approved, reparsed)).toBe(false);
  });

  it("대체 섹션도 분 배분 차이는 무시한다(근무표 파생 섹션)", () => {
    const approved = makeEntry({
      section: "substitute",
      workType: "substitute",
      logicalKey: "2026-03:site:substitute:11",
      baseWorkMinutes: 300,
      overtimeMinutes: 180,
      nightMinutes: 180
    });
    const reparsed = makeEntry({
      section: "substitute",
      workType: "substitute",
      logicalKey: "2026-03:site:substitute:11",
      baseWorkMinutes: 480,
      overtimeMinutes: 0,
      nightMinutes: 180
    });

    expect(arePerformanceEntriesEquivalent(approved, reparsed)).toBe(true);
  });

  it("연장 섹션은 보호 범위가 아니다 — 분 배분이 다르면 재승인 대상이다", () => {
    const approved = makeEntry({
      section: "overtime",
      workType: "overtime",
      logicalKey: "2026-03:site:overtime:30",
      baseWorkMinutes: 0,
      overtimeMinutes: 180,
      nightMinutes: 0
    });
    const reparsed = makeEntry({
      section: "overtime",
      workType: "overtime",
      logicalKey: "2026-03:site:overtime:30",
      baseWorkMinutes: 0,
      overtimeMinutes: 240,
      nightMinutes: 0
    });

    expect(arePerformanceEntriesEquivalent(approved, reparsed)).toBe(false);
  });
});
