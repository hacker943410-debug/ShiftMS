import type { CSSProperties } from "react";

import type { GuideDetailTab } from "./guide-types";
import { GuideFocusHighlight, MotionPointer, MotionRipple } from "./motion-primitives";

type ScheduleGuideSceneVariant = "overview" | "toc" | "month-site" | "distribute" | "history";

interface ScheduleGuideSceneProps {
  variant: ScheduleGuideSceneVariant;
  activeTab?: GuideDetailTab;
  activeFocusIndex?: number;
}

const tocItems = [
  { title: "월·근무지 선택", description: "배포 대상 월과 근무지, 양식을 먼저 고정해 범위를 확정합니다." },
  { title: "달력 검토", description: "달력과 근무조 편성 정보를 같이 보고 제외 인원까지 확인합니다." },
  { title: "배포 실행", description: "상단 배포 버튼을 눌러 Excel 근무표를 생성하고 저장합니다." },
  { title: "배포 이력", description: "완료된 배포 이력에서 최근 파일명과 저장 경로를 다시 확인합니다." }
] as const;

const controlItems = [
  { label: "연도", value: "2026년", className: "guide-schedule-control--year" },
  { label: "월", value: "3월", className: "guide-schedule-control--month" },
  { label: "근무지", value: "보라매DC", className: "guide-schedule-control--site" },
  { label: "배포 양식", value: "근무표_템플릿2 v1.2", className: "guide-schedule-control--template" }
] as const;

const statusPills = [
  { label: "배포 대기", tone: "neutral" },
  { label: "달력 반영 18명", tone: "info" },
  { label: "달력 제외 2명", tone: "warn" }
] as const;

const selectionCards = [
  {
    kicker: "선택 정보",
    title: "보라매DC",
    description: "6조 2교대 / 2026년 3월"
  },
  {
    kicker: "배포 기준",
    title: "승인된 양식 사용",
    description: "근무표_템플릿2 v1.2 / D·N 전용"
  },
  {
    kicker: "주의 사항",
    title: "제외 인원 2명",
    description: "Pool 운영 1명, 배정 기간 외 1명"
  }
] as const;

const calendarRows = [
  ["일", "월", "화", "수", "목", "금", "토"],
  ["", "", "", "", "", "1", "2"],
  ["3", "4", "5", "6", "7", "8", "9"],
  ["10", "11", "12", "13", "14", "15", "16"],
  ["17", "18", "19", "20", "21", "22", "23"],
  ["24", "25", "26", "27", "28", "29", "30"],
  ["31", "", "", "", "", "", ""]
] as const;

const shiftRows = [
  { group: "A조", members: ["김현수", "이민호", "박지수"], color: "blue", included: "반영 3명", excluded: "제외 0명" },
  { group: "B조", members: ["한소희", "강민수"], color: "green", included: "반영 2명", excluded: "제외 1명" },
  { group: "Pool", members: ["윤채원", "최도윤"], color: "slate", included: "반영 0명", excluded: "제외 2명" }
] as const;

const summaryRows = [
  ["김현수", "62.0h", "48.0h", "10.0h", "4.0h"],
  ["이민호", "58.0h", "44.0h", "8.0h", "6.0h"],
  ["한소희", "54.0h", "40.0h", "8.0h", "6.0h"]
] as const;

const historyRows = [
  {
    date: "2026-03-28 11:05",
    site: "보라매DC",
    month: "2026-03",
    form: "근무표_템플릿2 v1.2",
    status: "배포완료",
    file: "보라매DC_2026-03_6조2교대.xlsx"
  },
  {
    date: "2026-03-25 09:30",
    site: "신림CC",
    month: "2026-03",
    form: "근무표_템플릿1 v1.0",
    status: "배포완료",
    file: "신림CC_2026-03_3조교대.xlsx"
  }
] as const;

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
    {animate && active && pointerStyle ? (
      <MotionPointer className="guide-motion-pointer--focus" style={pointerStyle} />
    ) : null}
    {animate && active && rippleStyle ? (
      <MotionRipple className="guide-motion-ripple--focus" style={rippleStyle} />
    ) : null}
  </>
);

const isFlowTab = (activeTab?: GuideDetailTab) => activeTab !== "details";

