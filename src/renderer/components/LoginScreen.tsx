import { useState } from "react";

import {
  APP_LOGO_ALT_TEXT,
  buildAppDisplayTitle
} from "@shared/config/app-brand";
import type {
  AccountRecoveryAvailability,
  AccountRecoveryResult
} from "@shared/bridge/contracts";
import type { AuthSessionPolicy } from "@shared/config/auth-session-policy";

import logoImage from "../assets/brand-logo-clean.png";

interface LoginScreenProps {
  appVersion: string;
  bootstrapCredentialsFilePath?: string | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  sessionPolicy?: AuthSessionPolicy | null;
  recoveryAvailability?: AccountRecoveryAvailability | null;
  onSubmit: (input: { loginId: string; password: string }) => Promise<void>;
  onRecoverAccount?: (input: { recoveryKey: string }) => Promise<AccountRecoveryResult>;
}

export const LoginScreen = ({
  appVersion,
  bootstrapCredentialsFilePath,
  isSubmitting,
  errorMessage,
  sessionPolicy,
  recoveryAvailability,
  onRecoverAccount,
  onSubmit
}: LoginScreenProps) => {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoveryErrorMessage, setRecoveryErrorMessage] = useState<string | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<AccountRecoveryResult | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const isRecoveryConfigured = recoveryAvailability?.configured === true;

  const openRecoveryModal = () => {
    setRecoveryKey("");
    setRecoveryErrorMessage(null);
    setRecoveryResult(null);
    setIsRecoveryModalOpen(true);
  };

  const closeRecoveryModal = () => {
    if (isRecovering) {
      return;
    }

    setIsRecoveryModalOpen(false);
    setRecoveryKey("");
    setRecoveryErrorMessage(null);
    setRecoveryResult(null);
  };

  const handleRecoverAccount = async () => {
    if (!onRecoverAccount || !isRecoveryConfigured) {
      return;
    }

    if (recoveryKey.trim().length === 0) {
      setRecoveryErrorMessage("계정복구키를 입력해주세요.");
      return;
    }

    setIsRecovering(true);
    setRecoveryErrorMessage(null);

    try {
      const result = await onRecoverAccount({
        recoveryKey
      });

      setRecoveryResult(result);
      setRecoveryKey("");
    } catch (error) {
      setRecoveryErrorMessage(
        error instanceof Error ? error.message : "계정복구 중 오류가 발생했습니다."
      );
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <>
      <main className="login-layout">
        <section className="login-shell">
          <div className="login-brand-panel">
            <div className="login-brand-wrap" title={buildAppDisplayTitle(appVersion)}>
              <img alt={APP_LOGO_ALT_TEXT} className="login-brand-logo" src={logoImage} />
            </div>
          </div>

          <div className="login-panel">
            <form
              className="form-stack login-form"
              onSubmit={(event) => {
                event.preventDefault();
                void onSubmit({ loginId, password });
              }}
            >
              <label className="field">
                <span>ID</span>
                <input
                  autoComplete="username"
                  autoFocus
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setLoginId(event.target.value);
                  }}
                  value={loginId}
                />
              </label>
              <label className="field">
                <span>비밀번호</span>
                <input
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  type="password"
                  value={password}
                />
              </label>
              {errorMessage ? <p className="error-copy">{errorMessage}</p> : null}
              <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
                {isSubmitting ? "로그인 확인 중..." : "로그인"}
              </button>
              <button
                className="ghost-button login-recovery-button"
                disabled={isSubmitting}
                onClick={openRecoveryModal}
                type="button"
              >
                계정복구
              </button>
            </form>

            <div className="login-demo-section">
              <span className="login-demo-title">로그인 안내</span>
              <p className="field-hint">
                관리자 초기 비밀번호는 설치 시 정해집니다. 최초 로그인 후 반드시 새 비밀번호로 변경해야 합니다.
              </p>
              {bootstrapCredentialsFilePath ? (
                <p className="field-hint">
                  설치별 추가 계정 초기 비밀번호는 {bootstrapCredentialsFilePath} 파일에서 확인합니다.
                </p>
              ) : null}
              {sessionPolicy ? (
                <p className="field-hint">
                  세션은 {sessionPolicy.durationHours}시간 동안 유지되며 앱을 다시 시작하면 다시 로그인해야 합니다.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      {isRecoveryModalOpen ? (
        <div className="modal-overlay">
          <section aria-modal="true" className="modal-card account-recovery-modal" role="dialog">
            <div className="section-heading compact-heading">
              <div className="modal-heading-copy">
                <strong>계정복구</strong>
                <p>발급된 계정복구키로 admin 계정 비밀번호를 재설정하고 임시 비밀번호를 발급합니다.</p>
              </div>
            </div>

            {recoveryResult ? (
              <div className="account-recovery-result-panel">
                <p className="form-success-text">admin 계정 복구가 완료되었습니다.</p>
                <label className="field">
                  <span>로그인 ID</span>
                  <input readOnly value={recoveryResult.adminLoginId} />
                </label>
                <label className="field">
                  <span>임시 비밀번호</span>
                  <input readOnly value={recoveryResult.temporaryPassword} />
                </label>
                <p className="field-hint">
                  임시 비밀번호로 로그인하면 비밀번호 변경 화면이 표시됩니다. 변경 전까지는 이 값을 보관하세요.
                </p>
                <p className="field-hint">복구 전 DB 백업: {recoveryResult.backupPath}</p>
              </div>
            ) : isRecoveryConfigured ? (
              <>
                <label className="field">
                  <span>계정복구키</span>
                  <input
                    autoComplete="off"
                    disabled={isRecovering}
                    onChange={(event) => {
                      setRecoveryErrorMessage(null);
                      setRecoveryKey(event.target.value);
                    }}
                    placeholder="SMR-XXXX-XXXX-..."
                    value={recoveryKey}
                  />
                </label>
                {recoveryAvailability?.issuedAt ? (
                  <p className="field-hint">복구키 발급일: {recoveryAvailability.issuedAt}</p>
                ) : null}
                {recoveryAvailability?.lockedUntil ? (
                  <p className="form-error-text">
                    복구키 입력이 잠겼습니다. {recoveryAvailability.lockedUntil} 이후 다시 시도해 주세요.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="account-recovery-result-panel">
                <p className="form-error-text">아직 발급된 계정복구키가 없습니다.</p>
                <p className="field-hint">
                  정상 로그인 가능한 관리자 계정으로 운영 관리 &gt; 사용자 관리에서 복구키를 먼저 발급해야 합니다.
                  모든 관리자 계정에 접근할 수 없는 경우 유지보수 복구 스크립트를 사용하세요.
                </p>
              </div>
            )}

            {recoveryErrorMessage ? (
              <p className="form-error-text modal-feedback">{recoveryErrorMessage}</p>
            ) : null}

            <div className="button-row question-dialog-actions">
              <button className="ghost-button" disabled={isRecovering} onClick={closeRecoveryModal} type="button">
                닫기
              </button>
              {!recoveryResult && isRecoveryConfigured ? (
                <button
                  className="primary-button"
                  disabled={isRecovering || recoveryAvailability?.lockedUntil !== undefined}
                  onClick={() => {
                    void handleRecoverAccount();
                  }}
                  type="button"
                >
                  {isRecovering ? "복구 중..." : "복구 실행"}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
