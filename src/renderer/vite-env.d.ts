/// <reference types="vite/client" />

import type { AllowanceBridge, AppBridge } from "@shared/bridge/contracts";

declare global {
  interface Window {
    appBridge: AppBridge & {
      previewAllowanceCalculation: AllowanceBridge["previewCalculation"];
    };
  }
}

export {};
