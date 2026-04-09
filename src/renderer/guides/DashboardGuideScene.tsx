import type { CSSProperties } from "react";

import type { GuideDetailTab } from "./guide-types";
import { GuideFocusHighlight, MotionPointer, MotionRipple } from "./motion-primitives";

type DashboardGuideSceneVariant = "overview" | "toc" | "filters" | "insights" | "export";

interface DashboardGuideSceneProps {
  variant: DashboardGuideSceneVariant;
  activeTab?: GuideDetailTab;
  activeFocusIndex?: number;
}

const filterItems = [
  { className: "guide-dashboard-filter-chip--year", label: "조회 연도", value: "2026" },
  { className: "guide-dashboard-filter-chip--month", label: "조회 월", value: "3월" },
  { className: "guide-dashboard-filter-chip--site", label: "근무지", value: "전체" },
  { className: "guide-dashboard-filter-chip--name", label: "이름", value: "전체" }
];

const metricItems = [
  { className: "guide-dashboard-metric-card--hours", label: "총 근로시간", value: "1,280h", tone: "blue" },
  { className: "guide-dashboard-metric-card--total-allowance", label: "총 지급수당", value: "25,400,000원", tone: "navy" },
  { className: "guide-dashboard-metric-card--overtime", label: "연장수당", value: "3,100,000원", tone: "amber" },
  { className: "guide-dashboard-metric-card--substitute", label: "대체수당", value: "980,000원", tone: "green" }
];

const tocItems = [
  { title: "조회 필터", description: "연도, 월, 근무지, 이름 순으로 범위를 좁혀 집계 기준을 맞춥니다." },
  { title: "핵심 KPI", description: "총 근로시간과 주요 수당 금액을 먼저 확인해 이상 징후를 빠르게 찾습니다." },
  { title: "차트 분석", description: "월별 추이, 근무지 비교, 근무 유형별 Top 10, 수당 유형 비율을 함께 보며 편차를 해석합니다." },
  { title: "문서 내보내기", description: "현재 필터 상태를 유지한 채 PDF 또는 Excel로 결과를 공유합니다." }
];

const rankingGuideTabs = [
  { key: "legalHoliday", label: "법정휴일" },
  { key: "substitute", label: "대체근무" },
  { key: "overtime", label: "연장근무" }
];

interface FocusChromeProps {
  active: boolean;
  animate: boolean;
  number: number;
  pointerStyle?: CSSProperties;
  rippleStyle?: CSSProperties;
}

const FocusChrome = ({ active, animate, number, pointerStyle, rippleStyle }: FocusChromeProps) => (
  <>
    <GuideFocusHighlight active={active} number={number} />
    {animate && active && pointerStyle ? <MotionPointer className="guide-motion-pointer--focus" style={pointerStyle} /> : null}
    {animate && active && rippleStyle ? <MotionRipple className="guide-motion-ripple--focus" style={rippleStyle} /> : null}
  </>
);

const isFlowTab = (activeTab?: GuideDetailTab) => activeTab !== "details";

