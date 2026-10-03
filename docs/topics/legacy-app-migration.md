# Legacy Chrome App Migration

> Use the final update window to route users to a replacement that actually
> works on their platform. The migration update must be useful and restrained;
> it is not a vehicle for repeated ten-minute nags or claims that the extension
> itself contains the web server.

Topic: legacy-app-migration

Status: **urgent execution.** The maintainer's operational deadline is
**2026-08-31**, after which the legacy packaged app must be treated as unable
to receive another useful update.

Last reconciled: **2026-08-07**.

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

- The `legacy/` directory now contains the reviewed `0.5.4` candidate. It
  replaces the February/March 2026 maximum-aggressiveness experiment with one
  immediate post-update notification and a seven-day reminder ceiling.
- The candidate does not notify on event-page load, does not open a migration
  window at browser startup, and replaces any prior migration alarm during the
  update so the ten-minute experiment cannot survive the rollout.
- A controlled unpacked `0.5.3 -> 0.5.4` transition passed on a physical
  Chromebook with ChromeOS/Chrome 150. `onInstalled` displayed the final
  notification without opening an app window and replaced the ten-minute
  alarm with a `10,080`-minute alarm.
- On that device, notification-body activation opened the exact live
  `?ref=legacy-app&platform=chromeos` route, `Remove old app` displayed
  Chrome's native confirmation dialog, and `Stop reminders` cleared the alarm
  and notification and persisted across a full Developer Mode reload.
- With reminders enabled, the candidate's startup handler created no prompt.
  A forced-due weekly callback created one notification and an immediate
  second callback was throttled. Developer Mode reload fires `onInstalled`, so
  it must not be treated as a startup simulation.
- Repository history alone does not prove that this exact package was accepted
  by or delivered through the Chrome Web Store.
- The exact Store package fetched from Google's update service on 2026-08-07
  reports `0.5.3` and has only the older basic notification destination. It has
  been retained and hashed outside this public repository for the controlled
  package diff and delivery test.
- Windows 11 with Chrome 150 can still execute an exact `0.5.3` package loaded
  in a disposable Developer Mode profile: `onInstalled` created a native
  notification, `window.open` opened the owned migration page, and
  `uninstallSelf({showConfirmDialog:true})` displayed Chrome's native removal
  confirmation. Toast activation did not route back to the disposable profile,
  and Web Store delivery to a grandfathered install remains unproved.
- The replacement extension is generally available and its public listing
  reported `0.1.8` on 2026-08-05. The extension is a launcher and controller,
  not a replacement HTTP engine.
- The corrected platform-aware `/migrate` and post-removal `/uninstall` pages
  were deployed through GitHub Pages on 2026-08-07 and verified at the custom
  `ok200.app` domain. The legacy Store listing still needs its separate
  attended metadata repair.
- Physical ChromeOS validation confirmed that `/migrate` puts the ChromeOS
  route first and keeps the desktop, Android, and extension routes visible.
  Its Play link opened ChromeOS's native Play setup flow on a device where Play
  was not configured; Android Store delivery and post-install behavior remain
  separate gates.
- Desktop `v0.1.10` is the current signed Rust-core release shown by the
  download page. Desktop release confidence and exact-artifact evidence live
  in
  [`desktop-release-readiness.md`](desktop-release-readiness.md) and
  [Tactical 009](../tactical/009-release-confidence-closeout.md).
- Desktop is therefore an accepted migration destination on macOS, Windows,
  and Linux. Physical ChromeOS source candidates pass, and the owned
  `https://ok200.app/chromeos` fallback is live. Store-delivered
  extension/Android behavior remains a separate promotion gate; MSI,
  RPM-native, physical ARM64, and
  subjective tray/install UI checks limit secondary claims rather than the
  recommended desktop paths.

The old detailed plan in `docs/legacy-migration.md` describes the unpublished
maximum-nag experiment. It is a historical source record, not the current
notification policy or proof of Store delivery.

