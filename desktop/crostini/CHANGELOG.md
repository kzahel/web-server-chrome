# 200 OK ChromeOS Linux changelog

## Unreleased

## [0.1.3]

- Add authenticated UI sessions that stop the content server when the final
  control window closes by default, with an explicit option to keep serving in
  the background.
- Add controller-owned folder browsing and selection for Linux files and
  ChromeOS folders shared with Linux, while preserving canonical path
  confinement.
- Replace the noisy launcher window with a compact system-font launching state
  while retaining actionable recovery details when startup fails.
- Stop the controller during uninstall and explain ChromeOS's asynchronous
  Launcher and shelf cleanup without removing preserved server data.
- Name the ChromeOS Linux Launcher item **200 OK Web Server** and add standard
  Linux generic-name and search-keyword metadata without changing its desktop,
  service, command, or package identities.

## [0.1.2]

- Add authenticated UI sessions that stop the content server when the final
  control window closes by default, with an explicit option to keep serving in
  the background.
- Add controller-owned folder browsing and selection for Linux files and
  ChromeOS folders shared with Linux, while preserving canonical path
  confinement.
- Replace the noisy launcher window with a compact system-font launching state
  while retaining actionable recovery details when startup fails.
- Stop the controller during uninstall and explain ChromeOS's asynchronous
  Launcher and shelf cleanup without removing preserved server data.

## [0.1.1]

- Publish the first completed signed ChromeOS Linux release after restoring
  executable modes removed by GitHub Actions artifact transport. Product
  behavior is unchanged from the verified `0.1.0` source; that tag's release
  job stopped before publication.

## [0.1.0]

- Add the combined graphical launcher, authenticated local controller, and
  explicit `ok200-core` content-server lifecycle.
- Add an offline extension handoff and ChromeOS-specific control surface with
  one-time claim and optional `penguin.linux.test` access.
- Add per-user static-service installation, formal ownership records,
  preserve/purge uninstall behavior, signed update checks, atomic updates, and
  rollback to one retained previous version.
- Add fail-closed static x86_64 and ARM64 release artifacts plus a signed
  architecture/checksum/protocol manifest.
- Add bounded daily controller update checks, failure backoff, authenticated
  check/install status, detached replacement, explicit automatic installation,
  reconnect progress, and local rollback guidance in the extension UI.
