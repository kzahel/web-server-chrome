use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let mut arguments = std::env::args().skip(1);
    match arguments.next().as_deref() {
        Some("launch") => reject_extra_arguments(arguments).map_or_else(fail, |()| launch()),
        Some("controller") => controller(arguments),
        Some("install") => {
            reject_extra_arguments(arguments).map_or_else(fail, |()| install_current_executable())
        }
        Some("install-release") => install_verified_release(arguments),
        Some("check-update") => {
            reject_extra_arguments(arguments).map_or_else(fail, |()| check_update())
        }
        Some("update") => reject_extra_arguments(arguments).map_or_else(fail, |()| update()),
        Some("rollback") => reject_extra_arguments(arguments).map_or_else(fail, |()| rollback()),
        Some("verify-release") => verify_release(arguments),
        Some("reset-controller") => {
            reject_extra_arguments(arguments).map_or_else(fail, |()| reset_controller())
        }
        Some("status") => reject_extra_arguments(arguments).map_or_else(fail, |()| status()),
        Some("uninstall") => uninstall(arguments),
        Some("--version" | "-V") => {
            println!("ok200-crostini {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Some("--help" | "-h") | None => {
            print_usage();
            ExitCode::SUCCESS
        }
        Some(argument) => {
            eprintln!("ok200-crostini: unknown command: {argument}");
            print_usage();
            ExitCode::FAILURE
        }
    }
}

fn install_current_executable() -> ExitCode {
    ok200_crostini::install_current_executable(None).map_or_else(fail, |()| ExitCode::SUCCESS)
}

fn install_verified_release(mut arguments: impl Iterator<Item = String>) -> ExitCode {
    let manifest_path = match arguments.next() {
        Some(path) => PathBuf::from(path),
        None => return fail("install-release requires a manifest path"),
    };
    let signature_path = match arguments.next() {
        Some(path) => PathBuf::from(path),
        None => return fail("install-release requires a signature path"),
    };
    if let Some(argument) = arguments.next() {
        return fail(format!("unexpected argument: {argument}"));
    }
    let executable = match std::env::current_exe() {
        Ok(path) => path,
        Err(error) => return fail(format!("could not locate this executable: {error}")),
    };
    let arch = match ok200_crostini::current_architecture() {
        Ok(arch) => arch,
        Err(error) => return fail(error),
    };
    let release = match ok200_crostini::verify_release_files(
        &manifest_path,
        &signature_path,
        &executable,
        arch,
    ) {
        Ok(release) => release,
        Err(error) => return fail(error),
    };
    ok200_crostini::install_current_executable(Some(&release))
        .map_or_else(fail, |()| ExitCode::SUCCESS)
}

fn uninstall(mut arguments: impl Iterator<Item = String>) -> ExitCode {
    let purge = match arguments.next().as_deref() {
        None => false,
        Some("--purge") => true,
        Some(argument) => return fail(format!("unknown uninstall option: {argument}")),
    };
    if let Some(argument) = arguments.next() {
        return fail(format!("unexpected argument: {argument}"));
    }
    ok200_crostini::uninstall(purge).map_or_else(fail, |()| ExitCode::SUCCESS)
}

fn check_update() -> ExitCode {
    match ok200_crostini::check_for_update() {
        Ok(Some(release)) => {
            println!(
                "200 OK Linux {} is available (installed {}).",
                release.manifest.version,
                env!("CARGO_PKG_VERSION")
            );
            ExitCode::SUCCESS
        }
        Ok(None) => {
            println!("200 OK Linux {} is current.", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Err(error) => fail(error),
    }
}

fn update() -> ExitCode {
    let release = match ok200_crostini::check_for_update() {
        Ok(Some(release)) => release,
        Ok(None) => {
            println!(
                "200 OK Linux {} is already current.",
                env!("CARGO_PKG_VERSION")
            );
            return ExitCode::SUCCESS;
        }
        Err(error) => return fail(error),
    };
    let staged = match ok200_crostini::download_update(release) {
        Ok(staged) => staged,
        Err(error) => return fail(error),
    };
    let output = match Command::new(&staged.binary_path)
        .arg("install-release")
        .arg(&staged.manifest_path)
        .arg(&staged.signature_path)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            return fail(format!(
                "could not launch verified update installer: {error}"
            ))
        }
    };
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return fail(if detail.is_empty() {
            format!("verified update installer failed with {}", output.status)
        } else {
            format!("verified update installer failed: {detail}")
        });
    }
    println!(
        "Updated 200 OK Linux to {}. The controller is restarting.",
        staged.release.manifest.version
    );
    ExitCode::SUCCESS
}

fn rollback() -> ExitCode {
    ok200_crostini::rollback().map_or_else(fail, |()| ExitCode::SUCCESS)
}

