# Desktop Runtime

> The desktop product keeps Tauri and its webview for control/configuration,
> but the HTTP server moves out of JavaScript and into a small Rust core shared
> by the Windows, macOS, and Linux builds.

Topic: desktop-native-core

Status: **Rust-native desktop cutover implemented on `main`; human product
smoke and release proof pending.** The already-published desktop `v0.1.3`
still runs the older TypeScript HTTP engine in the webview.

Last reconciled: **2026-07-28**.

Implementation sequencing lives in
[Tactical 000](../tactical/000-desktop-native-core-and-release-readiness.md);
the standalone core boundary and compatibility baseline are recorded in
[Tactical 002](../tactical/002-standalone-rust-http-core.md), and the desktop
cutover is recorded in
[Tactical 003](../tactical/003-native-desktop-control-surface.md). The compact
portrait review surface and browser-like Rust directory listing are recorded
in
[Tactical 004](../tactical/004-portrait-desktop-polish-and-directory-listing.md).
Current product naming is governed by
[`product-branding.md`](product-branding.md).

## Scope

This topic owns:

- the current and target desktop runtime boundary;
- ownership of desktop HTTP behavior, configuration, and lifecycle;
- what remains in the Tauri webview;
- compatibility during the desktop migration; and
- the relationship between desktop, Android, the CLI, and the extension.

It does not require one runtime implementation across every product. In
particular, it does not reopen the Transistor/QuickJS architecture experiment.
Android and the CLI keep their currently shipped implementations until a
separate decision changes them.

## Product decision

The project is a replacement for the legacy Chrome packaged app, not a vehicle
for proving a cross-platform JavaScript socket/filesystem architecture.

The desktop target is:

```text
Tauri webview
  React controls: roots, port, options, start/stop, status, logs
       |
       | narrow typed Tauri commands and events
       v
Rust desktop application state
       |
       +-- ok200-core: HTTP parsing/serving, lifecycle, config validation
       +-- native filesystem and networking
       +-- persistence and request-log event production
```

The webview is a management surface. It must not accept sockets, parse HTTP,
stream file bytes, or keep the server alive. Closing or reloading the webview
must not accidentally stop a server that is configured to remain in the
background.

“Shared Rust core” currently means one native core reused across macOS,
Windows, and Linux. Android JNI and a Rust CLI are possible future consumers,
not requirements for this migration.

## Current implementation

| Surface | Runtime | Current role | Direction |
|---|---|---|---|
| Desktop `main` | Tauri/React control surface; Rust owns persisted server state and `ok200-core` owns native HTTP/filesystem/networking | Unsigned local review build | Complete human smoke, compatibility/resource comparison, signing, and release gates |
| Desktop release `v0.1.3` | Tauri webview runs `@ok200/engine`; Rust exposes TCP/filesystem commands | Previously published partial release | Update in place to the Rust-native build after its release gate |
| Android `v0.1.2` | QuickJS runs the TypeScript engine; Kotlin/Java provides native I/O and Compose UI | Published app | Defer changes while it works |
| CLI `v0.1.1` | Node.js runs the TypeScript engine and Node adapters | Published developer CLI | Keep independent; do not make it block desktop |
| Chrome extension `v0.1.3` | MV3 service worker and popup | Launcher/status surface | Desktop launches Tauri through native messaging; ChromeOS launches Android |
| Legacy Chrome App `v0.5.x` | Chrome packaged-app APIs | Existing user migration channel | Preserve only long enough to route users to replacements |

The desktop command/state boundary lives in
`desktop/tauri-app/src-tauri/src/server_control.rs`; the Tauri-independent HTTP
implementation lives in `desktop/core`. The old desktop `server.ts`, raw
TCP/filesystem commands, and Tauri TypeScript adapters have been deleted.
Native messaging remains a distinct retained responsibility.

## Rust core boundary

The first core should be deliberately small:

- bind a host and port, including port `0`;
- serve one authorized filesystem root;
- serve files and directory indexes;
- MIME types, `HEAD`, conditional requests, ranges, CORS, and SPA fallback;
- safe URL decoding and canonical containment;
- bounded request/header sizes and timeouts;
- start, stop, restart, and observable status;
- structured request/error events for the UI; and
- deterministic configuration validation.

Prefer `tokio` plus a small, conventional HTTP stack already compatible with
the existing Tauri runtime. Library choice is subordinate to the behavioral
contract and measured footprint; this tactical does not require a custom HTTP
parser or a framework comparison project.

The core must have no Tauri or UI dependency. Tauri owns application lifecycle,
dialogs, tray/autostart/window behavior, settings paths, updater behavior, and
translation between command DTOs and core types.

## Compatibility contract

The migration should preserve, unless a tactical explicitly records a product
change:

