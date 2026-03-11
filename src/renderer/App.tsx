import { startTransition, useDeferredValue, useEffect, useState } from "react";

import { formatCurrency } from "@shared/lib/formatCurrency";

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

const managementMenus = [
  "대시보드",
  "인력 관리",
  "근무지 관리",
  "근무표 배포",
  "실적 관리",
  "수당 관리",
  "운영 관리"
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

export const App = () => {
  const [selectedSite, setSelectedSite] = useState(siteOptions[0]);
  const deferredSite = useDeferredValue(selectedSite);
  const [appVersion, setAppVersion] = useState("0.1.0");

  useEffect(() => {
    void window.appBridge
      .getAppVersion()
      .then((version) => setAppVersion(version))
      .catch(() => {
        setAppVersion("0.1.0");
      });
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Shift Operations Studio</p>
          <h1>ShiftMgmt V3.4</h1>
          <p className="brand-copy">
            근무표 배포부터 실적 승인과 수당 산출까지 한 화면에서
            이어지는 로컬 운영 콘솔
          </p>
        </div>

        <nav className="menu-list">
          {managementMenus.map((menu) => (
            <button
              key={menu}
              className={menu === "대시보드" ? "menu-item active" : "menu-item"}
              type="button"
            >
              {menu}
            </button>
          ))}
        </nav>

        <section className="status-panel">
          <span className="status-label">앱 버전</span>
          <strong>{appVersion}</strong>
          <p>현재 브랜치 기준 기본 셸과 작업 지침이 연결된 상태입니다.</p>
        </section>
      </aside>

      <main className="content">
        <section className="hero-card">
          <div>
            <p className="eyebrow">운영 브리프</p>
            <h2>교대근무 운영 현황을 월 단위로 조망하는 시작 화면</h2>
            <p className="hero-copy">
              사이트별 근무표, 승인 대기 실적, 수당 지급 흐름을 하나의
              대시보드로 묶는 방향으로 기본 레이아웃을 구성했습니다.
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
      </main>
    </div>
  );
};
