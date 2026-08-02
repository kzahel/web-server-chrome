use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::process::{Command, Output};
use std::thread;
use std::time::Duration;

use serde::Deserialize;

pub const APPLICATION_ID: &str = "app.ok200.crostini";
pub const CONTROLLER_PRODUCT: &str = "ok200-crostini-controller";
pub const CONTROLLER_PROTOCOL_VERSION: u16 = 1;
pub const CONTROLLER_PORT: u16 = 20_080;
pub const CONTROLLER_SERVICE: &str = "app.ok200.crostini-controller.service";

const HEALTH_ATTEMPTS: usize = 60;
const HEALTH_RETRY_DELAY: Duration = Duration::from_millis(250);
const HEALTH_IO_TIMEOUT: Duration = Duration::from_millis(500);
const MAX_HEALTH_RESPONSE_BYTES: u64 = 16 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LaunchProgress {
    StartingController,
    WaitingForController,
    OpeningChrome,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ControllerHealth {
    pub product: String,
    pub protocol_version: u16,
    pub instance_id: String,
}

pub trait LaunchBackend: Sync {
    fn start_controller(&self) -> Result<(), String>;
    fn controller_health(&self) -> Result<ControllerHealth, String>;
    fn open_bridge(&self) -> Result<(), String>;
}

pub struct SystemBackend;

impl LaunchBackend for SystemBackend {
    fn start_controller(&self) -> Result<(), String> {
        checked_command(
            Command::new("systemctl")
                .args(["--user", "start", "--no-block", CONTROLLER_SERVICE])
                .output(),
            "start the 200 OK Linux controller",
        )
    }

    fn controller_health(&self) -> Result<ControllerHealth, String> {
        probe_controller(SocketAddr::from(([127, 0, 0, 1], CONTROLLER_PORT)))
    }

    fn open_bridge(&self) -> Result<(), String> {
        checked_command(
            Command::new("xdg-open")
                .arg(format!(
                    "http://penguin.linux.test:{CONTROLLER_PORT}/launch-chromeos"
                ))
                .output(),
            "open 200 OK in Chrome",
        )
    }
}

pub fn execute_launch(
    backend: &impl LaunchBackend,
    mut report: impl FnMut(LaunchProgress),
) -> Result<ControllerHealth, String> {
    execute_launch_with_retry(
        backend,
        HEALTH_ATTEMPTS,
        HEALTH_RETRY_DELAY,
        thread::sleep,
        &mut report,
    )
}

fn execute_launch_with_retry(
    backend: &impl LaunchBackend,
    health_attempts: usize,
    retry_delay: Duration,
    mut sleep: impl FnMut(Duration),
    report: &mut impl FnMut(LaunchProgress),
) -> Result<ControllerHealth, String> {
    report(LaunchProgress::StartingController);
    backend.start_controller()?;

    report(LaunchProgress::WaitingForController);
    let mut last_health_error = "controller health check was not attempted".to_owned();
    let mut health = None;
    for attempt in 0..health_attempts {
        match backend.controller_health() {
            Ok(value) => {
                health = Some(value);
                break;
            }
            Err(error) => last_health_error = error,
        }

        if attempt + 1 < health_attempts {
            sleep(retry_delay);
        }
    }
    let health = health
        .ok_or_else(|| format!("the controller did not become ready: {last_health_error}"))?;

    validate_health(&health)?;
    report(LaunchProgress::OpeningChrome);
    backend.open_bridge()?;
    Ok(health)
}

pub fn parse_health_response(response: &[u8]) -> Result<ControllerHealth, String> {
    let header_end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "controller returned an incomplete HTTP response".to_owned())?;
    let headers = std::str::from_utf8(&response[..header_end])
        .map_err(|_| "controller returned invalid HTTP headers".to_owned())?;
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_ascii_whitespace().nth(1))
        .ok_or_else(|| "controller returned an invalid HTTP status".to_owned())?;
    if status != "200" {
        return Err(format!("controller health check returned HTTP {status}"));
    }

    serde_json::from_slice(&response[header_end + 4..])
        .map_err(|error| format!("controller returned invalid health data: {error}"))
}

fn validate_health(health: &ControllerHealth) -> Result<(), String> {
    if health.product != CONTROLLER_PRODUCT {
        return Err("the health listener is not the 200 OK controller".to_owned());
    }
    if health.protocol_version != CONTROLLER_PROTOCOL_VERSION {
        return Err(format!(
            "unsupported controller protocol version {}",
            health.protocol_version
        ));
    }
    if health.instance_id.is_empty()
        || health.instance_id.len() > 64
        || !health
            .instance_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("controller returned an invalid instance identifier".to_owned());
    }
    Ok(())
}

