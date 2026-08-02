# 200 OK ChromeOS Linux changelog

## Unreleased

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
