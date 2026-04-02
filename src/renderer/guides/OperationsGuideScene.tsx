import type { CSSProperties } from "react";

import type { GuideDetailTab } from "./guide-types";
import { GuideFocusHighlight, MotionPointer, MotionRipple } from "./motion-primitives";

type OperationsGuideSceneVariant =
  | "overview"
  | "toc"
  | "settings"
  | "holiday-rate"
  | "user"
  | "template"
  | "db-update";

interface OperationsGuideSceneProps {
  variant: OperationsGuideSceneVariant;
  activeTab?: GuideDetailTab;
  activeFocusIndex?: number;
}

const tabs = [
  { key: "settings", label: "경로 설정", description: "승인 폴더와 출력 경로 설정", badge: "설정" },
  { key: "holiday", label: "공휴일 관리", description: "시스템 DB 공휴일과 외부 API 기준", badge: "14건" },
  { key: "rate", label: "요율 관리", description: "연도별 수당계산 요율 버전", badge: "3건" },
  { key: "user", label: "사용자 관리", description: "권한과 상태별 사용자 목록", badge: "6명" },
  { key: "template", label: "양식 관리", description: "승인, 기본 사용, 출력 규칙 관리", badge: "8건" }
] as const;

const tocItems = [
  { title: "경로 설정", description: "승인 폴더, 문서 저장 경로, 백업 경로를 먼저 확인합니다." },
  { title: "공휴일 · 요율", description: "수당 계산 기준이 되는 공휴일 캘린더와 연도별 요율을 관리합니다." },
  { title: "사용자 관리", description: "계정 생성, 권한 부여, 상태 변경, 비밀번호 초기화를 처리합니다." },
  { title: "양식 관리", description: "배포·품의·별첨 양식을 등록하고 승인 및 기본 사용 규칙을 관리합니다." },
  { title: "DB업데이트", description: "상단 버튼으로 미리보기를 열고 업데이트 결과와 백업을 확인합니다." }
] as const;

const settingsCards = [
  { label: "승인 대기 폴더", value: "D:\\ShiftMgmt\\imports\\pending" },
  { label: "승인 완료 폴더", value: "D:\\ShiftMgmt\\imports\\approved" },
  { label: "근무표 저장", value: "D:\\ShiftMgmt\\exports\\schedule" },
  { label: "품의서 저장", value: "D:\\ShiftMgmt\\exports\\allowance" },
  { label: "DB 백업", value: "D:\\ShiftMgmt\\backup" },
  { label: "마이그레이션 파일", value: "D:\\ShiftMgmt\\migration\\legacy.accdb" }
] as const;

const holidayRows = [
  ["2026-01-01", "신정", "저장"],
  ["2026-03-01", "삼일절", "API 연동"],
  ["2026-05-05", "어린이날", "저장"]
] as const;

const rateRows = [
  ["2026 상반기", "적용 중", "연장 1.5 / 대체 1.0 / 휴일 2.0"],
  ["2025 연말 개정", "종료", "연장 1.5 / 대체 1.0 / 휴일 1.5"]
] as const;

const userRows = [
  ["admin01", "총괄 관리자", "관리자", "사용중"],
  ["operator01", "김현수", "사용자", "사용중"],
  ["operator02", "이민호", "사용자", "중지"]
] as const;

const templateRows = [
  ["근무표 양식", "근무표_템플릿2 v1.2", "승인", "기본 사용"],
  ["품의서 양식", "품의서_기본 v1.1", "승인", "기본 사용"],
  ["별첨1 양식", "별첨1_기본 v1.0", "승인", "-"]
] as const;

const updatePreviewStats = [
  ["이관 근무지", "12건"],
  ["이관 인력", "86건"],
  ["복원 테이블", "7건"],
  ["백업 저장", "D:\\ShiftMgmt\\backup\\2026-04-02"]
] as const;

