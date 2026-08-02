use std::process::ExitCode;

fn main() -> ExitCode {
    match std::env::args().nth(1).as_deref() {
        Some("launch") => launch(),
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
           launch       Open the ChromeOS Linux controller\n\n\
         Options:\n\
           -h, --help      Show this help\n\
           -V, --version   Show the version"
    );
}
