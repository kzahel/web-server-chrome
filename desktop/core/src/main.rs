use std::env;
use std::net::IpAddr;
use std::path::PathBuf;
use std::process::ExitCode;

use ok200_core::{RunningServer, ServerConfig, ServerStatus};

struct CliOptions {
    config: ServerConfig,
    quiet: bool,
}

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("ok200-core: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let Some(options) = parse_arguments(env::args().skip(1))? else {
        print_usage();
        return Ok(());
    };

    let server = RunningServer::start(options.config).await?;
    let address = server.local_addr();
    println!(
        "Serving {} at http://{} (press Ctrl-C to stop)",
        server.config().root.display(),
        address
    );

    let log_task = if options.quiet {
        None
    } else {
        let mut logs = server.subscribe_logs();
        Some(tokio::spawn(async move {
            loop {
                match logs.recv().await {
                    Ok(event) => match serde_json::to_string(&event) {
                        Ok(json) => eprintln!("{json}"),
                        Err(error) => eprintln!("could not serialize request log: {error}"),
                    },
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(count)) => {
                        eprintln!("request log consumer dropped {count} events");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }))
    };

    let mut statuses = server.subscribe_status();
    tokio::select! {
        result = tokio::signal::ctrl_c() => result?,
        result = wait_for_failure(&mut statuses) => result?,
    }
    server.stop().await?;
    if let Some(task) = log_task {
        task.abort();
    }
    Ok(())
}

async fn wait_for_failure(
    statuses: &mut tokio::sync::watch::Receiver<ServerStatus>,
) -> Result<(), Box<dyn std::error::Error>> {
    loop {
        statuses.changed().await?;
        match statuses.borrow().clone() {
            ServerStatus::Failed(error) => return Err(error.into()),
            ServerStatus::Stopped => return Err("server stopped unexpectedly".into()),
            ServerStatus::Running | ServerStatus::Stopping => {}
        }
    }
}

fn parse_arguments(
    arguments: impl IntoIterator<Item = String>,
) -> Result<Option<CliOptions>, String> {
    let mut root = env::current_dir().map_err(|error| error.to_string())?;
    let mut host: IpAddr = "127.0.0.1"
        .parse()
        .map_err(|error| format!("invalid default host: {error}"))?;
    let mut port = 8080;
    let mut cors = false;
    let mut spa = false;
    let mut directory_listing = true;
    let mut quiet = false;

    let mut arguments = arguments.into_iter();
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "-h" | "--help" => return Ok(None),
            "--root" => {
                root = PathBuf::from(require_value(&mut arguments, "--root")?);
            }
            "--host" => {
                let value = require_value(&mut arguments, "--host")?;
                host = value
                    .parse()
                    .map_err(|_| format!("invalid --host IP address: {value}"))?;
            }
            "--port" => {
                let value = require_value(&mut arguments, "--port")?;
                port = value
                    .parse()
                    .map_err(|_| format!("invalid --port: {value}"))?;
            }
            "--cors" => cors = true,
            "--spa" => spa = true,
            "--no-directory-listing" => directory_listing = false,
            "--quiet" => quiet = true,
            _ => return Err(format!("unknown argument: {argument}")),
        }
    }

    let mut config = ServerConfig::new(root);
    config.host = host;
    config.port = port;
    config.cors = cors;
    config.spa = spa;
    config.directory_listing = directory_listing;
    Ok(Some(CliOptions { config, quiet }))
}

fn require_value(
    arguments: &mut impl Iterator<Item = String>,
    option: &str,
) -> Result<String, String> {
    arguments
        .next()
        .ok_or_else(|| format!("{option} requires a value"))
}

fn print_usage() {
    println!(
        "Usage: ok200-core [options]\n\
         \n\
         Options:\n\
           --root PATH                 Directory to serve (default: current directory)\n\
           --host IP                   IP address to bind (default: 127.0.0.1)\n\
           --port PORT                 Port to bind; 0 selects a free port (default: 8080)\n\
           --cors                      Enable wildcard CORS\n\
           --spa                       Fall back to root index.html for missing paths\n\
           --no-directory-listing      Return 404 for directories without index.html\n\
           --quiet                     Suppress JSON request logs\n\
           -h, --help                  Show this help"
    );
}

#[cfg(test)]
mod tests {
    use super::parse_arguments;

    #[test]
    fn parses_server_options() {
        let options = parse_arguments(
            [
                "--root",
                "/tmp",
                "--host",
                "0.0.0.0",
                "--port",
                "0",
                "--cors",
                "--spa",
                "--no-directory-listing",
                "--quiet",
            ]
            .map(str::to_owned),
        )
        .expect("valid arguments")
        .expect("not help");

        assert_eq!(options.config.root.to_string_lossy(), "/tmp");
        assert_eq!(options.config.host.to_string(), "0.0.0.0");
        assert_eq!(options.config.port, 0);
        assert!(options.config.cors);
        assert!(options.config.spa);
        assert!(!options.config.directory_listing);
        assert!(options.quiet);
    }

    #[test]
    fn rejects_unknown_arguments() {
        assert!(parse_arguments(["--wat".to_owned()]).is_err());
    }
}
