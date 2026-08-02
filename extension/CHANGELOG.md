# Changelog

## [0.1.6]

### Changed
- Present ChromeOS Linux and Android as peer implementation choices: Linux is
  the no-Play, extension-controlled route, while Android is the quickest Google
  Play route when available.
- Update the package summary and canonical store copy to explain that the
  extension can set up and control the ChromeOS Linux server as well as launch
  the desktop and Android apps.
- Describe Linux support for x86_64 and ARM64 Chromebooks plus compatible
  x86_64 ChromeOS Flex devices without claiming universal availability.

### Fixed
- Keep **Try Again** on the Linux setup route after a tab-opening error instead
  of switching to the Android launcher.

## [0.1.5]

### Added
- Add **Use the Linux version** to the ChromeOS launcher popup while keeping
  Android as the recommended route.
- Bundle the complete offline-capable Linux setup and recovery guide in the
  extension, including the signed installer, Launcher behavior, Linux file
  sharing, LAN port forwarding, updates, rollback, and uninstall.
- Add a ChromeOS Linux controller for the signed x86_64 and ARM64 component,
  with one-time pairing, authenticated start/stop/settings, version status,
  manual update, and opt-in stopped-server automatic updates.

### Changed
- Rename the website action to **Compare ChromeOS options** now that the
  owned page offers both Android and Linux paths.
- Request access to `penguin.linux.test` only after the user enters the Linux
  controller flow; the permission remains optional at install time.

## [0.1.4]

### Added
- Launch the Android app on ChromeOS through its `ok200://launch` intent, with
  permanent Google Play and ChromeOS-options links.
- Explain Android/Google Play availability limits and unsupported-platform
  alternatives without claiming that the extension can detect Play state.
- Set the expectation that ChromeOS may ask the user to confirm 200 OK in an
  **Open with** prompt on first launch.
- Cover ChromeOS launch, retry, missing desktop app, and unsupported platform
  behavior with popup-level tests.

### Fixed
- Retry the Android intent after a ChromeOS launch error instead of attempting
  unsupported desktop native messaging.
- Send missing desktop-app users directly to the signed download page.
- Build extension ZIPs from an empty store-safe staging directory and reject
  development keys/origins, source maps, unexpected files, excess permissions,
  and tag/version mismatches in CI.

### Changed
- Adopt the 200 OK Web Server product name and explain the extension's launcher
  role while retaining the legacy name in successor copy.
- Replace the stale desktop-app destination with the canonical product site.
- Add stable Feedback & support and Source · MIT links to the popup.
- Separate **Open installed Android app** from the guaranteed HTTPS
  installation/options route instead of pretending the extension can determine
  which route applies.

## [0.1.3]

### Fixed
- Remove unused storage permission flagged by Chrome Web Store review

## [0.1.2]

### Changed
- Renamed extension to "Web Server for Chrome"
- Updated description to "Serve any folder on your local machine over HTTP."

### Added
- Legacy Chrome App migration via cross-extension messaging
- Respond to ping from legacy app and ok200.app for seamless upgrade detection

## [0.1.1]

### Added
- Initial Chrome extension with native messaging to desktop app
- Popup UI for server configuration
- Directory picker via native messaging bridge
