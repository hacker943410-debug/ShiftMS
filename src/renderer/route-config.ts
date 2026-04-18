import type { RouteKey } from "./mock-design-data";

export interface AppRouteDefinition {
  key: RouteKey;
  menuLabel: string;
  description: string;
}

export const appRoutes: AppRouteDefinition[] = [
  {
    key: "dashboard",
    menuLabel: "대시보드",
    description: "월간 근로시간과 지급 수당을 한눈에 확인합니다."
  },
  {
    key: "workforce",
    menuLabel: "인력 관리",
    description: "사원 등록, 상세 조회, 시급 및 배정 이력을 관리합니다."
  },
  {
    key: "sites",
    menuLabel: "근무지 관리",
    description: "패턴 등록, 조직 구성, 근무지 수정과 삭제 흐름을 다룹니다."
  },
  {
    key: "schedule",
    menuLabel: "근무표 배포",
    description: "월간 근무표를 확인하고 배포 경로와 Excel 생성 흐름을 제공합니다."
  },
  {
    key: "performance",
    menuLabel: "실적 관리",
    description: "승인대기 파일을 검토하고 승인 로직을 적용합니다."
  },
  {
    key: "allowance",
    menuLabel: "수당 관리",
    description: "승인된 실적 기반 수당 상세와 품의 신청 흐름을 확인합니다."
  },
  {
    key: "operations",
    menuLabel: "운영 관리",
    description: "공휴일, 요율, 사용자, 양식을 운영 기준으로 정리합니다.",
  },
  {
    key: "access-history",
    menuLabel: "활동 이력",
    description: "로그인, 화면 이동, 주요 업무 처리 기록을 조회합니다.",
  }
];
