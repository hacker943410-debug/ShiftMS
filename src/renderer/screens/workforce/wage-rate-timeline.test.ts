import { describe, expect, it } from "vitest";

import type { WageRateRecord } from "../../../shared/domain/model";
import {
  buildWageSavePreview,
  describeHireDateAgainstWages,
  describeWageHistoryIssues,
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

// Same order the storage service returns: newest start date first.
const timeline = [
  wageRate("2026-10-01", undefined, 15000),
  wageRate("2026-07-01", "2026-09-30", 14000),
  wageRate("2026-01-01", "2026-06-30", 13000)
];

describe("findWageRateOnDate", () => {
  it("아직 시작하지 않은 미래 시급을 '현재 시급'으로 집지 않는다", () => {
    // The old screen took whichever row had no end date and showed the 2026-10-01 row (15,000).
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

  it("같은 미래 시작일이 둘이면 읽기와 같은 줄(생성이 늦은 쪽)을 고른다", () => {
    // The list is effective_from DESC, created_at DESC. Scanning from the end used to return the
    // FIRST hit, which is the oldest duplicate - the opposite of what findWageRateOnDate and the
    // storage service resolve to. The screen would then preview a wage nobody else uses.
    const duplicated = [
      wageRate("2026-10-01", undefined, 20000), // newer created_at
      wageRate("2026-10-01", undefined, 10000), // older created_at
      wageRate("2026-07-01", "2026-09-30", 14000)
    ];

    expect(findUpcomingWageRate(duplicated, "2026-09-04")?.hourlyRate).toBe(20000);
  });

  it("예정된 줄이 없으면 아무것도 주지 않는다", () => {
    expect(findUpcomingWageRate(timeline, "2026-12-31")).toBeNull();
  });
});

describe("buildWageSavePreview", () => {
  it("지난 날짜를 넣어도 시작일보다 앞선 종료일을 만들지 않는다", () => {
    // The old screen mechanically showed "chosen date minus one day", which disagreed with what
    // the save statement actually does.
    const preview = buildWageSavePreview(timeline, "2026-08-01");

    expect(preview).not.toBeNull();
    expect(preview?.sameDateRate).toBeNull();
    expect(preview?.previousRate?.effectiveFrom).toBe("2026-07-01");
    expect(preview?.previousRateEndDate).toBe("2026-07-31");
    // The new row runs until the day before the next one (2026-10-01).
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

  it("이력에 공백이 있으면 그 앞줄은 끊기지 않는다", () => {
    // The save statement only cuts a row that still spans the new date
    // (`effective_to IS NULL OR effective_to >= new`). Picking the nearest earlier row
    // unconditionally promised an end date the database never writes.
    const withGap = [wageRate("2026-01-01", "2026-01-31", 13000)];
    const preview = buildWageSavePreview(withGap, "2026-03-01");

    expect(preview?.previousRate).toBeNull();
    expect(preview?.previousRateEndDate).toBe("");
    expect(preview?.newRateEndDate).toBe("");
  });

  it("앞줄이 새 적용일까지 이어질 때만 끊긴다", () => {
    const spanning = [wageRate("2026-01-01", "2026-05-31", 13000)];
    const preview = buildWageSavePreview(spanning, "2026-03-01");

    expect(preview?.previousRate?.effectiveFrom).toBe("2026-01-01");
    expect(preview?.previousRateEndDate).toBe("2026-02-28");
  });

  it("새 적용일을 걸치는 줄이 둘이면 둘 다 끝난다고 말한다", () => {
    // A history with an overlap - two lines both still running past the new date. The save
    // statement cuts every one of them, so the preview must name both, not the first it met.
    const overlapping = [
      wageRate("2026-05-01", undefined, 14000),
      wageRate("2026-01-01", undefined, 13000)
    ];
    const preview = buildWageSavePreview(overlapping, "2026-08-01");

    expect(preview?.previousRates.map((rate) => rate.effectiveFrom)).toEqual([
      "2026-05-01",
      "2026-01-01"
    ]);
    expect(preview?.previousRate?.effectiveFrom).toBe("2026-05-01");
    expect(preview?.previousRateEndDate).toBe("2026-07-31");
  });

  it("같은 적용일 덮어쓰기면 끝나는 줄이 하나도 없다", () => {
    // The UPDATE path rewrites the line in place and truncates nothing, so an overlapping history
    // still reports no line ending on that date.
    const overlapping = [
      wageRate("2026-07-01", undefined, 14000),
      wageRate("2026-01-01", undefined, 13000)
    ];
    const preview = buildWageSavePreview(overlapping, "2026-07-01");

    expect(preview?.sameDateRate?.hourlyRate).toBe(14000);
    expect(preview?.previousRates).toEqual([]);
    expect(preview?.previousRateEndDate).toBe("");
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

describe("describeWageHistoryIssues", () => {
  it("깨끗한 이력에는 아무 말도 하지 않는다", () => {
    expect(describeWageHistoryIssues(timeline, "2026-09-05")).toEqual([]);
  });

  it("앞 줄이 끝나지 않은 채 다음 줄이 시작하면 겹침을 그 줄에 붙인다", () => {
    const overlapping = [
      wageRate("2026-05-01", undefined, 14000),
      wageRate("2026-01-01", undefined, 13000)
    ];
    const issues = describeWageHistoryIssues(overlapping, "2026-09-05");

    expect(issues).toHaveLength(1);
    expect(issues[0]?.rateId).toBe("2026-05-01-14000");
    expect(issues[0]?.kind).toBe("overlap");
    expect(issues[0]?.message).toContain("앞 줄(2026-01-01~)과 기간이 겹칩니다");
  });

  it("같은 시작일 줄이 둘이면 나중에 만든 줄에 붙인다", () => {
    const older = {
      ...wageRate("2026-07-01", undefined, 14000),
      id: "older",
      createdAt: "2026-07-01T00:00:00.000Z"
    };
    const newer = {
      ...wageRate("2026-07-01", undefined, 14500),
      id: "newer",
      createdAt: "2026-07-02T00:00:00.000Z"
    };
    const issues = describeWageHistoryIssues([older, newer], "2026-09-05");

    expect(issues.map((issue) => issue.rateId)).toEqual(["newer"]);
    expect(issues[0]?.message).toContain("같은 시작일의 줄이 둘입니다");
  });

  it("앞 줄 종료와 다음 줄 시작 사이가 비면 공백 기간을 날짜로 말한다", () => {
    const gapped = [
      wageRate("2026-04-01", undefined, 14000),
      wageRate("2026-01-01", "2026-02-15", 13000)
    ];
    const issues = describeWageHistoryIssues(gapped, "2026-09-05");

    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("gap");
    expect(issues[0]?.rateId).toBe("2026-04-01-14000");
    expect(issues[0]?.message).toContain("2026-02-16~2026-03-31");
  });

  it("마지막 줄이 과거에 끝나고 뒤가 없으면 그것도 공백이다", () => {
    const ended = [wageRate("2026-01-01", "2026-06-30", 13000)];
    const issues = describeWageHistoryIssues(ended, "2026-09-05");

    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("gap");
    expect(issues[0]?.message).toContain("2026-06-30에 끝난 뒤 이어지는 시급 줄이 없습니다");
    // Ending in the future is a plan, not a gap.
    expect(describeWageHistoryIssues(ended, "2026-03-01")).toEqual([]);
  });
});

describe("describeHireDateAgainstWages", () => {
  it("입사일이 첫 시급 시작일보다 늦으면 그 날짜를 대며 경고한다", () => {
    expect(describeHireDateAgainstWages("2026-02-01", timeline)).toContain(
      "첫 시급 시작일(2026-01-01)보다 늦습니다"
    );
  });

  it("입사일이 첫 시급 시작일과 같거나 빠르면 아무 말도 하지 않는다", () => {
    expect(describeHireDateAgainstWages("2026-01-01", timeline)).toBeNull();
    expect(describeHireDateAgainstWages("2025-12-01", timeline)).toBeNull();
  });

  it("이력이 없거나 날짜가 아니면 아무 말도 하지 않는다", () => {
    expect(describeHireDateAgainstWages("2026-02-01", [])).toBeNull();
    expect(describeHireDateAgainstWages("", timeline)).toBeNull();
  });
});
