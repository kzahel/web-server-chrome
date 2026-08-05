use std::fmt;
use std::fmt::Write as _;
use std::fs::Metadata;
use std::io;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::header::{
    ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
    ACCESS_CONTROL_ALLOW_ORIGIN, ALLOW, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, ETAG,
    IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED, RANGE, SERVER,
};
use axum::http::{HeaderMap, HeaderValue, Method, Request, StatusCode};
use axum::response::Response;
use axum::Router;
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use serde::Serialize;
use tokio::fs::{self, File};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, oneshot, watch};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tokio_util::io::ReaderStream;

const DEFAULT_MAX_HEADER_BYTES: usize = 8 * 1024;
const DEFAULT_LOG_CAPACITY: usize = 256;
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_DIRECTORY_ENTRIES: usize = 10_000;
const PATH_SEGMENT_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'&')
    .add(b'/')
    .add(b':')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub root: PathBuf,
    pub host: IpAddr,
    pub port: u16,
    pub cors: bool,
    pub spa: bool,
    pub directory_listing: bool,
    pub request_timeout: Duration,
    pub max_header_bytes: usize,
    pub log_capacity: usize,
}

impl ServerConfig {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            host: IpAddr::V4(Ipv4Addr::LOCALHOST),
            port: 8080,
            cors: false,
            spa: false,
            directory_listing: true,
            request_timeout: DEFAULT_REQUEST_TIMEOUT,
            max_header_bytes: DEFAULT_MAX_HEADER_BYTES,
            log_capacity: DEFAULT_LOG_CAPACITY,
        }
    }

    fn validate(&self) -> Result<(), CoreError> {
        if self.root.as_os_str().is_empty() {
            return Err(CoreError::InvalidConfig(
                "root directory must be selected".to_owned(),
            ));
        }
        if self.request_timeout.is_zero() {
            return Err(CoreError::InvalidConfig(
                "request_timeout must be greater than zero".to_owned(),
            ));
        }
        if !(1024..=64 * 1024).contains(&self.max_header_bytes) {
            return Err(CoreError::InvalidConfig(
                "max_header_bytes must be between 1024 and 65536".to_owned(),
            ));
        }
        if !(1..=4096).contains(&self.log_capacity) {
            return Err(CoreError::InvalidConfig(
                "log_capacity must be between 1 and 4096".to_owned(),
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "state", content = "error", rename_all = "snake_case")]
pub enum ServerStatus {
    Running,
    Stopping,
    Stopped,
    Failed(String),
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct RequestLog {
    pub timestamp_ms: u64,
    pub remote_addr: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub response_bytes: u64,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug)]
pub enum CoreError {
    InvalidConfig(String),
    InvalidRoot {
        path: PathBuf,
        source: io::Error,
    },
    Bind {
        address: SocketAddr,
        source: io::Error,
    },
    Serve(io::Error),
    Join(String),
}

impl fmt::Display for CoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfig(message) => write!(formatter, "invalid server config: {message}"),
            Self::InvalidRoot { path, source } => {
                write!(
                    formatter,
                    "invalid server root {}: {source}",
                    path.display()
                )
            }
            Self::Bind { address, source } => {
                write!(formatter, "could not bind {address}: {source}")
            }
            Self::Serve(source) => write!(formatter, "HTTP server failed: {source}"),
            Self::Join(message) => write!(formatter, "HTTP server task failed: {message}"),
        }
    }
}

impl std::error::Error for CoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidRoot { source, .. } | Self::Bind { source, .. } | Self::Serve(source) => {
                Some(source)
            }
            Self::InvalidConfig(_) | Self::Join(_) => None,
        }
    }
}

pub struct RunningServer {
    config: ServerConfig,
    local_addr: SocketAddr,
    logs: broadcast::Sender<RequestLog>,
    status: watch::Sender<ServerStatus>,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<Result<(), io::Error>>,
}

