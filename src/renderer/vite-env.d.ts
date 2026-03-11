/// <reference types="vite/client" />

interface AppBridge {
  getAppVersion: () => Promise<string>;
}

interface Window {
  appBridge: AppBridge;
}
