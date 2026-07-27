import { normalizeTeamLabel } from "./team-label";

// 조(팀)의 근무 성격. 이름("A조", "Pool")이 아니라 이 값으로 정책을 판단한다.
// POOL: 지원/대기 성격의 조, FIXED_DAY: 주간고정조, ROTATING: 주야 교대조.
export type TeamWorkType = "POOL" | "FIXED_DAY" | "ROTATING";

export const teamWorkTypeValues: readonly TeamWorkType[] = ["POOL", "FIXED_DAY", "ROTATING"];

export const teamWorkTypeLabels: Record<TeamWorkType, string> = {
  POOL: "Pool",
  FIXED_DAY: "주간고정조",
  ROTATING: "교대조"
};

const POOL_LABEL_PREFIX = "POOL";

export const isTeamWorkType = (value: unknown): value is TeamWorkType =>
  typeof value === "string" && teamWorkTypeValues.includes(value as TeamWorkType);

export const normalizeTeamWorkType = (
  value: unknown,
  fallback: TeamWorkType = "ROTATING"
): TeamWorkType => {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[\s-]/g, "_");

  return isTeamWorkType(normalized) ? normalized : fallback;
};

// 이름이 Pool 계열인지. 신규 조 이름의 기본 근무유형을 정할 때만 쓰고,
// 수당 판정 등 실제 정책은 저장된 workType 값을 본다.
export const isPoolTeamLabel = (teamLabel: string | null | undefined) => {
  const normalized = normalizeTeamLabel(teamLabel);

  if (!normalized) {
    return false;
  }

  return normalized.toUpperCase().startsWith(POOL_LABEL_PREFIX);
};

export const getDefaultTeamWorkType = (teamLabel: string | null | undefined): TeamWorkType =>
  isPoolTeamLabel(teamLabel) ? "POOL" : "ROTATING";

export const getTeamWorkTypeLabel = (workType: TeamWorkType) => teamWorkTypeLabels[workType];
