# 200 OK Web Server

Read [docs/vision.md](docs/vision.md) first for product intent. For current
architecture and implementation direction, read
[docs/topics/desktop-runtime.md](docs/topics/desktop-runtime.md),
[docs/topics/android-runtime.md](docs/topics/android-runtime.md),
[docs/topics/ios-runtime.md](docs/topics/ios-runtime.md), and
[docs/topics/chromeos-extension-launcher.md](docs/topics/chromeos-extension-launcher.md).
For the accepted Play-free Linux product shape and user flow, also read
[docs/topics/chromeos-crostini-launcher.md](docs/topics/chromeos-crostini-launcher.md).
For the active final release gate and the split between agent-owned and
maintainer/device checks, read
[docs/tactical/009-release-confidence-closeout.md](docs/tactical/009-release-confidence-closeout.md)
and
[docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md](docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md).
For the active desktop defect repair and the exact-public-artifact acceptance
campaign, read
[docs/tactical/015-desktop-production-validation.md](docs/tactical/015-desktop-production-validation.md)
and follow
[docs/runbooks/desktop-production-validation.md](docs/runbooks/desktop-production-validation.md).
The scoped Play-free ChromeOS Linux fallback lives in
[docs/tactical/012-chromeos-crostini-fallback.md](docs/tactical/012-chromeos-crostini-fallback.md).
The active ChromeOS Linux product-completion plan lives in
[docs/tactical/014-chromeos-crostini-product-completion.md](docs/tactical/014-chromeos-crostini-product-completion.md).
The native iOS MVP is complete in
[docs/tactical/016-native-swift-ios-app.md](docs/tactical/016-native-swift-ios-app.md);
its separate store-readiness follow-up is
[docs/tactical/017-ios-store-readiness.md](docs/tactical/017-ios-store-readiness.md).
Cross-platform CI, shared HTTP conformance, product E2E, artifact validation,
and advisory testbed improvements are planned in
[docs/tactical/018-cross-platform-ci-and-test-confidence.md](docs/tactical/018-cross-platform-ci-and-test-confidence.md).

## Quick Context

Lightweight web server app for every platform. Successor to "Web Server for
Chrome" (200k+ users). The Android app, extension, ChromeOS Linux component,
and signed Rust-native Tauri desktop `v0.1.6` have shipped.

Desktop `v0.1.6` passed its signing and public-asset gates but failed later
three-OS functional acceptance: the settings surface is clipped on Windows and
Linux, disabling background operation does not exit on last-window close, and
Windows can become unrecoverably invisible with the tray hidden. It also lacks
an exact-version round trip through the production Chrome Web Store extension.
Do not describe it as production-accepted; Tactical 015 owns the repair and
post-publication rerun.

A standalone native SwiftUI/Swift iOS app now exists and has passed its
simulator, Release-hygiene, Files/bookmark, lifecycle, and external same-Wi-Fi
acceptance gates on the attached physical phone through the project-neutral
`~/code/ios-device-testbed` path. It is not released; Tactical 017 owns the
separate App Store/TestFlight lane.

The old Transistor proof is not the current desktop architecture. Desktop
keeps Tauri and its webview for control/configuration while a small Rust core
owns HTTP execution on Windows, macOS, and Linux. Desktop `v0.1.6` adds the
canonical in-app settings surface and optional tray visibility on every desktop
platform; it also includes AppImage-first integration, Linux ARM64 artifacts,
AppImage native-host repair, macOS Dock activation repair, and the package-aware
updater policy. Android
source uses a native Kotlin HTTP server, and the former unpublished
Node/TypeScript CLI and engine have been retired. GitHub release
`android-v0.2.1` contains the signed native-Kotlin APK/AAB with the physically
accepted ChromeOS LAN-address correction. The maintainer reports the exact
Android `v0.2.1` and extension `v0.1.4` candidates submitted to their stores;
public `extension-v0.1.6` is the tested replacement candidate with the
ChromeOS Linux controller and corrected peer-choice copy. Production may still
serve earlier artifacts until review and rollout finish.

## Architecture

Current repository shape:

- `packages/ui` — shared React controls used by the desktop Tauri webview.
- `android` — Compose app with a Kotlin HTTP/storage core and native Android
  lifecycle, permission, background, wake, boot, and battery policy.
- `ios` — independent SwiftUI controls, Swift HTTP/storage code, security-scoped
  Files access, and an intentionally foreground-only lifecycle.
- `desktop` — Tauri app with a Tauri-independent Rust HTTP core and a thin
  React/Tauri command/event control layer.
- `desktop/crostini` — independently released ChromeOS Linux
  launcher/controller that reuses the Rust core.
- `extension` — Published launcher/status surface.

Do not recreate the deleted generic TypeScript native-I/O architecture.
Android and desktop own their Kotlin and Rust implementations respectively;
keep the `desktop/core/src/main.rs` executable repository-only for development
and smoke testing rather than packaging or versioning it as a separate CLI.
ChromeOS launcher detection limits, Android/Play fallbacks, and the future
Crostini choice are owned by
[`docs/topics/chromeos-extension-launcher.md`](docs/topics/chromeos-extension-launcher.md).
The Crostini installer, Linux Launcher, controller protocol, and extension
control UI are owned by
[`docs/topics/chromeos-crostini-launcher.md`](docs/topics/chromeos-crostini-launcher.md).

