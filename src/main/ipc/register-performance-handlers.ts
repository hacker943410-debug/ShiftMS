import { existsSync } from "node:fs";

import { ipcMain, shell } from "electron";
import type { App } from "electron";

import { getStoredAppSettingsSnapshot } from "../services/app-settings-storage-service";
import {
  approvePerformanceFile,
  finalizeReapprovedPerformanceFile,
  getPerformanceApprovalHistory,
  rejectPerformanceFile
} from "../services/performance-approval-flow-service";
import { hideApprovedPerformanceOverviewRow } from "../services/performance-approved-row-management-service";
import {
  getPerformanceFileDetail,
  getPendingPerformanceFileDetail,
  listPerformanceFiles,
  listPendingPerformanceFiles
} from "../services/performance-queue-service";
import {
  getPerformanceComparison,
  listPerformanceOverview
} from "../services/performance-management-service";
import { getPerformanceFileSyncStateSnapshot } from "../services/performance-file-intake-service";
import { getPerformanceStartupRecoveryStatusSnapshot } from "../services/performance-startup-recovery-status-service";
import { recoverPerformanceDataOnStartup } from "../services/performance-startup-recovery-service";
import {
  createIpcFailure,
  createIpcSuccess,
  runIpcAction,
  runIpcOpenPathAction
} from "./ipc-handler-helpers";
import type { AuthSession } from "../../shared/domain/model";
import type { ActionPermissionKey } from "../../shared/domain/authorization";
import type {
  BridgeFailure,
  PerformanceComparisonQuery,
  PerformanceFileDetailQuery,
  PerformanceFileListQuery,
  PerformanceOverviewQuery
} from "../../shared/bridge/contracts";
import type {
  PerformanceApprovalActionInput,
  PerformanceApprovedRowHideInput,
  PerformanceReapprovalFinalizeInput,
  PerformanceRejectionInput
} from "../../shared/domain/performance-file";
import type {
  IpcActivityInput,
  RecordSuccessfulIpcActivity
} from "./ipc-handler-helpers";

type WithSession = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;
type WithActionPermission = <T>(
  actionKey: ActionPermissionKey,
  callback: (session: AuthSession) => T
) => T | BridgeFailure;

type RegisterPerformanceHandlersOptions = {
  app: App;
  getErrorMessage: (error: unknown) => string;
  recordSuccessfulActivity: RecordSuccessfulIpcActivity;
  withActionPermission: WithActionPermission;
  withSession: WithSession;
};

