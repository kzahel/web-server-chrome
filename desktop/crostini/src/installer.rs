#[cfg(target_os = "linux")]
mod platform {
    use std::collections::HashSet;
    use std::fs::{self, File};
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::path::{Component, Path, PathBuf};
    use std::process::{Command, Output};

    use fs2::FileExt;
    use semver::Version;
    use uuid::Uuid;

    use crate::release::{VerifiedRelease, RELEASE_MANIFEST_NAME, RELEASE_SIGNATURE_NAME};
    use crate::CONTROLLER_SERVICE;

    const DESKTOP_TEMPLATE: &str = include_str!("../resources/app.ok200.crostini.desktop.in");
    const SERVICE_TEMPLATE: &str =
        include_str!("../resources/app.ok200.crostini-controller.service.in");
    const ICON: &[u8] = include_bytes!("../../../extension/public/icons/ok-128.png");
    const INSTALL_ROOT_NAME: &str = "ok200-crostini";
    const DESKTOP_FILE_NAME: &str = "app.ok200.crostini.desktop";
    const ICON_FILE_NAME: &str = "app.ok200.crostini.png";
    const OWNERSHIP_MANIFEST_NAME: &str = "ownership-v1.manifest";
    const INSTALL_LOCK_NAME: &str = "install.lock";

    #[derive(Clone, Debug)]
    struct InstallPaths {
        install_root: PathBuf,
        versions_dir: PathBuf,
        current_link: PathBuf,
        previous_link: PathBuf,
        bin_link: PathBuf,
        desktop_file: PathBuf,
        service_file: PathBuf,
        icon_file: PathBuf,
        ownership_manifest: PathBuf,
        config_dir: PathBuf,
        install_lock: PathBuf,
    }

    impl InstallPaths {
        fn system() -> Result<Self, String> {
            let home = dirs::home_dir()
                .ok_or_else(|| "could not determine the user home directory".to_owned())?;
            let data = dirs::data_dir().unwrap_or_else(|| home.join(".local/share"));
            let config = dirs::config_dir().unwrap_or_else(|| home.join(".config"));
            Self::for_roots(&home, &data, &config)
        }

        fn for_roots(home: &Path, data: &Path, config: &Path) -> Result<Self, String> {
            ensure_safe_install_path(home)?;
            ensure_safe_install_path(data)?;
            ensure_safe_install_path(config)?;
            let install_root = home.join(".local/lib").join(INSTALL_ROOT_NAME);
            let config_dir = config.join(INSTALL_ROOT_NAME);
            Ok(Self {
                versions_dir: install_root.join("versions"),
                current_link: install_root.join("current"),
                previous_link: install_root.join("previous"),
                ownership_manifest: install_root.join(OWNERSHIP_MANIFEST_NAME),
                install_root,
                bin_link: home.join(".local/bin/ok200-crostini"),
                desktop_file: data.join("applications").join(DESKTOP_FILE_NAME),
                service_file: config.join("systemd/user").join(CONTROLLER_SERVICE),
                icon_file: data.join("icons/hicolor/128x128/apps").join(ICON_FILE_NAME),
                install_lock: config_dir.join(INSTALL_LOCK_NAME),
                config_dir,
            })
        }

        fn version_dir(&self, version: &Version) -> PathBuf {
            self.versions_dir.join(version.to_string())
        }
    }

