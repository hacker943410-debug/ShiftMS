import { useEffect, useLayoutEffect, useRef } from "react";

import type { AppHealth } from "@shared/bridge/contracts";
import type { AuthSession } from "@shared/domain/model";

import logoImage from "../assets/brand-logo-clean.png";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { appRoutes } from "../route-config";
import { DashboardScreen } from "../screens/DashboardScreen";
import { AllowanceManagementScreen } from "../screens/AllowanceManagementScreen";
import { PerformanceManagementScreen } from "../screens/PerformanceManagementScreen";
import { ScheduleManagementScreen } from "../screens/ScheduleManagementScreen";
import { ShiftPatternManagementScreen } from "../screens/ShiftPatternManagementScreen";
import { SiteManagementScreen } from "../screens/SiteManagementScreen";
import { WorkforceManagementScreen } from "../screens/WorkforceManagementScreen";

interface DashboardShellProps {
  appVersion: string;
  health: AppHealth | null;
  session: AuthSession;
  onSignOut: () => Promise<void>;
}

const renderScreen = (routeKey: string) => {
  switch (routeKey) {
    case "dashboard":
      return <DashboardScreen />;
    case "workforce":
      return <WorkforceManagementScreen />;
    case "sites":
      return <SiteManagementScreen />;
    case "schedule":
      return <ScheduleManagementScreen />;
    case "performance":
      return <PerformanceManagementScreen />;
    case "allowance":
      return <AllowanceManagementScreen />;
    case "operations":
      return <ShiftPatternManagementScreen />;
    default:
      return <DashboardScreen />;
  }
};

export const DashboardShell = ({
  appVersion,
  health,
  session,
  onSignOut
}: DashboardShellProps) => {
  const { activeRoute, setActiveRoute } = useAppWorkflow();
  const mainRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const visibleRoutes = appRoutes.filter((route) => !route.adminOnly || session.role === "admin");
  const currentRoute =
    visibleRoutes.find((route) => route.key === activeRoute) ?? visibleRoutes[0] ?? appRoutes[0];

  useEffect(() => {
    if (!currentRoute && visibleRoutes[0]) {
      setActiveRoute(visibleRoutes[0].key);
    }
  }, [currentRoute, setActiveRoute, visibleRoutes]);

  useLayoutEffect(() => {
    if (!currentRoute) {
      return;
    }

    window.scrollTo(0, 0);
    mainRef.current?.scrollTo(0, 0);
    titleRef.current?.focus({ preventScroll: true });
  }, [currentRoute]);

  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div className="brand-card">
          <div className="brand-logo-wrap">
            <img alt="ShiftMgmt 로고" className="brand-logo" src={logoImage} />
          </div>
          <div className="brand-copy">
            <p className="brand-overline">DT사업 1팀 교대근무 관리 시스템 V3.4</p>
          </div>
        </div>

        <nav className="route-list">
          {visibleRoutes.map((route) => (
            <button
              className={route.key === currentRoute?.key ? "route-button active" : "route-button"}
              key={route.key}
              onClick={() => {
                setActiveRoute(route.key);
              }}
              type="button"
            >
              <span>{route.menuLabel}</span>
              <small>{route.description}</small>
            </button>
          ))}
        </nav>

        <section className="sidebar-panel">
          <p className="section-kicker">세션 정보</p>
          <strong>{session.displayName}</strong>
          <span>{session.role === "admin" ? "관리자 권한" : "사용자 권한"}</span>
          <span>로그인 ID: {session.loginId}</span>
          <button
            className="ghost-button"
            onClick={() => {
              void onSignOut();
            }}
            type="button"
          >
            로그아웃
          </button>
        </section>

        <section className="sidebar-panel diagnostics">
          <p className="section-kicker">앱 진단</p>
          <div className="status-row">
            <span>DB</span>
            <strong>{health?.databaseConfigured ? "정상" : "미설정"}</strong>
          </div>
          <div className="status-row">
            <span>승인대기</span>
            <strong>{health?.pendingDirectoryConfigured ? "연결됨" : "미설정"}</strong>
          </div>
          <div className="status-row">
            <span>승인완료</span>
            <strong>{health?.approvedDirectoryConfigured ? "연결됨" : "미설정"}</strong>
          </div>
          <span>버전 {appVersion}</span>
        </section>
      </aside>

      <main className="console-main" ref={mainRef}>
        <header className="top-strip">
          <div className="top-strip-title">
            <h2 ref={titleRef} tabIndex={-1}>
              {currentRoute.menuLabel}
            </h2>
            <p>{currentRoute.description}</p>
          </div>
          <div className="top-strip-tools compact-tools">
            <span className="icon-square" />
            <div className="profile-summary-card">
              <span className="profile-summary-avatar">{session.displayName.slice(0, 1)}</span>
              <div>
                <strong>{session.displayName}</strong>
                <span>{session.role === "admin" ? "관리자" : "사용자"}</span>
              </div>
            </div>
          </div>
        </header>

        {renderScreen(currentRoute.key)}
      </main>
    </div>
  );
};