export const registerPerformanceHandlers = ({
  app,
  getErrorMessage,
  recordSuccessfulActivity,
  withActionPermission,
  withSession
}: RegisterPerformanceHandlersOptions) => {
  const getUserDataPath = () => app.getPath("userData");
  const trackSuccess = (input: IpcActivityInput) => ({
    input,
    recordSuccessfulActivity
  });

  ipcMain.handle("performance:list-files", async (_event, query?: PerformanceFileListQuery) =>
    withSession(async () =>
      createIpcSuccess(
        await listPerformanceFiles(
          query,
          getStoredAppSettingsSnapshot({
            userDataPath: getUserDataPath()
          })
        )
      )
    )
  );
  ipcMain.handle("performance:get-sync-state", () =>
    withSession(() => createIpcSuccess(getPerformanceFileSyncStateSnapshot()))
  );
  ipcMain.handle("performance:get-startup-recovery-status", () =>
    withSession(() => createIpcSuccess(getPerformanceStartupRecoveryStatusSnapshot()))
  );
  ipcMain.handle("performance:retry-startup-recovery", async () =>
    withSession(async () => {
      await recoverPerformanceDataOnStartup({ userDataPath: getUserDataPath() });
      return createIpcSuccess(getPerformanceStartupRecoveryStatusSnapshot());
    })
  );
  ipcMain.handle("performance:list-overview", async (_event, query?: PerformanceOverviewQuery) =>
    withSession(async () =>
      createIpcSuccess(
        await listPerformanceOverview(
          query,
          getStoredAppSettingsSnapshot({
            userDataPath: getUserDataPath()
          })
        )
      )
    )
  );
  ipcMain.handle("performance:get-file-detail", async (_event, query: PerformanceFileDetailQuery) =>
    withSession(async () =>
      createIpcSuccess(
        await getPerformanceFileDetail(
          query,
          getStoredAppSettingsSnapshot({
            userDataPath: getUserDataPath()
          })
        )
      )
    )
  );
  ipcMain.handle(
    "performance:get-comparison",
    async (_event, query: PerformanceComparisonQuery) =>
      withSession(async () => createIpcSuccess(getPerformanceComparison(query)))
  );
  ipcMain.handle("performance:list-pending-files", async () =>
    withSession(async () => createIpcSuccess(await listPendingPerformanceFiles()))
  );
  ipcMain.handle("performance:get-pending-file-detail", async (_event, fileId: string) =>
    withSession(async () => createIpcSuccess(await getPendingPerformanceFileDetail(fileId)))
  );
  ipcMain.handle(
    "performance:approve",
    async (_event, input: PerformanceApprovalActionInput) =>
      withActionPermission("performance-approval", async (session) => {
        const result = await approvePerformanceFile(input, session, {
          userDataPath: getUserDataPath()
        });

        return recordSuccessfulActivity(
          result,
          trackSuccess({
            actionType: "performance-approve",
            routeKey: "performance",
            routeLabel: "실적 관리",
            details: "실적 승인",
            session
          }).input
        );
      })
  );
  ipcMain.handle(
    "performance:finalize-reapproved-file",
    async (_event, input: PerformanceReapprovalFinalizeInput) =>
      withActionPermission("performance-approval", async (session) => {
        const result = await finalizeReapprovedPerformanceFile(input, session, {
          userDataPath: getUserDataPath()
        });

        return recordSuccessfulActivity(
          result,
          trackSuccess({
            actionType: "performance-reapprove",
            routeKey: "performance",
            routeLabel: "실적 관리",
            details: "재승인 파일 확정 · 현재 파일 기준 반영",
            session
          }).input
        );
      })
  );
  ipcMain.handle(
    "performance:reject",
    async (_event, input: PerformanceRejectionInput) =>
      withActionPermission("performance-approval", async (session) => {
        const result = await rejectPerformanceFile(input, session);

        return recordSuccessfulActivity(
          result,
          trackSuccess({
            actionType: "performance-reject",
            routeKey: "performance",
            routeLabel: "실적 관리",
            details: "실적 반려",
            session
          }).input
        );
      })
  );
  ipcMain.handle(
    "performance:hide-approved-row",
    async (_event, input: PerformanceApprovedRowHideInput) =>
      withActionPermission("performance-approval", async (session) => {
        const result = await hideApprovedPerformanceOverviewRow(input, session);

        return recordSuccessfulActivity(
          result,
          trackSuccess({
            actionType: "performance-hide-approved",
            routeKey: "performance",
            routeLabel: "실적 관리",
            details: "승인완료 목록삭제",
            session
          }).input
        );
      })
  );
  ipcMain.handle("performance:list-approval-history", () =>
    withSession(() => getPerformanceApprovalHistory())
  );
  ipcMain.handle("performance:open-source-file", async (_event, fileId: string) =>
    withSession(async () => {
      const detail = await getPerformanceFileDetail({ fileId });

      if (!detail) {
        return createIpcFailure(
          "PERFORMANCE_FILE_NOT_FOUND",
          "원본 파일 정보를 찾을 수 없습니다."
        );
      }

      return runIpcOpenPathAction({
        filePath: detail.filePath,
        exists: existsSync,
        openPath: shell.openPath,
        missingErrorCode: "PERFORMANCE_FILE_MISSING",
        missingMessage: "원본 Excel 파일이 존재하지 않습니다.",
        openErrorCode: "PERFORMANCE_FILE_OPEN_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "performance-open-file",
          routeKey: "performance",
          routeLabel: "실적 관리",
          details: `${detail.fileName} 원본 파일 열기`
        })
      });
    })
  );
};
