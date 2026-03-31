/// <reference types="vite/client" />

import type {
  AccessLogBridge,
  AllowanceBridge,
  AppBridge,
  AuthBridge,
  DashboardBridge,
  OperationsBridge,
  PerformanceBridge,
  WorkforceBridge
} from "@shared/bridge/contracts";

declare global {
  interface Window {
    appBridge: AppBridge &
      AccessLogBridge &
      DashboardBridge &
      AuthBridge &
      WorkforceBridge &
      OperationsBridge &
      PerformanceBridge &
      AllowanceBridge;
  }
}

export {};
