import { cloneElement, isValidElement, type ReactElement, useEffect, useMemo, useState } from "react";

import type {
  GuideDetailItem,
  GuideDetailTab,
  GuidePageKind,
  RouteGuideDefinition
} from "../guides/guide-types";

interface GuideFlowModalProps {
  guide: RouteGuideDefinition;
  initialPageId?: string;
  onClose: () => void;
}

const guideKindLabels: Record<GuidePageKind, string> = {
  intro: "메뉴 소개",
  toc: "목차",
  feature: "기능 가이드"
};

const resolveInitialPageIndex = (guide: RouteGuideDefinition, initialPageId?: string) => {
  if (!initialPageId) {
    return 0;
  }

  const targetIndex = guide.pages.findIndex((page) => page.id === initialPageId);

  return targetIndex >= 0 ? targetIndex : 0;
};

export const GuideFlowModal = ({ guide, initialPageId, onClose }: GuideFlowModalProps) => {
  const [pageIndex, setPageIndex] = useState(resolveInitialPageIndex(guide, initialPageId));
  const [activeTab, setActiveTab] = useState<GuideDetailTab>("flow");
  const [activeFocusIndex, setActiveFocusIndex] = useState(0);
  const currentPage = guide.pages[pageIndex] ?? guide.pages[0];
  const nextPage = guide.pages[pageIndex + 1];
  const isFirstPage = pageIndex === 0;
  const isLastPage = pageIndex >= guide.pages.length - 1;
  const progressPercent = useMemo(
    () => ((pageIndex + 1) / Math.max(guide.pages.length, 1)) * 100,
    [guide.pages.length, pageIndex]
  );
  const detailItems = useMemo<GuideDetailItem[]>(
    () =>
      currentPage.detailItems ??
      currentPage.steps.map((step, index) => ({
        title: step.title,
        description: step.description,
        focusIndex: step.focusIndex ?? index
      })),
    [currentPage.detailItems, currentPage.steps]
  );
  const activeItems = activeTab === "flow" ? currentPage.steps : detailItems;
  const resolvedFocusIndex = activeItems[activeFocusIndex]?.focusIndex ?? activeFocusIndex;
  const figureElement = isValidElement(currentPage.figure)
    ? (currentPage.figure as ReactElement<{
        activeTab?: GuideDetailTab;
        activeFocusIndex?: number;
      }>)
    : null;
  const figureNode = currentPage.renderFigure
    ? currentPage.renderFigure({
        activeTab,
        activeFocusIndex: resolvedFocusIndex
      })
    : figureElement
      ? cloneElement(figureElement, {
          activeTab,
          activeFocusIndex: resolvedFocusIndex
        })
      : currentPage.figure;

  useEffect(() => {
    setPageIndex(resolveInitialPageIndex(guide, initialPageId));
  }, [guide, initialPageId]);

  useEffect(() => {
    setActiveTab("flow");
    setActiveFocusIndex(0);
  }, [currentPage.id]);

  useEffect(() => {
    const maxIndex = Math.max(activeItems.length - 1, 0);
    setActiveFocusIndex((currentIndex) => Math.min(currentIndex, maxIndex));
  }, [activeItems.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        setPageIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      }

      if (event.key === "ArrowRight") {
        setPageIndex((currentIndex) => Math.min(currentIndex + 1, guide.pages.length - 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [guide.pages.length, onClose]);

  return (
    <div className="modal-overlay">
      <div
        aria-label={`${guide.title} 가이드`}
        aria-modal="true"
        className="modal-card guide-flow-modal"
        role="dialog"
      >
        <div className="guide-flow-header">
          <div className="guide-flow-header-main">
            <div className="guide-flow-meta-row">
              <span className="guide-flow-kicker">{guide.title}</span>
              <span className={`guide-flow-kind-badge guide-flow-kind-badge--${currentPage.kind}`}>
                {guideKindLabels[currentPage.kind]}
              </span>
              <span className="guide-flow-page-counter">
                {pageIndex + 1} / {guide.pages.length}
              </span>
            </div>

            <div className="guide-flow-title-row">
              <div className="modal-heading-copy">
                <h3>{currentPage.title}</h3>
                <p>{currentPage.description}</p>
              </div>

              <button
                aria-label="가이드 닫기"
                className="ghost-button compact-button guide-flow-close-top"
                onClick={onClose}
                type="button"
              >
                닫기
              </button>
            </div>
          </div>

          <div className="guide-flow-header-strip">
            <span className="guide-flow-strip-chip">
              <small>현재 흐름</small>
              <strong>{currentPage.navLabel}</strong>
            </span>
            <span className="guide-flow-strip-chip">
              <small>사용 흐름</small>
              <strong>{currentPage.steps.length}단계</strong>
            </span>
            <span className="guide-flow-strip-chip">
              <small>기능 설명</small>
              <strong>{detailItems.length}항목</strong>
            </span>
          </div>
        </div>

        <div className="guide-flow-progress-shell">
          <div className="guide-flow-progress-header">
            <div className="guide-flow-progress-copy">
              <strong>가이드 순서</strong>
              <span>{guide.description}</span>
            </div>
            <span className="guide-flow-progress-caption">{Math.round(progressPercent)}% 완료</span>
          </div>

          <div aria-hidden="true" className="guide-flow-progress-bar">
            <span style={{ width: `${progressPercent}%` }} />
          </div>

          <div aria-label="가이드 페이지 목록" className="guide-flow-outline">
            {guide.pages.map((page, index) => (
              <button
                aria-current={index === pageIndex ? "step" : undefined}
                className={
                  index === pageIndex
                    ? "guide-flow-outline-button is-active"
                    : "guide-flow-outline-button"
                }
                key={page.id}
                onClick={() => {
                  setPageIndex(index);
                }}
                type="button"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{page.navLabel}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="guide-flow-body">
          <section className="guide-flow-visual-panel">
            <div className="guide-flow-panel-heading">
              <div>
                <span>시뮬레이션 화면</span>
                <strong>{currentPage.navLabel}</strong>
              </div>
              <span className="guide-flow-panel-hint">
                {activeTab === "flow" ? "번호와 포인터로 사용 순서를 봅니다." : "번호별 기능 설명을 읽습니다."}
              </span>
            </div>

            <div className="guide-flow-figure-shell">{figureNode}</div>
          </section>

          <section className="guide-flow-detail-panel">
            <div className="guide-flow-detail-header">
              <div className="guide-flow-page-card">
                <span className="guide-flow-page-card-kicker">{currentPage.navLabel}</span>
                {currentPage.goal ? <p className="guide-flow-goal">{currentPage.goal}</p> : null}
              </div>

              <div className="guide-flow-panel-tabs" role="tablist" aria-label="가이드 설명 보기">
                <button
                  aria-selected={activeTab === "flow"}
                  className={
                    activeTab === "flow"
                      ? "guide-flow-panel-tab is-active"
                      : "guide-flow-panel-tab"
                  }
                  onClick={() => {
                    setActiveTab("flow");
                    setActiveFocusIndex(0);
                  }}
                  role="tab"
                  type="button"
                >
                  사용 흐름
                </button>
                <button
                  aria-selected={activeTab === "details"}
                  className={
                    activeTab === "details"
                      ? "guide-flow-panel-tab is-active"
                      : "guide-flow-panel-tab"
                  }
                  onClick={() => {
                    setActiveTab("details");
                    setActiveFocusIndex(0);
                  }}
                  role="tab"
                  type="button"
                >
                  기능 설명
                </button>
              </div>
            </div>

            <div className="guide-flow-copy">
              <div className="guide-flow-panel-summary">
                <strong>{activeTab === "flow" ? "사용 흐름" : "기능 설명"}</strong>
                <p>
                  {activeTab === "flow"
                    ? "우측 번호를 누르면 좌측 하이라이트와 포인터가 해당 단계로 이동합니다."
                    : "번호별 대상 영역의 의미와 주의사항을 읽고, 아래 보조 설명으로 선행조건과 기대 결과를 확인합니다."}
                </p>
              </div>

              <div className="guide-flow-step-stack">
                {(activeTab === "flow" ? currentPage.steps : detailItems).map((item, index) => (
                  <button
                    className={
                      index === activeFocusIndex
                        ? "guide-flow-step-button is-active"
                        : "guide-flow-step-button"
                    }
                    key={`${currentPage.id}-${activeTab}-${item.title}`}
                    onClick={() => {
                      setActiveFocusIndex(index);
                    }}
                    type="button"
                  >
                    <span className="guide-step-index">{index + 1}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {activeTab === "details" ? (
                <div className="guide-flow-support-stack">
                  {currentPage.preconditions && currentPage.preconditions.length > 0 ? (
                    <div className="guide-flow-info-card guide-flow-info-card--preconditions">
                      <strong className="guide-flow-info-title">선행조건</strong>
                      <div className="guide-flow-info-list">
                        {currentPage.preconditions.map((item) => (
                          <p key={item}>{item}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {currentPage.outcome ? (
                    <div className="guide-flow-info-card guide-flow-info-card--outcome">
                      <strong className="guide-flow-info-title">기대 결과</strong>
                      <p className="guide-flow-info-outcome">{currentPage.outcome}</p>
                    </div>
                  ) : null}

                  {currentPage.notes && currentPage.notes.length > 0 ? (
                    <div className="guide-note-box guide-flow-note-box">
                      {currentPage.notes.map((note) => (
                        <p key={note}>{note}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="guide-flow-inline-tip">
                  <strong>보기 방식</strong>
                  <span>
                    시뮬레이션 화면의 번호형 하이라이트와 우측 번호가 같은 순서를 가리킵니다.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="button-row guide-flow-actions">
          <div className="guide-flow-page-status">
            <strong>{`${pageIndex + 1} / ${guide.pages.length}`}</strong>
            <span>{isLastPage ? "가이드 마지막 단계입니다." : `다음 단계: ${nextPage?.navLabel}`}</span>
          </div>

          <div className="guide-flow-action-group">
            <button
              className="ghost-button"
              disabled={isFirstPage}
              onClick={() => {
                setPageIndex((currentIndex) => Math.max(currentIndex - 1, 0));
              }}
              type="button"
            >
              이전
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (isLastPage) {
                  onClose();
                  return;
                }

                setPageIndex((currentIndex) => Math.min(currentIndex + 1, guide.pages.length - 1));
              }}
              type="button"
            >
              {isLastPage ? "마침" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
