import type { CalculationCase } from "./calculation";

export const regressionCalculationCases: CalculationCase[] = [
  {
    id: "case-01",
    description: "자정 넘김 없는 기본 주간 근무",
    workDate: "2026-03-02",
    timeRange: {
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 480,
      baseWorkMinutes: 480,
      overtimeMinutes: 0,
      nightMinutes: 0
    }
  },
  {
    id: "case-02",
    description: "기본 8시간 초과분이 연장근로로 분리되는 케이스",
    workDate: "2026-03-03",
    timeRange: {
      startTime: "09:00",
      endTime: "20:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 600,
      baseWorkMinutes: 480,
      overtimeMinutes: 120,
      nightMinutes: 0
    }
  },
  {
    id: "case-03",
    description: "자정을 넘기는 야간 근무",
    workDate: "2026-03-04",
    timeRange: {
      startTime: "22:00",
      endTime: "06:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 420,
      nightMinutes: 420
    }
  },
  {
    id: "case-04",
    description: "저녁부터 익일 새벽까지 이어지는 근무",
    workDate: "2026-03-05",
    timeRange: {
      startTime: "18:00",
      endTime: "04:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 540,
      baseWorkMinutes: 480,
      overtimeMinutes: 60,
      nightMinutes: 300
    }
  },
  {
    id: "case-06",
    description: "공휴일 캘린더에 포함된 날짜의 근무",
    workDate: "2026-03-01",
    isHoliday: true,
    timeRange: {
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 480,
      holidayMinutes: 480
    }
  },
  {
    id: "case-07",
    description: "공휴일 근무가 8시간을 초과하는 경우",
    workDate: "2026-03-01",
    isHoliday: true,
    timeRange: {
      startTime: "09:00",
      endTime: "21:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 660,
      holidayMinutes: 660
    }
  },
  {
    id: "case-08",
    description: "근무 유형이 대체근로로 분류되는 경우",
    workDate: "2026-03-08",
    workType: "substitute",
    timeRange: {
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 480,
      substituteMinutes: 480
    }
  },
  {
    id: "case-09",
    description: "종료 시간이 시작 시간보다 이르지만 정상 자정 넘김으로 해석되어야 하는 케이스",
    workDate: "2026-03-09",
    timeRange: {
      startTime: "23:30",
      endTime: "02:30",
      breakMinutes: 30
    },
    expected: {
      totalWorkMinutes: 150
    }
  },
  {
    id: "case-10",
    description: "설계 예시 22:00~08:00의 자동 휴게시간과 야간근로시간",
    workDate: "2026-03-10",
    timeRange: {
      startTime: "22:00",
      endTime: "08:00",
      breakMinutes: 90
    },
    expected: {
      totalWorkMinutes: 510,
      nightMinutes: 390
    }
  },
  {
    id: "case-11",
    description: "설계 예시 23:00~07:00의 자동 휴게시간과 야간근로시간",
    workDate: "2026-03-11",
    timeRange: {
      startTime: "23:00",
      endTime: "07:00",
      breakMinutes: 60
    },
    expected: {
      totalWorkMinutes: 420,
      nightMinutes: 360
    }
  },
  {
    id: "case-12",
    description: "설계 예시 17:00~05:00의 자동 휴게시간과 야간근로시간",
    workDate: "2026-03-12",
    timeRange: {
      startTime: "17:00",
      endTime: "05:00",
      breakMinutes: 90
    },
    expected: {
      totalWorkMinutes: 630,
      nightMinutes: 330
    }
  }
];
