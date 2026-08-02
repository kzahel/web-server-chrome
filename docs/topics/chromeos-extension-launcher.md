# ChromeOS Extension Launcher

Topic: chromeos-extension-launcher

Status: **the extension uses a best-effort Android intent with an always-visible
HTTPS options route and does not claim to detect Android or Google Play
availability. The owned page is live and the exact `extension-v0.1.4` release
ZIP passes local and CI inspection. It is ready for maintainer upload;
store-delivered proof remains open.**

Last reconciled: **2026-08-02**.

Implementation and release sequencing live in
[Tactical 011](../tactical/011-extension-launcher-and-chromeos-network-readiness.md).
Android's runtime and address presentation are owned by
[`android-runtime.md`](android-runtime.md). This topic owns the continuing
ChromeOS extension-launcher contract, including unsupported-device messaging
and any future Crostini route.

## Product role

The Chrome extension is a launcher and install-discovery surface. It does not
run the HTTP server.

On ChromeOS, the currently supported server application is the Android app.
The extension should preserve the familiar browser entry point while remaining
truthful for these materially different Chromebook states:

| Chromebook state | Accepted launcher behavior |
|---|---|
| Android supported, Google Play enabled, 200 OK installed | Best-effort `ok200://launch` intent offers 200 OK in ChromeOS's **Open with** confirmation, then opens or focuses the Android app |
| Android supported, Google Play enabled, app absent | User selects the owned ChromeOS-options route, which exposes the exact Play listing |
| Android supported but Google Play disabled by the user | Options page explains the requirement without claiming Play is installed or enabled |
| Android or Play unavailable on the model | Options page offers honest supported-device alternatives |
| Work/school/admin policy blocks Play or Android apps | Options page explains that policy may make the Android route unavailable |
| User declines Google Play | The launcher remains useful as an explanation and alternatives surface; it must not loop or report success |
| Crostini enabled | Do not claim extension integration yet; describe it as future work until its launch and networking contract passes |

## Detection boundary

An ordinary Chrome Web Store extension can call
[`chrome.runtime.getPlatformInfo()`](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getPlatformInfo)
and learn that Chrome is running on `cros`. That public result does not report:

- whether the Chromebook model supports Android apps;
- whether Google Play is available, enabled, disabled, or administrator-blocked;
- whether `app.ok200.android` is installed; or
- whether an Android intent opened the app, opened a browser fallback, or failed
  later in another ChromeOS surface.

Chromium internally defines `chromeosInfoPrivate.playStoreStatus` with
`not available`, `available`, and `enabled` values, but
[`chromeosInfoPrivate`](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/extensions/api/chromeos_info_private.json)
is a private API. Its
[`_permission_features.json`](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/extensions/api/_permission_features.json)
entry restricts it to an allowlist. The 200 OK store extension must not request,
depend on, or plan around that API.

