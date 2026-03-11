import { startTransition, useDeferredValue, useMemo, useState } from "react";

import type { AppHealth } from "@shared/bridge/contracts";
import type { AuthSession } from "@shared/domain/model";
import { formatCurrency } from "@shared/lib/formatCurrency";
import { appRoutes } from "../route-config";
import { PerformanceManagementScreen } from "../screens/PerformanceManagementScreen";
import { SiteManagementScreen } from "../screens/SiteManagementScreen";
import { WorkforceManagementScreen } from "../screens/WorkforceManagementScreen";
import { StatusBadge } from "./StatusBadge";

const siteOptions = ["전체", "보라매DC", "동탄센터", "인천허브"];

const metricCards = [
  {
    label: "이번 달 총근로수당",
    value: formatCurrency(186400000),
    note: "승인 완료 91건 기준"
  },
  {
    label: "승인 대기 실적",
    value: "18건",
    note: "연장근로 9건, 대체근로 6건, 휴일근로 3건"
  },
  {
    label: "근무 중 인력",
    value: "126명",
    note: "직무해제 예정 4명 포함"
  },
  {
    label: "이번 달 배포 예정 근무표",
    value: "12개 사이트",
    note: "Excel 양식 자동 생성 준비"
  }
];

const approvalQueue = [
  {
    title: "보라매DC / 대체근로",
    detail: "김현우 외 4명, 2026-03 승인 대기",
    status: "우선 확인"
  },
  {
    title: "동탄센터 / 연장근로",
    detail: "야간근로 포함 7건, 폴더 수신 완료",
    status: "파싱 준비"
  },
  {
    title: "인천허브 / 법정휴일근로",
    detail: "공휴일 요율 2026 기준 검토 필요",
    status: "요율 확인"
  }
];

const implementationTracks = [
  {
    title: "파일 감시 서비스",
    detail: "승인대기/승인완료 폴더를 main process에서 감시"
  },
  {
    title: "근무 패턴 시뮬레이터",
    detail: "패턴 문자열과 시작일 기준으로 달력 계산"
  },
  {
    title: "수당 계산 엔진",
    detail: "기본/연장/야간 시간과 요율 산정 로직 분리"
  }
];

interface DashboardShellProps {
  appVersion: string;
  health: AppHealth | null;
  session: AuthSession;
  onSignOut: () => Promise<void>;
}