## Cross-Project Context

This project is part of a larger ecosystem. See `~/code/dotfiles/projects/README.md` for the full map. Key relationships:

- **JSTorrent** (`~/code/jstorrent`) — Reference for Tauri signing/release
  mechanics and native mobile lifecycle behavior; its JavaScript-runtime
  experiment is historical here.
- **Desktop signing runbook**
  (`~/code/dotfiles/runbooks/desktop-code-signing.md`) — Credential names,
  source material, setup, and verification. Release truth for this repository
  lives in `docs/topics/desktop-release-readiness.md`.
- **Update service host** (`~/code/dotfiles/machines/pi/README.md`) — Private
  Remy service location, product-config wiring, and health commands.
- **Private aggregate analytics** (`~/code/dotfiles/control-room/README.md`
  and `~/code/dotfiles/control-room/config/projects.yaml`) — Sanitized 200 OK
  update-check aggregates and endpoint health. Raw events and identifiers stay
  on Remy.
- **Update analytics runbook**
  (`~/code/dotfiles/runbooks/update-server-analytics.md`) — Shared-server
  analytics workflow. Its 200 OK-specific closeout is tracked in Tactical 009.

## Environment Setup

Before running commands that require Java, Rust, or other development tools, source the shell profile:

```bash
source ~/.profile
```

This loads PATH entries for Java, Rust/Cargo, and other development tools.

## Stack

- TypeScript, pnpm workspaces
- Biome for linting and formatting (`pnpm lint`, `pnpm format`)
- Vitest for testing (`pnpm test`)
- `pnpm typecheck` for type checking
- SwiftUI/Swift 6 and Network.framework for the independent iOS application
- xcodegen for the checked-in iOS Xcode project

## Conventions

- No `Co-Authored-By` lines referencing Claude/AI/Anthropic in commits
- No "Generated with Claude Code" attribution

## TypeScript Editing Workflow

After editing TypeScript files, run checks in this order:

1. `pnpm typecheck` - Verify type correctness
2. `pnpm test` - Run unit tests
3. `pnpm check` - Lint and fix formatting (do this last since fixing errors above may introduce formatting issues)

## Rust Editing Workflow (desktop/)

After editing desktop Rust files, run the canonical source gate:

1. `desktop/scripts/check.sh` - Run release-validator tests plus the formatting,
   Clippy, and test gates for the shared desktop crates.
2. `desktop/crostini/scripts/check.sh` - Also run this when changing the
   ChromeOS Linux controller, release manifest, or installer.
3. `desktop/tauri-app/e2e/run-e2e.sh` - On Linux, build and drive the real
   Tauri/WebKitGTK app through its start/serve/stop and settings-layout suite.

## Android/Kotlin Editing Workflow

After editing Kotlin/Java files in `android/`:

1. `android/scripts/check.sh` - Build the Debug APK, run JVM tests, and lint.
2. `android/scripts/test.sh --integration` - Run device tests when an emulator
   or attached device is available.

## Extension Editing Workflow

After editing the Chrome extension:

1. `pnpm install --frozen-lockfile` - Install the locked workspace dependencies.
2. `extension/scripts/check.sh` - Typecheck, test, then build and inspect a
   store-safe extension package.

## iOS/Swift Editing Workflow

After editing Swift or iOS project files under `ios/`:

1. `ios/scripts/check.sh` - Regenerate the project, run simulator unit/UI tests,
   build unsigned simulator and generic-device Release products, reject DEBUG
   hooks in Release, and reject a committed team.
2. `ios/scripts/build-device.sh` - Produce the explicit development-signed app
   using ignored signing selection from `~/code/ios-device-testbed`.
3. `ios/scripts/device-smoke.sh` - When the physical phone is available, install
   through the testbed, fetch its displayed Wi-Fi URL externally, and verify
   background shutdown.

Do not call the testbed's underlying provider directly or commit a signing team,
device identifier, certificate, profile, account, or private session output.

## Shared HTTP Contract

Externally observable server behavior shared by iOS, Android, and desktop is
defined in `tests/http-conformance/corpus-v1.json`. Run
`node --test tests/http-conformance/validate.test.mjs` after editing its schema
or fixtures. The canonical iOS, Android, and desktop source gates each run their
native adapter; every case must name each runtime as claimed or give an explicit
exclusion reason.

## Android Emulator Management

**Preamble (required before any emulator/adb commands):**
```bash
source ~/.profile && source android/scripts/android-env.sh
```

**Start the emulator (idempotent):**
```bash
emu start
```

**Other `emu` subcommands:**
```bash
emu status      # Show connected devices and port forwards
emu stop        # Stop the emulator
emu install     # Build and install the APK
emu logs        # Filtered Kotlin server/lifecycle logcat
emu reset       # Clear app data
```

## Android Debug RPC

