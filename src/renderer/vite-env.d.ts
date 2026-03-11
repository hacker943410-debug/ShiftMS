/// <reference types="vite/client" />

import type {
  AllowanceBridge,
  AppBridge,
  AuthBridge,
  PerformanceBridge
} from "@shared/bridge/contracts";

declare global {
  interface Window {
    appBridge: AppBridge &
      AuthBridge & {
        listPendingFiles: PerformanceBridge["listPendingFiles"];
        getPendingFileDetail: PerformanceBridge["getPendingFileDetail"];
        approvePendingFile: PerformanceBridge["approvePendingFile"];
        rejectPendingFile: PerformanceBridge["rejectPendingFile"];
        listApprovalHistory: PerformanceBridge["listApprovalHistory"];
        previewAllowanceCalculation: AllowanceBridge["previewCalculation"];
      };
  }
}

export {};
