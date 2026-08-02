use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut arguments = std::env::args().skip(1);
    match arguments.next().as_deref() {
        Some("launch") => reject_extra_arguments(arguments).map_or_else(fail, |()| launch()),
        Some("controller") => controller(arguments),
        Some("install") => {
            reject_extra_arguments(arguments).map_or_else(fail, |()| install_current_executable())
        }
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
    ok200_crostini::install_current_executable().map_or_else(fail, |()| ExitCode::SUCCESS)
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
           uninstall    Remove installed files; add --purge for settings\n\
           status       Check whether the controller is ready\n\n\
           reset-controller  Reset extension pairing and stop the controller\n\n\
         Options:\n\
           -h, --help      Show this help\n\
           -V, --version   Show the version"
    );
}
