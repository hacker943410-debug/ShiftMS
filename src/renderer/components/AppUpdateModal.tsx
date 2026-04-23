import type { ReleaseManifest, UpdateStateSnapshot } from "@shared/domain/app-update";

interface AppUpdateModalProps {
  isBusy?: boolean;
  onCheck: () => void;
  onClose: () => void;
  onDownload: () => void;
  onInstall: () => void;
  state: UpdateStateSnapshot;
}

interface ReleaseNotesModalProps {
  manifest: ReleaseManifest;
  onConfirm: () => void;
}

const renderUpdateBody = (state: UpdateStateSnapshot) => {
  switch (state.status) {
    case "checking":
      return <p className="app-update-copy">GitHub 릴리즈에서 최신 버전을 확인하고 있습니다.</p>;
    case "available":
      return (
        <>
          <p className="app-update-copy">
            새 버전 <strong>v{state.targetVersion}</strong> 이 준비되었습니다.
          </p>
          {state.availableManifest?.notes?.length ? (
            <ul className="app-update-note-list">
              {state.availableManifest.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      );
    case "downloading":
      return (
        <>
          <p className="app-update-copy">
            업데이트 파일을 내려받고 있습니다.
            {typeof state.downloadProgress === "number" ? ` (${state.downloadProgress}%)` : ""}
          </p>
          <div className="app-update-progress" role="presentation">
            <span
              className="app-update-progress-bar"
              style={{ width: `${state.downloadProgress ?? 0}%` }}
            />
          </div>
        </>
      );
    case "downloaded":
      return (
        <p className="app-update-copy">
          업데이트 파일 준비가 끝났습니다. 재시작 후 바로 적용할 수 있습니다.
        </p>
      );
    case "error":
      return <p className="app-update-copy error-text">{state.errorMessage}</p>;
    default:
      return <p className="app-update-copy">현재 설치된 버전은 최신 상태입니다.</p>;
  }
};

export const AppUpdateModal = ({
  isBusy = false,
  onCheck,
  onClose,
  onDownload,
  onInstall,
  state
}: AppUpdateModalProps) => {
  const isRequired = state.required === true;
  const canClose = !isRequired && state.status !== "checking";
  const primaryLabel =
    state.status === "downloaded"
      ? "재시작 후 적용"
      : state.status === "available"
        ? "다운로드"
        : state.status === "downloading"
          ? "다운로드 중"
          : state.status === "error" && state.targetVersion
            ? "다시 다운로드"
            : "다시 확인";

  const handlePrimaryAction = () => {
    if (state.status === "downloaded") {
      onInstall();
      return;
    }

    if (state.status === "available" || (state.status === "error" && state.targetVersion)) {
      onDownload();
      return;
    }

    onCheck();
  };

  return (
    <div className="modal-overlay app-update-overlay">
      <section aria-modal="true" className="modal-card app-update-modal" role="dialog">
        <div className="section-heading compact-heading">
          <div className="modal-heading-copy">
            <strong>{state.headline ?? "앱 업데이트"}</strong>
            <p className="app-update-version-line">
              현재 버전 {state.currentVersion}
              {state.targetVersion ? ` → 대상 버전 ${state.targetVersion}` : ""}
            </p>
          </div>
        </div>

        {renderUpdateBody(state)}

        <div className="button-row question-dialog-actions">
          {canClose ? (
            <button className="ghost-button" onClick={onClose} type="button">
              나중에
            </button>
          ) : null}
          <button
            className="primary-button"
            disabled={isBusy || state.status === "downloading" || state.status === "checking"}
            onClick={handlePrimaryAction}
            type="button"
          >
            {primaryLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

export const ReleaseNotesModal = ({ manifest, onConfirm }: ReleaseNotesModalProps) => (
  <div className="modal-overlay release-notes-overlay">
    <section aria-modal="true" className="modal-card release-notes-modal" role="dialog">
      <div className="section-heading compact-heading">
        <div className="modal-heading-copy">
          <strong>{manifest.headline}</strong>
          <p className="app-update-version-line">
            v{manifest.version} 패치노트 · {manifest.publishedAt.slice(0, 10)}
          </p>
        </div>
      </div>

      <ul className="app-update-note-list release-note-list">
        {manifest.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      <div className="button-row question-dialog-actions">
        <button className="primary-button" onClick={onConfirm} type="button">
          확인
        </button>
      </div>
    </section>
  </div>
);
