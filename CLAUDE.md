# 200 OK Web Server

Read [docs/vision.md](docs/vision.md) first — it explains what we're building, why, and the phased roadmap.

## Quick Context

Lightweight web server app for every platform. Successor to "Web Server for Chrome" (200k+ users). First app built on the Transistor pattern (TypeScript engine + native I/O adapters). Desktop will be Tauri (same as JSTorrent).

Currently in **Phase 0**: CLI server that replaces `python -m http.server`.

## Architecture

Monorepo with pnpm workspaces:

- `packages/engine` — Platform-agnostic HTTP server. Adapter pattern: abstract interfaces for socket/filesystem, concrete adapters per platform. This is the core.
- `packages/cli` — Thin CLI wrapper using the engine with Node.js adapters.

The engine must stay platform-agnostic. No Node.js imports in engine code outside of `adapters/node/`.

## Cross-Project Context

This project is part of a larger ecosystem. See `~/code/dotfiles/projects/README.md` for the full map. Key relationships:

- **Transistor** (`~/code/transistor`) — The framework vision this app proves out
- **JSTorrent** (`~/code/jstorrent`) — Shipped product that proved the adapter pattern works (same IFileSystem/IFileHandle approach, QuickJS+JNI on Android, Tauri on desktop)

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
| **Desktop** | `desktop-v{ver}` | Signed installers (Mac/Win/Linux) | Auto-updates via updater JSON |
| **Extension** | `extension-v{ver}` | ZIP | Manual upload to Chrome Web Store |

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
- CI builds signed/notarized installers for macOS, Windows, and Linux
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
