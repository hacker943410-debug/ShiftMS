import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { buildAppDisplayTitle } from "@shared/config/app-brand";
import type { AppHealth } from "@shared/bridge/contracts";
import type { UpdateStateSnapshot } from "@shared/domain/app-update";
import type { AuthSession } from "@shared/domain/model";
import { canAccessRoute, getRoleLabel } from "@shared/domain/authorization";

import logoImage from "../assets/brand-logo-clean.png";
import { ErrorBoundary } from "./ErrorBoundary";
import { GuidanceModal } from "./GuidanceModal";
import { GuideFlowModal } from "./GuideFlowModal";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { useDensityMode } from "./useDensityMode";
import { useDialogDismiss } from "./useDialogDismiss";
import { useAppWorkflow } from "../contexts/app-workflow-context";
import { getRouteGuide } from "../guides/route-guides";
import { appRoutes } from "../route-config";
import { AccessHistoryScreen } from "../screens/AccessHistoryScreen";
import { AllowanceManagementScreen } from "../screens/AllowanceManagementScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { PerformanceManagementScreen } from "../screens/PerformanceManagementScreen";
import { ScheduleManagementScreen } from "../screens/ScheduleManagementScreen";
import { OperationsManagementScreen } from "../screens/OperationsManagementScreen";
import { SiteManagementScreen } from "../screens/SiteManagementScreen";
import { WorkforceManagementScreen } from "../screens/WorkforceManagementScreen";

interface DashboardShellProps {
  appVersion: string;
  health: AppHealth | null;
  isChangingPassword: boolean;
  onChangePassword: (input: {
    currentPassword: string;
    nextPassword: string;
  }) => Promise<boolean>;
  onCheckForUpdates: () => void;
  onClearPasswordChangeFeedback: () => void;
  session: AuthSession;
  onSignOut: () => Promise<void>;
  passwordChangeError: string | null;
  updateState: UpdateStateSnapshot | null;
}

// 표를 촘촘히 보는 고밀도(Dense) 보기를 지원하는 화면들. 반복 행을 많이 다루는
// 실적 관리·활동 이력만 해당하며, 이 화면에서만 토글 버튼을 노출한다.
const DENSITY_CAPABLE_ROUTES = new Set(["performance", "access-history"]);

// 사이드바 메뉴 아이콘. 메뉴 라벨/설명은 그대로 두고 앞에 아이콘만 덧붙인다.
const routeGlyph = (children: ReactNode): ReactNode => (
  <svg
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    viewBox="0 0 24 24"
  >
    {children}
  </svg>
);

const ROUTE_ICONS: Record<string, ReactNode> = {
  dashboard: routeGlyph(
    <>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="14" />
      <rect height="7" rx="1.5" width="7" x="3" y="14" />
    </>
  ),
  workforce: routeGlyph(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.7-5 5.5-5s5.5 1.7 5.5 5" />
      <path d="M16 5.3a3 3 0 0 1 0 5.4M17.6 20c0-2.2-.8-3.7-2-4.6" />
    </>
  ),
  sites: routeGlyph(
    <>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V21" />
      <path d="M13 10h5.5A1.5 1.5 0 0 1 20 11.5V21" />
      <path d="M3 21h18M7 8h2M7 12h2M7 16h2M16 14h1M16 17h1" />
    </>
  ),
  schedule: routeGlyph(
    <>
      <rect height="16" rx="2" width="18" x="3" y="4.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4M9 14l2 2 4-4" />
    </>
  ),
  performance: routeGlyph(
    <>
      <path d="M8 4H6.5A1.5 1.5 0 0 0 5 5.5v14A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-14A1.5 1.5 0 0 0 17.5 4H16" />
      <rect height="3.4" rx="1" width="8" x="8" y="2.6" />
      <path d="M8.5 13l2 2 4-4" />
    </>
  ),
  allowance: routeGlyph(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 9l3.5 5 3.5-5M9.5 12.5h5M9.5 14.8h5" />
    </>
  ),
  operations: routeGlyph(
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2.3" />
      <circle cx="15" cy="17" r="2.3" />
    </>
  ),
  "access-history": routeGlyph(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.2v5l3.2 2" />
    </>
  ),
};

