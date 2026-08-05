use std::collections::HashMap;
use std::fmt::Write as _;
use std::net::SocketAddr;
use std::path::Path;
use std::time::Duration;

use ok200_core::{RunningServer, ServerConfig};
use serde::Deserialize;
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::task::JoinSet;
use tokio::time::timeout;

const CORPUS_JSON: &str = include_str!("../../../tests/http-conformance/corpus-v1.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Corpus {
    schema_version: u32,
    contract_version: String,
    runtimes: Vec<String>,
    configurations: HashMap<String, ContractConfiguration>,
    fixture: ContractFixture,
    cases: Vec<ContractCase>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContractConfiguration {
    cors: bool,
    spa: bool,
    directory_listing: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContractFixture {
    directories: Vec<String>,
    files: Vec<FixtureFile>,
    symlink_escapes: Vec<FixtureSymlink>,
}

#[derive(Deserialize)]
struct FixtureFile {
    path: String,
    utf8: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureSymlink {
    path: String,
    outside_utf8: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContractCase {
    id: String,
    kind: String,
    configuration: String,
    request: Option<ContractRequest>,
    concurrency: Option<usize>,
    oversized_header_bytes: Option<usize>,
    claims: Vec<String>,
    exclusions: HashMap<String, String>,
    expect: ContractExpectation,
}

#[derive(Clone, Deserialize)]
struct ContractRequest {
    method: String,
    target: String,
    #[serde(default)]
    headers: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContractExpectation {
    statuses: Vec<u16>,
    body_equals: Option<String>,
    body_empty: Option<bool>,
    #[serde(default)]
    body_contains: Vec<String>,
    #[serde(default)]
    body_excludes: Vec<String>,
    #[serde(default)]
    headers_present: Vec<String>,
    #[serde(default)]
    headers_absent: Vec<String>,
    #[serde(default)]
    headers_equal: HashMap<String, String>,
    #[serde(default)]
    headers_prefix: HashMap<String, String>,
}

struct TestFixture {
    root: TempDir,
    _outside: TempDir,
}

struct TestResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl TestResponse {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .get(&name.to_ascii_lowercase())
            .map(String::as_str)
    }
}

#[tokio::test]
async fn passes_shared_http_conformance_v1() {
    let corpus: Corpus = serde_json::from_str(CORPUS_JSON).expect("parse shared HTTP corpus");
    assert_eq!(corpus.schema_version, 1);
    assert!(corpus.runtimes.iter().any(|runtime| runtime == "rust"));
    let fixture = build_fixture(&corpus.fixture).await;
    let mut claimed = 0;

    for case in &corpus.cases {
        if !case.claims.iter().any(|runtime| runtime == "rust") {
            assert!(
                case.exclusions.contains_key("rust"),
                "{}: missing Rust exclusion",
                case.id
            );
            continue;
        }
        claimed += 1;
        let configuration = corpus
            .configurations
            .get(&case.configuration)
            .unwrap_or_else(|| panic!("{}: missing configuration", case.id));
        run_case(case, configuration, fixture.root.path()).await;
    }

    println!(
        "HTTP conformance {}: rust claimed {claimed} cases",
        corpus.contract_version
    );
}

async fn build_fixture(specification: &ContractFixture) -> TestFixture {
    let root = TempDir::new().expect("create conformance root");
    let outside = TempDir::new().expect("create outside root");
    for directory in &specification.directories {
        tokio::fs::create_dir_all(root.path().join(directory))
            .await
            .expect("create fixture directory");
    }
    for file in &specification.files {
        let path = root.path().join(&file.path);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .expect("create fixture parent");
        }
        tokio::fs::write(path, file.utf8.as_bytes())
            .await
            .expect("write fixture file");
    }
    for (index, link) in specification.symlink_escapes.iter().enumerate() {
        let target = outside.path().join(format!("outside-{index}.txt"));
        tokio::fs::write(&target, link.outside_utf8.as_bytes())
            .await
            .expect("write outside fixture");
        create_file_symlink(&target, &root.path().join(&link.path));
    }
    TestFixture {
        root,
        _outside: outside,
    }
}

#[cfg(unix)]
fn create_file_symlink(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).expect("create fixture symlink");
}

#[cfg(windows)]
fn create_file_symlink(target: &Path, link: &Path) {
    std::os::windows::fs::symlink_file(target, link).expect("create fixture symlink");
}

async fn run_case(case: &ContractCase, configuration: &ContractConfiguration, root: &Path) {
    match case.kind.as_str() {
        "request" => {
            let server = start_server(root, configuration).await;
            let request = resolve_request(
                &server,
                case.request.as_ref().expect("request case has request"),
            )
            .await;
            let response = request_at(server.local_addr(), &render_request(&request)).await;
            assert_response(case, &response);
            server.stop().await.expect("stop conformance server");
        }
        "oversizedHead" => {
            let server = start_server(root, configuration).await;
            let count = case.oversized_header_bytes.expect("oversized byte count");
            let request = format!(
                "GET / HTTP/1.1\r\nHost: localhost\r\nX-Oversized: {}\r\nConnection: close\r\n\r\n",
                "x".repeat(count)
            );
            let response = request_at(server.local_addr(), &request).await;
            assert_response(case, &response);
            server.stop().await.expect("stop conformance server");
        }
        "concurrency" => {
            let server = start_server(root, configuration).await;
            let request = render_request(case.request.as_ref().expect("concurrency request"));
            let mut tasks = JoinSet::new();
            for _ in 0..case.concurrency.expect("concurrency count") {
                let request = request.clone();
                let address = server.local_addr();
                tasks.spawn(async move { request_at(address, &request).await });
            }
            while let Some(response) = tasks.join_next().await {
                assert_response(case, &response.expect("join conformance request"));
            }
            server.stop().await.expect("stop conformance server");
        }
        "restart" => {
            let first = start_server(root, configuration).await;
            assert_ne!(first.local_addr().port(), 0, "{}: automatic port", case.id);
            first.stop().await.expect("stop first conformance server");
            let second = start_server(root, configuration).await;
            let response = request_at(
                second.local_addr(),
                &render_request(&ContractRequest {
                    method: "GET".to_owned(),
                    target: "/".to_owned(),
                    headers: HashMap::new(),
                }),
            )
            .await;
            assert_response(case, &response);
            second
                .stop()
                .await
                .expect("stop restarted conformance server");
        }
        kind => panic!("{}: unsupported kind {kind}", case.id),
    }
}

async fn start_server(root: &Path, source: &ContractConfiguration) -> RunningServer {
    let mut configuration = ServerConfig::new(root);
    configuration.port = 0;
    configuration.cors = source.cors;
    configuration.spa = source.spa;
    configuration.directory_listing = source.directory_listing;
    RunningServer::start(configuration)
        .await
        .expect("start conformance server")
}

async fn resolve_request(server: &RunningServer, request: &ContractRequest) -> ContractRequest {
    let mut resolved = request.clone();
    for value in resolved.headers.values_mut() {
        let Some((header, path)) = value
            .strip_prefix('$')
            .and_then(|value| value.split_once(':'))
        else {
            continue;
        };
        let preflight = request_at(
            server.local_addr(),
            &render_request(&ContractRequest {
                method: "GET".to_owned(),
                target: path.to_owned(),
                headers: HashMap::new(),
            }),
        )
        .await;
        let header_name = match header {
            "etag" => "etag",
            "last-modified" => "last-modified",
            _ => panic!("unknown header placeholder {header}"),
        };
        preflight
            .header(header_name)
            .unwrap_or_else(|| panic!("missing preflight header {header_name}"))
            .clone_into(value);
    }
    resolved
}

fn render_request(request: &ContractRequest) -> String {
    let mut output = format!(
        "{} {} HTTP/1.1\r\nHost: localhost\r\n",
        request.method, request.target
    );
    for (name, value) in &request.headers {
        let _ = write!(output, "{name}: {value}\r\n");
    }
    output.push_str("Connection: close\r\n\r\n");
    output
}

async fn request_at(address: SocketAddr, raw_request: &str) -> TestResponse {
    let mut stream = TcpStream::connect(address)
        .await
        .expect("connect conformance client");
    stream
        .write_all(raw_request.as_bytes())
        .await
        .expect("write conformance request");
    let mut bytes = Vec::new();
    timeout(Duration::from_secs(3), stream.read_to_end(&mut bytes))
        .await
        .expect("conformance response timeout")
        .expect("read conformance response");
    parse_response(&bytes)
}

fn parse_response(bytes: &[u8]) -> TestResponse {
    let split = bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("response header terminator");
    let head = String::from_utf8_lossy(&bytes[..split]);
    let mut lines = head.lines();
    let status = lines
        .next()
        .expect("status line")
        .split_whitespace()
        .nth(1)
        .expect("status code")
        .parse()
        .expect("numeric status");
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_owned()))
        .collect();
    TestResponse {
        status,
        headers,
        body: bytes[split + 4..].to_vec(),
    }
}

