import type { CSSProperties } from "react";

import type { GuideDetailTab } from "./guide-types";
import { GuideFocusHighlight, MotionPointer, MotionRipple } from "./motion-primitives";

type AllowanceGuideSceneVariant =
  | "overview"
  | "toc"
  | "status"
  | "approval"
  | "proposal"
  | "history";

interface AllowanceGuideSceneProps {
  variant: AllowanceGuideSceneVariant;
  activeTab?: GuideDetailTab;
  activeFocusIndex?: number;
}

const tocItems = [
  { title: "상태 검토", description: "연월과 근무지 기준으로 산출 결과 범위를 먼저 정리합니다." },
  { title: "행/근무지 승인", description: "행별 승인과 근무지 승인으로 검토 상태를 업데이트합니다." },
  { title: "품의 승인", description: "승인 상태 건만 모아 미리보기 후 최종 승인과 백업을 실행합니다." },
  { title: "품의 이력", description: "상태 필터와 품의 승인 기록으로 완료된 묶음을 다시 확인합니다." }
];

const heroPills = [
  { label: "산출 18건", tone: "neutral" },
  { label: "검토대기 4건", tone: "info" },
  { label: "승인 11건", tone: "info" },
  { label: "반려 2건", tone: "warn" },
  { label: "품의승인 1건", tone: "neutral" }
];

const overviewFilters = [
  { label: "연도", value: "2026년" },
  { label: "월", value: "3월" },
  { label: "근무지", value: "보라매DC" }
];

const historyFilters = [
  { label: "근무지", value: "보라매DC" },
  { label: "연도", value: "2026년" },
  { label: "월", value: "3월" },
  { label: "상태", value: "승인" },
  { label: "직원명", value: "전체" }
];

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

