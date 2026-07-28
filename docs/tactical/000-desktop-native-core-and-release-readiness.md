# 000: Desktop Native Core and Release Readiness

Status: **active parent plan.** Documentation baseline completed 2026-07-28;
implementation has not started.

Topics:

- `desktop-native-core`
- `desktop-release-readiness`
- `legacy-app-migration`

Living state and decisions:

- [`../topics/desktop-runtime.md`](../topics/desktop-runtime.md)
- [`../topics/desktop-release-readiness.md`](../topics/desktop-release-readiness.md)
- [`../topics/legacy-app-migration.md`](../topics/legacy-app-migration.md)

## Objective

Deliver a trustworthy lightweight desktop replacement for the legacy Chrome
App while the final legacy update channel is still available:

- keep Tauri and the React webview for roots, configuration, start/stop,
  status, logs, tray, updater, and native messaging;
- move desktop HTTP execution into a small Rust core shared across Windows,
  macOS, and Linux;
- defer the working Android QuickJS implementation and the Node/TypeScript CLI;
- make CI, signing, notarization, updater metadata, and release publication fail
  closed;
- fix migration-facing launcher, links, and copy; and
- submit a restrained, platform-aware legacy notification update before the
  maintainer's 2026-08-31 deadline.

This is a parent tactical because the deadline and release dependency graph
must remain visible in one place. Each implementation phase should become a
separate numbered tactical before code work begins. This document owns order,
gates, and closeout; child tacticals own detailed execution logs.

## Why this order

Distribution is already a production risk. Desktop `v0.1.3` is public without
Windows installers, advertised package/link shapes do not match the assets, and
no single gate proves that all advertised outputs are usable. Rewriting the
server while that baseline is ambiguous would combine runtime, packaging,
signing, updater, and migration risk.

Therefore:

1. make a current-runtime desktop release mechanically trustworthy;
2. build the Rust core against a black-box compatibility corpus;
3. ship the core through the already-proven update path; and
4. keep the final legacy communication release on its own deadline.

The Rust rewrite must not cause the project to miss the legacy update window.

## Baseline snapshot

Reconciled against `main` at `74d6141` on 2026-07-28.

| Surface | Released state | Important limitation |
|---|---|---|
| Desktop `v0.1.3` | TypeScript engine in Tauri webview with Rust TCP/filesystem adapters | Partial public release; no Windows artifact; Mac installer gaps |
| Android `v0.1.2` | QuickJS TypeScript engine, Kotlin native I/O, Compose UI | Working published implementation; deliberately deferred |
| CLI `v0.1.1` | Node/TypeScript engine | Independent product; deliberately deferred |
| Extension `v0.1.3` | Published MV3 launcher/status surface | Popup has a stale private repository link; must not be described as the server |
| Legacy app `v0.5.3` source | Full packaged app plus unpublished aggressive migration code | Published package/source equivalence is unproven |

## Issue backlog audit

The live GitHub audit on 2026-07-28 found **15 open issues and no open pull
requests**. The open issues are predominantly legacy feature requests, not a
curated current bug list. Do not import them wholesale into this campaign.

Potential parity or contract inputs include:

