# UI Design

Cross-platform UI design for 200 OK. Same design language on Android (Jetpack Compose), desktop (Tauri/HTML), and eventually iOS. The layout adapts by screen width, not by platform.

## Principles

- **Simple by default.** First-time user: pick a folder, hit start. Done.
- **Progressive disclosure.** Multi-server, advanced settings — there but not in your face.
- **One page per server.** All controls and settings for one server live on a single scrollable screen. No drilling into a separate settings page for per-server config.
- **App-level settings are separate.** Global stuff (boot behavior, power management) lives behind a gear icon, not mixed in with per-server options.

## Screen Layout

### Phone (< 600dp)

Single column. Server switcher is a dropdown at the top.

```
┌─────────────────────────────┐
│ ▼ :8080 · ~/website     ⚙️  │  ← dropdown switcher + app settings gear
├─────────────────────────────┤
│                             │
│  📁 ~/website       [Change]│  ← serving directory
│  Port: 8080                 │
│                             │
│      [ ◉ START / STOP ]     │  ← hero action
│                             │
│  http://192.168.1.5:8080  📋│  ← URL + copy (visible when running)
│                             │
│  ▶ Serving                  │  ← collapsible settings sections
│  ▶ Security                 │
│  ▶ Advanced                 │
│                             │
└─────────────────────────────┘
```

Tapping the dropdown expands the server switcher:

```
┌─────────────────────────────┐
│ ▲ :8080 · ~/website     ⚙️  │
├─────────────────────────────┤
│ 🟢 :8080 · ~/website       │  ← current server (highlighted)
│ ⚫ :3000 · ~/project        │  ← stopped server
│ + New server                │
├─────────────────────────────┤
│        (rest of page)       │
└─────────────────────────────┘
```

### Tablet / Desktop (≥ 600dp)

Sidebar + detail. The sidebar is the server list, permanently visible. Same content, just reflowed.

```
┌──────────────────┬──────────────────────────────────┐
│ Servers       ⚙️  │  :8080 · ~/website               │
│──────────────────│                                  │
│ 🟢 :8080         │  📁 ~/website            [Change] │
│    ~/website     │  Port: 8080                      │
│ ⚫ :3000         │                                  │
│    ~/project     │       [ ◉ START / STOP ]         │
│                  │                                  │
│                  │  http://192.168.1.5:8080  📋      │
│                  │                                  │
│                  │  ▶ Serving                       │
│                  │  ▶ Security                      │
│                  │  ▶ Advanced                      │
│                  │                                  │
│ + New server     │                                  │
└──────────────────┴──────────────────────────────────┘
```

The sidebar and dropdown are the same data — just different presentations based on available width. The detail panel is identical to the phone layout.

## Server Switcher

The server switcher serves as both navigation and overview:

- Shows server name/label, port, directory, and running status for each server
- Single-server users see just one entry and rarely interact with it
- Multi-server users see all servers at a glance with status indicators
- "+ New server" creates a server with defaults (next available port, no directory selected)

### Server Identity

Each server displays as **`:port · directory`** (e.g., `:8080 · ~/website`). Port and directory are the two things that meaningfully distinguish servers. Users can optionally set a name that replaces this default label.

## Per-Server Page

The page for each server has two zones:

### Hero Zone (always visible, above the fold)

The essentials for the primary use case: pick a folder, set a port, start the server, access the URL.

- **Directory selector** — shows current directory with a change button. Disabled while server is running.
- **Port input** — editable numeric field. Disabled while running.
- **Start / Stop** — the primary action. Big, obvious.
- **Server URL** — appears when running. Tappable to open in browser. Copy button. On mobile, long-press or overflow for QR code and share.

### Settings Zone (below the fold, collapsible sections)

Grouped into collapsible cards. All collapsed by default so they don't overwhelm. Each section shows a summary of what's enabled when collapsed (e.g., "CORS, SPA" or "Off").

**Serving** *(first settings to implement — all already supported by the engine)*
- LAN access toggle — binds `0.0.0.0` (on) vs `127.0.0.1` (off)
- Directory listing toggle
- CORS toggle
- Not-found page — path to serve when no file matches (e.g. `/index.html` for SPAs, `/404.html` for custom error page). Served with 404 status. Empty = default 404 response. Replaces the current boolean `spa` flag with something more general.
- Clean URLs toggle (strip .html) *(later)*
- Custom headers → opens sub-page (key-value editor) *(later)*

