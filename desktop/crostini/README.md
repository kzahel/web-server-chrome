# 200 OK ChromeOS Linux launcher

This crate owns the small graphical launcher for the future Play-free
ChromeOS path. It is not the desktop Tauri app and does not yet implement the
Crostini controller.

`ok200-crostini launch` maps a real X11 window immediately, starts the
`app.ok200.crostini-controller.service` systemd user unit, validates the
controller health response at `127.0.0.1:20080`, and opens the offline handoff
page at `http://penguin.linux.test:20080/launch-chromeos`. The window closes
after the handoff or remains open with retry/close controls when launch fails.

The corresponding `.desktop.in` file is in `resources/`. The future installer
must replace `@OK200_CROSTINI_BINARY@` with the executable's validated absolute
path, install the rendered desktop entry and branded icon, install the
controller unit, and refresh the user application database. The complete
product and security contract lives in
[`docs/topics/chromeos-crostini-launcher.md`](../../docs/topics/chromeos-crostini-launcher.md).
