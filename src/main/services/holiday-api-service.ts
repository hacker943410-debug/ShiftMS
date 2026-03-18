import type { HolidayItem } from "../../shared/domain/model";

interface ExternalHolidayRow {
  date?: string;
  holidayDate?: string;
  localName?: string;
  name?: string;
  isSubstitute?: boolean;
}

const normalizeDateText = (value: string) => {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("공휴일 API 응답에 잘못된 날짜 형식이 포함되어 있습니다.");
  }

  return trimmed;
};

const resolveHolidayApiUrl = (baseUrl: string, year: number) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (trimmed.length === 0) {
    throw new Error("공휴일 API 주소가 비어 있습니다.");
  }

  if (trimmed.includes("{year}") || trimmed.includes("{countryCode}")) {
    return trimmed.replaceAll("{year}", String(year)).replaceAll("{countryCode}", "KR");
  }

  if (/\/PublicHolidays$/i.test(trimmed)) {
    return `${trimmed}/${year}/KR`;
  }

  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}year=${year}&countryCode=KR`;
};

export const fetchHolidayApiItems = async (input: {
  baseUrl: string;
  year: number;
}): Promise<HolidayItem[]> => {
  const url = resolveHolidayApiUrl(input.baseUrl, input.year);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`공휴일 API 호출에 실패했습니다. (${response.status})`);
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new Error("공휴일 API 응답 형식이 올바르지 않습니다.");
  }

  const itemsByDate = new Map<string, HolidayItem>();

  payload.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const row = entry as ExternalHolidayRow;
    const holidayDate = row.holidayDate ?? row.date;
    const holidayName = row.localName ?? row.name;

    if (!holidayDate || !holidayName) {
      return;
    }

    const normalizedDate = normalizeDateText(holidayDate);

    if (!normalizedDate.startsWith(`${input.year}-`)) {
      return;
    }

    if (itemsByDate.has(normalizedDate)) {
      return;
    }

    itemsByDate.set(normalizedDate, {
      id: `holiday-api-${input.year}-${index}`,
      holidayDate: normalizedDate,
      name: String(holidayName).trim(),
      isSubstitute: row.isSubstitute === true || String(holidayName).includes("대체")
    });
  });

  return Array.from(itemsByDate.values()).sort((left, right) =>
    left.holidayDate.localeCompare(right.holidayDate)
  );
};