Debug builds include a ContentProvider-based RPC system for programmatic app control (automated testing, CI, etc.).

**Preamble (same as emulator commands):**
```bash
source ~/.profile && source android/scripts/android-env.sh
```

**Usage:**
```bash
emu rpc ping                      # Health check
emu rpc getState                  # Full server state + config
emu rpc setPort 9090              # Set port
emu rpc setRootPath /sdcard/www   # Set root directory (bypasses SAF)
emu rpc startServer               # Start through the Kotlin controller
emu rpc stopServer                # Stop server + foreground service
```

See `.claude/commands/android-rpc.md` for full method documentation and test workflows.

## Android SDK Setup

The Android SDK is at `~/.android-sdk`. Gradle needs the SDK location via `local.properties`:

```bash
echo "sdk.dir=$HOME/.android-sdk" > android/local.properties
```

Note: `local.properties` is gitignored — each machine needs its own.

## Releases

All components follow the same release pattern:
1. Update the component's `CHANGELOG.md` with a `## [VERSION]` section (required - scripts will fail without it)
2. Run the release script: `./scripts/release-{component}.sh <version>`
3. CI automatically builds and publishes artifacts when the tag is pushed

**Commit message format:** `Release {Component} v{VERSION}` (e.g., `Release Desktop v0.1.5`)

### Release Pipeline Summary

| Component | Tag | CI builds | Publishing |
|-----------|-----|-----------|------------|
| **Desktop** | `desktop-v{ver}` | Targets signed Mac/Win/Linux installers | Auto-updates only after the release-readiness gate passes |
| **Extension** | `extension-v{ver}` | ZIP | Manual upload to Chrome Web Store |
| **Android** | `android-v{ver}` | Signed APK + AAB | Manual upload to Google Play Console |
| **ChromeOS Linux** | `crostini-v{ver}` | Signed static x86_64 + ARM64 binaries and manifest | CI creates a separate GitHub release; website/update-service rollout is a coordinated maintainer step |

### Desktop Releases

```bash
./scripts/release-desktop.sh <version> --check
./scripts/release-desktop.sh <version>
```

- `--check` verifies a clean tree, changelog entry, and absent local/remote tag
  without changing versions, committing, pushing, or tagging.
- Updates `desktop/tauri-app/src-tauri/tauri.conf.json`, `desktop/tauri-app/package.json`, and `desktop/Cargo.toml`
- Creates tag: `desktop-v{version}`
- CI targets signed/notarized installers for macOS and Windows plus Linux
  packages. Do not describe a release as complete until
  `docs/topics/desktop-release-readiness.md` is updated with artifact evidence.
- Changelog: `desktop/tauri-app/CHANGELOG.md`

### Extension Releases

```bash
./scripts/release-extension.sh <version> --check
./scripts/release-extension.sh <version>
```

- `--check` runs typechecking, popup/routing tests, and store-safe ZIP
  construction without changing tracked files, committing, tagging, or pushing.
- Updates `extension/public/manifest.json` and `extension/package.json`
- Creates the version commit and local tag `extension-v{version}` without
  pushing either one
- **Maintainer release step:** Push `main` and the approved tag; the tag starts
  the GitHub Release workflow
- CI independently runs extension tests, rejects development material or
  manifest/tag mismatch, and creates a GitHub Release with ZIP and checksum
- **Manual step:** Download ZIP from GitHub Release and upload to Chrome Web Store
- Changelog: `extension/CHANGELOG.md`

### Android Releases

```bash
./scripts/release-android.sh <version>
```

- Updates `android/app/build.gradle.kts` (versionName + auto-increments versionCode)
- Runs Android compile, unit-test, and lint gates before versioning
- Creates the version commit and local tag `android-v{version}` without pushing
- **Maintainer release step:** Atomically push `main` and the approved tag
- CI builds signed APK and AAB, creates GitHub Release with both attached
- **Manual step:** Download AAB from GitHub Release and upload to Google Play Console
- Changelog: `android/CHANGELOG.md`

### ChromeOS Linux Releases

```bash
./scripts/release-crostini.sh <version> --check
./scripts/release-crostini.sh <version>
```

- `--check` runs the Crostini Rust, canonical-manifest, and bootstrap-installer
  gates without changing source, committing, tagging, pushing, or publishing.
- Updates the independently versioned `desktop/crostini/Cargo.toml` package and
  `desktop/Cargo.lock`, then creates the version commit and local
  `crostini-v{version}` tag without pushing either one.
- Tag CI cross-builds static musl binaries for `x86_64` and `aarch64`, signs a
  canonical manifest with the desktop release key, verifies both artifacts,
  and creates a separate GitHub release.
- The bootstrap installer verifies the signed manifest, architecture-specific
  SHA-256 and size, and binary version before any per-user installation change.
- **Maintainer release steps:** push the approved commit/tag, inspect both
  release artifacts, deploy the compatible shared update-server change and
  `/crostini` product config, then expose the Linux option only after the
  physical acceptance gates in the Crostini topic pass.
- Changelog: `desktop/crostini/CHANGELOG.md`
