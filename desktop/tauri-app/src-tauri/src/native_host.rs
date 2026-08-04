#[cfg(any(target_os = "macos", target_os = "linux"))]
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
        if let Err(e) = register_appimage_installation() {
            eprintln!("native-host: failed to register AppImage installation: {e}");
        }
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
            "chrome-extension://lpkjdhnmgkhaabhimpdinmdgejoaejic/"
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
#[cfg(any(target_os = "macos", target_os = "linux"))]
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
    use winreg::enums::HKEY_CURRENT_USER;
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

/// Copy the sidecar binary from the `AppImage` FUSE mount to `~/.local/lib/ok200/`.
#[cfg(target_os = "linux")]
fn copy_sidecar_for_appimage(fuse_path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("could not determine home directory")?;
    let lib_dir = home.join(".local/lib/ok200");
    copy_sidecar_to_lib_dir(fuse_path, &lib_dir)
}

#[cfg(target_os = "linux")]
fn copy_sidecar_to_lib_dir(
    fuse_path: &std::path::Path,
    lib_dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    std::fs::create_dir_all(lib_dir).map_err(|e| format!("mkdir {}: {e}", lib_dir.display()))?;

    let dest = lib_dir.join("ok200-host");
    let staged = lib_dir.join(format!("ok200-host.{}.tmp", std::process::id()));
    std::fs::copy(fuse_path, &staged)
        .map_err(|e| format!("copy {} -> {}: {e}", fuse_path.display(), staged.display()))?;

    // Ensure executable
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o755);
    if let Err(e) = std::fs::set_permissions(&staged, perms) {
        let _ = std::fs::remove_file(&staged);
        return Err(format!("chmod {}: {e}", staged.display()));
    }
    if let Err(e) = std::fs::rename(&staged, &dest) {
        let _ = std::fs::remove_file(&staged);
        return Err(format!(
            "replace {} with {}: {e}",
            dest.display(),
            staged.display()
        ));
    }

    Ok(dest)
}

/// Remember the `AppImage` and install a user-level desktop identity.
///
/// `ok200-host` is copied out of the temporary FUSE mount. The recorded path
/// gives that stable helper a direct launch target, while `200-ok.desktop`
/// makes the `AppImage` visible in application menus and preserves the helper's
/// existing `gtk-launch 200-ok` fallback.
#[cfg(target_os = "linux")]
fn register_appimage_installation() -> Result<(), String> {
    let appimage = std::env::var_os("APPIMAGE").ok_or("APPIMAGE is not set")?;
    let appimage = ok200_common::record_appimage_path(std::path::Path::new(&appimage))?;
    let data_dir = dirs::data_dir().ok_or("could not determine user data directory")?;

    let icon_name = "ok200-desktop";
    if let Some(appdir) = std::env::var_os("APPDIR") {
        let icon_source = std::path::PathBuf::from(appdir).join("200 OK.png");
        let icon_dir = data_dir.join("icons/hicolor/128x128/apps");
        if icon_source.is_file() {
            std::fs::create_dir_all(&icon_dir)
                .map_err(|e| format!("mkdir {}: {e}", icon_dir.display()))?;
            let icon_dest = icon_dir.join(format!("{icon_name}.png"));
            std::fs::copy(&icon_source, &icon_dest).map_err(|e| {
                format!(
                    "copy {} -> {}: {e}",
                    icon_source.display(),
                    icon_dest.display()
                )
            })?;
        }
    }

    let applications_dir = data_dir.join("applications");
    std::fs::create_dir_all(&applications_dir)
        .map_err(|e| format!("mkdir {}: {e}", applications_dir.display()))?;
    let desktop_path = applications_dir.join("200-ok.desktop");
    let desktop_entry = appimage_desktop_entry(&appimage, icon_name);
    std::fs::write(&desktop_path, desktop_entry)
        .map_err(|e| format!("write {}: {e}", desktop_path.display()))?;
    eprintln!(
        "native-host: registered AppImage desktop entry: {}",
        desktop_path.display()
    );

    Ok(())
}

#[cfg(target_os = "linux")]
fn appimage_desktop_entry(appimage: &std::path::Path, icon_name: &str) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=200 OK Web Server\n\
         GenericName=Web Server\n\
         Comment=200 OK Web Server Desktop App\n\
         Exec={} %U\n\
         Icon={icon_name}\n\
         Terminal=false\n\
         Categories=Development;Network;\n\
         Keywords=web;server;HTTP;local;development;\n\
         StartupWMClass=ok200-desktop\n",
        desktop_exec_arg(appimage)
    )
}

#[cfg(target_os = "linux")]
fn desktop_exec_arg(path: &std::path::Path) -> String {
    let escaped = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$");
    format!("\"{escaped}\"")
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::{appimage_desktop_entry, copy_sidecar_to_lib_dir, desktop_exec_arg};
    use std::path::Path;

    #[test]
    fn desktop_exec_arg_quotes_reserved_characters() {
        assert_eq!(
            desktop_exec_arg(Path::new("/tmp/200 OK $preview.AppImage")),
            "\"/tmp/200 OK \\$preview.AppImage\""
        );
    }

    #[test]
    fn appimage_desktop_entry_uses_searchable_product_name() {
        let entry = appimage_desktop_entry(Path::new("/tmp/200 OK.AppImage"), "ok200-desktop");
        assert!(entry.contains("\nName=200 OK Web Server\n"));
        assert!(entry.contains("\nGenericName=Web Server\n"));
        assert!(entry.contains("\nKeywords=web;server;HTTP;local;development;\n"));
        assert!(!entry.contains("\nName=200 OK\n"));
    }

    #[test]
    fn sidecar_refresh_atomically_replaces_existing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source-host");
        let lib_dir = tmp.path().join("lib");
        std::fs::create_dir_all(&lib_dir).unwrap();
        std::fs::write(&source, b"new host").unwrap();
        std::fs::write(lib_dir.join("ok200-host"), b"old host").unwrap();

        let installed = copy_sidecar_to_lib_dir(&source, &lib_dir).unwrap();
        assert_eq!(installed, lib_dir.join("ok200-host"));
        assert_eq!(std::fs::read(installed).unwrap(), b"new host");
        assert_eq!(
            std::fs::read_dir(&lib_dir).unwrap().count(),
            1,
            "staged sidecar should be renamed or cleaned up"
        );
    }
}
