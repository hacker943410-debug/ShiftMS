import type { ReleaseNotesBundle, UpdateStateSnapshot } from "@shared/domain/app-update";

import { ReleaseManifestContent } from "./ReleaseManifestContent";

interface AppUpdateModalProps {
  isBusy?: boolean;
  onCheck: () => void;
  onClose: () => void;
  onDownload: () => void;
  onInstall: () => void;
  state: UpdateStateSnapshot;
}

interface ReleaseNotesModalProps {
  bundle: ReleaseNotesBundle;
  currentIndex: number;
  onConfirm: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const renderUpdateBody = (state: UpdateStateSnapshot) => {
  switch (state.status) {
    case "checking":
      return <p className="app-update-copy">GitHub 릴리즈에서 최신 버전을 확인하고 있습니다.</p>;
    case "available":
      return (
        <>
          <p className="app-update-copy">
            새 버전 <strong>v{state.targetVersion}</strong> 이 준비되었습니다. 다운로드 전에
            변경 내용을 먼저 확인하세요.
          </p>
          {state.availableManifest ? (
            <div className="app-update-manifest-preview">
              <ReleaseManifestContent manifest={state.availableManifest} />
            </div>
          ) : (
            <p className="app-update-copy">
              변경 내용을 불러오지 못했습니다. 다운로드 전, 최신 버전이 있다는 것만
              확인된 상태입니다.
            </p>
          )}
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

export const ReleaseNotesModal = ({
  bundle,
  currentIndex,
  onConfirm,
  onNext,
  onPrevious
}: ReleaseNotesModalProps) => {
  const manifest = bundle.manifests[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === bundle.manifests.length - 1;

  if (!manifest) {
    return null;
  }

  return (
    <div className="modal-overlay release-notes-overlay">
      <section aria-modal="true" className="modal-card release-notes-modal" role="dialog">
        <div className="section-heading compact-heading release-notes-header">
          <div className="modal-heading-copy">
            <strong>업데이트 변경 내용 확인</strong>
            <p className="app-update-version-line">
              확인 기준 {bundle.fromVersion ? `v${bundle.fromVersion} 이후` : "현재 설치분"}
              {` · ${currentIndex + 1}/${bundle.manifests.length}`}
            </p>
          </div>
          <span className="pill info">현재 확인 버전 v{manifest.version}</span>
        </div>

        <p className="app-update-copy release-notes-guide-text">
          업데이트 적용 전후 변경사항을 버전별로 확인해야 계속 사용할 수 있습니다. 마지막
          버전에서는 &apos;마침&apos; 버튼으로 확인을 종료합니다.
        </p>

        <div className="release-note-list">
          <ReleaseManifestContent manifest={manifest} />
        </div>

        <div className="button-row question-dialog-actions release-notes-actions">
          <button className="ghost-button" disabled={isFirst} onClick={onPrevious} type="button">
            이전
          </button>
          {isLast ? (
            <button className="primary-button" onClick={onConfirm} type="button">
              마침
            </button>
          ) : (
            <button className="primary-button" onClick={onNext} type="button">
              다음
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