impl RunningServer {
    pub async fn start(mut config: ServerConfig) -> Result<Self, CoreError> {
        config.validate()?;
        let configured_root = config.root.clone();
        let root = canonicalize_serving_root(&configured_root).await?;
        let metadata = fs::metadata(&root)
            .await
            .map_err(|source| CoreError::InvalidRoot {
                path: configured_root.clone(),
                source,
            })?;
        if !metadata.is_dir() {
            return Err(CoreError::InvalidConfig(format!(
                "root is not a directory: {}",
                configured_root.display()
            )));
        }
        config.root.clone_from(&root);

        let requested_addr = SocketAddr::new(config.host, config.port);
        let listener =
            TcpListener::bind(requested_addr)
                .await
                .map_err(|source| CoreError::Bind {
                    address: requested_addr,
                    source,
                })?;
        let local_addr = listener.local_addr().map_err(|source| CoreError::Bind {
            address: requested_addr,
            source,
        })?;

        let (logs, _) = broadcast::channel(config.log_capacity);
        let (status, _) = watch::channel(ServerStatus::Running);
        let (shutdown, shutdown_receiver) = oneshot::channel();
        let state = Arc::new(ServerState {
            root,
            config: config.clone(),
            logs: logs.clone(),
        });
        let app = Router::new().fallback(handle_request).with_state(state);
        let task_status = status.clone();
        let task = tokio::spawn(async move {
            let result = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(async {
                let _ = shutdown_receiver.await;
            })
            .await;

            match &result {
                Ok(()) => {
                    task_status.send_replace(ServerStatus::Stopped);
                }
                Err(error) => {
                    task_status.send_replace(ServerStatus::Failed(error.to_string()));
                }
            }
            result
        });

        Ok(Self {
            config,
            local_addr,
            logs,
            status,
            shutdown: Some(shutdown),
            task,
        })
    }

    pub fn config(&self) -> &ServerConfig {
        &self.config
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub fn status(&self) -> ServerStatus {
        self.status.borrow().clone()
    }

    pub fn subscribe_status(&self) -> watch::Receiver<ServerStatus> {
        self.status.subscribe()
    }

    pub fn subscribe_logs(&self) -> broadcast::Receiver<RequestLog> {
        self.logs.subscribe()
    }

    pub async fn stop(mut self) -> Result<(), CoreError> {
        self.status.send_replace(ServerStatus::Stopping);
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }

        match timeout(SHUTDOWN_TIMEOUT, &mut self.task).await {
            Ok(Ok(Ok(()))) => Ok(()),
            Ok(Ok(Err(error))) => Err(CoreError::Serve(error)),
            Ok(Err(error)) => Err(CoreError::Join(error.to_string())),
            Err(_) => {
                self.task.abort();
                let _ = (&mut self.task).await;
                self.status.send_replace(ServerStatus::Stopped);
                Ok(())
            }
        }
    }
}

