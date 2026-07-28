<p align="center">
  <img src="images/200ok-256.png" alt="200 OK!" width="128">
</p>

<h1 align="center">Web Server for Chrome</h1>

<p align="center"><strong>The next generation of <a href="https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb">Web Server for Chrome</a>, rebuilt from scratch by the original author.</strong></p>

The original Chrome App was used by 200,000+ people for local web development and file sharing. Google discontinued Chrome Apps, so Web Server for Chrome is being rebuilt as:

- **Chrome Extension** — The familiar UI, now as an extension
- **Desktop App** — Native app (Tauri) for Mac, Windows, and Linux
- **CLI** — `ok200` command for developers who live in the terminal
- **Android / ChromeOS** — Native app, published on Google Play

Same author. Same mission. Modern architecture.

> Looking for the original Chrome App source code? See the [`legacy` branch](https://github.com/kzahel/web-server-chrome/tree/legacy).

## Current Status

The CLI server, Chrome extension, Android app, and an early desktop build have
all shipped. Their runtimes are not currently unified:

- the CLI uses the TypeScript engine on Node.js;
- Android uses the TypeScript engine in QuickJS with Kotlin native I/O;
- desktop `v0.1.3` uses the TypeScript engine in the Tauri webview with Rust
  native I/O; and
- the extension is a launcher/status surface, not the HTTP server.

Desktop `main` now uses the standalone Rust core for HTTP, filesystem, and
server lifecycle work; its Tauri webview is only a static React control
surface. This cutover is an unsigned local-review candidate, not a published
release, so the released desktop behavior remains unchanged. Android and the
published Node CLI are deliberately deferred while they work.

See the living
[desktop runtime decision](docs/topics/desktop-runtime.md) and
[Tactical 003](docs/tactical/003-native-desktop-control-surface.md).

## Install

- Chrome Extension: [Web Server for Chrome on the Chrome Web Store](https://chromewebstore.google.com/detail/web-server-for-chrome/lpkjdhnmgkhaabhimpdinmdgejoaejic?authuser=0&hl=en)
- Android / ChromeOS: [200 OK on Google Play](https://play.google.com/store/apps/details?id=app.ok200.android)
- Desktop app: packaged separately; `v0.1.3` is an early partial release and
  does not yet pass the current
  [release-readiness gate](docs/topics/desktop-release-readiness.md)

### CLI Usage

```sh
npx ok200                          # serve current directory on port 8080
npx ok200 ./dist                   # serve a specific directory
npx ok200 --port 3000              # custom port
npx ok200 --host 0.0.0.0           # expose on LAN
npx ok200 ./dist --spa --cors      # SPA mode with CORS headers
npx ok200 ./dist --upload          # enable PUT/POST file uploads
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--port, -p <port>` | Port to listen on | `8080` |
| `--host, -H <host>` | Host to bind | `127.0.0.1` |
| `--cors` | Enable CORS headers | off |
| `--spa` | Serve index.html for missing paths | off |
| `--upload` | Enable file uploads via PUT/POST | off |
| `--no-listing` | Disable directory listing | off |
| `--quiet, -q` | Suppress request logging | off |

### Features

- Static file serving with MIME type detection
- Auto-serves index.html for directories
- Directory listing with file sizes and dates
- ETag / If-None-Match (304) support
- Path traversal protection
- Graceful shutdown on SIGINT/SIGTERM

## Roadmap

### Coming Soon
- Hardened signed desktop releases for Mac, Windows, and Linux
- Complete product smoke and release the Rust-native desktop app
- Expanded Chrome Extension + desktop helper integration
- HTTPS with self-signed cert generation
- HTTP Basic Auth
- Range requests for media streaming

### Later
- QR code for easy mobile access on LAN
- Live reload
- Multiple simultaneous servers
- Reverse proxy mode

See [docs/vision.md](docs/vision.md) for the full roadmap.

## Architecture

The repository contains the currently shipped TypeScript engine and the
platform applications that use or launch it:

```
packages/engine/     Platform-agnostic HTTP server (no platform deps)
packages/cli/        CLI wrapper (Node.js adapters)
extension/           Chrome Extension
desktop/             Tauri/React controls plus Rust application state
desktop/core/        Rust HTTP core and development CLI
android/             Android app (QuickJS + Kotlin/Compose)
```

The TypeScript native-I/O adapter pattern is retained for Android and the CLI.
It is superseded on desktop. The Tauri webview remains for configuration and
control, while native Rust owns sockets, filesystem access, HTTP behavior, and
server lifecycle. The authoritative current/target
boundary is [`docs/topics/desktop-runtime.md`](docs/topics/desktop-runtime.md).

## Migration from Chrome App

If you were a user of the original Web Server for Chrome:

1. **The new extension is published here:** [Chrome Web Store listing](https://chromewebstore.google.com/detail/web-server-for-chrome/lpkjdhnmgkhaabhimpdinmdgejoaejic?authuser=0&hl=en)
2. **The Android / ChromeOS app is published here:** [Google Play listing](https://play.google.com/store/apps/details?id=app.ok200.android)
3. The extension launches the server application; it does not contain the
   server itself.
4. Feature parity is a direction, not a claim that every legacy option is
   already available.

Migration status and the final legacy update plan are in
[`docs/topics/legacy-app-migration.md`](docs/topics/legacy-app-migration.md).

## Development

```sh
pnpm install
pnpm build       # compile TypeScript
pnpm test        # run tests
pnpm typecheck   # type check
pnpm lint        # lint with Biome
```

For the Rust-native desktop workspace:

```sh
cd desktop
cargo run -p ok200-core -- --root .. --port 0
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## License

MIT
