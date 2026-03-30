import type { ReactNode } from "react";

interface GuideStep {
  title: string;
  description: string;
}

interface GuideModalProps {
  title: string;
  description: string;
  steps: GuideStep[];
  notes?: string[];
  figure: ReactNode;
  onClose: () => void;
}

export const GuideModal = ({
  title,
  description,
  steps,
  notes,
  figure,
  onClose
}: GuideModalProps) => (
  <div className="modal-overlay">
    <div aria-modal="true" className="modal-card guide-modal" role="dialog">
      <div className="section-heading compact-heading">
        <div className="modal-heading-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>

      <div className="guide-modal-body">
        <div className="guide-modal-figure-shell">{figure}</div>

        <div className="guide-modal-copy">
          <div className="guide-step-stack">
            {steps.map((step, index) => (
              <div className="guide-step-card" key={`${step.title}-${index + 1}`}>
                <span className="guide-step-index">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {notes && notes.length > 0 ? (
            <div className="guide-note-box">
              {notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={onClose} type="button">
          닫기
        </button>
      </div>
    </div>
  </div>
);
