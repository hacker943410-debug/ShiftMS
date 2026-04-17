import { ipcMain } from "electron";
import type { App } from "electron";

import {
  listStoredEmployees,
  saveStoredEmployee
} from "../services/employee-storage-service";
import {
  closeStoredEmployeeAssignment,
  closeStoredEmployeeWageRate,
  listStoredEmployeeAssignments,
  listStoredEmployeeWageRates,
  saveStoredEmployeeAssignment,
  saveStoredEmployeeWageRate
} from "../services/employee-history-service";
import {
  applyWorkforceWageBulkUpdate,
  previewWorkforceWageBulkUpdate
} from "../services/workforce-wage-bulk-update-service";
import { deleteStoredSite, listStoredSites, saveStoredSite } from "../services/site-storage-service";
import {
  deactivateStoredShiftPattern,
  listStoredShiftPatterns,
  saveStoredShiftPattern
} from "../services/shift-pattern-storage-service";
import { analyzeSitePatternImport } from "../services/site-pattern-extraction-service";
import {
  listStoredMonthlySchedules,
  saveStoredMonthlySchedule
} from "../services/monthly-schedule-storage-service";
import { exportMonthlySchedulePlan } from "../services/schedule-plan-export-service";
import { listStoredSchedulePlanExports } from "../services/schedule-plan-export-history-service";
import { publishSchedulePlanExport } from "../services/schedule-plan-publish-service";
import { previewMonthlySchedulePlan } from "../services/schedule-plan-preview-service";
import {
  createIpcSuccess,
  runIpcAction
} from "./ipc-handler-helpers";
import type { AuthSession } from "../../shared/domain/model";
import type {
  BridgeFailure,
  EmployeeListQuery,
  EmployeeUpsertInput,
  MonthlyScheduleUpsertInput,
  ShiftPatternUpsertInput,
  SiteUpsertInput
} from "../../shared/bridge/contracts";
import type {
  IpcActivityInput,
  RecordSuccessfulIpcActivity
} from "./ipc-handler-helpers";

type WithSession = <T>(callback: (session: AuthSession) => T) => T | BridgeFailure;

type RegisterWorkforceHandlersOptions = {
  app: App;
  getErrorMessage: (error: unknown) => string;
  recordSuccessfulActivity: RecordSuccessfulIpcActivity;
  withSession: WithSession;
};

