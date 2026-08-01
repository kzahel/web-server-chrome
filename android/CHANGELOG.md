# Changelog

## [Unreleased]

### Fixed
- Resolve URLs from Android’s active Wi-Fi/Ethernet network instead of the
  first enumerated interface, and refresh them when network links change.
- On ChromeOS, suppress ARC-private IPv4 addresses and show honest Chromebook
  IPv4 instructions with the active port.
- Show reachable IPv4 and IPv6 HTTP URLs together on dual-stack networks, with
  bracketed IPv6 formatting; keep loopback available for on-device access.
- Avoid presenting cellular or VPN interface addresses as peer-facing LAN
  URLs.

## [0.2.0]

### Added
- Add stable Feedback & support and Source · MIT links to the main screen.
- Add a native Kotlin HTTP server with streaming files, byte ranges, cache
  validation, bounded keep-alive and concurrent connections, and port `0`.
- Add localhost/LAN binding, directory-listing, CORS, and single-page-app
  fallback controls aligned with the desktop app.
- Add three explicit server lifetime choices: while the app is open, continue
  in the background, and reliable background serving with a notification.
- Add screen-off availability, start-on-boot, low-battery shutdown, and power
  diagnostics under Advanced settings.
- Add clear explanations and a Stop server action when running locks a setting.

### Changed
- Replace the embedded QuickJS/TypeScript request path with one
  application-owned Kotlin server and lifecycle controller.
- Redesign the main screen around a prominent start/stop switch, grouped server
  settings, reachable HTTP URLs, the real app artwork, and a compact header.
- Keep both Android's system folder picker and optional direct shared-storage
  folders, with clearer non-technical access and error messages.
- Default CORS and screen-off wake behavior to Off.
- Target Android 16 (API level 36) for current Google Play compatibility.
- Extract Android UI, accessibility, notification, lifecycle, and storage copy
  into locale resources, with generated app-language metadata and debug
  pseudo-locales for translation testing.

### Fixed
- Serve over the phone's LAN address when LAN access is enabled and consistently
  display the supported `http://` scheme.
- Stream multi-gigabyte files with 64-bit lengths and byte ranges without
  loading them into memory.
- Make notification, boot, wake-lock, background, and shutdown entry points use
  the same authoritative server state and cleanup path.

### Removed
- Remove the bundled QuickJS runtime, JavaScript server bundle, JNI/C++ bridge,
  NDK build, and obsolete native I/O adapter modules.

## [0.1.2]

### Fixed
- Fix 403 Forbidden when opening files from directory listing (root path check failed for "/" root)

## [0.1.1]

### Added
- Power management system: DozeMonitor, WakeLockManager for reliable background operation
- Boot receiver to auto-start server on device boot
- ServiceLifecycleManager for robust foreground service handling
- Custom folder picker with root filesystem browsing
- All-files-access (MANAGE_EXTERNAL_STORAGE) permission support
- SettingsStore for persistent server configuration
- Store assets (screenshots, feature graphic, icon)

### Changed
- Updated launcher icons to full-bleed square for adaptive icon support
- Enhanced Debug RPC with additional methods (startServer, stopServer, setPort, setRootPath)
- Improved ServerScreen UI with more controls and status display

## [0.1.0]

### Added
- Initial Android app with QuickJS-powered HTTP server engine
- Material 3 UI with server controls (start/stop, port, root directory)
- SAF directory picker for serving files
- Foreground service for background server operation
- Debug RPC system via ContentProvider for automated testing
