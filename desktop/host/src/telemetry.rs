use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const CHECK_INTERVAL_SECS: u64 = 24 * 60 * 60;
const LAST_CHECK_FILENAME: &str = "last-host-check";

/// Tauri-compatible target string ("darwin", "linux", "windows").
fn tauri_target() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    }
}

/// Tauri-compatible arch string — `std::env::consts::ARCH` already matches.
fn tauri_arch() -> &'static str {
    std::env::consts::ARCH
}

fn last_check_path() -> Option<PathBuf> {
    Some(
        ok200_common::get_config_dir()?
            .join("ok200-native")
            .join(LAST_CHECK_FILENAME),
    )
}

fn read_last_check(path: &PathBuf) -> Option<u64> {
    std::fs::read_to_string(path).ok()?.trim().parse().ok()
}

fn write_last_check(path: &PathBuf) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, now.to_string());
}

/// Returns the timestamp file path if a check is due, None otherwise.
fn should_check() -> Option<PathBuf> {
    let path = last_check_path()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if let Some(last) = read_last_check(&path) {
        if now.saturating_sub(last) < CHECK_INTERVAL_SECS {
            return None;
        }
    }
    Some(path)
}

/// If 24+ hours since last check, ping the update server in a background thread.
/// Fire-and-forget: never blocks, never fails the host.
pub fn maybe_check_for_update() {
    let Some(path) = should_check() else {
        return;
    };

    // Write timestamp eagerly to prevent duplicate checks on rapid restarts.
    write_last_check(&path);

    let cfu_id = ok200_common::get_or_create_cfu_id().unwrap_or_default();
    let url = format!(
        "https://updates.ok200.app/tauri/{}/{}/{}",
        tauri_target(),
        tauri_arch(),
        env!("CARGO_PKG_VERSION"),
    );

    std::thread::spawn(move || {
        if let Err(e) = ureq::get(&url)
            .set("X-CFU-Id", &cfu_id)
            .set("X-Check-Reason", "host-interval")
            .call()
        {
            eprintln!("ok200-host: telemetry check failed: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_should_check_no_file() {
        let tmp = tempfile::tempdir().unwrap();
        unsafe { std::env::set_var("OK200_CONFIG_DIR", tmp.path()) };
        let result = should_check();
        assert!(result.is_some());
        unsafe { std::env::remove_var("OK200_CONFIG_DIR") };
    }

    #[test]
    #[serial]
    fn test_should_check_recent() {
        let tmp = tempfile::tempdir().unwrap();
        unsafe { std::env::set_var("OK200_CONFIG_DIR", tmp.path()) };
        let path = last_check_path().unwrap();
        write_last_check(&path);
        let result = should_check();
        assert!(result.is_none());
        unsafe { std::env::remove_var("OK200_CONFIG_DIR") };
    }

    #[test]
    #[serial]
    fn test_should_check_stale() {
        let tmp = tempfile::tempdir().unwrap();
        unsafe { std::env::set_var("OK200_CONFIG_DIR", tmp.path()) };
        let path = last_check_path().unwrap();
        let stale = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            - (25 * 3600);
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).unwrap();
        }
        std::fs::write(&path, stale.to_string()).unwrap();
        let result = should_check();
        assert!(result.is_some());
        unsafe { std::env::remove_var("OK200_CONFIG_DIR") };
    }

    #[test]
    fn test_tauri_target_mapping() {
        let target = tauri_target();
        assert!(!target.is_empty());
        #[cfg(target_os = "macos")]
        assert_eq!(target, "darwin");
        #[cfg(target_os = "linux")]
        assert_eq!(target, "linux");
        #[cfg(target_os = "windows")]
        assert_eq!(target, "windows");
    }

    #[test]
    fn test_tauri_arch() {
        let arch = tauri_arch();
        assert!(
            arch == "x86_64" || arch == "aarch64",
            "unexpected arch: {arch}"
        );
    }
}
