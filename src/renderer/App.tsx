import { startTransition, useEffect, useState } from "react";

import { APP_DEFAULT_VERSION, buildAppDisplayTitle } from "@shared/config/app-brand";
import type { AppHealth } from "@shared/bridge/contracts";
import type { AuthSessionPolicy } from "@shared/config/auth-session-policy";
import type { AuthSession } from "@shared/domain/model";

import { DashboardShell } from "./components/DashboardShell";
import { LoginScreen } from "./components/LoginScreen";
import { PasswordChangeScreen } from "./components/PasswordChangeScreen";
import { AppWorkflowProvider } from "./contexts/app-workflow-context";

const demoAccounts = [
  {
    label: "관리자",
    loginId: "admin"
  },
  {
    label: "운영담당",
    loginId: "operator"
  },
  {
    label: "Reviewer",
    loginId: "reviewer"
  }
];

export const App = () => {
  const [appVersion, setAppVersion] = useState(APP_DEFAULT_VERSION);
  const [health, setHealth] = useState<AppHealth | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const sessionPolicy: AuthSessionPolicy | null = health?.sessionPolicy ?? null;

  useEffect(() => {
    document.title = buildAppDisplayTitle(appVersion);
  }, [appVersion]);

  useEffect(() => {
    void Promise.all([
      window.appBridge.getAppVersion(),
      window.appBridge.getAppHealth(),
      window.appBridge.getSession()
    ])
      .then(([version, healthResult, sessionResult]) => {
        setAppVersion(version);

        if (healthResult.ok) {
          setHealth(healthResult.data);
        }

        if (sessionResult.ok) {
          setSession(sessionResult.data);
        }
      })
      .catch(() => {
        setAppVersion(APP_DEFAULT_VERSION);
      })
      .finally(() => {
        setIsBooting(false);
      });
  }, []);

  const handleSignIn = async (input: { loginId: string; password: string }) => {
    setErrorMessage(null);
    setPasswordChangeError(null);
    setIsSubmitting(true);

    try {
      const result = await window.appBridge.signIn(input);

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      startTransition(() => {
        setSession(result.data);
        setErrorMessage(null);
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (input: {
    currentPassword: string;
    nextPassword: string;
  }) => {
    setPasswordChangeError(null);
    setIsChangingPassword(true);

    try {
      const result = await window.appBridge.changePassword(input);

      if (!result.ok) {
        setPasswordChangeError(result.message);
        return;
      }

      startTransition(() => {
        setSession(result.data);
        setPasswordChangeError(null);
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    const result = await window.appBridge.signOut();

    if (result.ok) {
      startTransition(() => {
        setSession(null);
        setPasswordChangeError(null);
      });
    }
  };

  if (isBooting) {
    return (
      <main className="loading-page">
        <section className="loading-panel">
          <p className="eyebrow">초기 진단</p>
          <h1>앱 상태와 세션을 확인하는 중입니다</h1>
          <p className="login-copy">로컬 설정, 초기 세션, 브리지 연결 상태를 점검하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        appVersion={appVersion}
        bootstrapCredentialsFilePath={health?.bootstrapCredentialsFilePath ?? null}
        demoAccounts={demoAccounts}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onSubmit={handleSignIn}
        sessionPolicy={sessionPolicy}
      />
    );
  }

  if (session.passwordChangeRequired) {
    return (
      <PasswordChangeScreen
        bootstrapCredentialsFilePath={health?.bootstrapCredentialsFilePath ?? null}
        errorMessage={passwordChangeError}
        isSubmitting={isChangingPassword}
        onSignOut={handleSignOut}
        onSubmit={handleChangePassword}
        sessionPolicy={sessionPolicy}
        session={session}
      />
    );
  }

  return (
    <AppWorkflowProvider>
      <DashboardShell
        appVersion={appVersion}
        health={health}
        onSignOut={handleSignOut}
        session={session}
      />
    </AppWorkflowProvider>
  );
};