export const DashboardShell = ({
  appVersion,
  health,
  session,
  onSignOut
}: DashboardShellProps) => {
  const [selectedSite, setSelectedSite] = useState(siteOptions[0]);
  const [activeMenu, setActiveMenu] = useState("대시보드");
  const deferredSite = useDeferredValue(selectedSite);
  const healthItems = useMemo(
    () => [
      {
        label: "데이터 경로",
        ok: health?.databaseConfigured ?? false
      },
      {
        label: "승인대기 폴더",
        ok: health?.pendingDirectoryConfigured ?? false
      },
      {
        label: "승인완료 폴더",
        ok: health?.approvedDirectoryConfigured ?? false
      }
    ],
    [health]
  );
  const visibleRoutes = useMemo(
    () => appRoutes.filter((route) => !route.adminOnly || session.role === "admin"),
    [session.role]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Shift Operations Studio</p>
          <h1>ShiftMgmt V3.4</h1>
          <p className="brand-copy">
            근무표 배포부터 실적 승인과 수당 산출까지 한 화면에서 이어지는 로컬 운영 콘솔
          </p>
        </div>

        <nav className="menu-list">
          {visibleRoutes.map((route) => (
            <button
              key={route.path}
              className={route.menuLabel === activeMenu ? "menu-item active" : "menu-item"}
              onClick={() => {
                setActiveMenu(route.menuLabel);
              }}
              type="button"
            >
              {route.menuLabel}
            </button>
          ))}
        </nav>

        <section className="status-panel">
          <span className="status-label">세션 정보</span>
          <strong>{session.displayName}</strong>
          <p>{session.role === "admin" ? "관리자 권한" : "운영 사용자 권한"}</p>
          <button
            className="secondary-button"
            onClick={() => {
              void onSignOut();
            }}
            type="button"
          >
            로그아웃
          </button>
        </section>

        <section className="diagnostic-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">진단 상태</p>
              <h2>앱 초기 진단</h2>
            </div>
          </div>
          <div className="diagnostic-list">
            {healthItems.map((item) => (
              <div
                key={item.label}
                className="diagnostic-item"
              >
                <span>{item.label}</span>
                <StatusBadge
                  label={item.ok ? "정상" : "점검 필요"}
                  tone={item.ok ? "good" : "bad"}
                />
              </div>
            ))}
          </div>
          <p className="diagnostic-copy">앱 버전 {appVersion}</p>
        </section>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">운영 브리프</p>
            <h2>{activeMenu}</h2>
          </div>
          <div className="topbar-meta">
            <span className="context-badge">{session.loginId}</span>
            <span className="context-badge">{health?.environment ?? "development"}</span>
          </div>
        </header>

        {activeMenu === "인력 관리" ? <WorkforceManagementScreen /> : null}
        {activeMenu === "근무지 관리" ? <SiteManagementScreen /> : null}
        {activeMenu === "실적 관리" ? <PerformanceManagementScreen /> : null}
        {activeMenu !== "대시보드" &&
        activeMenu !== "인력 관리" &&
        activeMenu !== "근무지 관리" &&
        activeMenu !== "실적 관리" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">준비 중</p>
                <h3>{activeMenu} 화면 골격은 다음 패치에서 연결합니다</h3>
              </div>
            </div>
            <p className="hero-copy">
              현재 단계에서는 인증, 앱 셸, 인력/근무지 관리 화면 골격을 우선 연결했습니다.
            </p>
          </section>
        ) : null}

        {activeMenu === "대시보드" ? (
          <>
            <section className="hero-card">
          <div>
            <p className="eyebrow">운영 요약</p>
            <h3>승인 흐름, 수당 흐름, 배포 현황을 한 화면에 배치했습니다</h3>
            <p className="hero-copy">
              현재는 인증과 앱 셸 골격이 연결된 상태이며, 다음 단계에서 라우팅과 실제 데이터
              조회를 각 메뉴별로 분리할 예정입니다.
            </p>
          </div>

          <div className="site-filter">
            <span className="status-label">조회 사이트</span>
            <div className="chip-row">
              {siteOptions.map((site) => (
                <button
                  key={site}
                  className={site === selectedSite ? "chip active" : "chip"}
                  onClick={() => {
                    startTransition(() => setSelectedSite(site));
                  }}
                  type="button"
                >
                  {site}
                </button>
              ))}
            </div>
            <p className="site-caption">
              현재 표시 기준: <strong>{deferredSite}</strong>
            </p>
          </div>
        </section>

        <section className="metric-grid">
          {metricCards.map((card) => (
            <article
              key={card.label}
              className="metric-card"
            >
              <span className="metric-label">{card.label}</span>
              <strong className="metric-value">{card.value}</strong>
              <p className="metric-note">{card.note}</p>
            </article>
          ))}
        </section>

        <section className="panel-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">승인 큐</p>
                <h3>실적 관리 우선순위</h3>
              </div>
              <span className="panel-badge">3개 트랙</span>
            </div>
            <div className="stack-list">
              {approvalQueue.map((item) => (
                <div
                  key={item.title}
                  className="stack-card"
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className="stack-tag">{item.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">구현 로드맵</p>
                <h3>다음 단계 우선 작업</h3>
              </div>
              <span className="panel-badge accent">V3.4</span>
            </div>
            <ol className="roadmap-list">
              {implementationTracks.map((track, index) => (
                <li
                  key={track.title}
                  className="roadmap-item"
                >
                  <span className="roadmap-index">0{index + 1}</span>
                  <div>
                    <strong>{track.title}</strong>
                    <p>{track.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </section>
          </>
        ) : null}
      </main>
    </div>
  );
};
