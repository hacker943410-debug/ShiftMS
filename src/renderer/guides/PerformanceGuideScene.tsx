import type { CSSProperties } from "react";

import type { GuideDetailTab } from "./guide-types";
import { GuideFocusHighlight, MotionPointer, MotionRipple } from "./motion-primitives";

type PerformanceGuideSceneVariant = "overview" | "toc" | "filters" | "approval" | "history";

interface PerformanceGuideSceneProps {
  variant: PerformanceGuideSceneVariant;
  activeTab?: GuideDetailTab;
  activeFocusIndex?: number;
}

const tocItems = [
  { title: "상세 필터", description: "조회구분, 근무지, 근로유형, 연도, 월을 먼저 맞춰 승인 범위를 좁힙니다." },
  { title: "근무지 승인", description: "근무지 summary에서 상태를 확인하고 승인 단위를 먼저 정리합니다." },
  { title: "행별 검토", description: "알림, 비교, 파일 열기 버튼으로 개별 행 근거를 확인한 뒤 승인합니다." },
  { title: "승인 이력", description: "하단 승인 이력에서 처리자와 비고를 다시 조회합니다." }
];

const filterItems = [
  { label: "조회구분", value: "승인대기" },
  { label: "근무지", value: "보라매DC" },
  { label: "근로유형", value: "연장근무" },
  { label: "연도", value: "2026" },
  { label: "월", value: "3월" }
];

const summaryPills = [
  { label: "근무지 3곳", tone: "neutral" },
  { label: "승인 12건", tone: "info" },
  { label: "재검토 2건", tone: "warn" },
  { label: "재승인 대기 1건", tone: "neutral" }
];

const historyRows = [
  ["2026-03-28 09:12", "보라매DC", "김현수", "연장근무", "2026-03-25", "관리자", "승인", "mar-ot.xlsx"],
  ["2026-03-28 09:18", "신림CC", "이민호", "대체근무", "2026-03-26", "관리자", "재승인", "mar-sub.xlsx"]
];

const historyPrimaryRow = historyRows[0];

interface FocusChromeProps {
  active: boolean;
  animate: boolean;
  number: number;
  pointerStyle?: CSSProperties;
  rippleStyle?: CSSProperties;
  style?: CSSProperties;
}

const FocusChrome = ({
  active,
  animate,
  number,
  pointerStyle,
  rippleStyle,
  style
}: FocusChromeProps) => (
  <>
    <GuideFocusHighlight active={active} number={number} style={style} />
    {animate && active && pointerStyle ? <MotionPointer className="guide-motion-pointer--focus" style={pointerStyle} /> : null}
    {animate && active && rippleStyle ? <MotionRipple className="guide-motion-ripple--focus" style={rippleStyle} /> : null}
  </>
);

const isFlowTab = (activeTab?: GuideDetailTab) => activeTab !== "details";

