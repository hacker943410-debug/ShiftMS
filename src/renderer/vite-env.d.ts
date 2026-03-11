/// <reference types="vite/client" />

import type {
  AllowanceBridge,
  AppBridge,
  AuthBridge,
  OperationsBridge,
  PerformanceBridge,
  WorkforceBridge
} from "@shared/bridge/contracts";

declare global {
  interface Window {
    appBridge: AppBridge &
      AuthBridge &
      WorkforceBridge & {
        listShiftPatterns: OperationsBridge["listShiftPatterns"];
        saveShiftPattern: OperationsBridge["saveShiftPattern"];
        listMonthlySchedules: OperationsBridge["listMonthlySchedules"];
        saveMonthlySchedule: OperationsBridge["saveMonthlySchedule"];
        saveEmployee: WorkforceBridge["saveEmployee"];
        listPendingFiles: PerformanceBridge["listPendingFiles"];
        getPendingFileDetail: PerformanceBridge["getPendingFileDetail"];
        approvePendingFile: PerformanceBridge["approvePendingFile"];
        rejectPendingFile: PerformanceBridge["rejectPendingFile"];
        listApprovalHistory: PerformanceBridge["listApprovalHistory"];
        runApprovedCalculation: AllowanceBridge["runApprovedCalculation"];
        listCalculationResults: AllowanceBridge["listCalculationResults"];
        previewAllowanceCalculation: AllowanceBridge["previewCalculation"];
      };
  }
}

export {};
