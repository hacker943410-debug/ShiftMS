export type RouteKey =
  | "dashboard"
  | "workforce"
  | "sites"
  | "schedule"
  | "performance"
  | "allowance"
  | "operations"
  | "access-history";

export const dashboardFilters = {
  year: "2026",
  month: "3월",
  site: "전체",
  employee: "전체"
};

export const dashboardMetrics = [
  { label: "총 근로시간", value: "1,280h", note: "법정휴일 포함", tone: "blue" },
  { label: "연장 근로시간", value: "120h", note: "전월 대비 +12h", tone: "amber" },
  { label: "야간 근로시간", value: "350h", note: "3개 사이트 누계", tone: "indigo" },
  { label: "대체 근로시간", value: "48h", note: "승인 완료 기준", tone: "red" },
  { label: "총 지급수당", value: "25,400,000원", note: "2026년 3월 집계", tone: "blue" },
  { label: "연장 근로수당", value: "3,100,000원", note: "야간 제외", tone: "amber" },
  { label: "야간 근로수당", value: "4,500,000원", note: "22:00 ~ 06:00", tone: "indigo" },
  { label: "대체 근로수당", value: "980,000원", note: "평일/휴일 대체 포함", tone: "red" }
];

export const dashboardSiteAllowance = [
  { label: "보라매DC", amount: 9300000 },
  { label: "신림CC", amount: 7200000 },
  { label: "안양센터", amount: 5100000 },
  { label: "인천허브", amount: 4300000 }
];

export const dashboardMonthlyTrend = [
  { month: "10월", hours: 1100 },
  { month: "11월", hours: 1180 },
  { month: "12월", hours: 1240 },
  { month: "1월", hours: 1205 },
  { month: "2월", hours: 1260 },
  { month: "3월", hours: 1280 }
];

export const dashboardFocusItems = [
  {
    title: "실적 승인",
    detail: "보라매DC 승인대기 12건, 연장근로 5건 우선 확인",
    status: "우선 확인"
  },
  {
    title: "근무표 배포",
    detail: "4월 근무표 3개 사이트 미배포, 템플릿 경로 점검 필요",
    status: "배포 준비"
  },
  {
    title: "품의 준비",
    detail: "3월 지급 수당 집계 완료, 별첨 1·2 생성 대기",
    status: "결재 전 검토"
  }
];

export const employeeFilters = {
  site: "전체",
  status: "근무중",
  result: "전체"
};

export const employees = [
  {
    employeeCode: "2024001",
    grade: "사원",
    name: "김철수",
    birthDate: "1996-02-14",
    hireDate: "2024-01-02",
    siteName: "보라매DC",
    shiftGroup: "A조",
    hourlyRate: "10,000원",
    role: "교대근무",
    workPeriod: "2년 2개월",
    status: "근무중",
    assignmentDate: "2024-01-10",
    releaseDate: "",
    workHistory: [
      "2025-02-01 근무지: 안양센터 -> 보라매DC",
      "2024-01-10 근무대기 -> 보라매DC / A조"
    ],
    wageHistory: [
      "2026-01-01 통상시급: 9,860원 -> 10,000원",
      "2024-01-02 입사시급: 9,860원"
    ]
  },
  {
    employeeCode: "2024002",
    grade: "대리",
    name: "이영희",
    birthDate: "1992-07-09",
    hireDate: "2023-09-01",
    siteName: "신림CC",
    shiftGroup: "B조",
    hourlyRate: "12,500원",
    role: "교대근무",
    workPeriod: "2년 6개월",
    status: "근무중",
    assignmentDate: "2023-09-03",
    releaseDate: "",
    workHistory: [
      "2024-06-01 근무조: A조 -> B조",
      "2023-09-03 근무대기 -> 신림CC / A조"
    ],
    wageHistory: [
      "2025-01-01 통상시급: 12,000원 -> 12,500원",
      "2023-09-01 입사시급: 11,200원"
    ]
  },
  {
    employeeCode: "2024003",
    grade: "과장",
    name: "박민수",
    birthDate: "1988-04-22",
    hireDate: "2022-05-16",
    siteName: "인천허브",
    shiftGroup: "Pool",
    hourlyRate: "13,200원",
    role: "교대근무",
    workPeriod: "3년 10개월",
    status: "직무해제 예정",
    assignmentDate: "2024-04-01",
    releaseDate: "2026-03-20",
    workHistory: [
      "2024-04-01 근무지: 동탄센터 -> 인천허브",
      "2023-11-01 근무조: C조 -> Pool"
    ],
    wageHistory: [
      "2026-02-01 통상시급: 12,900원 -> 13,200원",
      "2024-01-01 통상시급: 12,100원 -> 12,900원"
    ]
  }
];

