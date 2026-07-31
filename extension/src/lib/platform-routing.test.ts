import { describe, expect, it } from "vitest";
import {
  CHROMEOS_INTENT_URL,
  isChromeOs,
  PLAY_STORE_URL,
  shouldUseNativeMessaging,
} from "./platform-routing";

describe("extension platform routing", () => {
  it("skips native messaging on ChromeOS", () => {
    expect(isChromeOs("cros")).toBe(true);
    expect(shouldUseNativeMessaging("cros")).toBe(false);
  });

  it.each(["mac", "win", "linux"])("retains native messaging on %s", (os) => {
    expect(shouldUseNativeMessaging(os)).toBe(true);
  });

  it("targets the Android deep link with the exact Play package fallback", () => {
    expect(CHROMEOS_INTENT_URL).toContain("intent://launch#Intent");
    expect(CHROMEOS_INTENT_URL).toContain("scheme=ok200");
    expect(CHROMEOS_INTENT_URL).toContain("package=app.ok200.android");
    expect(CHROMEOS_INTENT_URL).toContain(
      `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)}`,
    );
    expect(PLAY_STORE_URL).toBe(
      "https://play.google.com/store/apps/details?id=app.ok200.android",
    );
  });
});
