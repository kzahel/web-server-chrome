# 200 OK Web Server

The canonical current-product naming and legacy/search-language contract lives
in [`topics/product-branding.md`](topics/product-branding.md).

## What this is

200 OK is a lightweight successor to Web Server for Chrome, the Chrome
packaged app used by more than 200,000 people. The product should preserve the
original appeal: choose a folder, start a local server, and understand what it
is doing without running a general-purpose development stack.

The replacement is a family of small platform surfaces:

- a desktop application for Windows, macOS, and Linux;
- an Android application that is also the ChromeOS server path;
- a Chrome extension that provides familiar browser presence and launches the
  correct installed application; and
- a CLI for terminal users.

The extension is not itself the HTTP server.

## Current state

As of 2026-07-28:

| Surface | Runtime | Released state |
|---|---|---|
| CLI | TypeScript engine on Node.js | `v0.1.1` |
| Desktop release | Tauri/React controls; Rust server state and HTTP core | `v0.1.4`, complete signed artifact release; Linux DEB/AppImage server smoke accepted, remaining package/platform acceptance continuing |
| Desktop source candidate | Same Rust-native desktop runtime, plus AppImage-first Linux integration and native-host repair | Published baseline is `v0.1.4`; signed follow-up pending |
| Android / ChromeOS | Compose UI; TypeScript engine in QuickJS; Kotlin native I/O | `v0.1.2`, published |
| Chrome extension | MV3 launcher/status UI | `v0.1.3`, published |
| Legacy Chrome App | Chrome packaged-app APIs | Migration channel approaching end of life |

This mixed state is intentional during migration. “Current implementation” and
“accepted direction” must not be conflated.

## Accepted architecture

### Desktop

Desktop keeps Tauri and the React webview for:

- selecting and authorizing download/serve roots;
- configuration;
- starting, stopping, and inspecting servers;
- request/status display;
- tray, autostart, window, updater, and native messaging behavior.

The HTTP server now lives in a small Tauri-independent Rust core shared by the
Windows, macOS, and Linux builds. Rust owns sockets, filesystem access, HTTP
behavior, configuration validation, lifecycle, and request events. Served file
bytes and HTTP connections do not cross webview IPC.

The living contract is
[`topics/desktop-runtime.md`](topics/desktop-runtime.md).

### Android / ChromeOS

The published Android app keeps its working QuickJS + Kotlin implementation for
now. ChromeOS uses the Android application as the server; the Chrome extension
launches its custom `ok200` scheme through an Android intent with a Play Store
fallback.

This campaign does not attempt a pure-Kotlin or Rust/JNI Android rewrite.

### CLI

The CLI keeps the TypeScript engine and Node adapters. It remains useful and
provides a behavioral reference, but it does not dictate the desktop runtime.
A Rust CLI may be reconsidered only as a separate product decision.

### Extension

On desktop, the extension talks to the installed Tauri app through native
messaging. On ChromeOS, where native messaging is unavailable, it launches the
Android app. Its product copy must explain this launcher role honestly.

## Why the desktop direction changed

The TypeScript engine plus native-I/O adapters successfully shipped on Android
and proved that QuickJS could host the server. It also placed the desktop HTTP
engine, parser, filesystem orchestration, and socket event flow in the Tauri
webview. That architecture adds JavaScript/webview runtime work to a product
whose main promise is a tiny local server, without delivering a current product
requirement.

The desktop application already includes Rust through Tauri. A direct Rust
server provides a simpler ownership boundary and should materially reduce
runtime overhead while keeping the existing control UI and release identity.

This is a scoped correction, not a mandate to unify every platform immediately.

## Product principles

- **Simple first run.** Pick a folder, choose a port, start.
- **Lightweight in use, not only on disk.** Measure idle memory, CPU, startup,
  and first-request latency.
- **Native platform ownership.** File authorization, networking, background
  lifecycle, and installation follow platform rules.
- **Honest surfaces.** The extension launches; Android and desktop serve.
- **Safe local defaults.** Loopback by default, explicit LAN exposure, strict
  path containment, bounded parsing, and clear running state.
- **Updatable replacements.** Stable application identity and signed update
  metadata matter as much as implementation language.
- **Parity by evidence.** Preserve useful legacy behavior through black-box
  tests, not broad claims that parity is already complete.

## Delivery priorities

### 1. Release integrity and migration readiness

- Keep desktop release publication fail closed; `v0.1.4` proved the mechanism.
- Complete clean-system acceptance of the exact published Windows installers.
- Repair and retest AppImage-only native-host relaunch; the published Linux
  DEB extension path already passes. AppImage is the accepted recommended
  Linux package; publish and accept the implemented per-user repair and
  installer before public promotion.
- Keep updater metadata and artifact coverage complete across releases.
- Fix extension links and platform-aware migration copy.
- Submit the final restrained legacy notification update before the
  maintainer's 2026-08-31 deadline.

### 2. Rust-native desktop core

- Freeze a black-box compatibility corpus and resource baseline.
- Complete product smoke of the standalone Rust server and its narrow Tauri
  commands/events.
- Measure whole-app resource use and run the compatibility corpus against the
  released and candidate runtimes.
- Ship through the already-proven signed updater path.

### 3. Legacy parity

Prioritize the original product's core workflow before differentiation:

- one or more server roots;
- port and network exposure;
- directory index and `index.html`;
- CORS, SPA fallback, ranges, conditional requests, and uploads where exposed;
- HTTPS and authentication where product readiness requires them;
- reliable background/tray behavior; and
- visible URLs, state, and request logs.

### 4. Quality of life and differentiation

After the replacement and release path are dependable:

- QR code for LAN access;
- live reload;
- multiple simultaneous servers;
- custom headers and reverse proxy;
- precompressed content and cache controls; and
- remote management where its security model is explicit.

## Non-goals for the current campaign

- Proving a reusable Transistor JavaScript socket/filesystem architecture.
- Rewriting Android while the published app works.
- Rewriting the CLI solely for language uniformity.
- Removing the Tauri webview.
- Expanding UDP/UPnP, proxying, or other power features before the basic server
  and release gate are solid.
- Treating ChromeOS as a separate desktop runtime instead of the Android route.

## Planning and current truth

- [Desktop runtime topic](topics/desktop-runtime.md)
- [Desktop release/signing topic](topics/desktop-release-readiness.md)
- [Legacy migration topic](topics/legacy-app-migration.md)
- [Tactical 000: implementation sequence](tactical/000-desktop-native-core-and-release-readiness.md)
- [`research/`](research/) — historical comparisons and proposals; not
  automatically current decisions
