import type { CSSProperties } from "react";

import type { GuideDetailTab } from "./guide-types";
import { GuideFocusHighlight, MotionPointer, MotionRipple } from "./motion-primitives";

type OperationsGuideSceneVariant =
  | "overview"
  | "toc"
  | "settings"
  | "holiday-rate"
  | "user"
  | "site-name"
  | "template"
  | "db-update";

interface OperationsGuideSceneProps {
  variant: OperationsGuideSceneVariant;
  activeTab?: GuideDetailTab;
  activeFocusIndex?: number;
  activeStepNumber?: number;
}

const tabs = [
  { key: "settings", label: "경로 설정", description: "승인 폴더와 출력 경로 설정", badge: "설정" },
  { key: "holiday", label: "공휴일 관리", description: "시스템 DB 공휴일과 외부 API 기준", badge: "14건" },
  { key: "rate", label: "요율 관리", description: "연도별 수당계산 요율 버전", badge: "3건" },
  { key: "user", label: "사용자 관리", description: "권한과 상태별 사용자 목록", badge: "6명" },
  { key: "site-name", label: "사이트 명 관리", description: "근무지 등록 선택값 관리", badge: "5건" },
  { key: "template", label: "양식 관리", description: "승인, 기본 사용, 출력 규칙 관리", badge: "8건" }
] as const;

const tocItems = [
  { title: "경로 설정", description: "승인 폴더, 문서 저장 경로, 백업 경로를 먼저 확인합니다." },
  { title: "공휴일 · 요율", description: "수당 계산 기준이 되는 공휴일 캘린더와 연도별 요율을 관리합니다." },
  { title: "사용자 관리", description: "계정 생성, 권한 부여, 상태 변경, 비밀번호 초기화를 처리합니다." },
  { title: "사이트 명 관리", description: "근무지 등록에서 선택할 사이트 명 목록을 관리합니다." },
  { title: "양식 관리", description: "배포·품의·별첨 양식을 등록하고 승인 및 기본 사용 규칙을 관리합니다." },
  { title: "DB업데이트", description: "상단 버튼으로 미리보기를 열고 업데이트 결과와 백업을 확인합니다." }
] as const;

