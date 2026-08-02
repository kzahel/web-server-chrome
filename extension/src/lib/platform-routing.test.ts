import { describe, expect, it } from "vitest";
import {
  CHROMEOS_HELP_URL,
  CHROMEOS_INTENT_URL,
  DESKTOP_DOWNLOAD_URL,
  isChromeOs,
  PLAY_STORE_URL,
  platformRoute,
  shouldUseNativeMessaging,
} from "./platform-routing";

describe("extension platform routing", () => {
  it("skips native messaging on ChromeOS", () => {
    expect(isChromeOs("cros")).toBe(true);
    expect(shouldUseNativeMessaging("cros")).toBe(false);
  });

  it.each(["mac", "win", "linux"])("retains native messaging on %s", (os) => {
    expect(shouldUseNativeMessaging(os)).toBe(true);
    expect(platformRoute(os)).toBe("desktop");
  });

  it.each([
    "android",
    "openbsd",
    "unknown",
  ])("does not attempt native messaging on unsupported platform %s", (os) => {
    expect(platformRoute(os)).toBe("unsupported");
    expect(shouldUseNativeMessaging(os)).toBe(false);
  });

  it("targets Android with defensive help metadata and explicit URLs", () => {
    expect(CHROMEOS_INTENT_URL).toContain("intent://launch#Intent");
    expect(CHROMEOS_INTENT_URL).toContain("scheme=ok200");
    expect(CHROMEOS_INTENT_URL).toContain("package=app.ok200.android");
    expect(CHROMEOS_INTENT_URL).toContain(
      `S.browser_fallback_url=${encodeURIComponent(CHROMEOS_HELP_URL)}`,
    );
    expect(CHROMEOS_HELP_URL).toBe("https://ok200.app/chromeos");
    expect(PLAY_STORE_URL).toBe(
      "https://play.google.com/store/apps/details?id=app.ok200.android",
    );
    expect(DESKTOP_DOWNLOAD_URL).toBe("https://ok200.app/download");
  });
});
