import type { EmployeeSiteAssignment, ShiftPatternRecord } from "./model";
import { normalizeTeamLabel } from "./team-label";
import { getDefaultTeamWorkType, type TeamWorkType } from "./team-work-type";

// 대상 날짜 기준 소속 조 판정. 현재 소속만 보지 않고 배정 이력의 유효기간으로 고른다.
// 종료일은 제외(끝나는 날 당일은 이미 그 조가 아님) — 근무표 생성 로직과 동일한 규칙.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface TeamMembershipOnDate {
  assignmentId?: string;
  siteId?: string;
  teamLabel?: string;
}

const coversWorkDate = (assignment: EmployeeSiteAssignment, workDate: string) => {
  if (!assignment.startDate || assignment.startDate > workDate) {
    return false;
  }

  return !assignment.endDate || workDate < assignment.endDate;
};

const compareAssignments = (left: EmployeeSiteAssignment, right: EmployeeSiteAssignment) => {
  if (left.status !== right.status) {
    return left.status === "active" ? -1 : 1;
  }

  if (left.startDate !== right.startDate) {
    return left.startDate < right.startDate ? 1 : -1;
  }

  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
};

export const resolveTeamMembershipOnDate = (
  assignments: readonly EmployeeSiteAssignment[],
  workDate: string
): TeamMembershipOnDate | undefined => {
  if (!DATE_PATTERN.test(workDate)) {
    return undefined;
  }

  const matched = assignments
    .filter((assignment) => coversWorkDate(assignment, workDate))
    .sort(compareAssignments)[0];

  if (!matched) {
    return undefined;
  }

  return {
    assignmentId: matched.id,
    siteId: matched.siteId,
    teamLabel: normalizeTeamLabel(matched.shiftGroup)
  };
};

// 근무지 패턴에 저장된 조별 근무유형. 저장된 설정이 없으면 이름 기준 기본값을 쓴다.
export const getTeamWorkTypeFromPattern = (
  pattern: Pick<ShiftPatternRecord, "teamSettings"> | undefined,
  teamLabel: string | undefined
): TeamWorkType | undefined => {
  const normalizedLabel = normalizeTeamLabel(teamLabel);

  if (!normalizedLabel) {
    return undefined;
  }

  const matched = pattern?.teamSettings?.find(
    (item) => normalizeTeamLabel(item.teamLabel) === normalizedLabel
  );

  return matched?.workType;
};

export interface ResolvedTeamWorkType {
  siteId?: string;
  source: "assignment-history" | "current-team" | "default";
  teamLabel?: string;
  workType: TeamWorkType;
}

const pickActivePatternForSite = (
  patterns: readonly ShiftPatternRecord[],
  siteId: string | undefined
) => {
  if (!siteId) {
    return undefined;
  }

  return patterns
    .filter((pattern) => pattern.siteId === siteId && pattern.status === "active")
    .sort((left, right) =>
      (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
    )[0];
};

// 대상 날짜의 소속 조 → 그 조의 근무유형. 배정 이력이 없으면 현재 소속으로 떨어지고,
// 그래도 없으면 이름 기준 기본값(Pool 계열 → POOL, 그 외 → ROTATING)을 쓴다.
export const resolveTeamWorkTypeOnDate = (input: {
  assignments?: readonly EmployeeSiteAssignment[];
  currentTeamLabel?: string;
  currentSiteId?: string;
  patterns?: readonly ShiftPatternRecord[];
  workDate: string;
}): ResolvedTeamWorkType => {
  const patterns = input.patterns ?? [];
  const membership = resolveTeamMembershipOnDate(input.assignments ?? [], input.workDate);
  const teamLabel = membership?.teamLabel ?? normalizeTeamLabel(input.currentTeamLabel);
  const siteId = membership?.siteId ?? input.currentSiteId;
  const source: ResolvedTeamWorkType["source"] = membership?.teamLabel
    ? "assignment-history"
    : teamLabel
      ? "current-team"
      : "default";
  const configuredWorkType = getTeamWorkTypeFromPattern(
    pickActivePatternForSite(patterns, siteId),
    teamLabel
  );

  return {
    siteId,
    source,
    teamLabel,
    workType: configuredWorkType ?? getDefaultTeamWorkType(teamLabel)
  };
};
