# 200 OK Web Server

Read [docs/vision.md](docs/vision.md) first for product intent. For current
architecture and implementation direction, read
[docs/topics/desktop-runtime.md](docs/topics/desktop-runtime.md) and
[docs/tactical/000-desktop-native-core-and-release-readiness.md](docs/tactical/000-desktop-native-core-and-release-readiness.md).

## Quick Context

Lightweight web server app for every platform. Successor to "Web Server for
Chrome" (200k+ users). The CLI, Android app, extension, and an early Tauri
desktop app have shipped.

The old Transistor proof is not the current desktop goal. Desktop keeps Tauri
and its webview for control/configuration, but moves HTTP execution into a
small Rust core shared by Windows, macOS, and Linux. Android QuickJS and the
Node/TypeScript CLI are deferred.

## Architecture

Current repository shape:

- `packages/engine` — TypeScript HTTP engine currently used by CLI, Android,
  and the released desktop app.
- `packages/cli` — CLI wrapper using the engine with Node.js adapters.
- `android` — Published Compose app running the engine in QuickJS with Kotlin
  I/O.
- `desktop` — Tauri app. Current release runs the engine in the webview; target
  is a Tauri-independent Rust HTTP core plus a thin Tauri command/event layer.
- `extension` — Published launcher/status surface.

Do not extend the generic TypeScript native-I/O architecture for desktop.
Changes needed only by Android/CLI may still use `packages/engine`; keep Node
imports within its Node adapter.

## Cross-Project Context

This project is part of a larger ecosystem. See `~/code/dotfiles/projects/README.md` for the full map. Key relationships:

- **JSTorrent** (`~/code/jstorrent`) — Reference for Tauri signing/release
  mechanics and the already-shipped QuickJS/JNI Android pattern.
- **Desktop signing runbook**
  (`~/code/dotfiles/runbooks/desktop-code-signing.md`) — Credential names,
  source material, setup, and verification. Release truth for this repository
  lives in `docs/topics/desktop-release-readiness.md`.

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
2. `./gradlew testDebugUnitTest` - Run unit tests
3. `./gradlew lint` - Run Android lint

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
emu logs        # Filtered logcat (use --js for QuickJS logs only)
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
emu rpc startServer               # Init engine + start serving
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
./scripts/release-desktop.sh <version>
```

- Updates `desktop/tauri-app/src-tauri/tauri.conf.json`, `desktop/tauri-app/package.json`, and `desktop/Cargo.toml`
- Creates tag: `desktop-v{version}`
- CI targets signed/notarized installers for macOS and Windows plus Linux
  packages. Do not describe a release as complete until
  `docs/topics/desktop-release-readiness.md` is updated with artifact evidence.
- Changelog: `desktop/tauri-app/CHANGELOG.md`

### Extension Releases

```bash
./scripts/release-extension.sh <version>
```

- Updates `extension/public/manifest.json`
- Creates tag: `extension-v{version}`
- CI creates GitHub Release with ZIP attachment
- **Manual step:** Download ZIP from GitHub Release and upload to Chrome Web Store
- Changelog: `extension/CHANGELOG.md`

### Android Releases

```bash
./scripts/release-android.sh <version>
```

- Updates `android/app/build.gradle.kts` (versionName + auto-increments versionCode)
- Creates tag: `android-v{version}`
- CI builds signed APK and AAB, creates GitHub Release with both attached
- **Manual step:** Download AAB from GitHub Release and upload to Google Play Console
- Changelog: `android/CHANGELOG.md`
