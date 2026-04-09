import { useState } from "react";

import {
  APP_LOGO_ALT_TEXT,
  buildAppDisplayTitle
} from "@shared/config/app-brand";

import logoImage from "../assets/brand-logo-clean.png";

interface LoginScreenProps {
  appVersion: string;
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
  appVersion,
  isSubmitting,
  errorMessage,
  onSubmit,
  demoAccounts
}: LoginScreenProps) => {
  const [loginId, setLoginId] = useState("admin");
  const [password, setPassword] = useState("admin1234");

  return (
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
          </form>

          <div className="login-demo-section">
            <span className="login-demo-title">테스트 계정 바로입력</span>
            <div className="demo-grid">
              {demoAccounts.map((account) => (
                <button
                  className="demo-account"
                  disabled={isSubmitting}
                  key={account.loginId}
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
          </div>
        </div>
      </section>
    </main>
  );
};
