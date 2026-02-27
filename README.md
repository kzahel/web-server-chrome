# Web Server for Chrome

**The next generation of [Web Server for Chrome](https://chrome.google.com/webstore/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb), rebuilt from scratch by the original author.**

The original Chrome App was used by 200,000+ people for local web development and file sharing. Google discontinued Chrome Apps, so Web Server for Chrome is being rebuilt as:

- **Chrome Extension** — The familiar UI, now as an extension
- **Desktop App** — Native app (Tauri) for Mac, Windows, and Linux
- **CLI** — `ok200` command for developers who live in the terminal
- **Android / ChromeOS** — Native app (in development)

Same author. Same mission. Modern architecture.

> Looking for the original Chrome App source code? See the [`legacy` branch](https://github.com/kzahel/web-server-chrome/tree/legacy).

## Current Status

The CLI server is functional today. The Chrome extension and desktop app are in active development.

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
- Chrome Extension with native helper app
- Tauri desktop app (Mac, Windows, Linux) — ~10MB vs 100MB+ Electron alternatives
- Android / ChromeOS native app (QuickJS + Kotlin, in development)
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

Platform-agnostic TypeScript HTTP engine with native I/O adapters per platform. Same adapter pattern proven in [JSTorrent](https://jstorrent.com).

```
packages/engine/     Platform-agnostic HTTP server (no platform deps)
packages/cli/        CLI wrapper (Node.js adapters)
extension/           Chrome Extension
desktop/             Tauri desktop app
android/             Android app (QuickJS + Kotlin/Compose)
```

## Migration from Chrome App

If you were a user of the original Web Server for Chrome:

1. **The Chrome Web Store listing will be updated** to point to the new extension once it's ready.
2. **All features from the original app will be supported** — same options, same workflow.
3. **Sign up to be notified:** [Google Form](https://forms.gle/88Q5rbZ81sKqXZTt8)

## Development

```sh
pnpm install
pnpm build       # compile TypeScript
pnpm test        # run tests
pnpm typecheck   # type check
pnpm lint        # lint with Biome
```

## License

MIT
