# Desktop Runtime

> The desktop product keeps Tauri and its webview for control/configuration,
> but the HTTP server moves out of JavaScript and into a small Rust core shared
> by the Windows, macOS, and Linux builds.

Topic: desktop-native-core

Status: **accepted direction; not implemented.** The released desktop
`v0.1.3` still runs the TypeScript HTTP engine in the Tauri webview.

Last reconciled: **2026-07-28**.

Implementation sequencing lives in
[Tactical 000](../tactical/000-desktop-native-core-and-release-readiness.md).

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

| Surface | Current runtime | Current role | Direction |
|---|---|---|---|
| Desktop `v0.1.3` | Tauri webview runs `@ok200/engine`; Rust exposes TCP/filesystem commands | Working desktop server and UI | Replace only the desktop HTTP execution path with Rust |
| Android `v0.1.2` | QuickJS runs the TypeScript engine; Kotlin/Java provides native I/O and Compose UI | Published app | Defer changes while it works |
| CLI `v0.1.1` | Node.js runs the TypeScript engine and Node adapters | Published developer CLI | Keep independent; do not make it block desktop |
| Chrome extension `v0.1.3` | MV3 service worker and popup | Launcher/status surface | Desktop launches Tauri through native messaging; ChromeOS launches Android |
| Legacy Chrome App `v0.5.x` | Chrome packaged-app APIs | Existing user migration channel | Preserve only long enough to route users to replacements |

The current desktop TypeScript path is visible in
`desktop/tauri-app/src/server.ts`, while the Rust adapter commands live under
`desktop/tauri-app/src-tauri/src/`. The native messaging sidecar is a distinct
responsibility and should be retained.

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

Before deleting the TypeScript desktop path, run the same black-box HTTP corpus
against the released TypeScript server and the Rust candidate. Intentional
differences need explicit expected results, not silent test edits.

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

## Known gaps

- The exact Rust HTTP library and `ok200-core` workspace location are not yet
  selected.
- The complete desktop-visible TypeScript behavior corpus has not been
  enumerated.
- It is not yet proven whether the webview-to-Rust command surface can replace
  every current option without a compatibility shim.
- No tagged Rust-core release candidate exists.
