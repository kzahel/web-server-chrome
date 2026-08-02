# Legacy Chrome App Migration

> Use the final update window to route users to a replacement that actually
> works on their platform. The migration update must be useful and restrained;
> it is not a vehicle for repeated ten-minute nags or claims that the extension
> itself contains the web server.

Topic: legacy-app-migration

Status: **urgent execution.** The maintainer's operational deadline is
**2026-08-31**, after which the legacy packaged app must be treated as unable
to receive another useful update.

Last reconciled: **2026-08-02**.

Implementation sequencing lives in
[Tactical 000](../tactical/000-desktop-native-core-and-release-readiness.md).
The final destination confidence gates and agent-versus-maintainer ownership
split live in
[Tactical 009](../tactical/009-release-confidence-closeout.md).
Extension-launcher cleanup and the ChromeOS Android address/discovery gate live
in [Tactical 011](../tactical/011-extension-launcher-and-chromeos-network-readiness.md).
The durable ChromeOS Android/Play uncertainty and fallback contract lives in
[`chromeos-extension-launcher.md`](chromeos-extension-launcher.md).
Current-product and legacy-name usage is governed by
[`product-branding.md`](product-branding.md).
Google's current Chrome App support policy is documented in
[Chrome Apps support on ChromeOS](https://support.google.com/chrome/a/answer/15950395).

## Scope

This topic owns:

- the last legacy Chrome Web Store update and notification policy;
- platform-aware migration destinations;
- coordination among the legacy app, new extension, Android app, desktop app,
  and `ok200.app`;
- claims that must be true before sending users to each destination; and
- evidence that the submitted package matches reviewed source.

It does not own the desktop server architecture or signing implementation;
those are linked below.

## Component identities

| Component | Identity |
|---|---|
| Legacy Chrome packaged app | `ofhbbkphhbklhfoeikjpcbhemlocgigb` |
| New Chrome extension | `lpkjdhnmgkhaabhimpdinmdgejoaejic` |
| Android / ChromeOS app | `app.ok200.android` |
| Desktop app | `app.ok200.desktop` |

## Current evidence

- The `legacy/` directory on `main` reports version `0.5.3` and contains the
  February/March 2026 maximum-aggressiveness migration experiment.
- That code enables notification/window behavior on script load, startup,
  installation, launch, and a repeating ten-minute alarm.
- Repository history alone does not prove that this exact package was accepted
  by or delivered through the Chrome Web Store.
- The store package inspected during the 2026-07-28 audit also reported
  `0.5.3`, but had only the older basic notification destination. Therefore the
  source tree and published package must be diffed before assigning the next
  version or describing current reach.
- The new extension and Android app have published predecessors. The extension
  is a launcher, not a replacement HTTP engine. Exact GitHub release artifacts
  `extension-v0.1.4` and `android-v0.2.1` now pass their engineering gates and
  were reportedly submitted by the maintainer; store delivery remains
  unproved.
- Desktop `v0.1.5` is the complete signed Rust-core release. Its five build
  legs and finalizer passed; every public asset matched `SHA256SUMS`; and exact
  signed update, server, native-host, and production-extension paths passed on
  the recommended macOS app, Windows NSIS, and Linux AppImage installations.
  The download page resolves to this release. See
  [`desktop-release-readiness.md`](desktop-release-readiness.md) and
  [Tactical 009](../tactical/009-release-confidence-closeout.md).
- Desktop is therefore an accepted migration destination on macOS, Windows,
  and Linux. Physical ChromeOS source candidates pass, and the owned
  `https://ok200.app/chromeos` fallback is live. Store-delivered
  extension/Android behavior remains a separate promotion gate; MSI,
  RPM-native, physical ARM64, and
  subjective tray/install UI checks limit secondary claims rather than the
  recommended desktop paths.

The old detailed plan in `docs/legacy-migration.md` described the unpublished
maximum-nag candidate currently present in `legacy/`. Its cadence remains an
open product decision rather than a superseded plan.

## Accepted destination model

The landing page and notification must describe the platform split honestly:

| User environment | Primary destination | Fallback |
|---|---|---|
| ChromeOS with Play support | 200 OK Web Server Android app on Google Play | Explain that the extension launches Android; do not promise native messaging |
| Windows, macOS, Linux | 200 OK Web Server extension plus installed desktop app | Direct signed desktop download with platform-specific instructions; AppImage is the recommended no-admin Linux path |
| Unsupported/no replacement detected | Platform-aware migration page | Signup/status information without claiming feature parity |

The extension provides familiar Chrome presence, status, and launch behavior.
The desktop or Android application owns the actual server. Copy such as “the
new extension has all the same features” is false until the complete product
pair is installed and working.

## Recommended lower-noise alternative

The conservative recommendation for the final migration release is:

- one immediate notification after the migration update is installed;
- a reminder no more than once per seven days while no replacement is
  detected;
- no notification or migration window on arbitrary background script load;
- no ten-minute repeating alarm;
- no forced tab or app window on every startup;
- stop reminders when the new extension is detected;
- preserve an explicit “remind me later” choice; and
- record only the local state needed for throttling/detection.

This is a recommendation, not an accepted decision. The aggressive candidate
uses script-load, startup, install, launch, and ten-minute alarm triggers. The
final package may retain some or all of that behavior if the maintainer decides
the last update window justifies it, but the exact cadence and dismissal
contract must be reviewed explicitly before packaging.

## Release strategy

1. Download/export the current Chrome Web Store package and compare it with
   `legacy/` to establish the real baseline.
2. Verify that an update can still be submitted and delivered to a controlled
   existing installation.
3. Fix the migration page and product copy before pointing users at it.
4. Make Android and desktop destinations pass their relevant install/launch
   smoke tests. Desktop readiness is governed by
   [`desktop-release-readiness.md`](desktop-release-readiness.md).
5. Decide and record the final notification cadence and dismissal semantics.
6. Prepare a minimal `0.5.4` migration package early. Keep enough calendar
   margin for Web Store review and a corrective `0.5.5`.
7. Inspect the exact ZIP: version, manifest permissions, destinations,
   notification cadence, no development URLs, and no unintended files.
8. Submit, then verify delivery on a previously installed controlled profile.
9. Monitor install/launch/update telemetry that already exists, without
   introducing invasive tracking in the final legacy update.

Do not make the Rust-core desktop rewrite a hard prerequisite for submitting
the migration package. If the native core misses the release cutoff, a repaired
and honestly described signed desktop build is preferable to losing the final
communication channel. The updater can deliver the Rust core later.

## Pre-send acceptance

- `ok200.app/migrate` gives correct platform-specific instructions.
- ChromeOS extension behavior offers `ok200://launch` for an already-installed
  app; because an ordinary extension cannot detect Play or Android installation
  state, a separate prominent HTTPS action reaches an owned options page with
  the exact Play listing and honest non-Android alternatives.
- The Android app does not present an ARC-private address as a LAN URL; its
  advertised or documented ChromeOS address fetches a known file from a second
  device.
- Desktop extension native messaging launches each supported installed app.
- Every advertised desktop download link resolves to a release that passes the
  release gate.
- The extension popup contains no stale/private repository link.
- Copy distinguishes the extension launcher from the server application.
- The legacy package's throttle and replacement-detection behavior are tested
  on a controlled installed profile.
- A second package version is reserved in case the first submission exposes a
  blocking defect.

## Open questions

- What exact package/version is currently served by the Chrome Web Store to an
  existing install?
- Should the final package use the aggressive candidate, the lower-noise
  recommendation, or a bounded hybrid?
- How long is Chrome Web Store review taking for legacy Chrome App updates in
  August 2026?
- Does the final blast advertise ChromeOS immediately after `extension-v0.1.4`
  and `android-v0.2.1` pass store delivery, or initially emphasize the already
  accepted desktop destination?
- What is the minimum useful telemetry needed to decide whether a corrective
  `0.5.5` is warranted?
