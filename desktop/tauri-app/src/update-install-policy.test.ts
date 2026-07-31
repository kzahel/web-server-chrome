import { BundleType } from "@tauri-apps/api/app";
import { describe, expect, it } from "vitest";
import { updateInstallPolicy } from "./update-install-policy";

describe("desktop update install policy", () => {
  it.each([
    BundleType.App,
    BundleType.Nsis,
    BundleType.AppImage,
  ])("permits signed in-app updates for %s", (bundleType) => {
    expect(updateInstallPolicy(bundleType).canInstallInApp).toBe(true);
  });

  it.each([
    BundleType.Msi,
    BundleType.Deb,
    BundleType.Rpm,
  ])("keeps %s updates with their package owner", (bundleType) => {
    expect(updateInstallPolicy(bundleType).canInstallInApp).toBe(false);
  });

  it("fails closed when the bundle type is unavailable", () => {
    expect(updateInstallPolicy(null)).toEqual({
      canInstallInApp: false,
      packageLabel: "this installation",
    });
  });
});
