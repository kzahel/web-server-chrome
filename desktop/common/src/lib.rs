use std::path::{Path, PathBuf};

pub fn get_config_dir() -> Option<PathBuf> {
    if let Ok(env_dir) = std::env::var("OK200_CONFIG_DIR") {
        return Some(PathBuf::from(env_dir));
    }
    dirs::config_dir()
}

const CFU_ID_FILENAME: &str = "cfu-id";
const APPIMAGE_PATH_FILENAME: &str = "appimage-path";

fn native_config_dir() -> Option<PathBuf> {
    Some(get_config_dir()?.join("ok200-native"))
}

/// Remember the stable path of the `AppImage` that registered the native host.
///
/// `AppImage` sidecars run from a temporary FUSE mount, so the copied browser
/// helper needs this path to launch the real application later.
pub fn record_appimage_path(path: &Path) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("resolve AppImage path {}: {e}", path.display()))?;
    if !canonical.is_file() {
        return Err(format!(
            "AppImage path is not a file: {}",
            canonical.display()
        ));
    }

    let dir = native_config_dir().ok_or("could not determine config directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    let path_file = dir.join(APPIMAGE_PATH_FILENAME);
    std::fs::write(&path_file, format!("{}\n", canonical.to_string_lossy()))
        .map_err(|e| format!("write {}: {e}", path_file.display()))?;
    Ok(canonical)
}

/// Return the last `AppImage` path recorded by the desktop application.
pub fn get_recorded_appimage_path() -> Option<PathBuf> {
    let contents =
        std::fs::read_to_string(native_config_dir()?.join(APPIMAGE_PATH_FILENAME)).ok()?;
    let path = PathBuf::from(contents.trim());
    if path.is_absolute() && path.is_file() {
        Some(path)
    } else {
        None
    }
}

/// Get or create a persistent check-for-update ID.
/// Stored as a plain UUID in `~/.config/ok200-native/cfu-id`.
/// This ID is sent with update check requests to help estimate unique active installs.
pub fn get_or_create_cfu_id() -> Option<String> {
    let dir = native_config_dir()?;
    let path = dir.join(CFU_ID_FILENAME);

    if let Ok(id) = std::fs::read_to_string(&path) {
        let id = id.trim().to_string();
        if !id.is_empty() {
            return Some(id);
        }
    }

    // Generate and persist a new UUID
    std::fs::create_dir_all(&dir).ok()?;
    let id = uuid::Uuid::new_v4().to_string();
    std::fs::write(&path, &id).ok()?;
    Some(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_get_config_dir_env_override() {
        let key = "OK200_CONFIG_DIR";
        let original = std::env::var(key).ok();

        std::env::set_var(key, "/tmp/test-ok200-config");
        let dir = get_config_dir().unwrap();
        assert_eq!(dir, PathBuf::from("/tmp/test-ok200-config"));

        match original {
            Some(val) => std::env::set_var(key, val),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    #[serial]
    fn test_get_or_create_cfu_id_persistence() {
        let tmp = tempfile::tempdir().unwrap();
        let key = "OK200_CONFIG_DIR";
        let original = std::env::var(key).ok();

        std::env::set_var(key, tmp.path());

        let id1 = get_or_create_cfu_id().expect("should create cfu-id");
        assert!(!id1.is_empty());
        assert_eq!(id1.len(), 36, "should be a UUID with hyphens");

        let id2 = get_or_create_cfu_id().expect("should read existing cfu-id");
        assert_eq!(id1, id2, "cfu-id must be stable across calls");

        match original {
            Some(val) => std::env::set_var(key, val),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    #[serial]
    fn test_recorded_appimage_path_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let key = "OK200_CONFIG_DIR";
        let original = std::env::var(key).ok();
        std::env::set_var(key, tmp.path().join("config"));

        let appimage = tmp.path().join("200-ok.AppImage");
        std::fs::write(&appimage, b"appimage").unwrap();

        let recorded = record_appimage_path(&appimage).unwrap();
        assert_eq!(recorded, appimage.canonicalize().unwrap());
        assert_eq!(get_recorded_appimage_path(), Some(recorded));

        match original {
            Some(val) => std::env::set_var(key, val),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    #[serial]
    fn test_recorded_appimage_path_ignores_removed_file() {
        let tmp = tempfile::tempdir().unwrap();
        let key = "OK200_CONFIG_DIR";
        let original = std::env::var(key).ok();
        std::env::set_var(key, tmp.path().join("config"));

        let appimage = tmp.path().join("200-ok.AppImage");
        std::fs::write(&appimage, b"appimage").unwrap();
        record_appimage_path(&appimage).unwrap();
        std::fs::remove_file(appimage).unwrap();

        assert_eq!(get_recorded_appimage_path(), None);

        match original {
            Some(val) => std::env::set_var(key, val),
            None => std::env::remove_var(key),
        }
    }
}
