import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import type { GuidanceConfig } from "../contexts/app-workflow-context";
import type { RouteKey } from "../mock-design-data";

interface GuidanceModalProps {
  config: GuidanceConfig;
  onNavigate: (
    route: RouteKey,
    params?: { selectedSiteId?: string; selectedMonth?: string }
  ) => void;
  onClose: () => void;
}

// A friendly "왜 막혔는지 + 어떻게 하면 되는지" modal. Instead of silently disabling an action or
// showing a bare error, it explains the cause in plain language, lays out the fix as a numbered
// user-flow, and (optionally) walks the user straight to the screen where they resolve it.
export const GuidanceModal = ({ config, onNavigate, onClose }: GuidanceModalProps) => {
  const titleId = useId();
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      primaryButtonRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const handleNavigate = () => {
    if (config.navigation) {
      onNavigate(config.navigation.route, config.navigation.params);
    }

    onClose();
  };

  return (
    <div className="modal-overlay" onKeyDown={handleKeyDown}>
      <div aria-labelledby={titleId} aria-modal="true" className="modal-card guide-modal" role="dialog">
        <div className="section-heading compact-heading">
          <div className="modal-heading-copy">
            <h3 id={titleId}>{config.title}</h3>
            <p>왜 막혔는지와 어떻게 하면 되는지 안내합니다.</p>
          </div>
        </div>

        <div className="guide-modal-body">
          <div className="guide-modal-copy">
            <div className="guidance-why-box">
              <span className="guidance-why-label">왜 막혔나요?</span>
              <p>{config.why}</p>
            </div>

            <p className="guidance-steps-heading">이렇게 하시면 됩니다</p>
            <div className="guide-step-stack">
              {config.steps.map((step, index) => (
                <div className="guide-step-card" key={`${step.title}-${index + 1}`}>
                  <span className="guide-step-index">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {config.notes && config.notes.length > 0 ? (
              <div className="guide-note-box">
                {config.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="button-row">
          {config.navigation ? (
            <>
              <button className="ghost-button" onClick={onClose} type="button">
                닫기
              </button>
              <button
                className="primary-button"
                onClick={handleNavigate}
                ref={primaryButtonRef}
                type="button"
              >
                {config.navigation.label}
              </button>
            </>
          ) : (
            <button className="primary-button" onClick={onClose} ref={primaryButtonRef} type="button">
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
