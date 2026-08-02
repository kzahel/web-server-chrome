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

As of 2026-08-02:

| Surface | Runtime | Released state |
|---|---|---|
| CLI | TypeScript engine on Node.js | `v0.1.1` |
| Desktop release | Tauri/React controls; Rust server state and HTTP core | `v0.1.5`, complete signed release; recommended macOS app, Windows NSIS, and Linux AppImage update/server/extension paths accepted |
| Desktop source | Same Rust-native runtime with AppImage-first Linux integration, Linux ARM64 artifacts, and package-aware updates | Published baseline is `v0.1.5`; RPM-native, MSI-elevated, and physical ARM64 product smoke remain claim-only gaps |
| Android / ChromeOS source | Compose UI and native Kotlin HTTP/storage core | Kotlin cutover and ChromeOS LAN-address correction physically accepted; signed upload candidate published in GitHub release `android-v0.2.1` |
| Android / ChromeOS Play artifact | A native Kotlin build was previously submitted; store delivery can still differ during review | `v0.2.1` AAB is ready for maintainer upload; Play-delivered validation remains open |
| Chrome extension | MV3 launcher/status UI | Public `v0.1.5` GitHub candidate includes the ChromeOS Linux controller; `v0.1.6` source updates its package/store copy and peer Linux/Android chooser |
| ChromeOS Linux choice | Extension control UI plus a small Rust Crostini launcher/controller | Public `crostini-v0.1.1`, update route, installer, website guide, x86_64 ChromeOS proof, ARM64 Linux proof, and extension controller are complete; lifecycle and native ARM ChromeOS gaps remain documented |
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

Android source uses a native Kotlin HTTP/storage core and a Compose control
surface. One application-scoped controller owns UI, foreground service,
notification, boot, wake-lock, low-battery, and power-observation paths. SAF and
optional all-files roots remain supported. ChromeOS uses the Android application
as the server; the Chrome extension launches its custom `ok200` scheme through
a best-effort Android intent. Because an ordinary extension cannot detect Play
or app-installation state, it also exposes a separate HTTPS options route with
the exact Play listing and non-Android alternatives.

Desktop and Android intentionally have separate Rust and Kotlin implementations.
Their common feature/HTTP contract is maintained through tests, not a shared
embedded runtime. The currently published Android `v0.1.2` remains the earlier
artifact until a separately approved Play release. See
[`topics/android-runtime.md`](topics/android-runtime.md).

### CLI

The CLI keeps the TypeScript engine and Node adapters. It remains useful and
provides a behavioral reference, but it does not dictate the desktop runtime.
A Rust CLI may be reconsidered only as a separate product decision.

### Extension

On desktop, the extension talks to the installed Tauri app through native
messaging. On ChromeOS, where native messaging is unavailable, it offers peer
Android and ChromeOS Linux choices. Android is the quickest Google Play route;
the public signed Crostini component is the no-Play route configured and
controlled through the extension. Its product copy must explain that the
extension is a launcher/controller, not the HTTP server.

## Why the desktop direction changed

The earlier TypeScript engine plus native-I/O adapters shipped in the old
Android `v0.1.2` artifact and proved that an embedded JavaScript runtime could
host the server. It also placed the desktop HTTP engine, parser, filesystem
orchestration, and socket event flow in the Tauri webview. That architecture
added JavaScript/webview runtime work to a product whose main promise is a tiny
local server, without delivering a current product requirement. The embedded
Android runtime and its JNI/native-I/O modules are fully deleted from current
source; both desktop and Android now use their platform-native server cores.

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

- Keep desktop release publication fail closed; `v0.1.5` passed the complete
  five-leg matrix, checksum/metadata finalizer, and post-publication audit.
- Treat the accepted macOS app, Windows NSIS, and Linux AppImage paths as the
  desktop migration destination; retain PKG-auth/tray spot checks and the
  MSI/RPM/physical-ARM64 paths as explicit manual or claim-only follow-up.
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
- Unifying desktop, Android, and CLI behind one runtime implementation.
- Publishing the Kotlin Android cutover as part of the desktop/legacy campaign.
- Rewriting the CLI solely for language uniformity.
- Removing the Tauri webview.
- Expanding UDP/UPnP, proxying, or other power features before the basic server
  and release gate are solid.
- Treating ChromeOS as a separate Tauri desktop GUI runtime. The future
  Play-free route is a small headless Crostini controller driven by the
  extension, as recorded in the current topic.

## Planning and current truth

- [Desktop runtime topic](topics/desktop-runtime.md)
- [Android runtime topic](topics/android-runtime.md)
- [ChromeOS extension launcher topic](topics/chromeos-extension-launcher.md)
- [ChromeOS Crostini launcher/controller topic](topics/chromeos-crostini-launcher.md)
- [Internet exposure and port mapping topic](topics/internet-exposure-and-port-mapping.md)
- [Desktop release/signing topic](topics/desktop-release-readiness.md)
- [Legacy migration topic](topics/legacy-app-migration.md)
- [Tactical 000: historical desktop implementation sequence](tactical/000-desktop-native-core-and-release-readiness.md)
- [Tactical 011: active extension and ChromeOS closeout](tactical/011-extension-launcher-and-chromeos-network-readiness.md)
- [`research/`](research/) — historical comparisons and proposals; not
  automatically current decisions
