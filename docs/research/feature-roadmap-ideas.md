# Feature Roadmap Ideas

Status: **historical research and feature inventory.** Its early Rust-core
notes anticipated the accepted desktop direction, but its Rust CLI, Android
JNI, iOS, sequencing, and unchecked task states are not current commitments.
See [`../topics/desktop-runtime.md`](../topics/desktop-runtime.md) and
[`../topics/android-runtime.md`](../topics/android-runtime.md). Tactical 000
owns the accepted desktop sequence.

## Phase 0: CLI Server (Start Here)

CLI-first. Build the Rust binary, test everything without GUI overhead.
`ok200 serve .` should just work.

- [ ] Serve static files from a directory argument (default: cwd)
- [ ] `--port` flag (default: 8080)
- [ ] Directory listing (when no index.html)
- [ ] Auto-serve index.html
- [ ] MIME type detection
- [ ] `--host` flag (default: 127.0.0.1, `--host 0.0.0.0` for LAN)
- [ ] Graceful shutdown (ctrl-c)
- [ ] Request logging to stdout
- [ ] `--cors` flag
- [ ] `--spa` flag (rewrite missing paths to index.html)

This replaces `python -m http.server` and `npx serve` with something
fast and tiny. Ship it to crates.io / homebrew as a standalone tool.

## Phase 0.5: Tauri Shell

Wrap the CLI core in a Tauri app with minimal UI:

- [ ] Directory picker
- [ ] Port input
- [ ] Start/stop button
- [ ] Show clickable server URL(s)
- [ ] Request log viewer (stream from core)
- [ ] LAN toggle
- [ ] CORS / SPA toggles

The Tauri app just calls into the same Rust library. No duplication.

## Phase 1: Feature Parity with Original Chrome App

- [ ] HTTPS with self-signed cert generation
- [ ] HTTP Basic Auth
- [ ] File upload (PUT)
- [ ] IPv6 support
- [ ] Range request support (media streaming)
- [ ] Custom error pages (404)

## Phase 2: Quality of Life

Things SWS added that are genuinely useful:

- [ ] Multiple simultaneous servers
- [ ] Custom error pages (404 at minimum)
- [ ] Clean URLs (strip .html)
- [ ] Precompressed file serving (.gz/.br)
- [ ] Cache-Control header config
- [ ] Hidden/dot file toggles
- [ ] File delete support
- [ ] IP throttling
- [ ] System tray / background mode

## Phase 3: Differentiation

Things neither has that would make us stand out:

- [ ] **QR code for mobile access** - show QR in UI for LAN URL, huge for
      mobile testing workflows
- [ ] **Live reload** - inject script, watch for file changes, auto-refresh
      browser. This is the #1 thing developers actually want
- [ ] **Drag-and-drop upload in browser** - web UI for uploading files, not
      just PUT requests
- [ ] **Custom response headers** - arbitrary header injection, useful for
      testing CSP, security headers, etc.
- [ ] **Request log viewer** - built into the app UI, not just a log file
- [ ] **Reverse proxy** - proxy specific paths to another server
- [ ] **Markdown rendering** - render .md files as HTML on the fly
- [ ] **Network speed throttling** - simulate slow connections for testing
- [ ] **API mock mode** - define simple JSON responses for paths

## Phase 4: Power Features

- [ ] Virtual hosts (multiple domains on one port)
- [ ] WebSocket echo server (for testing)
- [ ] gRPC reflection/testing
- [ ] Config file import/export
- [ ] Shareable config links

## What to Skip (Probably)

These are things SWS has that might not be worth the complexity:

- **Plugin system** - over-engineered for this use case. Better to just build
  the features people want directly
- **.swshtaccess files** - too niche, adds maintenance burden
- **18 language translations** - nice but not MVP. Start with English, add
  i18n framework later
- **On-the-fly compression** - even SWS says it's slow. Precompression is
  better

## Architecture Notes

The following is the original Rust-core proposal, not current architecture.
Desktop adopted the Rust core; Android subsequently adopted a separate native
Kotlin core rather than the proposed JNI path. The CLI remains Node/TypeScript.

### Rust Core Module
The HTTP server should be a standalone Rust library/crate that:
- Has zero UI dependencies
- Can be used from Tauri (desktop)
- Can be used from Android via JNI/FFI
- Could potentially be used as a CLI tool
- Could potentially be compiled to WASM

This is the key architectural decision. The server logic lives in Rust,
the UI is platform-specific.

```
ok200-core (Rust library crate - the server engine)
  |
  +-- ok200-cli (Rust binary crate - Phase 0, ships standalone)
  |     `ok200 serve . --port 3000 --cors`
  |
  +-- tauri-app (desktop: Windows/macOS/Linux - Phase 0.5)
  |     +-- Rust backend (uses ok200-core directly, no CLI shelling)
  |     +-- Web frontend (HTML/CSS/JS or framework)
  |
  +-- android-app (Android/ChromeOS - Phase 1+)
  |     +-- Kotlin/Java app
  |     +-- ok200-core via JNI
  |
  +-- (future) ios-app
```

### Why Rust for the core
- Performance: handles concurrent connections efficiently
- Small binary size (vs bundling Node.js)
- Cross-platform FFI: works with JNI (Android), C ABI (iOS), direct (Tauri)
- Memory safety without GC
- Great HTTP ecosystem (hyper, axum, actix, etc.)
- The Tauri runtime is already Rust, so it's natural

### HTTP Library Candidates
- **hyper** - low-level, maximum control, widely used
- **axum** - built on hyper, ergonomic, tokio ecosystem
- **actix-web** - high performance, actor model
- **warp** - filter-based, composable
- **tiny-http** - minimal, synchronous, very small binary

For a lightweight local server, **axum** or **tiny-http** are good candidates.
Axum if we want async + middleware. Tiny-http if we want absolute minimum size.

### Frontend for Tauri
Options for the webview UI:
- **Vanilla HTML/CSS/JS** - smallest, fastest, but more work
- **Svelte** - small bundle, good DX, Tauri docs use it
- **Solid** - tiny runtime, reactive
- **React** - familiar but heavier
- **Leptos/Yew** - Rust WASM frameworks, all-Rust stack

Svelte or vanilla are probably the best fit for "lightweight."
