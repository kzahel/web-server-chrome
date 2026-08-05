# Desktop product E2E

This suite drives the real Tauri/WebKitGTK application through `tauri-driver`.
It starts and stops the Rust server through the UI, fetches real HTTP responses,
and checks that the app-settings dialog is portaled to the body and fully fits
the supported window viewport.

Run it on Linux with WebKitWebDriver and Xvfb installed:

```bash
cargo install --locked tauri-driver --version 2.0.6
desktop/tauri-app/e2e/run-e2e.sh
```

The runner installs both locked JavaScript dependency sets, builds the Debug
Tauri binary unless `SKIP_BUILD=1` is set, and owns the driver process it starts.
Logs and failure screenshots go to `e2e/artifacts/` or
`$OK200_E2E_ARTIFACTS`. A green Linux result does not claim macOS or Windows
WebView/package behavior.
