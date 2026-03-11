/// <reference types="vite/client" />

import type { AppBridge } from "@shared/bridge/contracts";

declare global {
  interface Window {
    appBridge: AppBridge;
  }
}

export {};
