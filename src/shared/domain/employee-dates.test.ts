import { describe, expect, it } from "vitest";

import { isCalendarDateValue, validateEmployeeDates } from "./employee-dates";

describe("isCalendarDateValue", () => {
  it("accepts only real calendar dates in YYYY-MM-DD form", () => {
    expect(isCalendarDateValue("2026-02-28")).toBe(true);
    expect(isCalendarDateValue("2024-02-29")).toBe(true);
    expect(isCalendarDateValue("2026-02-30")).toBe(false);
    expect(isCalendarDateValue("2026-99-99")).toBe(false);
    expect(isCalendarDateValue("2026-2-15")).toBe(false);
    expect(isCalendarDateValue("")).toBe(false);
    expect(isCalendarDateValue(undefined)).toBe(false);
  });
});

describe("validateEmployeeDates", () => {
  const today = "2026-09-05";

  it("passes ordinary dates", () => {
    expect(validateEmployeeDates({ hireDate: "2026-03-01", today })).toBeNull();
    expect(validateEmployeeDates({ hireDate: "2026-03-01", retireDate: "2026-08-31", today })).toBeNull();
    expect(validateEmployeeDates({ today })).toBeNull();
  });

  it("rejects a hire date that is not a real date, too early, or in the future", () => {
    expect(validateEmployeeDates({ hireDate: "2026-02-30", today })).toBe("입사일 형식이 올바르지 않습니다.");
    expect(validateEmployeeDates({ hireDate: "2026-99-99", today })).toBe("입사일 형식이 올바르지 않습니다.");
    expect(validateEmployeeDates({ hireDate: "1989-12-31", today })).toContain("1990-01-01 이후");
    expect(validateEmployeeDates({ hireDate: "2026-09-06", today })).toBe("입사일은 오늘 이후 날짜로 넣을 수 없습니다.");
    expect(validateEmployeeDates({ hireDate: "2026-09-05", today })).toBeNull();
  });

  it("rejects a retire date that is malformed or before the hire date", () => {
    expect(validateEmployeeDates({ hireDate: "2026-03-01", retireDate: "2026-13-01", today })).toBe(
      "퇴사 처리일 형식이 올바르지 않습니다."
    );
    expect(validateEmployeeDates({ hireDate: "2026-03-01", retireDate: "2026-02-28", today })).toBe(
      "퇴사 처리일은 입사일보다 빠를 수 없습니다."
    );
    // A retire date in the future is a plan, not a typo.
    expect(validateEmployeeDates({ hireDate: "2026-03-01", retireDate: "2027-01-31", today })).toBeNull();
  });
});
