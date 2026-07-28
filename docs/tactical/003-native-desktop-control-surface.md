# 003: Native Desktop Control Surface

Status: **active; implementation in progress.**

Topic: `desktop-native-core`

Parent: [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

Baseline: `c13be9f` on 2026-07-28. The preflight worktree contained one
unrelated `pnpm-lock.yaml` change; this tactical leaves it unstaged.

## Objective

Replace the desktop webview-hosted TypeScript HTTP execution path with the
standalone Rust core and make the one-server control surface safe and
understandable.

This slice stops at a production-style macOS review build. It does not create
or publish a release.

## User-visible contract

- A native folder chooser is the primary way to select or change the served
  directory.
- An empty directory is never interpreted as the current working directory.
- The filesystem root is rejected by Rust and cannot be overridden.
- Serving the home directory, an ancestor of home, or a directory outside home
  requires a clear confirmation. LAN access makes the warning explicit.
- Directory, port, and serving options persist between launches.
- Start and Stop are idempotent Rust-owned operations.
- The UI always shows `Stopped`, `Starting`, `Running`, `Stopping`, or `Error`.
- Start is disabled until a usable directory has been selected, and repeated
  clicks cannot create multiple listeners.
- Configuration cannot change while the server is starting, running, or
  stopping.
- The inactive gear control and placeholder Security/Advanced sections are not
  shown.
- The single-server product does not present a misleading multi-server
  navigation surface.

## Runtime boundary

```text
React control surface
  -> typed Tauri configure/start/stop/status/pick-folder commands
  -> Rust application state
  -> ok200-core
  -> native TCP and filesystem I/O
```

HTTP request bodies and served file bytes must not cross Tauri IPC. Vite
remains a development server for `tauri dev` and a production asset bundler for
`tauri build`; no Vite server or hot-reload client is part of the installed
application.

The previous TypeScript/Tauri primitive path remains available only until the
new path passes the command and product smoke tests. Removal is a separate,
reviewable commit in this tactical rather than a prerequisite for proving the
new state layer.

## Implementation checklist

### Rust state and safety

- [ ] Make `ok200-desktop` depend on `ok200-core`.
- [ ] Add one persisted desktop server configuration with backward-compatible
  defaults.
- [ ] Add narrow commands for get, configure, start, stop, and native folder
  selection.
- [ ] Serialize lifecycle transitions so Start and Stop are idempotent.
- [ ] Forward bounded status, request, and error events without forwarding file
  content.
- [ ] Reject an empty root and any filesystem root in the core.
- [ ] Classify home, ancestor-of-home, outside-home, and LAN exposure for
  confirmation.
- [ ] Stop the server cleanly when the application actually exits.

### Control surface

- [ ] Replace the in-webview registry/server callbacks with a typed Tauri
  manager.
- [ ] Use the native folder chooser and a focused risk-confirmation dialog.
- [ ] Render explicit lifecycle status and action-pending states.
- [ ] Prevent invalid or concurrent actions.
- [ ] Reduce the layout to the one server the desktop app actually owns.
- [ ] Remove nonfunctional and placeholder controls.

### Validation

- [ ] Unit-test config persistence/defaults, root-risk classification, invalid
  roots, and lifecycle idempotency.
- [ ] Update Tauri E2E selectors and prove start, external fetch, stop, and
  restart through the Rust command path.
- [ ] Run the repository TypeScript workflow.
- [ ] Run the complete desktop Rust workflow.
- [ ] Inspect the production bundle for the old desktop server entry point.
- [ ] Build and install a production-style macOS app in `~/Applications`.
- [ ] Confirm no Vite development server is needed by the installed app.

## Review checkpoint

Stop for human review when the installed macOS app can:

1. choose a folder without typing a path;
2. clearly show its stopped/running state;
3. prevent empty-root and filesystem-root starts;
4. confirm broad or externally exposed roots;
5. start once, serve a real file, stop once, and restart; and
6. retain its configuration after a relaunch.

Release signing, updater migration, cross-platform installers, and release
publication remain gated by the parent tactical.