Google's own Chromebook guidance says Play is available only on some models,
may be unavailable on managed work or school devices, and is absent from
Settings on Chromebooks that do not support Android apps:
[Install and use Android apps on a Chromebook](https://support.google.com/chromebook/answer/7021273).

Therefore the accepted product rule is **do not infer Play or installation
state**. UI and tests should model the uncertainty rather than replacing it
with a fragile heuristic.

## Accepted routing contract

1. Detect only the public platform class: ChromeOS, supported desktop, or
   unsupported.
2. Never initialize or retry desktop native messaging on ChromeOS.
3. Label the intent action **Open installed Android app**. It is a best-effort
   route to package `app.ok200.android` and scheme `ok200://launch`, not an
   installation detector.
4. Explain that ChromeOS can display an **Open with** confirmation. Do not
   remove or redirect the intent tab on a timer: a user may still be reading or
   acting on that system prompt.
5. Keep `https://ok200.app/chromeos` encoded as defensive browser-fallback
   metadata, but do not depend on ChromeOS honoring it from an extension page.
6. Make **Install or other ChromeOS options** a separate prominent HTTPS action
   so the user chooses the reliable path when the app is absent or Android/Play
   is unavailable.
7. Treat a tab-creation callback only as evidence that Chrome accepted the
   request; the popup says **Opening**, not that the app is known to have
   launched.
8. Permanently expose ordinary HTTPS links to both the ChromeOS options page
   and exact Google Play listing. These remain available even if intent
   handling changes.
9. The options page states that Android apps and Google Play are not available
   on every Chromebook and offers a non-Android alternative.
10. If the intent call itself errors, **Try Again** retries the Android intent.
11. Missing desktop installations go directly to `https://ok200.app/download`.
12. Unknown non-ChromeOS platforms do not attempt native messaging and instead
   open the supported-platform overview.

## Crostini direction

Crostini is an important potential path for users whose Chromebook cannot or
will not run Google Play, but it is not a current launcher promise.

The existing desktop AppImage and Node CLI are Linux products. That does not by
itself establish a good ChromeOS product path. Before presenting Crostini as
supported, a bounded investigation must decide and prove:

- which artifact is appropriate inside the Linux development environment;
- whether a normal ChromeOS user can install and launch it without brittle
  developer-mode steps;
- whether the ChromeOS browser extension can initiate that launch or must link
  to explicit Terminal instructions;
- how loopback, ChromeOS-to-Crostini forwarding, LAN ingress, firewall settings,
  and displayed URLs behave;
- how ChromeOS Files and shared folders map into the server's picker/root model;
- background, suspend, update, uninstall, and native-host behavior; and
- whether an external LAN client can fetch the exact served fixture.

Until those gates pass, public copy says **Crostini integration is being
investigated** and directs users to another supported desktop or Android device
as the dependable alternative.

## Store and website copy contract

Chrome Web Store listing:

- Name: **200 OK Web Server**
- Short description: **Launch 200 OK Web Server on desktop or ChromeOS. The
  successor to Web Server for Chrome.**
- Overview: state first that the extension launches an installed desktop or
  Android application and does not contain the server.
- ChromeOS paragraph: Android app support and Google Play availability vary by
  Chromebook and account; provide the exact Play and ChromeOS-options links.
- Desktop paragraph: link to the signed macOS, Windows, and Linux downloads;
  AppImage remains the recommended Linux package.
- Screenshots: show desktop detected, desktop missing/download, ChromeOS launch
  with its two install links, and the ChromeOS options page. Do not show legacy
  in-extension server controls.

The website must not say that the store listing “will be updated once ready”
after it is already published, that the extension itself has the legacy app's
features, or that every legacy option is already available.

## Validation matrix

| Gate | Required evidence |
|---|---|
| Pure routing | ChromeOS, macOS, Windows, Linux, and unsupported platform tests |
| Popup ChromeOS | No native message on init; permanent options/Play links; retry remains Android |
| Popup desktop | Installed native host launches; missing host opens `/download` |
| Package | Exact allowlisted files, minimal permission, no key/local origin/maps, manifest/tag version match, SHA-256 |
| Android installed | Physical Stable ChromeOS offers 200 OK in the system chooser and opens/focuses one 200 OK task after confirmation |
| Android absent, Play present | Physical Stable ChromeOS opens the owned options page; exact Play link is usable |
| Play disabled | Separate non-destructive profile/device proof; do not disable Play on a data-bearing profile merely to satisfy this gate |
| Play unsupported or policy-blocked | Compatible physical/managed fixture or documented user report; options page remains independently reachable regardless |
| Crostini | Explicitly deferred; no release claim until the future investigation passes |
| Store delivery | Existing controlled profile receives the reviewed version and repeats installed/absent routing checks |

## Current evidence and gaps

- Exact source package `0.1.3` with SHA-256
  `0000c1194ed65f576c7fc56ecbf3412393c64635c053c332ddac7e447e04fd46`
  passed the store-package inspector and physical Stable ChromeOS validation.
  With 200 OK installed, ChromeOS presented **Open with → 200 OK Web Server**;
  confirming **Open** launched one `app.ok200.android/.MainActivity` task and
  removed the intent tab.
- With 200 OK uninstalled but Google Play still present, one intent attempt
  opened Play but left visible UI on the generic Play home surface. Other
  attempts left a blank intent tab. This is why the owned options page is a
  separate, reliable user-selected route rather than a promised intent
  fallback.
- A store-safe source candidate then proved that ChromeOS can leave an
  extension-created `intent:` tab blank without honoring
  `browser_fallback_url`. A timed replacement also proved undesirable because
  it can replace the tab while the user is still responding to ChromeOS's
  **Open with** prompt. The final UI therefore asks users to choose **Open
  installed Android app** or the guaranteed HTTPS options route and does not
  impose a timer on the system prompt.
- With only the sideloaded 200 OK test app removed and Google Play preserved,
  the same package exposed the prominent options link at the exact
  `https://ok200.app/chromeos` destination and the exact
  `app.ok200.android` Play listing. The source-built options page passed a
  physical Chromium visual check. GitHub Pages run `30734359055` deployed that
  route; production now returns `200` with the exact Android intent, Play link,
  Play-unavailable alternatives, and future-Crostini copy.
- The earlier test did **not** disable or remove Google Play. Doing so through
  ChromeOS settings can remove Android applications and data, so that state
  remains an explicit separate-fixture gap.
- Thirteen source tests cover the no-detection contract, Android retry,
  permanent links, direct desktop download, and unsupported platforms.
- GitHub Actions run `30734453353` passed all thirteen tests, the strict
  package inspector, tag/version matching, and release publication for
  `extension-v0.1.4`. The final 132,936-byte, nine-file ZIP contains no key,
  development origin, source map, or source file and has SHA-256
  `bd7947c7aff9f5162455f97e0dddd6f36e111ddd9e3ecaf793eff7a0680482f7`.
- Current production Chrome Web Store `0.1.3` still uses the former name/copy
  and exposes the development-only `http://local.ok200.app/*` match. Upload
  the exact inspected `extension-v0.1.4` ZIP to replace it; store delivery is
  not implied by the GitHub release.

## Release ownership

Engineering owns source changes, automated tests, exact candidate ZIPs,
digests, and safe physical-device checks. The maintainer owns version approval,
tag authorization, Chrome Web Store and Play uploads, listing edits, review,
rollout, and store-delivered verification.
