export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.ok200.android";

export const CHROMEOS_HELP_URL = "https://ok200.app/chromeos";

export const DESKTOP_DOWNLOAD_URL = "https://ok200.app/download";

export const PRODUCT_URL = "https://ok200.app/";

export const CHROMEOS_INTENT_URL =
  "intent://launch#Intent;scheme=ok200;package=app.ok200.android;" +
  `S.browser_fallback_url=${encodeURIComponent(CHROMEOS_HELP_URL)};end`;

export type PlatformRoute = "chromeos" | "desktop" | "unsupported";

export function isChromeOs(os: string): boolean {
  return os === "cros";
}

export function platformRoute(os: string): PlatformRoute {
  if (isChromeOs(os)) return "chromeos";
  if (os === "mac" || os === "win" || os === "linux") return "desktop";
  return "unsupported";
}

export function shouldUseNativeMessaging(os: string): boolean {
  return platformRoute(os) === "desktop";
}
