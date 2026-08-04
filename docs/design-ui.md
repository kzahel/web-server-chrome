# UI Design

Cross-platform visual design for 200 OK across Android (Jetpack Compose),
desktop (Tauri/HTML), and the planned native iOS application (SwiftUI). This
document includes future responsive directions; implemented layouts remain
platform-specific.

Status: **visual principles and future layout exploration.** The implemented
desktop product is a single-server portrait control surface; the responsive
sidebar, server switcher, and multi-server wireframes below are not current
behavior. Their unused React scaffolding was removed after the Node CLI and
remote UI retired.

The original cross-platform TypeScript engine assumptions are superseded by
the independent Rust desktop and Kotlin Android runtimes in
[`topics/desktop-runtime.md`](topics/desktop-runtime.md) and
[`topics/android-runtime.md`](topics/android-runtime.md). The accepted iOS
direction is a third independent Swift implementation in
[`topics/ios-runtime.md`](topics/ios-runtime.md).

## Principles

- **Simple by default.** First-time user: pick a folder, hit start. Done.
- **Progressive disclosure.** Multi-server, advanced settings — there but not in your face.
- **One page per server.** All controls and settings for one server live on a single scrollable screen. No drilling into a separate settings page for per-server config.
- **App-level settings are separate.** Global stuff (boot behavior, power management) lives behind a gear icon, not mixed in with per-server options.
- **The main UI is canonical.** Every app option and every action needed to
  manage or exit the desktop app is reachable from its main window. Native,
  menu-bar, and system-tray menus are optional shortcut surfaces only; they
  never own exclusive controls. This remains true when the user hides an icon
  or a Linux desktop does not provide a usable tray.

## Future Responsive Layout Exploration

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

**Serving** *(LAN access, listings, CORS, and SPA fallback exist in the native
server cores; remaining entries are product directions)*
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

The desktop surface must include all of its current app-level controls:

- **Start at Login** — launch the desktop application after login
- **Run in Background** — keep the application available when its window is closed
- **Show Icon in Menu Bar** (macOS) / **Show Icon in System Tray**
  (Windows and Linux) — default on, but optional on every platform
- **Check for Updates** — run a manual update check and show its result in the app
- **Quit** — explicitly exit when closing the window would otherwise hide it

Native application menus and tray/status-icon menus may duplicate these items
for speed. They are never a prerequisite for discovering, changing, or
recovering a setting. Relaunching from the platform's normal app launcher must
restore the existing window even when the icon is hidden.

Potential later app-level settings include:

- **Start on boot** — launch the app and auto-start servers that were running when the app last closed
- **Auto-shutdown** — stop servers after N minutes of inactivity (default: off or 15 min)
- **Battery optimization** — prompt to exclude from battery optimization (Android)
- **Theme** — system / light / dark
- **Default port** — starting port for new servers (default: 8080)

This list is intentionally short. If a setting is per-server, it goes on the server page, not here.

## Architecture: Native Control Surfaces

The desktop React UI is a control surface for the Rust-owned server. Its
`ServerManager` interface keeps React components independent from Tauri command
details:

```typescript
interface ServerManager {
  updateServer(id: string, config: Partial<ServerConfig>): Promise<ServerInfo>
  startServer(id: string): Promise<ServerInfo>
  stopServer(id: string): Promise<ServerInfo>
}

class TauriServerManager implements ServerManager   // desktop → typed Tauri commands to Rust
```

The earlier Node CLI management API, remotely served browser UI, and
`HttpServerManager` transport were an unpublished proof and have been retired.
Remote management would require a new product and security decision; it is not
latent shared-UI behavior.

### How each platform controls its server

| Platform | UI | Backend adapter |
|----------|-----|----------------|
| **Desktop (Tauri)** | Shared React controls in the webview | `TauriServerManager` → commands/events to Rust-owned servers |
| **Android** | Jetpack Compose (native) | Application controller → Kotlin HTTP/storage core |
| **iOS (planned)** | SwiftUI (native) | Application controller → Swift HTTP/storage core |
| **ChromeOS Linux** | Extension setup/control page | Authenticated Crostini controller → shared Rust core |

## Platform Notes

### Android (Jetpack Compose)
- Material Design 3 with the product's yellow/black identity
- SAF folder selection is always available; optional all-files access enables a separate filesystem picker
- Foreground service notification while background serving is enabled
- `BOOT_COMPLETED` receiver for start-on-boot
- Background, three wake policies, low-battery shutdown, and power/Doze diagnostics live under Advanced
- Same design language as web UI, native implementation

### Desktop (Tauri)
- Embeds the shared React controls in a webview
- Uses `TauriServerManager` commands/events rather than an HTTP management API
- Currently uses one portrait, single-server control page without a sidebar
- System tray support for background mode
- Native file picker via Tauri dialog API

### iOS (SwiftUI, planned)
- Uses the same compact branded header, server-status hierarchy, folder,
  network, serving-option, and URL concepts as Android and desktop
- Uses native SwiftUI controls and iOS spacing rather than copying another App
  Store application's layout
- Selects one directory through Files and keeps the first release read-only
- Runs only while the app is foregrounded; it has no background, boot, wake,
  notification-service, or battery-policy settings
- Uses an in-app preview so localhost content can be inspected without
  backgrounding the server app
