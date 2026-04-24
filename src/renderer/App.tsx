import { startTransition, useEffect, useState } from "react";

import { APP_DEFAULT_VERSION, buildAppDisplayTitle } from "@shared/config/app-brand";
import type { AppHealth } from "@shared/bridge/contracts";
import type { AuthSessionPolicy } from "@shared/config/auth-session-policy";
import type { UpdateStateSnapshot } from "@shared/domain/app-update";
import type { AuthSession } from "@shared/domain/model";

import { AppUpdateModal, ReleaseNotesModal } from "./components/AppUpdateModal";
import { DashboardShell } from "./components/DashboardShell";
import { LoginScreen } from "./components/LoginScreen";
import { PasswordChangeScreen } from "./components/PasswordChangeScreen";
import { AppWorkflowProvider } from "./contexts/app-workflow-context";

export const App = () => {
  const [appVersion, setAppVersion] = useState(APP_DEFAULT_VERSION);
  const [health, setHealth] = useState<AppHealth | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateStateSnapshot | null>(null);
  const [isUpdateActionPending, setIsUpdateActionPending] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [releaseNotesIndex, setReleaseNotesIndex] = useState(0);
  const sessionPolicy: AuthSessionPolicy | null = health?.sessionPolicy ?? null;

  useEffect(() => {
    document.title = buildAppDisplayTitle(appVersion);
  }, [appVersion]);

  const syncUpdateState = async () => {
    const result = await window.appBridge.getUpdateState();

    if (result.ok) {
      setUpdateState(result.data);
      return result.data;
    }

    return null;
  };

  useEffect(() => {
    void Promise.all([
      window.appBridge.getAppVersion(),
      window.appBridge.getAppHealth(),
      window.appBridge.getSession(),
      window.appBridge.getUpdateState()
    ])
      .then(([version, healthResult, sessionResult, updateStateResult]) => {
        setAppVersion(version);

        if (healthResult.ok) {
          setHealth(healthResult.data);
        }

        if (sessionResult.ok) {
          setSession(sessionResult.data);
        }

        if (updateStateResult.ok) {
          setUpdateState(updateStateResult.data);
        }
      })
      .catch(() => {
        setAppVersion(APP_DEFAULT_VERSION);
      })
      .finally(() => {
        setIsBooting(false);
      });
  }, []);

  useEffect(() => {
    if (!updateState) {
      return;
    }

    if (
      updateState.status === "available" ||
      updateState.status === "downloading" ||
      updateState.status === "downloaded" ||
      updateState.required
    ) {
      setIsUpdateModalOpen(true);
    }
  }, [updateState]);

  useEffect(() => {
    if (updateState?.status !== "checking" && updateState?.status !== "downloading") {
      return;
    }

    const timeout = window.setTimeout(() => {
      void syncUpdateState();
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [updateState?.status]);

  useEffect(() => {
    setReleaseNotesIndex(0);
  }, [updateState?.releaseNotesToShow?.toVersion]);

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
        return false;
      }

      startTransition(() => {
        setSession(result.data);
        setPasswordChangeError(null);
      });

      return true;
    } finally {
      setIsChangingPassword(false);
    }
  };

  const clearPasswordChangeError = () => {
    setPasswordChangeError(null);
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

  const handleCheckForUpdates = async () => {
    setIsUpdateModalOpen(true);
    setIsUpdateActionPending(true);

    try {
      const result = await window.appBridge.checkForAppUpdate();

      if (result.ok) {
        setUpdateState(result.data);
        return;
      }

      setUpdateState((current) =>
        current
          ? {
              ...current,
              status: "error",
              errorMessage: result.message
            }
          : null
      );
    } finally {
      setIsUpdateActionPending(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setIsUpdateActionPending(true);

    try {
      const result = await window.appBridge.downloadAppUpdate();

      if (result.ok) {
        setUpdateState(result.data);
        return;
      }

      setUpdateState((current) =>
        current
          ? {
              ...current,
              status: "error",
              errorMessage: result.message
            }
          : null
      );
    } finally {
      setIsUpdateActionPending(false);
      void syncUpdateState();
    }
  };

  const handleInstallUpdate = async () => {
    setIsUpdateActionPending(true);

    try {
      const result = await window.appBridge.installDownloadedUpdate();

      if (result.ok) {
        setUpdateState(result.data);
        return;
      }

      setUpdateState((current) =>
        current
          ? {
              ...current,
              status: "error",
              errorMessage: result.message
            }
          : null
      );
    } finally {
      setIsUpdateActionPending(false);
    }
  };

  const handleCloseUpdateModal = async () => {
    if (
      updateState?.status === "available" &&
      updateState.targetVersion &&
      updateState.required !== true
    ) {
      const result = await window.appBridge.dismissUpdateNotice(updateState.targetVersion);

      if (result.ok) {
        setUpdateState(result.data);
      }
    }

    setIsUpdateModalOpen(false);
  };

  const handleConfirmReleaseNotes = async () => {
    if (!updateState?.releaseNotesToShow) {
      return;
    }

    const result = await window.appBridge.dismissUpdateNotice(updateState.releaseNotesToShow.toVersion);

    if (result.ok) {
      setUpdateState(result.data);
    }
  };

  const renderCurrentScreen = () => {
    if (isBooting) {
      return (
        <main className="loading-page">
          <section className="loading-panel">
            <p className="eyebrow">초기 진단</p>
            <h1>앱 상태와 세션을 확인하는 중입니다</h1>
            <p className="login-copy">
              로컬 설정, 초기 세션, 브리지 연결 상태를 점검하고 있습니다.
            </p>
          </section>
        </main>
      );
    }

    if (!session) {
      return (
        <LoginScreen
          appVersion={appVersion}
          bootstrapCredentialsFilePath={health?.bootstrapCredentialsFilePath ?? null}
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
          isChangingPassword={isChangingPassword}
          onChangePassword={handleChangePassword}
          onCheckForUpdates={handleCheckForUpdates}
          onClearPasswordChangeFeedback={clearPasswordChangeError}
          onSignOut={handleSignOut}
          passwordChangeError={passwordChangeError}
          session={session}
          updateState={updateState}
        />
      </AppWorkflowProvider>
    );
  };

  return (
    <>
      {renderCurrentScreen()}
      {updateState?.releaseNotesToShow ? (
        <ReleaseNotesModal
          bundle={updateState.releaseNotesToShow}
          currentIndex={releaseNotesIndex}
          onConfirm={handleConfirmReleaseNotes}
          onNext={() => {
            setReleaseNotesIndex((current) =>
              Math.min(current + 1, updateState.releaseNotesToShow!.manifests.length - 1)
            );
          }}
          onPrevious={() => {
            setReleaseNotesIndex((current) => Math.max(current - 1, 0));
          }}
        />
      ) : null}
      {isUpdateModalOpen && updateState ? (
        <AppUpdateModal
          isBusy={isUpdateActionPending}
          onCheck={handleCheckForUpdates}
          onClose={handleCloseUpdateModal}
          onDownload={handleDownloadUpdate}
          onInstall={handleInstallUpdate}
          state={updateState}
        />
      ) : null}
    </>
  );
};