fn probe_controller(address: SocketAddr) -> Result<ControllerHealth, String> {
    let mut stream = TcpStream::connect_timeout(&address, HEALTH_IO_TIMEOUT)
        .map_err(|error| format!("controller is not ready: {error}"))?;
    stream
        .set_read_timeout(Some(HEALTH_IO_TIMEOUT))
        .map_err(|error| format!("could not configure controller health check: {error}"))?;
    stream
        .set_write_timeout(Some(HEALTH_IO_TIMEOUT))
        .map_err(|error| format!("could not configure controller health check: {error}"))?;
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .map_err(|error| format!("could not request controller health: {error}"))?;

    let mut response = Vec::new();
    stream
        .take(MAX_HEALTH_RESPONSE_BYTES)
        .read_to_end(&mut response)
        .map_err(|error| format!("could not read controller health: {error}"))?;
    parse_health_response(&response)
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

#[cfg(target_os = "linux")]
mod x11_launcher;

#[cfg(target_os = "linux")]
pub use x11_launcher::run_launcher_window;

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    use super::*;

    struct FakeBackend {
        start_error: Option<String>,
        health_results: Mutex<Vec<Result<ControllerHealth, String>>>,
        open_error: Option<String>,
        open_count: AtomicUsize,
    }

    impl FakeBackend {
        fn healthy_after(errors: usize) -> Self {
            let mut health_results = vec![Err("not ready".to_owned()); errors];
            health_results.push(Ok(valid_health()));
            health_results.reverse();
            Self {
                start_error: None,
                health_results: Mutex::new(health_results),
                open_error: None,
                open_count: AtomicUsize::new(0),
            }
        }
    }

    impl LaunchBackend for FakeBackend {
        fn start_controller(&self) -> Result<(), String> {
            self.start_error.clone().map_or(Ok(()), Err)
        }

        fn controller_health(&self) -> Result<ControllerHealth, String> {
            self.health_results
                .lock()
                .expect("health lock")
                .pop()
                .unwrap_or_else(|| Err("no result".to_owned()))
        }

        fn open_bridge(&self) -> Result<(), String> {
            self.open_count.fetch_add(1, Ordering::Relaxed);
            self.open_error.clone().map_or(Ok(()), Err)
        }
    }

    fn valid_health() -> ControllerHealth {
        ControllerHealth {
            product: CONTROLLER_PRODUCT.to_owned(),
            protocol_version: CONTROLLER_PROTOCOL_VERSION,
            instance_id: "fixture-1".to_owned(),
        }
    }

    #[test]
    fn parses_expected_health_response() {
        let body = br#"{"product":"ok200-crostini-controller","protocolVersion":1,"instanceId":"fixture-1"}"#;
        let mut response = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n".to_vec();
        response.extend_from_slice(body);

        assert_eq!(parse_health_response(&response).unwrap(), valid_health());
    }

    #[test]
    fn rejects_non_success_health_response() {
        let response = b"HTTP/1.1 503 Service Unavailable\r\n\r\n{}";
        assert_eq!(
            parse_health_response(response).unwrap_err(),
            "controller health check returned HTTP 503"
        );
    }

    #[test]
    fn retries_health_then_opens_bridge_once() {
        let backend = FakeBackend::healthy_after(2);
        let mut progress = Vec::new();
        let mut sleeps = 0;

        let health = execute_launch_with_retry(
            &backend,
            4,
            Duration::from_millis(1),
            |_| sleeps += 1,
            &mut |status| progress.push(status),
        )
        .unwrap();

        assert_eq!(health, valid_health());
        assert_eq!(sleeps, 2);
        assert_eq!(backend.open_count.load(Ordering::Relaxed), 1);
        assert_eq!(
            progress,
            [
                LaunchProgress::StartingController,
                LaunchProgress::WaitingForController,
                LaunchProgress::OpeningChrome,
            ]
        );
    }

    #[test]
    fn invalid_health_never_opens_bridge() {
        let backend = FakeBackend {
            start_error: None,
            health_results: Mutex::new(vec![Ok(ControllerHealth {
                product: "someone-else".to_owned(),
                ..valid_health()
            })]),
            open_error: None,
            open_count: AtomicUsize::new(0),
        };

        let error = execute_launch_with_retry(&backend, 1, Duration::ZERO, |_| {}, &mut |_| {})
            .unwrap_err();

        assert_eq!(error, "the health listener is not the 200 OK controller");
        assert_eq!(backend.open_count.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn service_failure_stops_before_health_or_bridge() {
        let backend = FakeBackend {
            start_error: Some("unit missing".to_owned()),
            health_results: Mutex::new(vec![]),
            open_error: None,
            open_count: AtomicUsize::new(0),
        };

        let error = execute_launch_with_retry(&backend, 1, Duration::ZERO, |_| {}, &mut |_| {})
            .unwrap_err();

        assert_eq!(error, "unit missing");
        assert_eq!(backend.open_count.load(Ordering::Relaxed), 0);
    }
}
