import { useState, type ComponentProps } from "react";

import { SitePatternAdvancedEditorPanel } from "./SitePatternAdvancedEditorPanel";
import { SitePatternPresetModal } from "./SitePatternPresetModal";
import { SitePatternSetupPanel } from "./SitePatternSetupPanel";
import { SitePatternSimulationPanel } from "./SitePatternSimulationPanel";

interface SitePatternStepViewProps {
  activeCycleCount: number;
  assignedTeamCount: number;
  canManageSiteRegistration: boolean;
  formError: string | null;
  hasPersistedSiteId: boolean;
  isSubmitting: boolean;
  onBackToList: () => void;
  onGoNext: () => void;
  onReviewOrSave: () => void;
  patternPresetModalProps: ComponentProps<typeof SitePatternPresetModal>;
  poolBreakMinutes: string;
  poolEnabled: boolean;
  poolTimeRange: string;
  setupPanelProps: ComponentProps<typeof SitePatternSetupPanel>;
  showPatternPresetModal: boolean;
  simulationAnchorDate: string;
  simulationMonthLabel: string;
  simulationPanelProps: ComponentProps<typeof SitePatternSimulationPanel>;
  siteName: string;
  stageLabel: string;
  teamCount: number;
  advancedEditorPanelProps: ComponentProps<typeof SitePatternAdvancedEditorPanel>;
  cycleCount: number;
}

// 1단계를 한 화면에 몰아넣지 않고 '기본 설정 → 근무 시간 설정' 두 단계로 나눈다(로컬 상태).
// 전역 화면 흐름(목록/1단계/2단계)은 그대로 두고, 1단계 안에서만 단계를 전환한다.
export const SitePatternStepView = ({
  activeCycleCount,
  advancedEditorPanelProps,
  assignedTeamCount,
  canManageSiteRegistration,
  cycleCount,
  formError,
  hasPersistedSiteId,
  isSubmitting,
  onBackToList,
  onGoNext,
  onReviewOrSave,
  patternPresetModalProps,
  poolBreakMinutes,
  poolEnabled,
  poolTimeRange,
  setupPanelProps,
  showPatternPresetModal,
  simulationAnchorDate,
  simulationMonthLabel,
  simulationPanelProps,
  siteName,
  stageLabel,
  teamCount
}: SitePatternStepViewProps) => {
  const [phase, setPhase] = useState<"basics" | "times">("basics");
  const isBasics = phase === "basics";

  return (
    <div className="screen-stack">
      <section className="surface-card site-stage-header">
        <div className="stage-indicator-row">
          <span className="stage-chip active">
            <span className="material-symbols-outlined msi-sm" aria-hidden="true">looks_one</span>
            1단계: 패턴 등록
          </span>
          <span className="stage-chip">
            <span className="material-symbols-outlined msi-sm" aria-hidden="true">looks_two</span>
            2단계: 조직 구성
          </span>
        </div>
        <div className="stage-substep-row">
          <span className={isBasics ? "stage-substep is-active" : "stage-substep is-done"}>
            ① 기본 설정
          </span>
          <span className="stage-substep-divider" aria-hidden="true">
            ›
          </span>
          <span className={isBasics ? "stage-substep" : "stage-substep is-active"}>
            ② 근무 시간 설정
          </span>
        </div>
        <div>
          <h3>{stageLabel} - 1단계: 패턴 등록</h3>
          <p>
            {isBasics
              ? "먼저 근무지 기본 정보와 근무 묶음 구성을 정합니다. 우측 달력으로 회전 배치를 미리 확인하세요."
              : "각 근무 묶음의 근무시간·휴게를 정합니다. 우측 달력으로 바로 검토할 수 있습니다."}
          </p>
        </div>
      </section>

      {formError ? <p className="form-error-text">{formError}</p> : null}

      <section className="site-step-summary-grid">
        <article className="surface-card site-step-summary-card emphasis">
          <span>운영 구조</span>
          <strong>
            {teamCount}조 / {cycleCount}개 묶음
          </strong>
          <em>{siteName.trim() || "신규 근무지 설정 중"}</em>
        </article>
        <article className="surface-card site-step-summary-card">
          <span>조 배정 현황</span>
          <strong>{assignedTeamCount}개 조</strong>
          <em>{activeCycleCount}개 묶음에 배정됨</em>
        </article>
        <article className="surface-card site-step-summary-card">
          <span>별도 근무 운영</span>
          <strong>{poolEnabled ? "적용" : "미적용"}</strong>
          <em>{poolEnabled ? `${poolTimeRange} / 휴게 ${poolBreakMinutes}분` : "패턴 회전 대상만 구성"}</em>
        </article>
        <article className="surface-card site-step-summary-card">
          <span>시뮬레이션 기준</span>
          <strong>{simulationAnchorDate}</strong>
          <em>{simulationMonthLabel}</em>
        </article>
      </section>

      <section className="site-step-one-layout">
        <article className="surface-card site-form-panel">
          {isBasics ? (
            <SitePatternSetupPanel {...setupPanelProps} />
          ) : (
            <SitePatternAdvancedEditorPanel {...advancedEditorPanelProps} />
          )}
        </article>

        <SitePatternSimulationPanel {...simulationPanelProps} />
      </section>

      <section className="surface-card footer-action-card">
        <div className="button-row spread">
          {isBasics ? (
            <button className="ghost-button" onClick={onBackToList} type="button">
              뒤로가기
            </button>
          ) : (
            <button
              className="ghost-button"
              onClick={() => {
                setPhase("basics");
              }}
              type="button"
            >
              이전: 기본 설정
            </button>
          )}
          {canManageSiteRegistration ? (
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isSubmitting}
                onClick={onReviewOrSave}
                type="button"
              >
                {hasPersistedSiteId ? "적용" : "입력 검토"}
              </button>
              {isBasics ? (
                <button
                  className="primary-button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setPhase("times");
                  }}
                  type="button"
                >
                  다음: 근무시간 설정
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={isSubmitting}
                  onClick={onGoNext}
                  type="button"
                >
                  다음 단계
                </button>
              )}
            </div>
          ) : (
            <span className="site-field-note">
              기준정보 수정 권한이 필요합니다.
            </span>
          )}
        </div>
      </section>

      {showPatternPresetModal ? <SitePatternPresetModal {...patternPresetModalProps} /> : null}
    </div>
  );
};
