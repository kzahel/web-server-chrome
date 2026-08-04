# 015: Desktop Production Validation and Repair

Status: **active; `desktop-v0.1.6` is signed and public but production
functional acceptance is failed.** The next repair release must fix the
settings and process-lifecycle defects, then pass the repository-owned
[production validation runbook](../runbooks/desktop-production-validation.md)
using exact public artifacts and the real Chrome Web Store extension on macOS,
Windows, and Linux.

Topics:

- `desktop-native-core`
- `desktop-release-readiness`

Parent and living state:

- [`009-release-confidence-closeout.md`](009-release-confidence-closeout.md)
- [`../topics/desktop-runtime.md`](../topics/desktop-runtime.md)
- [`../topics/desktop-release-readiness.md`](../topics/desktop-release-readiness.md)

Planning baseline: exact public `desktop-v0.1.6` smoke on 2026-08-04.

## Objective

Turn the first three-OS post-publication smoke into a closed repair campaign
and a repeatable acceptance process:

1. fix every release-blocking product defect exposed by `v0.1.6`;
2. add regression coverage at the lowest useful layer;
3. provision each production test environment for the actual store extension;
4. publish a repair only with explicit authorization; and
5. accept or reject that exact public release through the full production
   runbook rather than inferring acceptance from CI, signatures, or direct host
   tests.

## Scope controls

- There is no staging environment equivalent to the complete production
  delivery path. Public artifacts may be published as a fail-closed candidate,
  but they are not promotion-ready until post-publication acceptance passes.
- External publication, store submission, rollout, or production configuration
  changes always require explicit maintainer authorization.
- This tactical owns desktop repair plus desktop/production-extension proof.
  Android and physical ChromeOS store delivery remain in Tactical 011 and
  Tactical 014.
- Public repository documents contain only machine-neutral assertions and
  sanitized evidence. Private controller inventory stays in dotfiles. Testbed
  lifecycle/transport defects stay in the affected standalone testbed repo.
- A direct native-host handshake, unpacked extension, or prior-release test
  does not close the production-extension row.
- Tray and menu-bar controls are optional shortcuts. Every option and recovery
  action must work in the main UI on all three desktop platforms.

## `v0.1.6` defect and evidence ledger

| Priority | Surface | Exact observation | Required closeout |
|---|---|---|---|
| P0 | Windows lifecycle/recovery | With Run in Background disabled and the tray hidden, closing leaves an invisible process. Launch and `--quit-for-uninstall` can accumulate stuck invisible processes rather than restore or exit. | One-process/window regression across close, relaunch, extension launch, quit, and uninstall; exact public NSIS pass. |
| P0 | Main-window settings | Windows WebView2 and Linux WebKitGTK confine the fixed settings modal to the blurred header containing block; Linux accessibility bounds can misleadingly describe an ideal dialog while pixels remain clipped. | Render outside the transformed/filtered ancestor and prove visually plus accessibility/interaction on all three engines. |
| P1 | Cross-platform close contract | Run in Background disabled leaves the application resident after last-window close on macOS, Windows, and Linux. | Exit process, tray, server, and port on last-window close; preserve the one-instance restore behavior only when background is enabled. |
| P2 | Linux packaging/runtime | Ubuntu ARM64 AppImage logs a host GVFS/GLib symbol mismatch involving `libgvfsdbus.so` and `g_task_set_static_name`; chooser and serving still worked. | Identify whether host-library loading, packaging, or environment causes it; remove the warning or document a verified harmless boundary with broader evidence. |
| Gate | Production extension | None of the three `v0.1.6` VM profiles had the production Chrome Web Store extension installed. Direct host framing/launch passed on macOS/Linux; Windows registration/host check passed. | Install the store package, record exact ID/version, and pass browser-driven launch/focus/recovery on all three OSes. |
| Claim gap | Windows architecture | The public x64 NSIS ran under Windows 11 ARM64 x64 emulation. | Keep the evidence labeled emulated; add native x64 hardware/VM evidence before claiming it. |
| Claim gap | macOS installer | The PKG passed cryptographic inspection but was not installed into `/Applications` because the attended administrator step was not authorized. | Perform an attended recommended PKG installation in the acceptance campaign. |
| Claim gap | Linux ARM64 | The public ARM64 AppImage passed a native Ubuntu ARM64 VM, not physical ARM64 hardware. | Keep the VM claim precise; physical hardware is required only for a physical-hardware claim. |

The `v0.1.5` clean/update and real production-extension tests remain useful
historical evidence. They cannot substitute for the exact repaired version.

## Lane A — source repair and regression proof