const settingsCards = [
  { label: "승인 대기 폴더", value: "D:\\ShiftMgmt\\imports\\pending" },
  { label: "승인 완료 폴더", value: "D:\\ShiftMgmt\\imports\\approved" },
  { label: "근무표 저장", value: "D:\\ShiftMgmt\\exports\\schedule" },
  { label: "품의서 저장", value: "D:\\ShiftMgmt\\exports\\allowance" },
  { label: "DB 백업", value: "D:\\ShiftMgmt\\backup" },
  { label: "복원 파일", value: "D:\\ShiftMgmt\\backup\\shiftmgmt-backup-20260409-0845.json" }
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

const siteNameRows = [
  ["SK telecom", "3건", "2026.04.10", "수정"],
  ["고객사 미지정", "1건", "2026.04.09", "수정"],
  ["외주 협력사", "0건", "2026.04.08", "수정 / 삭제"]
] as const;

const templateRows = [
  ["근무표 양식", "근무표_템플릿2 v1.2", "승인", "기본 사용"],
  ["품의서 양식", "품의서_기본 v1.1", "승인", "기본 사용"],
  ["별첨1 양식", "별첨1_기본 v1.0", "승인", "-"]
] as const;

const templateWizardStages = [
  ["1", "파일 준비와 구조 확인"],
  ["2", "문서 영역 조정과 저장"]
] as const;

const templateWizardBasics = [
  ["문서 종류", "품의서 양식"],
  ["목록 이름", "품의서_기본 v1.2"],
  ["보관 파일명", "DT사업1팀_품의서_운영본.xlsx"]
] as const;

const templateWizardInspectCards = [
  ["기본 시트", "품의서"],
  ["탐지된 양식 계열", "proposal"],
  ["인식된 문서 영역", "11개"]
] as const;

const templateWizardZoneChips = [
  ["문서 제목", "B2:E2"],
  ["일반 지급 표", "B8:J19"],
  ["퇴사자 선지급 표", "B23:J28"],
  ["결재 영역", "I32:J36"]
] as const;

const templateWizardCandidates = [
  ["품의서", "B2", "교대근무 조직 연장근로 수당 품의서"],
  ["품의서", "F4", "2026년 03월"],
  ["품의서", "B8", "1. 일반 지급 내역"],
  ["품의서", "B23", "3. 퇴사자 선지급 내역"]
] as const;

const templateWizardChangeCards = [
  ["문서 제목 위치", "B2", "B2:E2", "제목 폭을 넓혀 한 줄 정렬과 병합을 같이 맞춥니다."],
  ["지급 표 시작 줄", "8", "9", "표가 너무 위에 붙을 때 실제 시작 줄을 한 줄 내려 조정합니다."],
  ["기간 표시 위치", "F4", "F4:H4", "기간 문구를 넓혀 월 라벨이 잘리지 않도록 맞춥니다."]
] as const;

const templateHistoryRows = [
  ["2026.04.10 09:12", "품의서 양식", "품의서_기본 v1.2", "수정", "도식 미리보기에서 제목 병합 조정"],
  ["2026.04.10 09:18", "품의서 양식", "품의서_기본 v1.2", "승인", "운영 출력 기준 반영"],
  ["2026.04.10 09:22", "품의서 양식", "품의서_기본 v1.2", "기본 사용", "문서 출력 기본본 전환"]
] as const;

const updatePreviewStats = [
  ["복원 근무지", "12건"],
  ["복원 인력", "86건"],
  ["복원 테이블", "7건"],
  ["백업 저장", "D:\\ShiftMgmt\\backup\\2026-04-02"]
] as const;

const updateSourceCards = [
  ["입력 파일", "shiftmgmt-source-20260409-0845.accdb"],
  ["복원 방식", "Access/JSON 복원"],
  ["백업 형식", "JSON + Excel"]
] as const;

const updateCompareRows = [
  ["근무지", "12", "12"],
  ["인력", "86", "86"],
  ["시급", "83", "83"],
  ["패턴", "11", "11"]
] as const;

const updateWarningItems = [
  "시급이 없는 1건은 승인/수당 이력을 생성하지 않습니다.",
  "패턴 시간이 비어 있는 근무지는 자동 복원 대상에서 제외됩니다."
] as const;

const updateResultCards = [
  ["반영 근무지", "12건"],
  ["반영 인력", "86건"],
  ["백업 저장", "완료"]
] as const;

const updateFollowupCards = [
  ["마지막 업데이트", "2026.04.09 08:45"],
  ["백업 파일", "shiftmgmt-backup-20260409-0845.json"],
  ["후속 확인", "공휴일 / 요율 / 승인 기본 이력 점검"]
] as const;

const approvalSettingsCards = settingsCards.slice(0, 2);
const documentSettingsCards = settingsCards.slice(2);

const getActiveTabIndex = (variant: OperationsGuideSceneVariant): number => {
  const map: Record<OperationsGuideSceneVariant, number> = {
    overview: 0,
    toc: 0,
    settings: 0,
    "holiday-rate": 1,
    user: 3,
    "site-name": 4,
    template: 5,
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
  activeStepNumber = 1,
  variant
}: OperationsGuideSceneProps) => {
  const animate = isFlowTab(activeTab);
  const activeTabIndex = getActiveTabIndex(variant);
  const visibleHolidayRows = variant === "holiday-rate" ? holidayRows.slice(0, 2) : holidayRows;
  const visibleRateRows = variant === "holiday-rate" ? rateRows.slice(0, 2) : rateRows;
  const visibleUpdatePreviewStats = updatePreviewStats;
  const isDbUpdateRunStage =
    variant === "db-update" && (activeFocusIndex === 4 || activeFocusIndex === 5 || activeFocusIndex === 6);

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
                    number={variant === "db-update" ? activeStepNumber : 2}
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
                  <div
                    className={
                      variant === "settings"
                        ? "guide-operations-path-grid guide-operations-path-grid--settings"
                        : "guide-operations-path-grid"
                    }
                  >
                    {variant === "settings" ? (
                      <>
                        <div className="guide-operations-path-group guide-operations-path-group--approval guide-focus-target">
                          {approvalSettingsCards.map((item) => (
                            <div className="guide-operations-path-card" key={item.label}>
                              <span>{item.label}</span>
                              <strong>{item.value}</strong>
                            </div>
                          ))}
                          <FocusChrome
                            active={activeFocusIndex === 0}
                            animate={animate}
                            number={1}
                            pointerStyle={{ top: "28%", left: "26%" }}
                            rippleStyle={{ top: "36%", left: "28%" }}
                            style={{ inset: "-4px", borderRadius: "18px" }}
                          />
                        </div>
                        <div className="guide-operations-path-group guide-operations-path-group--document guide-focus-target">
                          {documentSettingsCards.map((item) => (
                            <div className="guide-operations-path-card" key={item.label}>
                              <span>{item.label}</span>
                              <strong>{item.value}</strong>
                            </div>
                          ))}
                          <FocusChrome
                            active={activeFocusIndex === 1}
                            animate={animate}
                            number={2}
                            pointerStyle={{ top: "22%", left: "74%" }}
                            rippleStyle={{ top: "30%", left: "76%" }}
                            style={{ inset: "-4px", borderRadius: "18px" }}
                          />
                        </div>
                      </>
                    ) : (
                      settingsCards.map((item) => (
                        <div className="guide-operations-path-card" key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))
                    )}
                  </div>
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
                    style={{ inset: "-4px", borderRadius: "18px" }}
                  />
                </div>
              </article>
            )}

            {variant === "site-name" && (
              <article className="guide-operations-card guide-operations-site-name-panel guide-focus-target">
                <div className="guide-operations-section-head">
                  <div>
                    <strong>사이트 명 관리</strong>
                    <span>근무지 등록에서 선택하는 고객사/사이트 구분값을 관리합니다.</span>
                  </div>
                  <span className="guide-operations-primary-action guide-operations-site-name-add guide-focus-target">
                    사이트 명 추가
                    <FocusChrome
                      active={activeFocusIndex === 0}
                      animate={animate}
                      number={1}
                      pointerStyle={{ top: "54%", left: "52%" }}
                      rippleStyle={{ top: "62%", left: "54%" }}
                    />
                  </span>
                </div>
                <div className="guide-operations-site-name-summary">
                  <div>
                    <span>등록된 사이트 명</span>
                    <strong>5건</strong>
                  </div>
                  <div>
                    <span>사용 중</span>
                    <strong>4건</strong>
                  </div>
                  <div>
                    <span>삭제 가능</span>
                    <strong>1건</strong>
                  </div>
                </div>
                <div className="guide-operations-site-name-table guide-focus-target">
                  <div className="guide-operations-site-name-header">
                    <span>사이트 명</span>
                    <span>사용 근무지</span>
                    <span>수정일</span>
                    <span>작업</span>
                  </div>
                  {siteNameRows.map((row, index) => (
                    <div
                      className={index === 0 ? "guide-operations-site-name-row guide-focus-target" : "guide-operations-site-name-row"}
                      key={row[0]}
                    >
                      <strong>{row[0]}</strong>
                      <span>{row[1]}</span>
                      <span>{row[2]}</span>
                      <span className="guide-operations-secondary-action">{row[3]}</span>
                      {index === 0 ? (
                        <FocusChrome
                          active={activeFocusIndex === 1}
                          animate={animate}
                          number={2}
                          pointerStyle={{ top: "54%", left: "78%" }}
                          rippleStyle={{ top: "62%", left: "80%" }}
                          style={{ inset: "-4px", borderRadius: "14px" }}
                        />
                      ) : null}
                    </div>
                  ))}
                  <FocusChrome
                    active={activeFocusIndex === 2}
                    animate={animate}
                    number={3}
                    pointerStyle={{ top: "22%", left: "72%" }}
                    rippleStyle={{ top: "30%", left: "74%" }}
                    style={{ inset: "-4px", borderRadius: "18px" }}
                  />
                </div>
              </article>
            )}

            {variant === "template" && (
              <div className="guide-operations-template-workspace">
                <article className="guide-operations-card guide-operations-template-panel guide-focus-target">
                  <div className="guide-operations-section-head">
                    <div>
                      <strong>양식 관리</strong>
                      <span>양식 묶음, 승인 상태, 기본 사용 여부를 먼저 확인한 뒤 수정으로 편집기를 엽니다.</span>
                    </div>
                    <span className="guide-operations-primary-action guide-operations-template-add guide-focus-target">
                      양식등록
                      <FocusChrome
                        active={activeFocusIndex === 0}
                        animate={animate}
                        number={1}
                        pointerStyle={{ top: "48%", left: "84%" }}
                        rippleStyle={{ top: "56%", left: "86%" }}
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
                        <div className={index === 0 ? "guide-operations-template-actions guide-focus-target" : "guide-operations-template-actions"}>
                          <span className="guide-operations-secondary-action">수정</span>
                          <span className="guide-operations-secondary-action">승인</span>
                          <span className="guide-operations-secondary-action">기본 사용</span>
                          {index === 0 ? (
                            <>
                              <FocusChrome
                                active={activeFocusIndex === 6}
                                animate={animate}
                                number={4}
                                pointerStyle={{ top: "50%", left: "44%" }}
                                rippleStyle={{ top: "58%", left: "46%" }}
                                style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "14px" }}
                              />
                              <FocusChrome
                                active={activeFocusIndex === 7}
                                animate={animate}
                                number={5}
                                pointerStyle={{ top: "50%", left: "82%" }}
                                rippleStyle={{ top: "58%", left: "84%" }}
                                style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "14px" }}
                              />
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="guide-operations-template-editor guide-focus-target">
                  <div className="guide-operations-template-editor-shell">
                    <div className="guide-operations-template-editor-head">
                      <div>
                        <strong>양식 편집기</strong>
                        <span>파일 준비와 구조 확인 후, 도식 미리보기에서 문서 영역과 스타일을 직접 조정합니다.</span>
                      </div>
                      <span className="guide-operations-pill tone-info">품의서 양식</span>
                    </div>

                    <div className="guide-operations-template-stepper">
                      {templateWizardStages.map(([indexText, label], index) => (
                        <div className={index === 1 ? "guide-operations-template-step active" : "guide-operations-template-step"} key={indexText}>
                          <span>{indexText}</span>
                          <strong>{label}</strong>
                        </div>
                      ))}
                    </div>

                    <div className="guide-operations-template-editor-grid">
                      <section className="guide-operations-template-editor-column guide-focus-target">
                        <div className="guide-operations-template-basic-grid">
                          {templateWizardBasics.map(([label, value]) => (
                            <div className="guide-operations-template-basic-card" key={label}>
                              <span>{label}</span>
                              <strong>{value}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="guide-operations-template-inspect-grid">
                          {templateWizardInspectCards.map(([label, value]) => (
                            <div className="guide-operations-template-inspect-card" key={label}>
                              <span>{label}</span>
                              <strong>{value}</strong>
                            </div>
                          ))}
                        </div>
                        <FocusChrome
                          active={activeFocusIndex === 1}
                          animate={animate}
                          number={2}
                          pointerStyle={{ top: "18%", left: "18%" }}
                          rippleStyle={{ top: "26%", left: "20%" }}
                          style={{ inset: "-4px", borderRadius: "18px" }}
                        />

                        <div className="guide-operations-template-canvas-panel guide-focus-target">
                          <div className="guide-operations-template-canvas-head">
                            <div>
                              <strong>내부 도식 미리보기</strong>
                              <span>문서 영역을 클릭해 위치와 병합, 스타일을 바로 읽고 조정합니다.</span>
                            </div>
                            <div className="guide-operations-template-canvas-actions">
                              <span className="guide-operations-secondary-action">고급 모드</span>
                              <span className="guide-operations-secondary-action">문구 숨김</span>
                            </div>
                          </div>
                          <div className="guide-operations-template-canvas-frame">
                            <div className="guide-operations-template-canvas-grid">
                              <div className="guide-operations-template-zone guide-operations-template-zone--title">문서 제목</div>
                              <div className="guide-operations-template-zone guide-operations-template-zone--summary">요약 문구</div>
                              <div className="guide-operations-template-zone guide-operations-template-zone--table">일반 지급 표</div>
                              <div className="guide-operations-template-zone guide-operations-template-zone--table guide-operations-template-zone--secondary">퇴사자 선지급 표</div>
                            </div>
                            <div className="guide-operations-template-zone-chip-row">
                              {templateWizardZoneChips.map(([label, range]) => (
                                <div className="guide-operations-template-zone-chip" key={label}>
                                  <strong>{label}</strong>
                                  <span>{range}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="guide-operations-template-direct-tools guide-focus-target">
                            <div className="guide-operations-template-tool-card">
                              <span>열 너비 빠른 조절</span>
                              <strong>9.5</strong>
                            </div>
                            <div className="guide-operations-template-tool-card">
                              <span>행 높이 빠른 조절</span>
                              <strong>24.0</strong>
                            </div>
                            <FocusChrome
                              active={activeFocusIndex === 4}
                              animate={animate}
                              number={4}
                              pointerStyle={{ top: "78%", left: "40%" }}
                              rippleStyle={{ top: "84%", left: "42%" }}
                              style={{ inset: "-4px", borderRadius: "16px" }}
                            />
                          </div>
                          <FocusChrome
                            active={activeFocusIndex === 2}
                            animate={animate}
                            number={3}
                            pointerStyle={{ top: "42%", left: "24%" }}
                            rippleStyle={{ top: "48%", left: "26%" }}
                            style={{ inset: "-4px", borderRadius: "18px" }}
                          />
                        </div>

                        <div className="guide-operations-template-candidate-shell">
                          <div className="guide-operations-template-candidate-head">
                            <strong>양식에서 찾은 위치 후보</strong>
                            <span>대표 문구와 셀 주소를 같이 확인합니다.</span>
                          </div>
                          <div className="guide-operations-template-candidate-table">
                            <div className="guide-operations-template-candidate-row guide-operations-template-candidate-row--head">
                              <span>시트</span>
                              <span>위치</span>
                              <span>양식에 적힌 내용</span>
                            </div>
                            {templateWizardCandidates.map((row) => (
                              <div className="guide-operations-template-candidate-row" key={`${row[0]}-${row[1]}`}>
                                <span>{row[0]}</span>
                                <span>{row[1]}</span>
                                <strong>{row[2]}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>

                      <section className="guide-operations-template-editor-column guide-focus-target">
                        <div className="guide-operations-template-property-panel guide-focus-target">
                          <div className="guide-operations-template-candidate-head">
                            <strong>선택 영역 속성</strong>
                            <span>대표 위치, 크기, 색상, 정렬, 병합을 한 패널에서 조정합니다.</span>
                          </div>
                          <div className="guide-operations-template-property-grid">
                            <div className="guide-operations-template-property-card">
                              <span>대표 위치</span>
                              <strong>F4</strong>
                            </div>
                            <div className="guide-operations-template-property-card">
                              <span>열 너비</span>
                              <strong>9.5</strong>
                            </div>
                            <div className="guide-operations-template-property-card">
                              <span>행 높이</span>
                              <strong>24.0</strong>
                            </div>
                            <div className="guide-operations-template-property-card">
                              <span>병합 범위</span>
                              <strong>F4:H4</strong>
                            </div>
                          </div>
                          <div className="guide-operations-template-property-actions">
                            <span className="guide-operations-secondary-action">대표 위치 기준 복원</span>
                            <span className="guide-operations-secondary-action">선택 영역 스타일 기준 복원</span>
                            <span className="guide-operations-secondary-action">최근 변경 되돌리기</span>
                          </div>
                          <FocusChrome
                            active={activeFocusIndex === 3}
                            animate={animate}
                            number={3}
                            pointerStyle={{ top: "28%", left: "72%" }}
                            rippleStyle={{ top: "36%", left: "74%" }}
                            style={{ inset: "-4px", borderRadius: "18px" }}
                          />
                        </div>

                        <div className="guide-operations-template-change-shell">
                          <div className="guide-operations-template-candidate-head">
                            <strong>변경 전 / 변경 후 안내</strong>
                            <span>현재 변경이 문서에서 어떤 영향으로 이어지는지 바로 읽습니다.</span>
                          </div>
                          <div className="guide-operations-template-change-list">
                            {templateWizardChangeCards.map(([label, beforeValue, afterValue, note]) => (
                              <div className="guide-operations-template-change-card" key={label}>
                                <div className="guide-operations-template-change-head">
                                  <strong>{label}</strong>
                                  <span className="guide-operations-pill tone-info">변경됨</span>
                                </div>
                                <div className="guide-operations-template-change-values">
                                  <span>{beforeValue}</span>
                                  <em>→</em>
                                  <strong>{afterValue}</strong>
                                </div>
                                <p>{note}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="guide-operations-template-editor-footer guide-focus-target">
                          <span className="guide-operations-secondary-action">이전</span>
                          <span className="guide-operations-secondary-action">검증 출력</span>
                          <span className="guide-operations-primary-action">저장</span>
                          <FocusChrome
                            active={activeFocusIndex === 5}
                            animate={animate}
                            number={4}
                            pointerStyle={{ top: "86%", left: "88%" }}
                            rippleStyle={{ top: "92%", left: "90%" }}
                            style={{ inset: "-4px", borderRadius: "14px" }}
                          />
                        </div>
                      </section>
                    </div>
                  </div>
                </article>

                <article className="guide-operations-card guide-operations-template-history-panel guide-focus-target">
                  <div className="guide-operations-section-head">
                    <div>
                      <strong>양식 변경 이력</strong>
                      <span>등록, 수정, 승인, 기본 사용 전환 기록을 시간 순서로 확인합니다.</span>
                    </div>
                    <span className="guide-operations-pill tone-neutral">3건</span>
                  </div>
                  <div className="guide-operations-template-history-table">
                    <div className="guide-operations-template-history-row guide-operations-template-history-row--head">
                      <span>시각</span>
                      <span>종류</span>
                      <span>버전</span>
                      <span>작업</span>
                      <span>상세</span>
                    </div>
                    {templateHistoryRows.map((row) => (
                      <div className="guide-operations-template-history-row" key={`${row[0]}-${row[2]}`}>
                        <span>{row[0]}</span>
                        <span>{row[1]}</span>
                        <span>{row[2]}</span>
                        <strong>{row[3]}</strong>
                        <span>{row[4]}</span>
                      </div>
                    ))}
                  </div>
                  <FocusChrome
                    active={activeFocusIndex === 8}
                    animate={animate}
                    number={6}
                    pointerStyle={{ top: "80%", left: "38%" }}
                    rippleStyle={{ top: "86%", left: "40%" }}
                    style={{ inset: "-4px", borderRadius: "18px" }}
                  />
                </article>
              </div>
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
            <div className="guide-operations-update-stage">
              <div className="guide-operations-update-modal guide-focus-target">
                <div className="guide-operations-update-modal-header">
                  <strong>DB업데이트 미리보기</strong>
                  <span>Access/JSON 복원 / 백업 포함</span>
                </div>
                {isDbUpdateRunStage ? (
                  <div className="guide-operations-update-run-ready">
                    <span>미리보기 검토 완료</span>
                    <strong>원본 유형, 현황 비교, 경고 확인 후 실행 준비</strong>
                  </div>
                ) : (
                  <div className="guide-operations-update-preview-stack guide-focus-target">
                    <div className="guide-operations-update-source-row guide-focus-target">
                      {updateSourceCards.map(([label, value]) => (
                        <div className="guide-operations-update-source-card" key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                      <FocusChrome
                        active={activeFocusIndex === 1}
                        animate={animate}
                        number={activeStepNumber}
                        pointerStyle={{ top: "18%", left: "18%" }}
                        rippleStyle={{ top: "26%", left: "20%" }}
                        style={{ inset: "-4px", borderRadius: "18px" }}
                      />
                    </div>
                    <div className="guide-operations-update-modal-grid guide-focus-target">
                      {visibleUpdatePreviewStats.map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="guide-operations-update-compare-shell guide-focus-target">
                      <div className="guide-operations-update-compare-head">
                        <strong>현황 비교</strong>
                        <span>현재 DB vs 업데이트 예정</span>
                      </div>
                      <div className="guide-operations-update-compare-table">
                        <div className="guide-operations-update-compare-row guide-operations-update-compare-row--head">
                          <span>항목</span>
                          <span>현재</span>
                          <span>예정</span>
                        </div>
                        {updateCompareRows.map(([label, current, next]) => (
                          <div className="guide-operations-update-compare-row" key={label}>
                            <span>{label}</span>
                            <span>{current}</span>
                            <span>{next}</span>
                          </div>
                        ))}
                      </div>
                      <FocusChrome
                        active={activeFocusIndex === 2}
                        animate={animate}
                        number={activeStepNumber}
                        pointerStyle={{ top: "35%", left: "42%" }}
                        rippleStyle={{ top: "43%", left: "44%" }}
                        style={{ inset: "-4px", borderRadius: "18px" }}
                      />
                    </div>
                    <div className="guide-operations-update-warning-shell guide-focus-target">
                      <div className="guide-operations-update-warning-head">
                        <strong>경고 및 제외 항목</strong>
                        <span>실행 전 점검</span>
                      </div>
                      <ul>
                        {updateWarningItems.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      <FocusChrome
                        active={activeFocusIndex === 3}
                        animate={animate}
                        number={activeStepNumber}
                        pointerStyle={{ top: "48%", left: "24%" }}
                        rippleStyle={{ top: "56%", left: "26%" }}
                        style={{ inset: "-4px", borderRadius: "18px" }}
                      />
                    </div>
                    <FocusChrome
                      active={activeFocusIndex === 7}
                      animate={animate}
                      number={activeStepNumber}
                      pointerStyle={{ top: "18%", left: "32%" }}
                      rippleStyle={{ top: "24%", left: "34%" }}
                      style={{ inset: "-6px", borderRadius: "20px" }}
                    />
                  </div>
                )}
                <div className="guide-operations-update-modal-actions">
                  <span className="guide-operations-secondary-action">취소</span>
                  <span className="guide-operations-primary-action guide-operations-db-confirm guide-focus-target">
                    DB업데이트 실행
                    <FocusChrome
                      active={activeFocusIndex === 4}
                      animate={animate}
                      number={activeStepNumber}
                      pointerStyle={{ top: "54%", left: "64%" }}
                      rippleStyle={{ top: "62%", left: "66%" }}
                      style={{ top: "-4px", left: "-4px", right: "-4px", bottom: "-4px", borderRadius: "12px" }}
                    />
                  </span>
                </div>
                <div className="guide-operations-update-result-row">
                  <div className="guide-operations-update-result-shell guide-focus-target">
                    {updateResultCards.map(([label, value]) => (
                      <div className="guide-operations-update-result-card" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                    <FocusChrome
                      active={activeFocusIndex === 5}
                      animate={animate}
                      number={activeStepNumber}
                      pointerStyle={{ top: "78%", left: "34%" }}
                      rippleStyle={{ top: "84%", left: "36%" }}
                      style={{ inset: "-4px", borderRadius: "18px" }}
                    />
                  </div>
                  <div className="guide-operations-update-followup-shell guide-focus-target">
                    {updateFollowupCards.map(([label, value]) => (
                      <div className="guide-operations-update-followup-card" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                    <FocusChrome
                      active={activeFocusIndex === 6}
                      animate={animate}
                      number={activeStepNumber}
                      pointerStyle={{ top: "78%", left: "74%" }}
                      rippleStyle={{ top: "84%", left: "76%" }}
                      style={{ inset: "-4px", borderRadius: "18px" }}
                    />
                  </div>
                </div>
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
