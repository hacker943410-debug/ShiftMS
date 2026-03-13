/// <reference types="vite/client" />

import type {
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
      DashboardBridge &
      AuthBridge &
      WorkforceBridge &
      OperationsBridge &
      PerformanceBridge &
      AllowanceBridge;
  }
}

export {};
