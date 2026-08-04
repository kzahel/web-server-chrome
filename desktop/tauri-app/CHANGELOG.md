# Changelog

## Unreleased

## [0.1.7]

### Changed

- Name the macOS application and system display **200 OK Web Server** so
  launcher searches for “web server” find it, while retaining **200 OK** as
  the short bundle and compact interface name.
- Name the installed Windows application and Linux launcher
  **200 OK Web Server**, and add standard Linux generic-name and search-keyword
  metadata while retaining the existing executable, package, and desktop-file
  identities.

### Fixed

- Render App settings outside the transformed header so the full dialog is
  visible and interactive on Windows, macOS, and Linux.
- Exit cleanly when the last window closes with **Run in Background** disabled,
  while preserving hide-and-restore behavior when it is enabled.
- Reap native-host launch children without blocking Chrome so repeated desktop
  launches do not leave defunct processes behind.
- Keep AppImage GIO module loading inside the portable bundle to avoid loading
  incompatible host GVFS modules.

## [0.1.6]

### Added

- Add a canonical in-app settings panel with Start at Login, Run in
  Background, tray or menu-bar icon visibility, manual update checking, and
  Quit controls.

### Changed

- Make icon visibility configurable on Windows and Linux as well as macOS,
  while retaining native and tray menu items as synchronized shortcuts.

## [0.1.5]

### Added

- Publish Linux ARM64 packages: AppImage, DEB, and RPM, with `linux-aarch64`
  updater metadata. The install script now detects `aarch64` automatically.

### Changed

- Make AppImage the recommended Linux package and support a checksum-verified
  per-user installation that does not require administrator privileges.
- Check quietly for updates five seconds after launch and every 24 hours while
  the app remains open, while keeping manual results and installation actions
  explicit.
- Offer signed in-app installation only for app, NSIS, and AppImage bundles.
  MSI, DEB, and RPM installs now use an explicit manual download path so an
  update cannot silently cross package ownership or install scope.

### Fixed

- Persist the real AppImage path and install a stable desktop identity so the
  Chrome extension's copied native host can launch AppImage-only installs.
- Refresh the copied Linux native host atomically when the AppImage starts.
- Restore and focus the existing app window when 200 OK is reopened from the
  macOS Dock instead of creating a duplicate or appearing unresponsive.

## [0.1.4]

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
- Add persistent Feedback & support and Source · MIT links that open outside
  the control webview.
- Add manual and once-daily update checks with in-app current/error/available
  status, signed download progress, and an Update and restart action.

### Removed

- Remove the desktop TypeScript server, primitive Tauri TCP/filesystem IPC, and
  the desktop/UI dependency on `@ok200/engine`.

### Fixed

- Use the per-user Windows installer by default, harden uninstall cleanup, and
  preserve the published extension identity across native-messaging builds.
- Make desktop releases fail closed and verify Apple notarization, Windows
  Authenticode signatures, updater metadata, artifact names, and checksums
  before publication.

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
