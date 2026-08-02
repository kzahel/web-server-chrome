# 200 OK Web Server

Read [docs/vision.md](docs/vision.md) first for product intent. For current
architecture and implementation direction, read
[docs/topics/desktop-runtime.md](docs/topics/desktop-runtime.md),
[docs/topics/android-runtime.md](docs/topics/android-runtime.md), and
[docs/topics/chromeos-extension-launcher.md](docs/topics/chromeos-extension-launcher.md).
For the active final release gate and the split between agent-owned and
maintainer/device checks, read
[docs/tactical/009-release-confidence-closeout.md](docs/tactical/009-release-confidence-closeout.md)
and
[docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md](docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md).
The scoped Play-free ChromeOS Linux fallback lives in
[docs/tactical/012-chromeos-crostini-fallback.md](docs/tactical/012-chromeos-crostini-fallback.md).

## Quick Context

Lightweight web server app for every platform. Successor to "Web Server for
Chrome" (200k+ users). The CLI, Android app, extension, and signed Rust-native
Tauri desktop `v0.1.5` have shipped.

The old Transistor proof is not the current desktop architecture. Desktop
keeps Tauri and its webview for control/configuration while a small Rust core
owns HTTP execution on Windows, macOS, and Linux. Desktop `v0.1.5` includes
AppImage-first integration, Linux ARM64 artifacts, AppImage native-host repair,
macOS Dock activation repair, and the package-aware updater policy. Android
source uses a native Kotlin HTTP server; the Node/TypeScript CLI remains an
independent implementation. GitHub release `android-v0.2.1` contains the
signed native-Kotlin APK/AAB with the physically accepted ChromeOS LAN-address
correction. The maintainer reports the exact Android `v0.2.1` and extension
`v0.1.4` candidates submitted to their stores; production may still serve
earlier artifacts until review and rollout finish.

## Architecture

Current repository shape:

- `packages/engine` — TypeScript HTTP engine used by the CLI, but not Android
  or the Rust-native desktop release.
- `packages/cli` — CLI wrapper using the engine with Node.js adapters.
- `android` — Compose app with a Kotlin HTTP/storage core and native Android
lifecycle, permission, background, wake, boot, and battery policy.
- `desktop` — Tauri app with a Tauri-independent Rust HTTP core and a thin
  React/Tauri command/event control layer.
- `extension` — Published launcher/status surface.

Do not recreate the deleted generic TypeScript native-I/O architecture.
Android and desktop own their Kotlin and Rust implementations respectively;
keep Node imports in `packages/engine` within its Node adapter.
ChromeOS launcher detection limits, Android/Play fallbacks, and the future
Crostini decision are owned by
[`docs/topics/chromeos-extension-launcher.md`](docs/topics/chromeos-extension-launcher.md).

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

## Conventions

- No `Co-Authored-By` lines referencing Claude/AI/Anthropic in commits
- No "Generated with Claude Code" attribution

## TypeScript Editing Workflow

After editing TypeScript files, run checks in this order:

1. `pnpm typecheck` - Verify type correctness
2. `pnpm test` - Run unit tests
3. `pnpm check` - Lint and fix formatting (do this last since fixing errors above may introduce formatting issues)

## Rust Editing Workflow (desktop/)

After editing Rust files in `desktop/`, run from the `desktop/` directory:

1. `cargo fmt --all`
2. `cargo clippy --workspace -- -D warnings`
3. `cargo test --workspace`

## Android/Kotlin Editing Workflow

After editing Kotlin/Java files in `android/`:

1. `./gradlew :app:compileDebugKotlin` - Compile Kotlin
2. `./gradlew :app:testDebugUnitTest` - Run JVM tests
3. `./gradlew :app:lintDebug` - Run Android lint
4. `./gradlew connectedDebugAndroidTest` - Run device UI tests when an AVD is available

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

**Commit message format:** `Release {Component} v{VERSION}` (e.g., `Release CLI v0.1.0`)

### Release Pipeline Summary

| Component | Tag | CI builds | Publishing |
|-----------|-----|-----------|------------|
| **CLI** | `v{ver}` | npm package | CI auto-publishes to npm |
| **Desktop** | `desktop-v{ver}` | Targets signed Mac/Win/Linux installers | Auto-updates only after the release-readiness gate passes |
| **Extension** | `extension-v{ver}` | ZIP | Manual upload to Chrome Web Store |
| **Android** | `android-v{ver}` | Signed APK + AAB | Manual upload to Google Play Console |

### CLI Releases

```bash
./scripts/release-cli.sh <version>
```

- Updates `packages/cli/package.json`
- Creates tag: `v{version}`
- CI publishes to npm as `ok200`
- Changelog: `packages/cli/CHANGELOG.md`

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