/// Canonicalize and validate a directory before it is authorized as a serving
/// root. This is public so native control surfaces can apply the exact same
/// safety boundary before starting a server.
pub async fn canonicalize_serving_root(root: &Path) -> Result<PathBuf, CoreError> {
    if root.as_os_str().is_empty() {
        return Err(CoreError::InvalidConfig(
            "root directory must be selected".to_owned(),
        ));
    }

    let canonical = fs::canonicalize(root)
        .await
        .map_err(|source| CoreError::InvalidRoot {
            path: root.to_path_buf(),
            source,
        })?;
    if canonical.parent().is_none() {
        return Err(CoreError::InvalidConfig(format!(
            "filesystem root cannot be served: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        if !self.task.is_finished() {
            self.task.abort();
        }
    }
}

struct ServerState {
    root: PathBuf,
    config: ServerConfig,
    logs: broadcast::Sender<RequestLog>,
}

#[derive(Clone)]
struct ResponseError(String);

async fn handle_request(
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<ServerState>>,
    request: Request<Body>,
) -> Response<Body> {
    let started = Instant::now();
    let method = request.method().clone();
    let path = request
        .uri()
        .path_and_query()
        .map_or_else(|| request.uri().path().to_owned(), ToString::to_string);

    let response = if request_metadata_size(&request) > state.config.max_header_bytes {
        text_response(
            StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE,
            "Request Header Fields Too Large",
            method == Method::HEAD,
        )
    } else if let Ok(response) = timeout(
        state.config.request_timeout,
        serve_request(Arc::clone(&state), request),
    )
    .await
    {
        response
    } else {
        let mut response = text_response(
            StatusCode::REQUEST_TIMEOUT,
            "Request Timeout",
            method == Method::HEAD,
        );
        response
            .extensions_mut()
            .insert(ResponseError("request timed out".to_owned()));
        response
    };

    let mut response = add_common_headers(response, &state.config);
    let error = response
        .extensions_mut()
        .remove::<ResponseError>()
        .map(|error| error.0);
    let status = response.status().as_u16();
    let response_bytes = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX);
    let elapsed_ms = started.elapsed().as_millis().try_into().unwrap_or(u64::MAX);
    let _ = state.logs.send(RequestLog {
        timestamp_ms,
        remote_addr: remote_addr.to_string(),
        method: method.to_string(),
        path,
        status,
        response_bytes,
        elapsed_ms,
        error,
    });

    response
}

fn request_metadata_size(request: &Request<Body>) -> usize {
    request.headers().iter().fold(
        request
            .uri()
            .to_string()
            .len()
            .saturating_add(request.method().as_str().len())
            .saturating_add(16),
        |size, (name, value)| {
            size.saturating_add(name.as_str().len())
                .saturating_add(value.as_bytes().len())
                .saturating_add(4)
        },
    )
}

async fn serve_request(state: Arc<ServerState>, request: Request<Body>) -> Response<Body> {
    let method = request.method().clone();
    let is_head = method == Method::HEAD;

    if method == Method::OPTIONS && state.config.cors {
        return empty_response(StatusCode::NO_CONTENT);
    }
    if method != Method::GET && method != Method::HEAD {
        let mut response = text_response(
            StatusCode::METHOD_NOT_ALLOWED,
            "Method Not Allowed",
            is_head,
        );
        response
            .headers_mut()
            .insert(ALLOW, HeaderValue::from_static("GET, HEAD, OPTIONS"));
        return response;
    }

    let Ok(decoded_path) = decode_request_path(request.uri().path()) else {
        return text_response(StatusCode::BAD_REQUEST, "Bad Request", is_head);
    };

    match resolve_existing_path(&state.root, &decoded_path.path).await {
        Ok(Some((path, metadata))) if metadata.is_file() => {
            serve_file(&path, &metadata, request.headers(), is_head).await
        }
        Ok(Some((path, metadata))) if metadata.is_dir() => {
            serve_directory(
                &state,
                &path,
                &decoded_path.url_path,
                request.headers(),
                is_head,
            )
            .await
        }
        Ok(Some(_) | None) => {
            serve_not_found(&state, request.headers(), is_head, &decoded_path.url_path).await
        }
        Err(ResolveError::Forbidden) => text_response(StatusCode::FORBIDDEN, "Forbidden", is_head),
        Err(ResolveError::Io(error)) => internal_error(&error, is_head),
    }
}

async fn serve_directory(
    state: &ServerState,
    directory: &Path,
    url_path: &str,
    request_headers: &HeaderMap,
    is_head: bool,
) -> Response<Body> {
    match resolve_existing_path(&state.root, &directory.join("index.html")).await {
        Ok(Some((index_path, metadata))) if metadata.is_file() => {
            return serve_file(&index_path, &metadata, request_headers, is_head).await;
        }
        Ok(Some(_) | None) => {}
        Err(ResolveError::Forbidden) => {
            return text_response(StatusCode::FORBIDDEN, "Forbidden", is_head);
        }
        Err(ResolveError::Io(error)) => return internal_error(&error, is_head),
    }

    if state.config.directory_listing {
        match directory_listing(directory, url_path).await {
            Ok(html) => {
                return body_response(
                    StatusCode::OK,
                    "text/html; charset=utf-8",
                    html.into_bytes(),
                    is_head,
                );
            }
            Err(error) => return internal_error(&error, is_head),
        }
    }

    serve_not_found(state, request_headers, is_head, url_path).await
}

async fn serve_not_found(
    state: &ServerState,
    request_headers: &HeaderMap,
    is_head: bool,
    url_path: &str,
) -> Response<Body> {
    if state.config.spa && should_use_spa_fallback(url_path) {
        match resolve_existing_path(&state.root, &state.root.join("index.html")).await {
            Ok(Some((index_path, metadata))) if metadata.is_file() => {
                return serve_file(&index_path, &metadata, request_headers, is_head).await;
            }
            Ok(Some(_) | None) => {}
            Err(ResolveError::Forbidden) => {
                return text_response(StatusCode::FORBIDDEN, "Forbidden", is_head);
            }
            Err(ResolveError::Io(error)) => return internal_error(&error, is_head),
        }
    }

    text_response(StatusCode::NOT_FOUND, "Not Found", is_head)
}

async fn serve_file(
    path: &Path,
    metadata: &Metadata,
    request_headers: &HeaderMap,
    is_head: bool,
) -> Response<Body> {
    let file_size = metadata.len();
    let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
    let modified_duration = modified.duration_since(UNIX_EPOCH).unwrap_or_default();
    let etag = format!("\"{:x}-{:x}\"", modified_duration.as_millis(), file_size);
    let content_type = content_type_for(path);

    let not_modified = request_headers.get(IF_NONE_MATCH).map_or_else(
        || {
            request_headers
                .get(IF_MODIFIED_SINCE)
                .is_some_and(|value| if_modified_since(value, modified))
        },
        |value| if_none_match(value, &etag),
    );
    if not_modified {
        let mut response = empty_response(StatusCode::NOT_MODIFIED);
        add_file_headers(&mut response, &content_type, &etag, modified, None, None);
        return response;
    }

    match parse_range_header(request_headers.get(RANGE), file_size) {
        RangeResult::Unsatisfiable => {
            let mut response = text_response(
                StatusCode::RANGE_NOT_SATISFIABLE,
                "Range Not Satisfiable",
                is_head,
            );
            response.headers_mut().insert(
                CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes */{file_size}"))
                    .unwrap_or_else(|_| HeaderValue::from_static("bytes */0")),
            );
            add_file_headers(&mut response, &content_type, &etag, modified, None, None);
            response
        }
        RangeResult::Range { start, end } => {
            let length = end - start + 1;
            let mut response = if is_head {
                empty_response(StatusCode::PARTIAL_CONTENT)
            } else {
                match ranged_file_body(path, start, length).await {
                    Ok(body) => {
                        let mut response = Response::new(body);
                        *response.status_mut() = StatusCode::PARTIAL_CONTENT;
                        response
                    }
                    Err(error) => return internal_error(&error, false),
                }
            };
            add_file_headers(
                &mut response,
                &content_type,
                &etag,
                modified,
                Some(length),
                Some((start, end, file_size)),
            );
            response
        }
        RangeResult::None => {
            let mut response = if is_head {
                empty_response(StatusCode::OK)
            } else {
                match ranged_file_body(path, 0, file_size).await {
                    Ok(body) => {
                        let mut response = Response::new(body);
                        *response.status_mut() = StatusCode::OK;
                        response
                    }
                    Err(error) => return internal_error(&error, false),
                }
            };
            add_file_headers(
                &mut response,
                &content_type,
                &etag,
                modified,
                Some(file_size),
                None,
            );
            response
        }
    }
}

async fn ranged_file_body(path: &Path, start: u64, length: u64) -> io::Result<Body> {
    let mut file = File::open(path).await?;
    if start > 0 {
        file.seek(io::SeekFrom::Start(start)).await?;
    }
    let stream = ReaderStream::new(file.take(length));
    Ok(Body::from_stream(stream))
}

fn add_file_headers(
    response: &mut Response<Body>,
    content_type: &str,
    etag: &str,
    modified: SystemTime,
    content_length: Option<u64>,
    range: Option<(u64, u64, u64)>,
) {
    let headers = response.headers_mut();
    headers.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if let Ok(value) = HeaderValue::from_str(content_type) {
        headers.insert(CONTENT_TYPE, value);
    }
    if let Ok(value) = HeaderValue::from_str(etag) {
        headers.insert(ETAG, value);
    }
    if let Ok(value) = HeaderValue::from_str(&httpdate::fmt_http_date(modified)) {
        headers.insert(LAST_MODIFIED, value);
    }
    if let Some(length) = content_length {
        if let Ok(value) = HeaderValue::from_str(&length.to_string()) {
            headers.insert(CONTENT_LENGTH, value);
        }
    }
    if let Some((start, end, total)) = range {
        if let Ok(value) = HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")) {
            headers.insert(CONTENT_RANGE, value);
        }
    }
}

