import { useState } from "react";

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
    <main className="login-layout">
      <section className="login-shell">
        <div className="login-visual">
          <p className="brand-overline">SM사업팀 교대근무 관리 시스템</p>
          <h1>교대근무 현황, 실적 승인, 수당 계산을 하나의 데스크톱 앱으로 통합합니다.</h1>
          <p>
            설계 문서 기준 메뉴 체계와 라이트 콘솔 레이아웃을 그대로 반영한 로그인 화면입니다.
          </p>
          <div className="login-highlight-grid">
            <div className="highlight-box">
              <strong>근무표 배포</strong>
              <span>월간 캘린더와 Excel 생성</span>
            </div>
            <div className="highlight-box">
              <strong>실적 승인</strong>
              <span>파일 감시 경로와 승인 흐름</span>
            </div>
            <div className="highlight-box">
              <strong>수당 관리</strong>
              <span>품의서, 별첨1, 별첨2 생성</span>
            </div>
          </div>
        </div>

        <div className="login-panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">로그인</p>
              <h3>운영자 계정 확인</h3>
            </div>
          </div>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit({ loginId, password });
            }}
          >
            <label className="field">
              <span>로그인 ID</span>
              <input
                autoComplete="username"
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
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "로그인 확인 중..." : "로그인"}
            </button>
          </form>

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
      </section>
    </main>
  );
};