export const DashboardGuideScene = ({
  activeFocusIndex = 0,
  activeTab = "flow",
  variant
}: DashboardGuideSceneProps) => {
  const animate = isFlowTab(activeTab);

  return (
    <div className={`guide-dashboard-scene guide-dashboard-scene--${variant}`}>
      <div className="guide-scene-browser">
        <div className="guide-scene-browser-bar">
          <div className="guide-scene-browser-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="guide-scene-browser-url">shift-mgmt / dashboard / 2026-03</div>
        </div>

        <div className="guide-dashboard-scene-canvas">
          <div className="guide-dashboard-scene-topbar">
            <div className="guide-dashboard-scene-topbar-copy">
              <strong>교대근무 및 수당 관리 시스템</strong>
              <span>대시보드</span>
            </div>
            <div className="guide-dashboard-scene-export-actions guide-focus-target">
              <span className="guide-dashboard-action-chip guide-dashboard-action-chip--pdf">PDF</span>
              <span className="guide-dashboard-action-chip guide-dashboard-action-chip--excel">Excel</span>
              {variant === "overview" ? (
                <FocusChrome
                  active={activeFocusIndex === 3}
                  animate={animate}
                  number={4}
                  pointerStyle={{ top: "54%", left: "72%" }}
                  rippleStyle={{ top: "62%", left: "75%" }}
                />
              ) : null}
              {variant === "export" ? (
                <FocusChrome
                  active={activeFocusIndex === 1}
                  animate={animate}
                  number={2}
                  pointerStyle={{ top: "54%", left: "72%" }}
                  rippleStyle={{ top: "62%", left: "75%" }}
                />
              ) : null}
            </div>
          </div>

          <div className="guide-dashboard-scene-filter-row">
            {filterItems.map((item, index) => (
              <div className={`guide-dashboard-filter-chip ${item.className} guide-focus-target`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {variant === "filters" ? (
                  <FocusChrome
                    active={activeFocusIndex === index}
                    animate={animate}
                    number={index + 1}
                    pointerStyle={{ top: "54%", left: "68%" }}
                    rippleStyle={{ top: "62%", left: "72%" }}
                  />
                ) : null}
              </div>
            ))}
            {variant === "overview" ? (
              <div className="guide-focus-overlay-slot">
                <FocusChrome
                  active={activeFocusIndex === 0}
                  animate={animate}
                  number={1}
                  pointerStyle={{ top: "54%", left: "22%" }}
                  rippleStyle={{ top: "62%", left: "24%" }}
                />
              </div>
            ) : null}
            {variant === "export" ? (
              <div className="guide-focus-overlay-slot">
                <FocusChrome
                  active={activeFocusIndex === 0}
                  animate={animate}
                  number={1}
                  pointerStyle={{ top: "54%", left: "24%" }}
                  rippleStyle={{ top: "62%", left: "26%" }}
                />
              </div>
            ) : null}
          </div>

          <div className="guide-dashboard-scene-metric-row guide-focus-target">
            {metricItems.map((item) => (
              <div className={`guide-dashboard-metric-card ${item.className} tone-${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 1}
                animate={animate}
                number={2}
                pointerStyle={{ top: "54%", left: "28%" }}
                rippleStyle={{ top: "62%", left: "30%" }}
              />
            ) : null}
            {variant === "insights" ? (
              <FocusChrome
                active={activeFocusIndex === 0}
                animate={animate}
                number={1}
                pointerStyle={{ top: "54%", left: "28%" }}
                rippleStyle={{ top: "62%", left: "30%" }}
              />
            ) : null}
          </div>

          <div className="guide-dashboard-scene-grid guide-focus-target">
            <article className="guide-dashboard-panel guide-dashboard-panel--trend guide-focus-target">
              <div className="guide-dashboard-panel-heading">
                <strong>월별 수당 지급 추이</strong>
                <span>최근 6개월</span>
              </div>
              <svg
                aria-hidden="true"
                className="guide-dashboard-line-chart"
                fill="none"
                viewBox="0 0 160 84"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M0 82H160" stroke="#D7DFEE" strokeDasharray="4 4" />
                <path d="M8 63L34 49L60 52L86 34L112 28L150 19" stroke="#315CCF" strokeLinecap="round" strokeWidth="4" />
                <path d="M8 72L34 66L60 61L86 58L112 46L150 40" stroke="#3DA765" strokeLinecap="round" strokeWidth="4" />
                <path d="M8 76L34 71L60 68L86 63L112 55L150 49" stroke="#E39A2D" strokeLinecap="round" strokeWidth="4" />
              </svg>
              {variant === "insights" ? (
                <FocusChrome
                  active={activeFocusIndex === 1}
                  animate={animate}
                  number={2}
                  pointerStyle={{ top: "54%", left: "76%" }}
                  rippleStyle={{ top: "62%", left: "78%" }}
                />
              ) : null}
            </article>

            <article className="guide-dashboard-panel guide-dashboard-panel--site">
              <div className="guide-dashboard-panel-heading">
                <strong>근무지별 수당 현황</strong>
                <span>상위 4개 근무지</span>
              </div>
              <div className="guide-dashboard-bar-stack">
                {["보라매DC", "신림CC", "안양센터", "인천허브"].map((label, index) => (
                  <div className="guide-dashboard-bar-row" key={label}>
                    <span>{label}</span>
                    <div>
                      <i style={{ width: `${82 - index * 14}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="guide-dashboard-panel guide-dashboard-panel--ranking">
              <div className="guide-dashboard-panel-heading guide-dashboard-panel-heading--stacked">
                <div className="guide-dashboard-panel-heading guide-dashboard-panel-heading--top">
                  <div className="guide-dashboard-panel-heading-copy">
                    <strong>근무 유형별 상위 인원</strong>
                    <span>Top 10</span>
                  </div>
                  <div className="guide-dashboard-panel-actions">
                    <span className="guide-dashboard-panel-unit">단위: 원</span>
                    <div className="guide-dashboard-panel-export-actions">
                      <span className="guide-dashboard-action-chip guide-dashboard-action-chip--panel">PDF</span>
                      <span className="guide-dashboard-action-chip guide-dashboard-action-chip--panel">Excel</span>
                    </div>
                  </div>
                </div>
                <div className="guide-dashboard-ranking-tabs" role="tablist">
                  {rankingGuideTabs.map((tab) => (
                    <span
                      aria-selected={tab.key === "overtime"}
                      className={`guide-dashboard-ranking-tab${tab.key === "overtime" ? " is-active" : ""}`}
                      key={tab.key}
                      role="tab"
                    >
                      {tab.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="guide-dashboard-ranking-list">
                {[
                  "김현수 · 보라매DC · 41.0h · 875,000원",
                  "이민호 · 보라매DC · 38.5h · 808,500원",
                  "한소희 · 신림CC · 36.0h · 756,000원",
                  "강민수 · 본사 · 34.5h · 724,500원",
                  "정유진 · 안양센터 · 33.0h · 693,000원"
                ].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>

            <article className="guide-dashboard-panel guide-dashboard-panel--ratio guide-focus-target">
              <div className="guide-dashboard-panel-heading">
                <strong>전사 수당 유형 비율</strong>
                <span>연장 · 대체 · 휴일</span>
              </div>
              <div className="guide-dashboard-ratio-layout">
                <div className="guide-dashboard-donut-chart" />
                <div className="guide-dashboard-ratio-legend">
                  <span>연장수당 55%</span>
                  <span>대체수당 18%</span>
                  <span>휴일수당 27%</span>
                </div>
              </div>
              {variant === "insights" ? (
                <FocusChrome
                  active={activeFocusIndex === 2}
                  animate={animate}
                  number={3}
                  pointerStyle={{ top: "54%", left: "70%" }}
                  rippleStyle={{ top: "62%", left: "72%" }}
                />
              ) : null}
            </article>
            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 2}
                animate={animate}
                number={3}
                pointerStyle={{ top: "20%", right: "16%" }}
                rippleStyle={{ top: "28%", right: "14%" }}
              />
            ) : null}
          </div>

          {variant === "toc" ? (
            <div className="guide-dashboard-toc-overlay">
              {tocItems.map((item, index) => (
                <div className="guide-dashboard-toc-card" key={item.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          ) : null}

          {variant === "export" ? (
            <div className="guide-dashboard-export-toast guide-focus-target">
              <strong>내보내기 완료</strong>
              <span>dashboard-report-2026-03.pdf 저장</span>
              <FocusChrome
                active={activeFocusIndex === 2}
                animate={animate}
                number={3}
                pointerStyle={{ top: "54%", left: "78%" }}
                rippleStyle={{ top: "62%", left: "80%" }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
