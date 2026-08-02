#[cfg(target_os = "linux")]
mod platform {
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};

    use uuid::Uuid;

    use crate::CONTROLLER_SERVICE;

    const DESKTOP_TEMPLATE: &str = include_str!("../resources/app.ok200.crostini.desktop.in");
    const SERVICE_TEMPLATE: &str =
        include_str!("../resources/app.ok200.crostini-controller.service.in");
    const ICON: &[u8] = include_bytes!("../../../extension/public/icons/ok-128.png");
    const INSTALL_ROOT_NAME: &str = "ok200-crostini";
    const DESKTOP_FILE_NAME: &str = "app.ok200.crostini.desktop";
    const ICON_FILE_NAME: &str = "app.ok200.crostini.png";

    #[derive(Clone, Debug)]
    struct InstallPaths {
        install_root: PathBuf,
        version_dir: PathBuf,
        version_binary: PathBuf,
        current_link: PathBuf,
        bin_link: PathBuf,
        desktop_file: PathBuf,
        service_file: PathBuf,
        icon_file: PathBuf,
        config_dir: PathBuf,
    }

    impl InstallPaths {
        fn system() -> Result<Self, String> {
            let home = dirs::home_dir()
                .ok_or_else(|| "could not determine the user home directory".to_owned())?;
            let data = dirs::data_dir().unwrap_or_else(|| home.join(".local/share"));
            let config = dirs::config_dir().unwrap_or_else(|| home.join(".config"));
            let install_root = home.join(".local/lib").join(INSTALL_ROOT_NAME);
            let version_dir = install_root
                .join("versions")
                .join(env!("CARGO_PKG_VERSION"));
            Ok(Self {
                version_binary: version_dir.join("ok200-crostini"),
                version_dir,
                current_link: install_root.join("current"),
                install_root,
                bin_link: home.join(".local/bin/ok200-crostini"),
                desktop_file: data.join("applications").join(DESKTOP_FILE_NAME),
                service_file: config.join("systemd/user").join(CONTROLLER_SERVICE),
                icon_file: data.join("icons/hicolor/128x128/apps").join(ICON_FILE_NAME),
                config_dir: config.join(INSTALL_ROOT_NAME),
            })
        }
    }

    pub fn install_current_executable() -> Result<(), String> {
        let paths = InstallPaths::system()?;
        let source = std::env::current_exe()
            .map_err(|error| format!("could not locate this executable: {error}"))?;
        let stable_binary = paths.bin_link.clone();
        let quoted_binary = quote_exec_path(&stable_binary)?;

        fs::create_dir_all(&paths.version_dir)
            .map_err(|error| format!("could not create version directory: {error}"))?;
        atomic_copy_executable(&source, &paths.version_binary)?;
        atomic_symlink(
            Path::new("versions").join(env!("CARGO_PKG_VERSION")),
            &paths.current_link,
        )?;
        let bin_target = Path::new("../lib")
            .join(INSTALL_ROOT_NAME)
            .join("current/ok200-crostini");
        atomic_symlink(bin_target, &paths.bin_link)?;

        let desktop = DESKTOP_TEMPLATE.replace("@OK200_CROSTINI_BINARY@", &quoted_binary);
        atomic_write(&paths.desktop_file, desktop.as_bytes(), 0o644)?;
        let service = SERVICE_TEMPLATE.replace("@OK200_CROSTINI_BINARY@", &quoted_binary);
        atomic_write(&paths.service_file, service.as_bytes(), 0o644)?;
        atomic_write(&paths.icon_file, ICON, 0o644)?;

        checked_command(
            Command::new("systemctl")
                .args(["--user", "daemon-reload"])
                .output(),
            "reload the user service manager",
        )?;
        refresh_desktop_caches(&paths);
        checked_command(
            Command::new("systemctl")
                .args(["--user", "start", "--no-block", CONTROLLER_SERVICE])
                .output(),
            "start the controller",
        )?;

        println!("Installed 200 OK Linux {}.", env!("CARGO_PKG_VERSION"));
        println!("Open ‘200 OK Linux’ from the ChromeOS Launcher.");
        println!("The controller was started for this setup session but was not enabled at login.");
        Ok(())
    }

    pub fn uninstall(purge: bool) -> Result<(), String> {
        let paths = InstallPaths::system()?;
        let _ = Command::new("systemctl")
            .args(["--user", "stop", CONTROLLER_SERVICE])
            .output();

        remove_file_if_present(&paths.desktop_file)?;
        remove_file_if_present(&paths.service_file)?;
        remove_file_if_present(&paths.icon_file)?;
        remove_file_if_present(&paths.bin_link)?;
        if paths.install_root.exists() {
            fs::remove_dir_all(&paths.install_root).map_err(|error| {
                format!(
                    "could not remove installed files {}: {error}",
                    paths.install_root.display()
                )
            })?;
        }
        if purge && paths.config_dir.exists() {
            fs::remove_dir_all(&paths.config_dir).map_err(|error| {
                format!(
                    "could not purge controller settings {}: {error}",
                    paths.config_dir.display()
                )
            })?;
        }

        checked_command(
            Command::new("systemctl")
                .args(["--user", "daemon-reload"])
                .output(),
            "reload the user service manager",
        )?;
        refresh_desktop_caches(&paths);
        println!("Removed 200 OK Linux application files.");
        if purge {
            println!("Controller settings and pairing data were also removed.");
        } else {
            println!(
                "Controller settings remain in {} for a later reinstall. Delete that directory manually if you no longer want them.",
                paths.config_dir.display()
            );
        }
        Ok(())
    }

    pub fn stop_controller_for_reset() -> Result<(), String> {
        checked_command(
            Command::new("systemctl")
                .args(["--user", "stop", CONTROLLER_SERVICE])
                .output(),
            "stop the controller",
        )
    }

    fn atomic_copy_executable(source: &Path, destination: &Path) -> Result<(), String> {
        let parent = destination
            .parent()
            .ok_or_else(|| "installed binary has no parent directory".to_owned())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create binary directory: {error}"))?;
        let temporary = parent.join(format!(".ok200-crostini-{}.tmp", Uuid::new_v4().simple()));
        fs::copy(source, &temporary)
            .map_err(|error| format!("could not copy executable: {error}"))?;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("could not make installed binary executable: {error}"))?;
        fs::rename(&temporary, destination)
            .map_err(|error| format!("could not install executable atomically: {error}"))
    }

    fn atomic_write(path: &Path, contents: &[u8], mode: u32) -> Result<(), String> {
        let parent = path
            .parent()
            .ok_or_else(|| format!("install path has no parent: {}", path.display()))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
        let temporary = parent.join(format!(".ok200-install-{}.tmp", Uuid::new_v4().simple()));
        fs::write(&temporary, contents)
            .map_err(|error| format!("could not write {}: {error}", temporary.display()))?;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(mode)).map_err(|error| {
            format!(
                "could not set permissions on {}: {error}",
                temporary.display()
            )
        })?;
        fs::rename(&temporary, path)
            .map_err(|error| format!("could not install {}: {error}", path.display()))
    }

    fn atomic_symlink(target: PathBuf, destination: &Path) -> Result<(), String> {
        let parent = destination
            .parent()
            .ok_or_else(|| format!("link path has no parent: {}", destination.display()))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
        let temporary = parent.join(format!(".ok200-link-{}.tmp", Uuid::new_v4().simple()));
        symlink(target, &temporary)
            .map_err(|error| format!("could not create {}: {error}", temporary.display()))?;
        fs::rename(&temporary, destination)
            .map_err(|error| format!("could not install {}: {error}", destination.display()))
    }

    fn remove_file_if_present(path: &Path) -> Result<(), String> {
        match fs::symlink_metadata(path) {
            Ok(_) => fs::remove_file(path)
                .map_err(|error| format!("could not remove {}: {error}", path.display())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("could not inspect {}: {error}", path.display())),
        }
    }

    fn quote_exec_path(path: &Path) -> Result<String, String> {
        let value = path
            .to_str()
            .ok_or_else(|| "install path is not valid UTF-8".to_owned())?;
        if value.contains(['\n', '\r', '\0']) {
            return Err("install path contains unsupported control characters".to_owned());
        }
        Ok(format!(
            "\"{}\"",
            value.replace('\\', "\\\\").replace('"', "\\\"")
        ))
    }

    fn checked_command(result: std::io::Result<Output>, action: &str) -> Result<(), String> {
        let output = result.map_err(|error| format!("could not {action}: {error}"))?;
        if output.status.success() {
            return Ok(());
        }
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        if detail.is_empty() {
            Err(format!("could not {action} (exit {})", output.status))
        } else {
            Err(format!("could not {action}: {detail}"))
        }
    }

    fn refresh_desktop_caches(paths: &InstallPaths) {
        if let Some(directory) = paths.desktop_file.parent() {
            let _ = Command::new("update-desktop-database")
                .arg(directory)
                .output();
        }
        if let Some(directory) = paths.icon_file.ancestors().nth(3) {
            let _ = Command::new("gtk-update-icon-cache")
                .args(["-f", "-t"])
                .arg(directory)
                .output();
        }
    }

    #[cfg(test)]
    mod tests {
        use super::quote_exec_path;
        use std::path::Path;

        #[test]
        fn quotes_desktop_and_systemd_executable_paths() {
            assert_eq!(
                quote_exec_path(Path::new("/home/a user/bin/ok200")).unwrap(),
                "\"/home/a user/bin/ok200\""
            );
            assert!(quote_exec_path(Path::new("/tmp/bad\npath")).is_err());
        }
    }
}

#[cfg(target_os = "linux")]
pub use platform::{install_current_executable, stop_controller_for_reset, uninstall};

#[cfg(not(target_os = "linux"))]
pub fn install_current_executable() -> Result<(), String> {
    Err("the ChromeOS Linux installer only runs on Linux".to_owned())
}

#[cfg(not(target_os = "linux"))]
pub fn uninstall(_purge: bool) -> Result<(), String> {
    Err("the ChromeOS Linux uninstaller only runs on Linux".to_owned())
}

#[cfg(not(target_os = "linux"))]
pub fn stop_controller_for_reset() -> Result<(), String> {
    Err("the ChromeOS Linux controller only runs on Linux".to_owned())
}