- the Tauri bundle identifier `app.ok200.desktop`;
- the updater public key and update endpoint;
- the native messaging host identity and extension launch contract;
- stored settings where their meaning is unchanged;
- the current root, port, CORS, SPA, and background behaviors exposed in the
  desktop UI; and
- the visible start/stop/status workflow.

Upload and HTTPS exist in parts of the TypeScript engine but are not currently
exposed by the desktop UI. Classify them explicitly as release-required or
deferred during the compatibility-corpus phase; do not assume hidden engine
capability is a shipped desktop contract.

The Rust core now passes the derived black-box HTTP corpus, but the same
executable harness has not yet been run against both the released TypeScript
server and Rust candidate. Intentional differences need explicit expected
results, not silent test edits, before a release candidate is promoted.

An in-place updater migration is required: a signed current desktop release
must be able to update to the Rust-core release without reinstalling or changing
application identity.

## Non-goals

- Rewriting the React/Tauri management UI.
- Rewriting Android in Rust or pure Kotlin during this campaign.
- Moving the Node CLI to Rust.
- Preserving a generic TypeScript native-I/O abstraction on desktop.
- Adding UDP, UPnP, multiple servers, remote management, or other roadmap
  features before the basic native server and release path are trustworthy.
- Removing the webview; its fixed UI cost is accepted.

## Validation

The Rust cutover is acceptable only when:

1. Core unit/integration tests cover the HTTP and filesystem safety contract.
2. Tauri E2E starts a server through the UI/commands and fetches representative
   files from outside the webview.
3. Start/stop/restart, background/window lifecycle, native messaging launch,
   and persisted configuration are exercised.
4. Resident memory and startup time are measured on the same machine before
   and after the cutover.
5. A signed release candidate passes the artifact gate in
   [`desktop-release-readiness.md`](desktop-release-readiness.md).

## Implemented Rust-native desktop

Tactical 002 fixes the first crate boundary at `desktop/core`, package
`ok200-core`. It uses Tokio plus Axum/Hyper, canonical native filesystem
access, native streaming bodies, a bounded structured-log channel, and
graceful lifecycle state. A development CLI exercises the same public library
without Tauri.

This selection is intentionally reversible at the HTTP-library level: Tauri
will depend on the core's configuration/lifecycle/event API, not Axum types.
The Tauri layer now owns one persisted server configuration, native folder
selection, start-risk assessment, serialized start/stop operations, and
bounded status/request events. The React UI uses narrow Tauri commands and
shows one server with explicit lifecycle state. Empty roots and filesystem
roots are rejected; home, ancestor-of-home, outside-home, and LAN exposure
require confirmation as appropriate.

The desktop TypeScript HTTP server and primitive socket/filesystem IPC have
been removed. `packages/engine` remains for Android, the Node CLI, and the
extension where currently used; neither the desktop app nor shared desktop UI
declares it as a dependency.

The core passes its real-socket HTTP/security corpus and the full desktop Rust
workspace passes formatting, strict Clippy, and tests. Its Apple Silicon
release-mode development process measured roughly 2.9 MiB RSS idle and 3.2 MiB
after a request, with a 2.0 MiB unstripped binary. This demonstrates that the
server execution path itself is small; it does not measure the complete Tauri
application or eliminate the webview's fixed UI cost.

The production webview remains a conventional static Vite bundle. Vite's
development server and hot reload are used only by `tauri dev`; the installed
application does not run or require them.

The review app now defaults to the legacy Chrome App's `410x700` portrait
shape, with the canonical logo, wordmark, and yellow accent. Its compact
control surface uses a lifecycle switch with explicit status, point-of-use
explanations for locked settings, a native folder chooser, and distinct
default-browser and Copy actions for the running URL. Window-state storage was
migrated so stale wide-window state does not defeat the new default while
future user resizing remains persistent.

Directory indexes are generated entirely by the Rust core as self-contained
HTML. They show parent, folder, and file icons, human-readable size and
modified metadata, deterministic folder-first ordering, a responsive table,
and automatic browser light/dark presentation. They add no webview or
JavaScript server dependency.

## Known gaps

- Native folder selection and the full visible start/serve/stop/relaunch flow
  still need human product smoke in the installed macOS review app. That
  review should also cover the lifecycle switch, locked-setting tooltip and
  cursor, default-browser URL action, and persisted portrait window state.
- The existing WebdriverIO E2E specification targets the Rust command path and
  type-checks, but its direct `tauri-driver` runner is Windows/Linux-only and
  was not executed on macOS.
- The derived Rust compatibility corpus has not yet been made into one shared
  harness run against both the TypeScript and Rust servers.
- Current-vs-candidate whole-app memory, startup, and first-request
  measurements are still missing.
- No tagged Rust-core release candidate exists.
