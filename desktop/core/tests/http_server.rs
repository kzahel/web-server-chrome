use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::Path;
use std::time::Duration;

use ok200_core::{CoreError, RunningServer, ServerConfig, ServerStatus};
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

struct TestResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl TestResponse {
    fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .get(&name.to_ascii_lowercase())
            .map(String::as_str)
    }
}

async fn request(server: &RunningServer, raw_request: &str) -> TestResponse {
    let mut stream = TcpStream::connect(server.local_addr())
        .await
        .expect("connect to test server");
    stream
        .write_all(raw_request.as_bytes())
        .await
        .expect("write test request");
    let mut bytes = Vec::new();
    timeout(Duration::from_secs(2), stream.read_to_end(&mut bytes))
        .await
        .expect("response timeout")
        .expect("read test response");
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

fn test_config(root: &Path) -> ServerConfig {
    let mut config = ServerConfig::new(root);
    config.port = 0;
    config
}

fn close_request(method: &str, path: &str, headers: &[(&str, &str)]) -> String {
    let mut request = format!("{method} {path} HTTP/1.1\r\nHost: localhost\r\n");
    for (name, value) in headers {
        let _ = write!(request, "{name}: {value}\r\n");
    }
    request.push_str("Connection: close\r\n\r\n");
    request
}

#[tokio::test]
async fn serves_files_indexes_mime_and_head_over_real_sockets() {
    let root = TempDir::new().expect("temporary root");
    tokio::fs::write(root.path().join("index.html"), "<h1>Home</h1>")
        .await
        .expect("write index");
    tokio::fs::create_dir(root.path().join("sub"))
        .await
        .expect("create subdirectory");
    tokio::fs::write(root.path().join("sub/data.json"), br#"{"ok":true}"#)
        .await
        .expect("write JSON");

    let server = RunningServer::start(test_config(root.path()))
        .await
        .expect("start server");
    assert_eq!(server.status(), ServerStatus::Running);
    assert_ne!(server.local_addr().port(), 0);

    let index = request(&server, &close_request("GET", "/", &[])).await;
    assert_eq!(index.status, 200);
    assert_eq!(index.text(), "<h1>Home</h1>");
    assert!(index
        .header("content-type")
        .is_some_and(|value| value.starts_with("text/html")));

    let json = request(&server, &close_request("GET", "/sub/data.json", &[])).await;
    assert_eq!(json.status, 200);
    assert_eq!(json.text(), r#"{"ok":true}"#);
    assert_eq!(
        json.header("content-type"),
        Some("application/json; charset=utf-8")
    );

    let head = request(&server, &close_request("HEAD", "/sub/data.json", &[])).await;
    assert_eq!(head.status, 200);
    assert!(head.body.is_empty());
    assert_eq!(head.header("content-length"), Some("11"));

    server.stop().await.expect("stop server");
}

#[tokio::test]
async fn lists_directories_with_safe_links_and_can_disable_listings() {
    let root = TempDir::new().expect("temporary root");
    for name in [
        "space name.txt",
        "100% real.txt",
        "hash#q?.txt",
        "café.txt",
        "<script>.txt",
    ] {
        tokio::fs::write(root.path().join(name), name)
            .await
            .expect("write listing file");
    }

    let config = test_config(root.path());
    let server = RunningServer::start(config.clone())
        .await
        .expect("start listing server");
    let listing = request(&server, &close_request("GET", "/", &[])).await;
    assert_eq!(listing.status, 200);
    let html = listing.text();
    assert!(html.contains("href=\"/space%20name.txt\""));
    assert!(html.contains("href=\"/100%25%20real.txt\""));
    assert!(html.contains("href=\"/hash%23q%3F.txt\""));
    assert!(html.contains("href=\"/caf%C3%A9.txt\""));
    assert!(html.contains("&lt;script&gt;.txt"));
    assert!(!html.contains("<script>.txt"));

    let released_port = server.local_addr().port();
    server.stop().await.expect("stop listing server");

    let mut no_listing = config;
    no_listing.port = released_port;
    no_listing.directory_listing = false;
    let restarted = RunningServer::start(no_listing)
        .await
        .expect("restart on released port");
    let missing = request(&restarted, &close_request("GET", "/", &[])).await;
    assert_eq!(missing.status, 404);
    restarted.stop().await.expect("stop restarted server");
}

#[tokio::test]
async fn supports_etags_and_single_byte_ranges() {
    let root = TempDir::new().expect("temporary root");
    tokio::fs::write(root.path().join("range.txt"), "0123456789")
        .await
        .expect("write range file");
    let server = RunningServer::start(test_config(root.path()))
        .await
        .expect("start server");

    let full = request(&server, &close_request("GET", "/range.txt", &[])).await;
    assert_eq!(full.status, 200);
    assert_eq!(full.text(), "0123456789");
    assert_eq!(full.header("accept-ranges"), Some("bytes"));
    let etag = full.header("etag").expect("ETag").to_owned();

    let cached = request(
        &server,
        &close_request("GET", "/range.txt", &[("If-None-Match", &etag)]),
    )
    .await;
    assert_eq!(cached.status, 304);
    assert!(cached.body.is_empty());

    let range = request(
        &server,
        &close_request("GET", "/range.txt", &[("Range", "bytes=2-5")]),
    )
    .await;
    assert_eq!(range.status, 206);
    assert_eq!(range.text(), "2345");
    assert_eq!(range.header("content-range"), Some("bytes 2-5/10"));
    assert_eq!(range.header("content-length"), Some("4"));

    let suffix = request(
        &server,
        &close_request("GET", "/range.txt", &[("Range", "bytes=-3")]),
    )
    .await;
    assert_eq!(suffix.status, 206);
    assert_eq!(suffix.text(), "789");

    let case_insensitive = request(
        &server,
        &close_request("GET", "/range.txt", &[("Range", "Bytes=0-1")]),
    )
    .await;
    assert_eq!(case_insensitive.status, 206);
    assert_eq!(case_insensitive.text(), "01");

    let open_ended = request(
        &server,
        &close_request("GET", "/range.txt", &[("Range", "bytes=8-")]),
    )
    .await;
    assert_eq!(open_ended.status, 206);
    assert_eq!(open_ended.text(), "89");

    let head = request(
        &server,
        &close_request("HEAD", "/range.txt", &[("Range", "bytes=1-3")]),
    )
    .await;
    assert_eq!(head.status, 206);
    assert!(head.body.is_empty());
    assert_eq!(head.header("content-length"), Some("3"));

    let invalid = request(
        &server,
        &close_request("GET", "/range.txt", &[("Range", "nibbles=1-2")]),
    )
    .await;
    assert_eq!(invalid.status, 200);
    assert_eq!(invalid.text(), "0123456789");

    let unsatisfiable = request(
        &server,
        &close_request("GET", "/range.txt", &[("Range", "bytes=20-30")]),
    )
    .await;
    assert_eq!(unsatisfiable.status, 416);
    assert_eq!(unsatisfiable.header("content-range"), Some("bytes */10"));
    assert_eq!(unsatisfiable.text(), "Range Not Satisfiable");

    server.stop().await.expect("stop server");
}

#[tokio::test]
async fn handles_spa_cors_options_and_method_rejection() {
    let root = TempDir::new().expect("temporary root");
    tokio::fs::write(root.path().join("index.html"), "<div id=\"app\"></div>")
        .await
        .expect("write SPA index");
    let mut config = test_config(root.path());
    config.spa = true;
    config.cors = true;
    let server = RunningServer::start(config).await.expect("start server");

    let spa = request(&server, &close_request("GET", "/some/route", &[])).await;
    assert_eq!(spa.status, 200);
    assert_eq!(spa.text(), "<div id=\"app\"></div>");
    assert_eq!(spa.header("access-control-allow-origin"), Some("*"));

    let options = request(&server, &close_request("OPTIONS", "/anything", &[])).await;
    assert_eq!(options.status, 204);
    assert!(options.body.is_empty());
    assert_eq!(
        options.header("access-control-allow-methods"),
        Some("GET, HEAD, OPTIONS")
    );

    let post = request(&server, &close_request("POST", "/", &[])).await;
    assert_eq!(post.status, 405);
    assert_eq!(post.header("allow"), Some("GET, HEAD, OPTIONS"));
    assert_eq!(post.text(), "Method Not Allowed");

    server.stop().await.expect("stop server");
}

#[tokio::test]
async fn rejects_malformed_and_traversal_paths_and_oversized_headers() {
    let root = TempDir::new().expect("temporary root");
    let mut config = test_config(root.path());
    config.max_header_bytes = 1024;
    let server = RunningServer::start(config).await.expect("start server");

    for path in ["/../secret", "/%2e%2e/secret", "/bad%ZZ", "/a%00b"] {
        let response = request(&server, &close_request("GET", path, &[])).await;
        assert_eq!(response.status, 400, "{path}");
    }

    let oversized = "x".repeat(1100);
    let response = request(
        &server,
        &close_request("GET", "/", &[("X-Oversized", &oversized)]),
    )
    .await;
    assert_eq!(response.status, 431);

    server.stop().await.expect("stop server");
}

#[cfg(unix)]
#[tokio::test]
async fn enforces_canonical_containment_for_symlinks() {
    use std::os::unix::fs::symlink;

    let root = TempDir::new().expect("temporary root");
    let outside = TempDir::new().expect("outside temporary directory");
    tokio::fs::write(root.path().join("inside.txt"), "inside")
        .await
        .expect("write inside file");
    tokio::fs::write(outside.path().join("secret.txt"), "outside secret")
        .await
        .expect("write outside file");
    symlink(
        root.path().join("inside.txt"),
        root.path().join("inside-link.txt"),
    )
    .expect("create inside symlink");
    symlink(
        outside.path().join("secret.txt"),
        root.path().join("escape-link.txt"),
    )
    .expect("create escape symlink");

    let server = RunningServer::start(test_config(root.path()))
        .await
        .expect("start server");
    let inside = request(&server, &close_request("GET", "/inside-link.txt", &[])).await;
    assert_eq!(inside.status, 200);
    assert_eq!(inside.text(), "inside");

    let escape = request(&server, &close_request("GET", "/escape-link.txt", &[])).await;
    assert_eq!(escape.status, 403);
    assert!(!escape.text().contains("outside secret"));

    server.stop().await.expect("stop server");
}

#[tokio::test]
async fn emits_structured_request_logs() {
    let root = TempDir::new().expect("temporary root");
    tokio::fs::write(root.path().join("hello.txt"), "hello")
        .await
        .expect("write file");
    let server = RunningServer::start(test_config(root.path()))
        .await
        .expect("start server");
    let mut logs = server.subscribe_logs();

    let response = request(&server, &close_request("GET", "/hello.txt?x=1", &[])).await;
    assert_eq!(response.status, 200);
    let log = timeout(Duration::from_secs(1), logs.recv())
        .await
        .expect("log timeout")
        .expect("request log");
    assert_eq!(log.method, "GET");
    assert_eq!(log.path, "/hello.txt?x=1");
    assert_eq!(log.status, 200);
    assert_eq!(log.response_bytes, 5);
    assert!(log.remote_addr.starts_with("127.0.0.1:"));
    assert_eq!(log.error, None);

    server.stop().await.expect("stop server");
}

#[tokio::test]
async fn rejects_missing_or_non_directory_roots() {
    let root = TempDir::new().expect("temporary root");
    let missing = root.path().join("missing");
    let Err(error) = RunningServer::start(ServerConfig::new(&missing)).await else {
        panic!("missing root should fail");
    };
    assert!(matches!(error, CoreError::InvalidRoot { .. }));

    let file = root.path().join("file.txt");
    tokio::fs::write(&file, "not a directory")
        .await
        .expect("write file root");
    let Err(error) = RunningServer::start(ServerConfig::new(&file)).await else {
        panic!("file root should fail");
    };
    assert!(matches!(error, CoreError::InvalidConfig(_)));
}
