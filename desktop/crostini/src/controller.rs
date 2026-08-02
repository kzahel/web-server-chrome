use std::fmt;
use std::fs::File;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;

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
const LOCK_FILE_NAME: &str = "controller.lock";
const CONTROLLER_DIRECTORY_NAME: &str = "ok200-crostini";
const DEFAULT_CONTENT_PORT: u16 = 8080;
const MIN_CONTENT_PORT: u16 = 1024;
const CHROMEOS_SHARED_ROOT: &str = "/mnt/chromeos";

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

#[derive(Clone, Debug)]
pub struct ControllerOptions {
    pub config_dir: PathBuf,
    pub home_dir: PathBuf,
    pub bind_address: SocketAddr,
}

impl ControllerOptions {
    pub fn system() -> Result<Self, ControllerError> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| ControllerError::new("could not determine the user config directory"))?
            .join(CONTROLLER_DIRECTORY_NAME);
        let home_dir = dirs::home_dir()
            .ok_or_else(|| ControllerError::new("could not determine the user home directory"))?;
        Ok(Self {
            config_dir,
            home_dir,
            bind_address: SocketAddr::from(([0, 0, 0, 0], CONTROLLER_PORT)),
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
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedController {
    schema_version: u16,
    instance_id: String,
    controller_token: Option<String>,
    settings: ControllerSettings,
}

struct ControllerState {
    config_path: PathBuf,
    home_dir: PathBuf,
    controller_port: u16,
    persisted: RwLock<PersistedController>,
    claim_code: Mutex<Option<String>>,
    content_server: Mutex<Option<RunningServer>>,
}

pub struct RunningController {
    local_addr: SocketAddr,
    state: Arc<ControllerState>,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<Result<(), std::io::Error>>>,
    _lock_file: File,
}

impl RunningController {
    pub async fn start(options: ControllerOptions) -> Result<Self, ControllerError> {
        prepare_private_directory(&options.config_dir).await?;
        let lock_file = acquire_process_lock(&options.config_dir)?;
        let config_path = options.config_dir.join(CONFIG_FILE_NAME);
        let persisted = load_or_create_config(&config_path, &options.home_dir).await?;
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
            home_dir: options.home_dir,
            controller_port: local_addr.port(),
            persisted: RwLock::new(persisted),
            claim_code: Mutex::new(claim_code),
            content_server: Mutex::new(None),
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

        Ok(Self {
            local_addr,
            state,
            shutdown: Some(shutdown),
            task: Some(task),
            _lock_file: lock_file,
        })
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub async fn stop(mut self) -> Result<(), ControllerError> {
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
    }
}

fn controller_router(state: Arc<ControllerState>) -> Router {
    let api = Router::new()
        .route("/claim", post(claim_controller))
        .route("/status", get(controller_status))
        .route("/settings", put(update_settings))
        .route("/server/start", post(start_content_server))
        .route("/server/stop", post(stop_content_server))
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentServerStatus {
    state: &'static str,
    url: Option<String>,
    error: Option<String>,
}

async fn controller_status(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
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
    StatusResponse {
        product: CONTROLLER_PRODUCT,
        protocol_version: CONTROLLER_PROTOCOL_VERSION,
        instance_id: persisted.instance_id,
        version: env!("CARGO_PKG_VERSION"),
        settings: persisted.settings,
        server: content_status,
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
    settings.root = validate_serving_root(&state.home_dir, &settings.root)
        .await
        .map_err(ApiError::bad_request)?;

    let mut persisted = state.persisted.write().await;
    persisted.settings = settings;
    persist_config(&state.config_path, &persisted)
        .await
        .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(persisted);
    drop(content_server);
    Ok(Json(build_status(&state).await))
}

async fn start_content_server(
    State(state): State<Arc<ControllerState>>,
    headers: HeaderMap,
) -> ApiResult<Json<StatusResponse>> {
    authorize(&state, &headers).await?;
    let mut content_server = state.content_server.lock().await;
    if content_server.is_some() {
        return Err(ApiError::conflict("content server is already active"));
    }
    let settings = state.persisted.read().await.settings.clone();
    validate_content_port(settings.port)?;
    let canonical_root = validate_serving_root(&state.home_dir, &settings.root)
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
    Ok(Json(build_status(&state).await))
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

async fn validate_serving_root(home_dir: &Path, root: &Path) -> Result<PathBuf, String> {
    let canonical_root = canonicalize_serving_root(root)
        .await
        .map_err(|error| error.to_string())?;
    let canonical_home = tokio::fs::canonicalize(home_dir)
        .await
        .map_err(|error| format!("could not validate home directory: {error}"))?;
    let shared_root = Path::new(CHROMEOS_SHARED_ROOT);
    let is_home_child =
        canonical_root.starts_with(&canonical_home) && canonical_root != canonical_home;
    let is_shared_child = canonical_root.starts_with(shared_root) && canonical_root != shared_root;
    if !is_home_child && !is_shared_child {
        return Err(format!(
            "serve root must be inside {} or a ChromeOS folder shared under {CHROMEOS_SHARED_ROOT}",
            canonical_home.display()
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
    use tempfile::TempDir;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    async fn fixture() -> (TempDir, RunningController) {
        let temp = tempfile::tempdir().expect("temp dir");
        let home = temp.path().join("home");
        tokio::fs::create_dir_all(&home).await.expect("home");
        let controller = RunningController::start(ControllerOptions {
            config_dir: temp.path().join("config"),
            home_dir: home,
            bind_address: SocketAddr::from(([127, 0, 0, 1], 0)),
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

        let start = format!(
            "POST /api/server/start HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
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
    async fn controller_lock_rejects_a_second_process() {
        let (temp, controller) = fixture().await;
        let second = RunningController::start(ControllerOptions {
            config_dir: temp.path().join("config"),
            home_dir: temp.path().join("home"),
            bind_address: SocketAddr::from(([127, 0, 0, 1], 0)),
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
            validate_serving_root(&home, &allowed).await.expect("valid"),
            std::fs::canonicalize(&allowed).expect("canonical")
        );
        assert!(validate_serving_root(&home, &home).await.is_err());
        assert!(validate_serving_root(&home, temp.path()).await.is_err());
    }
}
