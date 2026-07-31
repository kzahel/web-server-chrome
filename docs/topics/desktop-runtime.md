# Desktop Runtime

> The desktop product keeps Tauri and its webview for control/configuration,
> but the HTTP server moves out of JavaScript and into a small Rust core shared
> by the Windows, macOS, and Linux builds.

Topic: desktop-native-core

Status: **Rust-native desktop `v0.1.4` is published with complete signed
artifacts; installed macOS and Windows pre-release product smoke is accepted.
Published Linux DEB and AppImage server smoke and DEB extension launch are
accepted. The current source candidate implements the AppImage-only
native-host repair, AppImage-first installation path, and macOS Dock activation
repair; a signed follow-up artifact, exact published Windows install/signature
inspection, and an installed update remain pending.**

Last reconciled: **2026-07-31**.

Implementation sequencing lives in
[Tactical 000](../tactical/000-desktop-native-core-and-release-readiness.md);
the standalone core boundary and compatibility baseline are recorded in
[Tactical 002](../tactical/002-standalone-rust-http-core.md), and the desktop
cutover is recorded in
[Tactical 003](../tactical/003-native-desktop-control-surface.md). The compact
portrait review surface and browser-like Rust directory listing are recorded
in
[Tactical 004](../tactical/004-portrait-desktop-polish-and-directory-listing.md).
The in-app updater behavior and its signed public-artifact proof are recorded
in [Tactical 005](../tactical/005-in-app-desktop-updater.md).
Published Linux package smoke and the AppImage launcher defect are recorded in
[Tactical 007](../tactical/007-linux-desktop-validation.md).
The accepted AppImage-first repair and distribution path are recorded in
[Tactical 008](../tactical/008-appimage-first-linux-distribution.md).
The final release-confidence gates and manual sign-off boundary are recorded
in [Tactical 009](../tactical/009-release-confidence-closeout.md).
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
| Desktop source candidate | Tauri/React control surface; Rust owns persisted server state and `ok200-core` owns native HTTP/filesystem/networking | `v0.1.4` runtime plus AppImage-first integration, relaunch repair, and macOS Dock create-or-focus handling | Publish and accept the signed follow-up, then continue compatibility/resource measurements |
| Desktop release `v0.1.4` | Tauri/React controls with the Rust server state and HTTP core | Complete signed release; published Linux DEB/AppImage server path accepted | Verify exact Windows clean install, installed update, AppImage-only native-host relaunch, and RPM-native installation |
| Previous desktop `v0.1.3` | Tauri webview runs `@ok200/engine`; Rust exposes TCP/filesystem commands | Partial legacy release and updater source | Must update in place to `v0.1.4` without identity or settings loss |
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

The Tauri webview now also owns a compact in-app updater notification. The
native menu focuses the existing window and requests a manual check; the
webview invokes Tauri's signed updater with `X-Check-Reason: manual` and shows
checking, current, available, progress, installation, and failure state
without opening a separate dialog. It checks quietly five seconds after every
launch with reason `startup`, then every 24 hours while open with reason
`periodic`. Automatic current/error results are quiet unless an update is
available. Available updates provide explicit **Install & Restart** and
**Later** actions. Tauri's embedded bundle identity restricts installation to
macOS app bundles, NSIS, and AppImage; MSI, DEB, and RPM users are directed to
the matching manual download. Signature verification and installation remain
delegated to the Tauri plugin before relaunch through the process plugin.

Window activation uses one create-or-focus path. On macOS, the application
handles Tauri's Dock `Reopen` event by restoring and focusing the configured
main webview, recreating it when the previous window was destroyed. The same
helper backs menu, tray, and single-instance activation. A mock-runtime
regression test exercises creation from the real Tauri window configuration
when no main window exists; packaged Dock activation remains part of macOS
product smoke for the next signed candidate.

## Linux distribution decision

AppImage is the recommended Linux desktop package. The supported installer
places a checksum-verified AppImage at
`~/.local/bin/200-ok.AppImage`, installs browser and desktop integration below
the current user's home directory, and requires no administrator token. A
directly launched AppImage records its real path and installs the same stable
desktop identity, so the copied native host can launch it after the temporary
FUSE mount disappears.

DEB and RPM remain published as secondary system packages for users who
deliberately prefer them. Their installation requires administrator
privileges and their updates are manual until a separate bundle-aware package
update policy is accepted. The currently supported Linux release architecture
is x86_64.

Implementation and release sequencing are recorded in
[Tactical 008](../tactical/008-appimage-first-linux-distribution.md).

## Known gaps

- Native folder selection and the full visible start/serve/stop/relaunch flow
  have been accepted in installed macOS and Windows review apps and in the
  exact published Linux DEB. The Windows
  run also passed per-user NSIS installation, external HTTP behavior,
  persistence, background single-instance lifecycle, headless updater service
  flow, native-host registration/framing/launch, real unpacked-extension
  invocation, and uninstall of installed binaries, registration, and per-user
  state. Tray-only controls, MSI installation, and inspection of the exact
  published `v0.1.4` Windows artifacts remain pending in
  [Tactical 006](../tactical/006-windows-desktop-validation.md).
- The exact published Linux AppImage also passes launch, visible
  start/serve/stop, and current updater-check smoke. Its copied stable native
  host cannot relaunch or focus an AppImage-only installation because it falls
  back to the nonexistent desktop ID `200-ok`. The source candidate repairs
  this by recording the AppImage path and installing that identity, but the
  change is not yet in a signed public artifact. The DEB's real
  extension-to-host path passes. RPM install/launch remains untested on a
  native RPM-family system; see
  [Tactical 007](../tactical/007-linux-desktop-validation.md) and
  [Tactical 008](../tactical/008-appimage-first-linux-distribution.md).
- The existing WebdriverIO E2E specification targets the Rust command path and
  type-checks, but its direct `tauri-driver` runner is Windows/Linux-only and
  was not executed on macOS.
- The derived Rust compatibility corpus has not yet been made into one shared
  harness run against both the TypeScript and Rust servers.
- Current-vs-candidate whole-app memory, startup, and first-request
  measurements are still missing.
- Signed Rust-core `v0.1.4` is public and its deployed metadata is offered to
  `0.1.3` clients. The in-app updater previously installed and relaunched the
  signed public macOS `0.1.3` artifact from a controlled `0.1.2` review build,
  but an actual installed `0.1.3` → `0.1.4` transition remains unproven, as do
  Windows and Linux update transitions. Linux `0.1.4` current-version
  detection itself passes.
- On 2026-07-31 the maintainer accepted JSTorrent's updater policy: a quiet
  app check five seconds after launch, a 24-hour periodic check while open,
  manual results that are always visible, and the native host's independent
  at-most-daily check. The source still needs that cadence reconciliation, and
  secondary MSI/DEB/RPM installations can encounter updater metadata for the
  recommended NSIS/AppImage package type. Tactical 009 requires the accepted
  cadence and bundle-aware behavior before the next signed release is
  accepted.
