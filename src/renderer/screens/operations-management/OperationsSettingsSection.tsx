import type {
  AppSettingsSnapshot,
  AppSettingsUpdateInput
} from "@shared/bridge/contracts";
import {
  accessMigrationTableOptions,
  type AccessMigrationTableName
} from "@shared/domain/database-migration";

import { FormSelect } from "../../components/FormSelect";
import { TimeValuePicker } from "../../components/TimeValuePicker";

interface OperationsSettingsSectionProps {
  settings: AppSettingsSnapshot | null;
  settingsForm: AppSettingsUpdateInput;
  isLoading: boolean;
  isSaving: boolean;
  isSelectingDirectory: boolean;
  isSelectingMigrationFile: boolean;
  isRunningDatabaseBackup: boolean;
  selectedAccessTables: AccessMigrationTableName[];
  showAccessTableSelection: boolean;
  onClearAccessTables: () => void;
  onSaveSettings: () => void;
  onSelectAllAccessTables: () => void;
  onRunDatabaseBackupNow: () => void;
  onSettingsFieldChange: (field: keyof AppSettingsUpdateInput, value: string) => void;
  onToggleAccessTable: (tableName: AccessMigrationTableName) => void;
  onSelectDirectory: (
    field:
      | "pendingDir"
      | "approvedDir"
      | "scheduleExportDir"
      | "allowanceProposalExportDir"
      | "allowanceAttachment1ExportDir"
      | "allowanceAttachment2ExportDir"
      | "databaseBackupDir"
  ) => void;
  onSelectMigrationFile: () => void;
}

export const OperationsSettingsSection = ({
  settings,
  settingsForm,
  isLoading,
  isSaving,
  isSelectingDirectory,
  isSelectingMigrationFile,
  isRunningDatabaseBackup,
  selectedAccessTables,
  showAccessTableSelection,
  onClearAccessTables,
  onSaveSettings,
  onSelectAllAccessTables,
  onRunDatabaseBackupNow,
  onSettingsFieldChange,
  onToggleAccessTable,
  onSelectDirectory,
  onSelectMigrationFile
}: OperationsSettingsSectionProps) => {
  return (
    <>
      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.0 경로 설정</p>
            <h3>경로 설정</h3>
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
          <div className="field field-with-action">
            <span>품의서 저장 폴더</span>
            <div className="field-action-row">
              <input
                placeholder="품의서 저장 경로"
                readOnly
                value={settingsForm.allowanceProposalExportDir}
              />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={() => {
                  onSelectDirectory("allowanceProposalExportDir");
                }}
                type="button"
              >
                {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
          <div className="field field-with-action">
            <span>별첨1 저장 폴더</span>
            <div className="field-action-row">
              <input
                placeholder="별첨1 저장 경로"
                readOnly
                value={settingsForm.allowanceAttachment1ExportDir}
              />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={() => {
                  onSelectDirectory("allowanceAttachment1ExportDir");
                }}
                type="button"
              >
                {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
          <div className="field field-with-action">
            <span>별첨2 저장 폴더</span>
            <div className="field-action-row">
              <input
                placeholder="별첨2 저장 경로"
                readOnly
                value={settingsForm.allowanceAttachment2ExportDir}
              />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={() => {
                  onSelectDirectory("allowanceAttachment2ExportDir");
                }}
                type="button"
              >
                {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
          <div className="field field-with-action">
            <span>복원 파일 경로</span>
            <div className="field-action-row">
              <input
                placeholder="백업 JSON(.json) 또는 Access DB(.accdb) 파일 경로"
                readOnly
                value={settingsForm.migrationFilePath}
              />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingMigrationFile}
                onClick={onSelectMigrationFile}
                type="button"
              >
                {isSelectingMigrationFile ? "선택 중..." : "파일 선택"}
              </button>
            </div>
          </div>
          {showAccessTableSelection ? (
            <label className="field site-toggle-field">
              <span>Access 복원 테이블</span>
              <div className="button-row">
                <button className="ghost-button compact-button" onClick={onSelectAllAccessTables} type="button">
                  전체 선택
                </button>
                <button className="ghost-button compact-button" onClick={onClearAccessTables} type="button">
                  전체 해제
                </button>
              </div>
              <span className="site-checkbox-row" style={{ alignItems: "flex-start", flexDirection: "column" }}>
                {accessMigrationTableOptions.map((option) => (
                  <label key={option.value} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      checked={selectedAccessTables.includes(option.value)}
                      onChange={() => {
                        onToggleAccessTable(option.value);
                      }}
                      type="checkbox"
                    />
                    <strong>{option.label}</strong>
                  </label>
                ))}
                <em className="site-field-note">
                  Access 복원은 선택한 원본 테이블만 읽습니다. 선택이 비어 있으면 미리보기를 실행할 수 없습니다.
                </em>
              </span>
            </label>
          ) : null}
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

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">7.1 DB 자동 백업</p>
            <h3>DB 자동 백업 설정</h3>
          </div>
          <button
            className="ghost-button"
            disabled={
              isLoading ||
              isSaving ||
              isSelectingDirectory ||
              isSelectingMigrationFile ||
              isRunningDatabaseBackup
            }
            onClick={onRunDatabaseBackupNow}
            type="button"
          >
            {isRunningDatabaseBackup ? "백업 중..." : "수동 백업 저장"}
          </button>
        </div>
        <div className="filter-grid two-up">
          <div className="field field-with-action">
            <span>백업 저장 폴더</span>
            <div className="field-action-row">
              <input placeholder="DB 백업 저장 경로" readOnly value={settingsForm.databaseBackupDir} />
              <button
                className="ghost-button"
                disabled={isLoading || isSaving || isSelectingDirectory}
                onClick={() => {
                  onSelectDirectory("databaseBackupDir");
                }}
                type="button"
              >
                {isSelectingDirectory ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
          <label className="field">
            <span>백업 주기</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                onSettingsFieldChange("databaseBackupSchedule", event.target.value);
              }}
              selectClassName="top-filter-select"
              value={settingsForm.databaseBackupSchedule}
            >
              <option value="monthly">월간</option>
              <option value="weekly">주간</option>
              <option value="daily">일간</option>
            </FormSelect>
          </label>
          <label className="field">
            <span>백업 시간</span>
            <TimeValuePicker
              disabled={isLoading || isSaving}
              onChange={(value) => {
                onSettingsFieldChange("databaseBackupTime", value);
              }}
              value={settingsForm.databaseBackupTime}
            />
          </label>
          <div className="field">
            <span>백업 방식</span>
            <input readOnly value="JSON 스냅샷 + Excel 백업 + Access 원본 조건부 백업" />
            <em className="field-hint">
              주간은 매주 월요일, 월간은 매월 1일 기준으로 앱 실행 중인 시점에 동작하며,
              수동 백업도 같은 방식으로 저장합니다. Access 원본 경로가 확인되는 경우 사본도 함께 보관합니다.
            </em>
          </div>
        </div>
      </section>

    </>
  );
};