fn content_type_for(path: &Path) -> String {
    let guessed = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    if guessed.starts_with("text/")
        || matches!(
            guessed.as_str(),
            "application/javascript"
                | "application/json"
                | "application/manifest+json"
                | "application/xml"
                | "image/svg+xml"
        )
    {
        format!("{guessed}; charset=utf-8")
    } else {
        guessed
    }
}

enum RangeResult {
    None,
    Unsatisfiable,
    Range { start: u64, end: u64 },
}

fn parse_range_header(value: Option<&HeaderValue>, file_size: u64) -> RangeResult {
    let Some(value) = value.and_then(|value| value.to_str().ok()) else {
        return RangeResult::None;
    };
    let value = value.trim();
    let Some(prefix) = value.get(.."bytes=".len()) else {
        return RangeResult::None;
    };
    if !prefix.eq_ignore_ascii_case("bytes=") {
        return RangeResult::None;
    }
    let range_value = value["bytes=".len()..].trim();
    if range_value.is_empty() || range_value.contains(',') {
        return RangeResult::None;
    }
    let Some((start_raw, end_raw)) = range_value.split_once('-') else {
        return RangeResult::None;
    };
    let start_raw = start_raw.trim();
    let end_raw = end_raw.trim();
    if start_raw.is_empty() && end_raw.is_empty() {
        return RangeResult::None;
    }

    if start_raw.is_empty() {
        let Ok(suffix_length) = end_raw.parse::<u64>() else {
            return RangeResult::None;
        };
        if suffix_length == 0 || file_size == 0 {
            return RangeResult::Unsatisfiable;
        }
        let start = file_size.saturating_sub(suffix_length);
        return RangeResult::Range {
            start,
            end: file_size - 1,
        };
    }

    let Ok(start) = start_raw.parse::<u64>() else {
        return RangeResult::None;
    };
    if start >= file_size {
        return RangeResult::Unsatisfiable;
    }
    if end_raw.is_empty() {
        return RangeResult::Range {
            start,
            end: file_size - 1,
        };
    }

    let Ok(end) = end_raw.parse::<u64>() else {
        return RangeResult::None;
    };
    if start > end {
        return RangeResult::Unsatisfiable;
    }
    RangeResult::Range {
        start,
        end: end.min(file_size - 1),
    }
}