const getActiveTabIndex = (variant: OperationsGuideSceneVariant): number => {
  const map: Record<OperationsGuideSceneVariant, number> = {
    overview: 0,
    toc: 0,
    settings: 0,
    "holiday-rate": 1,
    user: 3,
    template: 4,
    "db-update": 0
  };

  return map[variant];
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

export const OperationsGuideScene = ({
  activeFocusIndex = 0,
  activeTab = "flow",
  variant
}: OperationsGuideSceneProps) => {
  const animate = isFlowTab(activeTab);
  const activeTabIndex = getActiveTabIndex(variant);
  const visibleHolidayRows = variant === "holiday-rate" ? holidayRows.slice(0, 2) : holidayRows;
  const visibleRateRows = variant === "holiday-rate" ? rateRows.slice(0, 2) : rateRows;
  const visibleUpdatePreviewStats =
    variant === "db-update" ? updatePreviewStats.slice(0, 2) : updatePreviewStats;

  return (
    <div className={`guide-operations-scene guide-operations-scene--${variant}`}>
      <div className="guide-scene-browser">
        <div className="guide-scene-browser-bar">
          <div className="guide-scene-browser-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="guide-scene-browser-url">shift-mgmt / operations</div>
        </div>

        <div className="guide-operations-scene-canvas">
          <div className="guide-operations-scene-topbar">
            <div className="guide-operations-topbar-copy">
              <strong>교대근무 및 수당 관리 시스템</strong>
              <span>운영 관리</span>
            </div>
            <div className="guide-operations-topbar-actions">
              <span className="guide-operations-admin-badge">관리자 전용</span>
              <span className="guide-operations-primary-action guide-operations-db-launch guide-focus-target">
                DB업데이트
                {(variant === "overview" || variant === "db-update") ? (
                  <FocusChrome
                    active={activeFocusIndex === 1 || (variant === "db-update" && activeFocusIndex === 0)}
                    animate={animate}
                    number={variant === "db-update" ? 1 : 2}
                    pointerStyle={{ top: "54%", left: "68%" }}
                    rippleStyle={{ top: "62%", left: "70%" }}
                  />
                ) : null}
              </span>
            </div>
          </div>

          <div className="guide-operations-tabs guide-focus-target">
            {tabs.map((tab, index) => (
              <div className={index === activeTabIndex ? "guide-operations-tab active" : "guide-operations-tab"} key={tab.key}>
                <div className="guide-operations-tab-copy">
                  <strong>{tab.label}</strong>
                  <span>{tab.description}</span>
                </div>
                <em>{tab.badge}</em>
              </div>
            ))}
            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 0}
                animate={animate}
                number={1}
                pointerStyle={{ top: "54%", left: "18%" }}
                rippleStyle={{ top: "62%", left: "20%" }}
                style={{ inset: "-6px", borderRadius: "18px" }}
              />
            ) : null}
          </div>

          <div className="guide-operations-tab-content guide-focus-target">
            {(variant === "overview" || variant === "toc" || variant === "settings") && (
              <div className="guide-operations-settings-shell">
                <article className="guide-operations-card guide-operations-settings-card guide-focus-target">
                  <div className="guide-operations-section-head">
                    <div>
                      <strong>경로 설정</strong>
                      <span>승인 폴더와 문서 저장 경로를 한 곳에서 관리합니다.</span>
                    </div>
                    <span className="guide-operations-secondary-action guide-focus-target">
                      저장
                      {variant === "settings" ? (
                        <FocusChrome
                          active={activeFocusIndex === 2}
                          animate={animate}
                          number={3}
                          pointerStyle={{ top: "54%", left: "48%" }}
                          rippleStyle={{ top: "62%", left: "50%" }}
                        />
                      ) : null}
                    </span>
                  </div>
                  <div className="guide-operations-path-grid">
                    {settingsCards.map((item) => (
                      <div className="guide-operations-path-card" key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                  {variant === "settings" ? (
                    <>
                      <FocusChrome
                        active={activeFocusIndex === 0}
                        animate={animate}
                        number={1}
                        pointerStyle={{ top: "34%", left: "24%" }}
                        rippleStyle={{ top: "42%", left: "26%" }}
                        style={{ top: "58px", left: "10px", width: "calc(66% - 8px)", height: "134px" }}
                      />
                      <FocusChrome
                        active={activeFocusIndex === 1}
                        animate={animate}
                        number={2}
                        pointerStyle={{ top: "34%", left: "76%" }}
                        rippleStyle={{ top: "42%", left: "78%" }}
                        style={{ top: "58px", left: "calc(66% + 4px)", right: "10px", height: "134px" }}
                      />
                    </>
                  ) : null}
                </article>

                <article className="guide-operations-card guide-operations-backup-card guide-focus-target">
                  <div className="guide-operations-section-head">
                    <div>
                      <strong>DB 자동 백업 설정</strong>
                      <span>백업 주기와 마지막 업데이트 상태를 같이 확인합니다.</span>
                    </div>
                    <span className="guide-operations-secondary-action">경로 선택</span>
                  </div>
                  <div className="guide-operations-backup-grid">
                    <div>
                      <span>백업 주기</span>
                      <strong>매일 02:00</strong>
                    </div>
                    <div>
                      <span>마지막 업데이트</span>
                      <strong>2026-03-28 11:30 / 성공</strong>
                    </div>
                    <div>
                      <span>데이터 경로</span>
                      <strong>D:\ShiftMgmt\data</strong>
                    </div>
                  </div>
                  {variant === "overview" ? (
                    <FocusChrome
                      active={activeFocusIndex === 2}
                      animate={animate}
                      number={3}
                      pointerStyle={{ top: "40%", left: "24%" }}
                      rippleStyle={{ top: "48%", left: "26%" }}
                      style={{ inset: "10px", borderRadius: "18px" }}
                    />
                  ) : null}
                </article>
              </div>
            )}

            {variant === "holiday-rate" && (
              <div className="guide-operations-two-column">
                <article className="guide-operations-card guide-operations-holiday-panel guide-focus-target">
                  <div className="guide-operations-section-head">
                    <div>
                      <strong>공휴일 관리</strong>
                      <span>저장 공휴일과 API 기준을 비교해 반영합니다.</span>
                    </div>
                    <span className="guide-operations-secondary-action">API 전체 반영</span>
                  </div>
                  <div className="guide-operations-holiday-list">
                    {visibleHolidayRows.map((item) => (
                      <div className="guide-operations-holiday-row" key={item[0]}>
                        <span>{item[0]}</span>
                        <strong>{item[1]}</strong>
                        <span className="guide-operations-pill tone-info">{item[2]}</span>
                      </div>
                    ))}
                  </div>
                  <FocusChrome
                    active={activeFocusIndex === 0}
                    animate={animate}
                    number={1}
                    pointerStyle={{ top: "18%", left: "24%" }}
                    rippleStyle={{ top: "26%", left: "26%" }}
                    style={{ inset: "auto", top: "56px", left: "10px", right: "10px", height: "126px", borderRadius: "18px" }}
                  />
                </article>

                <article className="guide-operations-card guide-operations-rate-panel guide-focus-target">
                  <div className="guide-operations-section-head">
                    <div>
                      <strong>요율 관리</strong>
                      <span>적용 중인 요율과 검토 대상 버전을 비교합니다.</span>
                    </div>
                    <span className="guide-operations-primary-action guide-operations-rate-apply guide-focus-target">
                      요율 적용
                      <FocusChrome
                        active={activeFocusIndex === 2}
                        animate={animate}
                        number={3}
                        pointerStyle={{ top: "54%", left: "50%" }}
                        rippleStyle={{ top: "62%", left: "52%" }}
                      />
                    </span>
                  </div>
                  <div className="guide-operations-rate-list">
                    {visibleRateRows.map((item) => (
                      <div className="guide-operations-rate-row" key={item[0]}>
                        <div>
                          <strong>{item[0]}</strong>
                          <span>{item[2]}</span>
                        </div>
                        <span className={item[1] === "적용 중" ? "guide-operations-pill tone-info" : "guide-operations-pill tone-neutral"}>
                          {item[1]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <FocusChrome
                    active={activeFocusIndex === 1}
                    animate={animate}
                    number={2}
                    pointerStyle={{ top: "54%", left: "76%" }}
                    rippleStyle={{ top: "62%", left: "78%" }}
                    style={{ inset: "auto", top: "56px", left: "10px", right: "10px", height: "126px", borderRadius: "18px" }}
                  />
                </article>
              </div>
            )}

            {variant === "user" && (
              <article className="guide-operations-card guide-operations-user-panel guide-focus-target">
                <div className="guide-operations-section-head">
                  <div>
                    <strong>사용자 관리</strong>
                    <span>권한과 상태별 사용자 목록을 보고 신규 계정을 추가합니다.</span>
                  </div>
                  <span className="guide-operations-primary-action guide-operations-user-add guide-focus-target">
                    신규 사용자 추가
                    <FocusChrome
                      active={activeFocusIndex === 0}
                      animate={animate}
                      number={1}
                      pointerStyle={{ top: "54%", left: "50%" }}
                      rippleStyle={{ top: "62%", left: "52%" }}
                    />
                  </span>
                </div>
                <div className="guide-operations-user-table guide-focus-target">
                  <div className="guide-operations-user-header">
                    <span>로그인ID</span>
                    <span>이름</span>
                    <span>권한</span>
                    <span>상태</span>
                    <span>관리</span>
                  </div>
                  {userRows.map((row, index) => (
                    <div className={index === 0 ? "guide-operations-user-row guide-focus-target" : "guide-operations-user-row"} key={row[0]}>
                      <span>{row[0]}</span>
                      <span>{row[1]}</span>
                      <span className={row[2] === "관리자" ? "guide-operations-pill tone-info" : "guide-operations-pill tone-neutral"}>
                        {row[2]}
                      </span>
                      <span className={row[3] === "사용중" ? "guide-operations-pill tone-info" : "guide-operations-pill tone-warn"}>
                        {row[3]}
                      </span>
                      <span className="guide-operations-secondary-action">수정</span>
                      {index === 0 ? (
                        <FocusChrome
                          active={activeFocusIndex === 2}
                          animate={animate}
                          number={3}
                          pointerStyle={{ top: "54%", left: "92%" }}
                          rippleStyle={{ top: "62%", left: "94%" }}
                        />
                      ) : null}
                    </div>
                  ))}
                  <FocusChrome
                    active={activeFocusIndex === 1}
                    animate={animate}
                    number={2}
                    pointerStyle={{ top: "18%", left: "74%" }}
                    rippleStyle={{ top: "26%", left: "76%" }}
                    style={{ inset: "8px", borderRadius: "18px" }}
                  />
                </div>
              </article>
            )}

            {variant === "template" && (
              <article className="guide-operations-card guide-operations-template-panel guide-focus-target">
                <div className="guide-operations-section-head">
                  <div>
                    <strong>양식 관리</strong>
                    <span>근무표, 품의서, 별첨 양식을 등록하고 승인 및 기본 사용을 관리합니다.</span>
                  </div>
                  <span className="guide-operations-primary-action guide-operations-template-add guide-focus-target">
                    양식등록
                    <FocusChrome
                      active={activeFocusIndex === 0}
                      animate={animate}
                      number={1}
                      pointerStyle={{ top: "54%", left: "50%" }}
                      rippleStyle={{ top: "62%", left: "52%" }}
                    />
                  </span>
                </div>
                <div className="guide-operations-template-summary">
                  <div>
                    <span>등록된 양식</span>
                    <strong>8건</strong>
                  </div>
                  <div>
                    <span>승인 완료</span>
                    <strong>6건</strong>
                  </div>
                  <div>
                    <span>기본 사용</span>
                    <strong>4건</strong>
                  </div>
                </div>
                <div className="guide-operations-template-list">
                  {templateRows.map((row, index) => (
                    <div className={index === 0 ? "guide-operations-template-row guide-focus-target" : "guide-operations-template-row"} key={row[1]}>
                      <div className="guide-operations-template-copy">
                        <strong>{row[1]}</strong>
                        <span>{row[0]}</span>
                      </div>
                      <span className="guide-operations-pill tone-info">{row[2]}</span>
                      <span className={row[3] === "기본 사용" ? "guide-operations-pill tone-info" : "guide-operations-pill tone-neutral"}>
                        {row[3]}
                      </span>
                      <div className="guide-operations-template-actions">
                        <span className="guide-operations-secondary-action">수정</span>
                        <span className="guide-operations-secondary-action">기본 사용</span>
                      </div>
                      {index === 0 ? (
                        <>
                          <FocusChrome
                            active={activeFocusIndex === 1}
                            animate={animate}
                            number={2}
                            pointerStyle={{ top: "54%", left: "62%" }}
                            rippleStyle={{ top: "62%", left: "64%" }}
                            style={{ inset: "4px", borderRadius: "14px" }}
                          />
                          <FocusChrome
                            active={activeFocusIndex === 2}
                            animate={animate}
                            number={3}
                            pointerStyle={{ top: "54%", left: "90%" }}
                            rippleStyle={{ top: "62%", left: "92%" }}
                            style={{ top: "4px", bottom: "4px", left: "calc(100% - 170px)", right: "4px", borderRadius: "14px" }}
                          />
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            )}

            {variant === "overview" ? (
              <FocusChrome
                active={activeFocusIndex === 2}
                animate={animate}
                number={3}
                pointerStyle={{ top: "10%", right: "12%" }}
                rippleStyle={{ top: "18%", right: "10%" }}
                style={{ inset: "0", borderRadius: "18px" }}
              />
            ) : null}
          </div>

          {variant === "db-update" ? (
            <div className="guide-operations-update-modal guide-focus-target">
              <div className="guide-operations-update-modal-header">
                <strong>DB업데이트 미리보기</strong>
                <span>Access 원본 이관 / 백업 포함</span>
              </div>
              <div className="guide-operations-update-modal-grid guide-focus-target">
                {visibleUpdatePreviewStats.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
                <FocusChrome
                  active={activeFocusIndex === 1}
                  animate={animate}
                  number={2}
                  pointerStyle={{ top: "-28%", left: "26%" }}
                  rippleStyle={{ top: "-18%", left: "28%" }}
                  style={{ inset: "auto", top: "8px", left: "8px", right: "8px", height: "72px", borderRadius: "18px" }}
                />
              </div>
              <div className="guide-operations-update-modal-actions">
                <span className="guide-operations-secondary-action">취소</span>
                <span className="guide-operations-primary-action guide-operations-db-confirm guide-focus-target">
                  DB업데이트 실행
                  <FocusChrome
                    active={activeFocusIndex === 2}
                    animate={animate}
                    number={3}
                    style={{ inset: "auto", top: "0", left: "0", right: "0", height: "34px", borderRadius: "12px" }}
                  />
                </span>
              </div>
            </div>
          ) : null}

          {variant === "toc" ? (
            <div className="guide-operations-toc-overlay">
              {tocItems.map((item, index) => (
                <div className="guide-operations-toc-card" key={item.title}>
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
