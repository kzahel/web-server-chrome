# 002: Standalone Rust HTTP Core

Status: **active.**

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

- [ ] Add `desktop/core` as workspace package `ok200-core`.
- [ ] Use Tokio and Axum/Hyper rather than a custom HTTP parser.
- [ ] Keep all public core types free of Tauri dependencies.
- [ ] Canonicalize the root at startup and every served target before access.
- [ ] Stream files from native async file handles.
- [ ] Bound parsed request metadata and the structured-log broadcast channel.
- [ ] Expose observable status and graceful shutdown.
- [ ] Add a small `ok200-core` development binary using the same library API.
- [ ] Test with temporary roots and real TCP sockets.

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
