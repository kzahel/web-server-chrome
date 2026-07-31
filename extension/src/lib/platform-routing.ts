export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.ok200.android";

export const CHROMEOS_INTENT_URL =
  "intent://launch#Intent;scheme=ok200;package=app.ok200.android;" +
  `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;

export function isChromeOs(os: string): boolean {
  return os === "cros";
}

export function shouldUseNativeMessaging(os: string): boolean {
  return !isChromeOs(os);
}
