import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";

import { buildAppDisplayTitle } from "@shared/config/app-brand";
import type { AppHealth } from "@shared/bridge/contracts";
import type { AuthSession } from "@shared/domain/model";

import logoImage from "../assets/brand-logo-clean.png";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { appRoutes } from "../route-config";

const DashboardScreen = lazy(() =>
  import("../screens/DashboardScreen").then((module) => ({
    default: module.DashboardScreen
  }))
);
const WorkforceManagementScreen = lazy(() =>
  import("../screens/WorkforceManagementScreen").then((module) => ({
    default: module.WorkforceManagementScreen
  }))
);
const SiteManagementScreen = lazy(() =>
  import("../screens/SiteManagementScreen").then((module) => ({
    default: module.SiteManagementScreen
  }))
);
const ScheduleManagementScreen = lazy(() =>
  import("../screens/ScheduleManagementScreen").then((module) => ({
    default: module.ScheduleManagementScreen
  }))
);
const PerformanceManagementScreen = lazy(() =>
  import("../screens/PerformanceManagementScreen").then((module) => ({
    default: module.PerformanceManagementScreen
  }))
);
const AllowanceManagementScreen = lazy(() =>
  import("../screens/AllowanceManagementScreen").then((module) => ({
    default: module.AllowanceManagementScreen
  }))
);
const ShiftPatternManagementScreen = lazy(() =>
  import("../screens/ShiftPatternManagementScreen").then((module) => ({
    default: module.ShiftPatternManagementScreen
  }))
);

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

const ScreenLoadingFallback = () => (
  <section className="surface-card">
    <div className="section-heading compact-heading">
      <div>
        <h3>화면 로딩 중</h3>
        <p>선택한 메뉴 화면을 불러오고 있습니다.</p>
      </div>
    </div>
  </section>
);

const getRoleLabel = (role: AuthSession["role"]) => (role === "admin" ? "관리자" : "사용자");

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const targetDate = new Date(value);

  if (Number.isNaN(targetDate.getTime())) {
    return "-";
  }

  return targetDate.toLocaleString("ko-KR", {
    hour12: false
  });
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
  const [showAccountModal, setShowAccountModal] = useState(false);
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
            <img alt="앱 로고" className="brand-logo" src={logoImage} />
          </div>
          <div className="brand-copy">
            <p className="brand-overline">{buildAppDisplayTitle(appVersion)}</p>
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
            <button
              className="profile-summary-button"
              onClick={() => {
                setShowAccountModal(true);
              }}
              type="button"
            >
              <div className="profile-summary-card">
                <span className="profile-summary-avatar">{session.displayName.slice(0, 1)}</span>
                <div>
                  <strong>{session.displayName}</strong>
                  <span>{getRoleLabel(session.role)}</span>
                </div>
                <span className="profile-summary-action">내 정보</span>
              </div>
            </button>
          </div>
        </header>

        <Suspense fallback={<ScreenLoadingFallback />}>{renderScreen(currentRoute.key)}</Suspense>
      </main>

      {showAccountModal ? (
        <div className="modal-overlay">
          <div aria-modal="true" className="modal-card account-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3>내 정보</h3>
                <p>로그인 계정 정보와 현재 세션 상태를 확인합니다.</p>
              </div>
            </div>

            <section className="account-hero-card">
              <span className="account-hero-avatar">{session.displayName.slice(0, 1)}</span>
              <div className="account-hero-copy">
                <strong>{session.displayName}</strong>
                <span>{getRoleLabel(session.role)}</span>
                <em>로그인 ID {session.loginId}</em>
              </div>
            </section>

            <div className="account-panel-grid">
              <section className="sidebar-panel account-panel">
                <p className="section-kicker">내 정보</p>
                <div className="account-info-list">
                  <div className="account-info-item">
                    <span>이름</span>
                    <strong>{session.displayName}</strong>
                  </div>
                  <div className="account-info-item">
                    <span>권한</span>
                    <strong>{getRoleLabel(session.role)}</strong>
                  </div>
                  <div className="account-info-item">
                    <span>로그인 ID</span>
                    <strong>{session.loginId}</strong>
                  </div>
                  <div className="account-info-item">
                    <span>사용자 ID</span>
                    <code className="account-inline-code">{session.userId}</code>
                  </div>
                </div>
              </section>

              <section className="sidebar-panel account-panel">
                <p className="section-kicker">세션 정보</p>
                <div className="account-info-list">
                  <div className="account-info-item">
                    <span>만료 시각</span>
                    <strong>{formatDateTime(session.expiresAt)}</strong>
                  </div>
                  <div className="account-info-item">
                    <span>세션 토큰</span>
                    <code className="account-inline-code account-inline-code-token">
                      {session.sessionToken}
                    </code>
                  </div>
                </div>
              </section>
            </div>

            <section className="sidebar-panel account-panel">
              <p className="section-kicker">앱 상태</p>
              <div className="account-info-list">
                <div className="account-info-item">
                  <span>버전</span>
                  <strong>{appVersion}</strong>
                </div>
                <div className="account-info-item">
                  <span>DB</span>
                  <strong>{health?.databaseConfigured ? "정상" : "미설정"}</strong>
                </div>
                <div className="account-info-item">
                  <span>승인대기</span>
                  <strong>{health?.pendingDirectoryConfigured ? "연결됨" : "미설정"}</strong>
                </div>
                <div className="account-info-item">
                  <span>승인완료</span>
                  <strong>{health?.approvedDirectoryConfigured ? "연결됨" : "미설정"}</strong>
                </div>
              </div>
            </section>

            <div className="button-row">
              <button
                className="ghost-button"
                onClick={() => {
                  setShowAccountModal(false);
                }}
                type="button"
              >
                닫기
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setShowAccountModal(false);
                  void onSignOut();
                }}
                type="button"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