struct DecodedPath {
    path: PathBuf,
    url_path: String,
}

fn decode_request_path(path: &str) -> Result<DecodedPath, ()> {
    validate_percent_encoding(path)?;
    let lowercased = path.to_ascii_lowercase();
    if lowercased.contains("%2f") || lowercased.contains("%5c") || lowercased.contains("%00") {
        return Err(());
    }
    let decoded = percent_encoding::percent_decode_str(path)
        .decode_utf8()
        .map_err(|_| ())?;
    if decoded.contains(['\0', '\\', ':']) {
        return Err(());
    }

    let mut filesystem_path = PathBuf::new();
    let mut encoded_segments = Vec::new();
    for segment in decoded.split('/').filter(|segment| !segment.is_empty()) {
        if segment == "." || segment == ".." {
            return Err(());
        }
        filesystem_path.push(segment);
        encoded_segments.push(utf8_percent_encode(segment, PATH_SEGMENT_ENCODE_SET).to_string());
    }
    let url_path = if encoded_segments.is_empty() {
        "/".to_owned()
    } else {
        format!("/{}", encoded_segments.join("/"))
    };

    Ok(DecodedPath {
        path: filesystem_path,
        url_path,
    })
}

fn should_use_spa_fallback(url_path: &str) -> bool {
    url_path
        .rsplit('/')
        .find(|segment| !segment.is_empty())
        .is_some_and(|segment| !segment.contains('.'))
}

