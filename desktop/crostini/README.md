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

The checked-in bootstrap installer selects a static x86_64 or ARM64 release,
verifies its signed canonical manifest plus exact size and SHA-256, runs a
binary version self-test, and only then calls the binary's guarded install
transaction. Installation uses immutable per-user version directories, an
atomic `current` link, one retained `previous` version, an exact ownership
manifest, a local rollback command, a `.desktop` entry, and a static user
service. It starts the controller for that explicit setup session without
enabling the unit or changing user lingering. Normal uninstall preserves
settings; `uninstall --purge` removes controller identity/settings while both
modes leave served content and ChromeOS sharing/forwarding state alone.
Before uninstalling, close the extension controls and any transient launcher
window. ChromeOS removes the Launcher registration asynchronously; do not click
a leftover loading shelf placeholder while that removal settles.

While the controller is active, it checks its signed release channel at most
daily, with one-hour failure backoff. The extension exposes check/install
status, signed manual updates, and an explicit automatic-install preference.
Automatic installation waits until content is stopped; manual installation
also stops only after user confirmation, and neither path resumes serving
after controller replacement. Installation runs in a separate transient
systemd user unit so replacing the controller cannot kill its own updater.

The release pipeline and update-service protocol are implemented in source,
but no signed `crostini-v` release or public route is available yet. The
source-only `install` command remains useful for development; a supported
installation starts at `https://ok200.app/install-crostini.sh` only after the
release and physical gates in the topic document pass.

Useful commands:

```text
ok200-crostini launch
ok200-crostini controller
ok200-crostini status
ok200-crostini reset-controller
ok200-crostini install
ok200-crostini uninstall [--purge]
ok200-crostini check-update
ok200-crostini update
ok200-crostini rollback
```

The complete product and security contract lives in
[`docs/topics/chromeos-crostini-launcher.md`](../../docs/topics/chromeos-crostini-launcher.md).