- [ ] Portal `AppSettings` to `document.body` or otherwise render it outside
      the header/backdrop-filter containing block.
- [ ] Add component/browser coverage that would fail when the modal's visible
      bounds are confined to the header; do not rely only on accessibility
      bounds.
- [ ] Make last-window close call the explicit exit path when Run in Background
      is false, including server shutdown, port release, tray teardown, and
      persisted state flush.
- [ ] Preserve background=true behavior: one process remains and every
      activation route recreates/focuses the main window.
- [ ] Harden single-instance activation when the original main window was
      destroyed. Repeated app and native-host launches must never accumulate
      invisible processes.
- [ ] Make `--quit-for-uninstall` terminate reliably regardless of window/tray
      state and add a Windows regression.
- [ ] Investigate the AppImage GVFS/GLib warning with host-library and clean-OS
      comparisons; record the decision in the runtime/release topic.
- [ ] Run TypeScript and Rust formatting, type, lint, unit, integration, and
      platform UI checks required by `CLAUDE.md`.

Exit: source behavior and automated regression coverage are green, and the
living desktop-runtime topic describes the repaired contract.

## Lane B — production-test readiness

- [ ] Each macOS, Windows, and Linux environment has a supported production
      browser before desktop native-host registration is tested.
- [ ] The actual Chrome Web Store extension is installed in the intended test
      profile on all three; record exact store version and production ID.
- [ ] Prove that the Linux architecture/browser combination can install and
      run the store package. If it cannot, add a supported environment rather
      than treating Chromium packaging limitations as a product pass.
- [ ] Run each authoritative testbed doctor before and after the campaign.
- [ ] Keep controller-specific commands/state in the dotfiles wrapper and new
      controller problems in each testbed's `docs/problems.md`.
- [ ] Prepare clean-install and previous-public snapshots or an equally
      repeatable state-reset procedure without deleting unrelated user data.

Exit: all three environments can exercise the public artifact and actual store
extension, and any remaining environment limitation is explicit before
publication.

## Lane C — release and production rollout

- [ ] Choose the repair version and update changelogs/version fields from an
      accepted clean revision.
- [ ] Run `./scripts/release-desktop.sh <version> --check` and all source gates.
- [ ] With explicit authorization, publish the desktop tag and wait for the
      complete signed matrix/finalizer.
- [ ] Independently download every public artifact, verify `SHA256SUMS`,
      `latest.json`, signatures, asset URLs, and platform signing.
- [ ] Verify the production download page and update-service previous/current/
      future routes point only to the immutable intended release.
- [ ] If an extension release is part of the campaign, separately prove the
      submitted version is the version actually served by the Chrome Web Store
      before starting the extension rows.

Exit: production delivery is internally consistent. This is the start of the
functional acceptance gate, not its completion.

## Lane D — exact post-production acceptance

Run every required section of
[`desktop-production-validation.md`](../runbooks/desktop-production-validation.md).

| Gate | macOS | Windows | Linux |
|---|---|---|---|
| Exact public artifact/signing | [ ] | [ ] | [ ] |
| Recommended clean install | [ ] | [ ] | [ ] |
| Main-window settings and no-tray recovery | [ ] | [ ] | [ ] |
| Server behavior and persistence | [ ] | [ ] | [ ] |
| Background true/false, relaunch, and Quit | [ ] | [ ] | [ ] |
| Previous-public production update | [ ] | [ ] | [ ] |
| Production extension launch/focus/recovery | [ ] | [ ] | [ ] |
| Login integration and uninstall/cleanup | [ ] | [ ] | [ ] |
| Testbed lifecycle restored | [ ] | [ ] | [ ] |

For every box, record the artifact hash, OS/architecture, browser and store
extension version, sanitized evidence location, and result. Do not check a box
from `v0.1.5` evidence, a local build, a direct native-host test, or a manual
workaround.

## Exit criteria

This tactical is complete only when:

1. all P0/P1 product defects above are repaired and regression-tested;
2. the Linux warning has a documented resolution or evidence-based
   disposition;
3. the next exact public signed release passes clean-install and prior-public
   update flows on macOS, Windows, and Linux;
4. the production Chrome Web Store extension passes real browser-to-host
   launch/focus/recovery on all three;
5. all public website/updater routes and downloadable hashes agree;
6. uninstall/cleanup and original testbed lifecycle restoration pass; and
7. desktop runtime and release-readiness topics contain the final sanitized
   evidence, precise architecture claims, and overall production-accepted
   verdict.

Any product failure rejects the release for promotion and starts a bounded
repair iteration. Environment and testbed failures remain distinct and must be
closed by a rerun; they never silently convert an unexecuted product row into a
pass.