export const registerWorkforceHandlers = ({
  app,
  getErrorMessage,
  recordSuccessfulActivity,
  withSession
}: RegisterWorkforceHandlersOptions) => {
  const getUserDataPath = () => app.getPath("userData");
  const trackSuccess = (input: IpcActivityInput) => ({
    input,
    recordSuccessfulActivity
  });

  ipcMain.handle("employees:list", (_event, query?: EmployeeListQuery) =>
    withSession(() => createIpcSuccess(listStoredEmployees(query)))
  );
  ipcMain.handle("employees:list-wage-rates", (_event, employeeId: string) =>
    withSession(() => createIpcSuccess(listStoredEmployeeWageRates(employeeId)))
  );
  ipcMain.handle("employees:list-assignments", (_event, employeeId: string) =>
    withSession(() => createIpcSuccess(listStoredEmployeeAssignments(employeeId)))
  );
  ipcMain.handle("employees:save-wage-rate", (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => saveStoredEmployeeWageRate(input),
        errorCode: "EMPLOYEE_WAGE_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "employee-wage-save",
          routeKey: "workforce",
          routeLabel: "인력 관리",
          details: "직원 시급 기준 저장"
        })
      })
    )
  );
  ipcMain.handle("employees:close-wage-rate", (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => closeStoredEmployeeWageRate(input),
        errorCode: "EMPLOYEE_WAGE_CLOSE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "employee-wage-close",
          routeKey: "workforce",
          routeLabel: "인력 관리",
          details: "직원 시급 이력 종료"
        })
      })
    )
  );
  ipcMain.handle("employees:save-assignment", (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => saveStoredEmployeeAssignment(input),
        errorCode: "EMPLOYEE_ASSIGNMENT_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "employee-assignment-save",
          routeKey: "workforce",
          routeLabel: "인력 관리",
          details: "직원 근무지 배정 저장"
        })
      })
    )
  );
  ipcMain.handle("employees:close-assignment", (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => closeStoredEmployeeAssignment(input),
        errorCode: "EMPLOYEE_ASSIGNMENT_CLOSE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "employee-assignment-close",
          routeKey: "workforce",
          routeLabel: "인력 관리",
          details: "직원 근무지 배정 종료"
        })
      })
    )
  );
  ipcMain.handle("employees:save", (_event, input: EmployeeUpsertInput) =>
    withSession(async () =>
      runIpcAction({
        action: () => saveStoredEmployee(input),
        errorCode: "EMPLOYEE_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "employee-save",
          routeKey: "workforce",
          routeLabel: "인력 관리",
          details: "인력 기본 정보 저장"
        })
      })
    )
  );
  ipcMain.handle("employees:preview-wage-bulk-update", async (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => previewWorkforceWageBulkUpdate(input),
        errorCode: "WORKFORCE_WAGE_BULK_PREVIEW_FAILED",
        getErrorMessage
      })
    )
  );
  ipcMain.handle("employees:apply-wage-bulk-update", async (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => applyWorkforceWageBulkUpdate(input),
        errorCode: "WORKFORCE_WAGE_BULK_APPLY_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "employee-wage-bulk-apply",
          routeKey: "workforce",
          routeLabel: "인력 관리",
          details: "시급 일괄 업데이트 적용"
        })
      })
    )
  );
  ipcMain.handle("sites:save", (_event, input: SiteUpsertInput) =>
    withSession(async () =>
      runIpcAction({
        action: () => saveStoredSite(input),
        errorCode: "SITE_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "site-save",
          routeKey: "sites",
          routeLabel: "근무지 관리",
          details: "근무지 정보 저장"
        })
      })
    )
  );
  ipcMain.handle("sites:list", () =>
    withSession(() => createIpcSuccess(listStoredSites()))
  );
  ipcMain.handle("sites:delete", (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => deleteStoredSite(input.siteId),
        errorCode: "SITE_DELETE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "site-delete",
          routeKey: "sites",
          routeLabel: "근무지 관리",
          details: "근무지 삭제"
        })
      })
    )
  );
  ipcMain.handle("shift-patterns:list", (_event, siteId?: string) =>
    withSession(() => createIpcSuccess(listStoredShiftPatterns(siteId)))
  );
  ipcMain.handle("shift-patterns:analyze-import", async (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => analyzeSitePatternImport(input),
        errorCode: "SITE_PATTERN_IMPORT_ANALYZE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "shift-pattern-import",
          routeKey: "schedule",
          routeLabel: "근무표 배포",
          details: "근무패턴 분석"
        })
      })
    )
  );
  ipcMain.handle("shift-patterns:save", (_event, input: ShiftPatternUpsertInput) =>
    withSession(async () =>
      runIpcAction({
        action: () => saveStoredShiftPattern(input),
        errorCode: "SHIFT_PATTERN_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "shift-pattern-save",
          routeKey: "schedule",
          routeLabel: "근무표 배포",
          details: "근무패턴 저장"
        })
      })
    )
  );
  ipcMain.handle("shift-patterns:deactivate", (_event, input) =>
    withSession(async () =>
      runIpcAction({
        action: () => deactivateStoredShiftPattern(input.patternId),
        errorCode: "SHIFT_PATTERN_DEACTIVATE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "shift-pattern-deactivate",
          routeKey: "schedule",
          routeLabel: "근무표 배포",
          details: "근무패턴 비활성화"
        })
      })
    )
  );
  ipcMain.handle("monthly-schedules:list", (_event, siteId?: string) =>
    withSession(() => createIpcSuccess(listStoredMonthlySchedules(siteId)))
  );
  ipcMain.handle("monthly-schedules:save", (_event, input: MonthlyScheduleUpsertInput) =>
    withSession(async () =>
      runIpcAction({
        action: () => saveStoredMonthlySchedule(input),
        errorCode: "MONTHLY_SCHEDULE_SAVE_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "schedule-save",
          routeKey: "schedule",
          routeLabel: "근무표 배포",
          details: "근무표 저장"
        })
      })
    )
  );
  ipcMain.handle("monthly-schedules:preview-plan", async (_event, scheduleId: string) =>
    withSession(async () =>
      runIpcAction({
        action: () => previewMonthlySchedulePlan(scheduleId),
        errorCode: "MONTHLY_SCHEDULE_PREVIEW_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "schedule-preview",
          routeKey: "schedule",
          routeLabel: "근무표 배포",
          details: "근무표 미리보기"
        })
      })
    )
  );
  ipcMain.handle("monthly-schedules:export-plan", async (_event, scheduleId: string) =>
    withSession(async () =>
      runIpcAction({
        action: () =>
          exportMonthlySchedulePlan({
            scheduleId,
            userDataPath: getUserDataPath()
          }),
        errorCode: "MONTHLY_SCHEDULE_EXPORT_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "schedule-export",
          routeKey: "schedule",
          routeLabel: "근무표 배포",
          details: "근무표 생성"
        })
      })
    )
  );
  ipcMain.handle("monthly-schedules:list-exports", (_event, scheduleId?: string) =>
    withSession(() => createIpcSuccess(listStoredSchedulePlanExports(scheduleId)))
  );
  ipcMain.handle("monthly-schedules:publish-export", (_event, exportId: string) =>
    withSession(async () =>
      runIpcAction({
        action: () =>
          publishSchedulePlanExport({
            exportId,
            userDataPath: getUserDataPath()
          }),
        errorCode: "MONTHLY_SCHEDULE_PUBLISH_FAILED",
        getErrorMessage,
        activity: trackSuccess({
          actionType: "schedule-publish",
          routeKey: "schedule",
          routeLabel: "근무표 배포",
          details: "근무표 배포"
        })
      })
    )
  );
};
