# 002: Standalone Rust HTTP Core

Status: **complete; human review checkpoint before Tauri integration.**

Topic: `desktop-native-core`

Parent: [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

## Objective

Build and test a Tauri-independent `ok200-core` Rust crate plus a development
CLI. Stop at a clean library boundary before wiring it into Tauri state or the
React UI.

This is the first human review checkpoint for the native-runtime work. It proves
that a conventional native server can replace the desktop request path without
mixing the proof with UI, persistence, updater, or packaging changes.

## Desktop-visible configuration baseline

The current desktop UI exposes exactly these server controls:

| UI control | TypeScript field | Rust-core contract |
|---|---|---|
| Directory | `root` | Existing readable directory, canonicalized once at start |
| Port | `port` | `0` or `1..=65535`; return the actual bound port |
| LAN access | `host` | Parsed IP address; UI currently selects loopback or `0.0.0.0` |
| Directory listing | `directoryListing` | Serve an escaped, URL-encoded listing when no index exists |
| CORS | `cors` | Wildcard origin/headers and GET/HEAD/OPTIONS methods |
| SPA mode | `spa` | Serve root `index.html` only after an otherwise missing path |

`quiet`, upload body limits, upload, and TLS exist in the engine configuration
but are not exposed by the desktop UI. The core always emits bounded structured
logs; the caller decides whether to display them. Upload and TLS are deferred
from this slice and return no accidental write capability.

The desktop currently creates one in-memory `default` server and does not
persist that server configuration. Tray/background preferences are separate
Rust settings and are outside this crate.

## Compatibility baseline

The initial black-box corpus is taken from
`packages/engine/src/server/web-server.test.ts` and covers:

- file and nested-file GET with MIME types;
- directory `index.html`, listing, and listing-disabled behavior;
- UTF-8 and reserved characters in paths and listing links;
- `HEAD` body suppression with the GET content length;
- single, suffix, open-ended, invalid, and unsatisfiable byte ranges;
- `ETag`/`If-None-Match` semantics;
- SPA fallback;
- CORS and OPTIONS;
- method rejection;
- canonical root containment and symlinks; and
- start on port zero, stop, and restart on a released port.

Semantic compatibility is required, not byte-identical generated HTML or ETag
tokens. The Rust core deliberately rejects decoded `.`/`..`, NUL, backslash,
and drive-prefix colon path components with `400` instead of normalizing
traversal-like input as the TypeScript implementation does. Symlinks resolving
outside the configured root return `403`; symlinks staying inside are served.

## Implementation decisions

- [x] Add `desktop/core` as workspace package `ok200-core`.
- [x] Use Tokio and Axum/Hyper rather than a custom HTTP parser.
- [x] Keep all public core types free of Tauri dependencies.
- [x] Canonicalize the root at startup and every served target before access.
- [x] Stream files from native async file handles.
- [x] Bound parsed request metadata and the structured-log broadcast channel.
- [x] Expose observable status and graceful shutdown.
- [x] Add a small `ok200-core` development binary using the same library API.
- [x] Test with temporary roots and real TCP sockets.

## Deferred from this slice

- Tauri commands, managed state, events, dialogs, and config persistence;
- removal of the TypeScript desktop server or primitive TCP/filesystem IPC;
- uploads, TLS, authentication, multiple roots, and remote management;
- Android, Node CLI, and extension runtime changes;
- release packaging; and
- before/after Tauri process memory measurements.

## Validation

```bash
cd desktop
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p ok200-core -- --root /tmp --port 0
```

The final CLI smoke should fetch a real file over loopback, stop on interrupt,
and leave no listener behind.

## Result

Implemented in commit `f0559cf`.

The public crate surface is deliberately small:

- `ServerConfig` contains the desktop-visible serving options plus core safety
  bounds;
- `RunningServer::start` validates/canonicalizes configuration and returns the
  actual bound address;
- `RunningServer` exposes current status plus bounded broadcast subscriptions
  for status and structured request/error logs; and
- `RunningServer::stop` performs graceful shutdown with a bounded fallback.

The development binary is also named `ok200-core`. It is explicitly not a
replacement for the published Node `ok200` CLI.

## Validation evidence

Completed on an Apple Silicon Mac on 2026-07-28:

- `cargo fmt --all -- --check` passed;
- `cargo clippy --workspace --all-targets -- -D warnings` passed;
- `cargo test --workspace` passed all 36 tests;
- the core itself passed 13 tests, including eight real-socket integration
  tests;
- the release-mode development binary served `desktop/core/Cargo.toml` with
  `200`, native streaming headers, and the expected TOML MIME type;
- Ctrl-C exited cleanly and the selected listener no longer accepted a
  connection; and
- Actionlint `v1.7.12` and the six release-validator tests still passed after
  adding the core to desktop CI.

The unstripped release binary was 2.0 MiB on arm64. The standalone quiet process
reported 2,944 KiB RSS at idle and 3,232 KiB after one request. These are
directional core-only numbers, not a before/after Tauri product comparison; the
webview remains an accepted fixed UI cost. A pre-release tactical must measure
the whole released and candidate desktop apps on the same machine.

The workspace-wide Clippy pass also removed unnecessary `unsafe` wrappers in
native-host tests and formatted one pre-existing unreadable numeric fixture.
There was no production behavior change in either cleanup.

## Review gate

Accepted on 2026-07-28 before Tactical 003 began. The reviewed boundary was:

1. the `ServerConfig` / `RunningServer` boundary;
2. the explicit upload and TLS deferral;
3. strict canonical containment and cross-platform path rejection;
4. the bounded shutdown and log-channel behavior; and
5. using Axum/Hyper as a conventional implementation detail.

Tactical 003 then added Rust managed state, commands/events, persisted DTO
mapping, and UI start/stop integration before deleting the TypeScript desktop
path in a separate commit. The same executable corpus comparison remains a
pre-release follow-up.
