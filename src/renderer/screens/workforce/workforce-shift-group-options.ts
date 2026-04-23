import type { EmployeeRecord, ShiftPatternRecord } from "@shared/domain/model";
import { normalizeTeamLabel } from "@shared/domain/team-label";

const buildTeamLabels = (teamCount: number) =>
  Array.from({ length: teamCount }, (_, index) => `${String.fromCharCode(65 + index)}조`);

const getLatestActivePattern = (siteId: string, patterns: ShiftPatternRecord[]) =>
  [...patterns]
    .filter((pattern) => pattern.siteId === siteId && pattern.status === "active")
    .sort((left, right) =>
      (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
    )[0] ?? null;

export const getAvailableShiftGroups = (
  siteId: string,
  patterns: ShiftPatternRecord[],
  employees: EmployeeRecord[]
) => {
  if (!siteId) {
    return [];
  }

  const targetPattern = getLatestActivePattern(siteId, patterns);

  if (!targetPattern) {
    return [];
  }

  const teamLabels = buildTeamLabels(targetPattern.teamCount);
  const occupiedCounts = new Map<string, number>();
  const maxHeadcountByTeam = new Map<string, number | undefined>();

  teamLabels.forEach((teamLabel) => {
    occupiedCounts.set(teamLabel, 0);
    const capacity = targetPattern.teamCapacities.find((item) => item.teamLabel === teamLabel);
    maxHeadcountByTeam.set(teamLabel, capacity?.maxHeadcount);
  });

  employees
    .filter((employee) => employee.currentSiteId === siteId)
    .forEach((employee) => {
      const teamLabel = normalizeTeamLabel(employee.currentShiftGroup);

      if (!teamLabel || !occupiedCounts.has(teamLabel)) {
        return;
      }

      occupiedCounts.set(teamLabel, (occupiedCounts.get(teamLabel) ?? 0) + 1);
    });

  return teamLabels.filter((teamLabel) => {
    const maxHeadcount = maxHeadcountByTeam.get(teamLabel);
    const occupiedCount = occupiedCounts.get(teamLabel) ?? 0;

    if (typeof maxHeadcount !== "number") {
      return true;
    }

    return occupiedCount < maxHeadcount;
  });
};
