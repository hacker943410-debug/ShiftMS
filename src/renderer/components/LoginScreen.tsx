import { useState } from "react";

import type { AuthSession } from "@shared/domain/model";

interface LoginScreenProps {
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (input: { loginId: string; password: string }) => Promise<void>;
  demoAccounts: Array<{
    label: string;
    loginId: string;
    password: string;
  }>;
}

export const LoginScreen = ({
  isSubmitting,
  errorMessage,
  onSubmit,
  demoAccounts
}: LoginScreenProps) => {
  const [loginId, setLoginId] = useState("admin");
  const [password, setPassword] = useState("admin1234");

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-hero">
          <p className="eyebrow">Shift Operations Console</p>
          <h1>교대근무 운영 콘솔 로그인</h1>
          <p className="login-copy">
            실적 승인, 수당 산출, 근무표 배포 흐름을 하나의 로컬 앱에서
            관리하기 위한 운영자 전용 진입 화면입니다.
          </p>
        </div>

        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit({
              loginId,
              password
            });
          }}
        >
          <label className="form-field">
            <span>로그인 ID</span>
            <input
              autoComplete="username"
              disabled={isSubmitting}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="아이디를 입력하세요"
              value={loginId}
            />
          </label>

          <label className="form-field">
            <span>비밀번호</span>
            <input
              autoComplete="current-password"
              disabled={isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호를 입력하세요"
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? (
            <p
              className="form-error"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <button
            className="primary-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "로그인 확인 중..." : "로그인"}
          </button>
        </form>

        <section className="demo-account-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">시드 계정</p>
              <h2>테스트용 로그인 정보</h2>
            </div>
          </div>
          <div className="demo-account-list">
            {demoAccounts.map((account) => (
              <button
                key={account.loginId}
                className="demo-account-item"
                disabled={isSubmitting}
                onClick={() => {
                  setLoginId(account.loginId);
                  setPassword(account.password);
                }}
                type="button"
              >
                <strong>{account.label}</strong>
                <span>{account.loginId}</span>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
};
