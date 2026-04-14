export const APP_DISPLAY_NAME = "교대근무관리시스템";
export const APP_DEFAULT_VERSION = "0.3.2";
export const APP_LOGO_ALT_TEXT = "회사 로고";

export const buildAppDisplayTitle = (version: string) => {
  const normalizedVersion = version.trim() || APP_DEFAULT_VERSION;
  return `${APP_DISPLAY_NAME} V${normalizedVersion}`;
};
