# 004: Portrait Desktop Polish and Directory Listing

Status: **implementation complete; human product smoke pending.**

Topic: `desktop-native-core`

Parent:
[`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

Baseline: clean `main` at `2d24e15` on 2026-07-28.

## Objective

Refine the Rust-native desktop review build into the compact, portrait-shaped
control appliance established by the legacy Chrome App, and restore a useful
browser-like directory listing from the Rust core.

This is a product-polish and legacy-parity slice. It does not add server
features, change Android or the CLI, or create a signed release.

## Problem classification

- The abrupt green Start button to red Stop button transition is a desktop UX
  regression; red incorrectly suggests failure.
- Disabled switches not showing the disabled cursor over the control itself is
  an interaction defect.
- A URL that does not open in the default browser is a desktop integration
  defect.
- The generic green/blue visual treatment conflicts with the established
  website and application identity.
- The sparse Rust directory listing lacks basic legacy parity: file-type
  affordances, modified dates, and browser color-scheme support.
- The wide `800x600` control window lost the legacy app's focused `410x700`
  portrait form.

## Desktop interaction and visual contract

- Default the main window to `410x700` logical pixels, matching the legacy
  Chrome App, with sensible minimum bounds and normal user resizing.
- Migrate window-state storage so an old `800x600` saved size does not override
  the new default while subsequent user resizing still persists.
- Fit folder, port, lifecycle, URL, and serving options into a compact
  portrait flow without website-scale whitespace.
- Replace the destructive-looking Start/Stop button with one accessible server
  switch and adjacent explicit lifecycle status.
- Use gray for off, established brand yellow for on, amber for transitions,
  green only for confirmed running status, and red only for errors.
- Make every disabled setting surface show a not-allowed cursor and a local
  “Stop the server to change this setting” tooltip.
- Open the running URL in the system default browser when the URL row is
  activated; retain a distinct Copy action.
- Use the canonical yellow handwritten `200 OK!` logo, website wordmark, and
  near-black/white/yellow palette. Regenerate desktop application icons from
  the canonical source rather than keeping divergent icon assets.
- Continue following the operating-system light/dark preference automatically.

## Directory-listing contract

- Generate a self-contained HTML document with no JavaScript or external
  resources.
- Show parent-folder, folder, and file icons using inline scalable assets.
- Show name, human-readable size, and modified time.
- Sort directories first and then case-insensitively by name.
- Use a compact responsive table that remains usable on narrow browsers.
- Follow `prefers-color-scheme` automatically and use restrained product
  branding.
- Preserve existing escaping, URL encoding, entry bounds, containment, `HEAD`,
  and directory-listing-disabled behavior.

## Implementation checklist

### Portrait control surface

- [x] Set and migrate the portrait window defaults.
- [x] Replace lifecycle button semantics with a status switch.
- [x] Add local disabled-control tooltips and correct cursor behavior.
- [x] Open URLs through Tauri's native opener and retain Copy.
- [x] Tighten spacing, typography, radii, and responsive behavior.
- [x] Replace generic desktop branding and regenerate application icons.

### Rust directory listing

- [x] Add modified metadata and human-readable sizes.
- [x] Add parent, folder, and file icons.
- [x] Add responsive automatic light/dark presentation.
- [x] Add focused output tests for escaping, encoding, ordering, metadata, and
  theme markup.

### Validation

- [x] Run the repository TypeScript workflow.
- [x] Run the complete desktop Rust workflow.
- [x] Build the production webview assets and Tauri application.
- [x] Inspect the production app for canonical branding and portrait bounds.
- [x] Start the installed app; separately serve a real directory listing from
  the same core and inspect both light and dark renderings.
- [x] Confirm the installed app has no Vite development listener.

## Result

Implemented as reviewable commits:

- `d64d9df` restores the `410x700` portrait window, canonical branding and
  icons, compact layout, lifecycle switch, locked-setting affordances, and
  native URL opening; and
- `7d9e03d` restores the browser-like Rust directory listing with inline icons,
  human-readable metadata, responsive layout, deterministic ordering, and
  automatic light/dark presentation.

The installed production-asset app is at `~/Applications/200 OK.app`. It uses
the static Vite build and is unsigned for local review; it is not a release
candidate.

## Validation evidence

Completed on an Apple Silicon Mac on 2026-07-28:

- `pnpm typecheck` passed;
- `pnpm test` passed 76 engine tests with two existing skips; the CLI E2E
  suite remained skipped by its existing environment gate;
- the UI source passed Biome and the standalone desktop E2E TypeScript project
  passed `tsc --noEmit`;
- `cargo fmt --all -- --check`, strict workspace Clippy, and all 37 desktop
  workspace tests passed;
- the 44-module production webview bundle built successfully at 210.29 kB
  JavaScript / 65.77 kB gzip and 20.71 kB CSS / 4.39 kB gzip;
- the installed app was visually inspected with the complete workflow visible
  at the portrait default and with the canonical application icon, logo, and
  wordmark;
- a real directory was served by `ok200-core`, and its generated listing was
  inspected in forced light and dark browser modes; and
- the installed app launched without a Vite process or listener on the Vite
  development port.

## Review checkpoint

Stop for human review when the installed macOS app:

1. opens at the portrait default with a complete compact primary workflow;
2. uses the canonical logo, wordmark, and yellow accent;
3. starts and stops through a calm switch with explicit status;
4. explains locked controls at the point of interaction;
5. opens the server URL in the default browser and still copies it; and
6. serves a compact icon-and-metadata directory listing that follows browser
   light/dark mode.

Signing, updater migration, cross-platform installer proof, and release
publication remain owned by the parent tactical.

The implementation has reached this checkpoint. Human review still needs to
exercise the native folder picker, lifecycle switch, locked-setting tooltip
and cursor, default-browser URL action, Copy action, and actual start/serve/
stop flow in the installed app.