    pub fn install_current_executable(release: Option<&VerifiedRelease>) -> Result<(), String> {
        let paths = InstallPaths::system()?;
        let _install_lock = acquire_install_lock(&paths)?;
        let source = std::env::current_exe()
            .map_err(|error| format!("could not locate this executable: {error}"))?;
        let version = Version::parse(env!("CARGO_PKG_VERSION"))
            .map_err(|error| format!("binary version is invalid: {error}"))?;
        if let Some(release) = release {
            if release.manifest.version != version {
                return Err(format!(
                    "signed release {} does not match binary version {version}",
                    release.manifest.version
                ));
            }
        }
        let new_target = Path::new("versions").join(version.to_string());
        let old_current = read_version_link(&paths.current_link)?;
        reject_downgrade(old_current.as_deref(), &version)?;
        let version_changed = old_current
            .as_ref()
            .is_some_and(|target| target != &new_target);
        let version_dir = paths.version_dir(&version);
        let version_binary = version_dir.join("ok200-crostini");
        let stable_binary = paths.bin_link.clone();
        let quoted_binary = quote_exec_path(&stable_binary)?;

        ensure_owned_directory(&paths.install_root, "install root")?;
        ensure_owned_directory(&paths.versions_dir, "versions directory")?;
        ensure_owned_directory(&version_dir, "version directory")?;
        atomic_copy_executable(&source, &version_binary)?;
        if let Some(release) = release {
            atomic_write(
                &version_dir.join(RELEASE_MANIFEST_NAME),
                &release.manifest_bytes,
                0o644,
            )?;
            atomic_write(
                &version_dir.join(RELEASE_SIGNATURE_NAME),
                release.signature.as_bytes(),
                0o644,
            )?;
        }

        if version_changed {
            atomic_symlink(
                old_current.expect("checked current target"),
                &paths.previous_link,
            )?;
        }
        atomic_symlink(new_target, &paths.current_link)?;
        let bin_target = Path::new("../lib")
            .join(INSTALL_ROOT_NAME)
            .join("current/ok200-crostini");
        atomic_symlink(bin_target, &paths.bin_link)?;

        let desktop = DESKTOP_TEMPLATE.replace("@OK200_CROSTINI_BINARY@", &quoted_binary);
        atomic_write(&paths.desktop_file, desktop.as_bytes(), 0o644)?;
        let service = SERVICE_TEMPLATE.replace("@OK200_CROSTINI_BINARY@", &quoted_binary);
        atomic_write(&paths.service_file, service.as_bytes(), 0o644)?;
        atomic_write(&paths.icon_file, ICON, 0o644)?;
        atomic_write(
            &paths.ownership_manifest,
            ownership_manifest(&paths)?.as_bytes(),
            0o644,
        )?;
        prune_old_versions(&paths)?;

        reload_user_service_manager()?;
        refresh_desktop_caches(&paths);
        let service_action = if version_changed { "restart" } else { "start" };
        checked_command(
            Command::new("systemctl")
                .args(["--user", service_action, "--no-block", CONTROLLER_SERVICE])
                .output(),
            &format!("{service_action} the controller"),
        )?;

        println!("Installed 200 OK Linux {version}.");
        println!("Open ‘200 OK Linux’ from the ChromeOS Launcher.");
        println!("The controller was started for this setup session but was not enabled at login.");
        Ok(())
    }

    pub fn rollback() -> Result<(), String> {
        let paths = InstallPaths::system()?;
        let _install_lock = acquire_install_lock(&paths)?;
        let current = read_version_link(&paths.current_link)?
            .ok_or_else(|| "there is no current installed version".to_owned())?;
        let previous = read_version_link(&paths.previous_link)?
            .ok_or_else(|| "there is no previous version available for rollback".to_owned())?;
        ensure_version_binary(&paths, &previous)?;
        ensure_version_binary(&paths, &current)?;

        let _ = Command::new("systemctl")
            .args(["--user", "stop", CONTROLLER_SERVICE])
            .output();
        atomic_symlink(previous.clone(), &paths.current_link)?;
        atomic_symlink(current, &paths.previous_link)?;
        reload_user_service_manager()?;
        checked_command(
            Command::new("systemctl")
                .args(["--user", "start", "--no-block", CONTROLLER_SERVICE])
                .output(),
            "start the rolled-back controller",
        )?;
        println!(
            "Rolled back 200 OK Linux to {}.",
            version_from_target(&previous)?
        );
        Ok(())
    }

