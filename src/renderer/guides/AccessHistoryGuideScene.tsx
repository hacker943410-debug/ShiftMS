import type { CSSProperties } from "react";

import type { GuideDetailTab } from "./guide-types";
import { GuideFocusHighlight, MotionPointer, MotionRipple } from "./motion-primitives";

type AccessHistoryGuideSceneVariant = "overview" | "toc" | "filters" | "interpret";

interface AccessHistoryGuideSceneProps {
  variant: AccessHistoryGuideSceneVariant;
  activeTab?: GuideDetailTab;
  activeFocusIndex?: number;
}

const tocItems = [
  {
    title: "날짜 필터",
    description: "조회 기간을 먼저 고정해 필요한 활동 범위만 남깁니다."
  },
  {
    title: "사용자 필터",
    description: "특정 계정의 행동만 추적할 때 사용자 필터를 추가합니다."
  },
  {
    title: "액션 필터",
    description: "승인, 반려, 문서 출력, 로그인 같은 액션 유형으로 범위를 좁힙니다."
  },
  {
    title: "이력 해석",
    description: "시간, 사용자, 액션, 대상 화면, 세부 내용을 함께 읽어 이상 행동을 판단합니다."
  }
] as const;

const filterItems = [
  { label: "조회 시작일", value: "2026-03-01", className: "guide-access-filter-card--from" },
  { label: "조회 종료일", value: "2026-03-31", className: "guide-access-filter-card--to" },
  { label: "사용자", value: "전체", className: "guide-access-filter-card--user" },
  { label: "액션", value: "전체", className: "guide-access-filter-card--action" },
  { label: "검색", value: "사용자 / 액션 / 상세", className: "guide-access-filter-card--keyword" }
] as const;

const compactFilterItems = [
  "2026-03-01 ~ 2026-03-31",
  "사용자 전체",
  "액션 전체"
] as const;

const summaryItems = [
  { label: "전체 184건", tone: "neutral" },
  { label: "실적 승인 18건", tone: "info" },
  { label: "품의 승인 3건", tone: "info" },
  { label: "로그인 실패 2건", tone: "warn" }
] as const;

const historyRows = [
  {
    time: "2026-03-28 11:32",
    user: "총괄 관리자 / admin01",
    action: "품의 승인",
    target: "수당 관리",
    detail: "2026-03 보라매C 품의 승인 실행"
  },
  {
    time: "2026-03-28 09:15",
    user: "김현수 / operator01",
    action: "실적 승인",
    target: "실적 관리",
    detail: "보라매C 야간근무 5건 승인"
  },
  {
    time: "2026-03-27 17:41",
    user: "총괄 관리자 / admin01",
    action: "품의 출력",
    target: "수당 관리",
    detail: "PDF 출력 및 품의 미리보기 확인"
  },
  {
    time: "2026-03-27 09:01",
    user: "김현수 / operator01",
    action: "로그인",
    target: "-",
    detail: "정상 로그인"
  },
  {
    time: "2026-03-26 18:22",
    user: "이도윤 / operator02",
    action: "로그인 실패",
    target: "-",
    detail: "비밀번호 오류 반복"
  }
] as const;

const actionToneMap: Record<string, string> = {
  "품의 승인": "tone-info",
  "실적 승인": "tone-info",
  "품의 출력": "tone-neutral",
  로그인: "tone-neutral",
  "로그인 실패": "tone-warn"
};

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

const getDisplayRows = (variant: AccessHistoryGuideSceneVariant) => {
  if (variant === "interpret") {
    return [historyRows[0], historyRows[1], historyRows[4]];
  }

  return historyRows.slice(0, 3);
};

