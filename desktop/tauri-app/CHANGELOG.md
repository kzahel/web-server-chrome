# Changelog

## Unreleased

### Changed

- Move desktop HTTP execution and lifecycle from the webview into the
  standalone Rust core.
- Replace typed path entry with a native folder chooser and persist the server
  configuration.
- Simplify the control surface to one server with explicit lifecycle status,
  guarded roots, and idempotent Start/Stop actions.
- Restore the compact portrait window, adopt the 200 OK Web Server identity,
  add a lifecycle switch and point-of-use locked-setting guidance, and support
  native URL opening.
- Restore browser-like Rust directory listings with inline file/folder icons,
  human-readable metadata, responsive layout, and automatic light/dark mode.

### Removed

- Remove the desktop TypeScript server, primitive Tauri TCP/filesystem IPC, and
  the desktop/UI dependency on `@ok200/engine`.

## [0.1.3]

### Added
- Native host telemetry: pings update server every 24 hours with X-CFU-Id for unique install tracking

### Fixed
- Wire in real Chrome Web Store extension ID for native messaging host registration
- Fix clippy warnings in host launcher and filesystem commands

## [0.1.1]

### Added
- Initial Tauri desktop app with native messaging host
- System tray with server status
- Auto-updater support
- Headless update mode for background updates
- Native messaging host registration for Chrome, Chromium, Brave, Edge, Vivaldi, Arc
- Windows NSIS installer with native messaging registry setup
- macOS .pkg installer
- E2E test suite