The physical pass is runtime evidence for the reviewed candidate, not Store
delivery evidence. The app was an unpacked development install; the native
uninstall confirmation was canceled to preserve the controlled fixture; and a
real ChromeOS reboot was not used because the device had a pending system
update. The remaining decisive test is an exact reviewed ZIP delivered by the
Chrome Web Store to a previously installed controlled profile.

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

## Accepted notification policy

The final `0.5.4` migration candidate uses this policy:

- one immediate notification after the migration update is installed;
- a reminder no more than once per seven days until the obsolete app is
  removed or the user explicitly stops reminders;
- no notification or migration window on arbitrary background script load;
- no ten-minute repeating alarm;
- no forced tab or app window on every startup;
- keep removal independent of replacement readiness: the obsolete app may be
  removed immediately whether or not 200 OK setup is complete;
- let extension detection tailor setup guidance without suppressing reminders;
- offer `Remove old app`, “remind me later,” and permanent “stop reminders”
  choices;
- record only the local state needed for throttling/detection; and
- let an explicit legacy-app launch show the richer in-app migration prompt
  whenever a still-supported runtime delivers that event.

The notification and in-app prompt use a Windows/macOS/Linux route or a
ChromeOS route derived locally from the user agent. When Chrome delivers a
notification activation event, the handler opens the stable owned
`https://ok200.app/migrate` route with `ref=legacy-app` and a platform hint.
The visible notification body also includes the short `ok200.app/migrate` URL
because Windows testing rendered notifications but did not route body/action
activation in a disposable Developer Mode profile. The page keeps all
supported routes visible so a stale or incorrect hint cannot strand the user.

## Compatibility window

The migration release must remain useful throughout non-atomic store and
native-app delivery:

| Legacy app | Replacement extension | Server app | Required result |
|---|---|---|---|
| `0.5.3` | absent or any version | absent or any version | Stable `/migrate` page explains all current routes without depending on new legacy code |
| `0.5.4` | absent | absent or installed | Weekly prompt opens the stable page; no extension-only success claim |
| `0.5.4` | `0.1.8` or compatible newer version | absent | Copy says the extension is present, the obsolete app can be removed, and server setup is still required |
| `0.5.4` | `0.1.8` or compatible newer version | installed | User can remove the obsolete app immediately and independently test the replacement |

No exact extension or native-app version is required by the legacy package.
The only shared protocol is the additive external `{type: "ping"}` message
already supported by the replacement extension. If that message is absent or
fails, the legacy app falls back to the owned migration page. Keep `/migrate`
stable after the final update window; future page and replacement releases
must continue to accept the existing `ref` and `platform` query parameters.

## Release strategy

1. Download/export the current Chrome Web Store package and compare it with
   `legacy/` to establish the real baseline.
2. Verify that an update can still be submitted and delivered to a controlled
   existing installation.
3. Fix the migration page and product copy before pointing users at it.
4. Make Android and desktop destinations pass their relevant install/launch
   smoke tests. Desktop readiness is governed by
   [`desktop-release-readiness.md`](desktop-release-readiness.md).
5. Use the accepted seven-day cadence and dismissal semantics above.
6. Validate and package the minimal `0.5.4` migration release early. Keep
   enough calendar margin for Web Store review and a corrective `0.5.5`.
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

- Will the Chrome Web Store accept the reviewed `0.5.4` ZIP and deliver it to a
  previously installed controlled `0.5.3` profile?
- How long is Chrome Web Store review taking for legacy Chrome App updates in
  August 2026?
- Which exact Android store version is delivered in the target regions, and
  does its ChromeOS migration smoke test pass before the listing is repaired?
- Can the high-impact Japanese, Korean, Spanish, and Chinese landing-page copy
  receive human review without delaying the English migration release?
- What is the minimum useful telemetry needed to decide whether a corrective
  `0.5.5` is warranted?
