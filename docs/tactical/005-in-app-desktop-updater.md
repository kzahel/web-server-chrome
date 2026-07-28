# 005: In-App Desktop Updater

Status: **implementation complete; signed `v0.1.4` metadata is public, while
the installed `0.1.3` → `0.1.4` transition and remaining cross-platform update
proof are pending.**

Topic: `desktop-release-readiness`

Parent:
[`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

Baseline: clean `main` at `060af79` on 2026-07-28.

## Objective

Turn the inert desktop “Check for Updates” menu item into one calm in-app
update experience, and surface available updates without requiring the user to
remember to check manually.

This slice owns update discovery, visible update state, signed
download/install progress, and relaunch from the desktop control surface. It
does not publish a new release or relax the signed release gate.

## User-visible contract

- “Check for Updates” focuses and reveals the existing app window.
- Manual checks send `X-Check-Reason: manual` and always show an in-app result:
  checking, up to date, update available, or error.
- App launch checks send `X-Check-Reason: app-launch` at most once per 24 hours
  after the last successful check.
- Automatic checks stay quiet when the app is current or the network is
  unavailable; an available update remains visible in the app.
- Available updates show one “Update and restart” action.
- Download progress, signature/install failure, installation, and relaunch
  remain in the same app-native notification surface. No native dialog is
  introduced.
- A successful check, not a failed attempt, advances the persisted 24-hour
  schedule.

## Implementation

- The existing Tauri updater plugin remains the signed updater authority.
- The desktop React shell listens for the Rust menu event and supplies the
  per-request reason header through the plugin's check options.
- The updater keeps the returned Tauri update resource until dismissal or
  installation, then uses `downloadAndInstall` and the Tauri process relaunch
  command.
- The shared UI accepts an optional notification slot without importing Tauri
  APIs or changing the browser-hosted UI.
- A small independently tested scheduling module owns the persisted timestamp
  and 24-hour boundary.

## Validation evidence

Completed on an Apple Silicon Mac on 2026-07-28:

- all six update-schedule tests passed;
- desktop TypeScript type checking and the production Vite build passed;
- the 51-module production webview bundle built at 220.60 kB JavaScript /
  68.73 kB gzip and 23.34 kB CSS / 4.83 kB gzip;
- a normal production-asset Tauri app bundle built without a development
  server;
- first launch reached the Remy update service as `app-launch`, and a second
  launch inside 24 hours produced no request;
- the macOS menu focused the app, reached Remy as `manual`, received the
  expected `204` for current version `0.1.3`, and showed “You’re up to date”
  in the control surface;
- a controlled build with current version overridden to `0.1.2` received the
  signed public `0.1.3` update, showed “Update and restart,” installed the
  signed artifact, exited, and relaunched as `0.1.3`; and
- the current Rust-core portrait review build was rebuilt and restored to
  `~/Applications/200 OK.app` after that updater proof.

The controlled update deliberately relaunched the public `0.1.3` payload,
which is the old wide TypeScript-server application. That is expected and
visibly reinforces that the next public desktop release must carry the new
Rust-core control surface.

## Remaining release proof

This tactical proves the application control flow and the existing signed
macOS update path. It does not satisfy the release gate for the next version.
The signed candidate still needs:

1. update discovery from the actual public `0.1.3` build;
2. signed installation of the Rust-core candidate;
3. preserved settings, native messaging, and server behavior after update;
4. Windows and Linux update/install coverage; and
5. inspection of the candidate's complete updater metadata and artifacts.

## Review checkpoint

The installed review app is ready for human review of the manual current-version
notice. The available-update and restart path has already been exercised
against the signed public artifact; it does not need to be repeated unless the
interaction design changes.