export const ScheduleGuideScene = ({
  activeFocusIndex = 0,
  activeTab = "flow",
  variant
}: ScheduleGuideSceneProps) => {
  const animate = isFlowTab(activeTab);
  const showMainGrid = variant === "overview" || variant === "month-site" || variant === "toc";

  return (
    <div className={`guide-schedule-scene guide-schedule-scene--${variant}`}>
      <div className="guide-scene-browser">
        <div className="guide-scene-browser-bar">
          <div className="guide-scene-browser-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="guide-scene-browser-url">shift-mgmt / schedule / 2026-03</div>
        </div>

        <div className="guide-schedule-scene-canvas">
          <div className="guide-schedule-hero">
            <div className="guide-schedule-topbar-copy">
              <strong>교대근무 및 수당 관리 시스템</strong>
              <span>근무표 배포</span>
            </div>
            <div className="guide-schedule-status-pills">
              {statusPills.map((item) => (
                <span className={`guide-schedule-pill tone-${item.tone}`} key={item.label}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <article className="guide-schedule-control-card guide-focus-target">
            <div className="guide-schedule-control-grid">
              {controlItems.map((item, index) => (
                <div className={`guide-schedule-control-item ${item.className} guide-focus-target`} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  {variant === "month-site" && index < 3 ? (
                    <FocusChrome
                      active={activeFocusIndex === index}
                      animate={animate}
                      number={index + 1}
                      pointerStyle={{ top: "54%", left: "70%" }}
                      rippleStyle={{ top: "62%", left: "73%" }}
                    />
                  ) : null}
                  {variant === "distribute" && index === 3 ? (
                    <FocusChrome
                      active={activeFocusIndex === 0}
                      animate={animate}
                      number={1}
                      pointerStyle={{ top: "54%", left: "70%" }}
                      rippleStyle={{ top: "62%", left: "73%" }}
                    />
                  ) : null}
                </div>
              ))}
              <div className="guide-schedule-control-actions">
                <span className="guide-schedule-secondary-action">초기화</span>
                <span className="guide-schedule-primary-action guide-schedule-deploy-button guide-focus-target">
                  배포
                  {variant === "distribute" ? (
                    <FocusChrome
                      active={activeFocusIndex === 1}
                      animate={animate}
                      number={2}
                      pointerStyle={{ top: "54%", left: "68%" }}
                      rippleStyle={{ top: "62%", left: "70%" }}
                      style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "12px" }}
                    />
                  ) : null}
                </span>
              </div>
            </div>
            {showMainGrid ? (
              <div className="guide-schedule-meta-grid">
                {selectionCards.map((item) => (
                  <div className="guide-schedule-meta-card" key={item.kicker}>
                    <span>{item.kicker}</span>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 0}
                animate={animate}
                number={1}
                pointerStyle={{ top: "40%", left: "24%" }}
                rippleStyle={{ top: "48%", left: "26%" }}
                style={{ inset: "-8px", borderRadius: "22px" }}
              />
            ) : null}
          </article>

          {showMainGrid ? (
            <div className="guide-schedule-main-grid guide-focus-target">
              <article className="guide-schedule-card guide-schedule-calendar-card">
                <div className="guide-schedule-calendar-head">
                  <div>
                    <strong>2026년 3월 근무 달력</strong>
                    <span>보라매DC / 6조 2교대</span>
                  </div>
                  <div className="guide-schedule-mini-nav">
                    <span>←</span>
                    <span>3월</span>
                    <span>→</span>
                  </div>
                </div>
                <div className="guide-schedule-calendar-grid">
                  {calendarRows.map((row, rowIndex) => (
                    <div className="guide-schedule-calendar-row" key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <span
                          className={
                            rowIndex === 0
                              ? "guide-schedule-calendar-header"
                              : cell === "15"
                                ? "guide-schedule-calendar-cell guide-schedule-calendar-cell--today"
                                : "guide-schedule-calendar-cell"
                          }
                          key={`cell-${rowIndex}-${cellIndex}`}
                        >
                          {cell}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </article>

              <div className="guide-schedule-side-stack">
                <article className="guide-schedule-card guide-schedule-roster-card">
                  <div className="guide-schedule-section-head">
                    <div>
                      <strong>근무조 편성 정보</strong>
                      <span>달력 반영 인원과 제외 인원을 함께 봅니다.</span>
                    </div>
                    <span className="guide-schedule-secondary-action">전체 펼치기</span>
                  </div>
                  <div className="guide-schedule-roster-list">
                    {shiftRows.map((row) => (
                      <div className={`guide-schedule-shift-card guide-schedule-shift-card--${row.color}`} key={row.group}>
                        <div className="guide-schedule-shift-headline">
                          <strong>{row.group}</strong>
                          <div className="guide-schedule-shift-pills">
                            <span className="guide-schedule-pill tone-info">{row.included}</span>
                            <span className="guide-schedule-pill tone-warn">{row.excluded}</span>
                          </div>
                        </div>
                        <div className="guide-schedule-shift-members">
                          {row.members.map((name) => (
                            <span key={name}>{name}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="guide-schedule-card guide-schedule-summary-card">
                  <div className="guide-schedule-section-head">
                    <div>
                      <strong>주간 · 월간 근로시간 요약</strong>
                      <span>배포 전 주간/월간 합계를 함께 확인합니다.</span>
                    </div>
                    <div className="guide-schedule-week-pills">
                      <span className="guide-schedule-pill tone-neutral">1주</span>
                      <span className="guide-schedule-pill tone-info">2주</span>
                      <span className="guide-schedule-pill tone-neutral">3주</span>
                    </div>
                  </div>
                  <div className="guide-schedule-summary-table">
                    <div className="guide-schedule-summary-head">
                      <span>사원명</span>
                      <span>총근로</span>
                      <span>기본</span>
                      <span>연장</span>
                      <span>야간</span>
                    </div>
                    {summaryRows.map((row) => (
                      <div className="guide-schedule-summary-row" key={row[0]}>
                        {row.map((cell) => (
                          <span key={`${row[0]}-${cell}`}>{cell}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              {variant === "overview" ? (
                <FocusChrome
                  active={activeFocusIndex === 1}
                  animate={animate}
                  number={2}
                  pointerStyle={{ top: "22%", right: "16%" }}
                  rippleStyle={{ top: "30%", right: "14%" }}
                  style={{ inset: "-8px", borderRadius: "22px" }}
                />
              ) : null}
            </div>
          ) : null}

          <article className="guide-schedule-card guide-schedule-history-card guide-focus-target">
            <div className="guide-schedule-section-head">
              <div>
                <strong>배포 이력</strong>
                <span>최근 배포 결과와 파일 경로를 다시 확인합니다.</span>
              </div>
              <div className="guide-schedule-history-meta">
                <span className="guide-schedule-pill tone-info">최근 2건</span>
                <span className="guide-schedule-secondary-action">펼치기</span>
              </div>
            </div>
            <div className="guide-schedule-history-status-grid guide-focus-target">
              <div className="guide-schedule-history-status">
                <span>현재 상태</span>
                <strong>배포완료</strong>
              </div>
              <div className="guide-schedule-history-status">
                <span>최근 배포 파일</span>
                <strong>{historyRows[0].file}</strong>
              </div>
              <div className="guide-schedule-history-status guide-focus-target">
                <span>배포 경로</span>
                <strong>D:\ShiftMgmt\exports\schedule\2026-03\</strong>
                {variant === "history" ? (
                  <FocusChrome
                    active={activeFocusIndex === 2}
                    animate={animate}
                    number={3}
                    pointerStyle={{ top: "42%", left: "82%" }}
                    rippleStyle={{ top: "50%", left: "84%" }}
                    style={{ inset: "auto", top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "16px" }}
                  />
                ) : null}
                {variant === "distribute" ? (
                  <FocusChrome
                    active={activeFocusIndex === 2}
                    animate={animate}
                    number={3}
                    pointerStyle={{ top: "42%", left: "82%" }}
                    rippleStyle={{ top: "50%", left: "84%" }}
                    style={{ inset: "auto", top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "16px" }}
                  />
                ) : null}
              </div>
              {variant === "history" ? (
                <FocusChrome
                  active={activeFocusIndex === 0}
                  animate={animate}
                  number={1}
                  pointerStyle={{ top: "-16%", left: "22%" }}
                  rippleStyle={{ top: "20%", left: "24%" }}
                  style={{ inset: "-4px", borderRadius: "18px" }}
                />
              ) : null}
            </div>
            <div className="guide-schedule-history-table">
              <div className="guide-schedule-history-header">
                <span>배포 일시</span>
                <span>근무지</span>
                <span>대상 월</span>
                <span>양식</span>
                <span>결과</span>
                <span>파일명</span>
              </div>
              {historyRows.map((row, index) => (
                <div
                  className={index === 0 ? "guide-schedule-history-row guide-focus-target" : "guide-schedule-history-row"}
                  key={`${row.date}-${row.site}`}
                >
                  <span>{row.date}</span>
                  <span>{row.site}</span>
                  <span>{row.month}</span>
                  <span>{row.form}</span>
                  <span className="guide-schedule-pill tone-info">{row.status}</span>
                  <span>{row.file}</span>
                  {variant === "history" && index === 0 ? (
                    <FocusChrome
                      active={activeFocusIndex === 1}
                      animate={animate}
                      number={2}
                      pointerStyle={{ top: "54%", left: "78%" }}
                      rippleStyle={{ top: "62%", left: "80%" }}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 2}
                animate={animate}
                number={3}
                pointerStyle={{ top: "20%", right: "12%" }}
                rippleStyle={{ top: "28%", right: "10%" }}
                style={{ inset: "-6px", borderRadius: "20px" }}
              />
            ) : null}
          </article>

          {variant === "toc" ? (
            <div className="guide-schedule-toc-overlay">
              {tocItems.map((item, index) => (
                <div className="guide-schedule-toc-card" key={item.title}>
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
