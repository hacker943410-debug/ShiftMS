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
      WorkforceBridge &
      OperationsBridge &
      PerformanceBridge &
      AllowanceBridge;
  }
}

export {};
