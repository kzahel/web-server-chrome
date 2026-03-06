# Changelog

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