const renderScreen = (routeKey: string, session: AuthSession) => {
  switch (routeKey) {
    case "dashboard":
      return <DashboardScreen />;
    case "workforce":
      return <WorkforceManagementScreen />;
    case "sites":
      return <SiteManagementScreen session={session} />;
    case "schedule":
      return <ScheduleManagementScreen session={session} />;
    case "performance":
      return <PerformanceManagementScreen session={session} />;
    case "allowance":
      return <AllowanceManagementScreen session={session} />;
    case "operations":
      return <OperationsManagementScreen />;
    case "access-history":
      return <AccessHistoryScreen />;
    default:
      return <DashboardScreen />;
  }
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const targetDate = new Date(value);

  if (Number.isNaN(targetDate.getTime())) {
    return "-";
  }

  return targetDate.toLocaleString("ko-KR", {
    hour12: false,
  });
};

const getUpdateStatusLabel = (updateState: UpdateStateSnapshot | null) => {
  if (!updateState?.enabled) {
    return "비활성";
  }

  switch (updateState.status) {
    case "checking":
      return "확인 중";
    case "available":
      return "업데이트 가능";
    case "downloading":
      return `다운로드 ${updateState.downloadProgress ?? 0}%`;
    case "downloaded":
      return "재시작 필요";
    case "error":
      return "확인 실패";
    default:
      return "최신";
  }
};

