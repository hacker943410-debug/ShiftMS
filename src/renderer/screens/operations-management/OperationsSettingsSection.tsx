import type {
  AppSettingsSnapshot,
  AppSettingsUpdateInput,
  FileWatchStatusSnapshot
} from "@shared/bridge/contracts";

interface OperationsSettingsSectionProps {
  settings: AppSettingsSnapshot | null;
  settingsForm: AppSettingsUpdateInput;
  fileWatchStatus: FileWatchStatusSnapshot | null;
  isLoading: boolean;
  isSaving: boolean;
  isSelectingDirectory: boolean;
  isWatchActionRunning: boolean;
  onSaveSettings: () => void;
  onSettingsFieldChange: (field: keyof AppSettingsUpdateInput, value: string) => void;
  onSelectDirectory: (field: "pendingDir" | "approvedDir" | "scheduleExportDir") => void;
  onFileWatchAction: (action: "stop" | "restart") => void;
  formatDateTime: (value?: string) => string;
  fileWatchEventLabel: Record<FileWatchStatusSnapshot["recentEvents"][number]["type"], string>;
  fileWatchDirectoryLabel: Record<
    FileWatchStatusSnapshot["recentEvents"][number]["directoryType"],
    string
  >;
}

export const OperationsSettingsSection = ({
  settings,
  settingsForm,
  fileWatchStatus,
  isLoading,
  isSaving,
  isSelectingDirectory,
  isWatchActionRunning,
  onSaveSettings,
  onSettingsFieldChange,
  onSelectDirectory,
  onFileWatchAction,
  formatDateTime,
  fileWatchEventLabel,
  fileWatchDirectoryLabel
}: OperationsSettingsSectionProps) => {
  return (
    <>
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.0 경로 설정</p>
            <h3>파일 감시 및 출력 경로</h3>
          </div>
          <button
            className="primary-button"
            disabled={isLoading || isSaving}
            onClick={onSaveSettings}
            type="button"
          >
            {isSaving ? "저장 중..." : "경로 저장"}
          </button>
        </div>
        <div className="filter-grid two-up">
          <div className="field field-with-action">
            <span>승인 대기 폴더</span>
            <div className="field-action-row">
              <input placeholder="승인 대기 폴더 경로" readOnly value={settingsForm.pendingDir} />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={() => {
                  onSelectDirectory("pendingDir");
                }}
                type="button"
              >
                {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
          <div className="field field-with-action">
            <span>승인 완료 폴더</span>
            <div className="field-action-row">
              <input placeholder="승인 완료 폴더 경로" readOnly value={settingsForm.approvedDir} />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={() => {
                  onSelectDirectory("approvedDir");
                }}
                type="button"
              >
                {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
          <div className="field field-with-action">
            <span>근무표 내보내기 폴더</span>
            <div className="field-action-row">
              <input placeholder="근무표 내보내기 경로" readOnly value={settingsForm.scheduleExportDir} />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={() => {
                  onSelectDirectory("scheduleExportDir");
                }}
                type="button"
              >
                {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
          <label className="field">
            <span>공휴일 API 주소</span>
            <input
              onChange={(event) => {
                onSettingsFieldChange("holidayApiBaseUrl", event.target.value);
              }}
              placeholder="공휴일 API 주소"
              value={settingsForm.holidayApiBaseUrl}
            />
          </label>
          <label className="field">
            <span>데이터 루트</span>
            <input readOnly value={settings?.dataDir ?? "-"} />
          </label>
          <label className="field">
            <span>DB 경로</span>
            <input readOnly value={settings?.databasePath ?? "-"} />
          </label>
        </div>
      </section>

      <section className="split-grid two-up">
        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.0.1 감시 상태</p>
              <h3>실적 파일 감시 런타임</h3>
            </div>
            <div className="button-row">
              <span className={`pill ${fileWatchStatus?.isRunning ? "info" : "neutral"}`}>
                {fileWatchStatus?.isRunning ? "감시 중" : "중지"}
              </span>
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={onSaveSettings}
                type="button"
              >
                {isSaving ? "저장 중..." : "경로 저장"}
              </button>
              <button
                className="ghost-button"
                disabled={isLoading || isWatchActionRunning}
                onClick={() => {
                  onFileWatchAction("stop");
                }}
                type="button"
              >
                {isWatchActionRunning ? "처리 중..." : "감시 중지"}
              </button>
              <button
                className="primary-button"
                disabled={isLoading || isWatchActionRunning}
                onClick={() => {
                  onFileWatchAction("restart");
                }}
                type="button"
              >
                {isWatchActionRunning ? "처리 중..." : "감시 재시작"}
              </button>
            </div>
          </div>
          <div className="filter-grid two-up">
            <div className="field field-with-action">
              <span>감시할 승인 대기 폴더</span>
              <div className="field-action-row">
                <input placeholder="승인 대기 폴더 경로" readOnly value={settingsForm.pendingDir} />
                <button
                  className="ghost-button"
                  disabled={isLoading || isSaving || isSelectingDirectory}
                  onClick={() => {
                    onSelectDirectory("pendingDir");
                  }}
                  type="button"
                >
                  {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
                </button>
              </div>
              <small className="field-hint">
                현재 감시 중: {fileWatchStatus?.pendingDir ?? "-"}
                {fileWatchStatus?.pendingDir !== settingsForm.pendingDir
                  ? " / 경로 저장 후 감시 재시작하면 새 폴더가 적용됩니다."
                  : ""}
              </small>
            </div>
            <div className="field field-with-action">
              <span>감시할 승인 완료 폴더</span>
              <div className="field-action-row">
                <input placeholder="승인 완료 폴더 경로" readOnly value={settingsForm.approvedDir} />
                <button
                  className="ghost-button"
                  disabled={isLoading || isSaving || isSelectingDirectory}
                  onClick={() => {
                    onSelectDirectory("approvedDir");
                  }}
                  type="button"
                >
                  {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
                </button>
              </div>
              <small className="field-hint">
                현재 감시 중: {fileWatchStatus?.approvedDir ?? "-"}
                {fileWatchStatus?.approvedDir !== settingsForm.approvedDir
                  ? " / 경로 저장 후 감시 재시작하면 새 폴더가 적용됩니다."
                  : ""}
              </small>
            </div>
            <label className="field">
              <span>최근 시작 시각</span>
              <input readOnly value={formatDateTime(fileWatchStatus?.lastStartedAt)} />
            </label>
            <label className="field">
              <span>최근 중지 시각</span>
              <input readOnly value={formatDateTime(fileWatchStatus?.lastStoppedAt)} />
            </label>
          </div>
          <p className="field-hint">
            {fileWatchStatus?.lastErrorMessage
              ? `최근 오류: ${fileWatchStatus.lastErrorMessage}`
              : "경로를 바꾼 뒤에는 감시 재시작으로 새 설정을 적용합니다."}
          </p>
        </article>

        <article className="surface-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">7.0.2 최근 감지 이력</p>
              <h3>감시 이벤트 로그</h3>
            </div>
            <span className="pill neutral">{fileWatchStatus?.recentEvents.length ?? 0}건</span>
          </div>
          <div className="data-scroll">
            <table className="info-table template-management-table">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>이벤트</th>
                  <th>대상</th>
                  <th>파일명</th>
                </tr>
              </thead>
              <tbody>
                {fileWatchStatus?.recentEvents.length ? (
                  fileWatchStatus.recentEvents.map((event, index) => (
                    <tr key={`${event.occurredAt}-${event.filePath}-${index}`}>
                      <td>{formatDateTime(event.occurredAt)}</td>
                      <td>{fileWatchEventLabel[event.type]}</td>
                      <td>{fileWatchDirectoryLabel[event.directoryType]}</td>
                      <td>{event.message ? `${event.fileName} / ${event.message}` : event.fileName}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>기록된 감시 이벤트가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
};
