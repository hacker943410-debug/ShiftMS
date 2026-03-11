/// <reference types="vite/client" />

import type {
  AllowanceBridge,
  AppBridge,
  AuthBridge,
  PerformanceBridge,
  WorkforceBridge
} from "@shared/bridge/contracts";

declare global {
  interface Window {
    appBridge: AppBridge &
      AuthBridge &
      WorkforceBridge & {
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