- [#41](https://github.com/kzahel/web-server-chrome/issues/41) symlink
  behavior, which needs an explicit safety policy rather than accidental
  compatibility;
- [#62](https://github.com/kzahel/web-server-chrome/issues/62) multiple roots;
- [#130](https://github.com/kzahel/web-server-chrome/issues/130) cache-control
  configuration;
- [#186](https://github.com/kzahel/web-server-chrome/issues/186) clean URLs;
- [#220](https://github.com/kzahel/web-server-chrome/issues/220) base URL;
  and
- [#262](https://github.com/kzahel/web-server-chrome/issues/262) disabling
  directory listings.

The remaining open requests — directory ZIP, hot reload, gzip, WebDAV,
`.htaccess`, proxying, PCP, MHTML, and generic backend support — remain feature
backlog until deliberately promoted. The old
[`docs/TODO.md`](../TODO.md) is likewise a TypeScript-engine backlog, not a
release-blocker list.

Each child tactical must label a discovered problem as one of:

- release blocker;
- security/correctness blocker;
- legacy parity requirement;
- regression from the currently released surface; or
- deferred feature.

Only the first four enter the current execution queue. When the compatibility
corpus is stable, reconcile or close stale GitHub issues so the issue tracker
becomes a useful current bug surface again.

## Critical-path defects

| Priority | Defect | Exit evidence |
|---|---|---|
| P0 | Tagged desktop builds can leave a partial non-draft GitHub release | Failed matrix simulation leaves no public production-looking release |
| P0 | Latest public desktop release has no Windows installer | Released EXE/MSI both report a valid expected Authenticode signature |
| P0 | No completeness gate validates assets and `latest.json` | Finalizer checks version, targets, URLs, signatures, and exact assets |
| P0 | Legacy migration deadline is 2026-08-31 | Controlled install receives reviewed package before deadline |
| P1 | macOS PKG workflow searches the wrong target directory | Signed/notarized/stapled PKG is uploaded and accepted |
| P1 | Public DMG container does not pass strict notarization/stapling checks | DMG passes or PKG becomes the clearly recommended artifact |
| P1 | Release-body filenames do not match uploaded Tauri asset names | Every generated link is derived from or checked against release assets |
| P1 | Extension links to a stale private GitHub repository | Link is removed or points to the public canonical destination |
| P1 | Migration/homepage copy treats the extension as feature-complete server | Copy consistently explains extension + desktop/Android roles |
| P2 | Desktop current-vs-target architecture is contradictory in docs | Topic, README, vision, agent guidance, and old plans agree |

## Workstream A: release and migration deadline

This lane is the calendar-critical path. It can run ahead of the Rust core and
must not wait for it.

### Phase A0 — documentation baseline

Status: complete in this documentation pass.

- [x] Adopt living topic and numbered tactical conventions.
- [x] Record current released runtimes separately from accepted direction.
- [x] Record the signing runbook and latest release evidence.
- [x] Audit open issues and separate legacy feature requests from current
  blockers.
- [x] Mark the Transistor desktop architecture as superseded and separate the
  current unshipped aggressive migration candidate from the undecided final
  notification policy.
- [x] Define release, notification, and cutover acceptance gates.

### Phase A1 — make desktop release publication fail closed

Create a child tactical before implementation.

- [ ] Fix the macOS bundle path used by PKG creation.
- [ ] Make asset filenames/table links exact and machine-checked.
- [ ] Stage matrix outputs in Actions artifacts or a draft release.
- [ ] Port/implement `latest.json` validation for version, target coverage,
  URLs, and signatures.
- [ ] Validate required installer/updater artifact completeness.
- [ ] Make finalization run with `if: always()` and explicitly fail/retain a
  draft when any required leg fails.
- [ ] Publish only after the single completeness gate succeeds.
- [ ] Correct the desktop signing runbook's 200 OK tag note.

Validation:

```bash
gh workflow run tauri-app-ci.yml
gh run watch
gh release view <test-tag> --json isDraft,assets
```

The child tactical must record the actual test tag/run and remove or clearly
mark any non-production test release after inspection.

### Phase A2 — prove a signed current-runtime release

- [ ] Tag a small release candidate without the Rust-core change.
- [ ] Verify macOS app and preferred installer with `codesign`, `spctl`, and
  `stapler`.
- [ ] Verify Windows EXE/MSI with `Get-AuthenticodeSignature` and a clean VM
  install/serve/uninstall smoke.
- [ ] Verify Linux install/launch/serve for the published package set.
- [ ] Verify updater metadata and update from `v0.1.3`.
- [ ] Record artifact names, hashes, CI run, and inspection results in the
  release-readiness topic.

Exit: the repository has one complete, publicly inspectable desktop release
that passes the topic's release gate.

### Phase A3 — repair the migration destinations

- [ ] Remove or correct the extension's stale private GitHub link.
- [ ] Make the extension/desktop/Android ownership clear in popup and website
  copy.
- [ ] Make `ok200.app/migrate` platform-aware.
- [ ] Verify ChromeOS Android intent and Play fallback.
- [ ] Verify desktop native messaging launch on all three desktop OSs.
- [ ] Verify every advertised installer URL.

### Phase A4 — publish the final legacy migration update

Target: submit the first candidate early enough to retain review/retry time
before 2026-08-31.

- [ ] Export the currently served CWS package and diff it against `legacy/`.
- [ ] Prove controlled delivery of a test update while updates still work.
- [ ] Review the aggressive candidate against the lower-noise recommendation,
  then record and implement the chosen notification cadence.
- [ ] Stop reminders after replacement detection; preserve remind-later.
- [ ] Package and inspect the exact ZIP.
- [ ] Submit `0.5.4` with time reserved for a corrective `0.5.5`.
- [ ] Verify delivery on an existing controlled install.
- [ ] Update the legacy migration topic with the actual accepted version,
  submission date, delivery evidence, and remaining reach.

## Workstream B: desktop Rust core

This lane begins once Phase A1 has made failures safe. It does not have to
finish before the legacy notification package is submitted.

### Phase B0 — compatibility corpus and measurements

Create a child tactical before implementation.

- [ ] Inventory every desktop-exposed server option and persisted setting.
- [ ] Convert current TypeScript desktop/CLI HTTP behavior into black-box
  request/response fixtures where possible.
- [ ] Include security cases: traversal, percent encoding, symlinks/canonical
  containment, bounded headers, timeout, interrupted transfer, and invalid
  ranges.
- [ ] Capture current desktop resident memory, idle CPU, startup time, and
  first-request latency on one fixed Mac baseline; add Windows/Linux evidence
  where practical.
- [ ] Record which behavior is compatibility-required and which is accidental.

### Phase B1 — standalone `ok200-core`

- [ ] Add a UI/Tauri-independent Rust crate to the desktop workspace.
- [ ] Implement configuration validation and lifecycle state.
- [ ] Implement the minimum static HTTP server contract from the runtime topic.
- [ ] Use native async filesystem/networking without webview IPC for request
  data.
- [ ] Add unit and integration tests using temporary roots and real sockets.
- [ ] Keep request logging structured and bounded.

Exit: the core passes its test corpus without Tauri.

### Phase B2 — Tauri state and UI command integration

- [ ] Own server instances in Rust application state.
- [ ] Expose narrow commands for list/configure/start/stop/status.
- [ ] Emit request/status/error events to the webview.
- [ ] Keep file selection in Tauri, pass authorized paths to the core.
- [ ] Preserve background/tray/window lifecycle.
- [ ] Preserve native messaging host behavior and application identity.
- [ ] Add/repair Tauri E2E that starts through the UI and fetches externally.

No HTTP request body or served file byte stream should cross Tauri IPC.

### Phase B3 — desktop TypeScript retirement

- [ ] Switch the desktop UI to Rust commands/events.
- [ ] Remove `@ok200/engine` from the desktop app runtime dependency graph.
- [ ] Delete desktop-only Tauri TCP/filesystem TypeScript adapters and Rust
  primitive IPC commands after no retained consumer uses them.
- [ ] Keep `packages/engine` for Android and CLI.
- [ ] Update diagrams, comments, changelog, and developer commands.
- [ ] Rerun compatibility corpus and memory/startup measurements.

Exit: inspecting the desktop bundle and source shows no TypeScript HTTP server
runtime path.

### Phase B4 — signed Rust-core release candidate

- [ ] Build through the hardened pipeline.
- [ ] Run the complete platform release gate.
- [ ] Exercise update from the previous public desktop build.
- [ ] Compare compatibility and resource measurements.
- [ ] Test extension launch and background lifecycle after update.
- [ ] Promote only after all results are recorded in the topics.

## Scheduling gates

Use these go/no-go checks rather than letting workstreams block each other:

- **A1 must precede B4**, because the Rust release needs fail-closed
  publication.
- **A2 should precede B2/B3 release work**, because it isolates signing and
  updater problems from runtime changes.
- **A4 does not require B4.** If Rust slips, point users to a repaired signed
  current-runtime desktop build and update it later.
- **No new feature work enters B1-B3** unless required for legacy feature
  parity or a release blocker.
- **Android remains unchanged** unless a production bug independently demands
  work.

## Every-child validation

Each child tactical must:

1. record clean-tree preflight and the exact baseline revision;
2. state its observable exit contract before editing;
3. run the smallest relevant unit/integration checks;
4. update the owning topic with changed status/evidence;
5. record commands, run URLs, artifact identities, and unresolved failures;
6. keep unrelated user changes untouched; and
7. leave the parent checklist accurate.

## Parent completion criteria

This parent closes only when:

- a complete signed desktop release has passed the artifact gate;
- desktop HTTP execution is Rust-native on Windows, macOS, and Linux;
- the webview is only a management/control surface;
- the extension launches the correct native app per platform;
- Android remains working or any independent regression is resolved;
- the final legacy migration update was submitted and delivery evidence was
  recorded before the channel closed;
- README, vision, topic, tactical, release, and migration documentation agree;
  and
- remaining feature work is moved into focused topics/tacticals rather than
  left as ambiguous architecture prose.

## Decision log

- **2026-07-28:** Accepted Rust-native desktop HTTP core; retained Tauri
  webview for control/configuration; deferred Android and CLI rewrites.
- **2026-07-28:** Release/signing hardening precedes the Rust-core release.
- **2026-07-28:** Legacy notification remains an independent deadline and may
  advertise a repaired current-runtime desktop build if Rust is not ready.
- **2026-07-28:** The aggressive migration implementation is an unshipped
  candidate. Install-time plus weekly reminders are the conservative
  recommendation; final cadence remains undecided.