export const siteTabs = ["근무지 등록", "근무유형 수정", "근무지 삭제"] as const;

export const sitePatternSummary = {
  siteName: "보라매DC",
  patternString: "주주주휴휴휴야야야휴휴휴",
  shiftType: "4조 3교대",
  capacity: "20명",
  poolEnabled: "사용",
  patternStartDate: "2026-03-01",
  workTimes: [
    "주간 08:00 ~ 16:00",
    "중간 16:00 ~ 00:00",
    "야간 00:00 ~ 08:00"
  ],
  breakTime: "60분",
  groups: [
    { name: "A조", index: "0" },
    { name: "B조", index: "3" },
    { name: "C조", index: "6" },
    { name: "D조", index: "9" }
  ]
};

export const simulationCalendar = [
  ["", "", "A조", "A조", "B조", "B조", "C조"],
  ["C조", "D조", "D조", "A조", "A조", "B조", "B조"],
  ["C조", "C조", "D조", "D조", "A조", "A조", "휴무"],
  ["B조", "B조", "C조", "C조", "D조", "D조", "A조"]
];

export const unassignedEmployees = [
  "김철수 (사원)",
  "이영희 (대리)",
  "박민수 (과장)",
  "유지은 (사원)",
  "홍길동 (사원)"
];

export const siteTeams = [
  { name: "A조", count: "5/5", members: ["최주동", "임꺽정", "김나리", "정소민", "김도윤"] },
  { name: "B조", count: "4/5", members: ["정약용", "이순신", "박현우", "황지민"] },
  { name: "C조", count: "5/5", members: ["오세훈", "윤미라", "최유리", "송민준", "강태훈"] },
  { name: "Pool", count: "2/4", members: ["강감찬", "을지문덕"] }
];

export const scheduleCalendar = [
  {
    day: "1",
    entries: ["김철수(주)", "박민수(야)"]
  },
  {
    day: "2",
    entries: ["김철수(주)", "이영희(야)"]
  },
  {
    day: "3",
    entries: ["이영희(야)", "유지은(휴)"]
  },
  {
    day: "4",
    entries: ["박민수(주)", "홍길동(주)"]
  },
  {
    day: "5",
    entries: ["김철수(주)", "이영희(휴)"]
  },
  {
    day: "6",
    entries: ["박민수(야)", "홍길동(주)"]
  }
];

export const scheduleSummaries = [
  { label: "주간 기본근로", value: "320h" },
  { label: "월간 연장근로", value: "48h" },
  { label: "야간근로", value: "92h" },
  { label: "법정휴일 근로", value: "24h" }
];

export const performanceGroups = [
  {
    siteName: "보라매DC",
    fileName: "2026_03_보라매DC_회신.xlsx",
    rows: [
      {
        employeeName: "김철수",
        shiftGroup: "A조",
        workDate: "2026-03-05",
        startTime: "08:00",
        endTime: "20:00",
        totalHours: "12h",
        workType: "연장근로",
        status: "승인대기",
        tone: "amber"
      },
      {
        employeeName: "이영희",
        shiftGroup: "B조",
        workDate: "2026-03-10",
        startTime: "09:00",
        endTime: "18:00",
        totalHours: "9h",
        workType: "법정휴일근로",
        status: "승인대기",
        tone: "red"
      },
      {
        employeeName: "박민수",
        shiftGroup: "Pool",
        workDate: "2026-03-12",
        startTime: "20:00",
        endTime: "08:00",
        totalHours: "12h",
        workType: "대체근로",
        status: "승인대기",
        tone: "blue"
      }
    ]
  },
  {
    siteName: "신림CC",
    fileName: "2026_03_신림CC_회신.xlsx",
    rows: [
      {
        employeeName: "유지은",
        shiftGroup: "C조",
        workDate: "2026-03-15",
        startTime: "17:00",
        endTime: "05:00",
        totalHours: "12h",
        workType: "연장근로",
        status: "승인완료",
        tone: "amber"
      }
    ]
  }
];

