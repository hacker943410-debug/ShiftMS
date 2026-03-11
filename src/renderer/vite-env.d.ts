/// <reference types="vite/client" />

import type {
  AllowanceBridge,
  AppBridge,
  AuthBridge
} from "@shared/bridge/contracts";

declare global {
  interface Window {
    appBridge: AppBridge &
      AuthBridge & {
      previewAllowanceCalculation: AllowanceBridge["previewCalculation"];
    };
  }
}

export {};