fn assert_response(case: &ContractCase, response: &TestResponse) {
    let expectation = &case.expect;
    assert!(
        expectation.statuses.contains(&response.status),
        "{}: unexpected status {}",
        case.id,
        response.status
    );
    let body = String::from_utf8_lossy(&response.body);
    if let Some(expected) = &expectation.body_equals {
        assert_eq!(&*body, expected, "{}: body", case.id);
    }
    if expectation.body_empty == Some(true) {
        assert!(response.body.is_empty(), "{}: expected empty body", case.id);
    }
    for expected in &expectation.body_contains {
        assert!(
            body.contains(expected),
            "{}: body missing {expected:?}",
            case.id
        );
    }
    for excluded in &expectation.body_excludes {
        assert!(
            !body.contains(excluded),
            "{}: body contained {excluded:?}",
            case.id
        );
    }
    for name in &expectation.headers_present {
        assert!(
            response.header(name).is_some(),
            "{}: missing header {name}",
            case.id
        );
    }
    for name in &expectation.headers_absent {
        assert!(
            response.header(name).is_none(),
            "{}: unexpected header {name}",
            case.id
        );
    }
    for (name, expected) in &expectation.headers_equal {
        assert_eq!(
            response.header(name),
            Some(expected.as_str()),
            "{}: header {name}",
            case.id
        );
    }
    for (name, prefix) in &expectation.headers_prefix {
        assert!(
            response
                .header(name)
                .is_some_and(|value| value.starts_with(prefix)),
            "{}: header {name} did not start with {prefix:?}",
            case.id
        );
    }
}