**Security** *(later)*
- HTTPS toggle → when enabled, shows cert config or auto-generates self-signed
- HTTP Basic Auth toggle → when enabled, opens credentials sub-page
- IP whitelist → opens sub-page

**Advanced** *(later)*
- File upload toggle
- Precompressed file serving (.gz/.br) toggle
- Cache-Control → opens sub-page or inline input
- Hidden/dot files toggle
- .gitignore respect toggle

Most settings are simple toggles that work inline. Only settings that need multi-field input (custom headers, auth credentials, IP whitelist) open a sub-page.

Settings changes while the server is running take effect on the next request (no restart required) where possible. Settings that require restart (port, directory, HTTPS) are disabled while running, same as today.

## App-Level Settings (Gear Icon)

Accessed via the gear icon in the toolbar (phone) or sidebar header (tablet/desktop). Opens a separate page.

- **Start on boot** — launch app and auto-start servers that were running when app last closed
- **Auto-shutdown** — stop servers after N minutes of inactivity (default: off or 15 min)
- **Battery optimization** — prompt to exclude from battery optimization (Android)
- **Theme** — system / light / dark
- **Default port** — starting port for new servers (default: 8080)

This list is intentionally short. If a setting is per-server, it goes on the server page, not here.

## Architecture: Management API + Web UI

The web UI is not a separate mock or prototype — it's a **remote control for the real server**, served by the server itself. This same web UI is also the Tauri desktop frontend. An adapter interface abstracts over the transport.

### Management API

The CLI server exposes a management API alongside its normal file serving. The web UI calls this API. Third-party tools can also use it (scripting, CI, etc.).

```
/_api/servers              GET     list all servers + status
/_api/servers              POST    create a new server
/_api/servers/:id          GET     get server config + status
/_api/servers/:id          PUT     update settings
/_api/servers/:id/start    POST    start server
/_api/servers/:id/stop     POST    stop server
/_api/servers/:id/logs     GET     request log stream
/_api/ui/                  GET     serves the built web UI
```

The API is always available — no paywall, no feature flag. It's a natural consequence of the architecture, not an add-on.

### Adapter Interface

The web UI talks to an abstract `ServerManager` interface. Two implementations:

```typescript
interface ServerManager {
  listServers(): Promise<ServerInfo[]>
  createServer(config: Partial<ServerConfig>): Promise<ServerInfo>
  updateServer(id: string, config: Partial<ServerConfig>): Promise<ServerInfo>
  startServer(id: string): Promise<void>
  stopServer(id: string): Promise<void>
}

class HttpServerManager implements ServerManager    // web UI → HTTP calls to /_api/
class DirectServerManager implements ServerManager  // desktop → direct JS calls to engine (same process)
```

Same React components, same state management, different transport.

### How each platform uses this

| Platform | UI | Backend adapter |
|----------|-----|----------------|
| **CLI remote UI** | Web UI served at `/_api/ui/` | `HttpServerManager` → HTTP to `/_api/` |
| **Desktop (Tauri)** | Same React app in webview | `DirectServerManager` → JS calls to engine in same process |
| **Android** | Jetpack Compose (native) | Direct Kotlin calls to engine |

### Development workflow

Run `ok200` on your laptop, open `http://<lan-ip>:8080/_api/ui/` on your phone. Full control panel, live iteration on the real UI. Changes to the React app are the actual desktop/web frontend, not a throwaway prototype.

## Platform Notes

### Android (Jetpack Compose)
- Material Design 3, dynamic theming
- Directory picker uses SAF (Storage Access Framework) — no all-files permission needed
- Foreground service notification when server is running
- `BOOT_COMPLETED` receiver for start-on-boot
- Same design language as web UI, native implementation

### Desktop (Tauri)
- Embeds the same React web UI in a webview
- Uses `TauriServerManager` adapter instead of HTTP
- Always shows sidebar layout (window is wide enough)
- System tray support for background mode
- Native file picker via Tauri dialog API

### CLI
- Serves the web UI at `/_api/ui/` for remote management
- Management API at `/_api/` for programmatic control
- UI is optional — CLI flags still work for everything