fn if_none_match(value: &HeaderValue, etag: &str) -> bool {
    value.to_str().is_ok_and(|value| {
        value
            .split(',')
            .map(str::trim)
            .any(|candidate| candidate == "*" || candidate == etag)
    })
}

fn if_modified_since(value: &HeaderValue, modified: SystemTime) -> bool {
    let Ok(value) = value.to_str() else {
        return false;
    };
    let Ok(condition) = httpdate::parse_http_date(value) else {
        return false;
    };
    modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        <= condition
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
}

fn validate_percent_encoding(value: &str) -> Result<(), ()> {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return Err(());
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    Ok(())
}

enum ResolveError {
    Forbidden,
    Io(io::Error),
}

async fn resolve_existing_path(
    root: &Path,
    relative_or_absolute: &Path,
) -> Result<Option<(PathBuf, Metadata)>, ResolveError> {
    let candidate = if relative_or_absolute.is_absolute() {
        relative_or_absolute.to_path_buf()
    } else {
        root.join(relative_or_absolute)
    };
    let canonical = match fs::canonicalize(candidate).await {
        Ok(path) => path,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
            return Err(ResolveError::Forbidden);
        }
        Err(error) => return Err(ResolveError::Io(error)),
    };
    if !canonical.starts_with(root) {
        return Err(ResolveError::Forbidden);
    }
    let metadata = fs::metadata(&canonical).await.map_err(ResolveError::Io)?;
    Ok(Some((canonical, metadata)))
}

#[derive(Debug)]
struct DirectoryEntry {
    name: String,
    is_directory: bool,
    size: u64,
    modified: Option<SystemTime>,
}

const DIRECTORY_LISTING_STYLE: &str = r#"
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --surface: #f5f5f3;
    --text: #1a1a1a;
    --muted: #666666;
    --border: #d7d7d2;
    --row-hover: #fff9d6;
    --accent: #8a6800;
    --brand: #f8d203;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d0d0d;
      --surface: #1a1a1a;
      --text: #ffffff;
      --muted: #a0a0a0;
      --border: #333333;
      --row-hover: #27230f;
      --accent: #f8d203;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px;
    background: var(--bg);
    color: var(--text);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
  }
  .page { max-width: 920px; margin: 0 auto; }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 18px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .brand-mark {
    display: inline-flex;
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--brand);
    color: #1a1a1a;
    font-size: 9px;
    font-weight: 800;
  }
  h1 {
    margin: 0 0 18px;
    font-size: 22px;
    line-height: 1.3;
    letter-spacing: -0.02em;
  }
  h1 code {
    color: var(--accent);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.9em;
    overflow-wrap: anywhere;
  }
  .listing {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    padding: 9px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-align: left;
    text-transform: uppercase;
  }
  td {
    height: 38px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
  }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: var(--row-hover); }
  .size, .modified {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .size { width: 90px; }
  .modified { width: 230px; }
  .entry-link {
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
    align-items: center;
    gap: 9px;
    color: var(--text);
    font-weight: 500;
    text-decoration: none;
  }
  .entry-link:hover span { color: var(--accent); text-decoration: underline; }
  .entry-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: var(--accent);
  }
  .entry-name { overflow-wrap: anywhere; }
  .icon-file { color: var(--muted); }
  .empty {
    padding: 20px 12px;
    color: var(--muted);
    text-align: center;
  }
  @media (max-width: 620px) {
    body { padding: 16px 12px; }
    h1 { margin-bottom: 14px; font-size: 19px; }
    .brand { margin-bottom: 12px; }
    th, td { padding-right: 9px; padding-left: 9px; }
    .modified { display: none; }
    .size { width: 72px; }
  }
</style>
"#;

