import { useState } from "react";

import type { AuthSessionPolicy } from "@shared/config/auth-session-policy";
import type { AuthSession } from "@shared/domain/model";

interface PasswordChangeScreenProps {
  bootstrapCredentialsFilePath?: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSignOut: () => Promise<void>;
  onSubmit: (input: { currentPassword: string; nextPassword: string }) => Promise<void>;
  sessionPolicy?: AuthSessionPolicy | null;
  session: AuthSession;
}

export const PasswordChangeScreen = ({
  bootstrapCredentialsFilePath,
  errorMessage,
  isSubmitting,
  onSignOut,
  onSubmit,
  sessionPolicy,
  session
}: PasswordChangeScreenProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [nextPasswordConfirmation, setNextPasswordConfirmation] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (currentPassword.trim().length === 0) {
      setValidationError("현재 비밀번호를 입력해주세요.");
      return;
    }

    if (nextPassword.length < 8) {
      setValidationError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    if (nextPassword !== nextPasswordConfirmation) {
      setValidationError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    await onSubmit({
      currentPassword,
      nextPassword
    });
  };

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-copy">
          <p className="eyebrow">보안 확인</p>
          <h1>초기 비밀번호를 새 비밀번호로 바꿔야 합니다</h1>
          <p>
            {session.displayName} 계정은 초기 비밀번호로 로그인했습니다. 운영 화면으로 들어가기 전에
            비밀번호를 먼저 변경해주세요.
          </p>
          <p className="field-hint">로그인 ID: {session.loginId}</p>
          {bootstrapCredentialsFilePath ? (
            <p className="field-hint">
              설치별 초기 비밀번호는 {bootstrapCredentialsFilePath} 파일에서 확인합니다.
            </p>
          ) : null}
          {sessionPolicy ? (
            <p className="field-hint">
              세션은 {sessionPolicy.durationHours}시간 동안 유지되며 앱을 다시 시작하면 다시 로그인해야 합니다.
            </p>
          ) : null}
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>현재 비밀번호</span>
            <input
              autoComplete="current-password"
              onChange={(event) => {
                setValidationError(null);
                setCurrentPassword(event.target.value);
              }}
              type="password"
              value={currentPassword}
            />
          </label>
          <label className="field">
            <span>새 비밀번호</span>
            <input
              autoComplete="new-password"
              onChange={(event) => {
                setValidationError(null);
                setNextPassword(event.target.value);
              }}
              type="password"
              value={nextPassword}
            />
          </label>
          <label className="field">
            <span>새 비밀번호 확인</span>
            <input
              autoComplete="new-password"
              onChange={(event) => {
                setValidationError(null);
                setNextPasswordConfirmation(event.target.value);
              }}
              type="password"
              value={nextPasswordConfirmation}
            />
          </label>
          {validationError ? <p className="form-error-text">{validationError}</p> : null}
          {errorMessage ? <p className="form-error-text">{errorMessage}</p> : null}
          <div className="button-row">
            <button
              className="ghost-button"
              disabled={isSubmitting}
              onClick={() => {
                void onSignOut();
              }}
              type="button"
            >
              로그아웃
            </button>
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "변경 중..." : "비밀번호 변경"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};