export const calculationRules = [
  "휴게시간: (총근로시간 / 4) * 0.5",
  "야간근로시간: 22:00 ~ 06:00 포함 시간에서 휴게시간 우선 차감",
  "기본근로시간: 야간 차감 후 남은 비야간 근로시간 중 최대 8시간",
  "연장근로시간: 기본 8시간을 채우고 남은 비야간 근로시간"
];

export const rateTable = [
  { workType: "법정공휴일", base: "1.5", overtime: "1.5", night: "1.5", year: "2026" },
  { workType: "평_대체근로수당", base: "1.5", overtime: "2.0", night: "2.5", year: "2026" },
  { workType: "휴_대체근로수당", base: "1.5", overtime: "2.0", night: "2.5", year: "2026" },
  { workType: "평_연장근로수당", base: "0", overtime: "1.5", night: "2.0", year: "2026" },
  { workType: "휴_연장근로수당", base: "0", overtime: "0", night: "0", year: "2026" }
];

export const allowanceChart = [
  { siteName: "보라매DC", amount: "15,000,000원", width: 100 },
  { siteName: "신림CC", amount: "10,000,000원", width: 76 },
  { siteName: "안양센터", amount: "6,200,000원", width: 46 }
];

export const allowanceRows = [
  {
    siteName: "보라매DC",
    employeeName: "김철수",
    allowanceType: "연장근로",
    workDate: "03-05",
    totalHours: "12h",
    baseHours: "8h",
    baseRate: "0",
    baseAmount: "0원",
    overtimeHours: "2.5h",
    overtimeRate: "1.5",
    overtimeAmount: "37,500원",
    nightHours: "1.5h",
    nightRate: "2.0",
    nightAmount: "30,000원",
    hourlyRate: "10,000원",
    totalAmount: "67,500원"
  },
  {
    siteName: "신림CC",
    employeeName: "이영희",
    allowanceType: "법정휴일",
    workDate: "03-10",
    totalHours: "9h",
    baseHours: "6.5h",
    baseRate: "1.5",
    baseAmount: "121,875원",
    overtimeHours: "0.5h",
    overtimeRate: "1.5",
    overtimeAmount: "9,375원",
    nightHours: "0h",
    nightRate: "1.5",
    nightAmount: "0원",
    hourlyRate: "12,500원",
    totalAmount: "131,250원"
  }
];

export const operationHolidayRows = {
  current: [
    { date: "2026-01-01", name: "신정" },
    { date: "2026-03-01", name: "삼일절" },
    { date: "2026-05-05", name: "어린이날" }
  ],
  external: [
    { date: "2026-01-28", name: "설날" },
    { date: "2026-01-29", name: "설날" },
    { date: "2026-03-03", name: "대체공휴일" }
  ]
};

export const operationUsers = [
  {
    loginId: "admin01",
    name: "김관리",
    role: "관리자",
    contact: "010-1111-2222",
    email: "admin@company.local",
    status: "사용중"
  },
  {
    loginId: "user03",
    name: "박담당",
    role: "사용자",
    contact: "010-3333-4444",
    email: "user03@company.local",
    status: "대기"
  }
];

export const operationTemplates = [
  { title: "근무표 양식", path: "C:\\Templates\\근무표_양식.xlsx" },
  { title: "품의서 양식", path: "C:\\Templates\\품의서_양식.xlsx" },
  { title: "별첨1 양식", path: "C:\\Templates\\별첨1_양식.xlsx" },
  { title: "별첨2 양식", path: "C:\\Templates\\별첨2_양식.xlsx" }
];