fn verify_release(mut arguments: impl Iterator<Item = String>) -> ExitCode {
    let manifest_path = match arguments.next() {
        Some(path) => PathBuf::from(path),
        None => return fail("verify-release requires a manifest path"),
    };
    let signature_path = match arguments.next() {
        Some(path) => PathBuf::from(path),
        None => return fail("verify-release requires a signature path"),
    };
    let asset_path = match arguments.next() {
        Some(path) => PathBuf::from(path),
        None => return fail("verify-release requires an asset path"),
    };
    let Some(arch) = arguments.next() else {
        return fail("verify-release requires an architecture");
    };
    if let Some(argument) = arguments.next() {
        return fail(format!("unexpected argument: {argument}"));
    }
    match ok200_crostini::verify_release_files(&manifest_path, &signature_path, &asset_path, &arch)
    {
        Ok(release) => {
            println!(
                "Verified 200 OK Linux {} {} release asset.",
                release.manifest.version, arch
            );
            ExitCode::SUCCESS
        }
        Err(error) => fail(error),
    }
}

fn reset_controller() -> ExitCode {
    if let Err(error) = ok200_crostini::stop_controller_for_reset() {
        return fail(error);
    }
    let options = match ok200_crostini::ControllerOptions::system() {
        Ok(options) => options,
        Err(error) => return fail(error),
    };
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => return fail(format!("could not start async runtime: {error}")),
    };
    match runtime.block_on(ok200_crostini::reset_controller_identity(&options)) {
        Ok(()) => {
            println!("Controller pairing was reset. Open 200 OK Linux to pair again.");
            ExitCode::SUCCESS
        }
        Err(error) => fail(error),
    }
}

fn controller(arguments: impl Iterator<Item = String>) -> ExitCode {
    let options = match parse_controller_options(arguments) {
        Ok(options) => options,
        Err(error) => return fail(error),
    };
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => return fail(format!("could not start async runtime: {error}")),
    };
    runtime.block_on(async move {
        let controller = match ok200_crostini::RunningController::start(options).await {
            Ok(controller) => controller,
            Err(error) => return fail(error.to_string()),
        };
        eprintln!(
            "ok200-crostini: controller listening at {}",
            controller.local_addr()
        );
        if let Err(error) = wait_for_shutdown_signal().await {
            return fail(error);
        }
        match controller.stop().await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => fail(error.to_string()),
        }
    })
}

fn parse_controller_options(
    mut arguments: impl Iterator<Item = String>,
) -> Result<ok200_crostini::ControllerOptions, String> {
    let mut options =
        ok200_crostini::ControllerOptions::system().map_err(|error| error.to_string())?;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--config-dir" => {
                options.config_dir = PathBuf::from(require_value(&mut arguments, "--config-dir")?);
            }
            "--home-dir" => {
                options.home_dir = PathBuf::from(require_value(&mut arguments, "--home-dir")?);
            }
            "--bind" => {
                let value = require_value(&mut arguments, "--bind")?;
                options.bind_address = value
                    .parse::<SocketAddr>()
                    .map_err(|_| format!("invalid --bind address: {value}"))?;
            }
            _ => return Err(format!("unknown controller option: {argument}")),
        }
    }
    Ok(options)
}

fn require_value(
    arguments: &mut impl Iterator<Item = String>,
    option: &str,
) -> Result<String, String> {
    arguments
        .next()
        .ok_or_else(|| format!("{option} requires a value"))
}

async fn wait_for_shutdown_signal() -> Result<(), String> {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .map_err(|error| format!("could not install SIGTERM handler: {error}"))?;
        tokio::select! {
            result = tokio::signal::ctrl_c() => {
                result.map_err(|error| format!("could not wait for Ctrl-C: {error}"))?;
            }
            _ = terminate.recv() => {}
        }
        Ok(())
    }

    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c()
            .await
            .map_err(|error| format!("could not wait for Ctrl-C: {error}"))
    }
}

fn status() -> ExitCode {
    match ok200_crostini::probe_system_controller() {
        Ok(health) => {
            println!(
                "Controller {} is ready (protocol {})",
                health.instance_id, health.protocol_version
            );
            ExitCode::SUCCESS
        }
        Err(error) => fail(error),
    }
}

fn reject_extra_arguments(mut arguments: impl Iterator<Item = String>) -> Result<(), String> {
    arguments.next().map_or(Ok(()), |argument| {
        Err(format!("unexpected argument: {argument}"))
    })
}

fn fail(error: impl std::fmt::Display) -> ExitCode {
    eprintln!("ok200-crostini: {error}");
    ExitCode::FAILURE
}

#[cfg(target_os = "linux")]
fn launch() -> ExitCode {
    match ok200_crostini::run_launcher_window() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("ok200-crostini: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn launch() -> ExitCode {
    eprintln!("ok200-crostini: the ChromeOS Linux launcher only runs on Linux");
    ExitCode::FAILURE
}

fn print_usage() {
    println!(
        "Usage: ok200-crostini <command>\n\n\
         Commands:\n\
           launch       Start and open the ChromeOS Linux controller\n\
           controller   Run the on-demand controller service\n\
           install      Install this verified binary for the current user\n\
           check-update Check the signed Crostini release channel\n\
           update       Download, verify, and install the latest release\n\
           rollback     Switch atomically to the retained previous release\n\
           uninstall    Remove installed files; add --purge for settings\n\
           status       Check whether the controller is ready\n\n\
           reset-controller  Reset extension pairing and stop the controller\n\n\
         Options:\n\
           -h, --help      Show this help\n\
           -V, --version   Show the version"
    );
}
