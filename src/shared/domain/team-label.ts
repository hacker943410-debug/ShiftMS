const WEEKEND_SUFFIX = "(주말)";
const WEEKEND_SUFFIX_PATTERN = /\(\s*주말\s*\)$/;
const SINGLE_LETTER_TEAM_PATTERN = /^([A-Z])(?:\s*조)?$/i;

export const normalizeTeamLabel = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return undefined;
  }

  const hasWeekendSuffix = WEEKEND_SUFFIX_PATTERN.test(trimmed);
  const baseValue = trimmed.replace(WEEKEND_SUFFIX_PATTERN, "").trim();
  const matched = baseValue.match(SINGLE_LETTER_TEAM_PATTERN);
  const normalizedBase = matched ? `${matched[1].toUpperCase()}조` : baseValue;

  return hasWeekendSuffix ? `${normalizedBase}${WEEKEND_SUFFIX}` : normalizedBase;
};

export const appendWeekendTeamLabel = (value: string | null | undefined) => {
  const normalized = normalizeTeamLabel(value);

  if (!normalized) {
    return undefined;
  }

  return normalized.endsWith(WEEKEND_SUFFIX) ? normalized : `${normalized}${WEEKEND_SUFFIX}`;
};
