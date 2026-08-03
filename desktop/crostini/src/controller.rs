use std::collections::HashMap;
use std::fmt;
use std::fs::File;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::State;
use axum::http::header::{
    ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
    AUTHORIZATION, CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE,
};
use axum::http::{HeaderMap, HeaderValue, Method, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use fs2::FileExt;
use ok200_core::{canonicalize_serving_root, RunningServer, ServerConfig, ServerStatus};
use semver::Version;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex, RwLock};
use tokio::task::JoinHandle;
use uuid::Uuid;

use crate::{
    CONTROLLER_PORT, CONTROLLER_PRODUCT, CONTROLLER_PROTOCOL_VERSION, PRODUCTION_EXTENSION_ID,
};

const CONFIG_SCHEMA_VERSION: u16 = 1;
const CONFIG_FILE_NAME: &str = "controller.json";
const UPDATE_STATE_SCHEMA_VERSION: u16 = 1;
const UPDATE_STATE_FILE_NAME: &str = "updates.json";
const LOCK_FILE_NAME: &str = "controller.lock";
const CONTROLLER_DIRECTORY_NAME: &str = "ok200-crostini";
const DEFAULT_CONTENT_PORT: u16 = 8080;
const MIN_CONTENT_PORT: u16 = 1024;
const CHROMEOS_SHARED_ROOT: &str = "/mnt/chromeos";
const UPDATE_SUCCESS_INTERVAL: Duration = Duration::from_hours(24);
const UPDATE_FAILURE_BACKOFF: Duration = Duration::from_hours(1);
const UPDATE_INSTALL_DELAY: Duration = Duration::from_millis(250);
const MAX_UPDATE_ERROR_CHARS: usize = 512;
const UI_SESSION_TTL: Duration = Duration::from_secs(75);
const UI_SESSION_SWEEP_INTERVAL: Duration = Duration::from_secs(5);
const LINUX_FILES_ROOT_ID: &str = "linux-files";
const SHARED_CHROMEOS_ROOT_ID: &str = "shared-chromeos";

#[derive(Debug)]
pub struct ControllerError(String);

impl ControllerError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for ControllerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for ControllerError {}

#[derive(Clone)]
pub struct ControllerOptions {
    pub config_dir: PathBuf,
    pub home_dir: PathBuf,
    pub bind_address: SocketAddr,
    shared_root: PathBuf,
    update_backend: Arc<dyn UpdateBackend>,
    automatic_update_checks: bool,
}

impl fmt::Debug for ControllerOptions {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ControllerOptions")
            .field("config_dir", &self.config_dir)
            .field("home_dir", &self.home_dir)
            .field("bind_address", &self.bind_address)
            .field("shared_root", &self.shared_root)
            .field("automatic_update_checks", &self.automatic_update_checks)
            .finish_non_exhaustive()
    }
}

impl ControllerOptions {
    pub fn system() -> Result<Self, ControllerError> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| ControllerError::new("could not determine the user config directory"))?
            .join(CONTROLLER_DIRECTORY_NAME);
        let home_dir = dirs::home_dir()
            .ok_or_else(|| ControllerError::new("could not determine the user home directory"))?;
        let update_binary = home_dir.join(".local/bin/ok200-crostini");
        Ok(Self {
            config_dir,
            home_dir,
            bind_address: SocketAddr::from(([0, 0, 0, 0], CONTROLLER_PORT)),
            shared_root: PathBuf::from(CHROMEOS_SHARED_ROOT),
            update_backend: Arc::new(SystemUpdateBackend { update_binary }),
            automatic_update_checks: true,
        })
    }
}

