export interface AppRouteDefinition {
  path: string;
  menuLabel: string;
  adminOnly?: boolean;
}

export const appRoutes: AppRouteDefinition[] = [
  {
    path: "/dashboard",
    menuLabel: "대시보드"
  },
  {
    path: "/workforce",
    menuLabel: "인력 관리"
  },
  {
    path: "/sites",
    menuLabel: "근무지 관리"
  },
  {
    path: "/schedule",
    menuLabel: "근무표 배포"
  },
  {
    path: "/performance",
    menuLabel: "실적 관리"
  },
  {
    path: "/allowance",
    menuLabel: "수당 관리"
  },
  {
    path: "/operations",
    menuLabel: "운영 관리",
    adminOnly: true
  }
];
