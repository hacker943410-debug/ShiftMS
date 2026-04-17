import type { ComponentProps } from "react";

import { SitePatternAdvancedEditorPanel } from "./SitePatternAdvancedEditorPanel";
import { SitePatternPresetModal } from "./SitePatternPresetModal";
import { SitePatternSetupPanel } from "./SitePatternSetupPanel";
import { SitePatternSimulationPanel } from "./SitePatternSimulationPanel";

interface SitePatternStepViewProps {
  activeCycleCount: number;
  assignedTeamCount: number;
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

export const SitePatternStepView = ({
  activeCycleCount,
  advancedEditorPanelProps,
  assignedTeamCount,
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
}: SitePatternStepViewProps) => (
  <div className="screen-stack">
    <section className="surface-card site-stage-header">
      <div className="stage-indicator-row">
        <span className="stage-chip active">1단계: 패턴 등록</span>
        <span className="stage-chip">2단계: 조직 구성</span>
      </div>
      <div>
        <h3>{stageLabel} - 1단계: 패턴 등록</h3>
        <p>근무지 기본 정보, Cycle 구성, Pool 기준을 저장하고 우측 시뮬레이션으로 바로 검토합니다.</p>
      </div>
    </section>

    {formError ? <p className="form-error-text">{formError}</p> : null}

    <section className="site-step-summary-grid">
      <article className="surface-card site-step-summary-card emphasis">
        <span>운영 구조</span>
        <strong>
          {teamCount}조 / {cycleCount}개 Cycle
        </strong>
        <em>{siteName.trim() || "신규 근무지 설정 중"}</em>
      </article>
      <article className="surface-card site-step-summary-card">
        <span>조 배정 현황</span>
        <strong>{assignedTeamCount}개 조</strong>
        <em>{activeCycleCount}개 Cycle에 배정됨</em>
      </article>
      <article className="surface-card site-step-summary-card">
        <span>Pool 운영</span>
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
        <SitePatternSetupPanel {...setupPanelProps} />
        <SitePatternAdvancedEditorPanel {...advancedEditorPanelProps} />
      </article>

      <SitePatternSimulationPanel {...simulationPanelProps} />
    </section>

    <section className="surface-card footer-action-card">
      <div className="button-row spread">
        <button className="ghost-button" onClick={onBackToList} type="button">
          뒤로가기
        </button>
        <div className="button-row">
          <button
            className="ghost-button"
            disabled={isSubmitting}
            onClick={onReviewOrSave}
            type="button"
          >
            {hasPersistedSiteId ? "적용" : "입력 검토"}
          </button>
          <button
            className="primary-button"
            disabled={isSubmitting}
            onClick={onGoNext}
            type="button"
          >
            다음 단계
          </button>
        </div>
      </div>
    </section>

    {showPatternPresetModal ? <SitePatternPresetModal {...patternPresetModalProps} /> : null}
  </div>
);
