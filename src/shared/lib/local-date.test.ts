import { describe, expect, it } from "vitest";

import { createTodayDateInputValue, formatLocalDateInputValue } from "./local-date";

describe("formatLocalDateInputValue", () => {
  it("names the calendar date the clock on the wall shows, whatever the time zone", () => {
    // Half past midnight local time: in UTC terms this may still be the previous day.
    expect(formatLocalDateInputValue(new Date(2026, 8, 5, 0, 30))).toBe("2026-09-05");
    expect(formatLocalDateInputValue(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
    expect(formatLocalDateInputValue(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });

  it("is what today's default is built from", () => {
    expect(createTodayDateInputValue()).toBe(formatLocalDateInputValue(new Date()));
  });
});