const DIRECTORY_LISTING_ICONS: &str = r#"
<svg aria-hidden="true" style="display:none">
  <symbol id="icon-parent" viewBox="0 0 20 20">
    <path fill="currentColor" d="M10 2.5 17 9h-4v7H7V9H3l7-6.5Z"/>
  </symbol>
  <symbol id="icon-folder" viewBox="0 0 20 20">
    <path fill="currentColor" d="M2 4h6l2 2h8v10H2V4Zm1.5 3.5v7h13v-7h-13Z"/>
  </symbol>
  <symbol id="icon-file" viewBox="0 0 20 20">
    <path fill="currentColor" d="M5 2h6l4 4v12H5V2Zm7 2v3h3l-3-3ZM6.5 3.5v13h7v-8h-3v-5h-4Z"/>
  </symbol>
</svg>
"#;

async fn directory_listing(directory: &Path, url_path: &str) -> io::Result<String> {
    let mut reader = fs::read_dir(directory).await?;
    let mut entries = Vec::new();
    while let Some(entry) = reader.next_entry().await? {
        if entries.len() >= MAX_DIRECTORY_ENTRIES {
            break;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let metadata = entry.metadata().await?;
        entries.push(DirectoryEntry {
            name,
            is_directory: metadata.is_dir(),
            size: metadata.len(),
            modified: metadata.modified().ok(),
        });
    }
    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    let display_path = escape_html(url_path);
    let mut html = String::with_capacity(4096 + entries.len() * 240);
    let _ = write!(
        html,
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light dark\"><title>Index of {display_path} — 200 OK Web Server</title>"
    );
    html.push_str(DIRECTORY_LISTING_STYLE);
    html.push_str("</head><body><div class=\"page\">");
    html.push_str(
        "<div class=\"brand\"><span class=\"brand-mark\" aria-hidden=\"true\">200</span><span>200 OK Web Server</span></div>",
    );
    let _ = write!(html, "<h1>Index of <code>{display_path}</code></h1>");
    html.push_str(DIRECTORY_LISTING_ICONS);
    html.push_str(
        "<div class=\"listing\"><table><thead><tr><th>Name</th><th class=\"size\">Size</th><th class=\"modified\">Modified</th></tr></thead><tbody>",
    );

    if url_path != "/" {
        html.push_str(
            "<tr data-kind=\"parent\"><td><a class=\"entry-link\" href=\"../\"><svg class=\"entry-icon\" aria-hidden=\"true\"><use href=\"#icon-parent\"></use></svg><span class=\"entry-name\">Parent directory</span></a></td><td class=\"size\">—</td><td class=\"modified\">—</td></tr>",
        );
    }
    let base = if url_path == "/" {
        "/".to_owned()
    } else {
        format!("{url_path}/")
    };
    let is_empty = entries.is_empty();
    for entry in entries {
        let encoded_name = utf8_percent_encode(&entry.name, PATH_SEGMENT_ENCODE_SET);
        let suffix = if entry.is_directory { "/" } else { "" };
        let href = escape_html(&format!("{base}{encoded_name}{suffix}"));
        let display_name = escape_html(&entry.name);
        let size = if entry.is_directory {
            "—".to_owned()
        } else {
            format_file_size(entry.size)
        };
        let modified = entry
            .modified
            .map_or_else(|| "—".to_owned(), httpdate::fmt_http_date);
        let kind = if entry.is_directory {
            "directory"
        } else {
            "file"
        };
        let icon = if entry.is_directory {
            "icon-folder"
        } else {
            "icon-file"
        };
        let icon_class = if entry.is_directory {
            "entry-icon"
        } else {
            "entry-icon icon-file"
        };
        let _ = write!(
            html,
            "<tr data-kind=\"{kind}\"><td><a class=\"entry-link\" href=\"{href}\"><svg class=\"{icon_class}\" aria-hidden=\"true\"><use href=\"#{icon}\"></use></svg><span class=\"entry-name\">{display_name}{suffix}</span></a></td><td class=\"size\">{size}</td><td class=\"modified\"><time>{modified}</time></td></tr>"
        );
    }
    if is_empty && url_path == "/" {
        html.push_str("<tr><td class=\"empty\" colspan=\"3\">This folder is empty</td></tr>");
    }
    html.push_str("</tbody></table></div></div></body></html>");
    Ok(html)
}

fn format_file_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if bytes < 1024 {
        return format!("{bytes} B");
    }

    let mut divisor = 1_u64;
    let mut unit = 0;
    while bytes / divisor >= 1024 && unit < UNITS.len() - 1 {
        divisor *= 1024;
        unit += 1;
    }

    let whole = bytes / divisor;
    let remainder = bytes % divisor;
    if whole >= 10 || remainder == 0 {
        format!("{whole} {}", UNITS[unit])
    } else {
        let tenths = (remainder * 10 + divisor / 2) / divisor;
        if tenths == 10 {
            format!("{} {}", whole + 1, UNITS[unit])
        } else if tenths == 0 {
            format!("{whole} {}", UNITS[unit])
        } else {
            format!("{whole}.{tenths} {}", UNITS[unit])
        }
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn body_response(
    status: StatusCode,
    content_type: &str,
    body: Vec<u8>,
    is_head: bool,
) -> Response<Body> {
    let content_length = body.len();
    let mut response = Response::new(if is_head {
        Body::empty()
    } else {
        Body::from(body)
    });
    *response.status_mut() = status;
    if let Ok(value) = HeaderValue::from_str(content_type) {
        response.headers_mut().insert(CONTENT_TYPE, value);
    }
    if let Ok(value) = HeaderValue::from_str(&content_length.to_string()) {
        response.headers_mut().insert(CONTENT_LENGTH, value);
    }
    response
}

fn text_response(status: StatusCode, message: &str, is_head: bool) -> Response<Body> {
    body_response(
        status,
        "text/plain; charset=utf-8",
        message.as_bytes().to_vec(),
        is_head,
    )
}

fn empty_response(status: StatusCode) -> Response<Body> {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = status;
    response
}

fn internal_error(error: &io::Error, is_head: bool) -> Response<Body> {
    let mut response = text_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Internal Server Error",
        is_head,
    );
    response
        .extensions_mut()
        .insert(ResponseError(error.to_string()));
    response
}

fn add_common_headers(mut response: Response<Body>, config: &ServerConfig) -> Response<Body> {
    response
        .headers_mut()
        .insert(SERVER, HeaderValue::from_static("ok200"));
    if config.cors {
        let headers = response.headers_mut();
        headers.insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
        headers.insert(
            ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, HEAD, OPTIONS"),
        );
        headers.insert(ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*"));
    }
    response
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{decode_request_path, format_file_size, parse_range_header, RangeResult};
    use axum::http::HeaderValue;

    #[test]
    fn rejects_unsafe_or_malformed_paths() {
        for path in [
            "/../secret",
            "/%2e%2e/secret",
            "/bad%ZZ",
            "/a\\b",
            "/a%00b",
            "/C:/secret",
        ] {
            assert!(decode_request_path(path).is_err(), "{path}");
        }
    }

    #[test]
    fn normalizes_and_encodes_safe_paths() {
        let decoded = decode_request_path("//café/space name.txt").expect("valid path");
        assert_eq!(decoded.url_path, "/caf%C3%A9/space%20name.txt");
        assert_eq!(decoded.path, PathBuf::from("café").join("space name.txt"));
    }

    #[test]
    fn parses_supported_ranges() {
        let value = HeaderValue::from_static("bytes=2-5");
        assert!(matches!(
            parse_range_header(Some(&value), 10),
            RangeResult::Range { start: 2, end: 5 }
        ));
        let value = HeaderValue::from_static("bytes=-3");
        assert!(matches!(
            parse_range_header(Some(&value), 10),
            RangeResult::Range { start: 7, end: 9 }
        ));
        let value = HeaderValue::from_static("bytes=10-20");
        assert!(matches!(
            parse_range_header(Some(&value), 10),
            RangeResult::Unsatisfiable
        ));
    }

    #[test]
    fn formats_human_readable_file_sizes() {
        assert_eq!(format_file_size(0), "0 B");
        assert_eq!(format_file_size(999), "999 B");
        assert_eq!(format_file_size(1024), "1 KB");
        assert_eq!(format_file_size(1536), "1.5 KB");
        assert_eq!(format_file_size(10 * 1024), "10 KB");
        assert_eq!(format_file_size(3 * 1024 * 1024), "3 MB");
    }
}