pub async fn reset_controller_identity(options: &ControllerOptions) -> Result<(), ControllerError> {
    prepare_private_directory(&options.config_dir).await?;
    let _lock_file = acquire_process_lock(&options.config_dir)?;
    let config_path = options.config_dir.join(CONFIG_FILE_NAME);
    let mut persisted = load_or_create_config(&config_path, &options.home_dir).await?;
    persisted.instance_id = Uuid::new_v4().simple().to_string();
    persisted.controller_token = None;
    persist_config(&config_path, &persisted).await
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct ControllerSettings {
    pub root: PathBuf,
    pub port: u16,
    pub lan: bool,
    pub directory_listing: bool,
    pub cors: bool,
    pub spa: bool,
    #[serde(default)]
    pub automatic_updates: bool,
    #[serde(default)]
    pub keep_serving_on_close: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedController {
    schema_version: u16,
    instance_id: String,
    controller_token: Option<String>,
    settings: ControllerSettings,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedUpdateState {
    schema_version: u16,
    last_attempt_unix_seconds: Option<u64>,
    last_success_unix_seconds: Option<u64>,
    available_version: Option<Version>,
    last_error: Option<String>,
}

impl Default for PersistedUpdateState {
    fn default() -> Self {
        Self {
            schema_version: UPDATE_STATE_SCHEMA_VERSION,
            last_attempt_unix_seconds: None,
            last_success_unix_seconds: None,
            available_version: None,
            last_error: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UpdatePhase {
    Idle,
    Checking,
    Installing,
}

#[derive(Debug)]
struct UpdateRuntime {
    persisted: PersistedUpdateState,
    phase: UpdatePhase,
}

trait UpdateBackend: Send + Sync {
    fn check(&self) -> Result<Option<Version>, String>;
    fn install(&self) -> Result<(), String>;
}

#[derive(Debug)]
struct SystemUpdateBackend {
    update_binary: PathBuf,
}

impl UpdateBackend for SystemUpdateBackend {
    fn check(&self) -> Result<Option<Version>, String> {
        crate::release::check_for_update()
            .map(|release| release.map(|release| release.manifest.version))
    }

    fn install(&self) -> Result<(), String> {
        if !self.update_binary.is_file() {
            return Err(format!(
                "the installed updater was not found at {}; reinstall 200 OK Linux",
                self.update_binary.display()
            ));
        }
        let unit_name = format!("app.ok200.crostini-update-{}", Uuid::new_v4().simple());
        let output = Command::new("systemd-run")
            .args([
                "--user",
                "--wait",
                "--collect",
                "--quiet",
                "--unit",
                &unit_name,
            ])
            .arg(&self.update_binary)
            .arg("update")
            .output()
            .map_err(|error| format!("could not start the detached updater: {error}"))?;
        if output.status.success() {
            return Ok(());
        }
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Err(if detail.is_empty() {
            format!("detached updater failed with {}", output.status)
        } else {
            format!("detached updater failed: {detail}")
        })
    }
}

struct ControllerState {
    config_path: PathBuf,
    update_state_path: PathBuf,
    home_dir: PathBuf,
    shared_root: PathBuf,
    controller_port: u16,
    persisted: RwLock<PersistedController>,
    claim_code: Mutex<Option<String>>,
    content_server: Mutex<Option<RunningServer>>,
    update: Mutex<UpdateRuntime>,
    ui_sessions: Mutex<HashMap<String, Instant>>,
    update_backend: Arc<dyn UpdateBackend>,
}

pub struct RunningController {
    local_addr: SocketAddr,
    state: Arc<ControllerState>,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<Result<(), std::io::Error>>>,
    update_task: Option<JoinHandle<()>>,
    session_task: Option<JoinHandle<()>>,
    _lock_file: File,
}

impl RunningController {
    pub async fn start(options: ControllerOptions) -> Result<Self, ControllerError> {
        prepare_private_directory(&options.config_dir).await?;
        let lock_file = acquire_process_lock(&options.config_dir)?;
        let config_path = options.config_dir.join(CONFIG_FILE_NAME);
        let update_state_path = options.config_dir.join(UPDATE_STATE_FILE_NAME);
        let persisted = load_or_create_config(&config_path, &options.home_dir).await?;
        let update = load_update_state(&update_state_path).await;
        let claim_code = persisted.controller_token.is_none().then(random_secret);
        let listener = TcpListener::bind(options.bind_address)
            .await
            .map_err(|error| {
                ControllerError::new(format!(
                    "could not bind controller at {}: {error}",
                    options.bind_address
                ))
            })?;
        let local_addr = listener.local_addr().map_err(|error| {
            ControllerError::new(format!("could not read controller address: {error}"))
        })?;
        let state = Arc::new(ControllerState {
            config_path,
            update_state_path,
            home_dir: options.home_dir,
            shared_root: options.shared_root,
            controller_port: local_addr.port(),
            persisted: RwLock::new(persisted),
            claim_code: Mutex::new(claim_code),
            content_server: Mutex::new(None),
            update: Mutex::new(UpdateRuntime {
                persisted: update,
                phase: UpdatePhase::Idle,
            }),
            ui_sessions: Mutex::new(HashMap::new()),
            update_backend: options.update_backend,
        });

        let app = controller_router(Arc::clone(&state));
        let (shutdown, shutdown_receiver) = oneshot::channel();
        let task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_receiver.await;
                })
                .await
        });
        let update_task = options
            .automatic_update_checks
            .then(|| tokio::spawn(automatic_update_loop(Arc::clone(&state))));
        let session_task = Some(tokio::spawn(ui_session_loop(Arc::clone(&state))));

        Ok(Self {
            local_addr,
            state,
            shutdown: Some(shutdown),
            task: Some(task),
            update_task,
            session_task,
            _lock_file: lock_file,
        })
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub async fn stop(mut self) -> Result<(), ControllerError> {
        if let Some(update_task) = self.update_task.take() {
            update_task.abort();
        }
        if let Some(session_task) = self.session_task.take() {
            session_task.abort();
        }
        let content_server = self.state.content_server.lock().await.take();
        if let Some(server) = content_server {
            server.stop().await.map_err(|error| {
                ControllerError::new(format!("could not stop content server: {error}"))
            })?;
        }
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        self.task
            .take()
            .expect("controller task must exist")
            .await
            .map_err(|error| ControllerError::new(format!("controller task failed: {error}")))?
            .map_err(|error| ControllerError::new(format!("controller failed: {error}")))
    }
}

impl Drop for RunningController {
    fn drop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        if let Some(task) = &self.task {
            if !task.is_finished() {
                task.abort();
            }
        }
        if let Some(update_task) = &self.update_task {
            if !update_task.is_finished() {
                update_task.abort();
            }
        }
        if let Some(session_task) = &self.session_task {
            if !session_task.is_finished() {
                session_task.abort();
            }
        }
    }
}

fn controller_router(state: Arc<ControllerState>) -> Router {
    let api = Router::new()
        .route("/claim", post(claim_controller))
        .route("/status", get(controller_status))
        .route("/settings", put(update_settings))
        .route("/session/open", post(open_ui_session))
        .route("/session/heartbeat", post(heartbeat_ui_session))
        .route("/session/close", post(close_ui_session))
        .route("/folders/roots", get(folder_roots))
        .route("/folders/list", post(list_folders))
        .route("/folders/create", post(create_folder))
        .route("/folders/select", post(select_folder))
        .route("/server/start", post(start_content_server))
        .route("/server/stop", post(stop_content_server))
        .route("/update/check", post(check_for_controller_update))
        .route("/update/install", post(install_controller_update))
        .fallback(api_not_found)
        .layer(middleware::from_fn(api_response_headers));

    Router::new()
        .route("/health", get(controller_health))
        .route("/launch-chromeos", get(launch_chromeos))
        .nest("/api", api)
        .with_state(state)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    product: &'static str,
    protocol_version: u16,
    instance_id: String,
    version: &'static str,
    claimed: bool,
}

async fn controller_health(State(state): State<Arc<ControllerState>>) -> Json<HealthResponse> {
    let persisted = state.persisted.read().await;
    Json(HealthResponse {
        product: CONTROLLER_PRODUCT,
        protocol_version: CONTROLLER_PROTOCOL_VERSION,
        instance_id: persisted.instance_id.clone(),
        version: env!("CARGO_PKG_VERSION"),
        claimed: persisted.controller_token.is_some(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchMessage {
    r#type: &'static str,
    instance_id: String,
    port: u16,
    claimed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    claim_code: Option<String>,
}

async fn launch_chromeos(State(state): State<Arc<ControllerState>>) -> Response {
    let persisted = state.persisted.read().await;
    let claimed = persisted.controller_token.is_some();
    let instance_id = persisted.instance_id.clone();
    drop(persisted);

    let claim_code = if claimed {
        None
    } else {
        state.claim_code.lock().await.clone()
    };
    let payload = LaunchMessage {
        r#type: "open-linux-controller",
        instance_id,
        port: state.controller_port,
        claimed,
        claim_code,
    };
    let payload = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_owned());
    let html = format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Opening 200 OK</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem;color:#172033">
  <h1 style="font-size:1.3rem">Opening 200 OK…</h1>
  <p id="status">Connecting to the Chrome extension.</p>
  <script>
    const status = document.getElementById("status");
    try {{
      chrome.runtime.sendMessage("{PRODUCTION_EXTENSION_ID}", {payload}, (response) => {{
        const error = chrome.runtime.lastError;
        if (error || !response?.accepted) {{
          status.textContent = "Could not open the 200 OK extension. Open Chrome and click the 200 OK extension icon, then try again.";
        }} else {{
          status.textContent = "200 OK opened. You can close this page.";
        }}
      }});
    }} catch (error) {{
      status.textContent = "Could not contact the 200 OK extension. Open it from Chrome, then try again.";
    }}
  </script>
</body>
</html>"#
    );
    let mut response = Html(html).into_response();
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
        ),
    );
    response
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClaimRequest {
    instance_id: String,
    claim_code: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaimResponse {
    controller_token: String,
}

async fn claim_controller(
    State(state): State<Arc<ControllerState>>,
    Json(request): Json<ClaimRequest>,
) -> ApiResult<Json<ClaimResponse>> {
    let mut persisted = state.persisted.write().await;
    if request.instance_id != persisted.instance_id {
        return Err(ApiError::forbidden("controller instance does not match"));
    }
    if persisted.controller_token.is_some() {
        return Err(ApiError::conflict("controller is already claimed"));
    }

    let mut claim_code = state.claim_code.lock().await;
    let expected = claim_code
        .as_deref()
        .ok_or_else(|| ApiError::forbidden("controller claim is unavailable"))?;
    if !constant_time_equal(expected, &request.claim_code) {
        return Err(ApiError::forbidden("controller claim code is invalid"));
    }

    let controller_token = random_secret();
    persisted.controller_token = Some(controller_token.clone());
    persist_config(&state.config_path, &persisted)
        .await
        .map_err(|error| ApiError::internal(error.to_string()))?;
    *claim_code = None;
    Ok(Json(ClaimResponse { controller_token }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusResponse {
    product: &'static str,
    protocol_version: u16,
    instance_id: String,
    version: &'static str,
    settings: ControllerSettings,
    server: ContentServerStatus,
    update: ControllerUpdateStatus,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentServerStatus {
    state: &'static str,
    url: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ControllerUpdateStatus {
    state: &'static str,
    available_version: Option<Version>,
    last_checked_at: Option<u64>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UiSessionRequest {
    session_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiSessionResponse {
    session_id: String,
    expires_in_seconds: u64,
    status: StatusResponse,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderRootsResponse {
    roots: Vec<FolderRootResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderRootResponse {
    id: &'static str,
    name: &'static str,
    available: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FolderRequest {
    root_id: String,
    #[serde(default)]
    path: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateFolderRequest {
    root_id: String,
    #[serde(default)]
    path: Vec<String>,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderListingResponse {
    root_id: String,
    root_name: &'static str,
    path: Vec<String>,
    display_path: String,
    can_select: bool,
    entries: Vec<FolderEntryResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderEntryResponse {
    name: String,
}

async fn controller_status(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    Ok(Json(build_status(&state).await))
}

async fn open_ui_session(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<UiSessionResponse>> {
    authorize(&state, &headers).await?;
    let session_id = random_secret();
    state
        .ui_sessions
        .lock()
        .await
        .insert(session_id.clone(), Instant::now());
    Ok(Json(UiSessionResponse {
        session_id,
        expires_in_seconds: UI_SESSION_TTL.as_secs(),
        status: build_status(&state).await,
    }))
}

async fn heartbeat_ui_session(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
    Json(request): Json<UiSessionRequest>,
) -> ApiResult<Json<UiSessionResponse>> {
    authorize(&state, &headers).await?;
    let mut sessions = state.ui_sessions.lock().await;
    if sessions
        .get(&request.session_id)
        .is_some_and(|last_seen| last_seen.elapsed() > UI_SESSION_TTL)
    {
        sessions.remove(&request.session_id);
    }
    let last_seen = sessions
        .get_mut(&request.session_id)
        .ok_or_else(|| ApiError::conflict("control session expired; reconnect to 200 OK"))?;
    *last_seen = Instant::now();
    drop(sessions);
    Ok(Json(UiSessionResponse {
        session_id: request.session_id,
        expires_in_seconds: UI_SESSION_TTL.as_secs(),
        status: build_status(&state).await,
    }))
}

async fn close_ui_session(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
    Json(request): Json<UiSessionRequest>,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    state.ui_sessions.lock().await.remove(&request.session_id);
    stop_content_if_unattended(&state).await?;
    Ok(Json(build_status(&state).await))
}

async fn folder_roots(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<FolderRootsResponse>> {
    authorize(&state, &headers).await?;
    Ok(Json(FolderRootsResponse {
        roots: vec![
            FolderRootResponse {
                id: LINUX_FILES_ROOT_ID,
                name: "Linux files",
                available: directory_exists(&state.home_dir).await,
            },
            FolderRootResponse {
                id: SHARED_CHROMEOS_ROOT_ID,
                name: "Shared Chromebook folders",
                available: directory_exists(&state.shared_root).await,
            },
        ],
    }))
}

async fn list_folders(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
    Json(request): Json<FolderRequest>,
) -> ApiResult<Json<FolderListingResponse>> {
    authorize(&state, &headers).await?;
    Ok(Json(build_folder_listing(&state, &request).await?))
}

async fn create_folder(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
    Json(request): Json<CreateFolderRequest>,
) -> ApiResult<Json<FolderListingResponse>> {
    authorize(&state, &headers).await?;
    validate_path_component(&request.name)?;
    let parent_request = FolderRequest {
        root_id: request.root_id,
        path: request.path,
    };
    let parent = resolve_folder(&state, &parent_request, true).await?;
    let created = parent.join(&request.name);
    tokio::fs::create_dir(&created).await.map_err(|error| {
        ApiError::conflict(format!(
            "could not create folder '{}': {error}",
            request.name
        ))
    })?;
    let canonical_created = tokio::fs::canonicalize(&created)
        .await
        .map_err(|error| ApiError::internal(format!("could not verify new folder: {error}")))?;
    if canonical_created.parent() != Some(parent.as_path()) {
        return Err(ApiError::bad_request(
            "the new folder resolved outside its selected parent",
        ));
    }
    Ok(Json(build_folder_listing(&state, &parent_request).await?))
}

async fn select_folder(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
    Json(request): Json<FolderRequest>,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    if request.path.is_empty() {
        return Err(ApiError::bad_request(
            "choose a folder inside this location",
        ));
    }
    let content_server = state.content_server.lock().await;
    if content_server.is_some() {
        return Err(ApiError::conflict(
            "stop the content server before changing folders",
        ));
    }
    let root = resolve_folder(&state, &request, false).await?;
    let root = validate_serving_root(&state.home_dir, &state.shared_root, &root)
        .await
        .map_err(ApiError::bad_request)?;
    let mut persisted = state.persisted.write().await;
    persisted.settings.root = root;
    persist_config(&state.config_path, &persisted)
        .await
        .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(persisted);
    drop(content_server);
    Ok(Json(build_status(&state).await))
}

async fn build_status(state: &ControllerState) -> StatusResponse {
    let persisted = state.persisted.read().await.clone();
    let server = state.content_server.lock().await;
    let content_status = server.as_ref().map_or(
        ContentServerStatus {
            state: "stopped",
            url: None,
            error: None,
        },
        |server| match server.status() {
            ServerStatus::Running => ContentServerStatus {
                state: "running",
                url: Some(format!("http://localhost:{}", server.local_addr().port())),
                error: None,
            },
            ServerStatus::Stopping => ContentServerStatus {
                state: "stopping",
                url: None,
                error: None,
            },
            ServerStatus::Stopped => ContentServerStatus {
                state: "stopped",
                url: None,
                error: None,
            },
            ServerStatus::Failed(error) => ContentServerStatus {
                state: "error",
                url: None,
                error: Some(error),
            },
        },
    );
    let update = state.update.lock().await;
    let update_state = match update.phase {
        UpdatePhase::Checking => "checking",
        UpdatePhase::Installing => "installing",
        UpdatePhase::Idle if update.persisted.available_version.is_some() => "available",
        UpdatePhase::Idle if update.persisted.last_error.is_some() => "error",
        UpdatePhase::Idle => "current",
    };
    StatusResponse {
        product: CONTROLLER_PRODUCT,
        protocol_version: CONTROLLER_PROTOCOL_VERSION,
        instance_id: persisted.instance_id,
        version: env!("CARGO_PKG_VERSION"),
        settings: persisted.settings,
        server: content_status,
        update: ControllerUpdateStatus {
            state: update_state,
            available_version: update.persisted.available_version.clone(),
            last_checked_at: update.persisted.last_success_unix_seconds,
            error: update.persisted.last_error.clone(),
        },
    }
}

async fn update_settings(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
    Json(settings): Json<ControllerSettings>,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    let content_server = state.content_server.lock().await;
    if content_server.is_some() {
        return Err(ApiError::conflict(
            "stop the content server before changing settings",
        ));
    }
    validate_content_port(settings.port)?;
    let mut settings = settings;
    settings.root = validate_serving_root(&state.home_dir, &state.shared_root, &settings.root)
        .await
        .map_err(ApiError::bad_request)?;

    let mut persisted = state.persisted.write().await;
    persisted.settings = settings;
    persist_config(&state.config_path, &persisted)
        .await
        .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(persisted);
    drop(content_server);
    stop_content_if_unattended(&state).await?;
    maybe_install_available_update(Arc::clone(&state));
    Ok(Json(build_status(&state).await))
}

async fn start_content_server(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
    Json(request): Json<UiSessionRequest>,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    require_active_ui_session(&state, &request.session_id).await?;
    let mut content_server = state.content_server.lock().await;
    if content_server.is_some() {
        return Err(ApiError::conflict("content server is already active"));
    }
    let settings = state.persisted.read().await.settings.clone();
    validate_content_port(settings.port)?;
    let canonical_root = validate_serving_root(&state.home_dir, &state.shared_root, &settings.root)
        .await
        .map_err(ApiError::bad_request)?;

    let mut config = ServerConfig::new(canonical_root);
    config.host = if settings.lan {
        IpAddr::V4(Ipv4Addr::UNSPECIFIED)
    } else {
        IpAddr::V4(Ipv4Addr::LOCALHOST)
    };
    config.port = settings.port;
    config.directory_listing = settings.directory_listing;
    config.cors = settings.cors;
    config.spa = settings.spa;
    let server = RunningServer::start(config)
        .await
        .map_err(|error| ApiError::conflict(error.to_string()))?;
    *content_server = Some(server);
    drop(content_server);
    Ok(Json(build_status(&state).await))
}

async fn stop_content_server(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    let server = state
        .content_server
        .lock()
        .await
        .take()
        .ok_or_else(|| ApiError::conflict("content server is already stopped"))?;
    server
        .stop()
        .await
        .map_err(|error| ApiError::internal(error.to_string()))?;
    maybe_install_available_update(Arc::clone(&state));
    Ok(Json(build_status(&state).await))
}

async fn check_for_controller_update(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    run_update_check(&state).await?;
    maybe_install_available_update(Arc::clone(&state));
    Ok(Json(build_status(&state).await))
}

async fn install_controller_update(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    if state.content_server.lock().await.is_some() {
        return Err(ApiError::conflict(
            "stop the content server before installing an update",
        ));
    }
    {
        let mut update = state.update.lock().await;
        if update.phase != UpdatePhase::Idle {
            return Err(ApiError::conflict(
                "an update check or installation is already active",
            ));
        }
        if update.persisted.available_version.is_none() {
            drop(update);
            run_update_check(&state).await?;
            update = state.update.lock().await;
        }
        if update.persisted.available_version.is_none() {
            drop(update);
            return Ok(Json(build_status(&state).await));
        }
        update.phase = UpdatePhase::Installing;
    }
    spawn_update_install(Arc::clone(&state));
    Ok(Json(build_status(&state).await))
}

async fn automatic_update_loop(state: Arc<ControllerState>) {
    loop {
        let delay = next_update_check_delay(&state).await;
        tokio::time::sleep(delay).await;
        let _ = run_update_check(&state).await;
        maybe_install_available_update(Arc::clone(&state));
    }
}

async fn next_update_check_delay(state: &ControllerState) -> Duration {
    let now = unix_time_seconds();
    let update = state.update.lock().await;
    let interval = if update.persisted.last_error.is_some() {
        UPDATE_FAILURE_BACKOFF
    } else {
        UPDATE_SUCCESS_INTERVAL
    };
    update
        .persisted
        .last_attempt_unix_seconds
        .and_then(|attempt| interval.checked_sub(Duration::from_secs(now.saturating_sub(attempt))))
        .unwrap_or(Duration::ZERO)
}

async fn run_update_check(state: &Arc<ControllerState>) -> ApiResult<()> {
    {
        let mut update = state.update.lock().await;
        if update.phase != UpdatePhase::Idle {
            return Err(ApiError::conflict(
                "an update check or installation is already active",
            ));
        }
        update.phase = UpdatePhase::Checking;
        update.persisted.last_attempt_unix_seconds = Some(unix_time_seconds());
        if let Err(error) = persist_update_state(&state.update_state_path, &update.persisted).await
        {
            update.phase = UpdatePhase::Idle;
            return Err(ApiError::internal(error.to_string()));
        }
    }

    let backend = Arc::clone(&state.update_backend);
    let result = tokio::task::spawn_blocking(move || backend.check())
        .await
        .map_err(|error| ApiError::internal(format!("update check task failed: {error}")))?;
    let now = unix_time_seconds();
    let mut update = state.update.lock().await;
    update.phase = UpdatePhase::Idle;
    match result {
        Ok(available_version) => {
            update.persisted.last_success_unix_seconds = Some(now);
            update.persisted.available_version = available_version;
            update.persisted.last_error = None;
        }
        Err(error) => {
            update.persisted.available_version = None;
            update.persisted.last_error = Some(bounded_update_error(&error));
        }
    }
    persist_update_state(&state.update_state_path, &update.persisted)
        .await
        .map_err(|error| ApiError::internal(error.to_string()))?;
    Ok(())
}

fn maybe_install_available_update(state: Arc<ControllerState>) {
    tokio::spawn(async move {
        let automatic_updates = state.persisted.read().await.settings.automatic_updates;
        if !automatic_updates || state.content_server.lock().await.is_some() {
            return;
        }
        let mut update = state.update.lock().await;
        if update.phase != UpdatePhase::Idle || update.persisted.available_version.is_none() {
            return;
        }
        update.phase = UpdatePhase::Installing;
        drop(update);
        spawn_update_install(state);
    });
}

fn spawn_update_install(state: Arc<ControllerState>) {
    tokio::spawn(async move {
        tokio::time::sleep(UPDATE_INSTALL_DELAY).await;
        let backend = Arc::clone(&state.update_backend);
        let result = tokio::task::spawn_blocking(move || backend.install()).await;
        let failure = match result {
            Ok(Ok(())) => None,
            Ok(Err(error)) => Some(error),
            Err(error) => Some(format!("update installation task failed: {error}")),
        };
        let mut update = state.update.lock().await;
        update.phase = UpdatePhase::Idle;
        if let Some(error) = failure {
            update.persisted.last_error = Some(bounded_update_error(&error));
        } else {
            update.persisted.available_version = None;
            update.persisted.last_error = None;
        }
        let _ = persist_update_state(&state.update_state_path, &update.persisted).await;
    });
}

fn unix_time_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs()
}

fn bounded_update_error(error: &str) -> String {
    error.chars().take(MAX_UPDATE_ERROR_CHARS).collect()
}

async fn ui_session_loop(state: Arc<ControllerState>) {
    loop {
        tokio::time::sleep(UI_SESSION_SWEEP_INTERVAL).await;
        {
            let mut sessions = state.ui_sessions.lock().await;
            sessions.retain(|_, last_seen| last_seen.elapsed() <= UI_SESSION_TTL);
        }
        let _ = stop_content_if_unattended(&state).await;
    }
}

async fn require_active_ui_session(state: &ControllerState, session_id: &str) -> ApiResult<()> {
    let mut sessions = state.ui_sessions.lock().await;
    let active = sessions
        .get(session_id)
        .is_some_and(|last_seen| last_seen.elapsed() <= UI_SESSION_TTL);
    if active {
        return Ok(());
    }
    sessions.remove(session_id);
    Err(ApiError::conflict(
        "control session expired; reconnect to 200 OK",
    ))
}

async fn stop_content_if_unattended(state: &Arc<ControllerState>) -> ApiResult<()> {
    let sessions = state.ui_sessions.lock().await;
    if !sessions.is_empty() {
        return Ok(());
    }
    let mut content_server = state.content_server.lock().await;
    if state.persisted.read().await.settings.keep_serving_on_close {
        return Ok(());
    }
    let server = content_server.take();
    drop(content_server);
    drop(sessions);
    if let Some(server) = server {
        server
            .stop()
            .await
            .map_err(|error| ApiError::internal(error.to_string()))?;
        maybe_install_available_update(Arc::clone(state));
    }
    Ok(())
}

async fn directory_exists(path: &Path) -> bool {
    tokio::fs::metadata(path)
        .await
        .is_ok_and(|metadata| metadata.is_dir())
}

fn folder_root(state: &ControllerState, root_id: &str) -> ApiResult<(&'static str, PathBuf)> {
    match root_id {
        LINUX_FILES_ROOT_ID => Ok(("Linux files", state.home_dir.clone())),
        SHARED_CHROMEOS_ROOT_ID => Ok(("Shared Chromebook folders", state.shared_root.clone())),
        _ => Err(ApiError::bad_request("unknown folder location")),
    }
}

fn validate_path_component(component: &str) -> ApiResult<()> {
    if component.is_empty()
        || component == "."
        || component == ".."
        || component.contains('/')
        || component.contains('\0')
    {
        return Err(ApiError::bad_request("folder name is invalid"));
    }
    Ok(())
}

async fn resolve_folder(
    state: &ControllerState,
    request: &FolderRequest,
    allow_root: bool,
) -> ApiResult<PathBuf> {
    let (root_name, root) = folder_root(state, &request.root_id)?;
    for component in &request.path {
        validate_path_component(component)?;
    }
    let canonical_root = tokio::fs::canonicalize(&root).await.map_err(|error| {
        if request.root_id == SHARED_CHROMEOS_ROOT_ID {
            ApiError::not_found(
                "No shared Chromebook folders are available yet. Share a folder with Linux in Files, then try again.",
            )
        } else {
            ApiError::internal(format!("could not open {root_name}: {error}"))
        }
    })?;
    let target = request
        .path
        .iter()
        .fold(canonical_root.clone(), |path, component| {
            path.join(component)
        });
    let canonical_target = tokio::fs::canonicalize(&target)
        .await
        .map_err(|error| ApiError::not_found(format!("folder is no longer available: {error}")))?;
    if !canonical_target.starts_with(&canonical_root)
        || (!allow_root && canonical_target == canonical_root)
    {
        return Err(ApiError::bad_request(
            "folder resolved outside the selected location",
        ));
    }
    let metadata = tokio::fs::metadata(&canonical_target)
        .await
        .map_err(|error| ApiError::not_found(format!("folder is no longer available: {error}")))?;
    if !metadata.is_dir() {
        return Err(ApiError::bad_request("selected entry is not a folder"));
    }
    Ok(canonical_target)
}

async fn build_folder_listing(
    state: &ControllerState,
    request: &FolderRequest,
) -> ApiResult<FolderListingResponse> {
    let (root_name, _) = folder_root(state, &request.root_id)?;
    let folder = resolve_folder(state, request, true).await?;
    let mut directory = tokio::fs::read_dir(&folder)
        .await
        .map_err(|error| ApiError::forbidden(format!("could not read folder: {error}")))?;
    let mut entries = Vec::new();
    while let Some(entry) = directory
        .next_entry()
        .await
        .map_err(|error| ApiError::internal(format!("could not read folder entry: {error}")))?
    {
        let file_type = entry.file_type().await.map_err(|error| {
            ApiError::internal(format!("could not inspect folder entry: {error}"))
        })?;
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if validate_path_component(&name).is_ok() {
            entries.push(FolderEntryResponse { name });
        }
    }
    entries.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.name.cmp(&right.name))
    });
    let display_path = if request.path.is_empty() {
        root_name.to_owned()
    } else {
        format!("{root_name} / {}", request.path.join(" / "))
    };
    Ok(FolderListingResponse {
        root_id: request.root_id.clone(),
        root_name,
        path: request.path.clone(),
        display_path,
        can_select: !request.path.is_empty(),
        entries,
    })
}

fn validate_content_port(port: u16) -> ApiResult<()> {
    if port < MIN_CONTENT_PORT {
        return Err(ApiError::bad_request(format!(
            "content port must be between {MIN_CONTENT_PORT} and 65535"
        )));
    }
    if port == CONTROLLER_PORT {
        return Err(ApiError::bad_request(
            "content port must not use the controller port",
        ));
    }
    Ok(())
}

async fn validate_serving_root(
    home_dir: &Path,
    shared_root: &Path,
    root: &Path,
) -> Result<PathBuf, String> {
    let canonical_root = canonicalize_serving_root(root)
        .await
        .map_err(|error| error.to_string())?;
    let canonical_home = tokio::fs::canonicalize(home_dir)
        .await
        .map_err(|error| format!("could not validate home directory: {error}"))?;
    let canonical_shared = tokio::fs::canonicalize(shared_root).await.ok();
    let is_home_child =
        canonical_root.starts_with(&canonical_home) && canonical_root != canonical_home;
    let is_shared_child = canonical_shared
        .as_ref()
        .is_some_and(|shared| canonical_root.starts_with(shared) && canonical_root != *shared);
    if !is_home_child && !is_shared_child {
        return Err(format!(
            "serve root must be inside {} or a ChromeOS folder shared under {}",
            canonical_home.display(),
            shared_root.display()
        ));
    }
    Ok(canonical_root)
}

async fn authorize(state: &ControllerState, headers: &HeaderMap) -> ApiResult<()> {
    let supplied = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(|| ApiError::unauthorized("controller token is required"))?;
    let persisted = state.persisted.read().await;
    let expected = persisted
        .controller_token
        .as_deref()
        .ok_or_else(|| ApiError::unauthorized("controller has not been claimed"))?;
    if !constant_time_equal(expected, supplied) {
        return Err(ApiError::unauthorized("controller token is invalid"));
    }
    Ok(())
}

fn constant_time_equal(expected: &str, supplied: &str) -> bool {
    expected.len() == supplied.len() && bool::from(expected.as_bytes().ct_eq(supplied.as_bytes()))
}

async fn api_response_headers(request: Request<Body>, next: Next) -> Response {
    let mut response = if request.method() == Method::OPTIONS {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(request).await
    };
    response.headers_mut().insert(
        ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("chrome-extension://lpkjdhnmgkhaabhimpdinmdgejoaejic"),
    );
    response.headers_mut().insert(
        ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST, PUT, OPTIONS"),
    );
    response.headers_mut().insert(
        ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Authorization, Content-Type"),
    );
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

async fn api_not_found() -> ApiError {
    ApiError::not_found("controller API route was not found")
}

type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }

    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

#[derive(Serialize)]
struct ErrorResponse<'a> {
    error: &'a str,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (
            self.status,
            Json(ErrorResponse {
                error: &self.message,
            }),
        )
            .into_response();
        response
            .headers_mut()
            .insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        response
    }
}

async fn prepare_private_directory(directory: &Path) -> Result<(), ControllerError> {
    tokio::fs::create_dir_all(directory)
        .await
        .map_err(|error| {
            ControllerError::new(format!(
                "could not create controller directory {}: {error}",
                directory.display()
            ))
        })?;
    set_private_directory_permissions(directory)?;
    Ok(())
}

fn acquire_process_lock(config_dir: &Path) -> Result<File, ControllerError> {
    let path = config_dir.join(LOCK_FILE_NAME);
    let file = File::options()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(&path)
        .map_err(|error| {
            ControllerError::new(format!(
                "could not open controller lock {}: {error}",
                path.display()
            ))
        })?;
    file.try_lock_exclusive().map_err(|error| {
        ControllerError::new(format!(
            "another controller already owns {}: {error}",
            path.display()
        ))
    })?;
    Ok(file)
}

async fn load_or_create_config(
    config_path: &Path,
    home_dir: &Path,
) -> Result<PersistedController, ControllerError> {
    match tokio::fs::read(config_path).await {
        Ok(bytes) => {
            let persisted: PersistedController =
                serde_json::from_slice(&bytes).map_err(|error| {
                    ControllerError::new(format!(
                        "controller config {} is invalid: {error}",
                        config_path.display()
                    ))
                })?;
            validate_persisted_config(&persisted)?;
            Ok(persisted)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let root = home_dir.join("Downloads").join("200 OK");
            tokio::fs::create_dir_all(&root).await.map_err(|error| {
                ControllerError::new(format!(
                    "could not create the default serve folder {}: {error}",
                    root.display()
                ))
            })?;
            let persisted = PersistedController {
                schema_version: CONFIG_SCHEMA_VERSION,
                instance_id: Uuid::new_v4().simple().to_string(),
                controller_token: None,
                settings: ControllerSettings {
                    root,
                    port: DEFAULT_CONTENT_PORT,
                    lan: false,
                    directory_listing: true,
                    cors: false,
                    spa: false,
                    automatic_updates: false,
                    keep_serving_on_close: false,
                },
            };
            persist_config(config_path, &persisted).await?;
            Ok(persisted)
        }
        Err(error) => Err(ControllerError::new(format!(
            "could not read controller config {}: {error}",
            config_path.display()
        ))),
    }
}

fn validate_persisted_config(persisted: &PersistedController) -> Result<(), ControllerError> {
    if persisted.schema_version != CONFIG_SCHEMA_VERSION {
        return Err(ControllerError::new(format!(
            "unsupported controller config schema {}",
            persisted.schema_version
        )));
    }
    if !valid_identifier(&persisted.instance_id) {
        return Err(ControllerError::new(
            "controller config contains an invalid instance identifier",
        ));
    }
    if persisted
        .controller_token
        .as_deref()
        .is_some_and(|token| !valid_secret(token))
    {
        return Err(ControllerError::new(
            "controller config contains an invalid token",
        ));
    }
    validate_content_port(persisted.settings.port)
        .map_err(|error| ControllerError::new(error.message))?;
    Ok(())
}

async fn persist_config(
    config_path: &Path,
    persisted: &PersistedController,
) -> Result<(), ControllerError> {
    let bytes = serde_json::to_vec_pretty(persisted)
        .map_err(|error| ControllerError::new(format!("could not encode config: {error}")))?;
    let temp_path = config_path.with_extension(format!("tmp-{}", Uuid::new_v4().simple()));
    tokio::fs::write(&temp_path, bytes).await.map_err(|error| {
        ControllerError::new(format!(
            "could not write controller config {}: {error}",
            temp_path.display()
        ))
    })?;
    set_private_file_permissions(&temp_path)?;
    tokio::fs::rename(&temp_path, config_path)
        .await
        .map_err(|error| {
            ControllerError::new(format!(
                "could not replace controller config {}: {error}",
                config_path.display()
            ))
        })
}

async fn load_update_state(update_state_path: &Path) -> PersistedUpdateState {
    let current = Version::parse(env!("CARGO_PKG_VERSION")).expect("package version must be valid");
    match tokio::fs::read(update_state_path).await {
        Ok(bytes) => match serde_json::from_slice::<PersistedUpdateState>(&bytes) {
            Ok(mut persisted) if persisted.schema_version == UPDATE_STATE_SCHEMA_VERSION => {
                if persisted
                    .available_version
                    .as_ref()
                    .is_some_and(|available| available <= &current)
                {
                    persisted.available_version = None;
                    persisted.last_error = None;
                }
                persisted
            }
            Ok(persisted) => PersistedUpdateState {
                last_error: Some(format!(
                    "update state uses unsupported schema {}; checks will retry safely",
                    persisted.schema_version
                )),
                ..PersistedUpdateState::default()
            },
            Err(error) => PersistedUpdateState {
                last_error: Some(bounded_update_error(&format!(
                    "update state is invalid; checks will retry safely: {error}"
                ))),
                ..PersistedUpdateState::default()
            },
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            PersistedUpdateState::default()
        }
        Err(error) => PersistedUpdateState {
            last_error: Some(bounded_update_error(&format!(
                "could not read update state; checks will retry safely: {error}"
            ))),
            ..PersistedUpdateState::default()
        },
    }
}

async fn persist_update_state(
    update_state_path: &Path,
    persisted: &PersistedUpdateState,
) -> Result<(), ControllerError> {
    let bytes = serde_json::to_vec_pretty(persisted)
        .map_err(|error| ControllerError::new(format!("could not encode update state: {error}")))?;
    let temp_path = update_state_path.with_extension(format!("tmp-{}", Uuid::new_v4().simple()));
    tokio::fs::write(&temp_path, bytes).await.map_err(|error| {
        ControllerError::new(format!(
            "could not write update state {}: {error}",
            temp_path.display()
        ))
    })?;
    set_private_file_permissions(&temp_path)?;
    tokio::fs::rename(&temp_path, update_state_path)
        .await
        .map_err(|error| {
            ControllerError::new(format!(
                "could not replace update state {}: {error}",
                update_state_path.display()
            ))
        })
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn valid_secret(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn random_secret() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), ControllerError> {
    use std::os::unix::fs::PermissionsExt;

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).map_err(|error| {
        ControllerError::new(format!(
            "could not secure controller directory {}: {error}",
            path.display()
        ))
    })
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), ControllerError> {
    Ok(())
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> Result<(), ControllerError> {
    use std::os::unix::fs::PermissionsExt;

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(|error| {
        ControllerError::new(format!(
            "could not secure controller file {}: {error}",
            path.display()
        ))
    })
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &Path) -> Result<(), ControllerError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex as StdMutex;

    use tempfile::TempDir;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    struct FixtureUpdateBackend {
        check_result: StdMutex<Result<Option<Version>, String>>,
        install_result: StdMutex<Result<(), String>>,
        install_calls: AtomicUsize,
    }

    impl FixtureUpdateBackend {
        fn current() -> Arc<Self> {
            Arc::new(Self {
                check_result: StdMutex::new(Ok(None)),
                install_result: StdMutex::new(Ok(())),
                install_calls: AtomicUsize::new(0),
            })
        }

        fn available(version: &str) -> Arc<Self> {
            Arc::new(Self {
                check_result: StdMutex::new(Ok(Some(
                    Version::parse(version).expect("fixture version"),
                ))),
                install_result: StdMutex::new(Ok(())),
                install_calls: AtomicUsize::new(0),
            })
        }
    }

    impl UpdateBackend for FixtureUpdateBackend {
        fn check(&self) -> Result<Option<Version>, String> {
            self.check_result.lock().expect("check result").clone()
        }

        fn install(&self) -> Result<(), String> {
            self.install_calls.fetch_add(1, Ordering::SeqCst);
            self.install_result.lock().expect("install result").clone()
        }
    }

    async fn fixture() -> (TempDir, RunningController) {
        let backend = FixtureUpdateBackend::current();
        let (temp, controller) = fixture_with_backend(backend).await;
        (temp, controller)
    }

    async fn fixture_with_backend(
        backend: Arc<FixtureUpdateBackend>,
    ) -> (TempDir, RunningController) {
        let temp = tempfile::tempdir().expect("temp dir");
        let home = temp.path().join("home");
        tokio::fs::create_dir_all(&home).await.expect("home");
        let controller = RunningController::start(ControllerOptions {
            config_dir: temp.path().join("config"),
            home_dir: home,
            bind_address: SocketAddr::from(([127, 0, 0, 1], 0)),
            shared_root: temp.path().join("shared"),
            update_backend: backend,
            automatic_update_checks: false,
        })
        .await
        .expect("controller");
        (temp, controller)
    }

    async fn request(address: SocketAddr, request: &str) -> (u16, HeaderMap, Vec<u8>) {
        let mut stream = tokio::net::TcpStream::connect(address)
            .await
            .expect("connect");
        stream.write_all(request.as_bytes()).await.expect("write");
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.expect("read");
        let header_end = response
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .expect("headers");
        let header_text = std::str::from_utf8(&response[..header_end]).expect("utf8");
        let status = header_text
            .lines()
            .next()
            .and_then(|line| line.split_ascii_whitespace().nth(1))
            .expect("status")
            .parse()
            .expect("status number");
        let mut headers = HeaderMap::new();
        for line in header_text.lines().skip(1) {
            let Some((name, value)) = line.split_once(':') else {
                continue;
            };
            headers.insert(
                name.parse::<axum::http::HeaderName>().expect("header name"),
                value.trim().parse().expect("header value"),
            );
        }
        (status, headers, response[header_end + 4..].to_vec())
    }

    async fn claim(address: SocketAddr) -> String {
        let launch =
            "GET /launch-chromeos HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        let (_, _, body) = request(address, launch).await;
        let html = String::from_utf8(body).expect("launch html");
        let payload_start = html.find("{\"type\"").expect("payload start");
        let payload_end = html[payload_start..]
            .find("}, (response)")
            .map(|offset| payload_start + offset + 1)
            .expect("payload end");
        let payload: serde_json::Value =
            serde_json::from_str(&html[payload_start..payload_end]).expect("payload");
        assert_eq!(payload["port"], address.port());
        let claim_body = serde_json::json!({
            "instanceId": payload["instanceId"],
            "claimCode": payload["claimCode"],
        })
        .to_string();
        let claim_request = format!(
            "POST /api/claim HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            claim_body.len(), claim_body
        );
        let (status, headers, body) = request(address, &claim_request).await;
        assert_eq!(status, 200);
        assert_eq!(
            headers.get(ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static(
                "chrome-extension://lpkjdhnmgkhaabhimpdinmdgejoaejic"
            ))
        );
        let claim: serde_json::Value = serde_json::from_slice(&body).expect("claim json");
        claim["controllerToken"].as_str().expect("token").to_owned()
    }

    async fn open_session(address: SocketAddr, token: &str) -> String {
        let session_request = format!(
            "POST /api/session/open HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        let (status, _, body) = request(address, &session_request).await;
        assert_eq!(status, 200);
        let response: serde_json::Value =
            serde_json::from_slice(&body).expect("session response json");
        response["sessionId"]
            .as_str()
            .expect("session id")
            .to_owned()
    }

    #[tokio::test]
    async fn creates_private_config_and_public_health() {
        let (temp, controller) = fixture().await;
        let health_request = "GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        let (status, _, body) = request(controller.local_addr(), health_request).await;
        let health: serde_json::Value = serde_json::from_slice(&body).expect("health json");

        assert_eq!(status, 200);
        assert_eq!(health["product"], CONTROLLER_PRODUCT);
        assert_eq!(health["protocolVersion"], CONTROLLER_PROTOCOL_VERSION);
        assert_eq!(health["claimed"], false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            assert_eq!(
                std::fs::metadata(temp.path().join("config/controller.json"))
                    .expect("config metadata")
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        controller.stop().await.expect("stop");
    }

    #[tokio::test]
    async fn claim_enables_authenticated_status_and_rejects_bad_tokens() {
        let (_temp, controller) = fixture().await;
        let token = claim(controller.local_addr()).await;
        assert!(valid_secret(&token));

        let unauthorized = "GET /api/status HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer wrong\r\nConnection: close\r\n\r\n";
        assert_eq!(request(controller.local_addr(), unauthorized).await.0, 401);
        let authorized = format!(
            "GET /api/status HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"
        );
        let (status, _, body) = request(controller.local_addr(), &authorized).await;
        let status_body: serde_json::Value = serde_json::from_slice(&body).expect("status json");
        assert_eq!(status, 200);
        assert_eq!(status_body["server"]["state"], "stopped");
        controller.stop().await.expect("stop");
    }

    #[tokio::test]
    async fn authenticated_api_configures_starts_serves_and_stops_content() {
        let (temp, controller) = fixture().await;
        let address = controller.local_addr();
        let token = claim(address).await;
        let session_id = open_session(address, &token).await;
        let root = temp.path().join("home/Downloads/200 OK");
        tokio::fs::write(root.join("hello.txt"), b"controller fixture")
            .await
            .expect("fixture file");
        let available = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .expect("ephemeral listener")
            .local_addr()
            .expect("ephemeral address")
            .port();
        let settings = serde_json::json!({
            "root": root,
            "port": available,
            "lan": false,
            "directoryListing": true,
            "cors": false,
            "spa": false,
        })
        .to_string();
        let update = format!(
            "PUT /api/settings HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{settings}",
            settings.len()
        );
        assert_eq!(request(address, &update).await.0, 200);

        let start_body = serde_json::json!({ "sessionId": session_id }).to_string();
        let start = format!(
            "POST /api/server/start HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{start_body}",
            start_body.len()
        );
        let (status, _, body) = request(address, &start).await;
        let started: serde_json::Value = serde_json::from_slice(&body).expect("start json");
        assert_eq!(status, 200);
        assert_eq!(started["server"]["state"], "running");
        assert_eq!(
            started["server"]["url"],
            format!("http://localhost:{available}")
        );

        let content = "GET /hello.txt HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        let (status, _, body) =
            request(SocketAddr::from((Ipv4Addr::LOCALHOST, available)), content).await;
        assert_eq!(status, 200);
        assert_eq!(body, b"controller fixture");

        let stop = format!(
            "POST /api/server/stop HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        let (status, _, body) = request(address, &stop).await;
        let stopped: serde_json::Value = serde_json::from_slice(&body).expect("stop json");
        assert_eq!(status, 200);
        assert_eq!(stopped["server"]["state"], "stopped");
        controller.stop().await.expect("stop controller");
    }

    #[tokio::test]
    async fn folder_api_browses_creates_and_selects_confined_directories() {
        let (temp, controller) = fixture().await;
        let address = controller.local_addr();
        let token = claim(address).await;
        let roots = format!(
            "GET /api/folders/roots HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"
        );
        let (status, _, body) = request(address, &roots).await;
        assert_eq!(status, 200);
        let roots: serde_json::Value = serde_json::from_slice(&body).expect("roots json");
        assert_eq!(roots["roots"][0]["id"], LINUX_FILES_ROOT_ID);
        assert_eq!(roots["roots"][0]["available"], true);
        assert_eq!(roots["roots"][1]["available"], false);

        let create_body = serde_json::json!({
            "rootId": LINUX_FILES_ROOT_ID,
            "path": ["Downloads"],
            "name": "Sites",
        })
        .to_string();
        let create = format!(
            "POST /api/folders/create HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{create_body}",
            create_body.len()
        );
        let (status, _, body) = request(address, &create).await;
        assert_eq!(status, 200);
        let listing: serde_json::Value = serde_json::from_slice(&body).expect("listing json");
        assert_eq!(listing["displayPath"], "Linux files / Downloads");
        assert!(listing["entries"]
            .as_array()
            .expect("entries")
            .iter()
            .any(|entry| entry["name"] == "Sites"));

        let select_body = serde_json::json!({
            "rootId": LINUX_FILES_ROOT_ID,
            "path": ["Downloads", "Sites"],
        })
        .to_string();
        let select = format!(
            "POST /api/folders/select HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{select_body}",
            select_body.len()
        );
        let (status, _, body) = request(address, &select).await;
        assert_eq!(status, 200);
        let selected: serde_json::Value = serde_json::from_slice(&body).expect("selected json");
        let expected_root = std::fs::canonicalize(temp.path().join("home/Downloads/Sites"))
            .expect("canonical selected root");
        assert_eq!(
            selected["settings"]["root"],
            expected_root.to_string_lossy().as_ref()
        );

        let invalid_body = serde_json::json!({
            "rootId": LINUX_FILES_ROOT_ID,
            "path": [".."],
        })
        .to_string();
        let invalid = format!(
            "POST /api/folders/list HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{invalid_body}",
            invalid_body.len()
        );
        assert_eq!(request(address, &invalid).await.0, 400);
        controller.stop().await.expect("stop controller");
    }

    #[tokio::test]
    async fn final_ui_session_close_stops_content_unless_background_is_enabled() {
        let (temp, controller) = fixture().await;
        let address = controller.local_addr();
        let token = claim(address).await;
        let session_id = open_session(address, &token).await;
        let available = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .expect("ephemeral listener")
            .local_addr()
            .expect("ephemeral address")
            .port();
        let settings_body = serde_json::json!({
            "root": temp.path().join("home/Downloads/200 OK"),
            "port": available,
            "lan": false,
            "directoryListing": true,
            "cors": false,
            "spa": false,
            "keepServingOnClose": false,
        })
        .to_string();
        let settings = format!(
            "PUT /api/settings HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{settings_body}",
            settings_body.len()
        );
        assert_eq!(request(address, &settings).await.0, 200);

        let start_body = serde_json::json!({ "sessionId": session_id }).to_string();
        let start = format!(
            "POST /api/server/start HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{start_body}",
            start_body.len()
        );
        assert_eq!(request(address, &start).await.0, 200);

        let close = format!(
            "POST /api/session/close HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{start_body}",
            start_body.len()
        );
        let (status, _, body) = request(address, &close).await;
        assert_eq!(status, 200);
        let closed: serde_json::Value = serde_json::from_slice(&body).expect("closed json");
        assert_eq!(closed["server"]["state"], "stopped");

        let background_session = open_session(address, &token).await;
        let background_settings_body = serde_json::json!({
            "root": temp.path().join("home/Downloads/200 OK"),
            "port": available,
            "lan": false,
            "directoryListing": true,
            "cors": false,
            "spa": false,
            "keepServingOnClose": true,
        })
        .to_string();
        let background_settings = format!(
            "PUT /api/settings HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{background_settings_body}",
            background_settings_body.len()
        );
        assert_eq!(request(address, &background_settings).await.0, 200);
        let background_start_body =
            serde_json::json!({ "sessionId": background_session }).to_string();
        let background_start = format!(
            "POST /api/server/start HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{background_start_body}",
            background_start_body.len()
        );
        assert_eq!(request(address, &background_start).await.0, 200);
        let background_close = format!(
            "POST /api/session/close HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{background_start_body}",
            background_start_body.len()
        );
        let (_, _, body) = request(address, &background_close).await;
        let background_closed: serde_json::Value =
            serde_json::from_slice(&body).expect("background close json");
        assert_eq!(background_closed["server"]["state"], "running");

        let stop = format!(
            "POST /api/server/stop HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        assert_eq!(request(address, &stop).await.0, 200);
        controller.stop().await.expect("stop controller");
    }

    #[tokio::test]
    async fn controller_lock_rejects_a_second_process() {
        let (temp, controller) = fixture().await;
        let second = RunningController::start(ControllerOptions {
            config_dir: temp.path().join("config"),
            home_dir: temp.path().join("home"),
            bind_address: SocketAddr::from(([127, 0, 0, 1], 0)),
            shared_root: temp.path().join("shared"),
            update_backend: FixtureUpdateBackend::current(),
            automatic_update_checks: false,
        })
        .await;
        let Err(error) = second else {
            panic!("second controller must fail");
        };
        assert!(error.to_string().contains("another controller"));
        controller.stop().await.expect("stop");
    }

    #[tokio::test]
    async fn serving_root_must_be_below_home() {
        let temp = tempfile::tempdir().expect("temp");
        let home = temp.path().join("home");
        let allowed = home.join("Downloads");
        tokio::fs::create_dir_all(&allowed).await.expect("allowed");
        assert_eq!(
            validate_serving_root(&home, &temp.path().join("shared"), &allowed)
                .await
                .expect("valid"),
            std::fs::canonicalize(&allowed).expect("canonical")
        );
        assert!(
            validate_serving_root(&home, &temp.path().join("shared"), &home)
                .await
                .is_err()
        );
        assert!(
            validate_serving_root(&home, &temp.path().join("shared"), temp.path())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn update_api_persists_status_and_runs_installer_outside_request() {
        let backend = FixtureUpdateBackend::available("0.2.0");
        let (temp, controller) = fixture_with_backend(Arc::clone(&backend)).await;
        let address = controller.local_addr();
        let token = claim(address).await;
        let check = format!(
            "POST /api/update/check HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        let (status, _, body) = request(address, &check).await;
        let checked: serde_json::Value = serde_json::from_slice(&body).expect("check json");
        assert_eq!(status, 200);
        assert_eq!(checked["update"]["state"], "available");
        assert_eq!(checked["update"]["availableVersion"], "0.2.0");
        assert_eq!(backend.install_calls.load(Ordering::SeqCst), 0);

        let install = format!(
            "POST /api/update/install HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        let (status, _, body) = request(address, &install).await;
        let installing: serde_json::Value = serde_json::from_slice(&body).expect("install json");
        assert_eq!(status, 200);
        assert_eq!(installing["update"]["state"], "installing");
        assert_eq!(backend.install_calls.load(Ordering::SeqCst), 0);

        tokio::time::timeout(Duration::from_secs(2), async {
            while backend.install_calls.load(Ordering::SeqCst) == 0 {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("installer called");
        let persisted: serde_json::Value = serde_json::from_slice(
            &tokio::fs::read(temp.path().join("config/updates.json"))
                .await
                .expect("update state"),
        )
        .expect("update state json");
        assert!(persisted["lastAttemptUnixSeconds"].as_u64().is_some());
        assert!(persisted["lastSuccessUnixSeconds"].as_u64().is_some());
        controller.stop().await.expect("stop");
    }

    #[tokio::test]
    async fn automatic_update_waits_until_content_is_explicitly_stopped() {
        let backend = FixtureUpdateBackend::available("0.2.0");
        let (temp, controller) = fixture_with_backend(Arc::clone(&backend)).await;
        let address = controller.local_addr();
        let token = claim(address).await;
        let session_id = open_session(address, &token).await;
        let root = temp.path().join("home/Downloads/200 OK");
        let available_port = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .expect("ephemeral listener")
            .local_addr()
            .expect("ephemeral address")
            .port();
        let settings = serde_json::json!({
            "root": root,
            "port": available_port,
            "lan": false,
            "directoryListing": true,
            "cors": false,
            "spa": false,
            "automaticUpdates": true,
        })
        .to_string();
        let save = format!(
            "PUT /api/settings HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{settings}",
            settings.len()
        );
        assert_eq!(request(address, &save).await.0, 200);
        let start_body = serde_json::json!({ "sessionId": session_id }).to_string();
        let start = format!(
            "POST /api/server/start HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{start_body}",
            start_body.len()
        );
        assert_eq!(request(address, &start).await.0, 200);
        let check = format!(
            "POST /api/update/check HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        assert_eq!(request(address, &check).await.0, 200);
        tokio::time::sleep(UPDATE_INSTALL_DELAY + Duration::from_millis(100)).await;
        assert_eq!(backend.install_calls.load(Ordering::SeqCst), 0);

        let stop = format!(
            "POST /api/server/stop HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        assert_eq!(request(address, &stop).await.0, 200);
        tokio::time::timeout(Duration::from_secs(2), async {
            while backend.install_calls.load(Ordering::SeqCst) == 0 {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("automatic installer called after stop");
        controller.stop().await.expect("stop controller");
    }

    #[tokio::test]
    async fn failed_update_check_is_non_fatal_and_backed_off() {
        let backend = FixtureUpdateBackend::current();
        *backend.check_result.lock().expect("check result") =
            Err("fixture network unavailable".to_owned());
        let (_temp, controller) = fixture_with_backend(backend).await;
        let address = controller.local_addr();
        let token = claim(address).await;
        let check = format!(
            "POST /api/update/check HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        let (status, _, body) = request(address, &check).await;
        let checked: serde_json::Value = serde_json::from_slice(&body).expect("check json");
        assert_eq!(status, 200);
        assert_eq!(checked["update"]["state"], "error");
        assert_eq!(checked["update"]["error"], "fixture network unavailable");
        let delay = next_update_check_delay(&controller.state).await;
        assert!(delay <= UPDATE_FAILURE_BACKOFF);
        assert!(
            delay
                > UPDATE_FAILURE_BACKOFF
                    .checked_sub(Duration::from_secs(5))
                    .expect("shorter fixture duration")
        );
        controller.stop().await.expect("stop");
    }
}
