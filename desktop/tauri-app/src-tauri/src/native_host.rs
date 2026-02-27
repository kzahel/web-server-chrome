use std::path::Path;

const MANIFEST_NAME: &str = "app.ok200.native";
const MANIFEST_FILENAME: &str = "app.ok200.native.json";

/// Register native messaging host manifest for all detected Chromium browsers.
/// Returns the number of browsers successfully registered.
pub fn register_native_messaging_hosts(app: &tauri::AppHandle) -> Result<usize, String> {
    let host_path = super::resolve_sidecar(app, "binaries/ok200-host")?;

    // AppImage: the FUSE mount path is temporary, so copy the sidecar to a stable
    // location that persists after the AppImage exits.
    #[cfg(target_os = "linux")]
    let host_path = if std::env::var_os("APPDIR").is_some() {
        match copy_sidecar_for_appimage(&host_path) {
            Ok(stable_path) => {
                eprintln!(
                    "native-host: copied sidecar to stable path: {}",
                    stable_path.display()
                );
                stable_path
            }
            Err(e) => {
                eprintln!("native-host: failed to copy sidecar for AppImage: {e}");
                host_path
            }
        }
    } else {
        host_path
    };

    let manifest = serde_json::json!({
        "name": MANIFEST_NAME,
        "description": "200 OK Web Server Native Messaging Host",
        "path": host_path.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": [
            "chrome-extension://lpkjdhnmgkhaabhimpdinmdgejoaejic/",
            "chrome-extension://PLACEHOLDER_DEV_ID/"
        ]
    });
    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;

    let mut count = 0;

    #[cfg(target_os = "macos")]
    {
        count += register_macos_browsers(&manifest_bytes);
    }

    #[cfg(target_os = "linux")]
    {
        count += register_linux_browsers(&manifest_bytes);
    }

    #[cfg(target_os = "windows")]
    {
        count += register_windows_browsers(app, &manifest_bytes)?;
    }

    Ok(count)
}

/// Write manifest to a browser's `NativeMessagingHosts` directory.
/// Only writes if the browser's parent config directory already exists
/// (i.e., the browser is installed).
fn write_manifest_for_browser(browser_config_dir: &Path, manifest_bytes: &[u8]) -> bool {
    if !browser_config_dir.exists() {
        return false;
    }
    let hosts_dir = browser_config_dir.join("NativeMessagingHosts");
    if std::fs::create_dir_all(&hosts_dir).is_err() {
        eprintln!("native-host: failed to create {}", hosts_dir.display());
        return false;
    }
    let manifest_path = hosts_dir.join(MANIFEST_FILENAME);
    match std::fs::write(&manifest_path, manifest_bytes) {
        Ok(()) => {
            eprintln!("native-host: registered {}", manifest_path.display());
            true
        }
        Err(e) => {
            eprintln!(
                "native-host: failed to write {}: {e}",
                manifest_path.display()
            );
            false
        }
    }
}

#[cfg(target_os = "macos")]
fn register_macos_browsers(manifest_bytes: &[u8]) -> usize {
    let Some(home) = dirs::home_dir() else {
        eprintln!("native-host: could not determine home directory");
        return 0;
    };
    let app_support = home.join("Library/Application Support");
    let browsers = [
        "Google/Chrome",
        "Google/Chrome Canary",
        "Chromium",
        "BraveSoftware/Brave-Browser",
        "Microsoft Edge",
        "Vivaldi",
        "Arc/User Data",
    ];
    browsers
        .iter()
        .filter(|b| write_manifest_for_browser(&app_support.join(b), manifest_bytes))
        .count()
}

#[cfg(target_os = "linux")]
fn register_linux_browsers(manifest_bytes: &[u8]) -> usize {
    let Some(home) = dirs::home_dir() else {
        eprintln!("native-host: could not determine home directory");
        return 0;
    };
    let browsers = [
        ".config/google-chrome",
        ".config/chromium",
        ".config/BraveSoftware/Brave-Browser",
        ".config/microsoft-edge",
    ];
    browsers
        .iter()
        .filter(|b| write_manifest_for_browser(&home.join(b), manifest_bytes))
        .count()
}

#[cfg(target_os = "windows")]
fn register_windows_browsers(
    app: &tauri::AppHandle,
    manifest_bytes: &[u8],
) -> Result<usize, String> {
    use tauri::Manager;
    use winreg::enums::*;
    use winreg::RegKey;

    let app_data =
        super::strip_win_prefix(app.path().app_local_data_dir().map_err(|e| e.to_string())?);
    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
    let manifest_path = app_data.join(MANIFEST_FILENAME);
    std::fs::write(&manifest_path, manifest_bytes).map_err(|e| e.to_string())?;
    let manifest_path_str = manifest_path.to_string_lossy().to_string();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let registry_keys = [
        format!("Software\\Google\\Chrome\\NativeMessagingHosts\\{MANIFEST_NAME}"),
        format!("Software\\Chromium\\NativeMessagingHosts\\{MANIFEST_NAME}"),
        format!("Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\{MANIFEST_NAME}"),
        format!("Software\\Microsoft\\Edge\\NativeMessagingHosts\\{MANIFEST_NAME}"),
    ];

    let mut count = 0;
    for subkey in &registry_keys {
        match hkcu.create_subkey(subkey) {
            Ok((key, _)) => match key.set_value("", &manifest_path_str) {
                Ok(()) => {
                    eprintln!("native-host: registered HKCU\\{subkey}");
                    count += 1;
                }
                Err(e) => eprintln!("native-host: failed to set HKCU\\{subkey}: {e}"),
            },
            Err(e) => eprintln!("native-host: failed to create HKCU\\{subkey}: {e}"),
        }
    }

    Ok(count)
}

/// Copy the sidecar binary from the AppImage FUSE mount to `~/.local/lib/ok200/`.
#[cfg(target_os = "linux")]
fn copy_sidecar_for_appimage(fuse_path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("could not determine home directory")?;
    let lib_dir = home.join(".local/lib/ok200");
    std::fs::create_dir_all(&lib_dir).map_err(|e| format!("mkdir {}: {e}", lib_dir.display()))?;

    let dest = lib_dir.join("ok200-host");
    std::fs::copy(fuse_path, &dest)
        .map_err(|e| format!("copy {} -> {}: {e}", fuse_path.display(), dest.display()))?;

    // Ensure executable
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o755);
    std::fs::set_permissions(&dest, perms).map_err(|e| format!("chmod {}: {e}", dest.display()))?;

    Ok(dest)
}
