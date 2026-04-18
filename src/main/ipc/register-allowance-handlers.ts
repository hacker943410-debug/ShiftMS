import { ipcMain } from "electron";
import type { App } from "electron";

import { previewAllowanceCalculation } from "../services/allowance-preview-service";
import { exportAllowanceDocuments } from "../services/allowance-document-export-service";
import {
  listAllowanceApprovalHistory,
  reviewAllowanceCalculations
} from "../services/allowance-approval-service";
import {
  approveAllowanceProposal,
  listAllowanceProposalApprovalHistory,
  previewAllowanceProposalApproval
} from "../services/allowance-proposal-approval-service";
import { listStoredAllowanceDocumentExports } from "../services/allowance-document-export-history-service";
import {
  listApprovedAllowanceTargets,
  listAllowanceCalculationHistory,
  listApprovedAllowanceCalculationResults,
  runApprovedAllowanceCalculation,
  setAllowanceCalculationEarlyPayout
} from "../services/approved-allowance-calculation-service";
import {
  createIpcSuccess,
  runIpcResultAction
} from "./ipc-handler-helpers";
import type { AuthSession } from "../../shared/domain/model";
import type { ActionPermissionKey } from "../../shared/domain/authorization";
import type {
  AllowanceApprovedCalculationInput,
  AllowanceDocumentExportInput,
  AllowanceEarlyPayoutInput,
  AllowancePreviewInput,
  BridgeFailure
} from "../../shared/bridge/contracts";
import type {
  AllowanceProposalApprovalInput,
  AllowanceReviewActionInput
} from "../../shared/domain/allowance-workflow";
import type {
  IpcActivityInput,
  RecordSuccessfulIpcActivity
} from "./ipc-handler-helpers";

type WithSession = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;
type WithActionPermission = <T>(
  actionKey: ActionPermissionKey,
  callback: (session: AuthSession) => T
) => T | BridgeFailure;

type RegisterAllowanceHandlersOptions = {
  app: App;
  recordSuccessfulActivity: RecordSuccessfulIpcActivity;
  withActionPermission: WithActionPermission;
  withSession: WithSession;
};

export const registerAllowanceHandlers = ({
  app,
  recordSuccessfulActivity,
  withActionPermission,
  withSession
}: RegisterAllowanceHandlersOptions) => {
  const getUserDataPath = () => app.getPath("userData");
  const trackSuccess = (input: IpcActivityInput) => ({
    input,
    recordSuccessfulActivity
  });

  ipcMain.handle(
    "allowance:run-approved-calculation",
    async (_event, input: AllowanceApprovedCalculationInput) =>
      withSession(async () =>
        runIpcResultAction({
          action: () => runApprovedAllowanceCalculation(input),
          activity: trackSuccess({
            actionType: "allowance-calculate",
            routeKey: "allowance",
            routeLabel: "수당 관리",
            details: "승인 실적 기반 수당 계산"
          })
        })
      )
  );
  ipcMain.handle("allowance:list-results", () =>
    withSession(() => createIpcSuccess(listApprovedAllowanceCalculationResults()))
  );
  ipcMain.handle("allowance:list-history", () =>
    withSession(() => createIpcSuccess(listAllowanceCalculationHistory()))
  );
  ipcMain.handle("allowance:set-early-payout", (_event, input: AllowanceEarlyPayoutInput) =>
    withSession(async () =>
      runIpcResultAction({
        action: () => Promise.resolve(setAllowanceCalculationEarlyPayout(input)),
        activity: trackSuccess({
          actionType: "allowance-early-payout",
          routeKey: "allowance",
          routeLabel: "수당 관리",
          details: "선지급 지정"
        })
      })
    )
  );
  ipcMain.handle(
    "allowance:review-calculations",
    async (_event, input: AllowanceReviewActionInput) =>
      withActionPermission("allowance-approval", async (session) =>
        runIpcResultAction({
          action: () =>
            reviewAllowanceCalculations(input, session, {
              userDataPath: getUserDataPath(),
              env: process.env
            }),
          activity: trackSuccess({
            actionType: input.decision === "rejected" ? "allowance-reject" : "allowance-approve",
            routeKey: "allowance",
            routeLabel: "수당 관리",
            details:
              input.decision === "rejected"
                ? `${input.syncPerformanceSiteReject ? "근무지 반려" : "수당 반려"} ${
                    input.calculationIds.length
                  }건${input.syncPerformanceSiteReject ? " · 재승인 복귀" : ""}`
                : `수당 승인 ${input.calculationIds.length}건`,
            session
          })
        })
      )
  );
  ipcMain.handle("allowance:list-approval-history", () =>
    withSession(() => createIpcSuccess(listAllowanceApprovalHistory()))
  );
  ipcMain.handle("allowance:list-approved-targets", () =>
    withSession(() => createIpcSuccess(listApprovedAllowanceTargets()))
  );
  ipcMain.handle(
    "allowance:export-documents",
    async (_event, input: AllowanceDocumentExportInput) =>
      withSession(async () =>
        runIpcResultAction({
          action: () =>
            exportAllowanceDocuments(input, {
              userDataPath: getUserDataPath()
            }),
          activity: trackSuccess({
            actionType: "allowance-export",
            routeKey: "allowance",
            routeLabel: "수당 관리",
            details: `품의서/별첨 출력 · ${input.outputFormat === "pdf" ? "PDF" : "Excel"}`
          })
        })
      )
  );
  ipcMain.handle("allowance:list-document-exports", () =>
    withSession(() => createIpcSuccess(listStoredAllowanceDocumentExports()))
  );
  ipcMain.handle("allowance:preview-proposal", (_event, input: { calculationIds: string[] }) =>
    withSession(async () =>
      runIpcResultAction({
        action: () => Promise.resolve(previewAllowanceProposalApproval(input)),
        activity: trackSuccess({
          actionType: "allowance-proposal-preview",
          routeKey: "allowance",
          routeLabel: "수당 관리",
          details: `품의 미리보기 ${input.calculationIds.length}건`
        })
      })
    )
  );
  ipcMain.handle(
    "allowance:approve-proposal",
    async (_event, input: AllowanceProposalApprovalInput) =>
      withActionPermission("allowance-approval", async (session) =>
        runIpcResultAction({
          action: () =>
            approveAllowanceProposal(input, session, {
              userDataPath: getUserDataPath()
            }),
          activity: trackSuccess({
            actionType: "allowance-proposal-approve",
            routeKey: "allowance",
            routeLabel: "수당 관리",
            details: `품의 승인 ${input.calculationIds.length}건 · ${
              input.outputFormat === "xlsx" ? "Excel" : "PDF"
            }`,
            session
          })
        })
      )
  );
  ipcMain.handle("allowance:list-proposal-approvals", () =>
    withSession(() => createIpcSuccess(listAllowanceProposalApprovalHistory()))
  );
  ipcMain.handle("allowance:preview-calculation", (_event, input: AllowancePreviewInput) =>
    withSession(async () => runIpcResultAction({ action: () => Promise.resolve(previewAllowanceCalculation(input)) }))
  );
};
