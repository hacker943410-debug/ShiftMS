import { describe, expect, it } from "vitest";

import type { MonthlyScheduleItem } from "./model";
import { buildScheduleRuleWarnings } from "./schedule-rule-warning";

const createItem = (overrides: Partial<MonthlyScheduleItem>): MonthlyScheduleItem => ({
  id: `${overrides.employeeCode}-${overrides.workDate}`,
  employeeId: overrides.employeeId ?? "employee-1",
  employeeCode: overrides.employeeCode ?? "EMP-001",
  employeeName: overrides.employeeName ?? "김현우",
  teamLabel: overrides.teamLabel,
  sortOrder: overrides.sortOrder,
  workDate: overrides.workDate ?? "2026-04-01",
  dutyCode: overrides.dutyCode ?? "D",
  startTime: overrides.startTime ?? "06:00",
  endTime: overrides.endTime ?? "18:00",
  breakMinutes: overrides.breakMinutes ?? 60
});

describe("schedule-rule-warning", () => {
  it("should warn on weekly max minutes, consecutive night, minimum rest, and missing weekly holiday", () => {
    const items = [
      createItem({ workDate: "2026-04-06", dutyCode: "D" }),
      createItem({ workDate: "2026-04-07", dutyCode: "N", startTime: "18:00", endTime: "06:00" }),
      createItem({ workDate: "2026-04-08", dutyCode: "N", startTime: "18:00", endTime: "06:00" }),
      createItem({ workDate: "2026-04-09", dutyCode: "N", startTime: "18:00", endTime: "06:00" }),
      createItem({ workDate: "2026-04-10", dutyCode: "N", startTime: "18:00", endTime: "06:00" }),
      createItem({ workDate: "2026-04-11", dutyCode: "D", startTime: "10:00", endTime: "18:00" }),
      createItem({ workDate: "2026-04-12", dutyCode: "D" })
    ];

    const summary = buildScheduleRuleWarnings(items, {
      consecutiveNightLimit: 3,
      minimumRestMinutes: 11 * 60,
      requireWeeklyHoliday: true,
      weeklyMaxMinutes: 52 * 60
    });

    expect(summary.byRule["weekly-max-minutes"]).toBe(1);
    expect(summary.byRule["consecutive-night"]).toBe(1);
    expect(summary.byRule["minimum-rest"]).toBe(1);
    expect(summary.byRule["weekly-holiday"]).toBe(1);
    expect(summary.warningCount).toBe(4);
  });

  it("should not warn when a week includes an off day and stays within configured limits", () => {
    const items = [
      createItem({ workDate: "2026-04-06", dutyCode: "D" }),
      createItem({ workDate: "2026-04-07", dutyCode: "D" }),
      createItem({ workDate: "2026-04-08", dutyCode: "O", startTime: undefined, endTime: undefined }),
      createItem({ workDate: "2026-04-09", dutyCode: "D" }),
      createItem({ workDate: "2026-04-10", dutyCode: "D" })
    ];

    const summary = buildScheduleRuleWarnings(items);

    expect(summary.warningCount).toBe(0);
  });
});
