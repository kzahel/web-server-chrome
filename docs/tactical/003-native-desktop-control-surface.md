# 003: Native Desktop Control Surface

Status: **complete; macOS product smoke accepted.**

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

The previous TypeScript/Tauri primitive path was removed after the Rust command
surface, UI integration, and command-level tests passed. Android and the Node
CLI still use `packages/engine`; the desktop app and shared desktop UI no
longer depend on it.

## Implementation checklist

### Rust state and safety

- [x] Make `ok200-desktop` depend on `ok200-core`.
- [x] Add one persisted desktop server configuration with backward-compatible
  defaults.
- [x] Add narrow commands for get, configure, start, stop, and native folder
  selection.
- [x] Serialize lifecycle transitions so Start and Stop are idempotent.
- [x] Forward bounded status, request, and error events without forwarding file
  content.
- [x] Reject an empty root and any filesystem root in the core.
- [x] Classify home, ancestor-of-home, outside-home, and LAN exposure for
  confirmation.
- [x] Stop the server cleanly when the application actually exits.

### Control surface

- [x] Replace the in-webview registry/server callbacks with a typed Tauri
  manager.
- [x] Use the native folder chooser and a focused risk-confirmation dialog.
- [x] Render explicit lifecycle status and action-pending states.
- [x] Prevent invalid or concurrent actions.
- [x] Reduce the layout to the one server the desktop app actually owns.
- [x] Remove nonfunctional and placeholder controls.

### Validation

- [x] Unit-test config persistence/defaults, root-risk classification, invalid
  roots, and lifecycle idempotency.
- [ ] Update Tauri E2E selectors and prove start, external fetch, stop, and
  restart through the Rust command path.
- [x] Run the repository TypeScript workflow.
- [x] Run the complete desktop Rust workflow.
- [x] Inspect the production bundle for the old desktop server entry point.
- [x] Build and install a production-style macOS app in `~/Applications`.
- [x] Confirm no Vite development server is needed by the installed app.

The E2E specs now configure and start the Rust command surface and type-check
cleanly. They were not executed on this Mac because the repository's legacy
WebdriverIO harness invokes `tauri-driver` directly, which Tauri supports on
Windows and Linux rather than macOS. Modernizing the harness to the current
cross-platform WebdriverIO Tauri service is follow-up test infrastructure, not
part of this UX checkpoint.

## Result

Implemented as reviewable commits:

- `9a01ec4` adds Rust-owned persisted state, safe-root assessment, lifecycle
  commands/events, and the native folder dialog;
- `2b22f3d` replaces the desktop server registry with the Rust manager and
  simplifies the UI;
- `c245c3a` deletes the desktop TypeScript server, primitive Tauri network/file
  commands, and their TypeScript adapters;
- `b69bfd1` points the existing E2E specification at the Rust commands; and
- `6c8cd2b` removes the residual desktop/UI `@ok200/engine` package dependency.

The installed app is a production-asset build at
`~/Applications/200 OK.app`. Its webview contains the static Vite build, not a
Vite server or hot-reload client. The app is unsigned for local review and is
not a release candidate.

## Validation evidence

Completed on an Apple Silicon Mac on 2026-07-28:

- `pnpm typecheck` passed;
- `pnpm test` passed 76 engine tests with two existing skips; the CLI E2E
  suite remained skipped by its existing environment gate;
- the changed UI source passed Biome;
- the standalone E2E TypeScript project passed `tsc --noEmit`;
- `cargo fmt --all -- --check`, strict workspace Clippy, and all 36 desktop
  workspace tests passed;
- the 42-module production webview bundle built successfully at 207.04 kB
  JavaScript / 64.92 kB gzip;
- source and bundle inspection found no desktop `createTauriServer`, raw
  TCP/filesystem commands, or `@ok200/engine` dependency; and
- the installed app launched without a Vite process or listener on the Vite
  development port.

The only preflight worktree change, the maintainer's unrelated
`pnpm-lock.yaml` cleanup, remains unstaged.

## Review outcome

The maintainer accepted the macOS control-surface direction on 2026-07-28
after exercising the installed production-asset review build through the
iterative folder-selection, lifecycle, serving, and UX review:

1. choose a folder without typing a path;
2. clearly show its stopped/running state;
3. prevent empty-root and filesystem-root starts;
4. confirm broad or externally exposed roots;
5. start once, serve a real file, stop once, and restart; and
6. retain its configuration after a relaunch.

The Rust tests prove root rejection, state persistence, idempotent lifecycle,
and real-socket serving independently. The remaining Tauri E2E harness work is
not part of the accepted macOS product checkpoint. Windows/Linux validation,
release signing, updater migration, cross-platform installers, and release
publication remained gated by the parent tactical at this checkpoint.
Subsequent Windows and published Linux evidence is recorded in
[`006-windows-desktop-validation.md`](006-windows-desktop-validation.md) and
[`007-linux-desktop-validation.md`](007-linux-desktop-validation.md).
