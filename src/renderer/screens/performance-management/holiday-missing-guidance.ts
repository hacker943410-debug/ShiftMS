import type { GuidanceConfig } from "../../contexts/app-workflow-context";

export interface HolidayMarkingGap {
  scheduleMonth: string;
  holidayLabels: string[];
}

interface HolidayItemLike {
  holidayDate: string;
  name?: string;
}

// Structural shape of just the bits of the performance overview this detection needs, so the pure
// function stays trivially testable without constructing a whole snapshot.
interface OverviewLike {
  groups: Array<{ rows: Array<{ entry: { section: string } }> }>;
}

const formatHolidayLabel = (item: HolidayItemLike) => {
  const [, month, day] = item.holidayDate.split("-");
  const base = `${Number(month)}월 ${Number(day)}일`;

  return item.name ? `${base}(${item.name})` : base;
};

// Heuristic, advisory-only: the selected month has registered public holiday(s), the month has
// performance rows loaded, yet NOT A SINGLE 법정휴일 근무 row parsed. Because holiday work is only
// recognised when the date cell is holiday-marked (pink) in the workbook, a total absence of holiday
// rows is the tell-tale of a returned schedule whose holidays were never marked. We never block on
// this — it is surfaced as a dismissible hint, because a month where nobody worked a holiday is also
// legitimately holiday-row-free.
export const detectHolidayMarkingGap = (input: {
  scheduleMonth: string | null;
  holidayItems: HolidayItemLike[];
  overview: OverviewLike | null;
}): HolidayMarkingGap | null => {
  const { scheduleMonth, holidayItems, overview } = input;

  if (!scheduleMonth || !overview) {
    return null;
  }

  const monthHolidays = holidayItems.filter((item) =>
    item.holidayDate.startsWith(`${scheduleMonth}-`)
  );

  if (monthHolidays.length === 0) {
    return null;
  }

  const rows = overview.groups.flatMap((group) => group.rows);

  if (rows.length === 0) {
    return null;
  }

  if (rows.some((row) => row.entry.section === "legal-holiday")) {
    return null;
  }

  return {
    scheduleMonth,
    holidayLabels: monthHolidays.map(formatHolidayLabel)
  };
};

export const buildHolidayMissingGuidance = (gap: HolidayMarkingGap): GuidanceConfig => ({
  title: "이 달 공휴일 근무가 표시되지 않았을 수 있습니다",
  why: `${gap.scheduleMonth}에는 공휴일(${gap.holidayLabels.join(
    ", "
  )})이 등록돼 있는데, 받은 근무표에서 '법정휴일 근무'로 잡힌 줄이 하나도 없습니다. 앱은 근무표의 공휴일 칸이 특별히 표시(분홍색)돼 있을 때만 그 날을 휴일 근무로 인식합니다. 표시가 빠지면 실제로 휴일에 일했더라도 목록에 나오지 않습니다.`,
  steps: [
    {
      title: "공휴일이 등록돼 있는지 확인",
      description:
        "운영 관리의 '공휴일'에서 이 달 공휴일이 등록돼 있는지 확인하고, 빠져 있으면 등록하세요."
    },
    {
      title: "근무표 다시 발행",
      description:
        "공휴일을 등록한 뒤 근무표 배포에서 이 달 근무표를 다시 발행하면 공휴일 칸이 분홍색으로 표시됩니다."
    },
    {
      title: "다시 받아 올리기",
      description:
        "새로 발행한 근무표로 현장 실적을 다시 받아 승인대기에 올리면 휴일 근무 줄이 정상으로 나옵니다."
    }
  ],
  notes: ["이 달에 휴일 근무를 한 사람이 실제로 없다면 이 안내는 무시하셔도 됩니다."],
  navigation: { label: "운영 관리로 이동", route: "operations" }
});
