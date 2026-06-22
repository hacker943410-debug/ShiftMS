import type { AuthSessionPolicy } from "@shared/config/auth-session-policy";
import type { AuthSession } from "@shared/domain/model";

import { PasswordChangeForm } from "./PasswordChangeForm";

interface PasswordChangeScreenProps {
  bootstrapCredentialsFilePath?: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSignOut: () => Promise<void>;
  onSubmit: (input: { currentPassword: string; nextPassword: string }) => Promise<boolean>;
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
}: PasswordChangeScreenProps) => (
    <main className="login-layout">
      <section className="login-shell">
        <section className="login-panel">
          <div className="login-copy">
          <p className="eyebrow">보안 확인</p>
          <h1>초기 비밀번호를 새 비밀번호로 바꿔야 합니다</h1>
          <p>
            {session.displayName} 계정은 초기 비밀번호로 로그인했습니다. 운영 화면으로 들어가기 전에
            비밀번호를 먼저 변경해주세요.
          </p>
          <p className="field-hint">로그인 ID: {session.loginId}</p>
          {session.loginId === "admin" ? (
            <p className="field-hint">
              관리자 계정은 초기 비밀번호로 로그인했습니다. 지금 반드시 새 비밀번호로 변경해야 합니다.
            </p>
          ) : bootstrapCredentialsFilePath ? (
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

        <PasswordChangeForm
          cancelLabel="로그아웃"
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          onCancel={() => {
            void onSignOut();
          }}
          onSubmit={onSubmit}
          submitLabel="변경 완료"
          submittingLabel="변경 중..."
        />
        </section>
      </section>
    </main>
);