export const DashboardShell = ({
  appVersion,
  health,
  isChangingPassword,
  onChangePassword,
  onCheckForUpdates,
  onClearPasswordChangeFeedback,
  session,
  onSignOut,
  passwordChangeError,
  updateState
}: DashboardShellProps) => {
  const { activeRoute, openRoute, setActiveRoute, guidance, dismissGuidance } = useAppWorkflow();
  const mainRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [passwordChangeSuccessMessage, setPasswordChangeSuccessMessage] = useState<string | null>(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const { mode: densityMode, toggle: toggleDensity } = useDensityMode();
  const visibleRoutes = appRoutes.filter((route) =>
    canAccessRoute(session.role, route.key),
  );
  const currentRoute =
    visibleRoutes.find((route) => route.key === activeRoute) ??
    visibleRoutes[0] ??
    appRoutes[0];
  const currentGuide = getRouteGuide(currentRoute.key);

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

  useEffect(() => {
    setShowGuideModal(false);
    dismissGuidance();
  }, [currentRoute.key, dismissGuidance]);

  useEffect(() => {
    if (!currentRoute) {
      return;
    }

    void window.appBridge
      .recordAccessLog({
        actionType: "route-view",
        actionLabel: "화면 이동",
        routeKey: currentRoute.key,
        routeLabel: currentRoute.menuLabel,
        details: `${currentRoute.menuLabel} 화면 진입`,
      })
      .catch(() => undefined);
  }, [currentRoute]);

  const accountDialog = useDialogDismiss<HTMLDivElement>({
    isOpen: showAccountModal,
    onDismiss: () => {
      setPasswordChangeSuccessMessage(null);
      onClearPasswordChangeFeedback();
      setShowAccountModal(false);
    }
  });
  const passwordChangeDialog = useDialogDismiss<HTMLDivElement>({
    // 비밀번호 변경 폼에는 자동 포커스 입력이 없으므로 모달 영역이 포커스를 받아야
    // 열린 직후 Esc 로 닫을 수 있다(영역 자동 포커스 유지).
    isOpen: showPasswordChangeModal,
    onDismiss: () => {
      onClearPasswordChangeFeedback();
      setShowPasswordChangeModal(false);
    }
  });

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
              className={
                route.key === currentRoute?.key
                  ? "route-button active"
                  : "route-button"
              }
              key={route.key}
              onClick={() => {
                openRoute(route.key, {
                  selectedMonth: "",
                  selectedSiteId: ""
                });
              }}
              type="button"
            >
              <span className="route-icon">{ROUTE_ICONS[route.key]}</span>
              <span className="route-button-copy">
                <span className="route-button-label">{route.menuLabel}</span>
                <small>{route.description}</small>
              </span>
            </button>
          ))}
        </nav>

        <section className="sidebar-panel diagnostics">
          <p className="section-kicker">앱 진단</p>
          <div className="status-row">
            <span className="status-label">
              <span className="status-dot" data-tone={health?.databaseConfigured ? "ok" : "muted"} />
              DB
            </span>
            <strong>{health?.databaseConfigured ? "정상" : "미설정"}</strong>
          </div>
          <div className="status-row">
            <span className="status-label">
              <span className="status-dot" data-tone={health?.pendingDirectoryConfigured ? "ok" : "muted"} />
              승인대기
            </span>
            <strong>
              {health?.pendingDirectoryConfigured ? "연결됨" : "미설정"}
            </strong>
          </div>
          <div className="status-row">
            <span className="status-label">
              <span className="status-dot" data-tone={health?.approvedDirectoryConfigured ? "ok" : "muted"} />
              승인완료
            </span>
            <strong>
              {health?.approvedDirectoryConfigured ? "연결됨" : "미설정"}
            </strong>
          </div>
          <div className="status-row">
            <span className="status-label">
              <span className="status-dot" data-tone={updateState?.enabled ? "ok" : "muted"} />
              업데이트
            </span>
            <strong>{getUpdateStatusLabel(updateState)}</strong>
          </div>
          <span>버전 {appVersion}</span>
          <button
            className="ghost-button compact-button diagnostics-update-button"
            disabled={!updateState?.enabled}
            onClick={onCheckForUpdates}
            type="button"
          >
            업데이트 확인
          </button>
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
            <button
              aria-label={updateState?.availableManifest ? "업데이트 있음 — 확인" : "업데이트 확인"}
              className="top-strip-bell"
              disabled={!updateState?.enabled}
              onClick={onCheckForUpdates}
              title="업데이트 확인"
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </svg>
              {updateState?.availableManifest ? (
                <span className="top-strip-bell-dot" />
              ) : null}
            </button>
            {DENSITY_CAPABLE_ROUTES.has(currentRoute.key) ? (
              <button
                aria-pressed={densityMode === "compact"}
                className="ghost-button compact-button density-toggle-button"
                onClick={toggleDensity}
                type="button"
              >
                {densityMode === "compact" ? "표 기본 간격" : "표 촘촘히 보기"}
              </button>
            ) : null}
            <button
              className="ghost-button compact-button guide-launch-button"
              disabled={!currentGuide}
              onClick={() => {
                setShowGuideModal(true);
              }}
              type="button"
            >
              <span aria-hidden="true" className="guide-launch-icon" />
              <span className="guide-launch-copy">
                <strong>가이드 보기</strong>
                <small>
                  {currentGuide ? "현재 메뉴 흐름 안내" : "가이드 준비 중"}
                </small>
              </span>
            </button>
            <button
              className="profile-summary-button"
              onClick={() => {
                setPasswordChangeSuccessMessage(null);
                onClearPasswordChangeFeedback();
                setShowAccountModal(true);
              }}
              type="button"
            >
              <div className="profile-summary-card">
                <span className="profile-summary-avatar">
                  {session.displayName.slice(0, 1)}
                </span>
                <div>
                  <strong>{session.displayName}</strong>
                  <span>{getRoleLabel(session.role)}</span>
                </div>
                <span className="profile-summary-action">내 정보</span>
              </div>
            </button>
          </div>
        </header>

        <ErrorBoundary resetKey={currentRoute.key} title={`${currentRoute.menuLabel} 화면 오류`}>
          {renderScreen(currentRoute.key, session)}
        </ErrorBoundary>
      </main>

      {showAccountModal ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="account-modal-title"
            aria-modal="true"
            className="modal-card account-modal"
            onKeyDown={accountDialog.onKeyDown}
            ref={accountDialog.dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3 id="account-modal-title">내 정보</h3>
                <p>로그인 계정 정보와 현재 세션 상태를 확인합니다.</p>
              </div>
            </div>

            <section className="account-hero-card">
              <span className="account-hero-avatar">
                {session.displayName.slice(0, 1)}
              </span>
              <div className="account-hero-copy">
                <strong>{session.displayName}</strong>
                <span className="account-hero-badge">
                  {getRoleLabel(session.role)} 권한
                </span>
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
                    <code className="account-inline-code">
                      {session.userId}
                    </code>
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
                    <span>{"\uC138\uC158 \uC800\uC7A5"}</span>
                    <strong>
                      {health?.sessionPolicy.persistence === "runtime-only"
                        ? "Runtime only"
                        : "-"}
                    </strong>
                  </div>
                  <div className="account-info-item">
                    <span>{"\uC571 \uC7AC\uC2DC\uC791"}</span>
                    <strong>
                      {health?.sessionPolicy.restoreOnRestart === false
                        ? "\uB2E4\uC2DC \uB85C\uADF8\uC778"
                        : "\uC138\uC158 \uBCF5\uC6D0"}
                    </strong>
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
                  <strong
                    className={
                      health?.databaseConfigured
                        ? "account-status-ok"
                        : "account-status-off"
                    }
                  >
                    {health?.databaseConfigured ? "정상" : "미설정"}
                  </strong>
                </div>
                <div className="account-info-item">
                  <span>승인대기</span>
                  <strong
                    className={
                      health?.pendingDirectoryConfigured
                        ? "account-status-ok"
                        : "account-status-off"
                    }
                  >
                    {health?.pendingDirectoryConfigured ? "연결됨" : "미설정"}
                  </strong>
                </div>
                <div className="account-info-item">
                  <span>승인완료</span>
                  <strong
                    className={
                      health?.approvedDirectoryConfigured
                        ? "account-status-ok"
                        : "account-status-off"
                    }
                  >
                    {health?.approvedDirectoryConfigured ? "연결됨" : "미설정"}
                  </strong>
                </div>
              </div>
            </section>

            <div className="button-row account-modal-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  setPasswordChangeSuccessMessage(null);
                  onClearPasswordChangeFeedback();
                  setShowPasswordChangeModal(true);
                }}
                type="button"
              >
                비밀번호 변경
              </button>
              <div className="account-modal-actions-group">
                <button
                  className="ghost-button"
                  onClick={() => {
                    setPasswordChangeSuccessMessage(null);
                    onClearPasswordChangeFeedback();
                    setShowAccountModal(false);
                  }}
                  type="button"
                >
                  닫기
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    setPasswordChangeSuccessMessage(null);
                    onClearPasswordChangeFeedback();
                    setShowAccountModal(false);
                    void onSignOut();
                  }}
                  type="button"
                >
                  로그아웃
                </button>
              </div>
            </div>
            {passwordChangeSuccessMessage ? (
              <p className="form-success-text">{passwordChangeSuccessMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showPasswordChangeModal ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="password-change-modal-title"
            aria-modal="true"
            className="modal-card password-change-modal"
            onKeyDown={passwordChangeDialog.onKeyDown}
            ref={passwordChangeDialog.dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <h3 id="password-change-modal-title">비밀번호 변경</h3>
                <p>현재 비밀번호를 확인한 뒤 새로운 비밀번호로 변경합니다.</p>
              </div>
            </div>
            <PasswordChangeForm
              cancelLabel="취소"
              errorMessage={passwordChangeError}
              isSubmitting={isChangingPassword}
              onCancel={() => {
                onClearPasswordChangeFeedback();
                setShowPasswordChangeModal(false);
              }}
              onSubmit={onChangePassword}
              onSuccess={() => {
                onClearPasswordChangeFeedback();
                setShowPasswordChangeModal(false);
                setPasswordChangeSuccessMessage("비밀번호 변경이 완료되었습니다.");
              }}
              submitLabel="변경 완료"
              submittingLabel="변경 중..."
            />
          </div>
        </div>
      ) : null}

      {showGuideModal && currentGuide ? (
        <GuideFlowModal
          guide={currentGuide}
          onClose={() => {
            setShowGuideModal(false);
          }}
        />
      ) : null}

      {guidance ? (
        <GuidanceModal config={guidance} onClose={dismissGuidance} onNavigate={openRoute} />
      ) : null}
    </div>
  );
};
