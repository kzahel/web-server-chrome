# 200 OK ChromeOS Linux launcher and controller

This crate owns the combined native component for the future Play-free
ChromeOS path. It is not the desktop Tauri app. The current vertical slice
contains the graphical launcher, authenticated local controller, `ok200-core`
content-server lifecycle, per-user self-install/uninstall commands, and static
systemd service template.

`ok200-crostini launch` maps a real X11 window immediately, starts the
`app.ok200.crostini-controller.service` systemd user unit, validates the
controller health response at `127.0.0.1:20080`, and opens the offline handoff
page at `http://penguin.linux.test:20080/launch-chromeos`. The window closes
after the handoff or remains open with retry/close controls when launch fails.

`ok200-crostini controller` binds the authenticated control plane on port
`20080`, persists private identity/settings below the user config directory,
and leaves the content server stopped until the extension requests **Start**.
The first launch transfers a one-time claim code through the exact extension
handoff; later API calls require the persistent bearer token stored by that
extension.

The checked-in `install` command installs the already-verified current binary
into an immutable per-user version directory, renders the `.desktop` and
static service templates, and starts the controller for that setup session
without enabling the unit or changing user lingering. `uninstall` preserves
settings by default; `uninstall --purge` removes pairing/settings while always
leaving served content alone. This is the install transaction used for
physical development validation. The public download script, signed manifest,
release artifacts, updates, ownership manifest, and rollback still need to be
built before this becomes a supported route.

Useful commands:

```text
ok200-crostini launch
ok200-crostini controller
ok200-crostini status
ok200-crostini reset-controller
ok200-crostini install
ok200-crostini uninstall [--purge]
```

The complete product and security contract lives in
[`docs/topics/chromeos-crostini-launcher.md`](../../docs/topics/chromeos-crostini-launcher.md).