export const PerformanceGuideScene = ({
  activeFocusIndex = 0,
  activeTab = "flow",
  variant
}: PerformanceGuideSceneProps) => {
  const animate = isFlowTab(activeTab);
  const visibleHistoryRows = variant === "history" ? historyRows.slice(0, 1) : historyRows;

  return (
    <div className={`guide-performance-scene guide-performance-scene--${variant}`}>
      <div className="guide-scene-browser">
        <div className="guide-scene-browser-bar">
          <div className="guide-scene-browser-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="guide-scene-browser-url">shift-mgmt / performance / 2026-03</div>
        </div>

        <div className="guide-performance-scene-canvas">
          <div className="guide-performance-scene-topbar">
            <div className="guide-performance-scene-topbar-copy">
              <strong>교대근무 및 수당 관리 시스템</strong>
              <span>실적 관리</span>
            </div>

            <div className="guide-performance-summary-pills">
              {summaryPills.map((item) => (
                <span className={`guide-performance-pill tone-${item.tone}`} key={item.label}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="guide-performance-filter-grid">
            {filterItems.map((item, index) => (
              <div className="guide-performance-filter-card guide-focus-target" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {variant === "filters" ? (
                  <FocusChrome
                    active={activeFocusIndex === index}
                    animate={animate}
                    number={index + 1}
                    pointerStyle={{ top: "54%", left: "70%" }}
                    rippleStyle={{ top: "62%", left: "73%" }}
                  />
                ) : null}
              </div>
            ))}

              <div className="guide-performance-filter-actions guide-focus-target">
                <span className="guide-performance-icon-button">▾▾</span>
                <span className="guide-performance-icon-button">▴▴</span>
                <span className="guide-performance-icon-button">↻</span>
                <span className="guide-performance-icon-button primary">✓</span>
              </div>

              {variant === "overview" ? (
                <div className="guide-focus-overlay-slot">
                  <FocusChrome
                    active={activeFocusIndex === 0}
                    animate={animate}
                    number={1}
                    pointerStyle={{ top: "46%", left: "18%" }}
                    rippleStyle={{ top: "54%", left: "20%" }}
                    style={{ top: "-8px", left: "-8px", right: "-8px", bottom: "-8px", borderRadius: "22px" }}
                  />
                </div>
              ) : null}
          </div>

          {variant !== "approval" && variant !== "history" ? (
            <article className="guide-performance-reapproval-card">
              <div>
                <strong>재승인 확정</strong>
                <span>승인완료 폴더에서 다시 올라온 파일을 현재 파일 기준으로 확정합니다.</span>
              </div>
              <div className="guide-performance-inline-pills">
                <span className="guide-performance-pill tone-neutral">대상 1건</span>
                <span className="guide-performance-pill tone-warn">재승인 대기 1건</span>
              </div>
              <span className="guide-performance-action-button primary">재승인 확정</span>
            </article>
          ) : null}

          {variant !== "history" ? (
            <article className="guide-performance-table-card">
              <div className="guide-performance-card-head">
                <div>
                  <strong>실적 현황</strong>
                  <span>근무지별 접기/펼치기로 승인 범위를 정리합니다.</span>
                </div>
                <div className="guide-performance-inline-pills">
                  <span className="guide-performance-pill tone-neutral">승인대기</span>
                  <span className="guide-performance-pill tone-neutral">보라매DC</span>
                  <span className="guide-performance-pill tone-neutral">연장근무</span>
                </div>
              </div>

              <div className="guide-performance-site-card guide-focus-target">
                <div className="guide-performance-site-copy">
                  <strong>보라매DC</strong>
                  <div className="guide-performance-inline-pills">
                    <span className="guide-performance-pill tone-neutral">실적 5건</span>
                    <span className="guide-performance-pill tone-info">승인 3건</span>
                    <span className="guide-performance-pill tone-warn">재검토 1건</span>
                  </div>
                </div>
                <div className="guide-performance-site-actions guide-focus-target">
                  <span className="guide-performance-action-button primary">승인</span>
                  <span className="guide-performance-action-button">펼치기</span>
                  {variant === "approval" ? (
                    <FocusChrome
                      active={activeFocusIndex === 1}
                      animate={animate}
                      number={2}
                      pointerStyle={{ top: "54%", left: "66%" }}
                      rippleStyle={{ top: "62%", left: "68%" }}
                    />
                  ) : null}
                </div>
                {variant === "overview" ? (
                  <FocusChrome
                    active={activeFocusIndex === 1}
                    animate={animate}
                    number={2}
                    pointerStyle={{ top: "54%", left: "84%" }}
                    rippleStyle={{ top: "62%", left: "86%" }}
                  />
                ) : null}
                {variant === "approval" ? (
                  <FocusChrome
                    active={activeFocusIndex === 0}
                    animate={animate}
                    number={1}
                    pointerStyle={{ top: "54%", left: "28%" }}
                    rippleStyle={{ top: "62%", left: "30%" }}
                  />
                ) : null}
              </div>

              <div className="guide-performance-entry-table">
                <div className="guide-performance-entry-head">
                  <span>대상</span>
                  <span>근로유형</span>
                  <span>근무일자</span>
                  <span>승인상태</span>
                  <span>관리</span>
                </div>

                {[
                  ["김현수", "연장근무", "2026-03-25", "승인대기", "승인"],
                  ["이민호", "연장근무", "2026-03-26", "승인", "비교"],
                  ["한소희", "대체근무", "2026-03-27", "재검토", "알림"]
                ].map((row, index) => (
                  <div
                    className={
                      index === 0
                        ? "guide-performance-entry-row guide-performance-entry-row--focus guide-focus-target"
                        : "guide-performance-entry-row"
                    }
                    key={`${row[0]}-${row[2]}`}
                  >
                    <div className="guide-performance-entry-primary">
                      <strong>{row[0]}</strong>
                      <span>{index === 0 ? "mar-ot.xlsx" : "mar-site.xlsx"}</span>
                    </div>
                    <span
                      className={
                        index === 2
                          ? "guide-performance-type-pill type-substitute"
                          : "guide-performance-type-pill type-overtime"
                      }
                    >
                      {row[1]}
                    </span>
                    <span>{row[2]}</span>
                    <span
                      className={
                        row[3] === "승인"
                          ? "guide-performance-pill tone-info"
                          : row[3] === "재검토"
                            ? "guide-performance-pill tone-warn"
                            : "guide-performance-pill tone-neutral"
                      }
                    >
                      {row[3]}
                    </span>
                    <div className="guide-performance-entry-actions">
                      <span className="guide-performance-mini-icon">XLS</span>
                      <span className="guide-performance-mini-icon">!</span>
                      <span className="guide-performance-mini-icon">i</span>
                      <span className="guide-performance-action-button primary">{row[4]}</span>
                    </div>
                    {variant === "approval" && index === 0 ? (
                      <FocusChrome
                        active={activeFocusIndex === 2}
                        animate={animate}
                        number={3}
                        pointerStyle={{ top: "54%", left: "88%" }}
                        rippleStyle={{ top: "62%", left: "90%" }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="guide-performance-history-card guide-focus-target">
            <div className="guide-performance-card-head">
              <div>
                <strong>승인 이력</strong>
                <span>처리시각, 처리자, 비고를 하단에서 다시 조회합니다.</span>
              </div>
              <div className="guide-performance-inline-pills">
                <span className="guide-performance-pill tone-neutral">2건</span>
                <span className="guide-performance-action-button">접기</span>
              </div>
            </div>

            <div className="guide-performance-history-table">
              <div className="guide-performance-history-head">
                <span>처리시각</span>
                <span>근무지</span>
                <span>이름</span>
                <span>유형</span>
                <span>근무일</span>
                <span>처리자</span>
                <span>비고</span>
                <span>파일</span>
              </div>

              {variant === "history" ? (
                <div className="guide-performance-history-row guide-performance-history-row--detailed guide-focus-target">
                  <span>{historyPrimaryRow[0]}</span>
                  <span>{historyPrimaryRow[1]}</span>
                  <span>{historyPrimaryRow[2]}</span>
                  <span>{historyPrimaryRow[3]}</span>
                  <span>{historyPrimaryRow[4]}</span>
                  <div className="guide-performance-history-review-block guide-focus-target">
                    <span>{historyPrimaryRow[5]}</span>
                    <span>{historyPrimaryRow[6]}</span>
                    <FocusChrome
                      active={activeFocusIndex === 1}
                      animate={animate}
                      number={2}
                      pointerStyle={{ top: "54%", left: "70%" }}
                      rippleStyle={{ top: "62%", left: "72%" }}
                      style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "14px" }}
                    />
                  </div>
                  <span className="guide-performance-history-file-cell guide-focus-target">
                    {historyPrimaryRow[7]}
                    <FocusChrome
                      active={activeFocusIndex === 2}
                      animate={animate}
                      number={3}
                      pointerStyle={{ top: "54%", left: "74%" }}
                      rippleStyle={{ top: "62%", left: "76%" }}
                      style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "14px" }}
                    />
                  </span>
                  <FocusChrome
                    active={activeFocusIndex === 0}
                    animate={animate}
                    number={1}
                    pointerStyle={{ top: "54%", left: "18%" }}
                    rippleStyle={{ top: "62%", left: "20%" }}
                    style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "16px" }}
                  />
                </div>
              ) : (
                visibleHistoryRows.map((row) => (
                  <div className="guide-performance-history-row" key={`${row[0]}-${row[2]}`}>
                    {row.map((cell) => (
                      <span key={`${row[0]}-${row[2]}-${cell}`}>{cell}</span>
                    ))}
                  </div>
                ))
              )}
            </div>

            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 2}
                animate={animate}
                number={3}
                pointerStyle={{ top: "26%", right: "12%" }}
                rippleStyle={{ top: "34%", right: "10%" }}
              />
            ) : null}

          </article>

          {variant === "toc" ? (
            <div className="guide-performance-toc-overlay">
              {tocItems.map((item, index) => (
                <div className="guide-performance-toc-card" key={item.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
