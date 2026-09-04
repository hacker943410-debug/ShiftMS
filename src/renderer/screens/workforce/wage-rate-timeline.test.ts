import { describe, expect, it } from "vitest";

import type { WageRateRecord } from "../../../shared/domain/model";
import {
  buildWageSavePreview,
  findUpcomingWageRate,
  findWageRateOnDate,
  shiftWageDate
} from "./wage-rate-timeline";

const wageRate = (
  effectiveFrom: string,
  effectiveTo: string | undefined,
  hourlyRate: number
): WageRateRecord => ({
  id: `${effectiveFrom}-${hourlyRate}`,
  employeeId: "employee-1",
  employeeCode: "EMP-001",
  employeeName: "김현우",
  hourlyRate,
  effectiveFrom,
  effectiveTo,
  createdAt: `${effectiveFrom}T00:00:00.000Z`
});

// 저장 서비스가 주는 순서 그대로: 시작일 내림차순.
const timeline = [
  wageRate("2026-10-01", undefined, 15000),
  wageRate("2026-07-01", "2026-09-30", 14000),
  wageRate("2026-01-01", "2026-06-30", 13000)
];

describe("findWageRateOnDate", () => {
  it("아직 시작하지 않은 미래 시급을 '현재 시급'으로 집지 않는다", () => {
    // 예전 화면은 '끝나는 날이 빈 줄'을 그냥 집어서 2026-10-01 줄(15,000)을 현재값으로 보여줬다.
    expect(findWageRateOnDate(timeline, "2026-09-04")?.hourlyRate).toBe(14000);
  });

  it("시작일 당일과 종료일 당일을 모두 포함한다", () => {
    expect(findWageRateOnDate(timeline, "2026-07-01")?.hourlyRate).toBe(14000);
    expect(findWageRateOnDate(timeline, "2026-09-30")?.hourlyRate).toBe(14000);
    expect(findWageRateOnDate(timeline, "2026-06-30")?.hourlyRate).toBe(13000);
  });

  it("그날을 덮는 줄이 없으면 아무것도 주지 않는다", () => {
    expect(findWageRateOnDate(timeline, "2025-12-31")).toBeNull();
    expect(findWageRateOnDate([], "2026-09-04")).toBeNull();
  });

  it("미래 줄만 있으면 오늘 유효한 시급은 없다", () => {
    expect(findWageRateOnDate([wageRate("2026-12-01", undefined, 16000)], "2026-09-04")).toBeNull();
  });
});

describe("findUpcomingWageRate", () => {
  it("아직 시작하지 않은 줄 중 가장 먼저 시작하는 것을 준다", () => {
    const withTwoFuture = [
      wageRate("2027-01-01", undefined, 16000),
      wageRate("2026-10-01", "2026-12-31", 15000),
      wageRate("2026-07-01", "2026-09-30", 14000)
    ];

    expect(findUpcomingWageRate(withTwoFuture, "2026-09-04")?.effectiveFrom).toBe("2026-10-01");
  });

  it("예정된 줄이 없으면 아무것도 주지 않는다", () => {
    expect(findUpcomingWageRate(timeline, "2026-12-31")).toBeNull();
  });
});

describe("buildWageSavePreview", () => {
  it("지난 날짜를 넣어도 시작일보다 앞선 종료일을 만들지 않는다", () => {
    // 예전에는 고른 적용일의 전날을 기계적으로 보여줘서, 이 경우 '현재 시급 종료일 = 2026-07-31'
    // 처럼 실제 저장 결과와 다른 값이 나왔다.
    const preview = buildWageSavePreview(timeline, "2026-08-01");

    expect(preview).not.toBeNull();
    expect(preview?.sameDateRate).toBeNull();
    expect(preview?.previousRate?.effectiveFrom).toBe("2026-07-01");
    expect(preview?.previousRateEndDate).toBe("2026-07-31");
    // 새 줄은 다음 줄(2026-10-01) 시작 전날까지다.
    expect(preview?.newRateEndDate).toBe("2026-09-30");
  });

  it("같은 적용일이면 그 줄을 고쳐 쓰고 앞줄은 건드리지 않는다", () => {
    const preview = buildWageSavePreview(timeline, "2026-07-01");

    expect(preview?.sameDateRate?.hourlyRate).toBe(14000);
    expect(preview?.previousRateEndDate).toBe("");
    expect(preview?.newRateEndDate).toBe("2026-09-30");
  });

  it("맨 뒤에 넣으면 끝나는 날 없이 계속 적용된다", () => {
    const preview = buildWageSavePreview(timeline, "2027-01-01");

    expect(preview?.newRateEndDate).toBe("");
    expect(preview?.previousRate?.effectiveFrom).toBe("2026-10-01");
    expect(preview?.previousRateEndDate).toBe("2026-12-31");
  });

  it("이력이 없으면 앞줄도 뒷줄도 없다", () => {
    const preview = buildWageSavePreview([], "2026-09-04");

    expect(preview?.previousRate).toBeNull();
    expect(preview?.previousRateEndDate).toBe("");
    expect(preview?.newRateEndDate).toBe("");
  });

  it("날짜 형식이 아니면 미리보기를 만들지 않는다", () => {
    expect(buildWageSavePreview(timeline, "")).toBeNull();
    expect(buildWageSavePreview(timeline, "2026-9-4")).toBeNull();
  });
});

describe("shiftWageDate", () => {
  it("월·연 경계를 넘어가도 하루씩 정확히 민다", () => {
    expect(shiftWageDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftWageDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftWageDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("날짜 형식이 아니면 빈 값을 준다", () => {
    expect(shiftWageDate("2026/03/01", -1)).toBe("");
  });
});