export const AccessHistoryGuideScene = ({
  activeFocusIndex = 0,
  activeTab = "flow",
  variant
}: AccessHistoryGuideSceneProps) => {
  const animate = isFlowTab(activeTab);
  const displayRows = getDisplayRows(variant);

  return (
    <div className={`guide-access-scene guide-access-scene--${variant}`}>
      <div className="guide-scene-browser">
        <div className="guide-scene-browser-bar">
          <div className="guide-scene-browser-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="guide-scene-browser-url">shift-mgmt / access-history</div>
        </div>

        <div className="guide-access-scene-canvas">
          <div className="guide-access-hero">
            <div className="guide-access-topbar-copy">
              <strong>교대근무 및 수당 관리 시스템</strong>
              <span>활동 이력</span>
            </div>
            <div className="guide-access-hero-actions">
              <span className="guide-access-admin-badge">관리자 전용</span>
              <span className="guide-access-action-button guide-access-action-button--refresh">
                새로고침
              </span>
            </div>
          </div>

          <div className="guide-access-summary-row guide-focus-target">
            {summaryItems.map((item) => (
              <span className={`guide-access-pill tone-${item.tone}`} key={item.label}>
                {item.label}
              </span>
            ))}
            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 1}
                animate={animate}
                number={2}
                pointerStyle={{ top: "44%", left: "48%" }}
                rippleStyle={{ top: "52%", left: "50%" }}
                style={{ inset: "-6px", borderRadius: "18px" }}
              />
            ) : null}
          </div>

          {variant === "toc" ? (
            <div className="guide-access-toc-overlay">
              {tocItems.map((item, index) => (
                <div className="guide-access-toc-card" key={item.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          ) : null}

          {variant === "interpret" ? (
            <article className="guide-access-filter-shell guide-access-filter-shell--compact guide-focus-target">
              <div className="guide-access-filter-compact-row">
                {compactFilterItems.map((item) => (
                  <span className="guide-access-filter-compact-chip" key={item}>
                    {item}
                  </span>
                ))}
                <span className="guide-access-action-button guide-access-action-button--query">
                  조회 결과
                </span>
              </div>
              <FocusChrome
                active={activeFocusIndex === 0}
                animate={animate}
                number={1}
                pointerStyle={{ top: "56%", left: "84%" }}
                rippleStyle={{ top: "64%", left: "86%" }}
                style={{ inset: "-4px", borderRadius: "18px" }}
              />
            </article>
          ) : (
            <article className="guide-access-filter-shell guide-focus-target">
              <div className="guide-access-filter-row">
                {filterItems.map((item, index) => (
                  <div className={`guide-access-filter-card ${item.className} guide-focus-target`} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    {variant === "filters" && index < 4 ? (
                      <FocusChrome
                        active={activeFocusIndex === index}
                        animate={animate}
                        number={index + 1}
                        pointerStyle={{ top: "56%", left: "72%" }}
                        rippleStyle={{ top: "64%", left: "75%" }}
                      />
                    ) : null}
                  </div>
                ))}

                <div className="guide-access-filter-actions">
                  <span className="guide-access-action-button guide-access-action-button--query guide-focus-target">
                    조회
                    {variant === "filters" ? (
                      <FocusChrome
                        active={activeFocusIndex === 4}
                        animate={animate}
                        number={5}
                        pointerStyle={{ top: "56%", left: "42%" }}
                        rippleStyle={{ top: "64%", left: "44%" }}
                        style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "12px" }}
                      />
                    ) : null}
                  </span>
                  <span className="guide-access-action-button">초기화</span>
                </div>
              </div>

              {variant === "overview" ? (
                <FocusChrome
                  active={activeFocusIndex === 0}
                  animate={animate}
                  number={1}
                  pointerStyle={{ top: "44%", left: "18%" }}
                  rippleStyle={{ top: "52%", left: "20%" }}
                  style={{ inset: "-6px", borderRadius: "20px" }}
                />
              ) : null}
            </article>
          )}

          <article className="guide-access-table-card guide-focus-target">
            <div className="guide-access-table-headline">
              <div>
                <strong>활동 이력 테이블</strong>
                <span>처리시각, 사용자, 액션, 대상 화면, 세부 내용을 함께 읽습니다.</span>
              </div>
              <span className="guide-access-pill tone-neutral">184건</span>
            </div>

            <div className="guide-access-table">
              <div className="guide-access-table-header">
                <span>활동시각</span>
                <span>사용자</span>
                <span>액션</span>
                <span>대상 화면</span>
                <span>상세</span>
              </div>

              {displayRows.map((row, index) => {
                const isAlertRow = variant === "interpret" && index === displayRows.length - 1;
                const isFocusRow = variant !== "interpret" && index === 0;
                const isInterpretReferenceRow = variant === "interpret" && index === 0;

                return (
                  <div
                    className={
                      isAlertRow
                        ? "guide-access-table-row guide-access-table-row--alert guide-focus-target"
                        : isInterpretReferenceRow
                          ? "guide-access-table-row guide-focus-target"
                        : isFocusRow
                          ? "guide-access-table-row guide-access-table-row--focus guide-focus-target"
                          : "guide-access-table-row"
                    }
                    key={`${row.time}-${row.user}`}
                  >
                    <span>{row.time}</span>
                    <span>{row.user}</span>
                    <span className={`guide-access-pill ${actionToneMap[row.action] ?? "tone-neutral"}`}>
                      {row.action}
                    </span>
                    <span>{row.target}</span>
                    <span>{row.detail}</span>

                    {variant === "interpret" && index === 0 ? (
                      <FocusChrome
                        active={activeFocusIndex === 1}
                        animate={animate}
                        number={2}
                        pointerStyle={{ top: "54%", left: "38%" }}
                        rippleStyle={{ top: "62%", left: "40%" }}
                        style={{ inset: "-4px", borderRadius: "16px" }}
                      />
                    ) : null}

                    {variant === "interpret" && isAlertRow ? (
                      <FocusChrome
                        active={activeFocusIndex === 2}
                        animate={animate}
                        number={3}
                        pointerStyle={{ top: "54%", left: "22%" }}
                        rippleStyle={{ top: "62%", left: "24%" }}
                        style={{ inset: "-4px", borderRadius: "16px" }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 2}
                animate={animate}
                number={3}
                pointerStyle={{ top: "22%", left: "78%" }}
                rippleStyle={{ top: "30%", left: "80%" }}
                style={{ inset: "-6px", borderRadius: "20px" }}
              />
            ) : null}
          </article>
        </div>
      </div>
    </div>
  );
};
