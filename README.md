<p align="center">
  <img src="images/200ok-256.png" alt="200 OK!" width="128">
</p>

<h1 align="center">200 OK Web Server</h1>

<p align="center"><strong>The cross-platform successor to <a href="https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb">Web Server for Chrome</a>, rebuilt by the original author.</strong></p>

The original Chrome App was used by 200,000+ people for local web development and file sharing. Google discontinued Chrome Apps, so 200 OK Web Server carries that simple workflow forward as:

- **Chrome Extension** — A familiar launcher for the installed server app
- **Desktop App** — Native app (Tauri) for Mac, Windows, and Linux
- **CLI** — `ok200` command for developers who live in the terminal
- **Android / ChromeOS** — Native app, published on Google Play

Same author. Same mission. Modern architecture.

> Looking for the original Chrome App source code? See the [`legacy` branch](https://github.com/kzahel/web-server-chrome/tree/legacy).

**[Feedback, suggestions, and support](https://ok200.app/feedback)** ·
**[Source code](https://github.com/kzahel/web-server-chrome)** ·
**[MIT License](LICENSE)**

## Current Status

The CLI server, Chrome extension, Android app, and signed desktop `v0.1.5` have
all shipped. Their runtimes are intentionally not unified:

- the CLI uses the TypeScript engine on Node.js;
- Android source uses a native Kotlin HTTP/storage core behind its Compose UI;
- desktop `v0.1.5` uses the standalone Rust HTTP core behind the Tauri/React
  control surface; and
- the extension is a launcher/status surface, not the HTTP server.

Desktop `main` uses the standalone Rust core for HTTP, filesystem, and server
lifecycle work; its Tauri webview is only a static React control surface.
Signed desktop `v0.1.5` includes the AppImage-first Linux installation,
native-host relaunch repair, Linux ARM64 packages, and package-aware signed
updates. Android, desktop, and the published Node CLI remain deliberately
independent implementations. GitHub release `android-v0.2.1` contains the
signed native Kotlin APK and AAB with the physically validated ChromeOS
LAN-address correction. The maintainer reports `v0.2.1` submitted to Play;
Play may continue serving an earlier artifact until review and rollout finish.

See the living
[product branding decision](docs/topics/product-branding.md),
[desktop runtime decision](docs/topics/desktop-runtime.md),
[Android runtime decision](docs/topics/android-runtime.md),
[ChromeOS extension launcher decision](docs/topics/chromeos-extension-launcher.md),
[ChromeOS Crostini launcher/controller decision](docs/topics/chromeos-crostini-launcher.md), and
[active extension/ChromeOS closeout](docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md).
The scoped Play-free Linux fallback is recorded in
[the Crostini tactical](docs/tactical/012-chromeos-crostini-fallback.md).

## Install

- Chrome Extension: [200 OK Web Server on the Chrome Web Store](https://chromewebstore.google.com/detail/web-server-for-chrome/lpkjdhnmgkhaabhimpdinmdgejoaejic?authuser=0&hl=en)
- Android / ChromeOS: [200 OK on Google Play](https://play.google.com/store/apps/details?id=app.ok200.android)
- Desktop app: [download the latest signed release](https://ok200.app/download).
  AppImage is recommended on Linux because it installs and updates without an
  administrator password; DEB and RPM remain secondary system packages. Linux
  packages are published for x86_64 and ARM64.

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
- Complete store review, rollout, and controlled delivery proof for the
  submitted Android and launcher-focused extension candidates
- Provide a verified mini-Rust Crostini fallback for ChromeOS users without
  Google Play
- Complete the final legacy Chrome App migration update
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

The repository contains three intentionally independent server runtimes and the
platform applications that use or launch them:

```
packages/engine/     TypeScript HTTP server used by the Node CLI
packages/cli/        CLI wrapper (Node.js adapters)
extension/           Chrome Extension
desktop/             Tauri/React controls plus Rust application state
desktop/core/        Rust HTTP core and development CLI
android/             Compose app plus Kotlin HTTP/storage and lifecycle core
```

The CLI uses TypeScript with Node adapters, desktop uses native Rust, and
Android uses native Kotlin. Their core feature contract is kept broadly
compatible through tests rather than shared runtime source. The Tauri webview
remains for configuration and control, while native Rust owns desktop sockets,
filesystem access, HTTP behavior, and server lifecycle. Authoritative runtime
boundaries live in
[`docs/topics/desktop-runtime.md`](docs/topics/desktop-runtime.md) and
[`docs/topics/android-runtime.md`](docs/topics/android-runtime.md).

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
