const WEEKEND_SUFFIX = "(주말)";
const WEEKEND_SUFFIX_PATTERN = /\(\s*주말\s*\)$/;
const SINGLE_LETTER_TEAM_PATTERN = /^([A-Z])(?:\s*조)?$/i;
const POOL_TEAM_PATTERN = /^(?:P(?:\s*조)?|POOL)$/i;
const TEAM_TOKEN_PATTERN = /[A-Z]+|\d+/;

export const normalizeTeamLabel = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return undefined;
  }

  const hasWeekendSuffix = WEEKEND_SUFFIX_PATTERN.test(trimmed);
  const baseValue = trimmed.replace(WEEKEND_SUFFIX_PATTERN, "").trim();
  const matched = baseValue.match(SINGLE_LETTER_TEAM_PATTERN);
  const normalizedBase = POOL_TEAM_PATTERN.test(baseValue)
    ? "Pool"
    : matched
      ? `${matched[1].toUpperCase()}조`
      : baseValue;

  return hasWeekendSuffix ? `${normalizedBase}${WEEKEND_SUFFIX}` : normalizedBase;
};

export const appendWeekendTeamLabel = (value: string | null | undefined) => {
  const normalized = normalizeTeamLabel(value);

  if (!normalized) {
    return undefined;
  }

  return normalized.endsWith(WEEKEND_SUFFIX) ? normalized : `${normalized}${WEEKEND_SUFFIX}`;
};

export const compareTeamLabels = (left: string, right: string) => {
  const normalizedLeft = normalizeTeamLabel(left) ?? left;
  const normalizedRight = normalizeTeamLabel(right) ?? right;
  const leftMatch = normalizedLeft.trim().toUpperCase().match(TEAM_TOKEN_PATTERN);
  const rightMatch = normalizedRight.trim().toUpperCase().match(TEAM_TOKEN_PATTERN);

  if (leftMatch && rightMatch && leftMatch[0] !== rightMatch[0]) {
    return leftMatch[0].localeCompare(rightMatch[0], "ko-KR", {
      numeric: true
    });
  }

  return normalizedLeft.localeCompare(normalizedRight, "ko-KR", {
    numeric: true
  });
};
