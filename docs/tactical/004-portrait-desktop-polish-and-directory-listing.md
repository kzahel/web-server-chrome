# 004: Portrait Desktop Polish and Directory Listing

Status: **active; implementation in progress.**

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

- [ ] Set and migrate the portrait window defaults.
- [ ] Replace lifecycle button semantics with a status switch.
- [ ] Add local disabled-control tooltips and correct cursor behavior.
- [ ] Open URLs through Tauri's native opener and retain Copy.
- [ ] Tighten spacing, typography, radii, and responsive behavior.
- [ ] Replace generic desktop branding and regenerate application icons.

### Rust directory listing

- [ ] Add modified metadata and human-readable sizes.
- [ ] Add parent, folder, and file icons.
- [ ] Add responsive automatic light/dark presentation.
- [ ] Add focused output tests for escaping, encoding, ordering, metadata, and
  theme markup.

### Validation

- [ ] Run the repository TypeScript workflow.
- [ ] Run the complete desktop Rust workflow.
- [ ] Build the production webview assets and Tauri application.
- [ ] Inspect the production app for canonical branding and portrait bounds.
- [ ] Start the installed app, serve a real directory listing, and inspect both
  light and dark renderings.
- [ ] Confirm the installed app has no Vite development listener.

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
