# ok200-core

Native static HTTP server for the 200 OK desktop application.

The library has no Tauri or webview dependency. It owns HTTP handling, safe
filesystem resolution, file streaming, lifecycle, status, and structured
request logs. A small development binary exercises that same public API before
the Tauri integration is switched over.

## Development CLI

From `desktop/`:

```bash
cargo run -p ok200-core -- --root ../examples --port 8080
```

Use port `0` to select a free port. Other options:

```text
--host IP
--cors
--spa
--no-directory-listing
--quiet
```

This is not the published Node `ok200` CLI. It is a native-core development and
smoke-test surface.

## Library boundary

Create a `ServerConfig`, call `RunningServer::start`, subscribe to status or log
events as needed, and call `stop` for graceful shutdown:

```rust,no_run
use ok200_core::{RunningServer, ServerConfig};

# async fn example() -> Result<(), Box<dyn std::error::Error>> {
let mut config = ServerConfig::new(".");
config.port = 0;

let server = RunningServer::start(config).await?;
println!("listening on {}", server.local_addr());
server.stop().await?;
# Ok(())
# }
```

Tauri integration should translate narrow command/event DTOs at its boundary.
It should not expose Axum types or move HTTP/file bytes through Tauri IPC.

## Validation

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

The integration suite uses temporary roots and real loopback TCP sockets.
Uploads and TLS are deliberately absent from this first desktop-visible
contract.
