use std::net::IpAddr;
use std::path::{Path, PathBuf};

use ok200_core::{RequestLog, RunningServer, ServerConfig, ServerStatus};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, watch, Mutex};

const SERVER_STATE_EVENT: &str = "server-state";
const SERVER_REQUEST_EVENT: &str = "server-request";
const SERVER_CORE_STATUS_EVENT: &str = "server-core-status";

fn default_host() -> String {
    "127.0.0.1".to_owned()
}

fn default_port() -> u16 {
    8080
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DesktopServerConfig {
    pub root: String,
    pub port: u16,
    pub host: String,
    pub cors: bool,
    pub spa: bool,
    pub directory_listing: bool,
}

impl Default for DesktopServerConfig {
    fn default() -> Self {
        Self {
            root: String::new(),
            port: default_port(),
            host: default_host(),
            cors: false,
            spa: false,
            directory_listing: default_true(),
        }
    }
}

impl DesktopServerConfig {
    fn core_config(&self) -> Result<ServerConfig, String> {
        let host = parse_supported_host(&self.host)?;
        let mut config = ServerConfig::new(&self.root);
        config.host = host;
        config.port = self.port;
        config.cors = self.cors;
        config.spa = self.spa;
        config.directory_listing = self.directory_listing;
        Ok(config)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DesktopServerStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RootRisk {
    Safe,
    HomeDirectory,
    AncestorOfHome,
    OutsideHome,
    UnknownLocation,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAssessment {
    pub allowed: bool,
    pub requires_confirmation: bool,
    pub risk: Option<RootRisk>,
    pub canonical_root: Option<String>,
    pub message: Option<String>,
}

impl StartAssessment {
    fn blocked(message: impl Into<String>) -> Self {
        Self {
            allowed: false,
            requires_confirmation: false,
            risk: None,
            canonical_root: None,
            message: Some(message.into()),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopServerSnapshot {
    pub id: &'static str,
    pub config: DesktopServerConfig,
    pub status: DesktopServerStatus,
    pub actual_port: Option<u16>,
    pub error: Option<String>,
    pub start_assessment: StartAssessment,
}

struct ServerInner {
    config: DesktopServerConfig,
    status: DesktopServerStatus,
    actual_port: Option<u16>,
    error: Option<String>,
    running: Option<RunningServer>,
}

pub struct ServerEventStreams {
    status: watch::Receiver<ServerStatus>,
    logs: broadcast::Receiver<RequestLog>,
}

pub struct StartOutcome {
    pub snapshot: DesktopServerSnapshot,
    pub streams: Option<ServerEventStreams>,
}

pub struct DesktopServerController {
    inner: Mutex<ServerInner>,
    config_path: PathBuf,
    home_dir: Option<PathBuf>,
}

impl DesktopServerController {
    pub fn new(config_path: PathBuf, home_dir: Option<PathBuf>) -> Self {
        let config = load_config(&config_path);
        Self {
            inner: Mutex::new(ServerInner {
                config,
                status: DesktopServerStatus::Stopped,
                actual_port: None,
                error: None,
                running: None,
            }),
            config_path,
            home_dir,
        }
    }

    pub async fn snapshot(&self) -> DesktopServerSnapshot {
        let (config, status, actual_port, error) = {
            let inner = self.inner.lock().await;
            let (status, runtime_error) = runtime_status(&inner);
            (
                inner.config.clone(),
                status,
                inner.actual_port,
                runtime_error.or_else(|| inner.error.clone()),
            )
        };
        let start_assessment = assess_start(&config, self.home_dir.as_deref()).await;
        DesktopServerSnapshot {
            id: "default",
            config,
            status,
            actual_port,
            error,
            start_assessment,
        }
    }

    pub async fn update_config(
        &self,
        config: DesktopServerConfig,
    ) -> Result<DesktopServerSnapshot, String> {
        parse_supported_host(&config.host)?;
        {
            let mut inner = self.inner.lock().await;
            if matches!(
                runtime_status(&inner).0,
                DesktopServerStatus::Starting
                    | DesktopServerStatus::Running
                    | DesktopServerStatus::Stopping
            ) {
                return Err("Stop the server before changing its configuration".to_owned());
            }
            save_config(&self.config_path, &config)?;
            inner.config = config;
            inner.status = DesktopServerStatus::Stopped;
            inner.actual_port = None;
            inner.error = None;
        }
        Ok(self.snapshot().await)
    }

    pub async fn start(&self, acknowledge_risk: bool) -> Result<StartOutcome, String> {
        let mut inner = self.inner.lock().await;

        if inner
            .running
            .as_ref()
            .is_some_and(|server| server.status() == ServerStatus::Running)
        {
            drop(inner);
            return Ok(StartOutcome {
                snapshot: self.snapshot().await,
                streams: None,
            });
        }

        if let Some(stale) = inner.running.take() {
            let _ = stale.stop().await;
        }

        let assessment = assess_start(&inner.config, self.home_dir.as_deref()).await;
        if !assessment.allowed {
            inner.status = DesktopServerStatus::Error;
            inner.error.clone_from(&assessment.message);
            return Err(assessment
                .message
                .unwrap_or_else(|| "The selected directory cannot be served".to_owned()));
        }
        if assessment.requires_confirmation && !acknowledge_risk {
            return Err(format!(
                "Confirmation required: {}",
                assessment
                    .message
                    .as_deref()
                    .unwrap_or("this configuration exposes a broad directory")
            ));
        }

        let config = inner.config.core_config()?;
        inner.status = DesktopServerStatus::Starting;
        inner.actual_port = None;
        inner.error = None;

        match RunningServer::start(config).await {
            Ok(server) => {
                let streams = ServerEventStreams {
                    status: server.subscribe_status(),
                    logs: server.subscribe_logs(),
                };
                inner.actual_port = Some(server.local_addr().port());
                inner.status = DesktopServerStatus::Running;
                inner.running = Some(server);
                drop(inner);
                Ok(StartOutcome {
                    snapshot: self.snapshot().await,
                    streams: Some(streams),
                })
            }
            Err(error) => {
                let message = error.to_string();
                inner.status = DesktopServerStatus::Error;
                inner.error = Some(message.clone());
                Err(message)
            }
        }
    }

    pub async fn stop(&self) -> Result<DesktopServerSnapshot, String> {
        let mut inner = self.inner.lock().await;
        let Some(server) = inner.running.take() else {
            inner.status = DesktopServerStatus::Stopped;
            inner.actual_port = None;
            inner.error = None;
            drop(inner);
            return Ok(self.snapshot().await);
        };

        inner.status = DesktopServerStatus::Stopping;
        if let Err(error) = server.stop().await {
            let message = error.to_string();
            inner.status = DesktopServerStatus::Error;
            inner.actual_port = None;
            inner.error = Some(message.clone());
            return Err(message);
        }

        inner.status = DesktopServerStatus::Stopped;
        inner.actual_port = None;
        inner.error = None;
        drop(inner);
        Ok(self.snapshot().await)
    }

    pub async fn shutdown(&self) {
        let mut inner = self.inner.lock().await;
        if let Some(server) = inner.running.take() {
            let _ = server.stop().await;
        }
        inner.status = DesktopServerStatus::Stopped;
        inner.actual_port = None;
    }
}

fn parse_supported_host(host: &str) -> Result<IpAddr, String> {
    let address = host
        .parse::<IpAddr>()
        .map_err(|_| format!("Invalid host address: {host}"))?;
    if !address.is_loopback() && !address.is_unspecified() {
        return Err("Host must be loopback or all interfaces".to_owned());
    }
    Ok(address)
}

fn runtime_status(inner: &ServerInner) -> (DesktopServerStatus, Option<String>) {
    match inner.running.as_ref().map(RunningServer::status) {
        Some(ServerStatus::Running) => (DesktopServerStatus::Running, None),
        Some(ServerStatus::Stopping) => (DesktopServerStatus::Stopping, None),
        Some(ServerStatus::Stopped) => (DesktopServerStatus::Stopped, None),
        Some(ServerStatus::Failed(error)) => (DesktopServerStatus::Error, Some(error)),
        None => (inner.status, None),
    }
}

fn classify_root(root: &Path, home: Option<&Path>) -> RootRisk {
    let Some(home) = home else {
        return RootRisk::UnknownLocation;
    };
    if root == home {
        RootRisk::HomeDirectory
    } else if home.starts_with(root) {
        RootRisk::AncestorOfHome
    } else if root.starts_with(home) {
        RootRisk::Safe
    } else {
        RootRisk::OutsideHome
    }
}

async fn assess_start(config: &DesktopServerConfig, home: Option<&Path>) -> StartAssessment {
    if config.root.is_empty() {
        return StartAssessment::blocked("Choose a folder before starting the server");
    }

    let canonical_root = match ok200_core::canonicalize_serving_root(Path::new(&config.root)).await
    {
        Ok(path) => path,
        Err(error) => return StartAssessment::blocked(error.to_string()),
    };
    match tokio::fs::metadata(&canonical_root).await {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) => {
            return StartAssessment::blocked(format!(
                "The selected path is not a directory: {}",
                canonical_root.display()
            ));
        }
        Err(error) => {
            return StartAssessment::blocked(format!(
                "Cannot read the selected directory {}: {error}",
                canonical_root.display()
            ));
        }
    }

    let canonical_home = if let Some(home) = home {
        tokio::fs::canonicalize(home).await.ok()
    } else {
        None
    };
    let risk = classify_root(&canonical_root, canonical_home.as_deref());
    let lan_access = config
        .host
        .parse::<IpAddr>()
        .is_ok_and(|host| host.is_unspecified());
    let directory_warning = match risk {
        RootRisk::Safe => None,
        RootRisk::HomeDirectory => Some(
            "This shares your entire home folder, including personal and hidden files.".to_owned(),
        ),
        RootRisk::AncestorOfHome => Some(
            "This folder contains your home folder and may expose personal files.".to_owned(),
        ),
        RootRisk::OutsideHome => {
            Some("This folder is outside your home folder. Confirm that it is safe to share.".to_owned())
        }
        RootRisk::UnknownLocation => Some(
            "The app could not compare this folder with your home folder. Confirm that it is safe to share."
                .to_owned(),
        ),
    };
    let message = match (directory_warning, lan_access) {
        (Some(directory), true) => Some(format!(
            "{directory} LAN access also makes it reachable by other devices on this network."
        )),
        (Some(directory), false) => Some(directory),
        (None, true) => Some(
            "LAN access makes this folder reachable by other devices on this network.".to_owned(),
        ),
        (None, false) => None,
    };

    StartAssessment {
        allowed: true,
        requires_confirmation: message.is_some(),
        risk: Some(risk),
        canonical_root: Some(canonical_root.to_string_lossy().into_owned()),
        message,
    }
}

fn load_config(path: &Path) -> DesktopServerConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

fn save_config(path: &Path, config: &DesktopServerConfig) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid server config path: {}", path.display()))?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create config directory: {error}"))?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Could not encode server config: {error}"))?;
    std::fs::write(path, json).map_err(|error| format!("Could not save server config: {error}"))
}

fn emit_snapshot(app: &AppHandle, snapshot: &DesktopServerSnapshot) {
    let _ = app.emit(SERVER_STATE_EVENT, snapshot);
}

fn forward_core_events(app: AppHandle, streams: ServerEventStreams) {
    let ServerEventStreams {
        mut status,
        mut logs,
    } = streams;
    let status_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while status.changed().await.is_ok() {
            let current = status.borrow().clone();
            let _ = status_app.emit(SERVER_CORE_STATUS_EVENT, current);
        }
    });
    tauri::async_runtime::spawn(async move {
        loop {
            match logs.recv().await {
                Ok(log) => {
                    let _ = app.emit(SERVER_REQUEST_EVENT, log);
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

#[tauri::command]
pub async fn server_get(
    state: tauri::State<'_, DesktopServerController>,
) -> Result<DesktopServerSnapshot, String> {
    Ok(state.snapshot().await)
}

#[tauri::command]
pub async fn server_update_config(
    app: AppHandle,
    state: tauri::State<'_, DesktopServerController>,
    config: DesktopServerConfig,
) -> Result<DesktopServerSnapshot, String> {
    let snapshot = state.update_config(config).await?;
    emit_snapshot(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn server_start(
    app: AppHandle,
    state: tauri::State<'_, DesktopServerController>,
    acknowledge_risk: bool,
) -> Result<DesktopServerSnapshot, String> {
    match state.start(acknowledge_risk).await {
        Ok(outcome) => {
            emit_snapshot(&app, &outcome.snapshot);
            if let Some(streams) = outcome.streams {
                forward_core_events(app, streams);
            }
            Ok(outcome.snapshot)
        }
        Err(error) => {
            emit_snapshot(&app, &state.snapshot().await);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn server_stop(
    app: AppHandle,
    state: tauri::State<'_, DesktopServerController>,
) -> Result<DesktopServerSnapshot, String> {
    match state.stop().await {
        Ok(snapshot) => {
            emit_snapshot(&app, &snapshot);
            Ok(snapshot)
        }
        Err(error) => {
            emit_snapshot(&app, &state.snapshot().await);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn server_pick_root(
    app: AppHandle,
    window: tauri::Window,
    start_dir: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut builder = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Choose Folder to Serve");
    if let Some(directory) = start_dir.filter(|path| Path::new(path).is_dir()) {
        builder = builder.set_directory(directory);
    }
    builder.pick_folder(move |selection| {
        let _ = sender.send(selection);
    });

    let selection = receiver
        .await
        .map_err(|_| "Folder chooser closed unexpectedly".to_owned())?;
    selection
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| format!("Invalid selected path: {error}"))
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn root_risk_distinguishes_home_boundaries() {
        let home = Path::new("/Users/example");
        assert_eq!(classify_root(home, Some(home)), RootRisk::HomeDirectory);
        assert_eq!(
            classify_root(Path::new("/Users"), Some(home)),
            RootRisk::AncestorOfHome
        );
        assert_eq!(
            classify_root(Path::new("/Users/example/Sites"), Some(home)),
            RootRisk::Safe
        );
        assert_eq!(
            classify_root(Path::new("/Volumes/Sites"), Some(home)),
            RootRisk::OutsideHome
        );
        assert_eq!(
            classify_root(Path::new("/Volumes/Sites"), None),
            RootRisk::UnknownLocation
        );
    }

    #[test]
    fn config_persistence_is_backward_compatible() {
        let temp = TempDir::new().expect("temporary config directory");
        let path = temp.path().join("server.json");
        std::fs::write(&path, r#"{"root":"/tmp/site","port":9000}"#).expect("write partial config");
        let loaded = load_config(&path);
        assert_eq!(loaded.root, "/tmp/site");
        assert_eq!(loaded.port, 9000);
        assert_eq!(loaded.host, "127.0.0.1");
        assert!(loaded.directory_listing);

        save_config(&path, &loaded).expect("save config");
        assert_eq!(load_config(&path), loaded);
    }

    #[tokio::test]
    async fn lifecycle_start_and_stop_are_idempotent() {
        let temp = TempDir::new().expect("temporary server directory");
        let root = temp.path().join("site");
        std::fs::create_dir(&root).expect("create server root");
        std::fs::write(root.join("hello.txt"), "hello").expect("write fixture");
        let config_path = temp.path().join("config/server.json");
        let controller = DesktopServerController::new(config_path, Some(temp.path().to_path_buf()));
        let config = DesktopServerConfig {
            root: root.to_string_lossy().into_owned(),
            port: 0,
            ..DesktopServerConfig::default()
        };
        controller
            .update_config(config)
            .await
            .expect("update config");

        let first = controller.start(false).await.expect("start server");
        let first_port = first.snapshot.actual_port.expect("actual port");
        assert_eq!(first.snapshot.status, DesktopServerStatus::Running);
        assert!(first.streams.is_some());

        let repeated = controller.start(false).await.expect("repeat start");
        assert_eq!(repeated.snapshot.actual_port, Some(first_port));
        assert!(repeated.streams.is_none());

        let stopped = controller.stop().await.expect("stop server");
        assert_eq!(stopped.status, DesktopServerStatus::Stopped);
        let repeated_stop = controller.stop().await.expect("repeat stop");
        assert_eq!(repeated_stop.status, DesktopServerStatus::Stopped);
    }
}
