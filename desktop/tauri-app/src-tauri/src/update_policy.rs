use tauri::utils::config::BundleType;

/// Only primary packages with updater metadata for their own package type may
/// install in place. Secondary packages stay under their package manager.
pub(crate) fn bundle_supports_in_app_install(bundle_type: Option<&BundleType>) -> bool {
    matches!(
        bundle_type,
        Some(BundleType::App | BundleType::Nsis | BundleType::AppImage)
    )
}

pub(crate) fn current_bundle_supports_in_app_install() -> bool {
    bundle_supports_in_app_install(tauri::utils::platform::bundle_type().as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primary_packages_support_in_app_install() {
        for bundle_type in [BundleType::App, BundleType::Nsis, BundleType::AppImage] {
            assert!(bundle_supports_in_app_install(Some(&bundle_type)));
        }
    }

    #[test]
    fn secondary_packages_require_manual_install() {
        for bundle_type in [BundleType::Msi, BundleType::Deb, BundleType::Rpm] {
            assert!(!bundle_supports_in_app_install(Some(&bundle_type)));
        }
        assert!(!bundle_supports_in_app_install(None));
    }
}