export const AllowanceGuideScene = ({
  activeFocusIndex = 0,
  activeTab = "flow",
  variant
}: AllowanceGuideSceneProps) => {
  const animate = isFlowTab(activeTab);
  const isHistory = variant === "history";

  return (
    <div className={`guide-allowance-scene guide-allowance-scene--${variant}`}>
      <div className="guide-scene-browser">
        <div className="guide-scene-browser-bar">
          <div className="guide-scene-browser-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="guide-scene-browser-url">shift-mgmt / allowance / 2026-03</div>
        </div>

        <div className="guide-allowance-scene-canvas">
          <div className="guide-allowance-scene-topbar">
            <div className="guide-allowance-scene-topbar-copy">
              <strong>교대근무 및 수당 관리 시스템</strong>
              <span>수당 관리</span>
            </div>

            <div className="guide-allowance-action-row">
              <span className="guide-allowance-action-button primary guide-focus-target">
                품의 승인
                {variant === "overview" ? (
                  <FocusChrome
                    active={activeFocusIndex === 2}
                    animate={animate}
                    number={3}
                    pointerStyle={{ top: "54%", left: "64%" }}
                    rippleStyle={{ top: "62%", left: "66%" }}
                  />
                ) : null}
                {variant === "proposal" ? (
                  <FocusChrome
                    active={activeFocusIndex === 0}
                    animate={animate}
                    number={1}
                    pointerStyle={{ top: "54%", left: "64%" }}
                    rippleStyle={{ top: "62%", left: "66%" }}
                  />
                ) : null}
              </span>
              <span className="guide-allowance-action-button primary">PDF 출력</span>
              <span className="guide-allowance-action-button">Excel 출력</span>
            </div>
          </div>

          <div className="guide-allowance-tabs">
            <span className={!isHistory ? "guide-allowance-tab active" : "guide-allowance-tab"}>
              수당 산출 현황
            </span>
            <span className={isHistory ? "guide-allowance-tab active" : "guide-allowance-tab"}>
              품의 이력
            </span>
          </div>

          <div
            className={
              isHistory
                ? "guide-allowance-toolbar guide-allowance-toolbar--history"
                : "guide-allowance-toolbar"
            }
          >
            {(isHistory ? historyFilters : overviewFilters).map((item, index) => (
              <div className="guide-allowance-filter-card guide-focus-target" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {variant === "status" && !isHistory ? (
                  <FocusChrome
                    active={activeFocusIndex === index}
                    animate={animate}
                    number={index + 1}
                    pointerStyle={{ top: "54%", left: "70%" }}
                    rippleStyle={{ top: "62%", left: "72%" }}
                  />
                ) : null}
                {variant === "history" && isHistory && index < 3 ? (
                  <FocusChrome
                    active={activeFocusIndex === index}
                    animate={animate}
                    number={index + 1}
                    pointerStyle={{ top: "54%", left: "68%" }}
                    rippleStyle={{ top: "62%", left: "70%" }}
                  />
                ) : null}
              </div>
            ))}
            <span className="guide-allowance-action-button">초기화</span>
            {variant === "overview" && !isHistory ? (
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

          {!isHistory ? (
            <>
              {variant === "overview" || variant === "status" ? (
                <>
                  <div className="guide-allowance-meta-row guide-focus-target">
                    {heroPills.map((item) => (
                      <span className={`guide-allowance-pill tone-${item.tone}`} key={item.label}>
                        {item.label}
                      </span>
                    ))}
                    {variant === "status" ? (
                      <FocusChrome
                        active={activeFocusIndex === 3}
                        animate={animate}
                        number={4}
                        pointerStyle={{ top: "54%", left: "40%" }}
                        rippleStyle={{ top: "62%", left: "42%" }}
                      />
                    ) : null}
                  </div>

                  <div className="guide-allowance-visual-grid guide-focus-target">
                    <article className="guide-allowance-visual-card">
                      <div className="guide-allowance-card-head">
                        <strong>사업장별 수당 분포</strong>
                        <span>단위: 원</span>
                      </div>
                      <div className="guide-allowance-distribution-list">
                        {[
                          ["보라매DC", "12,400,000원", "78%"],
                          ["신림CC", "6,200,000원", "52%"],
                          ["안양센터", "3,100,000원", "28%"]
                        ].map((row) => (
                          <div className="guide-allowance-distribution-item" key={row[0]}>
                            <div>
                              <strong>{row[0]}</strong>
                              <span>{row[1]}</span>
                            </div>
                            <div className="guide-allowance-distribution-track">
                              <i style={{ width: row[2] }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="guide-allowance-visual-card">
                      <div className="guide-allowance-card-head">
                        <strong>수당 유형별 비중</strong>
                        <span>근로유형별 지급액 기준</span>
                      </div>
                      <div className="guide-allowance-ratio-layout">
                        <div className="guide-allowance-donut" />
                        <div className="guide-allowance-ratio-list">
                          <span>대체근무 18%</span>
                          <span>연장근무 56%</span>
                          <span>휴일근무 26%</span>
                        </div>
                      </div>
                    </article>

                    {variant === "status" ? (
                      <FocusChrome
                        active={activeFocusIndex === 4}
                        animate={animate}
                        number={5}
                        pointerStyle={{ top: "54%", left: "72%" }}
                        rippleStyle={{ top: "62%", left: "74%" }}
                      />
                    ) : null}
                  </div>
                </>
              ) : null}

              <article className="guide-allowance-results-card guide-focus-target">
                <div className="guide-allowance-card-head">
                  <div>
                    <strong>수당 산출 현황</strong>
                    <span>근무지 승인과 행별 승인/반려를 같은 흐름에서 처리합니다.</span>
                  </div>
                </div>

                <div className="guide-allowance-site-summary guide-focus-target">
                  <div>
                    <strong>보라매DC</strong>
                    <div className="guide-allowance-inline-pills">
                      <span className="guide-allowance-pill tone-info">승인 5</span>
                      <span className="guide-allowance-pill tone-warn">반려 1</span>
                      <span className="guide-allowance-pill tone-neutral">품의승인 1</span>
                    </div>
                  </div>
                  <div className="guide-allowance-site-actions guide-focus-target">
                    <span className="guide-allowance-action-button primary">근무지 승인</span>
                    <span className="guide-allowance-action-button">펼치기</span>
                    {variant === "approval" ? (
                      <FocusChrome
                        active={activeFocusIndex === 1}
                        animate={animate}
                        number={2}
                        pointerStyle={{ top: "54%", left: "60%" }}
                        rippleStyle={{ top: "62%", left: "62%" }}
                      />
                    ) : null}
                  </div>
                  {variant === "approval" ? (
                    <FocusChrome
                      active={activeFocusIndex === 0}
                      animate={animate}
                      number={1}
                      pointerStyle={{ top: "54%", left: "22%" }}
                      rippleStyle={{ top: "62%", left: "24%" }}
                    />
                  ) : null}
                  {variant === "overview" ? (
                    <FocusChrome
                      active={activeFocusIndex === 1}
                      animate={animate}
                      number={2}
                      pointerStyle={{ top: "54%", left: "84%" }}
                      rippleStyle={{ top: "62%", left: "86%" }}
                    />
                  ) : null}
                </div>

                <div className="guide-allowance-results-table">
                  <div className="guide-allowance-results-head">
                    <span>이름</span>
                    <span>상태</span>
                    <span>유형</span>
                    <span>근무일</span>
                    <span>총 수당</span>
                    <span>관리</span>
                  </div>

                  {[
                    ["김현수", "승인", "연장근무", "2026-03-25", "310,000원"],
                    ["이민호", "검토대기", "대체근무", "2026-03-26", "180,000원"],
                    ["한소희", "반려", "휴일근무", "2026-03-27", "420,000원"]
                  ].map((row, index) => (
                    <div
                      className={
                        index === 1
                          ? "guide-allowance-results-row guide-allowance-results-row--focus guide-focus-target"
                          : "guide-allowance-results-row"
                      }
                      key={`${row[0]}-${row[3]}`}
                    >
                      <div className="guide-allowance-result-primary">
                        <strong>{row[0]}</strong>
                        <span>{index === 0 ? "지급 요청 가능" : "검토 코멘트 확인"}</span>
                      </div>
                      <span
                        className={
                          row[1] === "승인"
                            ? "guide-allowance-pill tone-info"
                            : row[1] === "반려"
                              ? "guide-allowance-pill tone-warn"
                              : "guide-allowance-pill tone-neutral"
                        }
                      >
                        {row[1]}
                      </span>
                      <span
                        className={
                          row[2] === "대체근무"
                            ? "guide-allowance-type-pill type-substitute"
                            : row[2] === "연장근무"
                              ? "guide-allowance-type-pill type-overtime"
                              : "guide-allowance-type-pill type-holiday"
                        }
                      >
                        {row[2]}
                      </span>
                      <span>{row[3]}</span>
                      <span>{row[4]}</span>
                      <div className="guide-allowance-row-actions">
                        <span className="guide-allowance-mini-icon">상세</span>
                        <span className="guide-allowance-mini-icon">선지급</span>
                        <span className="guide-allowance-action-button primary">승인</span>
                        <span className="guide-allowance-action-button warn">반려</span>
                      </div>
                      {variant === "approval" && index === 1 ? (
                        <FocusChrome
                          active={activeFocusIndex === 2}
                          animate={animate}
                          number={3}
                          pointerStyle={{ top: "54%", left: "90%" }}
                          rippleStyle={{ top: "62%", left: "92%" }}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>

                {variant === "overview" ? (
                  <FocusChrome
                    active={activeFocusIndex === 1}
                    animate={animate}
                    number={2}
                    pointerStyle={{ top: "24%", right: "12%" }}
                    rippleStyle={{ top: "32%", right: "10%" }}
                  />
                ) : null}
              </article>

              {variant === "proposal" ? (
                <div className="guide-allowance-proposal-preview guide-focus-target">
                  <div className="guide-allowance-proposal-header">
                    <strong>품의 승인 미리보기</strong>
                    <span>2026-03 / 11건 / 8명</span>
                  </div>
                  <div className="guide-allowance-proposal-summary guide-focus-target">
                    <div>
                      <span>총 승인 금액</span>
                      <strong>25,400,000원</strong>
                    </div>
                    <div>
                      <span>일반 지급</span>
                      <strong>23,200,000원</strong>
                    </div>
                    <div>
                      <span>선지급</span>
                      <strong>2,200,000원</strong>
                    </div>
                    <FocusChrome
                      active={activeFocusIndex === 1}
                      animate={animate}
                      number={2}
                      pointerStyle={{ top: "54%", left: "44%" }}
                      rippleStyle={{ top: "62%", left: "46%" }}
                    />
                  </div>
                  <div className="guide-allowance-proposal-table">
                    <div className="guide-allowance-proposal-table-head">
                      <span>근무지</span>
                      <span>이름</span>
                      <span>근로유형</span>
                      <span>총 수당</span>
                    </div>
                    {[
                      ["보라매DC", "김현수", "연장근무", "310,000원"],
                      ["보라매DC", "이민호", "대체근무", "180,000원"]
                    ].map((row) => (
                      <div className="guide-allowance-proposal-row" key={`${row[0]}-${row[1]}`}>
                        {row.map((cell) => (
                          <span key={`${row[1]}-${cell}`}>{cell}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="guide-allowance-proposal-actions">
                    <span className="guide-allowance-action-button">닫기</span>
                    <span className="guide-allowance-action-button primary guide-focus-target">
                      최종 품의 승인
                      <FocusChrome
                        active={activeFocusIndex === 2}
                        animate={animate}
                        number={3}
                        pointerStyle={{ top: "54%", left: "68%" }}
                        rippleStyle={{ top: "62%", left: "70%" }}
                        style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "12px" }}
                      />
                    </span>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <article className="guide-allowance-history-card guide-focus-target">
                <div className="guide-allowance-card-head">
                  <div>
                    <strong>품의 이력</strong>
                    <span>승인 상태와 품의 승인 시점을 함께 조회합니다.</span>
                  </div>
                  <div className="guide-allowance-inline-pills">
                    <span className="guide-allowance-pill tone-neutral">3건</span>
                  </div>
                </div>
                <div className="guide-allowance-history-table">
                  <div className="guide-allowance-history-head">
                    <span>근무지</span>
                    <span>이름</span>
                    <span>상태</span>
                    <span>유형</span>
                    <span>근무일</span>
                    <span>총 수당</span>
                    <span>이력 정보</span>
                  </div>
                  {[
                    ["보라매DC", "김현수", "품의승인", "연장근무", "2026-03-25", "310,000원", "품의 03-28 / 문서 PDF"],
                    ["보라매DC", "이민호", "승인", "대체근무", "2026-03-26", "180,000원", "검토 03-27 / 문서 미출력"]
                  ].map((row) => (
                    <div className="guide-allowance-history-row" key={`${row[0]}-${row[1]}`}>
                      {row.map((cell) => (
                        <span key={`${row[1]}-${cell}`}>{cell}</span>
                      ))}
                    </div>
                  ))}
                </div>
                <FocusChrome
                  active={activeFocusIndex === 3}
                  animate={animate}
                  number={4}
                  pointerStyle={{ top: "22%", right: "12%" }}
                  rippleStyle={{ top: "30%", right: "10%" }}
                />
              </article>

              <article className="guide-allowance-record-card guide-focus-target">
                <div className="guide-allowance-card-head">
                  <div>
                    <strong>품의 승인 기록</strong>
                    <span>최종 승인 묶음과 백업 결과를 다시 확인합니다.</span>
                  </div>
                </div>
                <div className="guide-allowance-record-table">
                  <div className="guide-allowance-record-head">
                    <span>대상월</span>
                    <span>건수</span>
                    <span>총액</span>
                    <span>승인 정보</span>
                    <span>백업 정보</span>
                    <span>관리</span>
                  </div>
                  <div className="guide-allowance-record-row">
                    <span>2026-03</span>
                    <span>11건</span>
                    <span>25,400,000원</span>
                    <span>관리자 · 2026-03-28 11:12</span>
                    <span>정상 완료</span>
                    <span className="guide-allowance-action-button primary">미리보기</span>
                  </div>
                </div>
                <FocusChrome
                  active={activeFocusIndex === 4}
                  animate={animate}
                  number={5}
                  pointerStyle={{ top: "36%", right: "12%" }}
                  rippleStyle={{ top: "44%", right: "10%" }}
                />
              </article>
            </>
          )}

          {variant === "toc" ? (
            <div className="guide-allowance-toc-overlay">
              {tocItems.map((item, index) => (
                <div className="guide-allowance-toc-card" key={item.title}>
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