    pub fn uninstall(purge: bool) -> Result<(), String> {
        let paths = InstallPaths::system()?;
        let install_lock = acquire_install_lock(&paths)?;
        verify_ownership_manifest_if_present(&paths)?;
        stop_controller_for_uninstall()?;

        remove_file_if_present(&paths.desktop_file)?;
        remove_file_if_present(&paths.service_file)?;
        remove_file_if_present(&paths.icon_file)?;
        remove_file_if_present(&paths.bin_link)?;
        if paths.install_root.exists() {
            ensure_owned_directory(&paths.install_root, "install root")?;
            fs::remove_dir_all(&paths.install_root).map_err(|error| {
                format!(
                    "could not remove installed files {}: {error}",
                    paths.install_root.display()
                )
            })?;
        }

        reload_user_service_manager()?;
        refresh_desktop_caches(&paths);
        drop(install_lock);
        if purge && paths.config_dir.exists() {
            fs::remove_dir_all(&paths.config_dir).map_err(|error| {
                format!(
                    "could not purge controller settings {}: {error}",
                    paths.config_dir.display()
                )
            })?;
        }

        println!("Removed 200 OK Linux application files.");
        println!(
            "ChromeOS removes its Launcher entry asynchronously. Do not reopen a loading 200 OK shortcut while removal settles."
        );
        if purge {
            println!("Controller settings, pairing data, and update state were also removed.");
        } else {
            println!(
                "Controller settings remain in {} for a later reinstall. Delete that directory manually if you no longer want them.",
                paths.config_dir.display()
            );
        }
        Ok(())
    }

    fn stop_controller_for_uninstall() -> Result<(), String> {
        let output = Command::new("systemctl")
            .args(["--user", "stop", CONTROLLER_SERVICE])
            .output()
            .map_err(|error| format!("could not stop the controller before uninstall: {error}"))?;
        if output.status.success() {
            return Ok(());
        }

        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        if service_is_already_absent(&detail) {
            return Ok(());
        }
        Err(if detail.is_empty() {
            format!(
                "could not stop the controller before uninstall (exit {})",
                output.status
            )
        } else {
            format!("could not stop the controller before uninstall: {detail}")
        })
    }

    fn service_is_already_absent(detail: &str) -> bool {
        detail.contains("not loaded") || detail.contains("not found")
    }

    pub fn stop_controller_for_reset() -> Result<(), String> {
        checked_command(
            Command::new("systemctl")
                .args(["--user", "stop", CONTROLLER_SERVICE])
                .output(),
            "stop the controller",
        )
    }

