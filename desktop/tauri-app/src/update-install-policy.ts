import { BundleType } from "@tauri-apps/api/app";

export const DOWNLOAD_PAGE_URL = "https://ok200.app/download";

export interface UpdateInstallPolicy {
  canInstallInApp: boolean;
  packageLabel: string;
}

/** In-app updates must preserve the installer/package ownership boundary. */
export function updateInstallPolicy(
  bundleType: BundleType | null | undefined,
): UpdateInstallPolicy {
  switch (bundleType) {
    case BundleType.App:
      return { canInstallInApp: true, packageLabel: "macOS app" };
    case BundleType.Nsis:
      return { canInstallInApp: true, packageLabel: "Windows installer" };
    case BundleType.AppImage:
      return { canInstallInApp: true, packageLabel: "AppImage" };
    case BundleType.Msi:
      return { canInstallInApp: false, packageLabel: "Windows MSI" };
    case BundleType.Deb:
      return { canInstallInApp: false, packageLabel: "DEB package" };
    case BundleType.Rpm:
      return { canInstallInApp: false, packageLabel: "RPM package" };
    default:
      return { canInstallInApp: false, packageLabel: "this installation" };
  }
}