    fn acquire_install_lock(paths: &InstallPaths) -> Result<File, String> {
        ensure_owned_directory(&paths.config_dir, "controller config directory")?;
        fs::set_permissions(&paths.config_dir, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("could not secure controller config directory: {error}"))?;
        let file = File::options()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&paths.install_lock)
            .map_err(|error| format!("could not open installer lock: {error}"))?;
        fs::set_permissions(&paths.install_lock, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("could not secure installer lock: {error}"))?;
        file.try_lock_exclusive()
            .map_err(|error| format!("another install/update operation is active: {error}"))?;
        Ok(file)
    }

    fn ensure_owned_directory(path: &Path, description: &str) -> Result<(), String> {
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() => {
                Ok(())
            }
            Ok(_) => Err(format!(
                "{description} {} is not a real directory; refusing to follow or replace it",
                path.display()
            )),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir_all(path)
                    .map_err(|error| format!("could not create {description}: {error}"))?;
                let metadata = fs::symlink_metadata(path)
                    .map_err(|error| format!("could not inspect {description}: {error}"))?;
                if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() {
                    Ok(())
                } else {
                    Err(format!(
                        "{description} {} is not a real directory",
                        path.display()
                    ))
                }
            }
            Err(error) => Err(format!("could not inspect {description}: {error}")),
        }
    }

    fn ownership_manifest(paths: &InstallPaths) -> Result<String, String> {
        let values = [
            ("install_root", &paths.install_root),
            ("binary_link", &paths.bin_link),
            ("desktop_file", &paths.desktop_file),
            ("service_file", &paths.service_file),
            ("icon_file", &paths.icon_file),
            ("config_preserved_by_default", &paths.config_dir),
        ];
        let mut output = "ok200-crostini-ownership-v1\n".to_owned();
        for (key, path) in values {
            let value = path
                .to_str()
                .ok_or_else(|| format!("owned path {} is not valid UTF-8", path.display()))?;
            if value.contains(['\n', '\r', '\0']) {
                return Err(format!("owned path {key} contains control characters"));
            }
            output.push_str(key);
            output.push('=');
            output.push_str(value);
            output.push('\n');
        }
        Ok(output)
    }

    fn verify_ownership_manifest_if_present(paths: &InstallPaths) -> Result<(), String> {
        match fs::read_to_string(&paths.ownership_manifest) {
            Ok(actual) if actual == ownership_manifest(paths)? => Ok(()),
            Ok(_) => Err(format!(
                "ownership manifest {} does not match this installation; refusing broad removal",
                paths.ownership_manifest.display()
            )),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                eprintln!(
                    "ok200-crostini: warning: removing a pre-manifest development installation"
                );
                Ok(())
            }
            Err(error) => Err(format!(
                "could not read ownership manifest {}: {error}",
                paths.ownership_manifest.display()
            )),
        }
    }

    fn read_version_link(path: &Path) -> Result<Option<PathBuf>, String> {
        let target = match fs::read_link(path) {
            Ok(target) => target,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("could not read {}: {error}", path.display())),
        };
        validate_version_target(&target)?;
        Ok(Some(target))
    }

    fn validate_version_target(target: &Path) -> Result<(), String> {
        let components: Vec<Component<'_>> = target.components().collect();
        if components.len() != 2 || components[0] != Component::Normal("versions".as_ref()) {
            return Err(format!(
                "installed version link has unsafe target {}",
                target.display()
            ));
        }
        let version = components[1]
            .as_os_str()
            .to_str()
            .ok_or_else(|| "installed version link is not valid UTF-8".to_owned())?;
        Version::parse(version)
            .map_err(|_| format!("installed version link contains invalid version {version}"))?;
        Ok(())
    }

    fn version_from_target(target: &Path) -> Result<Version, String> {
        validate_version_target(target)?;
        Version::parse(
            target
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| "installed version target is invalid".to_owned())?,
        )
        .map_err(|error| format!("installed version target is invalid: {error}"))
    }

    fn reject_downgrade(current_target: Option<&Path>, candidate: &Version) -> Result<(), String> {
        let Some(current_target) = current_target else {
            return Ok(());
        };
        let current = version_from_target(current_target)?;
        if candidate < &current {
            return Err(format!(
                "refusing to replace installed version {current} with older version {candidate}; use rollback for the retained previous version"
            ));
        }
        Ok(())
    }

    fn ensure_version_binary(paths: &InstallPaths, target: &Path) -> Result<(), String> {
        validate_version_target(target)?;
        let binary = paths.install_root.join(target).join("ok200-crostini");
        let metadata = fs::metadata(&binary).map_err(|error| {
            format!(
                "rollback binary {} is unavailable: {error}",
                binary.display()
            )
        })?;
        if !metadata.is_file() {
            return Err(format!(
                "rollback binary {} is not a file",
                binary.display()
            ));
        }
        Ok(())
    }

    fn prune_old_versions(paths: &InstallPaths) -> Result<(), String> {
        let mut retained = HashSet::new();
        for link in [&paths.current_link, &paths.previous_link] {
            if let Some(target) = read_version_link(link)? {
                retained.insert(version_from_target(&target)?.to_string());
            }
        }
        let entries = match fs::read_dir(&paths.versions_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(format!("could not inspect installed versions: {error}")),
        };
        for entry in entries {
            let entry =
                entry.map_err(|error| format!("could not inspect installed version: {error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("could not inspect installed version type: {error}"))?;
            if !file_type.is_dir() || file_type.is_symlink() {
                return Err(format!(
                    "unexpected entry in owned versions directory: {}",
                    entry.path().display()
                ));
            }
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| "installed version directory is not valid UTF-8".to_owned())?;
            Version::parse(&name)
                .map_err(|_| format!("installed version directory has invalid name {name}"))?;
            if !retained.contains(&name) {
                fs::remove_dir_all(entry.path())
                    .map_err(|error| format!("could not prune old version {name}: {error}"))?;
            }
        }
        Ok(())
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

    fn ensure_safe_install_path(path: &Path) -> Result<(), String> {
        let value = path
            .to_str()
            .ok_or_else(|| "install base path is not valid UTF-8".to_owned())?;
        if !path.is_absolute() || value.contains(['\n', '\r', '\0']) || path == Path::new("/") {
            return Err(format!("unsafe install base path: {}", path.display()));
        }
        Ok(())
    }

    fn reload_user_service_manager() -> Result<(), String> {
        checked_command(
            Command::new("systemctl")
                .args(["--user", "daemon-reload"])
                .output(),
            "reload the user service manager",
        )
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
        use super::*;

        #[test]
        fn quotes_desktop_and_systemd_executable_paths() {
            assert_eq!(
                quote_exec_path(Path::new("/home/a user/bin/ok200")).unwrap(),
                "\"/home/a user/bin/ok200\""
            );
            assert!(quote_exec_path(Path::new("/tmp/bad\npath")).is_err());
        }

        #[test]
        fn validates_only_relative_version_links() {
            assert!(validate_version_target(Path::new("versions/0.1.0")).is_ok());
            assert!(validate_version_target(Path::new("versions/0.1.0-dev.1")).is_ok());
            assert!(validate_version_target(Path::new("/tmp/0.1.0")).is_err());
            assert!(validate_version_target(Path::new("versions/../escape")).is_err());
            assert!(validate_version_target(Path::new("other/0.1.0")).is_err());
        }

        #[test]
        fn records_exact_owned_paths_and_preservation_boundary() {
            let paths = InstallPaths::for_roots(
                Path::new("/home/test"),
                Path::new("/home/test/.local/share"),
                Path::new("/home/test/.config"),
            )
            .unwrap();
            let manifest = ownership_manifest(&paths).unwrap();
            assert!(manifest.starts_with("ok200-crostini-ownership-v1\n"));
            assert!(manifest.contains("install_root=/home/test/.local/lib/ok200-crostini\n"));
            assert!(manifest
                .contains("config_preserved_by_default=/home/test/.config/ok200-crostini\n"));
            assert!(!manifest.contains("Downloads"));
        }

        #[test]
        fn refuses_owned_directory_symlinks() {
            let temp = tempfile::tempdir().unwrap();
            let real = temp.path().join("real");
            let linked = temp.path().join("linked");
            fs::create_dir(&real).unwrap();
            symlink(&real, &linked).unwrap();
            assert!(ensure_owned_directory(&linked, "test directory").is_err());
            assert!(ensure_owned_directory(&real, "test directory").is_ok());
        }

        #[test]
        fn rejects_installer_downgrades_but_allows_upgrade_and_repair() {
            let current = Path::new("versions/1.2.3");
            assert!(reject_downgrade(Some(current), &Version::new(1, 2, 2)).is_err());
            assert!(reject_downgrade(Some(current), &Version::new(1, 2, 3)).is_ok());
            assert!(reject_downgrade(Some(current), &Version::new(1, 3, 0)).is_ok());
            assert!(reject_downgrade(None, &Version::new(0, 1, 0)).is_ok());
        }

        #[test]
        fn repeated_uninstall_accepts_an_already_absent_service() {
            assert!(service_is_already_absent(
                "Failed to stop app.ok200.service: Unit app.ok200.service not loaded."
            ));
            assert!(service_is_already_absent(
                "Unit app.ok200.service not found."
            ));
            assert!(!service_is_already_absent("Access denied"));
        }
    }
}

#[cfg(target_os = "linux")]
pub use platform::{install_current_executable, rollback, stop_controller_for_reset, uninstall};

#[cfg(not(target_os = "linux"))]
pub fn install_current_executable(
    _release: Option<&crate::release::VerifiedRelease>,
) -> Result<(), String> {
    Err("the ChromeOS Linux installer only runs on Linux".to_owned())
}

#[cfg(not(target_os = "linux"))]
pub fn rollback() -> Result<(), String> {
    Err("the ChromeOS Linux rollback only runs on Linux".to_owned())
}

#[cfg(not(target_os = "linux"))]
pub fn uninstall(_purge: bool) -> Result<(), String> {
    Err("the ChromeOS Linux uninstaller only runs on Linux".to_owned())
}

#[cfg(not(target_os = "linux"))]
pub fn stop_controller_for_reset() -> Result<(), String> {
    Err("the ChromeOS Linux controller only runs on Linux".to_owned())
}
